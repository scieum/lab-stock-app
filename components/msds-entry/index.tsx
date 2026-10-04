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
};

/** MSDS 진입점 (QR 타일 + MSDS 보기 버튼). 모든 역할에 보인다(R4). */
export function MsdsEntry({ href, qr, caption, notice, variant = "tile" }: Props) {
  const noticeId = useId();
  const buttonOnly = variant === "button";
  return (
    <section
      data-component="msds-entry"
      className={[styles.entry, buttonOnly ? styles.buttonOnly : ""].join(" ").trim()}
      aria-label="MSDS"
    >
      {buttonOnly ? null : <MsdsQrTile caption={caption}>{qr}</MsdsQrTile>}
      {href ? (
        <ButtonPillSoft href={href} external icon="external">
          MSDS 보기
        </ButtonPillSoft>
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
