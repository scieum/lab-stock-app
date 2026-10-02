import { notFound, redirect } from "next/navigation";
import { getUsageEntry } from "@/lib/supabase/usage-entry";
import { UsageForm } from "./usage-form";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ reagent?: string | string[] }> };

/**
 * 화면 4 사용 기록 입력 (모든 역할).
 * ?reagent={id} — 자기 학교 시약(RLS)만 보인다. 없는 id · 다른 학교 id 는 똑같이 404 (존재 여부 비노출).
 * 파라미터가 없으면 자기 학교 시약 중에서 고른다.
 */
export default async function UsageNewPage({ searchParams }: Props) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.reagent) ? sp.reagent[0] : sp.reagent;
  const result = await getUsageEntry(raw === "" ? undefined : raw);
  if (result.kind === "signed-out") redirect("/login");
  if (result.kind === "not-found") notFound();
  return <UsageForm key={result.data.reagent?.id ?? "pick"} entry={result.data} />;
}
