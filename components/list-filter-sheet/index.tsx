"use client";

import { useEffect, useId, useRef } from "react";
import { ButtonOutline } from "@/components/button-outline";
import { ButtonPrimary } from "@/components/button-primary";
import { Icon } from "@/components/icons";
import { StorageClassChip } from "@/components/storage-class-chip";
import { TextInputSelect } from "@/components/text-input";
import {
  CLASS_FILTER_VALUES,
  LIST_SORT_OPTIONS,
  NO_CLASS,
  NO_CLASS_LABEL,
  cabinetSlotValues,
  slotValueLabel,
  toggleListFilterClass,
  type FilterCabinet,
  type ListFilter,
} from "@/lib/reagent-list-filter";
import styles from "./styles.module.css";

const ALL = "";

type Props = {
  id?: string;
  /** 시트 안에서 고르는 중인 값 (적용 전) */
  value: ListFilter;
  /** 없으면 보기 전용 (갤러리 정적 예시) */
  onChange?: (next: ListFilter) => void;
  /** 학교 시약장 (보관 위치 드롭다운) */
  cabinets: readonly FilterCabinet[];
  /** 지금 고른 값으로 보일 시약 수 ("{N}종 보기") */
  resultCount: number;
  /** "{N}종 보기" */
  onApply?: () => void;
  /** "초기화" — 고르는 중인 값을 기본으로 */
  onReset?: () => void;
  /** × · Esc */
  onClose?: () => void;
  /** true(기본) = 모바일 tab-bar 위 하단 시트 · 데스크톱 필터 버튼 아래 드롭다운. false = 제자리(갤러리) */
  sheet?: boolean;
};

/** 켜고 끄는 줄 (시안 toggle-row: 라벨 15 + 44 × 24 스위치) */
function ToggleRow({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const labelId = useId();
  return (
    <div className={styles.toggleRow}>
      <span id={labelId} className={styles.toggleLabel}>
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        disabled={disabled}
        className={[styles.toggle, checked ? styles.toggleOn : ""].filter(Boolean).join(" ")}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.knob} />
      </button>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section className={styles.section} aria-labelledby={id}>
      <div className={styles.sectionHeader}>
        <h3 id={id} className={styles.sectionTitle}>
          {title}
        </h3>
        {hint ? <span className={styles.hint}>{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * 시약 목록 필터 시트 (디자인 1.17 list-filter-sheet, d7 §16):
 * 제목 "필터" + × → 정렬(이름순·재고 적은 순·최근 입고순) → 보관 분류(storage-class-chip 8종 + "분류 없음", 여러 개) →
 * 보관 위치(시약장 → 칸, "칸 없음만") → "MSDS 없는 시약만" → 아래 "초기화" + "{N}종 보기".
 * 모바일 = tab-bar 위 하단 시트, 데스크톱 = 필터 버튼 아래 400 폭 드롭다운 (부르는 쪽이 버튼 옆에 둔다). 딤·그림자 없음.
 * 고르는 값은 부르는 쪽이 쥔다(value · onChange) — "{N}종 보기"를 눌러야 목록에 적용된다.
 */
export function ListFilterSheet({ id, value, onChange: change, cabinets, resultCount, onApply, onReset, onClose, sheet = true }: Props) {
  const titleId = useId();
  const onChange = (next: ListFilter) => change?.(next);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sheet) return;
    const el = rootRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    // 데스크톱 드롭다운(버튼 아래 absolute): 아래가 화면 밖으로 나가면 페이지를 그만큼 올려 버튼 줄까지 한눈에 보이게 한다.
    // 드롭다운 높이는 화면 높이까지만(CSS) — 화면이 내용보다 낮을 때만 몸통이 따로 스크롤된다. 모바일 하단 시트(fixed)는 그대로.
    if (getComputedStyle(el).position !== "absolute") return;
    const r = el.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(el).getPropertyValue("--list-filter-gap")) || 0;
    const over = r.bottom - (window.innerHeight - gap);
    if (over > 0) window.scrollBy({ top: Math.max(0, Math.min(over, r.top - gap)) });
  }, [sheet]);

  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const cabinet = cabinets.find((c) => c.id === value.cabinetId) ?? null;
  const slotOptions = cabinet
    ? [{ value: ALL, label: "모든 칸" }, ...cabinetSlotValues(cabinet).map((s) => ({ value: s, label: slotValueLabel(s, cabinet.doorType) }))]
    : [{ value: ALL, label: "모든 칸" }];
  const cabinetOptions = [{ value: ALL, label: "모든 시약장" }, ...cabinets.map((c) => ({ value: c.id, label: c.label }))];

  return (
    <div
      ref={rootRef}
      id={id}
      data-component="list-filter-sheet"
      role="dialog"
      aria-modal={false}
      aria-labelledby={titleId}
      tabIndex={-1}
      className={[styles.panel, sheet ? styles.sheet : ""].filter(Boolean).join(" ")}
    >
      <div className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          필터
        </h2>
        {onClose ? (
          <button type="button" className={styles.close} aria-label="필터 닫기" onClick={onClose}>
            <Icon name="close" className={styles.closeIcon} />
          </button>
        ) : null}
      </div>

      <div className={styles.body}>
        <Section title="정렬">
          <div className={styles.options} role="radiogroup" aria-label="정렬">
            {LIST_SORT_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={value.sort === o.value}
                className={[styles.option, value.sort === o.value ? styles.optionOn : ""].filter(Boolean).join(" ")}
                onClick={() => onChange({ ...value, sort: o.value })}
              >
                {o.label}
              </button>
            ))}
          </div>
        </Section>

        <Section title="보관 분류" hint="여러 개 고를 수 있어요">
          <div className={styles.options}>
            {CLASS_FILTER_VALUES.map((c) => (
              <StorageClassChip
                key={c}
                size="filter"
                label={c === NO_CLASS ? NO_CLASS_LABEL : c}
                selected={value.classes.includes(c)}
                onToggle={() => onChange(toggleListFilterClass(value, c))}
              />
            ))}
          </div>
        </Section>

        <Section title="보관 위치">
          <TextInputSelect
            aria-label="시약장"
            options={cabinetOptions}
            value={value.noSlot ? ALL : (value.cabinetId ?? ALL)}
            disabled={value.noSlot || cabinets.length === 0}
            onChange={(e) => onChange({ ...value, cabinetId: e.target.value || null, slot: null })}
          />
          <TextInputSelect
            aria-label="칸"
            options={slotOptions}
            value={value.noSlot ? ALL : (value.slot ?? ALL)}
            disabled={value.noSlot || !cabinet}
            onChange={(e) => onChange({ ...value, slot: e.target.value || null })}
          />
          <ToggleRow
            label="칸 없음만"
            checked={value.noSlot}
            onChange={(on) => onChange({ ...value, noSlot: on, cabinetId: on ? null : value.cabinetId, slot: on ? null : value.slot })}
          />
        </Section>

        <ToggleRow label="MSDS 없는 시약만" checked={value.noMsds} onChange={(on) => onChange({ ...value, noMsds: on })} />
      </div>

      <div className={styles.footer}>
        <ButtonOutline className={styles.reset} onClick={onReset}>
          초기화
        </ButtonOutline>
        <ButtonPrimary className={styles.apply} onClick={onApply}>
          {resultCount}종 보기
        </ButtonPrimary>
      </div>
    </div>
  );
}
