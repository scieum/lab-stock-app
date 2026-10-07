import "server-only";
import { createClient, getServerClient, getServerSession } from "./server";
import {
  checkRecordIntake,
  checkRegisterReagent,
  type RecordIntakeInput,
  type RegisterReagentInput,
} from "@/lib/intake-rules";
import { checkDocIntakeInput } from "@/lib/doc-intake-rules";
import type { Role } from "@/lib/types";
import type { Json } from "@/lib/types/database";

const SEOUL_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const STAFF_ONLY = "입고·시약 등록은 교사·관리자만 할 수 있어요";
const SIGNED_OUT = "다시 로그인해 주세요";
const NOT_FOUND = "시약을 찾을 수 없어요";
const SAVE_FAILED = "저장하지 못했어요. 잠시 후 다시 시도해 주세요";

/** 입고 화면의 시약 한 건 (components/stock-intake 의 IntakeReagent 와 같은 모양) */
export type IntakeReagentOption = { id: string; name: string; stock: number; unit: string };

export type IntakeEntry = {
  role: Role;
  /** 입고일 기본값 = 오늘 (Asia/Seoul, YYYY-MM-DD) */
  today: string;
  reagents: IntakeReagentOption[];
};

export type IntakeEntryResult =
  | { kind: "ok"; data: IntakeEntry }
  /** 학생 — 화면 7 은 teacher·admin 만 (d7 §6). 시약 목록을 읽지 않는다 */
  | { kind: "forbidden" }
  | { kind: "signed-out" };

export type RecordIntakeResult =
  | { ok: true; reagentId: string; stock: number }
  | { ok: false; error: string };

export type RegisterReagentResult =
  | { ok: true; reagentId: string }
  | { ok: false; error: string };

/**
 * 화면 7 입고·시약 등록 — 로그인 세션(publishable 키 + 쿠키)으로 읽어 RLS 가 자기 학교 행만 돌려준다.
 */
export async function getIntakeEntry(): Promise<IntakeEntryResult> {
  // 역할을 먼저 본다 (요청당 1회 읽은 세션, layout 과 공유) — 학생이면 시약 목록을 읽지 않는다
  const me = await getServerSession();
  if (me.kind !== "member") return { kind: "signed-out" };
  const role: Role = me.role;
  if (role === "student") return { kind: "forbidden" };

  const supabase = await getServerClient();
  const { data } = await supabase.from("reagents").select("id, name, stock, unit").order("name");
  return {
    kind: "ok",
    data: {
      role,
      today: SEOUL_DATE.format(new Date()),
      reagents: (data ?? []).map((r) => ({ id: r.id, name: r.name, stock: Number(r.stock), unit: r.unit })),
    },
  };
}

/**
 * 기존 시약 입고 — DB 함수 public.record_intake 하나만 호출한다
 * (intake_logs insert · reagents.stock 증가 · intake_date 갱신은 그 함수 안에서 한 트랜잭션).
 * 역할·학교 검사는 DB 함수가 한다 (학생 42501, 다른 학교 시약 P0002).
 */
export async function recordIntake(input: RecordIntakeInput): Promise<RecordIntakeResult> {
  const checked = checkRecordIntake(input);
  if (!checked.ok) return checked;
  const { reagentId, amount, intakeDate } = checked.value;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false, error: SIGNED_OUT };

  const { error } = await supabase.rpc("record_intake", {
    p_reagent_id: reagentId,
    p_amount: amount,
    p_intake_date: intakeDate,
  });
  if (error) {
    switch (error.code) {
      case "22023":
        return { ok: false, error: "입고 수량과 입고일을 확인해 주세요" };
      case "P0002":
        return { ok: false, error: NOT_FOUND };
      case "42501":
        return { ok: false, error: STAFF_ONLY };
      default:
        return { ok: false, error: SAVE_FAILED };
    }
  }

  const current = await supabase.from("reagents").select("stock").eq("id", reagentId).maybeSingle();
  if (!current.data) return { ok: false, error: NOT_FOUND };
  return { ok: true, reagentId, stock: Number(current.data.stock) };
}

/**
 * 새 시약 등록 — DB 함수 public.register_reagent 하나만 호출한다
 * (reagents insert + 첫 재고 intake_logs 1행을 한 트랜잭션으로. school_id 는 DB 가 호출자 profiles 에서 정한다).
 */
export async function registerReagent(input: RegisterReagentInput): Promise<RegisterReagentResult> {
  const checked = checkRegisterReagent(input);
  if (!checked.ok) return checked;
  const v = checked.value;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false, error: SIGNED_OUT };

  const { data, error } = await supabase.rpc("register_reagent", {
    p_name: v.name,
    p_storage_class: v.storageClass,
    p_stock: v.stock,
    p_unit: v.unit,
    p_intake_date: v.intakeDate,
    ...(v.msdsUrl ? { p_msds_url: v.msdsUrl } : {}),
  });
  if (error) {
    switch (error.code) {
      case "23505":
        return { ok: false, error: "같은 이름의 시약이 이미 있어요. 기존 시약 입고를 이용해 주세요" };
      case "22023":
        return { ok: false, error: "입력한 값을 확인해 주세요" };
      case "42501":
        return { ok: false, error: STAFF_ONLY };
      default:
        return { ok: false, error: SAVE_FAILED };
    }
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) return { ok: false, error: SAVE_FAILED };
  return { ok: true, reagentId: row.id };
}

/* ───────── 서류로 입고 (d7 §21) ───────── */

export type RecordDocumentIntakeResult =
  | { ok: true; intakeCount: number; newReagentIds: string[] }
  | { ok: false; error: string };

/** 오늘 (Asia/Seoul, YYYY-MM-DD) */
export function seoulToday(): string {
  return SEOUL_DATE.format(new Date());
}

/**
 * 서류로 입고 저장 — DB 함수 public.record_document_intake 하나만 호출한다 (한 트랜잭션: 연결 행 입고 + 새 시약 등록).
 * 입력은 lib/doc-intake-rules checkDocIntakeInput 으로 다시 맞춘다. 역할·학교·데모 검사는 DB 함수가 한다.
 */
export async function recordDocumentIntake(input: unknown): Promise<RecordDocumentIntakeResult> {
  const checked = checkDocIntakeInput(input, seoulToday());
  if (!checked.ok) return checked;
  const { intakeDate, items } = checked.value;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false, error: SIGNED_OUT };

  const { data, error } = await supabase.rpc("record_document_intake", {
    p_intake_date: intakeDate,
    p_items: items as unknown as Json,
  });
  if (error) {
    switch (error.code) {
      case "23505":
        return { ok: false, error: "같은 이름의 시약이 이미 있어요. 그 품목은 우리 학교 시약으로 바꿔 주세요" };
      case "22023":
        return { ok: false, error: "입고일과 품목 값을 확인해 주세요" };
      case "P0002":
        return { ok: false, error: "연결한 시약을 찾을 수 없어요. 화면을 새로 고친 뒤 다시 시도해 주세요" };
      case "42501":
        return { ok: false, error: STAFF_ONLY };
      default:
        return { ok: false, error: SAVE_FAILED };
    }
  }
  const body = (data ?? {}) as { intake_count?: unknown; new_reagent_ids?: unknown };
  const count = typeof body.intake_count === "number" ? body.intake_count : items.length;
  const ids = Array.isArray(body.new_reagent_ids) ? body.new_reagent_ids.filter((x): x is string => typeof x === "string") : [];
  return { ok: true, intakeCount: count, newReagentIds: ids };
}
