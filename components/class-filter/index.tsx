"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ButtonPillSoft } from "@/components/button-pill-soft";
import { Icon } from "@/components/icons";
import { CLASS_NO_MAX, CLASS_NO_MIN, classFilterLabel, type ClassFilter } from "@/lib/class-info";
import styles from "./styles.module.css";

type Props = {
  value: ClassFilter;
  onChange?: (next: ClassFilter) => void;
  /** 학교급별 최고 학년 */
  maxGrade: number;
  disabled?: boolean;
  /** 갤러리 예시 — 처음부터 열림 · 제자리 */
  defaultOpen?: boolean;
  inline?: boolean;
  className?: string;
};

/**
 * 반 필터 (디자인 1.25 class-filter, 화면 10 기록 목록 위): button-pill-soft "반: 전체 ▾" →
 * 모바일 = tab-bar 위 바텀시트 · 데스크톱 = 버튼 아래 드롭다운. 학년(전체 · 1~) → 반(학년 전체 · 1~20).
 * 학년을 고르면 그 학년 전체로 바로 걸리고 반 줄이 열린다. 반을 고르거나 "전체"를 누르면 닫힌다.
 */
export function ClassFilterButton({ value, onChange, maxGrade, disabled, defaultOpen = false, inline = false, className }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [grade, setGrade] = useState<number | null>(value.grade);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const titleId = useId();

  // 밖에서 값이 바뀌면(주소 이동) 고르던 학년도 맞춘다
  const [seen, setSeen] = useState(value.grade);
  if (seen !== value.grade) {
    setSeen(value.grade);
    setGrade(value.grade);
  }

  useEffect(() => {
    if (!open || inline) return;
    const outside = (e: Event) => {
      if (e.target instanceof Node && wrapRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus({ preventScroll: true });
    };
    const timer = window.setTimeout(() => document.addEventListener("pointerdown", outside), 0);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, inline]);

  const grades = Array.from({ length: maxGrade }, (_, i) => i + 1);
  const classes = Array.from({ length: CLASS_NO_MAX - CLASS_NO_MIN + 1 }, (_, i) => i + CLASS_NO_MIN);

  const choose = (next: ClassFilter, close: boolean) => {
    onChange?.(next);
    if (close && !inline) {
      setOpen(false);
      buttonRef.current?.focus({ preventScroll: true });
    }
  };

  return (
    <div ref={wrapRef} data-component="class-filter" className={[styles.wrap, className ?? ""].filter(Boolean).join(" ")}>
      <button
        ref={buttonRef}
        type="button"
        data-component="button-pill-soft"
        className={styles.button}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{classFilterLabel(value)}</span>
        <Icon name="chevron-down" className={styles.caret} />
      </button>
      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-labelledby={titleId}
          className={[styles.panel, inline ? styles.inline : ""].filter(Boolean).join(" ")}
        >
          <div className={styles.panelHead}>
            <h2 id={titleId} className={styles.title}>
              반 고르기
            </h2>
            {inline ? null : (
              <button
                type="button"
                className={styles.close}
                aria-label="닫기"
                onClick={() => {
                  setOpen(false);
                  buttonRef.current?.focus({ preventScroll: true });
                }}
              >
                <Icon name="close" className={styles.closeIcon} />
              </button>
            )}
          </div>
          <div className={styles.group} role="group" aria-label="학년">
            <p className={styles.groupTitle}>학년</p>
            <div className={styles.chips}>
              <ButtonPillSoft
                selected={grade === null}
                onClick={() => {
                  setGrade(null);
                  choose({ grade: null, classNo: null }, true);
                }}
              >
                전체
              </ButtonPillSoft>
              {grades.map((g) => (
                <ButtonPillSoft
                  key={g}
                  selected={grade === g}
                  onClick={() => {
                    setGrade(g);
                    choose({ grade: g, classNo: null }, false);
                  }}
                >
                  {g}학년
                </ButtonPillSoft>
              ))}
            </div>
          </div>
          {grade !== null ? (
            <div className={styles.group} role="group" aria-label="반">
              <p className={styles.groupTitle}>반</p>
              <div className={styles.chips}>
                <ButtonPillSoft selected={value.grade === grade && value.classNo === null} onClick={() => choose({ grade, classNo: null }, true)}>
                  학년 전체
                </ButtonPillSoft>
                {classes.map((c) => (
                  <ButtonPillSoft
                    key={c}
                    selected={value.grade === grade && value.classNo === c}
                    onClick={() => choose({ grade, classNo: c }, true)}
                  >
                    {c}반
                  </ButtonPillSoft>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
