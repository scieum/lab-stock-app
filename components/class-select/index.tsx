"use client";

import { useId } from "react";
import { Icon } from "@/components/icons";
import { RecentClassChip } from "@/components/recent-class-chip";
import {
  CLASS_NO_MAX,
  CLASS_NO_MIN,
  CLASS_SUBJECT_MAX,
  classLabelText,
  normalizeClassSubject,
  type ClassInfo,
} from "@/lib/class-info";
import styles from "./styles.module.css";

/** 입력 중인 값 — 수업명은 쓰는 그대로(공백 정리는 저장할 때) */
export type ClassDraft = { grade: number | null; classNo: number | null; subject: string };

export const EMPTY_CLASS_DRAFT: ClassDraft = { grade: null, classNo: null, subject: "" };

export function classDraftValue(d: ClassDraft): ClassInfo {
  return { grade: d.grade, classNo: d.classNo, subject: normalizeClassSubject(d.subject) };
}

type Props = {
  value: ClassDraft;
  onChange?: (next: ClassDraft) => void;
  /** 학교급별 최고 학년 (lib/class-info maxGradeForSchool) */
  maxGrade: number;
  /** 그 사용자의 최근 조합 (최대 3) — 없으면 "최근" 줄을 그리지 않는다 */
  recent?: readonly ClassInfo[];
  disabled?: boolean;
  /** 서버가 거절한 이유 (학년 범위 등) */
  error?: string | null;
  className?: string;
};

function sameDraft(a: ClassDraft, b: ClassInfo): boolean {
  return a.grade === b.grade && a.classNo === b.classNo && normalizeClassSubject(a.subject) === (b.subject ?? null);
}

/**
 * 수업 (선택) (디자인 1.25 class-select, 화면 4 사용일 아래): 라벨 "수업" + "선택" →
 * "최근" + recent-class-chip 최대 3 (누르면 세 칸 채움) → 학년 select · 반 select → 수업명 text-input(20자).
 * 셋 다 비워도 된다. 모바일 = 학년·반 반씩 한 줄 + 수업명 아래 전폭 / 데스크톱 = "수업 | [최근 칩] [학년▾][반▾][수업명]" 한 줄.
 */
export function ClassSelect({ value, onChange: onChangeProp, maxGrade, recent = [], disabled, error, className }: Props) {
  const onChange = (next: ClassDraft) => onChangeProp?.(next);
  const labelId = useId();
  const errorId = useId();
  const grades = Array.from({ length: maxGrade }, (_, i) => i + 1);
  const classes = Array.from({ length: CLASS_NO_MAX - CLASS_NO_MIN + 1 }, (_, i) => i + CLASS_NO_MIN);

  return (
    <div
      data-component="class-select"
      role="group"
      aria-labelledby={labelId}
      aria-describedby={error ? errorId : undefined}
      className={[styles.root, className ?? ""].filter(Boolean).join(" ")}
    >
      <div className={styles.labelRow} data-name="field-label-row">
        <span id={labelId} className={styles.label}>
          수업
        </span>
        <span className={styles.optional}>선택</span>
      </div>
      <div className={styles.fields} data-name="class-fields">
        {recent.length > 0 ? (
          <div className={styles.recentRow} data-name="recent-row">
            <span className={styles.caption}>최근</span>
            <div className={styles.chips}>
              {recent.map((c) => {
                const label = classLabelText(c);
                return (
                  <RecentClassChip
                    key={label}
                    label={label}
                    selected={sameDraft(value, c)}
                    disabled={disabled}
                    onClick={() => onChange({ grade: c.grade, classNo: c.classNo, subject: c.subject ?? "" })}
                  />
                );
              })}
            </div>
          </div>
        ) : null}
        <div className={styles.inputs}>
          <div className={styles.gradeRow} data-name="grade-class-row">
            <label className={styles.selectBox} data-empty={value.grade === null ? "" : undefined} data-name="grade-select">
              <span className={styles.srOnly}>학년</span>
              <select
                className={styles.select}
                value={value.grade ?? ""}
                disabled={disabled}
                onChange={(e) => onChange({ ...value, grade: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">학년</option>
                {grades.map((g) => (
                  <option key={g} value={g}>
                    {g}학년
                  </option>
                ))}
              </select>
              <Icon name="chevron-down" className={styles.caret} />
            </label>
            <label className={styles.selectBox} data-empty={value.classNo === null ? "" : undefined} data-name="class-number-select">
              <span className={styles.srOnly}>반</span>
              <select
                className={styles.select}
                value={value.classNo ?? ""}
                disabled={disabled}
                onChange={(e) => onChange({ ...value, classNo: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">반</option>
                {classes.map((c) => (
                  <option key={c} value={c}>
                    {c}반
                  </option>
                ))}
              </select>
              <Icon name="chevron-down" className={styles.caret} />
            </label>
          </div>
          <div data-component="text-input" className={styles.subjectBox}>
            <input
              className={styles.input}
              aria-label="수업명"
              name="class_subject"
              placeholder="수업명 (예: 통합과학)"
              maxLength={CLASS_SUBJECT_MAX}
              autoComplete="off"
              value={value.subject}
              readOnly={onChangeProp ? undefined : true}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, subject: e.target.value })}
            />
          </div>
        </div>
        {error ? (
          <p id={errorId} role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
