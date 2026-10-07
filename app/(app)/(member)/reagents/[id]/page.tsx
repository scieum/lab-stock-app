import { notFound, redirect } from "next/navigation";
import { getReagentDetail } from "@/lib/supabase/reagent-detail";
import { ReagentDetailView } from "./detail-view";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ pick?: string | string[] }> };

/**
 * 화면 3 시약 상세 (자기 학교 reagents 1건, RLS).
 * 없는 id · 다른 학교 id 는 똑같이 404 — 존재 여부를 드러내지 않는다.
 * ?pick=location — 위치 피커를 연 채로 시작 (화면 7 등록 직후 location-suggest 의 [다른 칸], d7 §17). 학생에게는 피커가 없어 무시된다.
 */
export default async function ReagentDetailPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const pick = Array.isArray(sp.pick) ? sp.pick[0] : sp.pick;
  const result = await getReagentDetail(id);
  if (result.kind === "signed-out") redirect("/login");
  if (result.kind === "not-found") notFound();

  const { role, ...data } = result.data;
  return (
    <ReagentDetailView
      data={data}
      role={role}
      openPicker={pick === "location"}
      selfPath={`/reagents/${data.reagent.id}`}
      listHref="/reagents"
    />
  );
}
