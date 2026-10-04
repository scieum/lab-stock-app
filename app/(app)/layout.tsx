import { redirect } from "next/navigation";
import { getShellContext } from "@/lib/supabase/my-school";
import { AppShell } from "./app-shell";

export const dynamic = "force-dynamic";

/** 로그인 후 화면 공통 레이아웃 — nav-pill(자기 학교명, 교사·admin 전용 링크는 역할에 따라) + 모바일 tab-bar */
export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const ctx = await getShellContext();
  if (!ctx) redirect("/login");
  // 프로필이 없는 세션(내보낸 계정)은 앱 화면을 그리지 않는다 — / 의 "소속 학교가 없어요" 안내로
  if (ctx.kind === "no-school") redirect("/");
  return (
    <AppShell schoolName={ctx.school.name} staff={ctx.staff} admin={ctx.admin}>
      {children}
    </AppShell>
  );
}
