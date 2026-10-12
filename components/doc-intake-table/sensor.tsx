"use client";

import { useId, useState } from "react";
import { Icon } from "@/components/icons";
import { LocationPicker, type LocationChoice, type LocationPickerCabinet } from "@/components/location-picker";
import { NewSensorFields, type NewSensorPatch } from "@/components/new-sensor-fields";
import { SensorLink } from "@/components/sensor-link";
import { locationText } from "@/lib/cabinet-rules";
import {
  SENSOR_DOC_TEXT,
  defaultSensorDocLink,
  notSensorText,
  sensorDocTitle,
  type SchoolSensor,
  type SensorDocLink,
  type SensorDocRow,
} from "@/lib/sensor-doc-rules";
import styles from "./sensor.module.css";

/** 시약장 칸 (새 센서 "시약장 칸" → slot id) */
export type SensorDocSlot = { id: string; cabinetId: string; side: "L" | "R"; shelf: number };

export type SensorDocRowPatch = {
  link?: SensorDocLink;
  expanded?: boolean;
  isSensor?: boolean;
  draft?: NewSensorPatch;
};

type Props = {
  rows: readonly SensorDocRow[];
  /** 우리 학교 센서 (연결 · 바꾸기 목록) */
  sensors: readonly SchoolSensor[];
  /** 줄마다 문제 (lib/sensor-doc-rules planSensorDoc) */
  errors?: Readonly<Record<string, string>>;
  /** 새 센서 "시약장 칸" 고르기 (없으면 그 칸은 비활성 + 안내) */
  cabinets?: readonly LocationPickerCabinet[];
  slots?: readonly SensorDocSlot[];
  onRowChange?: (id: string, patch: SensorDocRowPatch) => void;
  disabled?: boolean;
  className?: string;
};

/** 데스크톱 "연결" 칸 짧은 글자 */
function linkShort(row: SensorDocRow, sensors: readonly SchoolSensor[]): string {
  if (row.link.kind === "none") return SENSOR_DOC_TEXT.excluded;
  if (row.link.kind === "new") return "새 센서";
  const sid = row.link.sensorId;
  const s = sensors.find((x) => x.id === sid);
  return s ? `더하기 ${s.quantity} → ${s.quantity + row.item.quantity}` : "—";
}

/**
 * 센서 서류 확인 표 (rules 1.28 sensor.doc.review, 시안 17-doc-review doc-intake-table — 화면 7 확인 표의 센서 갈래):
 * 제목 "읽은 센서 N개" → 데스크톱 data-table 머리 품명 · 회사 · 모델 · 수량 · 연결 / 모바일 행마다 canvas-soft 카드(품명 + "파스코 · PS-3201 · 2개") →
 * 행 아래 sensor-link("기존 센서에 더하기 · {이름} · 지금 3개 → 5개" · 바꾸기 · 빼기 / "새 센서로 등록") → 새 센서 줄은 new-sensor-fields 펼침.
 * 표 아래 접힌 묶음 "센서 아님 N개"(펼쳐 "센서로 넣기"). 서류 원문 이름(영문)은 품명 아래 "원문: …"(d7 §27).
 * 문제 줄 = 두 배 굵기 ink 테두리 + muted 안내 줄. 저장하지 않는다 — onRowChange 로 값만 넘긴다.
 */
export function SensorDocTable({ rows, sensors, errors = {}, cabinets = [], slots = [], onRowChange, disabled = false, className }: Props) {
  const titleId = useId();
  const otherId = useId();
  const [otherOpen, setOtherOpen] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const tableRows = rows.filter((r) => r.isSensor);
  const others = rows.filter((r) => !r.isSensor);
  const pickingRow = picking ? rows.find((r) => r.id === picking) : undefined;

  const slotTextOf = (slotId: string | null): string | null => {
    if (!slotId) return null;
    const slot = slots.find((s) => s.id === slotId);
    const cab = slot ? cabinets.find((c) => c.id === slot.cabinetId) : undefined;
    return slot && cab ? locationText(cab, slot) : null;
  };

  const choose = (choice: LocationChoice) => {
    const id = picking;
    setPicking(null);
    if (!id) return;
    if (!choice) {
      onRowChange?.(id, { draft: { slotId: null } });
      return;
    }
    const s = slots.find((x) => x.cabinetId === choice.cabinetId && x.side === choice.side && x.shelf === choice.shelf);
    onRowChange?.(id, { draft: { slotId: s?.id ?? null } });
  };

  const currentSlot = (() => {
    const sid = pickingRow?.draft.slotId;
    const s = sid ? slots.find((x) => x.id === sid) : undefined;
    return s ? { cabinetId: s.cabinetId, side: s.side, shelf: s.shelf } : null;
  })();

  return (
    <section
      data-component="doc-intake-table"
      data-variant="sensor"
      className={[styles.root, className ?? ""].filter(Boolean).join(" ")}
      aria-labelledby={titleId}
    >
      <h2 id={titleId} className={styles.title} data-name="table-title">
        {sensorDocTitle(tableRows.length)}
      </h2>

      <div className={styles.table} data-name="data-table">
        <div className={styles.header} aria-hidden="true" data-name="table-head">
          <span>품명</span>
          <span>회사</span>
          <span>모델</span>
          <span>수량</span>
          <span>연결</span>
        </div>

        <div className={styles.rows} role="list" aria-label="서류 센서">
          {tableRows.map((row) => {
            const error = errors[row.id];
            const caption = [row.item.maker, row.item.model, `${row.item.quantity}개`].filter(Boolean).join(" · ");
            const open = row.link.kind === "new" && row.expanded;
            return (
              <div
                key={row.id}
                role="listitem"
                className={styles.row}
                data-name="intake-row"
                data-row-id={row.id}
                data-link={row.link.kind}
                data-error={error ? "" : undefined}
              >
                <div className={styles.cells} data-name="item-line">
                  <div className={styles.nameCell}>
                    <p className={styles.itemName} data-name="item-name">
                      {row.item.name}
                    </p>
                    {row.item.originalName ? (
                      <p className={styles.original} data-name="original-name">
                        원문: {row.item.originalName}
                      </p>
                    ) : null}
                    <p className={styles.caption} data-name="caption">
                      {caption}
                    </p>
                  </div>
                  <span className={styles.cell} data-name="cell-maker">
                    {row.item.maker ?? "—"}
                  </span>
                  <span className={styles.cell} data-name="cell-model">
                    {row.item.model ?? "—"}
                  </span>
                  <span className={styles.cell} data-name="cell-quantity">
                    {`${row.item.quantity}개`}
                  </span>
                  <span className={[styles.cell, styles.linkCell].join(" ")} data-name="cell-link">
                    {linkShort(row, sensors)}
                  </span>
                </div>

                <SensorLink
                  className={styles.link}
                  itemName={row.item.name}
                  quantity={row.item.quantity}
                  link={row.link}
                  sensors={sensors}
                  expanded={open}
                  disabled={disabled}
                  onChange={(link) => onRowChange?.(row.id, link.kind === "new" ? { link, expanded: true } : { link })}
                  onToggleExpand={() => onRowChange?.(row.id, { expanded: !row.expanded })}
                />

                {open ? (
                  <div className={styles.newWrap} data-name="new-sensor-wrap">
                    <NewSensorFields
                      itemName={row.item.name}
                      value={row.draft}
                      error={error ?? null}
                      disabled={disabled}
                      onPickSlot={cabinets.length > 0 ? () => setPicking(row.id) : undefined}
                      slotText={slotTextOf(row.draft.slotId)}
                      onChange={(patch) => onRowChange?.(row.id, { draft: patch })}
                    />
                  </div>
                ) : null}

                {error && !open ? (
                  <p className={styles.error} role="alert">
                    <Icon name="warning" className={styles.errorIcon} />
                    <span>{error}</span>
                  </p>
                ) : null}
              </div>
            );
          })}
          {tableRows.length === 0 ? (
            <p className={styles.empty} role="status">
              {SENSOR_DOC_TEXT.noRows}
            </p>
          ) : null}
        </div>
      </div>

      {others.length > 0 ? (
        <div className={styles.others} data-name="not-sensor-group">
          <button
            type="button"
            className={styles.othersToggle}
            aria-expanded={otherOpen}
            aria-controls={otherId}
            onClick={() => setOtherOpen((o) => !o)}
          >
            <span>{notSensorText(others.length)}</span>
            <Icon name={otherOpen ? "chevron-up" : "chevron-down"} className={styles.othersIcon} />
          </button>
          {otherOpen ? (
            <ul id={otherId} className={styles.otherList}>
              {others.map((row) => (
                <li key={row.id} className={styles.otherItem} data-row-id={row.id}>
                  <span className={styles.otherName}>
                    {row.item.name}
                    <span className={styles.otherMeta}> · {row.item.quantity}개</span>
                  </span>
                  <button
                    type="button"
                    className={styles.otherAction}
                    disabled={disabled}
                    aria-label={`${row.item.name} ${SENSOR_DOC_TEXT.notSensorAction}`}
                    onClick={() => {
                      const link = defaultSensorDocLink(row);
                      onRowChange?.(row.id, { isSensor: true, link, expanded: link.kind === "new" });
                    }}
                  >
                    {SENSOR_DOC_TEXT.notSensorAction}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {pickingRow ? (
        <LocationPicker
          reagentName={pickingRow.draft.name.trim() || "센서"}
          cabinets={cabinets}
          current={currentSlot}
          onSave={choose}
          onClose={() => setPicking(null)}
        />
      ) : null}
    </section>
  );
}
