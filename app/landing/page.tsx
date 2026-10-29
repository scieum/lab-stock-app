import type { Metadata } from "next";
import { LandingScreen } from "../landing-screen";

export const metadata: Metadata = { title: "Lab_Stock — 과학실 시약, 학교별로 한눈에" };

// 빌드 때 한 번 만들어 CDN 에서 바로 준다 (첫 접속 속도). 루트 not-found 가 세션 쿠키를 읽어
// 그대로 두면 이 화면도 매 요청 서버 렌더가 된다 — 이 화면은 세션을 쓰지 않으므로 정적으로 고정.
export const dynamic = "force-static";

/**
 * 화면 15 랜딩 — 경로 `/` 로그인 전 (dev-rules.json route_auth).
 * 주소는 `/` 그대로이고, proxy(lib/supabase/proxy.ts)가 로그인 전 `/` 요청을 이 세그먼트로 rewrite 한다
 * (/landing 을 직접 열면 `/` 로 돌려보낸다). 세션·데이터를 읽지 않는 정적 화면 — 학교명·tab-bar 없음.
 */
export default function LandingPage() {
  return <LandingScreen />;
}
