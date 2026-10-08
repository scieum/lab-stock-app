import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  autoCaptionText,
  reorderAlertDateText,
  reorderAmountParts,
  reorderAmountText,
  reorderBasisText,
} from "@/lib/reorder-rules";
import { getReorderScreen } from "@/lib/supabase/reorder";
import { ReorderScreen } from "./reorder-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "재주문 알림 · Lab_Stock" };

/**
 * 화면 6 재주문 알림 (교사·admin 만 — dev-rules route_auth 6).
 * 비로그인 → /login, 학생 → / (시약·판매처를 읽지도, 화면을 그리지도 않는다 — getReorderScreen 이 역할을 먼저 본다).
 * 프로필이 없는 세션(내보낸 계정)도 / 로 — 거기서 "소속 학교가 없어요" 안내를 본다.
 * 이 세그먼트에는 loading 경계를 두지 않는다 — 역할 판정이 HTTP 3xx 로 나가야 한다 (/intake·/users 와 같다).
 * 카드의 글자(재주문 기준·현재 재고·기준 문구·알림 날짜)는 여기(서버)에서 만든다 — 날짜는 한국 시간, 브라우저 시간대와 무관.
 */
export default async function ReorderPage() {
  const result = await getReorderScreen();
  if (result.kind === "signed-out") redirect("/login");
  if (result.kind !== "ok") redirect("/");

  const { isAdmin, alerts, vendors } = result.data;
  return (
    <ReorderScreen
      isAdmin={isAdmin}
      alerts={alerts.map((a) => ({
        id: a.id,
        name: a.name,
        amount: reorderAmountText(a),
        basis: reorderBasisText(a),
        // 자동 기준: 수량 줄 가운데 auto-threshold-badge + 캡션 (d7 §18, 시안 6)
        auto: a.source === "auto" ? { ...reorderAmountParts(a), caption: autoCaptionText(a) } : null,
        date: reorderAlertDateText(a.lowSince),
      }))}
      // 우리 학교 판매처 먼저, 그다음 공통 목록 (순서는 getReorderScreen 이 정했다)
      vendors={vendors.map((v) => ({
        id: v.id,
        name: v.name,
        contact: v.contact,
        website: v.website,
        searchUrl: v.searchUrl,
        note: v.note,
        favorite: v.favorite,
      }))}
    />
  );
}
