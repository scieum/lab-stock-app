"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { TextInput } from "@/components/text-input";
import { SENSOR_MAKERS, SENSOR_MAKER_GROUPS, SENSOR_MAKER_MAX, SENSOR_TEXT } from "@/lib/sensor-rules";
import styles from "./styles.module.css";

type Props = {
  value: string;
  onChange?: (v: string) => void;
  error?: string;
  /** 갤러리 — 처음부터 목록이 열림 */
  defaultOpen?: boolean;
  /** true(기본) = 모바일 하단 시트 · 데스크톱 상자 아래 드롭다운. false = 제자리(갤러리) */
  floating?: boolean;
};

/**
 * 센서 회사 고르기 (디자인 1.26 sensor.maker_select, sensor-maker-select): 라벨 "회사" → 고르기 상자(입력 상자 모양 + ▾).
 * 누르면 모바일 바텀시트 / 데스크톱 드롭다운: 맨 위 검색 text-input, 묶음 제목 "센서" · "현미경", 맨 끝 "직접 입력"(고르면 text-input).
 * 고른 항목 = highlight-soft.
 */
export function SensorMakerSelect({ value, onChange, error, defaultOpen = false, floating = true }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");
  const [direct, setDirect] = useState(() => value !== "" && !SENSOR_MAKERS.includes(value));
  const wrapRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLButtonElement>(null);
  const directRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const listId = useId();
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

  const close = (focusBox = true) => {
    setOpen(false);
    setQuery("");
    if (focusBox) boxRef.current?.focus({ preventScroll: true });
  };

  const pick = (maker: string) => {
    setDirect(false);
    onChange?.(maker);
    close();
  };

  const pickDirect = () => {
    setDirect(true);
    if (SENSOR_MAKERS.includes(value)) onChange?.("");
    close(false);
    window.requestAnimationFrame(() => directRef.current?.querySelector("input")?.focus());
  };

  const q = query.trim().toLowerCase();
  const groups = SENSOR_MAKER_GROUPS.map((g) => ({ ...g, makers: g.makers.filter((m) => !q || m.toLowerCase().includes(q)) })).filter(
    (g) => g.makers.length > 0,
  );
  const shown = direct ? SENSOR_TEXT.makerDirect : value || SENSOR_TEXT.makerPlaceholder;

  return (
    <div
      ref={wrapRef}
      data-component="sensor-maker-select"
      className={styles.field}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      }}
    >
      <span id={labelId} className={styles.label}>
        회사
      </span>
      <div className={styles.anchor}>
        <button
          ref={boxRef}
          type="button"
          className={[styles.box, !value && !direct ? styles.placeholder : ""].filter(Boolean).join(" ")}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-labelledby={labelId}
          aria-describedby={error ? errorId : undefined}
          onClick={() => {
            if (open) {
              close(false);
              return;
            }
            setOpen(true);
            if (floating) window.requestAnimationFrame(() => wrapRef.current?.querySelector<HTMLInputElement>("[role='dialog'] input")?.focus());
          }}
        >
          <span className={styles.value}>{shown}</span>
          <Icon name="caret-down" className={styles.caret} />
        </button>
        {open ? (
          <div className={[styles.panel, floating ? styles.floating : ""].filter(Boolean).join(" ")} role="dialog" aria-label="회사 고르기">
            <TextInput
              icon="search"
              placeholder={SENSOR_TEXT.makerSearch}
              aria-label={SENSOR_TEXT.makerSearch}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div id={listId} role="listbox" aria-labelledby={labelId} className={styles.list}>
              {groups.map((g) => (
                <div key={g.title} role="group" aria-label={g.title} className={styles.group}>
                  <p className={styles.groupTitle} aria-hidden="true">
                    {g.title}
                  </p>
                  {g.makers.map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="option"
                      aria-selected={!direct && value === m}
                      className={[styles.option, !direct && value === m ? styles.selected : ""].filter(Boolean).join(" ")}
                      onClick={() => pick(m)}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              ))}
              <button
                type="button"
                role="option"
                aria-selected={direct}
                className={[styles.option, styles.direct, direct ? styles.selected : ""].filter(Boolean).join(" ")}
                onClick={pickDirect}
              >
                {SENSOR_TEXT.makerDirect}
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {direct ? (
        <div ref={directRef}>
          <TextInput
            aria-label="회사 직접 입력"
            placeholder="회사 이름"
            maxLength={SENSOR_MAKER_MAX}
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
          />
        </div>
      ) : null}
      {error ? (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
