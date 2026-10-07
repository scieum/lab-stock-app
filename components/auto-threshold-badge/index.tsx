import { AUTO_LABEL } from "@/lib/reorder-rules";
import styles from "./styles.module.css";

type Props = {
  /**
   * 놓이는 바탕.
   * surface(기본) = 흰 카드 위 (시안 3 reagent-detail-card: 회색 pill, 테두리 없음, 높이 26 = 위아래 4).
   * muted = 회색 카드 위 (시안 6 reorder-alert-card: 같은 회색이라 가는 테두리, 위아래 0).
   */
  on?: "surface" | "muted";
  /** 테스트·기존 화면 호환용 testid (화면 3 의 reorder-threshold-auto) */
  testId?: string;
};

/**
 * 자동 재주문 기준 배지 (디자인 1.17 reorder.auto, d7 §18): 무채색 pill "자동".
 * canvas-soft 회색 바탕 + ink 12/600 글자. 핑크·하늘색 없음 (결정 신호가 아니라 출처 표시).
 * 근거 캡션("최근 사용량으로 계산했어요" 등)은 부르는 쪽이 배지 아래에 둔다 — lib/reorder-rules autoCaptionText.
 */
export function AutoThresholdBadge({ on = "surface", testId }: Props) {
  return (
    <span
      data-component="auto-threshold-badge"
      data-testid={testId}
      className={[styles.badge, on === "muted" ? styles.onMuted : ""].filter(Boolean).join(" ")}
    >
      {AUTO_LABEL}
    </span>
  );
}
