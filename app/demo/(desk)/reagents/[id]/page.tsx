import { notFound } from "next/navigation";
import { ReagentDetailDesk, ReagentDetailView } from "@/app/(app)/(member)/(desk)/reagents/[id]/detail-view";
import { DesktopOnly, MobileOnly } from "@/components/viewport-only";
import { getDemoReagentDetail } from "@/lib/supabase/demo-data";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

/**
 * 화면 3g 둘러보기 시약 상세 — 경로 `/demo/reagents/[id]` (데모 학교 reagents 1건, anon).
 * 데모 학교가 아닌 id(실제 학교·없는 id)는 화면 3과 똑같이 404 — 존재 여부를 드러내지 않는다.
 * 모바일 = 전용 화면, 데스크톱 = 시약 목록(레이아웃) 옆 오른쪽 detail-drawer (읽기 전용, 사용 기록 = guest-lock — d7 §23 run d).
 */
export default async function DemoReagentDetailPage({ params }: Props) {
  const { id } = await params;
  const data = await getDemoReagentDetail(id);
  if (!data) notFound();
  const selfPath = `/demo/reagents/${data.reagent.id}`;
  return (
    <>
      <MobileOnly>
        <ReagentDetailView data={data} selfPath={selfPath} listHref="/demo/reagents" />
      </MobileOnly>
      <DesktopOnly>
        <ReagentDetailDesk data={data} selfPath={selfPath} />
      </DesktopOnly>
    </>
  );
}
