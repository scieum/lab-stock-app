import { redirect } from "next/navigation";
import { getIntakeEntry } from "@/lib/supabase/intake";
import { IntakeScreen } from "./intake-screen";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ tab?: string | string[]; reagent?: string | string[]; mode?: string | string[] }>;
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * 화면 7 입고·시약 등록 (교사·admin 만 — dev-rules route_auth 7).
 * 비로그인 → /login, 학생 → / (시약 목록을 읽지도, 화면을 그리지도 않는다).
 * 맨 위 intake-mode (d7 §21): 기본 = 서류로 입고.
 * ?mode=direct — "직접 입력" 갈래로 시작 (기존 진입 링크: 화면 3 "입고" 등).
 * ?tab=register — "직접 입력"의 "새 시약 등록"으로 시작. ?reagent={id} — "직접 입력"에서 그 시약이 선택된 상태로 시작
 *   (자기 학교 시약에 없으면 무시). tab·reagent 가 있으면 mode 가 없어도 직접 입력으로 연다(예전 링크).
 */
export default async function IntakePage({ searchParams }: Props) {
  const result = await getIntakeEntry();
  if (result.kind === "signed-out") redirect("/login");
  if (result.kind === "forbidden") redirect("/");

  const sp = await searchParams;
  const { reagents, today } = result.data;
  const wanted = first(sp.reagent);
  const selectedId = wanted && reagents.some((r) => r.id === wanted) ? wanted : undefined;
  const tabParam = first(sp.tab);
  const tab = tabParam === "register" ? "register" : "intake";
  const modeParam = first(sp.mode);
  const mode =
    modeParam === "direct" ? "direct" : modeParam === "doc" ? "doc" : tabParam !== undefined || wanted !== undefined ? "direct" : "doc";

  return (
    <IntakeScreen
      key={`${mode}:${tab}:${selectedId ?? ""}`}
      reagents={reagents}
      today={today}
      initialMode={mode}
      initialTab={tab}
      initialReagentId={selectedId}
    />
  );
}
