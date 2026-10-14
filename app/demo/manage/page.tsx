import type { Metadata } from "next";
import { ManageView } from "@/app/(app)/(member)/manage/manage-view";
import { guestManageMenu } from "@/lib/manage-menu";
import { getDemoManageCounts } from "@/lib/supabase/manage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "관리 · Lab_Stock 둘러보기" };

/**
 * 화면 18g 둘러보기 관리 `/demo/manage` (dev-rules routes 18-guest, 시안 18-guest-mobile, d7 §29).
 * '재고' 묶음의 시약 · 센서 두 줄(데모 경로) + 데모 학교 요약(anon). 셸(nav-pill · guest-banner · tab-bar QR·기록 잠금)은 둘러보기 레이아웃.
 * 데스크톱 폭이면 /demo 로 (ManageView).
 */
export default async function DemoManagePage() {
  const counts = await getDemoManageCounts();
  return <ManageView groups={guestManageMenu()} counts={counts} desktopHref="/demo" guest />;
}
