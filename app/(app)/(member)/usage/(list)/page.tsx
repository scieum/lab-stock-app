import { redirect } from "next/navigation";
import { formatDateTimeDots, formatMonthDay, formatStock, formatYearMonth } from "@/lib/format";
import { getUsageHistory } from "@/lib/supabase/usage-history";
import { normalizeUsageQuery, toUsagePeriod } from "@/lib/usage-history-rules";
import { UsageHistoryScreen, type UsageHistoryGroup } from "./usage-history-screen";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ mine?: string | string[]; period?: string | string[]; q?: string | string[] }>;
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const amountFmt = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });

/** http(s) 주소만 링크로 쓴다 (그 밖의 값은 "MSDS 없음"과 같이 다룬다) */
function safeUrl(v: string | null): string | null {
  return v && /^https?:\/\//i.test(v) ? v : null;
}

/**
 * 화면 10 사용 기록 내역 (모든 역할 — dev-rules route_auth 10). 비로그인 → /login.
 * 필터는 주소에 둔다: ?mine=1(내 기록) · ?period=1m|3m|6m|all · ?q=시약명.
 * 학교·사용자는 주소에서 받지 않는다 — 로그인 세션(RLS)이 자기 학교 기록만 돌려준다.
 * 날짜·월 그룹·일시는 여기(서버)에서 한국 시간으로 글자를 만들어 넘긴다 (브라우저 시간대와 무관).
 */
export default async function UsageHistoryPage({ searchParams }: Props) {
  const sp = await searchParams;
  const result = await getUsageHistory({
    onlyMine: first(sp.mine) === "1",
    period: toUsagePeriod(first(sp.period)),
    query: normalizeUsageQuery(first(sp.q)),
  });
  if (result.kind === "signed-out") redirect("/login");

  const { filter, records, truncated } = result.data;
  // records 는 최신순 — 같은 달이 이어지는 동안 한 그룹
  const groups: UsageHistoryGroup[] = [];
  for (const r of records) {
    const at = new Date(r.usedAt);
    const month = formatYearMonth(at);
    let group = groups[groups.length - 1];
    if (!group || group.key !== month.key) {
      group = { key: month.key, label: month.label, records: [] };
      groups.push(group);
    }
    group.records.push({
      id: r.id,
      date: formatMonthDay(at),
      dateTime: formatDateTimeDots(at),
      reagentName: r.reagentName,
      userName: r.userName,
      amount: amountFmt.format(r.amount),
      unit: r.unit,
      amountLabel: formatStock(r.amount, r.unit),
      memo: r.memo && r.memo.trim() !== "" ? r.memo : null,
      msdsUrl: safeUrl(r.msdsUrl),
    });
  }

  return <UsageHistoryScreen filter={filter} groups={groups} truncated={truncated} />;
}
