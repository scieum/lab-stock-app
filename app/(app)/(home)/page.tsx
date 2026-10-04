import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/supabase/server";
import { LandingScreen } from "../../landing-screen";
import { NoSchoolScreen } from "../../no-school-screen";
import { HomeScreen } from "./home-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Lab_Stock — 과학실 시약, 학교별로 한눈에" };

/**
 * 경로 `/` 로그인 후 (dev-rules.json route_auth): 화면 13 홈. 셸(nav-pill·tab-bar)은 (app) 레이아웃이 그린다.
 * 로그인 전 `/` 는 proxy 가 /landing(화면 15)으로 rewrite 한다 — 여기의 랜딩 분기는 그 사이 세션이 끝난 경우의 대비.
 * 로그인됐지만 프로필이 없으면(학교에서 내보낸 계정, d7 §8) "소속 학교가 없어요" 안내 + 로그아웃만 —
 * 업무 데이터는 읽지 않는다 ((app) 레이아웃도 셸을 그리지 않는다).
 */
export default async function HomePage() {
  const me = await getServerSession();
  if (me.kind === "signed-out") return <LandingScreen />;
  if (me.kind === "no-school") return <NoSchoolScreen />;
  if (me.kind === "unavailable") redirect("/login");
  return <HomeScreen />;
}
