"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import styles from "./styles.module.css";

export type SelectOption = { value: string; label: string };

export type SelectFieldProps = {
  label: string;
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  defaultOpen?: boolean;
  name?: string;
};

/**
 * 학교 선택 단계 공용 선택 상자 (school-select-sido·region·school 이 감싼다).
 * 닫힘: 회색 상자 + 선택 시 하늘색 체크 + 화살표. 열림: 하늘색 테두리 + 아래 옵션 목록.
 */
export function SelectField({
  label,
  options,
  value,
  defaultValue,
  onChange,
  placeholder = "선택하세요",
  disabled,
  defaultOpen = false,
  name,
}: SelectFieldProps) {
  const [inner, setInner] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(defaultOpen);
  const current = value ?? inner;
  const selected = options.find((o) => o.value === current);
  const listId = useId();
  const labelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const choose = (v: string) => {
    if (value === undefined) setInner(v);
    onChange?.(v);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={styles.field}>
      <span id={labelId} className={styles.label}>
        {label}
      </span>
      <button
        type="button"
        className={[styles.box, selected ? styles.selected : "", open ? styles.open : ""].join(" ").trim()}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={labelId}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        <span className={selected ? styles.value : styles.placeholder}>{selected ? selected.label : placeholder}</span>
        <span className={styles.trail}>
          {selected ? <Icon name="check" className={styles.check} /> : null}
          <Icon name={open ? "chevron-up" : "chevron-down"} className={open ? styles.chevronOpen : styles.chevron} />
        </span>
      </button>
      {name ? <input type="hidden" name={name} value={current} /> : null}
      {open ? (
        <ul id={listId} role="listbox" aria-labelledby={labelId} className={styles.list}>
          {options.map((o) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === current}
              tabIndex={0}
              className={[styles.option, o.value === current ? styles.optionSelected : ""].join(" ").trim()}
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
          {options.length === 0 ? <li className={styles.empty}>목록이 없어요</li> : null}
        </ul>
      ) : null}
    </div>
  );
}
