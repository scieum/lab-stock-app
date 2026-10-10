"use client";

import { useMemo, useState } from "react";
import { ButtonPrimary } from "@/components/button-primary";
import { Icon } from "@/components/icons";
import { SheetPanel } from "@/components/sheet-panel";
import {
  USAGE_BATCH_TEXT,
  currentStockText,
  matchReagentName,
  orderPickerReagents,
  pickLabel,
} from "@/lib/usage-batch-rules";
import styles from "./styles.module.css";

export type PickerReagent = { id: string; name: string; stock: number; unit: string };

type CommonProps = {
  /** 자기 학교 시약 (보관된 시약은 서버가 이미 뺐다) */
  reagents: readonly PickerReagent[];
  /** 최근 사용한 시약 id (최신순) — 목록 맨 위 */
  recentIds?: readonly string[];
  /** 이미 담은 시약 — "담음" 회색, 고를 수 없음 */
  addedIds: ReadonlySet<string>;
  /** 더 담을 수 있는 수 (30 − 담은 수) */
  remaining?: number;
};

function useOrdered(reagents: readonly PickerReagent[], recentIds: readonly string[], query: string) {
  return useMemo(() => {
    const ordered = orderPickerReagents(reagents, recentIds);
    return ordered.filter((r) => matchReagentName(r.name, query));
  }, [reagents, recentIds, query]);
}

function CheckCircle({ on, muted = false }: { on: boolean; muted?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={[styles.check, on ? styles.checkOn : "", muted ? styles.checkMuted : ""].filter(Boolean).join(" ")}
      data-name={on ? "check-circle-on" : "check-circle"}
    >
      {on ? <Icon name="check" className={styles.checkIcon} /> : null}
    </span>
  );
}

type SheetProps = CommonProps & {
  /** 고른 시약 id 들을 담는다 ("{N}개 담기") */
  onAdd?: (ids: string[]) => void;
  onClose?: () => void;
  id?: string;
  /** false = 제자리 (갤러리) */
  sheet?: boolean;
  /** 갤러리 예시 — 처음부터 고른 상태 */
  initialSelected?: readonly string[];
};

/**
 * 모바일 시약 고르기 (디자인 1.25 reagent-picker, 4-picker-mobile): tab-bar 위 바텀시트 —
 * "시약 추가" + × → 검색 text-input → caption "최근 사용한 시약" → 행(시약명 · "현재 120 mL" + 체크) 여러 개 고르기
 * (고른 행 = highlight-soft, 이미 담은 시약 = "담음" 회색) → button-primary "{N}개 담기"(0개면 비활성).
 */
export function ReagentPickerSheet({
  reagents,
  recentIds = [],
  addedIds,
  remaining = Infinity,
  onAdd,
  onClose,
  id,
  sheet = true,
  initialSelected = [],
}: SheetProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>(() => [...initialSelected]);
  const rows = useOrdered(reagents, recentIds, query);
  const recent = new Set(recentIds);
  const showRecentCaption = query.trim() === "" && rows.some((r) => recent.has(r.id));
  const full = selected.length >= remaining;

  const toggle = (rid: string) =>
    setSelected((cur) => (cur.includes(rid) ? cur.filter((x) => x !== rid) : full ? cur : [...cur, rid]));

  return (
    <div id={id} className={styles.sheetWrap}>
      <SheetPanel
        data-component="reagent-picker"
        title={USAGE_BATCH_TEXT.add}
        onClose={onClose}
        sheet={sheet}
        footer={
          <ButtonPrimary className={styles.pickButton} disabled={selected.length === 0} onClick={() => onAdd?.(selected)}>
            {pickLabel(selected.length)}
          </ButtonPrimary>
        }
      >
        <div className={styles.sheetBody}>
          <div data-component="text-input" className={styles.searchBox}>
            <Icon name="search" className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              type="search"
              aria-label="시약명 검색"
              placeholder="시약명 검색"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {showRecentCaption ? <p className={styles.caption}>{USAGE_BATCH_TEXT.recent}</p> : null}
          {rows.length === 0 ? (
            <p className={styles.empty} role="status">
              {reagents.length === 0 ? "등록된 시약이 없어요" : "검색 결과가 없어요"}
            </p>
          ) : (
            <ul className={styles.list} aria-label="시약 목록" data-name="picker-list">
              {rows.map((r) => {
                const added = addedIds.has(r.id);
                const on = selected.includes(r.id);
                return (
                  <li key={r.id} className={styles.item}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={added || on}
                      aria-disabled={added || (!on && full) ? true : undefined}
                      className={[styles.row, on ? styles.rowOn : "", added ? styles.rowAdded : ""].filter(Boolean).join(" ")}
                      onClick={() => {
                        if (!added) toggle(r.id);
                      }}
                      data-name="picker-row"
                    >
                      <span className={styles.nameCol}>
                        <span className={styles.name}>{r.name}</span>
                        <span className={styles.stock}>{currentStockText(r.stock, r.unit)}</span>
                      </span>
                      <span className={styles.checkHit}>
                        {added ? <span className={styles.addedCaption}>{USAGE_BATCH_TEXT.added}</span> : <CheckCircle on={on} />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetPanel>
    </div>
  );
}

type DropdownProps = CommonProps & {
  /** 검색 칸(reagent-add)의 글자 */
  query: string;
  /** 이번에 열고 나서 담은 시약 — 체크 표시, 다시 누르면 뺀다 */
  sessionIds: ReadonlySet<string>;
  /** 행을 누르면 바로 담기 / (이번에 담은 것) 빼기 */
  onToggle?: (id: string) => void;
  onClose?: () => void;
  id?: string;
};

/**
 * 데스크톱 시약 고르기 (디자인 1.25 reagent-picker, 4-picker-desktop): 검색 칸 아래 드롭다운 —
 * 흰 바탕 · 회색 테두리 · radius 24 · 안쪽 8. caption "최근 사용한 시약" → 행(체크 · 시약명 15/600 · "현재 120 mL"),
 * 누르면 바로 담긴다(체크 · highlight-soft). 이미 담은 시약 = 회색 이름 + "담음". 아래 "닫기".
 */
export function ReagentPickerDropdown({
  reagents,
  recentIds = [],
  addedIds,
  remaining = Infinity,
  query,
  sessionIds,
  onToggle,
  onClose,
  id,
}: DropdownProps) {
  const rows = useOrdered(reagents, recentIds, query);
  const recent = new Set(recentIds);
  const showRecentCaption = query.trim() === "" && rows.some((r) => recent.has(r.id));
  return (
    <div id={id} data-component="reagent-picker" className={styles.dropdown}>
      {showRecentCaption ? (
        <div className={styles.captionRow} data-name="caption-row">
          <p className={styles.caption}>{USAGE_BATCH_TEXT.recent}</p>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <p className={styles.dropdownEmpty} role="status">
          {reagents.length === 0 ? "등록된 시약이 없어요" : "검색 결과가 없어요"}
        </p>
      ) : (
        <ul className={styles.dropdownList} role="listbox" aria-multiselectable="true" aria-label="시약 목록" data-name="picker-list">
          {rows.map((r) => {
            const mine = sessionIds.has(r.id);
            const added = addedIds.has(r.id) && !mine;
            const blocked = !mine && !added && remaining <= 0;
            return (
              <li
                key={r.id}
                role="option"
                aria-selected={mine || added}
                aria-disabled={added || blocked ? true : undefined}
                tabIndex={-1}
                className={[styles.dropdownRow, mine ? styles.rowOn : "", added ? styles.rowAdded : ""].filter(Boolean).join(" ")}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (!added && !blocked) onToggle?.(r.id);
                }}
                data-name="picker-row"
              >
                <CheckCircle on={mine} muted={added} />
                <span className={styles.dropdownName}>{r.name}</span>
                {added ? (
                  <span className={styles.addedCaption}>{USAGE_BATCH_TEXT.added}</span>
                ) : (
                  <span className={styles.stock}>{currentStockText(r.stock, r.unit)}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className={styles.closeRow} data-name="close-row">
        <button type="button" className={styles.closeLink} onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}
