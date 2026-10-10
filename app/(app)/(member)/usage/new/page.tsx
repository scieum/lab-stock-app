import { notFound, redirect } from "next/navigation";
import { getUsageEntry } from "@/lib/supabase/usage-entry";
import { usageReturnHref } from "@/lib/usage-batch-rules";
import { UsageBatchScreen } from "./usage-batch-screen";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ reagent?: string | string[]; from?: string | string[] }> };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * 화면 4 여러 시약 사용 기록 (모든 역할, d7 §24 — design/rules.json 1.25 usage_batch).
 * ?reagent={id} — 화면 3 "사용 기록"에서 그 시약이 담긴 채 시작. 자기 학교 · 보관 안 된 시약(RLS)만 —
 *   없는 id · 다른 학교 id · 보관된 시약은 똑같이 404 (존재 여부 비노출). 없으면 빈 채 시작(홈 quick-action · 탭 "기록").
 * ?from=home|usage — 저장 뒤 돌아갈 화면 (없으면 ?reagent 의 시약 상세, 그것도 없으면 홈).
 * 모바일 = 전용 화면 · 데스크톱 = 본문 페이지(rules desktop_shell.heavy_pages 4 — run b 의 드로어에서 바뀜).
 */
export default async function UsageNewPage({ searchParams }: Props) {
  const sp = await searchParams;
  const raw = first(sp.reagent);
  const result = await getUsageEntry(raw === "" ? undefined : raw);
  if (result.kind === "signed-out") redirect("/login");
  if (result.kind === "not-found") notFound();
  const returnHref = usageReturnHref(first(sp.from), result.data.initialIds[0]);
  return <UsageBatchScreen key={result.data.initialIds.join(",") || "empty"} entry={result.data} returnHref={returnHref} />;
}
