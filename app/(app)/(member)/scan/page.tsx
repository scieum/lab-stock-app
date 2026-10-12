import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { findCabinet } from "./find-cabinet";
import { ScanScreen } from "./scan-screen";
import type { ScanCabinetView } from "./scan-types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "QR 찾기 · Lab_Stock" };

type Props = { searchParams: Promise<{ cabinet?: string | string[] }> };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * 화면 12 QR 찾기 (`/scan`, 로그인 후 모든 역할 — dev-rules route_auth 12, d7 §26).
 * 비로그인 → proxy 가 /login?next= 로 보내고 로그인 뒤 같은 주소로 돌아온다. 프로필 없는 세션 → / ((member) 레이아웃).
 * 주소창 `/scan?cabinet={id}` = 결과 열린 상태 (새로고침 · 휴대폰 기본 카메라로 찍은 QR 링크 진입).
 * 우리 학교 시약장이 아니면 결과 없이 "{학교명} 시약장 QR이 아니에요" 토스트 (학교명 = 로그인 사용자 학교).
 */
export default async function ScanPage({ searchParams }: Props) {
  const sp = await searchParams;
  const cabinetParam = first(sp.cabinet);
  let initialResult: ScanCabinetView | null = null;
  let initialToast: string | null = null;
  if (cabinetParam !== undefined) {
    const r = await findCabinet({ cabinetId: cabinetParam });
    if (r.kind === "signed-out") redirect(`/login?next=${encodeURIComponent(`/scan?cabinet=${encodeURIComponent(cabinetParam)}`)}`);
    if (r.kind === "found") initialResult = r.cabinet;
    else initialToast = r.text;
  }
  return <ScanScreen initialResult={initialResult} initialToast={initialToast} />;
}
