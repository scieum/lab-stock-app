import { RECORD_WIPE_TEXT, wipePreviewText, wipeTotal, type WipeCounts } from "@/lib/wipe-rules";
import styles from "./styles.module.css";

type Props = {
  /** count_wipe_records 결과 — null = 세는 중 */
  counts: WipeCounts | null;
};

/**
 * wipe-preview (rules 1.29 wipe.record, 시안 10-record-wipe): canvas-soft 상자(radius 16 · 안쪽 12 16 · 사이 4)
 * '사용 기록 {N}건 · 입고 기록 {M}건을 지워요'(15 ink) + muted '지금 재고 수량은 그대로예요. 수업 정보도 함께 지워져요.'(13).
 * 0건이면 '이 기간에 지울 기록이 없어요' 한 줄(버튼은 부르는 쪽이 끈다).
 */
export function WipePreview({ counts }: Props) {
  return (
    <div data-component="wipe-preview" className={styles.box} aria-live="polite" aria-busy={counts === null || undefined}>
      {counts === null ? (
        <p className={styles.note}>지울 기록을 세는 중이에요</p>
      ) : wipeTotal(counts) === 0 ? (
        <p className={styles.text}>{RECORD_WIPE_TEXT.previewEmpty}</p>
      ) : (
        <>
          <p className={styles.text}>{wipePreviewText(counts)}</p>
          <p className={styles.note}>{RECORD_WIPE_TEXT.previewNote}</p>
        </>
      )}
    </div>
  );
}
