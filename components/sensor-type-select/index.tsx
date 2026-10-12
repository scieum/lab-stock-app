"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { SensorTypeSheet } from "@/components/sensor-type-sheet";
import { SENSOR_TYPES, type SensorType } from "@/lib/sensor-rules";
import styles from "./styles.module.css";

type Props = {
  value: SensorType | "";
  onChange?: (v: SensorType) => void;
  error?: string;
  /** 라벨 줄 숨김 (필터 시트처럼 묶음 제목을 따로 두는 곳) */
  hideLabel?: boolean;
  /**
   * chips(기본) = 예전 chip 줄 (화면 17 폼 — D3 에서 box 로 바꾼다).
   * box = rules 1.28 sensor.type_select: 고르기 칸 "종류 [편광 ▾]"(비었으면 placeholder "종류 고르기") → 누르면 sensor-type-sheet
   * (모바일 바텀시트 / 데스크톱 드롭다운), 하나 고르면 바로 닫힘.
   */
  variant?: "chips" | "box";
  /** box: 카탈로그로 채운 칸 = 잠깐 highlight-soft (rules sensor.catalog.fill) */
  filled?: boolean;
  /** box: 라벨 왼쪽 · 칸 오른쪽 한 줄 (new-sensor-fields 모바일) */
  inlineLabel?: boolean;
  /** box: 칸 오른쪽 caption ("카탈로그") */
  note?: string;
  /** box 갤러리 — 처음부터 시트가 열림 · 제자리 */
  defaultOpen?: boolean;
  floating?: boolean;
};

const PLACEHOLDER = "종류 고르기";

/**
 * 센서 종류 고르기 (디자인 1.26 sensor.form, sensor-type-select): 라벨 "종류" → chip 14개 줄바꿈(사이 8) 하나만 고르기.
 * chip = pill 높이 44 · 좌우 16 · 15 — 고름 = highlight-soft + highlight 테두리 + 600, 안 고름 = canvas-soft.
 */
export function SensorTypeSelect(props: Props) {
  if (props.variant === "box") return <SensorTypeBox {...props} />;
  return <SensorTypeChips {...props} />;
}

function SensorTypeBox({ value, onChange, error, hideLabel = false, filled = false, inlineLabel = false, note, defaultOpen = false, floating = true }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const wrapRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLButtonElement>(null);
  const labelId = useId();
  const errorId = useId();

  useEffect(() => {
    if (!open || !floating) return;
    const outside = (e: Event) => {
      if (e.target instanceof Node && wrapRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, floating]);

  const close = () => {
    setOpen(false);
    boxRef.current?.focus({ preventScroll: true });
  };

  return (
    <div
      ref={wrapRef}
      data-component="sensor-type-select"
      className={[styles.boxField, inlineLabel ? styles.inline : ""].filter(Boolean).join(" ")}
    >
      {hideLabel ? null : (
        <span id={labelId} className={styles.label}>
          종류
        </span>
      )}
      <div className={styles.anchor}>
        <div className={styles.boxRow}>
          <button
            ref={boxRef}
            type="button"
            data-name="select-box"
            className={[styles.box, filled ? styles.filled : "", value ? "" : styles.placeholder].filter(Boolean).join(" ")}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-labelledby={hideLabel ? undefined : labelId}
            aria-label={hideLabel ? "종류" : undefined}
            aria-describedby={error ? errorId : undefined}
            onClick={() => (open ? setOpen(false) : setOpen(true))}
          >
            <span className={styles.value}>{value || PLACEHOLDER}</span>
            <Icon name="caret-down" className={styles.caret} />
          </button>
          {note ? <span className={styles.note}>{note}</span> : null}
        </div>
        {open ? (
          <SensorTypeSheet
            value={value}
            floating={floating}
            onClose={floating ? close : undefined}
            onPick={(t) => {
              onChange?.(t);
              if (floating) close();
            }}
          />
        ) : null}
      </div>
      {error ? (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function SensorTypeChips({ value, onChange, error, hideLabel = false }: Props) {
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
