import { SensorLocation, type SensorRowData } from "@/components/sensor-row";
import { SensorStatusBadge } from "@/components/sensor-status-badge";
import { quantityText } from "@/lib/sensor-rules";
import styles from "./styles.module.css";

export type SensorDetailData = SensorRowData & { memo: string | null; createdOn: string };

type Props = {
  sensor: SensorDetailData;
  /** 제목 줄 오른쪽 끝 (모바일 머리 ⋯ = sensor-delete, 교사·admin) */
  titleAction?: React.ReactNode;
  /** 제목 숨김 (데스크톱 드로어 — 제목은 드로어 머리가 아니라 본문 첫 줄에 그대로 둔다) */
  className?: string;
};

/**
 * 센서 상세 (디자인 1.26 sensor.detail, sensor-detail): 제목(20/700) + sensor-status-badge →
 * "항목 | 값" 줄(아래 hairline-soft, 위아래 12 · 사이 16, 항목 96 폭 12 회색 · 값 15): 종류 · 회사 · 모델 · 수량 · 보관 위치 · 메모 · 등록일.
 * 모바일 = 전용 화면 / 데스크톱 = detail-drawer 안.
 */
export function SensorDetail({ sensor, titleAction, className }: Props) {
  const rows: { key: string; value: React.ReactNode; muted?: boolean }[] = [
    { key: "종류", value: sensor.type },
    { key: "회사", value: sensor.maker },
    { key: "모델", value: sensor.model ?? "—", muted: !sensor.model },
    { key: "수량", value: quantityText(sensor.quantity) },
    { key: "보관 위치", value: <SensorLocation sensor={sensor} />, muted: !sensor.slot && !sensor.locationText },
    { key: "메모", value: sensor.memo ?? "—", muted: !sensor.memo },
    { key: "등록일", value: sensor.createdOn },
  ];
  return (
    <section data-component="sensor-detail" aria-label="센서 정보" className={[styles.detail, className ?? ""].filter(Boolean).join(" ")}>
      <div className={styles.titleRow}>
        <h2 className={styles.heading}>{sensor.name}</h2>
        <SensorStatusBadge status={sensor.status} />
        {titleAction ? <span className={styles.titleAction}>{titleAction}</span> : null}
      </div>
      <dl className={styles.rows}>
        {rows.map((r) => (
          <div key={r.key} className={styles.row}>
            <dt className={styles.key}>{r.key}</dt>
            <dd className={[styles.value, r.muted ? styles.muted : ""].filter(Boolean).join(" ")}>{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
