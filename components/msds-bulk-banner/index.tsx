import { ButtonPillSoft } from "@/components/button-pill-soft";
import { bulkBannerText } from "@/lib/msds-rules";
import styles from "./styles.module.css";

type Props = {
  /** MSDS 없는 시약 수 (지금 목록 기준) */
  count: number;
  /** "한 번에 찾기" */
  onStart?: () => void;
  /** 진행 중이면 버튼 비활성 */
  disabled?: boolean;
  /** 화면 안 전폭(모바일) — 갤러리에서는 false */
  bleed?: boolean;
};

/**
 * 화면 2 MSDS 일괄 찾기 띠 (디자인 1.17 2-msds-bulk): 연하늘 띠(안쪽 12 16, 사이 12) — 왼쪽 "MSDS 없는 시약 N종"(13 기본색),
 * 오른쪽 button-pill-soft "한 번에 찾기". 교사·admin 이 "MSDS 없는 시약만" 필터를 켰을 때만 (R5 · guest 숨김).
 */
export function MsdsBulkBanner({ count, onStart, disabled, bleed = true }: Props) {
  return (
    <div data-component="msds-bulk-banner" className={[styles.banner, bleed ? styles.bleed : ""].filter(Boolean).join(" ")}>
      <p className={styles.label}>{bulkBannerText(count)}</p>
      <ButtonPillSoft className={styles.action} onClick={onStart} disabled={disabled || count === 0}>
        한 번에 찾기
      </ButtonPillSoft>
    </div>
  );
}
