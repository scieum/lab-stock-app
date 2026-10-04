import { notFound, redirect } from "next/navigation";
import { getReagentDetail } from "@/lib/supabase/reagent-detail";
import { ReagentDetailView } from "./detail-view";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

/**
 * 화면 3 시약 상세 (자기 학교 reagents 1건, RLS).
 * 없는 id · 다른 학교 id 는 똑같이 404 — 존재 여부를 드러내지 않는다.
 */
export default async function ReagentDetailPage({ params }: Props) {
  const { id } = await params;
  const result = await getReagentDetail(id);
  if (result.kind === "signed-out") redirect("/login");
  if (result.kind === "not-found") notFound();

  const { role, ...data } = result.data;
  return <ReagentDetailView data={data} role={role} selfPath={`/reagents/${data.reagent.id}`} listHref="/reagents" />;
}
