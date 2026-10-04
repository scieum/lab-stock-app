import { redirect } from "next/navigation";
import { getIntakeEntry } from "@/lib/supabase/intake";
import { IntakeScreen } from "./intake-screen";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ tab?: string | string[]; reagent?: string | string[] }> };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * 화면 7 입고·시약 등록 (교사·admin 만 — dev-rules route_auth 7).
 * 비로그인 → /login, 학생 → / (시약 목록을 읽지도, 화면을 그리지도 않는다).
 * ?tab=register — "새 시약 등록" 갈래로 시작.
 * ?reagent={id} — 그 시약이 선택된 상태로 시작. 자기 학교 시약(RLS 로 읽힌 목록)에 없으면 무시한다.
 */
export default async function IntakePage({ searchParams }: Props) {
  const result = await getIntakeEntry();
  if (result.kind === "signed-out") redirect("/login");
  if (result.kind === "forbidden") redirect("/");

  const sp = await searchParams;
  const { reagents, today } = result.data;
  const wanted = first(sp.reagent);
  const selectedId = wanted && reagents.some((r) => r.id === wanted) ? wanted : undefined;
  const tab = first(sp.tab) === "register" ? "register" : "intake";

  return (
    <IntakeScreen
      key={`${tab}:${selectedId ?? ""}`}
      reagents={reagents}
      today={today}
      initialTab={tab}
      initialReagentId={selectedId}
    />
  );
}
