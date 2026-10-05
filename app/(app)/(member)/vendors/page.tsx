import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getVendorScreen } from "@/lib/supabase/vendors";
import { VendorsScreen } from "./vendors-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "판매처 설정 · Lab_Stock" };

/**
 * 화면 9 판매처 설정 (admin 만 — dev-rules route_auth 9).
 * 비로그인 → /login, 학생·교사 → / (판매처를 읽지도, 화면을 그리지도 않는다 — getVendorScreen 이 역할을 먼저 본다).
 * 프로필이 없는 세션(내보낸 계정)도 / 로 — 거기서 "소속 학교가 없어요" 안내를 본다.
 * 이 세그먼트에는 loading 경계를 두지 않는다 — 역할 판정이 HTTP 3xx 로 나가야 한다 (/intake·/users 와 같다).
 * 학교·역할은 주소나 입력에서 받지 않는다 — 로그인 세션(RLS)이 자기 학교 행 + 공통 목록만 돌려준다.
 */
export default async function VendorsPage() {
  const result = await getVendorScreen();
  if (result.kind === "signed-out") redirect("/login");
  if (result.kind !== "ok") redirect("/");

  const { vendors, common } = result.data;
  return <VendorsScreen vendors={vendors} common={common} />;
}
