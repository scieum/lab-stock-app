import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ButtonOutline } from "@/components/button-outline";
import { ButtonPrimary } from "@/components/button-primary";
import { MsdsEntry } from "@/components/msds-entry";
import { QrCodeSvg } from "@/components/msds-qr-tile";
import { ReagentDetailCard } from "@/components/reagent-detail-card";
import { qrPath } from "@/lib/qr";
import { getReagentDetail } from "@/lib/supabase/reagent-detail";
import { DetailTabs, type InfoRow } from "./detail-tabs";
import styles from "./detail.module.css";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

/** 요청 기준 절대 주소 (MSDS 링크가 없을 때 QR 에 이 시약 상세 주소를 담는다) */
async function absoluteUrl(path: string): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}${path}`;
}

/**
 * 화면 3 시약 상세 (자기 학교 reagents 1건, RLS).
 * 없는 id · 다른 학교 id 는 똑같이 404 — 존재 여부를 드러내지 않는다.
 * 배치: 시안(요약 열 = 카드 + MSDS, 정보 열 = 탭 + 표 + 하단 버튼)을 따르되,
 * 모바일은 요약 열을 먼저 두어 msds-entry 가 첫 화면(390×844) 안에 들어온다.
 */
export default async function ReagentDetailPage({ params }: Props) {
  const { id } = await params;
  const result = await getReagentDetail(id);
  if (result.kind === "signed-out") redirect("/login");
  if (result.kind === "not-found") notFound();

  const { role, reagent, location, usage } = result.data;
  const staff = role !== "student";
  const qrTarget = reagent.msdsUrl ?? (await absoluteUrl(`/reagents/${reagent.id}`));
  const qr = qrPath(qrTarget);

  const info: InfoRow[] = [
    { label: "보관 위치", value: location ? `${location.cabinet} · ${location.slot}` : "지정 안 됨" },
    { label: "보관 분류", value: location?.storageClass ?? "-" },
    { label: "CAS 번호", value: reagent.casNo ?? "-" },
    { label: "최소 재고", value: reagent.minStock },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.layout}>
        <div className={styles.summary}>
          <ReagentDetailCard
            name={reagent.name}
            stock={reagent.stock}
            unit={reagent.unit}
            lowStock={reagent.lowStock}
            intakeDate={reagent.intakeDate}
          />
          <MsdsEntry
            href={reagent.msdsUrl ?? undefined}
            caption={reagent.msdsUrl ? "QR로 MSDS 열기" : "QR로 이 시약 정보 열기"}
            notice={
              staff ? "MSDS 링크가 아직 등록되지 않았어요" : "MSDS 링크가 아직 등록되지 않았어요. 선생님께 문의하세요"
            }
            qr={
              <QrCodeSvg
                size={qr.size}
                d={qr.d}
                label={reagent.msdsUrl ? `${reagent.name} MSDS QR 코드` : `${reagent.name} 상세 QR 코드`}
              />
            }
          />
        </div>
        <div className={styles.info}>
          <DetailTabs info={info} usage={usage} />
          <div className={styles.actions}>
            {/* 입고(stock-intake)는 교사·admin만 (rules.json R5). 학생 자리에는 목록으로 돌아가는 보조 버튼 */}
            {staff ? (
              <span data-component="stock-intake" className={styles.intake}>
                <ButtonOutline href={`/intake?reagent=${reagent.id}`}>입고</ButtonOutline>
              </span>
            ) : (
              <ButtonOutline href="/reagents">목록</ButtonOutline>
            )}
            <ButtonPrimary href={`/usage/new?reagent=${reagent.id}`} className={styles.primary}>
              사용 기록
            </ButtonPrimary>
          </div>
        </div>
      </div>
    </div>
  );
}
