import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { manageMenu } from "@/lib/manage-menu";
import { getManageSummary } from "@/lib/supabase/manage";
import { ManageView } from "./manage-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "관리 · Lab_Stock" };

/**
 * 화면 18 관리 `/manage` (로그인 후 · 모든 역할, 모바일 — dev-rules routes 18, d7 §29).
 * 항목 = lib/manage-menu manageMenu(role) (데스크톱 사이드바와 같은 출처), 요약 = getManageSummary(로그인 세션 · RLS, 한 번에 병렬).
 * 비로그인 → /login, 프로필 없는 세션 → / ((member) 레이아웃이 먼저 판정한다). 데스크톱 폭이면 / 로 (ManageView).
 */
export default async function ManagePage() {
  const result = await getManageSummary();
  if (result.kind === "signed-out") redirect("/login");
  if (result.kind !== "ok") redirect("/");
  const { role, counts } = result.data;
  return <ManageView groups={manageMenu(role)} counts={counts} desktopHref="/" />;
}
