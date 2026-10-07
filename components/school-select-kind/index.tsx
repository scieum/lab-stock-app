"use client";

import { useId, useState } from "react";
import { SegmentedControl } from "@/components/segmented-control";
import { SCHOOL_KINDS, isSchoolKind, type SchoolKind } from "@/lib/school-kinds";
import styles from "./styles.module.css";

type Props = {
  /** 고른 학교급. "" = 아직 고르지 않음 (기본값 없음, d7 §19). 넘기지 않으면 안에서 상태를 가진다(갤러리) */
  value?: SchoolKind | "";
  defaultValue?: SchoolKind | "";
  onChange?: (kind: SchoolKind) => void;
  /** 지역을 고르기 전에는 고를 수 없다 (N1-d 순서) */
  disabled?: boolean;
  label?: string;
};

const OPTIONS = SCHOOL_KINDS.map((k) => ({ value: k, label: k }));

/**
 * 학교 선택 단계: 학교급 (시안 1.18 school-select-kind).
 * 라벨 "학교급 필수" + 3칸 segmented-control 초등학교·중학교·고등학교. 기본값 없음 — 고르기 전에는 흰 칸이 없다.
 */
export function SchoolSelectKind({ value, defaultValue = "", onChange, disabled, label = "학교급" }: Props) {
  const labelId = useId();
  const [inner, setInner] = useState<SchoolKind | "">(defaultValue);
  const current = value ?? inner;
  return (
    <div data-component="school-select-kind" className={styles.field} role="group" aria-labelledby={labelId}>
      <div className={styles.labelRow}>
        <span id={labelId} className={styles.label}>
          {label}
        </span>
        <span className={styles.required}>필수</span>
      </div>
      <SegmentedControl
        options={OPTIONS}
        value={current}
        label={label}
        disabled={disabled}
        onChange={(v) => {
          if (!isSchoolKind(v)) return;
          if (value === undefined) setInner(v);
          onChange?.(v);
        }}
      />
    </div>
  );
}
