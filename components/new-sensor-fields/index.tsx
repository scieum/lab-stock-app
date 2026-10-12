"use client";

import { useId } from "react";
import { Icon } from "@/components/icons";
import { SegmentedControl } from "@/components/segmented-control";
import { SensorMakerSelect } from "@/components/sensor-maker-select";
import { SensorTypeSelect } from "@/components/sensor-type-select";
import { TextInput } from "@/components/text-input";
import { SENSOR_DOC_TEXT, type NewSensorDraft } from "@/lib/sensor-doc-rules";
import {
  SENSOR_LOCATION_MAX,
  SENSOR_MODEL_MAX,
  SENSOR_NAME_MAX,
  SENSOR_STATUSES,
  SENSOR_STATUS_LABEL,
  SENSOR_TEXT,
  isSensorStatus,
} from "@/lib/sensor-rules";
import styles from "./styles.module.css";

export type NewSensorPatch = Partial<Omit<NewSensorDraft, "catalogFilled">>;

type Props = {
  /** 서류 품명 (읽기 도구 이름) */
  itemName: string;
  value: NewSensorDraft;
  onChange?: (patch: NewSensorPatch) => void;
  /** 시약장 칸 고르기 (location-picker 는 부르는 쪽이 연다). 없어도 "시약장 칸" 칸은 보이고, 고르면 비활성 상자 + 안내 */
  onPickSlot?: () => void;
  /** 고른 칸 글자 "1번 시약장 · 좌 1단" */
  slotText?: string | null;
  error?: string | null;
  disabled?: boolean;
  /** 고르기 시트·목록 제자리(갤러리) */
  floating?: boolean;
  className?: string;
};

const LOCATION_OPTIONS = [
  { value: "text", label: "직접 입력" },
  { value: "slot", label: "시약장 칸" },
];

/**
 * 서류로 등록의 새 센서 칸 (rules 1.28 sensor.doc.new_sensor, 시안 17-doc-review new-sensor-fields):
 * "새 센서로 등록" 행 아래로 펼쳐지는 흰 카드(hairline-soft 테두리 · radius 16 · 안쪽 16) —
 * 이름 · 종류(sensor-type-select box) · 회사(sensor-maker-select) · 모델 / 수량(개) · 보관 위치(segmented "직접 입력 | 시약장 칸") · 상태 segmented(기본 정상).
 * 줄 = 라벨(13/600, 64) + 칸. 모바일 한 열(사이 12), 데스크톱 두 열(사이 24). 카탈로그로 채운 값 옆 caption muted "카탈로그".
 * 저장하지 않는다 — onChange 로 값만 넘긴다.
 */
export function NewSensorFields({ itemName, value, onChange, onPickSlot, slotText, error, disabled = false, floating = true, className }: Props) {
  const nameId = useId();
  const modelId = useId();
  const qtyId = useId();
  const locId = useId();
  const statusId = useId();
  const filled = value.catalogFilled ?? [];
  const canPickSlot = Boolean(onPickSlot);

  return (
    <div
      data-component="new-sensor-fields"
      role="group"
      aria-label={`${itemName} 새 센서`}
      className={[styles.root, className ?? ""].filter(Boolean).join(" ")}
    >
      <div className={styles.col} data-name="fields-col">
        <div className={styles.row} data-name="field-name">
          <label htmlFor={nameId} className={styles.label}>
            이름
          </label>
          <div className={styles.control}>
            <TextInput
              id={nameId}
              className={styles.input}
              autoComplete="off"
              maxLength={SENSOR_NAME_MAX}
              placeholder={SENSOR_TEXT.namePlaceholder}
              value={value.name}
              disabled={disabled}
              onChange={(e) => onChange?.({ name: e.target.value })}
            />
            {filled.includes("name") ? <span className={styles.badge}>{SENSOR_DOC_TEXT.catalogBadge}</span> : null}
          </div>
        </div>
        <SensorTypeSelect
          variant="box"
          inlineLabel
          value={value.type}
          floating={floating}
          note={filled.includes("type") ? SENSOR_DOC_TEXT.catalogBadge : undefined}
          onChange={(t) => onChange?.({ type: t })}
        />
        <div className={styles.makerRow}>
          <SensorMakerSelect value={value.maker} floating={floating} onChange={(m) => onChange?.({ maker: m })} />
        </div>
        <div className={styles.row} data-name="field-model">
          <label htmlFor={modelId} className={styles.label}>
            모델
          </label>
          <div className={styles.control}>
            <TextInput
              id={modelId}
              className={styles.input}
              autoComplete="off"
              maxLength={SENSOR_MODEL_MAX}
              placeholder={SENSOR_DOC_TEXT.modelPlaceholder}
              value={value.model}
              disabled={disabled}
              onChange={(e) => onChange?.({ model: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className={styles.col} data-name="fields-col">
        <div className={styles.row} data-name="field-quantity">
          <label htmlFor={qtyId} className={styles.label}>
            수량
          </label>
          <div className={styles.control}>
            <TextInput
              id={qtyId}
              className={styles.qty}
              inputMode="numeric"
              autoComplete="off"
              unit="개"
              unitTone="plain"
              value={value.quantity}
              disabled={disabled}
              onChange={(e) => onChange?.({ quantity: e.target.value })}
            />
          </div>
        </div>
        <div className={[styles.row, styles.location].join(" ")} data-name="field-location" role="group" aria-labelledby={locId}>
          <span id={locId} className={styles.label}>
            보관 위치
          </span>
          <div className={styles.locationBody}>
            <SegmentedControl
              label="보관 위치"
              options={LOCATION_OPTIONS}
              value={value.locationMode}
              disabled={disabled}
              onChange={(v) => onChange?.({ locationMode: v === "slot" ? "slot" : "text" })}
            />
            {value.locationMode === "slot" ? (
              <button type="button" className={styles.slotBox} disabled={disabled || !canPickSlot} onClick={onPickSlot}>
                <span className={slotText ? styles.slotValue : styles.slotPlaceholder}>
                  {slotText || (canPickSlot ? "시약장 칸을 골라 주세요" : "등록한 시약장이 없어요 — 직접 입력해 주세요")}
                </span>
                <Icon name="chevron-right" className={styles.slotIcon} />
              </button>
            ) : (
              <TextInput
                className={styles.input}
                aria-label={`${itemName} 보관 위치`}
                autoComplete="off"
                maxLength={SENSOR_LOCATION_MAX}
                placeholder={SENSOR_TEXT.locationPlaceholder}
                value={value.locationText}
                disabled={disabled}
                onChange={(e) => onChange?.({ locationText: e.target.value })}
              />
            )}
          </div>
        </div>
        <div className={styles.row} data-name="field-status" role="group" aria-labelledby={statusId}>
          <span id={statusId} className={styles.label}>
            상태
          </span>
          <div className={styles.control}>
            <SegmentedControl
              label="상태"
              options={SENSOR_STATUSES.map((s) => ({ value: s, label: SENSOR_STATUS_LABEL[s] }))}
              value={value.status}
              disabled={disabled}
              onChange={(v) => {
                if (isSensorStatus(v)) onChange?.({ status: v });
              }}
            />
          </div>
        </div>
      </div>

      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
