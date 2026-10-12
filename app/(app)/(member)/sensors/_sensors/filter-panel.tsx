"use client";

import { useState } from "react";
import { ButtonOutline } from "@/components/button-outline";
import { ButtonPillSoft } from "@/components/button-pill-soft";
import { ButtonPrimary } from "@/components/button-primary";
import { SensorTypeGroup } from "@/components/sensor-type-group";
import { SheetPanel } from "@/components/sheet-panel";
import {
  SENSOR_STATUSES,
  SENSOR_STATUS_LABEL,
  SENSOR_TYPE_GROUPS,
  initialOpenTypeGroups,
  typeGroupSelectedCount,
  type SensorFilter,
  type SensorStatus,
} from "@/lib/sensor-rules";
import styles from "./sensors.module.css";

type Props = {
  value: SensorFilter;
  onChange: (next: SensorFilter) => void;
  /** 학교에 있는 회사만 (목록에 쓰인 회사) */
  makers: string[];
  /** 지금 고른 값으로 보일 센서 수 */
  resultCount: number;
  onApply: () => void;
  onReset: () => void;
  onClose: () => void;
};

function toggle<T>(list: readonly T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

/**
 * 센서 필터 (디자인 1.28 sensor.filter — list-filter-sheet 모양, 시안 17-filter): 종류 = sensor-type-group 4줄(기본 접힘, 검색 없음,
 * 묶음 줄에 고른 개수 "화학 · 2개", 고른 게 있는 묶음은 처음부터 펼침) → 회사 chip 여러 개 → 상태 3개.
 * 모바일 = tab-bar 위 하단 시트, 데스크톱 = 가운데 카드. "초기화" + "{N}개 보기".
 */
export function SensorFilterPanel({ value, onChange, makers, resultCount, onApply, onReset, onClose }: Props) {
  const [openGroups, setOpenGroups] = useState<string[]>(() => initialOpenTypeGroups(value.types));
  const toggleGroup = (title: string) => setOpenGroups((o) => (o.includes(title) ? o.filter((t) => t !== title) : [...o, title]));
  return (
    <SheetPanel
      title="필터"
      onClose={onClose}
      size="sm"
      footer={
        <div className={styles.filterActions}>
          <ButtonOutline onClick={onReset}>초기화</ButtonOutline>
          <ButtonPrimary className={styles.filterApply} onClick={onApply}>
            {`${resultCount}개 보기`}
          </ButtonPrimary>
        </div>
      }
    >
      <div className={styles.filterBody}>
        <section className={styles.filterGroup} aria-label="종류">
          <h3 className={styles.filterTitle}>종류</h3>
          <div className={styles.typeGroups} data-name="type-groups">
            {SENSOR_TYPE_GROUPS.map((g, i) => {
              const n = typeGroupSelectedCount(g, value.types);
              return (
                <SensorTypeGroup
                  key={g.title}
                  title={g.title}
                  types={g.types}
                  count={n > 0 ? `· ${n}개` : ""}
                  open={openGroups.includes(g.title)}
                  onToggle={() => toggleGroup(g.title)}
                  selected={value.types}
                  onPick={(t) => onChange({ ...value, types: toggle(value.types, t) })}
                  first={i === 0}
                />
              );
            })}
          </div>
        </section>
        {makers.length > 0 ? (
          <section className={styles.filterGroup} aria-label="회사">
            <h3 className={styles.filterTitle}>회사</h3>
            <div className={styles.chips}>
              {makers.map((m) => (
                <ButtonPillSoft key={m} selected={value.makers.includes(m)} aria-pressed={value.makers.includes(m)} onClick={() => onChange({ ...value, makers: toggle(value.makers, m) })}>
                  {m}
                </ButtonPillSoft>
              ))}
            </div>
          </section>
        ) : null}
        <section className={styles.filterGroup} aria-label="상태">
          <h3 className={styles.filterTitle}>상태</h3>
          <div className={styles.chips}>
            {SENSOR_STATUSES.map((s: SensorStatus) => (
              <ButtonPillSoft key={s} selected={value.statuses.includes(s)} aria-pressed={value.statuses.includes(s)} onClick={() => onChange({ ...value, statuses: toggle(value.statuses, s) })}>
                {SENSOR_STATUS_LABEL[s]}
              </ButtonPillSoft>
            ))}
          </div>
        </section>
      </div>
    </SheetPanel>
  );
}
