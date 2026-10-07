import "server-only";
import { getServerClient, getServerSession } from "./server";
import { recordUserName } from "@/lib/users-rules";
import {
  USAGE_HISTORY_LIMIT,
  normalizeUsageQuery,
  seoulDate,
  toUsagePeriod,
  usagePeriodSince,
  type UsagePeriod,
} from "@/lib/usage-history-rules";

export type UsageHistoryFilter = {
  /** true = "내 기록"(user_id 가 로그인 사용자), false = "전체"(같은 학교) */
  onlyMine?: boolean;
  /** 기본 최근 1개월 */
  period?: UsagePeriod | string | null;
  /** 시약명 부분 일치 */
  query?: string | null;
};

export type UsageRecord = {
  id: string;
  /** ISO 시각 (usage_logs.used_at) = 기록한 시각 */
  usedAt: string;
  /** 사용일 "YYYY-MM-DD" (usage_logs.used_on, d7 §15). 열이 아직 없는 DB 면 기록 시각의 한국 날짜 */
  usedOn: string;
  /** 기록한 날 "YYYY-MM-DD" (used_at 의 한국 날짜) */
  recordedOn: string;
  amount: number;
  unit: string;
  memo: string | null;
  reagentId: string;
  reagentName: string;
  msdsUrl: string | null;
  /** 같은 학교 사용자의 display_name. 내보낸 사용자(프로필 없음)는 "삭제된 사용자", 이름이 비었으면 "-" */
  userName: string;
  isMine: boolean;
};

export type UsageHistory = {
  schoolName: string;
  /** 실제로 적용한 필터 (정리된 값) */
  filter: { onlyMine: boolean; period: UsagePeriod; query: string };
  records: UsageRecord[];
  /** 읽은 수가 상한에 닿았는지 (더 있을 수 있음) */
  truncated: boolean;
};

export type UsageHistoryResult = { kind: "ok"; data: UsageHistory } | { kind: "signed-out" };

/**
 * 화면 10 사용 기록 내역 — 로그인 세션(publishable 키 + 쿠키)으로 DB 함수 public.usage_history 를 부른다.
 * 함수는 SECURITY INVOKER 라 usage_logs·reagents RLS 가 자기 학교 행만 돌려준다 (service role 미사용).
 * 기간·정렬은 사용일 기준(d7 §15) — 사용일 최신순, 같은 날은 기록 시각 최신순 (DB 함수가 정렬한다).
 */
export async function getUsageHistory(filter: UsageHistoryFilter = {}): Promise<UsageHistoryResult> {
  const onlyMine = filter.onlyMine === true;
  const period = toUsagePeriod(filter.period);
  const query = normalizeUsageQuery(filter.query);
  const since = usagePeriodSince(period);

  const supabase = await getServerClient();
  // 세션 검증(요청당 1회, layout 과 공유)과 내역 조회를 같이 보낸다 — 결과는 세션이 확인된 뒤에만 쓴다 (행은 RLS 가 거른다)
  const [me, history] = await Promise.all([
    getServerSession(),
    supabase.rpc("usage_history", {
      p_only_mine: onlyMine,
      p_limit: USAGE_HISTORY_LIMIT,
      ...(since ? { p_since: since } : {}),
      ...(query ? { p_query: query } : {}),
    }),
  ]);
  if (me.kind !== "member") return { kind: "signed-out" };

  const rows = history.data ?? [];
  return {
    kind: "ok",
    data: {
      schoolName: me.school.name,
      filter: { onlyMine, period, query: query ?? "" },
      records: rows.map((u) => ({
        id: u.id,
        usedAt: u.used_at,
        usedOn: typeof u.used_on === "string" && u.used_on ? u.used_on.slice(0, 10) : seoulDate(new Date(u.used_at)),
        recordedOn: seoulDate(new Date(u.used_at)),
        amount: Number(u.amount),
        unit: u.unit,
        memo: u.memo ?? null,
        reagentId: u.reagent_id,
        reagentName: u.reagent_name,
        msdsUrl: u.msds_url ?? null,
        userName: recordUserName(u.user_name as string | null),
        isMine: u.is_mine === true,
      })),
      truncated: rows.length >= USAGE_HISTORY_LIMIT,
    },
  };
}
