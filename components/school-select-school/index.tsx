"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import styles from "./styles.module.css";

export type SchoolOption = {
  value: string;
  label: string;
  /** 줄 아래 회색 한 줄 ("충청북도 청주시") */
  sub?: string;
};

type Props = {
  label?: string;
  options: SchoolOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** 시트 제목 아래 한 줄 ("충청북도 청주시 · 고등학교 38곳") */
  context?: string;
  /**
   * 학교 0개 안내 (상태 14-no-school). 있으면 선택 상자 대신 이 자리에 무채색 안내를 둔다.
   * 예: "이 지역에 고등학교가 없어요 — 지역을 다시 골라 주세요"
   */
  emptyNote?: string;
  defaultOpen?: boolean;
};

/**
 * 학교 선택 단계: 학교 (시안 1.18 school-select-school · school-sheet / school-dropdown).
 * 닫힘 = 회색 선택 상자. 열림 = 모바일 하단 시트(제목·× 닫기), 데스크톱 상자 아래 드롭다운 —
 * 둘 다 맥락 한 줄 + 학교 이름 검색 + 학교 줄(이름 15 · 아래 시/도 지역 12 회색).
 * 목록은 /api/neis 응답에서만 채운다 (부르는 쪽이 넘긴다).
 */
export function SchoolSelectSchool({
  label = "학교",
  options,
  value,
  defaultValue,
  onChange,
  placeholder = "학교 선택",
  disabled,
  context,
  emptyNote,
  defaultOpen = false,
}: Props) {
  const [inner, setInner] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");
  const current = value ?? inner;
  const selected = options.find((o) => o.value === current);
  const labelId = useId();
  const listId = useId();
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const isOpen = open && !disabled && !emptyNote;

  const shown = useMemo(() => {
    const q = query.trim();
    return q ? options.filter((o) => o.label.includes(q)) : options;
  }, [options, query]);

  useEffect(() => {
    if (!isOpen) return;
    searchRef.current?.focus({ preventScroll: true });
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        boxRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  const toggle = () => {
    setQuery("");
    setOpen((o) => !o);
  };

  const choose = (v: string) => {
    if (value === undefined) setInner(v);
    onChange?.(v);
    setOpen(false);
    boxRef.current?.focus({ preventScroll: true });
  };

  return (
    <div data-component="school-select-school" ref={rootRef} className={styles.field}>
      <span id={labelId} className={styles.label}>
        {label}
      </span>
      {emptyNote ? (
        <p className={styles.note} role="status">
          <Icon name="info" className={styles.noteIcon} aria-hidden="true" />
          <span>{emptyNote}</span>
        </p>
      ) : (
        <div className={styles.anchor}>
          <button
            ref={boxRef}
            type="button"
            className={[styles.box, selected ? styles.selected : "", isOpen ? styles.open : ""].filter(Boolean).join(" ")}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            aria-controls={listId}
            aria-labelledby={labelId}
            disabled={disabled}
            onClick={toggle}
          >
            <span className={selected ? styles.value : styles.placeholder}>{selected ? selected.label : placeholder}</span>
            <span className={styles.trail}>
              {selected ? <Icon name="check" className={styles.check} /> : null}
              <Icon name={isOpen ? "chevron-up" : "chevron-down"} className={isOpen ? styles.chevronOpen : styles.chevron} />
            </span>
          </button>
          {isOpen ? (
            <div className={styles.sheet} role="dialog" aria-labelledby={titleId}>
              <div className={styles.header}>
                <div className={styles.heading}>
                  <h3 id={titleId} className={styles.title}>
                    학교 선택
                  </h3>
                  {context ? <p className={styles.context}>{context}</p> : null}
                </div>
                <button type="button" className={styles.close} aria-label="학교 선택 닫기" onClick={() => setOpen(false)}>
                  <Icon name="close" className={styles.closeIcon} />
                </button>
              </div>
              <label className={styles.search}>
                <Icon name="search" className={styles.searchIcon} aria-hidden="true" />
                <input
                  ref={searchRef}
                  type="search"
                  className={styles.searchInput}
                  placeholder="학교 이름 검색"
                  aria-label="학교 이름 검색"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <ul id={listId} role="listbox" aria-labelledby={labelId} className={styles.list}>
                {shown.map((o) => (
                  <li
                    key={o.value}
                    role="option"
                    aria-selected={o.value === current}
                    tabIndex={0}
                    // 줄 아래 "시/도 지역" 은 CSS(attr)로 그린다 — 옵션 글자는 학교 이름만
                    data-sub={o.sub}
                    className={[styles.row, o.value === current ? styles.rowSelected : ""].filter(Boolean).join(" ")}
                    onClick={() => choose(o.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        choose(o.value);
                      }
                    }}
                  >
                    {o.label}
                  </li>
                ))}
              </ul>
              {shown.length === 0 ? (
                <p className={styles.empty}>{options.length === 0 ? "목록이 없어요" : "검색한 이름의 학교가 없어요"}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
