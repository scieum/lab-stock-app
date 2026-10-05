import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { formatStock } from "@/lib/format";
import { getCabinetScreen } from "@/lib/supabase/cabinets";
import { CabinetsScreen } from "./cabinets-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "시약장 설정 · Lab_Stock" };

type Props = { searchParams: Promise<{ c?: string | string[] }> };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * 화면 11 시약장 설정 (모든 역할 — dev-rules route_auth 11. 편집·추가·삭제는 교사·admin, 학생은 보기만).
 * 비로그인 → /login, 프로필 없는 세션 → / ((member) 레이아웃이 먼저 판정한다).
 * 활성 시약장은 `?c={id}` — 없거나 자기 학교 것이 아니면 첫 시약장 (getCabinetScreen, RLS 가 자기 학교 행만 돌려준다).
 * 학교·역할은 주소나 입력에서 받지 않는다. 학교명은 셸(nav-pill)에만 있다.
 */
export default async function CabinetsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const result = await getCabinetScreen({ cabinetId: first(sp.c) });
  if (result.kind === "signed-out") redirect("/login");
  if (result.kind !== "ok") redirect("/");

  const { canManage, cabinets, active, unassigned } = result.data;
  return (
    <CabinetsScreen
      canManage={canManage}
      cabinets={cabinets.map((c) => ({ id: c.id, label: c.label }))}
      active={active}
      unassigned={unassigned.map((r) => ({ id: r.id, name: r.name, stock: formatStock(r.stock, r.unit) }))}
    />
  );
}
