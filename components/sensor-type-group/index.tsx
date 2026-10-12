"use client";

import { useId } from "react";
import { Icon } from "@/components/icons";
import type { SensorType } from "@/lib/sensor-rules";
import styles from "./styles.module.css";

type Props = {
  /** 묶음 이름 (물리 · 화학 · 생명·지구 · 장비) */
  title: string;
  /** 이 묶음에서 보일 종류 (검색 중이면 맞는 것만) */
  types: readonly SensorType[];
  /** 이름 옆 caption — 고르기 시트 = 개수 "12", 필터 = 고른 개수 "· 2개" (빈 글자면 없음) */
  count?: string;
  open: boolean;
  onToggle?: () => void;
  /** 고른 종류 (고르기 = 하나, 필터 = 여러 개) */
  selected: readonly string[];
  onPick?: (type: SensorType) => void;
  /** 첫 줄 위 hairline 없음 */
  first?: boolean;
};

/**
 * 센서 종류 묶음 한 줄 (rules 1.28 sensor.type_select · filter, 시안 17-type · 17-filter sensor-type-group):
 * group-row 52 = 묶음 이름(17/600) + 개수 caption(12 muted) + 오른쪽 ▸/▾(44 누름 영역), 줄 사이 hairline-soft.
 * 펼치면 chip-wrap(위아래 12, 사이 8) — chip 44 pill, 고른 chip = highlight-soft + highlight 테두리(border-width) + ✓.
 */
export function SensorTypeGroup({ title, types, count, open, onToggle, selected, onPick, first = false }: Props) {
  const panelId = useId();
  return (
    <div data-component="sensor-type-group" data-open={open ? "" : undefined} className={[styles.group, first ? styles.first : ""].filter(Boolean).join(" ")}>
      <button
        type="button"
        className={styles.row}
        data-name="group-row"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={onToggle}
      >
        <span className={styles.label}>
          <span className={styles.name}>{title}</span>
          {count ? <span className={styles.count}>{count}</span> : null}
        </span>
        <span className={styles.toggle} aria-hidden="true">
          <Icon name={open ? "chevron-down" : "chevron-right"} className={styles.chevron} />
        </span>
      </button>
      {open ? (
        <div id={panelId} className={styles.chips} data-name="chip-wrap" role="group" aria-label={title}>
          {types.map((t) => {
            const on = selected.includes(t);
            return (
              <button
                key={t}
                type="button"
                className={[styles.chip, on ? styles.on : ""].filter(Boolean).join(" ")}
                data-name={on ? "type-chip-selected" : "type-chip"}
                aria-pressed={on}
                onClick={() => onPick?.(t)}
              >
                <span>{t}</span>
                {on ? <Icon name="check" className={styles.check} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
