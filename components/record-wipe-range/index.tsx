"use client";

import { useId } from "react";
import { SegmentedControl } from "@/components/segmented-control";
import { TextInput } from "@/components/text-input";
import { RECORD_WIPE_RANGE_OPTIONS, RECORD_WIPE_TEXT, checkWipeBeforeDate, type RecordWipeRange as Range } from "@/lib/wipe-rules";
import styles from "./styles.module.css";

type Props = {
  range: Range;
  /** '이 날짜 이전' 날짜 (YYYY-MM-DD) */
  date: string;
  /** 오늘 (한국 날짜) — 날짜 고르기 최댓값 */
  today: string;
  onRangeChange?: (range: Range) => void;
  onDateChange?: (date: string) => void;
  disabled?: boolean;
};

/**
 * record-wipe-range (rules 1.29 wipe.record, 시안 10-record-wipe): 라벨 '지울 기간'(15/400) → segmented-control '전체 | 이 날짜 이전'
 * (트랙 44 · 항목 36 · 글자 13, 기본 '이 날짜 이전') → 날짜 text-input(달력 아이콘, 미래 불가) → caption '이 날짜 기록은 남아요'. 사이 8.
 * '전체'면 날짜 칸을 그리지 않는다.
 */
export function RecordWipeRange({ range, date, today, onRangeChange, onDateChange, disabled }: Props) {
  const labelId = useId();
  const check = checkWipeBeforeDate(date, today);
  const error =
    range === "before" && !check.ok ? (check.reason === "future" ? RECORD_WIPE_TEXT.futureDate : RECORD_WIPE_TEXT.invalidDate) : undefined;
  return (
    <div data-component="record-wipe-range" role="group" aria-labelledby={labelId} className={styles.wrap}>
      <span id={labelId} className={styles.label}>
        {RECORD_WIPE_TEXT.rangeLabel}
      </span>
      <SegmentedControl
        size="sm"
        fill
        label={RECORD_WIPE_TEXT.rangeLabel}
        options={RECORD_WIPE_RANGE_OPTIONS}
        value={range}
        disabled={disabled}
        onChange={(v) => onRangeChange?.(v as Range)}
      />
      {range === "before" ? (
        <>
          <TextInput
            type="date"
            icon="calendar"
            aria-label={RECORD_WIPE_TEXT.before}
            max={today}
            value={date}
            onChange={(e) => onDateChange?.(e.target.value)}
            readOnly={!onDateChange}
            disabled={disabled}
            error={error}
          />
          <p className={styles.caption}>{RECORD_WIPE_TEXT.beforeNote}</p>
        </>
      ) : null}
    </div>
  );
}
