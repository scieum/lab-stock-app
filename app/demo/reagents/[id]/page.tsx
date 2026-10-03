import { notFound } from "next/navigation";
import { ReagentDetailView } from "@/app/(app)/reagents/[id]/detail-view";
import { getDemoReagentDetail } from "@/lib/supabase/demo-data";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

/**
 * 화면 3g 둘러보기 시약 상세 — 경로 `/demo/reagents/[id]` (데모 학교 reagents 1건, anon).
 * 데모 학교가 아닌 id(실제 학교·없는 id)는 화면 3과 똑같이 404 — 존재 여부를 드러내지 않는다.
 */
export default async function DemoReagentDetailPage({ params }: Props) {
  const { id } = await params;
  const data = await getDemoReagentDetail(id);
  if (!data) notFound();
  return <ReagentDetailView data={data} selfPath={`/demo/reagents/${data.reagent.id}`} listHref="/demo/reagents" />;
}
