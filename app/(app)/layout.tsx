import { redirect } from "next/navigation";
import { getMySchool } from "@/lib/supabase/my-school";
import { AppShell } from "./app-shell";

export const dynamic = "force-dynamic";

/** 로그인 후 화면 공통 레이아웃 — nav-pill(자기 학교명) + 모바일 tab-bar */
export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const school = await getMySchool();
  if (!school) redirect("/login");
  return <AppShell schoolName={school.name}>{children}</AppShell>;
}
