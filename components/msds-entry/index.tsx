import { useId } from "react";
import { ButtonPillSoft } from "@/components/button-pill-soft";
import { MsdsQrTile } from "@/components/msds-qr-tile";
import styles from "./styles.module.css";

type Props = {
  /** MSDS 문서 주소. 없으면 버튼을 비활성으로 두고 notice 를 보여준다 (R4: 진입점은 항상 표시). */
  href?: string;
  /** QR 이미지 (QrCodeSvg 등) */
  qr?: React.ReactNode;
  /** QR 아래 설명 */
  caption?: string;
  /** href 가 없을 때 안내 문구 */
  notice?: string;
  /** tile = QR 타일 + 버튼(기본, 화면 3), button = "MSDS 보기" 버튼만(화면 10 기록 상세) */
  variant?: "tile" | "button";
  /**
   * 화면 3 MSDS 없는 시약 (디자인 1.17 3-msds, d7 §20): href 가 없을 때 비활성 "MSDS 보기" 대신
   * notice(캡션 "MSDS가 아직 없어요") + 이 요소(교사·admin 의 msds-search)를 둔다. 학생·둘러보기는 null → 캡션만.
   * undefined 면 예전처럼 비활성 버튼 + notice (화면 10).
   */
  missingAction?: React.ReactNode;
  /**
   * 화면 16 MSDS 요약 주소 (d7 §22: "MSDS 보기"는 바깥 링크 대신 화면 16 을 연다). href 가 있을 때만 쓴다.
   * 없으면 예전처럼 href 를 새 창으로 연다 (갤러리 예시).
   */
  summaryHref?: string;
  /** summaryHref 버튼 아이콘 — 기본 external, 데스크톱 드로어 안은 chevron-right (시안 3·10-desktop icon-right — 같은 화면 안 이동) */
  summaryIcon?: "external" | "chevron-right";
  /**
   * stack = QR 타일 위 · 버튼 아래(기본, 모바일) · row = 데스크톱 detail-drawer (시안 3-desktop msds-entry: QR 타일 112 + 버튼 가로, 사이 16;
   * MSDS 없는 시약은 타일 없이 캡션 + MSDS 찾기 — 시안 3-msds-desktop)
   */
  layout?: "stack" | "row";
};

/** MSDS 진입점 (QR 타일 + MSDS 보기 버튼). 모든 역할에 보인다(R4). */
export function MsdsEntry({
  href,
  qr,
  caption,
  notice,
  variant = "tile",
  missingAction,
  summaryHref,
  summaryIcon = "external",
  layout = "stack",
}: Props) {
  const noticeId = useId();
  const buttonOnly = variant === "button";
  const row = layout === "row";
  return (
    <section
      data-component="msds-entry"
      className={[styles.entry, buttonOnly ? styles.buttonOnly : "", row ? styles.row : ""].filter(Boolean).join(" ")}
      aria-label="MSDS"
    >
      {buttonOnly || (row && !href && missingAction !== undefined) ? null : <MsdsQrTile caption={caption}>{qr}</MsdsQrTile>}
      {href && summaryHref ? (
        <ButtonPillSoft href={summaryHref} icon={summaryIcon}>
          MSDS 보기
        </ButtonPillSoft>
      ) : href ? (
        <ButtonPillSoft href={href} external icon="external">
          MSDS 보기
        </ButtonPillSoft>
      ) : missingAction !== undefined ? (
        <div className={styles.missing}>
          {notice ? <p className={styles.missingCaption}>{notice}</p> : null}
          {missingAction}
        </div>
      ) : (
        <>
          <ButtonPillSoft icon="external" disabled aria-describedby={notice ? noticeId : undefined}>
            MSDS 보기
          </ButtonPillSoft>
          {notice ? (
            <p id={noticeId} className={styles.notice}>
              {notice}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
