import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMembership } from "@/lib/supabase/my-school";
import { AppShell } from "./(app)/app-shell";
import { HomeScreen } from "./(app)/home-screen";
import { LandingScreen } from "./landing-screen";
import { NoSchoolScreen } from "./no-school-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Lab_Stock — 과학실 시약, 학교별로 한눈에" };

/**
 * 경로 `/` (dev-rules.json route_auth): 로그인 전 → 화면 15 랜딩, 로그인 후 → 화면 13 홈.
 * 랜딩은 app/(app) 레이아웃(학교명 nav-pill + tab-bar) 밖에서 그린다 — 학교명·탭바 없음.
 * 로그인됐지만 프로필이 없으면(학교에서 내보낸 계정, d7 §8) "소속 학교가 없어요" 안내 + 로그아웃만 —
 * 업무 데이터는 읽지 않는다. 프로필·학교를 읽지 못한 일시 오류는 (app) 레이아웃과 같이 /login 으로.
 * nav 의 역할 전용 링크(입고·시약 등록 / 사용자 관리)는 (app) 레이아웃과 같은 기준으로 그린다.
 */
export default async function RootPage() {
  const me = await getMembership();
  if (me.kind === "signed-out") return <LandingScreen />;
  if (me.kind === "no-school") return <NoSchoolScreen />;
  if (me.kind === "unavailable") redirect("/login");
  return (
    <AppShell schoolName={me.school.name} staff={me.role !== "student"} admin={me.role === "admin"}>
      <HomeScreen />
    </AppShell>
  );
}
