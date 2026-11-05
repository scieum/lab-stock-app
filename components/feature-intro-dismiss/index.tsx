import { FEATURE_INTRO_TEXT } from "@/lib/feature-intro";
import styles from "./styles.module.css";

type Props = {
  /** '일주일 동안 보지 않기' — 7일 숨김 (저장은 부르는 쪽) */
  onDismissWeek?: () => void;
  /** '닫기' — 이번 접속에서만 숨김 */
  onClose?: () => void;
};

/**
 * feature-intro-dismiss (rules 1.32 feature_intro.dismiss, 시안 13-feature-intro): 팝업 맨 아래 한 줄(44),
 * 왼쪽 '일주일 동안 보지 않기' · 오른쪽 '닫기' — 둘 다 text-muted 13/400 텍스트 버튼(주 버튼보다 약하게).
 */
export function FeatureIntroDismiss({ onDismissWeek, onClose }: Props) {
  return (
    <div data-component="feature-intro-dismiss" className={styles.row}>
      <button type="button" className={styles.button} onClick={onDismissWeek}>
        {FEATURE_INTRO_TEXT.dismissWeek}
      </button>
      <button type="button" className={styles.button} onClick={onClose}>
        {FEATURE_INTRO_TEXT.close}
      </button>
    </div>
  );
}
