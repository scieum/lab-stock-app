import { redirect } from "next/navigation";
import { formatDateTimeDashes, formatMonthDayOf, formatStock, formatTimeHm } from "@/lib/format";
import { getUsageHistory } from "@/lib/supabase/usage-history";
import {
  monthDayLabel,
  normalizeUsageQuery,
  recordedOnCaption,
  seoulDate,
  toUsagePeriod,
  usageDayLabel,
  usageRowSubtitle,
} from "@/lib/usage-history-rules";
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
 * 날짜·묶음·일시는 여기(서버)에서 한국 시간으로 글자를 만들어 넘긴다 (브라우저 시간대와 무관).
 * 사용일(d7 §15, 디자인 1.17 시안 10): 사용일별 묶음 헤더 "10월 7일 · 오늘" · "10월 6일" (사용일 최신순, 같은 날은 기록 시각 최신순 — DB 정렬).
 * 행 = 시약명 / 사용자 줄 · 사용량. 기록한 날(used_at 의 한국 날짜)이 사용일과 같으면 사용자 옆 기록 시각("학생 이OO · 14:05"),
 * 다르면 사용자만 + 회색 캡션 "10월 6일에 기록". 상세 "사용일" = used_on, "기록한 날" = used_at.
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
  // records 는 사용일 최신순 — 같은 사용일이 이어지는 동안 한 묶음
  const today = seoulDate();
  const groups: UsageHistoryGroup[] = [];
  for (const r of records) {
    const at = new Date(r.usedAt);
    let group = groups[groups.length - 1];
    if (!group || group.key !== r.usedOn) {
      group = { key: r.usedOn, label: usageDayLabel(r.usedOn, today), records: [] };
      groups.push(group);
    }
    group.records.push({
      id: r.id,
      date: formatMonthDayOf(r.usedOn),
      dayLabel: monthDayLabel(r.usedOn),
      usedOn: r.usedOn,
      recordedAt: formatDateTimeDashes(at),
      recordedCaption: r.recordedOn !== r.usedOn ? recordedOnCaption(r.recordedOn) : null,
      recordedTime: formatTimeHm(at),
      reagentName: r.reagentName,
      userName: r.userName,
      subtitle: usageRowSubtitle(r.userName, r.usedOn, r.recordedOn, formatTimeHm(at)),
      amount: amountFmt.format(r.amount),
      unit: r.unit,
      amountLabel: formatStock(r.amount, r.unit),
      memo: r.memo && r.memo.trim() !== "" ? r.memo : null,
      reagentId: r.reagentId,
      msdsUrl: safeUrl(r.msdsUrl),
    });
  }

  return <UsageHistoryScreen filter={filter} groups={groups} truncated={truncated} />;
}
