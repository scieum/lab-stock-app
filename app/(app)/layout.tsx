import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/supabase/server";
import { AppShell } from "./app-shell";

export const dynamic = "force-dynamic";

/**
 * 로그인 후 화면 공통 레이아웃 — 모바일 = nav-pill(자기 학교명, 교사·admin 전용 링크는 역할에 따라) + tab-bar,
 * 데스크톱 = 왼쪽 app-sidebar(역할별 메뉴 · 계정 메뉴, d7 §23).
 * 홈(`/`, (home))과 나머지 화면((member))이 같은 셸 아래에 있어, 탭을 오갈 때 셸이 다시 만들어지지 않는다.
 * 세션은 요청당 한 번만 읽는다 (getServerSession, React cache — page·데이터 함수와 공유).
 * 소속 학교가 없는 세션은 셸(학교명·tab-bar) 없이 본문만 — 경로 `/` 의 안내 화면((home)/page.tsx).
 * 그 밖의 경로는 (member) 레이아웃이 `/` · /login 으로 보낸다.
 */
export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const me = await getServerSession();
  // 프로필·학교를 읽지 못한 일시 오류 — 내보낸 계정으로 단정하지 않고 /login 으로
  if (me.kind === "unavailable") redirect("/login");
  if (me.kind !== "member") return children;
  return (
    <AppShell schoolName={me.school.name} role={me.role} displayName={me.displayName}>
      {children}
    </AppShell>
  );
}
