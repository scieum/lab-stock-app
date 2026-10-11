import styles from "./styles.module.css";

type Props = {
  /** mobile = sensor-row 카드 목록(사이 12) · desktop = data-table 을 감싼다 */
  variant: "mobile" | "desktop";
  children: React.ReactNode;
  className?: string;
};

/**
 * 센서 목록 (디자인 1.26 sensor.list, sensor-list): 모바일 = sensor-row 카드 세로 목록, 데스크톱 = data-table(열 이름 · 종류 · 회사 ·
 * 모델 · 수량 · 보관 위치 · 상태) 을 감싸는 자리.
 */
export function SensorList({ variant, children, className }: Props) {
  if (variant === "desktop") {
    return (
      <div data-component="sensor-list" className={[styles.desk, className ?? ""].filter(Boolean).join(" ")}>
        {children}
      </div>
    );
  }
  return (
    <ul data-component="sensor-list" aria-label="센서 목록" className={[styles.list, className ?? ""].filter(Boolean).join(" ")}>
      {children}
    </ul>
  );
}
