import Link from "next/link";
import { CabinetNumber } from "@/components/cabinet-number";
import { DataTableButtonCell, DataTableCell, DataTableLinkCell, DataTableRow } from "@/components/data-table";
import { Icon } from "@/components/icons";
import { LinkPending } from "@/components/link-pending";
import { SelectCheckbox } from "@/components/select-checkbox";
import { SensorStatusBadge } from "@/components/sensor-status-badge";
import { linkPrefetch } from "@/lib/link-prefetch";
import { quantityText, sensorCaption, type SensorStatus } from "@/lib/sensor-rules";
import styles from "./styles.module.css";

/** 행에 그릴 센서 값 (lib/supabase/sensors SensorItem 의 부분) */
export type SensorRowData = {
  id: string;
  name: string;
  type: string;
  maker: string;
  model: string | null;
  quantity: number;
  locationText: string | null;
  slot: { cabinetNumber: number; text: string } | null;
  status: SensorStatus;
};

/** 보관 위치 (칸이면 번호 원 + "1번 시약장 · 좌 1단", 아니면 직접 입력 글자, 없으면 "—") */
export function SensorLocation({ sensor, className }: { sensor: Pick<SensorRowData, "locationText" | "slot">; className?: string }) {
  if (sensor.slot) {
    return (
      <span className={[styles.location, className ?? ""].filter(Boolean).join(" ")}>
        <CabinetNumber number={sensor.slot.cabinetNumber} />
        <span className={styles.locationText}>{sensor.slot.text}</span>
      </span>
    );
  }
  return <span className={[styles.locationText, className ?? ""].filter(Boolean).join(" ")}>{sensor.locationText ?? "—"}</span>;
}

type CardProps = {
  sensor: SensorRowData;
  /** 상세 주소 (보통 모드) */
  href?: string;
  /** 선택 모드 — 행을 누르면 고르기 (상세로 가지 않음) */
  selectMode?: boolean;
  selected?: boolean;
  onToggle?: () => void;
  /** 방금 바뀐 행 (서류로 등록 뒤 잠깐 highlight-soft — rules sensor.doc.save) */
  fresh?: boolean;
};

/**
 * 센서 한 줄 — 모바일 카드 (디자인 1.26 sensor.list, sensor-row): canvas-soft · rounded.sm(16) · 안쪽 16.
 * 이름(17/600) + 오른쪽 sensor-status-badge → "온도 · 버니어 · GDX-TMP"(12 회색) → "3개 · 과학실 뒤 선반"(13) · 오른쪽 ›.
 * 선택 모드 = 왼쪽 select-checkbox, 고른 행 highlight-soft.
 */
export function SensorRow({ sensor, href, selectMode = false, selected = false, onToggle, fresh = false }: CardProps) {
  const body = (
    <span className={styles.text}>
      <span className={styles.titleRow}>
        <span className={styles.name}>{sensor.name}</span>
        <SensorStatusBadge status={sensor.status} on={selected ? "plain" : "card"} />
      </span>
      <span className={styles.caption}>{sensorCaption(sensor)}</span>
      <span className={styles.meta}>
        <span>{quantityText(sensor.quantity)}</span>
        <span aria-hidden="true">·</span>
        <SensorLocation sensor={sensor} />
      </span>
    </span>
  );
  const cls = [styles.card, selected || fresh ? styles.selected : ""].filter(Boolean).join(" ");
  if (selectMode) {
    return (
      <button data-component="sensor-row" type="button" className={[cls, styles.button].join(" ")} aria-pressed={selected} onClick={onToggle}>
        <SelectCheckbox checked={selected} />
        {body}
      </button>
    );
  }
  if (href) {
    return (
      <Link data-component="sensor-row" data-fresh={fresh ? "true" : undefined} href={href} prefetch={linkPrefetch(href)} className={cls}>
        {body}
        <Icon name="chevron-right" className={styles.chevron} />
        <LinkPending />
      </Link>
    );
  }
  return (
    <div data-component="sensor-row" className={cls}>
      {body}
    </div>
  );
}

type TableRowProps = {
  sensor: SensorRowData;
  href: string;
  /** 드로어에 열린 행 */
  current?: boolean;
  selectMode?: boolean;
  selected?: boolean;
  onToggle?: () => void;
  /** 방금 바뀐 행 (잠깐 highlight-soft) */
  fresh?: boolean;
};

/**
 * 센서 한 줄 — 데스크톱 data-table 행 (시안 17-desktop sensor-row): 이름(13/600) · 종류 · 회사 · 모델 · 수량 · 보관 위치 · 상태.
 * 행을 누르면 드로어(상세). 선택 모드 = 첫 칸 select-checkbox, 누르면 고르기.
 */
export function SensorTableRow({ sensor, href, current = false, selectMode = false, selected = false, onToggle, fresh = false }: TableRowProps) {
  return (
    <DataTableRow component="sensor-row" selected={selectMode ? selected : current} fresh={fresh && !selectMode} clickable>
      {selectMode ? (
        <DataTableCell>
          <SelectCheckbox checked={selected} />
        </DataTableCell>
      ) : null}
      {selectMode ? (
        <DataTableButtonCell onClick={() => onToggle?.()} pressed={selected}>
          <span className={styles.cellName}>{sensor.name}</span>
        </DataTableButtonCell>
      ) : (
        <DataTableLinkCell href={href} current={current}>
          <span className={styles.cellName}>{sensor.name}</span>
        </DataTableLinkCell>
      )}
      <DataTableCell>{sensor.type}</DataTableCell>
      <DataTableCell>{sensor.maker}</DataTableCell>
      <DataTableCell tone={sensor.model ? "default" : "muted"}>{sensor.model ?? "—"}</DataTableCell>
      <DataTableCell>{quantityText(sensor.quantity)}</DataTableCell>
      <DataTableCell tone={sensor.slot || sensor.locationText ? "default" : "muted"}>
        <SensorLocation sensor={sensor} />
      </DataTableCell>
      <DataTableCell>
        <SensorStatusBadge status={sensor.status} />
      </DataTableCell>
    </DataTableRow>
  );
}
