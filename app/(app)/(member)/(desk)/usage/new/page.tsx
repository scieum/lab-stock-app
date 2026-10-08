import { notFound, redirect } from "next/navigation";
import { getUsageEntry } from "@/lib/supabase/usage-entry";
import { DesktopOnly, MobileOnly } from "@/components/viewport-only";
import { UsageForm, UsageFormDrawer } from "./usage-form";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ reagent?: string | string[] }> };

/**
 * 화면 4 사용 기록 입력 (모든 역할).
 * ?reagent={id} — 자기 학교 시약(RLS)만 보인다. 없는 id · 다른 학교 id 는 똑같이 404 (존재 여부 비노출).
 * 파라미터가 없으면 자기 학교 시약 중에서 고른다.
 * 모바일 = 전용 화면, 데스크톱 = 시약 목록(레이아웃) 옆 오른쪽 detail-drawer (/usage/new?reagent=[id]&{목록 쿼리}).
 */
export default async function UsageNewPage({ searchParams }: Props) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.reagent) ? sp.reagent[0] : sp.reagent;
  const result = await getUsageEntry(raw === "" ? undefined : raw);
  if (result.kind === "signed-out") redirect("/login");
  if (result.kind === "not-found") notFound();
  const key = result.data.reagent?.id ?? "pick";
  return (
    <>
      <MobileOnly>
        <UsageForm key={key} entry={result.data} />
      </MobileOnly>
      {/* 데스크톱: (desk) 레이아웃의 시약 목록 옆 오른쪽 드로어 (d7 §23 run b) */}
      <DesktopOnly>
        <UsageFormDrawer key={key} entry={result.data} />
      </DesktopOnly>
    </>
  );
}
