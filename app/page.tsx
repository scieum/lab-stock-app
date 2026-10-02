import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionSchool } from "@/lib/supabase/my-school";
import { AppShell } from "./(app)/app-shell";
import { HomeScreen } from "./(app)/home-screen";
import { LandingScreen } from "./landing-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Lab_Stock — 과학실 시약, 학교별로 한눈에" };

/**
 * 경로 `/` (dev-rules.json route_auth): 로그인 전 → 화면 15 랜딩, 로그인 후 → 화면 13 홈.
 * 랜딩은 app/(app) 레이아웃(학교명 nav-pill + tab-bar) 밖에서 그린다 — 학교명·탭바 없음.
 * 로그인됐지만 프로필·학교가 없으면 (app) 레이아웃과 같이 /login 으로.
 */
export default async function RootPage() {
  const { signedIn, school } = await getSessionSchool();
  if (!signedIn) return <LandingScreen />;
  if (!school) redirect("/login");
  return (
    <AppShell schoolName={school.name}>
      <HomeScreen />
    </AppShell>
  );
}
