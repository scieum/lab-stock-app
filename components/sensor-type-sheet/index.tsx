"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { SensorTypeGroup } from "@/components/sensor-type-group";
import { TextInput } from "@/components/text-input";
import { SENSOR_TYPE_GROUPS, initialOpenTypeGroups, searchSensorTypeGroups, type SensorType } from "@/lib/sensor-rules";
import styles from "./styles.module.css";

export const SENSOR_TYPE_SHEET_TEXT = {
  title: "종류 선택",
  search: "종류 검색",
  empty: "맞는 종류가 없어요",
  close: "닫기",
} as const;

type Props = {
  /** 지금 고른 종류 (그 묶음이 처음부터 펼침) */
  value: SensorType | "";
  /** 하나 고르면 바로 닫는다 (부르는 쪽이 onClose 도 함께 처리) */
  onPick?: (type: SensorType) => void;
  onClose?: () => void;
  /**
   * auto(기본) = 모바일 바텀시트(머리 "종류 선택" + ×) · 데스크톱 고르기 칸 아래 드롭다운(머리 없음, 432 폭).
   * sheet · dropdown = 폭과 상관없이 그 모양(갤러리).
   */
  layout?: "auto" | "sheet" | "dropdown";
  /** true(기본) = 떠 있는 자리(fixed 시트 · absolute 드롭다운). false = 제자리(갤러리) */
  floating?: boolean;
  /** 처음 펼칠 묶음 (갤러리 예시). 없으면 고른 종류가 있는 묶음 */
  defaultOpenGroups?: readonly string[];
  /** 처음 검색 글자 (갤러리 예시) */
  defaultQuery?: string;
};

/**
 * 센서 종류 고르기 시트 (rules 1.28 sensor.type_select, 시안 17-type-mobile · 17-type-desktop sensor-type-sheet):
 * 맨 위 검색 text-input("종류 검색") → sensor-type-group 4줄(물리 12 · 화학 9 · 생명·지구 3 · 장비 3), 기본 접힘.
 * 누른 묶음만 펼침(여러 묶음 동시에 가능), 고른 종류가 있는 묶음은 처음부터 펼침.
 * 검색 글자가 있으면 맞는 chip 이 있는 묶음만 펼쳐 맞는 chip 만, 없으면 muted "맞는 종류가 없어요". 27종을 한꺼번에 펼치지 않는다.
 */
const LAYOUT_CLASS = { auto: styles.asAuto, sheet: styles.asSheet, dropdown: styles.asDropdown } as const;

export function SensorTypeSheet({ value, onPick, onClose, layout = "auto", floating = true, defaultOpenGroups, defaultQuery = "" }: Props) {
  const [query, setQuery] = useState(defaultQuery);
  const [open, setOpen] = useState<string[]>(() => [...(defaultOpenGroups ?? initialOpenTypeGroups(value ? [value] : []))]);
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!floating) return;
    rootRef.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
  }, [floating]);

  useEffect(() => {
    if (!onClose || !floating) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, floating]);

  const searching = query.trim() !== "";
  const groups = searching ? searchSensorTypeGroups(query) : SENSOR_TYPE_GROUPS;
  const toggle = (title: string) => setOpen((o) => (o.includes(title) ? o.filter((t) => t !== title) : [...o, title]));

  return (
    <div
      ref={rootRef}
      data-component="sensor-type-sheet"
      role="dialog"
      aria-labelledby={titleId}
      className={[styles.sheet, LAYOUT_CLASS[layout], floating ? styles.floating : ""].filter(Boolean).join(" ")}
    >
      <div className={styles.head} data-name="sheet-head">
        <h2 id={titleId} className={styles.title}>
          {SENSOR_TYPE_SHEET_TEXT.title}
        </h2>
        {onClose ? (
          <button type="button" className={styles.close} aria-label={SENSOR_TYPE_SHEET_TEXT.close} onClick={onClose}>
            <Icon name="close" className={styles.closeIcon} />
          </button>
        ) : null}
      </div>
      <div className={styles.body} data-name="sheet-body">
        <TextInput
          icon="search"
          placeholder={SENSOR_TYPE_SHEET_TEXT.search}
          aria-label={SENSOR_TYPE_SHEET_TEXT.search}
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className={styles.groups} data-name="type-groups">
          {groups.length === 0 ? (
            <p className={styles.empty} role="status">
              {SENSOR_TYPE_SHEET_TEXT.empty}
            </p>
          ) : (
            groups.map((g, i) => {
              const full = SENSOR_TYPE_GROUPS.find((x) => x.title === g.title);
              return (
                <SensorTypeGroup
                  key={g.title}
                  title={g.title}
                  types={g.types}
                  count={String(full?.types.length ?? g.types.length)}
                  open={searching || open.includes(g.title)}
                  onToggle={searching ? undefined : () => toggle(g.title)}
                  selected={value ? [value] : []}
                  onPick={onPick}
                  first={i === 0}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
