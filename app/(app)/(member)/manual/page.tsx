import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getManualScreen } from "@/lib/supabase/manual";
import { ManualScreen } from "./manual-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "실험 매뉴얼 · Lab_Stock" };

/**
 * 화면 5 실험 매뉴얼 (교사·admin 만 — dev-rules route_auth 5).
 * 비로그인 → /login, 학생 → / (시약을 읽지도, 화면을 그리지도 않는다 — getManualScreen 이 역할을 먼저 본다).
 * 프로필이 없는 세션(내보낸 계정)도 / 로 — 거기서 "소속 학교가 없어요" 안내를 본다.
 * 이 세그먼트에는 loading 경계를 두지 않는다 — 역할 판정이 HTTP 3xx 로 나가야 한다 (/reorder·/intake 와 같다).
 * 화면에는 자동 연결·선택 칸·"기존 기준" 표시에 쓰는 값(id·이름·단위·지금 기준·기준 출처)만 내려보낸다.
 */
export default async function ManualPage() {
  const result = await getManualScreen();
  if (result.kind === "signed-out") redirect("/login");
  if (result.kind !== "ok") redirect("/");

  return (
    <ManualScreen
      reagents={result.data.reagents.map((r) => ({ id: r.id, name: r.name, unit: r.unit, minStock: r.minStock, source: r.source }))}
    />
  );
}
