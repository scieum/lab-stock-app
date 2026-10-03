import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/supabase/my-school";
import { AppShell } from "./app-shell";

export const dynamic = "force-dynamic";

/** 로그인 후 화면 공통 레이아웃 — nav-pill(자기 학교명, 교사·admin 전용 링크는 역할에 따라) + 모바일 tab-bar */
export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const ctx = await getShellContext();
  if (!ctx) redirect("/login");
  return (
    <AppShell schoolName={ctx.school.name} staff={ctx.staff}>
      {children}
    </AppShell>
  );
}
