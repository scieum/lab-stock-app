import { SENSOR_STATUS_LABEL, type SensorStatus } from "@/lib/sensor-rules";
import styles from "./styles.module.css";

type Props = {
  status: SensorStatus;
  /**
   * 바탕 — card = 회색 카드(모바일 sensor-row) 위: 점검 필요 pill 을 흰 바탕 + 테두리로 (시안 17-mobile).
   * plain(기본) = 흰 바탕 위(표 · 상세): 점검 필요 = canvas-soft pill
   */
  on?: "plain" | "card";
  className?: string;
};

/**
 * 센서 상태 배지 (디자인 1.26 sensor.status, sensor-status-badge) — 무채색, 핑크·하늘색 없음.
 * 고장 = ink 채움 pill + 흰 글자 · 점검 필요 = canvas-soft pill + ink 글자 · 정상 = 채움 없이 text-muted "정상".
 */
export function SensorStatusBadge({ status, on = "plain", className }: Props) {
  const cls = [
    styles.badge,
    status === "broken" ? styles.broken : status === "check" ? styles.check : styles.ok,
    status === "check" && on === "card" ? styles.onCard : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span data-component="sensor-status-badge" data-status={status} className={cls}>
      {SENSOR_STATUS_LABEL[status]}
    </span>
  );
}
