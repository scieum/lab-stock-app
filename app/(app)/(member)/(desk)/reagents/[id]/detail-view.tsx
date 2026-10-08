import Link from "next/link";
import { ButtonOutline } from "@/components/button-outline";
import { ButtonPrimary } from "@/components/button-primary";
import { GuestLockedButton } from "@/components/guest-lock/locked-button";
import { Icon } from "@/components/icons";
import { MsdsEntry } from "@/components/msds-entry";
import { MSDS_TEXT } from "@/lib/msds-rules";
import { msdsSummaryPath } from "@/lib/msds-summary";
import { QrCodeSvg } from "@/components/msds-qr-tile";
import { ReagentDetailCard } from "@/components/reagent-detail-card";
import { locationText, slotLabel } from "@/lib/cabinet-rules";
import { linkPrefetch } from "@/lib/link-prefetch";
import { qrPath } from "@/lib/qr";
import { absoluteUrl } from "@/lib/request-origin";
import { AUTO_LABEL, autoCaptionText, thresholdSourceText, thresholdText } from "@/lib/reorder-rules";
import type { ReagentDetail } from "@/lib/supabase/reagent-detail";
import type { Role } from "@/lib/types";
import { ReagentDetailDrawer } from "./detail-drawer-view";
import { DetailSummary } from "./detail-summary";
import { DetailTabs, type InfoRow } from "./detail-tabs";
import { MsdsFind, MsdsSavedToast } from "./msds-find";
import styles from "./detail.module.css";

type Props = {
  data: Omit<ReagentDetail, "role">;
  /**
   * 로그인 역할. 없으면 둘러보기(3g, /demo/reagents/[id]): 쓰기 동작(사용 기록)은 guest-lock 버튼(ex-toast),
   * 입고(stock-intake)·위치 바꾸기(location-edit)·기준 입력(threshold-edit)은 두지 않는다. msds-entry 는 그대로(R4).
   */
  role?: Role;
  /** true = 위치 피커를 연 채로 시작 (화면 7 등록 직후 [다른 칸] → `?pick=location`, 교사·admin 만) */
  openPicker?: boolean;
  /** 이 상세 화면의 경로 (QR 대체 주소) · 목록 경로 */
  selfPath: string;
  listHref: string;
};

/**
 * 화면 3 시약 상세 본문 — 로그인(역할별) / 둘러보기(role 없음) 공용.
 * 로그인(디자인 1.15 3-mobile · 3-desktop): 한 열 — (데스크톱) page-header 뒤로가기 + "시약 상세" → reagent-detail-card
 *   (입고일 · reagent-location · reorder-threshold) → 정보/사용 기록 탭 + 표 → msds-entry → "사용 기록" + "입고"(교사·admin) / "목록"(학생).
 *   모바일 하단 버튼 줄은 tab-bar 바로 위 고정, 데스크톱은 열 안(폭 720, 가운데).
 * 둘러보기(3-guest): 예전 2열 배치 그대로 — 요약 열(카드 + MSDS) · 정보 열(탭 + 표 + 하단 버튼). 보관 위치·기준 줄 없이 표에 보관 위치.
 */
export async function ReagentDetailView({ data, role, openPicker = false, selfPath, listHref }: Props) {
  const { reagent, placement, threshold, picker, suggestion, usage } = data;
  const guest = !role;
  const staff = !guest && role !== "student";
  const qrTarget = reagent.msdsUrl ?? (await absoluteUrl(selfPath));
  const qr = qrPath(qrTarget);

  const info: InfoRow[] = [
    { label: "분류", value: reagent.storageClass ?? "-" },
    { label: "CAS 번호", value: reagent.casNo ?? "-" },
    { label: "보관 위치", value: locationText(placement?.cabinet, placement?.slot) },
    { label: "보관 분류", value: placement ? slotLabel(placement.classes) : "-" },
    // 로그인 화면은 카드의 재주문 기준 줄이 같은 값을 보여 준다
    // 둘러보기: 출처도 같은 문구로 (d7 §11-1·§18 — 자동이면 "자동 · 캡션", 그 밖은 근거 / "직접 입력")
    ...(guest ? [{ label: "재주문 기준", value: guestThresholdText(threshold) }] : []),
  ];

  const msds = (
    <MsdsEntry
      href={reagent.msdsUrl ?? undefined}
      // d7 §22: "MSDS 보기" = 화면 16 (둘러보기는 /demo/msds)
      summaryHref={msdsSummaryPath(reagent.id, { demo: guest })}
      caption={reagent.msdsUrl ? "QR로 MSDS 열기" : "QR로 이 시약 정보 열기"}
      notice={MSDS_TEXT.missing}
      // d7 §20: MSDS 없는 시약 — 교사·admin 은 "MSDS 찾기", 학생·둘러보기는 "MSDS가 아직 없어요"만 (R5 · guest 숨김)
      missingAction={staff ? <MsdsFind reagentId={reagent.id} reagentName={reagent.name} casNo={reagent.casNo} /> : null}
      qr={
        <QrCodeSvg size={qr.size} d={qr.d} label={reagent.msdsUrl ? `${reagent.name} MSDS QR 코드` : `${reagent.name} 상세 QR 코드`} />
      }
    />
  );

  if (guest) {
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
            {msds}
          </div>
          <div className={styles.info}>
            <DetailTabs info={info} usage={usage} />
            <div className={styles.actions}>
              {/* 시안 3-guest bottom-actions: button-primary "사용 기록" + guest-lock 하나만 */}
              <GuestLockedButton variant="primary" className={styles.primary}>
                사용 기록
              </GuestLockedButton>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.column}>
        {/* 데스크톱 page-header (모바일은 nav-pill 이 뒤로가기 + 제목을 보여 준다) */}
        <div className={styles.pageHeader}>
          <Link href={listHref} prefetch={linkPrefetch(listHref)} className={styles.back} aria-label="뒤로">
            <Icon name="back" className={styles.backIcon} />
          </Link>
          <h1 className={styles.pageTitle}>시약 상세</h1>
        </div>
        <DetailSummary
          reagent={{
            id: reagent.id,
            name: reagent.name,
            stock: reagent.stock,
            unit: reagent.unit,
            lowStock: reagent.lowStock,
            intakeDate: reagent.intakeDate,
            storageClass: reagent.storageClass,
          }}
          placement={placement}
          threshold={threshold}
          picker={staff ? picker : null}
          suggestion={staff ? suggestion : null}
          initialPicking={staff && picker !== null && openPicker}
        />
        <DetailTabs info={info} usage={usage} />
        {msds}
        {staff ? <MsdsSavedToast /> : null}
        <div className={[styles.actions, styles.columnActions].join(" ")}>
          <ButtonPrimary href={`/usage/new?reagent=${reagent.id}`} className={styles.primary}>
            사용 기록
          </ButtonPrimary>
          {/* 입고(stock-intake)는 교사·admin만 (rules.json R5). 학생 자리에는 목록으로 돌아가는 보조 버튼 */}
          {staff ? (
            <span data-component="stock-intake" className={styles.intake}>
              <ButtonOutline href={`/intake?mode=direct&reagent=${reagent.id}`}>입고</ButtonOutline>
            </span>
          ) : (
            <span className={styles.intake}>
              <ButtonOutline href={listHref}>목록</ButtonOutline>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** 둘러보기 정보 표의 재주문 기준 값: "3병 · 직접 입력" / "3병 · 자동 · 최근 사용량으로 계산했어요" / "아직 없어요 · 자동" */
function guestThresholdText(t: ReagentDetail["threshold"]): string {
  const value = thresholdText(t.minStock, t.unit);
  if (t.source !== "auto") return `${value} · ${thresholdSourceText(t)}`;
  const caption = t.minStock > 0 ? autoCaptionText(t) : null;
  return caption ? `${value} · ${AUTO_LABEL} · ${caption}` : `${value} · ${AUTO_LABEL}`;
}

type DeskProps = {
  data: Omit<ReagentDetail, "role">;
  role: Role;
  openPicker?: boolean;
  /** 이 상세 화면의 경로 (QR 대체 주소) */
  selfPath: string;
};

/**
 * 화면 3 데스크톱 (d7 §23 run b): 시약 목록 옆 오른쪽 detail-drawer. QR(서버에서 만든 SVG)과 MSDS 찾기를 만들어
 * 드로어(클라이언트 — 목록 쿼리를 따라가는 주소)에 넘긴다. 로그인 전용 (둘러보기 데스크톱은 run d).
 */
export async function ReagentDetailDesk({ data, role, openPicker = false, selfPath }: DeskProps) {
  const { reagent, placement } = data;
  const staff = role !== "student";
  const qrTarget = reagent.msdsUrl ?? (await absoluteUrl(selfPath));
  const qr = qrPath(qrTarget);
  return (
    <>
      <ReagentDetailDrawer
        data={data}
        staff={staff}
        openPicker={openPicker}
        qr={<QrCodeSvg size={qr.size} d={qr.d} label={reagent.msdsUrl ? `${reagent.name} MSDS QR 코드` : `${reagent.name} 상세 QR 코드`} />}
        missingAction={staff ? <MsdsFind reagentId={reagent.id} reagentName={reagent.name} casNo={reagent.casNo} /> : null}
        extraRows={[
          { label: "CAS 번호", value: reagent.casNo ?? "-" },
          { label: "칸 보관 분류", value: placement ? slotLabel(placement.classes) : "-" },
        ]}
      />
      {staff ? <MsdsSavedToast /> : null}
    </>
  );
}
