"use client";

import { useId } from "react";
import { SENSOR_TYPES, type SensorType } from "@/lib/sensor-rules";
import styles from "./styles.module.css";

type Props = {
  value: SensorType | "";
  onChange?: (v: SensorType) => void;
  error?: string;
  /** 라벨 줄 숨김 (필터 시트처럼 묶음 제목을 따로 두는 곳) */
  hideLabel?: boolean;
};

/**
 * 센서 종류 고르기 (디자인 1.26 sensor.form, sensor-type-select): 라벨 "종류" → chip 14개 줄바꿈(사이 8) 하나만 고르기.
 * chip = pill 높이 44 · 좌우 16 · 15 — 고름 = highlight-soft + highlight 테두리 + 600, 안 고름 = canvas-soft.
 */
export function SensorTypeSelect({ value, onChange, error, hideLabel = false }: Props) {
  const labelId = useId();
  const errorId = useId();
  return (
    <div data-component="sensor-type-select" className={styles.field}>
      {hideLabel ? null : (
        <span id={labelId} className={styles.label}>
          종류
        </span>
      )}
      <div
        role="radiogroup"
        aria-labelledby={hideLabel ? undefined : labelId}
        aria-label={hideLabel ? "종류" : undefined}
        aria-describedby={error ? errorId : undefined}
        className={styles.chips}
      >
        {SENSOR_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={value === t}
            className={[styles.chip, value === t ? styles.on : ""].filter(Boolean).join(" ")}
            onClick={() => onChange?.(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {error ? (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
