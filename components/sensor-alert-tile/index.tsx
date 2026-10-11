import Link from "next/link";
import { Icon } from "@/components/icons";
import { LinkPending } from "@/components/link-pending";
import styles from "./styles.module.css";

export type SensorAlertCounts = { broken: number; check: number };

/** "고장·점검 필요 센서 2" */
export function sensorAlertLabel(c: SensorAlertCounts): string {
  return `고장·점검 필요 센서 ${c.broken + c.check}`;
}

/** "고장 1 · 점검 필요 1" */
export function sensorAlertNote(c: SensorAlertCounts): string {
  return `고장 ${c.broken} · 점검 필요 ${c.check}`;
}

type Props = {
  counts: SensorAlertCounts;
  /** desktop = "지금 처리할 것" 숫자 타일 · mobile = home-summary 안 한 줄 (구분선 + 아이콘 + 글자 + ›) */
  variant: "desktop" | "mobile";
  /** 누르면 센서 목록 (고장 · 점검 필요만) */
  href?: string;
  className?: string;
};

export const SENSOR_ALERT_HREF = "/sensors?status=broken,check";

/**
 * 홈 센서 알림 (디자인 1.26 sensor.home, sensor-alert-tile): 교사·admin, 고장·점검 필요가 1개 이상일 때만 (부르는 쪽이 정한다).
 * 무채색 — 데스크톱 숫자 타일 "고장·점검 필요 센서" + 큰 숫자 + "고장 1 · 점검 필요 1", 모바일 home-summary 줄.
 */
export function SensorAlertTile({ counts, variant, href = SENSOR_ALERT_HREF, className }: Props) {
  const total = counts.broken + counts.check;
  if (variant === "mobile") {
    return (
      <div data-component="sensor-alert-tile" className={[styles.line, className ?? ""].filter(Boolean).join(" ")}>
        <Link href={href} className={styles.lineLink}>
          <span className={styles.lineLeft}>
            <Icon name="sensor" className={styles.lineIcon} />
            <span>{sensorAlertLabel(counts)}</span>
          </span>
          <Icon name="chevron-right" className={styles.chevron} />
          <LinkPending />
        </Link>
      </div>
    );
  }
  return (
    <Link data-component="sensor-alert-tile" href={href} className={[styles.tile, className ?? ""].filter(Boolean).join(" ")}>
      <span className={styles.caption}>고장·점검 필요 센서</span>
      <span className={styles.value}>{total}</span>
      <span className={styles.note}>{sensorAlertNote(counts)}</span>
      <LinkPending />
    </Link>
  );
}
