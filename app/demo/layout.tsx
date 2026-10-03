import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDemoSchool } from "@/lib/supabase/demo-data";
import { getSessionSchool } from "@/lib/supabase/my-school";
import { DemoShell } from "./demo-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Lab_Stock — 둘러보기" };

/** design/rules.json guest.school_name — 둘러보기 화면의 학교명은 이 값 하나뿐 */
const DEMO_SCHOOL_NAME = "데모 학교";

/**
 * 둘러보기 공통 레이아웃 (/demo·/demo/reagents·/demo/reagents/[id], dev-rules.json routes *-guest).
 * - 로그인 사용자는 / 로 (route_auth.guest_note; proxy 와 이중 확인)
 * - 데이터는 anon 로더(lib/supabase/demo-data.ts)만 — 쿠키 세션·service role 없음
 * - 셸 = (app) 셸과 같은 구조 + guest-banner, tab-bar 는 QR 스캔·기록 잠금
 */
export default async function DemoLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { signedIn } = await getSessionSchool();
  if (signedIn) redirect("/");
  const school = await getDemoSchool();
  return <DemoShell schoolName={school?.name ?? DEMO_SCHOOL_NAME}>{children}</DemoShell>;
}
