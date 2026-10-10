import "server-only";
import { getServerClient } from "./server";
import { isUuid } from "./usage-entry";
import { checkClassInfo, maxGradeForSchool } from "@/lib/class-info";
import { USAGE_BATCH_MAX, overStockText, parseItemNumbers } from "@/lib/usage-batch-rules";
import { checkUsageMemo, checkUsedOn, seoulDate } from "@/lib/usage-history-rules";

export type BatchFlag = { reagentId: string; message: string };

export type RecordUsageBatchResult =
  | { ok: true; count: number }
  | {
      ok: false;
      error: string;
      /** 문제 행 (저장 실패 — 한 트랜잭션 전부 취소) */
      flags?: BatchFlag[];
      /** 다시 읽은 현재 재고 (재고 초과·없는 시약) */
      stocks?: Record<string, number>;
      /** 공통 칸 오류 */
      field?: "date" | "memo" | "class" | "items";
    };

const SAVE_FAILED = "저장하지 못했어요 — 표시한 시약을 확인해 주세요";
const AMOUNT_RE = /^\d+(\.\d+)?$/;

function field(input: unknown, key: string): unknown {
  return input !== null && typeof input === "object" ? (input as Record<string, unknown>)[key] : undefined;
}

type Item = { reagentId: string; amount: number };

/**
 * 여러 시약 사용 기록 저장 (d7 §24) — 로그인 세션 클라이언트로 DB 함수 public.record_usage_batch 하나만 부른다
 * (항목 1~30 · 재고 차감 · usage_logs · 수업 · 자동 기준 트리거가 한 트랜잭션, 하나라도 틀리면 전부 취소).
 * school_id · user_id 는 DB 가 로그인 사용자로 정한다(입력으로 받지 않는다). 학교급별 학년 범위는 DB 가 다시 본다.
 */
export async function recordUsageBatch(input: unknown, schoolName: string): Promise<RecordUsageBatchResult> {
  const rawItems = field(input, "items");
  if (!Array.isArray(rawItems) || rawItems.length === 0) return { ok: false, error: "시약을 골라 주세요", field: "items" };
  if (rawItems.length > USAGE_BATCH_MAX) return { ok: false, error: `한 번에 ${USAGE_BATCH_MAX}개까지 기록할 수 있어요`, field: "items" };

  const items: Item[] = [];
  const flags: BatchFlag[] = [];
  for (const raw of rawItems) {
    const reagentId = field(raw, "reagentId");
    const amountRaw = field(raw, "amount");
    if (typeof reagentId !== "string" || !isUuid(reagentId)) return { ok: false, error: SAVE_FAILED, field: "items" };
    const text = typeof amountRaw === "string" ? amountRaw.trim().replace(/,/g, "") : typeof amountRaw === "number" ? String(amountRaw) : "";
    const amount = AMOUNT_RE.test(text) ? Number(text) : NaN;
    if (!Number.isFinite(amount) || amount <= 0) flags.push({ reagentId, message: "사용량을 적어 주세요" });
    if (items.some((i) => i.reagentId === reagentId)) flags.push({ reagentId, message: "같은 시약이 두 번 담겼어요" });
    items.push({ reagentId, amount });
  }
  if (flags.length > 0) return { ok: false, error: SAVE_FAILED, flags };

  const today = seoulDate();
  const usedOn = checkUsedOn(field(input, "usedOn"), today);
  if (!usedOn.ok) return { ok: false, error: usedOn.error, field: "date" };
  const memo = checkUsageMemo(field(input, "memo"));
  if (!memo.ok) return { ok: false, error: memo.error, field: "memo" };
  const cls = checkClassInfo(
    { grade: field(input, "classGrade"), classNo: field(input, "classNo"), subject: field(input, "classSubject") },
    maxGradeForSchool(schoolName),
  );
  if (!cls.ok) return { ok: false, error: cls.error, field: "class" };

  const supabase = await getServerClient();
  const { data, error } = await supabase.rpc("record_usage_batch", {
    p_items: items.map((i) => ({ reagent_id: i.reagentId, amount: i.amount })),
    ...(usedOn.value !== today ? { p_used_on: usedOn.value } : {}),
    ...(memo.value ? { p_memo: memo.value } : {}),
    ...(cls.value.grade !== null ? { p_class_grade: cls.value.grade } : {}),
    ...(cls.value.classNo !== null ? { p_class_no: cls.value.classNo } : {}),
    ...(cls.value.subject !== null ? { p_class_subject: cls.value.subject } : {}),
  });

  if (!error) {
    const count = Number((data as { count?: unknown } | null)?.count ?? items.length);
    return { ok: true, count: Number.isFinite(count) ? count : items.length };
  }

  const at = parseItemNumbers(error.details).filter((n) => n < items.length);
  // 재고 · 시약 존재가 바뀌었을 수 있다 — 지금 값을 다시 읽는다 (RLS: 자기 학교 · 보관 안 된 시약만)
  const current = await supabase
    .from("reagents")
    .select("id, stock, unit")
    .in(
      "id",
      items.map((i) => i.reagentId),
    );
  const stockOf = new Map((current.data ?? []).map((r) => [r.id, { stock: Number(r.stock), unit: r.unit }]));
  const stocks = Object.fromEntries([...stockOf].map(([id, s]) => [id, s.stock]));

  switch (error.code) {
    case "22003":
      return {
        ok: false,
        error: SAVE_FAILED,
        stocks,
        flags: at.map((n) => {
          const s = stockOf.get(items[n].reagentId);
          return { reagentId: items[n].reagentId, message: s ? overStockText(s.stock, s.unit) : "현재 재고보다 많아요" };
        }),
      };
    case "P0002":
      return {
        ok: false,
        error: SAVE_FAILED,
        stocks,
        flags: at.map((n) => ({ reagentId: items[n].reagentId, message: "이 시약을 찾을 수 없어요 — 빼고 다시 저장해 주세요" })),
      };
    case "22008":
      return { ok: false, error: "오늘 이후 날짜는 고를 수 없어요", field: "date" };
    case "22023": {
      const msg = error.message ?? "";
      if (msg.includes("class_grade") || msg.includes("class_no") || msg.includes("class_subject")) {
        return { ok: false, error: "수업 정보를 확인해 주세요", field: "class" };
      }
      if (msg.includes("memo")) return { ok: false, error: "메모는 200자까지 쓸 수 있어요", field: "memo" };
      return {
        ok: false,
        error: SAVE_FAILED,
        flags: at.map((n) => ({ reagentId: items[n].reagentId, message: "사용량을 확인해 주세요" })),
      };
    }
    case "42501":
      return { ok: false, error: "다시 로그인해 주세요" };
    default:
      return { ok: false, error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요" };
  }
}
