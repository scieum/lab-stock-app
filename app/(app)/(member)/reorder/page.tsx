import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AUTO_LABEL, reorderAlertDateText, reorderAmountText, reorderBasisText } from "@/lib/reorder-rules";
import { getReorderScreen } from "@/lib/supabase/reorder";
import { ReorderScreen } from "./reorder-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "재주문 알림 · Lab_Stock" };

/**
 * 화면 6 재주문 알림 (교사·admin 만 — dev-rules route_auth 6).
 * 비로그인 → /login, 학생 → / (시약·판매처를 읽지도, 화면을 그리지도 않는다 — getReorderScreen 이 역할을 먼저 본다).
 * 프로필이 없는 세션(내보낸 계정)도 / 로 — 거기서 "소속 학교가 없어요" 안내를 본다.
 * 이 세그먼트에는 loading 경계를 두지 않는다 — 역할 판정이 HTTP 3xx 로 나가야 한다 (/intake·/users 와 같다).
 * 카드의 글자(필요량·기준·알림 날짜)는 여기(서버)에서 만든다 — 날짜는 한국 시간, 브라우저 시간대와 무관.
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
        basis: alertBasisText(a),
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

/**
 * 카드 기준 문구 (d7 §11-1 표시): 자동이면 앞에 "자동 · " 를 붙여 화면 3 의 "자동" 표시와 맞춘다
 * ("자동 · 최근 4주 사용량 기준" / "자동 · 마지막 입고량의 20%"). 그 밖은 reorderBasisText 그대로.
 */
function alertBasisText(a: Parameters<typeof reorderBasisText>[0]): string {
  const text = reorderBasisText(a);
  return a.source === "auto" && text !== AUTO_LABEL ? `${AUTO_LABEL} · ${text}` : text;
}
