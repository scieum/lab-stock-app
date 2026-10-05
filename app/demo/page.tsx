import { HomeView } from "@/app/(app)/(home)/home-screen";
import { getDemoHomeData } from "@/lib/supabase/demo-data";

export const dynamic = "force-dynamic";

/**
 * 화면 13g 둘러보기 홈 — 경로 `/demo` (dev-rules.json routes 13-guest).
 * 로그인 홈(HomeView)과 같은 화면을 데모 학교 데이터(anon)로 그린다. 역할 없음 → 쓰기 진입점은 guest-lock.
 */
export default async function DemoHomePage() {
  const data = await getDemoHomeData();
  return <HomeView data={data} />;
}
