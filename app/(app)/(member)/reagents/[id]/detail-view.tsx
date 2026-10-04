import { headers } from "next/headers";
import { ButtonOutline } from "@/components/button-outline";
import { ButtonPrimary } from "@/components/button-primary";
import { GuestLockedButton } from "@/components/guest-lock/locked-button";
import { MsdsEntry } from "@/components/msds-entry";
import { QrCodeSvg } from "@/components/msds-qr-tile";
import { ReagentDetailCard } from "@/components/reagent-detail-card";
import { qrPath } from "@/lib/qr";
import type { ReagentDetail } from "@/lib/supabase/reagent-detail";
import type { Role } from "@/lib/types";
import { DetailTabs, type InfoRow } from "./detail-tabs";
import styles from "./detail.module.css";

/** 요청 기준 절대 주소 (MSDS 링크가 없을 때 QR 에 이 시약 상세 주소를 담는다) */
async function absoluteUrl(path: string): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}${path}`;
}

type Props = {
  data: Omit<ReagentDetail, "role">;
  /**
   * 로그인 역할. 없으면 둘러보기(3g, /demo/reagents/[id]): 쓰기 동작(사용 기록)은 guest-lock 버튼(ex-toast),
   * 입고(stock-intake)는 두지 않는다. msds-entry 는 그대로(R4).
   */
  role?: Role;
  /** 이 상세 화면의 경로 (QR 대체 주소) · 목록 경로 */
  selfPath: string;
  listHref: string;
};

/**
 * 화면 3 시약 상세 본문 — 로그인(역할별) / 둘러보기(role 없음) 공용.
 * 배치: 시안(요약 열 = 카드 + MSDS, 정보 열 = 탭 + 표 + 하단 버튼)을 따르되,
 * 모바일은 요약 열을 먼저 두어 msds-entry 가 첫 화면(390×844) 안에 들어온다.
 */
export async function ReagentDetailView({ data, role, selfPath, listHref }: Props) {
  const { reagent, location, usage } = data;
  const guest = !role;
  const staff = !guest && role !== "student";
  const qrTarget = reagent.msdsUrl ?? (await absoluteUrl(selfPath));
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
              staff || guest
                ? "MSDS 링크가 아직 등록되지 않았어요"
                : "MSDS 링크가 아직 등록되지 않았어요. 선생님께 문의하세요"
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
            {guest ? (
              // 시안 3-guest bottom-actions: button-primary "사용 기록" + guest-lock 하나만
              <GuestLockedButton variant="primary" className={styles.primary}>
                사용 기록
              </GuestLockedButton>
            ) : (
              <>
                {/* 입고(stock-intake)는 교사·admin만 (rules.json R5). 학생 자리에는 목록으로 돌아가는 보조 버튼 */}
                {staff ? (
                  <span data-component="stock-intake" className={styles.intake}>
                    <ButtonOutline href={`/intake?reagent=${reagent.id}`}>입고</ButtonOutline>
                  </span>
                ) : (
                  <ButtonOutline href={listHref}>목록</ButtonOutline>
                )}
                <ButtonPrimary href={`/usage/new?reagent=${reagent.id}`} className={styles.primary}>
                  사용 기록
                </ButtonPrimary>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
