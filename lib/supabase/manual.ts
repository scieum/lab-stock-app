import "server-only";
import { createClient, getServerClient, getServerSession } from "./server";
import {
  EXTRACTION_ROWS_MAX,
  GROUPS_ERROR,
  ROW_MESSAGES,
  checkGroups,
  parseAmount,
  type BasisOutcome,
  type ManualReagent,
} from "@/lib/manual-rules";

const STAFF_ONLY = "실험 매뉴얼은 교사·관리자만 쓸 수 있어요";
const SIGNED_OUT = "다시 로그인해 주세요";
const NOT_FOUND = "시약을 찾을 수 없어요. 화면을 새로 고친 뒤 다시 시도해 주세요";
const BAD_ITEMS = "저장할 시약을 확인해 주세요";
const SAVE_FAILED = "저장하지 못했어요. 잠시 후 다시 시도해 주세요";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ───────── 권한 (화면·추출 API 공용) ───────── */

export type ManualAccess =
  | { kind: "ok"; userId: string; role: "teacher" | "admin"; schoolId: string; schoolName: string }
  /** 학생 — 화면 5 와 추출 API 는 교사·admin 만 (d7 §13) */
  | { kind: "forbidden" }
  /** 데모 학교 소속 (있을 수 없는 상태지만 한 번 더 막는다, d7 §5) */
  | { kind: "demo" }
  /** 로그인은 됐지만 프로필이 없다 (내보낸 계정) */
  | { kind: "no-school" }
  /** 프로필·학교를 읽지 못했다 (일시 오류) */
  | { kind: "unavailable" }
  | { kind: "signed-out" };

/**
 * 실험 매뉴얼을 쓸 수 있는 사용자인지 — 로그인 세션(publishable 키 + 쿠키)만 쓴다 (service role 미사용).
 * 순서: 로그인(JWT 검증) → 프로필 → 역할(교사·admin) → 학교가 데모 학교가 아님.
 * 세션은 요청당 1회 읽은 것을 layout 과 함께 쓴다(getServerSession).
 */
export async function getManualAccess(): Promise<ManualAccess> {
  const me = await getServerSession();
  if (me.kind === "signed-out") return { kind: "signed-out" };
  if (me.kind === "unavailable") return { kind: "unavailable" };
  if (me.kind === "no-school") return { kind: "no-school" };
  if (me.role !== "teacher" && me.role !== "admin") return { kind: "forbidden" };

  const supabase = await getServerClient();
  // RLS: schools 는 자기 학교 한 행만 보인다
  const school = await supabase.from("schools").select("id, is_demo").eq("id", me.school.id).maybeSingle();
  if (school.error || !school.data) return { kind: "unavailable" };
  if (school.data.is_demo) return { kind: "demo" };

  return { kind: "ok", userId: me.userId, role: me.role, schoolId: me.school.id, schoolName: me.school.name };
}

/* ───────── 화면 5 조회 ───────── */

/** 확인 표의 "우리 학교 시약" 한 건 — lib/manual-rules 의 ManualReagent 에 지금 기준의 근거를 더한 것 */
export type ManualScreenReagent = ManualReagent & {
  /** 1조 사용량 (reagents.reorder_per_group). 없으면 null */
  perGroup: number | null;
  /** 조 수 (reagents.reorder_groups). 없으면 null */
  groups: number | null;
};

export type ManualScreen = {
  schoolName: string;
  /** 우리 학교 시약 전체 (이름순) — 자동 연결·선택 칸·"기존 기준" 표시용 */
  reagents: ManualScreenReagent[];
};

export type ManualScreenResult =
  | { kind: "ok"; data: ManualScreen }
  /** 학생(·데모 학교) — 시약을 읽지 않는다 */
  | { kind: "forbidden" }
  | { kind: "no-school" }
  | { kind: "signed-out" };

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * 화면 5 실험 매뉴얼 — 로그인 세션으로 읽는다. RLS 가 자기 학교 시약만 돌려준다 (N1).
 * 역할을 먼저 본다 — 학생이면 시약을 읽지 않는다.
 */
export async function getManualScreen(): Promise<ManualScreenResult> {
  const access = await getManualAccess();
  if (access.kind === "signed-out" || access.kind === "unavailable") return { kind: "signed-out" };
  if (access.kind === "no-school") return { kind: "no-school" };
  if (access.kind !== "ok") return { kind: "forbidden" };

  const supabase = await getServerClient();
  const { data } = await supabase
    .from("reagents")
    .select("id, name, unit, min_stock, reorder_per_group, reorder_groups")
    .eq("school_id", access.schoolId)
    .order("name")
    .order("id");

  return {
    kind: "ok",
    data: {
      schoolName: access.schoolName,
      reagents: (data ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        unit: r.unit,
        minStock: Number(r.min_stock),
        perGroup: numOrNull(r.reorder_per_group),
        groups: numOrNull(r.reorder_groups),
      })),
    },
  };
}

/* ───────── 저장 ───────── */

export type ReorderBasisResult = {
  reagentId: string;
  /** 필요량 = 1조 사용량 × 조 수 */
  required: number;
  /** 저장 전 기준 (reagents.min_stock) */
  previousMinStock: number;
  /** changed = 기준을 required 로 바꿨다 / kept = 기존 기준이 같거나 더 커서 그대로 뒀다 */
  outcome: BasisOutcome;
};

export type SaveReorderBasisResult = { ok: true; results: ReorderBasisResult[] } | { ok: false; error: string };

type CheckedItem = { reagent_id: string; per_group: number; groups: number };

/** planSave 가 만든 항목 모양({reagent_id, per_group, groups})을 다시 검사한다 — 화면을 거치지 않은 호출 대비 */
function checkItems(input: unknown): { ok: true; value: CheckedItem[] } | { ok: false; error: string } {
  if (!Array.isArray(input) || input.length < 1 || input.length > EXTRACTION_ROWS_MAX) {
    return { ok: false, error: BAD_ITEMS };
  }
  const seen = new Set<string>();
  const value: CheckedItem[] = [];
  for (const it of input) {
    if (typeof it !== "object" || it === null) return { ok: false, error: BAD_ITEMS };
    const { reagent_id, per_group, groups } = it as Record<string, unknown>;
    if (typeof reagent_id !== "string" || !UUID_RE.test(reagent_id)) return { ok: false, error: BAD_ITEMS };
    const id = reagent_id.toLowerCase();
    if (seen.has(id)) return { ok: false, error: BAD_ITEMS };
    seen.add(id);
    const amount = typeof per_group === "number" ? parseAmount(per_group) : null;
    if (amount === null) return { ok: false, error: ROW_MESSAGES.amount };
    const g = typeof groups === "number" ? checkGroups(groups) : ({ ok: false, error: GROUPS_ERROR } as const);
    if (!g.ok) return { ok: false, error: GROUPS_ERROR };
    value.push({ reagent_id: id, per_group: amount, groups: g.value });
  }
  return { ok: true, value };
}

/**
 * 재주문 기준 저장 — DB 함수 public.save_reorder_basis 하나만 호출한다 (d7 §13).
 * 필요량(1조 사용량 × 조 수)이 지금 기준보다 클 때만 min_stock·reorder_per_group·reorder_groups 를 바꾼다(더 큰 값 유지).
 * 역할·학교 검사는 DB 함수가 한다 (학생·데모 학교 42501, 다른 학교 시약·없는 id P0002 — 하나라도 있으면 전체 거부).
 * 로그인 세션만 쓴다 (service role 미사용).
 */
export async function saveReorderBasis(input: { items: unknown }): Promise<SaveReorderBasisResult> {
  const checked = checkItems(input?.items);
  if (!checked.ok) return checked;

  // 쓰기는 요청마다 새 클라이언트로 JWT 를 검증한다 (intake.ts·cabinets.ts 와 같은 방식)
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false, error: SIGNED_OUT };

  const { data, error } = await supabase.rpc("save_reorder_basis", { p_items: checked.value });
  if (error) {
    switch (error.code) {
      case "22023":
        return { ok: false, error: BAD_ITEMS };
      case "P0002":
        return { ok: false, error: NOT_FOUND };
      case "42501":
        return { ok: false, error: STAFF_ONLY };
      default:
        return { ok: false, error: SAVE_FAILED };
    }
  }
  if (!Array.isArray(data)) return { ok: false, error: SAVE_FAILED };

  const results: ReorderBasisResult[] = [];
  for (const row of data) {
    if (typeof row !== "object" || row === null || Array.isArray(row)) return { ok: false, error: SAVE_FAILED };
    const required = Number(row.required);
    const previous = Number(row.previous_min_stock);
    const outcome = row.outcome;
    if (typeof row.reagent_id !== "string" || !Number.isFinite(required) || !Number.isFinite(previous)) {
      return { ok: false, error: SAVE_FAILED };
    }
    if (outcome !== "changed" && outcome !== "kept") return { ok: false, error: SAVE_FAILED };
    results.push({ reagentId: row.reagent_id, required, previousMinStock: previous, outcome });
  }
  return { ok: true, results };
}
