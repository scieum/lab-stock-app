"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BulkDeleteFlow } from "@/components/bulk-action-bar/flow";
import { ButtonOutline } from "@/components/button-outline";
import { EmptyStateCard } from "@/components/ex-empty-state-card";
import { InventorySwitch } from "@/components/inventory-switch";
import { ListFilterButton } from "@/components/list-filter-button";
import { ListSelectToggle } from "@/components/list-select-toggle";
import { SensorAdd, SensorAddMenuButton } from "@/components/sensor-add";
import { SENSOR_DOC_PATH, SensorAddChoiceSheet } from "@/components/sensor-doc-add";
import { SensorList } from "@/components/sensor-list";
import { SensorRow } from "@/components/sensor-row";
import { TextInput } from "@/components/text-input";
import {
  EMPTY_SENSOR_FILTER,
  SENSOR_TEXT,
  applySensorFilter,
  sensorFilterCount,
  writeSensorFilter,
  type SensorFilter,
} from "@/lib/sensor-rules";
import type { SensorItem } from "@/lib/supabase/sensors";
import { useBulkSelect } from "@/lib/use-bulk-select";
import { archiveSensorsAction } from "../actions";
import { SensorFilterPanel } from "./filter-panel";
import { sensorDetailHref, sensorNewHref, type SensorBase } from "./hrefs";
import styles from "./sensors.module.css";
import { useSensorHighlight } from "./use-highlight";

type Props = {
  items: SensorItem[];
  /** 교사·admin (등록 · 선택 · 삭제). 학생 · 둘러보기 false */
  canEdit: boolean;
  base?: SensorBase;
  initialQuery: string;
  initialFilter: SensorFilter;
};

/** 주소창(?q · ?type · ?maker · ?status)을 화면 상태와 맞춘다 */
function syncUrl(q: string, f: SensorFilter) {
  const url = new URL(window.location.href);
  if (q) url.searchParams.set("q", q);
  else url.searchParams.delete("q");
  writeSensorFilter(url.searchParams, f);
  url.searchParams.delete("page");
  window.history.replaceState(window.history.state, "", url);
}

/** 학교 센서에 쓰인 회사 (필터 칩) */
export function usedMakers(items: readonly SensorItem[]): string[] {
  return Array.from(new Set(items.map((s) => s.maker))).sort((a, b) => a.localeCompare(b, "ko"));
}

/**
 * 화면 17 센서 목록 — 모바일 (디자인 1.28 17-mobile): inventory-switch "시약 | 센서"(센서 활성) → list-head("센서 N개" + 선택 +
 * sensor-add "+ 등록" → 작은 바텀시트 "서류로 등록 / 직접 입력", rules sensor.add_mobile) →
 * 검색 + list-filter-button → sensor-list(sensor-row 카드). 0개면 ex-empty-state-card(+ sensor-add, 교사·admin).
 * 선택 모드(교사·admin): 머리 = 취소 · N개 선택됨 · 전체 선택, 행 왼쪽 select-checkbox, bulk-action-bar → 확인 → 토스트.
 */
export function SensorBrowser({ items, canEdit, base = "", initialQuery, initialFilter }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [applied, setApplied] = useState<SensorFilter>(initialFilter);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SensorFilter>(initialFilter);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const [choosing, setChoosing] = useState(false);
  const fresh = useSensorHighlight();
  const select = useBulkSelect();

  const closeChoice = (focus = true) => {
    setChoosing(false);
    if (focus) addRef.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!choosing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      setChoosing(false);
      addRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [choosing]);

  const visible = useMemo(() => applySensorFilter(items, query, applied), [items, query, applied]);
  const draftCount = useMemo(() => (open ? applySensorFilter(items, query, draft).length : 0), [open, items, query, draft]);
  const makers = useMemo(() => usedMakers(items), [items]);
  const filterCount = sensorFilterCount(applied);
  const selected = visible.filter((s) => select.ids.has(s.id)).map((s) => ({ id: s.id, name: s.name }));
  const listParams = new URLSearchParams();
  if (query.trim()) listParams.set("q", query.trim());
  writeSensorFilter(listParams, applied);

  const apply = (next: SensorFilter) => {
    setApplied(next);
    syncUrl(query.trim(), next);
  };

  const closeSheet = (focus = true) => {
    setOpen(false);
    if (focus) buttonRef.current?.focus({ preventScroll: true });
  };

  if (items.length === 0) {
    return (
      <div className={styles.page}>
        <InventorySwitch active="sensors" base={base} />
        <div className={styles.listBody}>
          <div className={styles.listHead}>
            <h1 className={styles.heading}>센서 0개</h1>
          </div>
          <div className={styles.emptyArea}>
            <EmptyStateCard variant="outlined" icon="sensor" iconTone="ink" fullActions title={SENSOR_TEXT.emptyTitle} description={SENSOR_TEXT.emptyBody}>
              {canEdit ? <SensorAdd href={sensorNewHref(listParams)} fullWidth /> : null}
            </EmptyStateCard>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <InventorySwitch active="sensors" base={base} />
      <div className={styles.listBody}>
        {canEdit && select.selecting ? (
          <ListSelectToggle
            selecting
            count={selected.length}
            capped={select.capped}
            onCancel={select.cancel}
            onSelectAll={() => select.selectAll(visible.map((s) => s.id))}
          />
        ) : (
          <div className={styles.listHead}>
            <h1 className={styles.heading}>{`센서 ${visible.length}개`}</h1>
            {canEdit ? (
              <div className={styles.headActions}>
                <ListSelectToggle selecting={false} onStart={select.start} disabled={visible.length === 0} />
                <SensorAddMenuButton
                  ref={addRef}
                  label={SENSOR_TEXT.addShort}
                  expanded={choosing}
                  onClick={() => (choosing ? closeChoice(false) : setChoosing(true))}
                />
              </div>
            ) : null}
          </div>
        )}

        <div className={styles.searchRow}>
          <TextInput
            className={styles.search}
            type="search"
            icon="search"
            placeholder={SENSOR_TEXT.searchPlaceholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              syncUrl(e.target.value.trim(), applied);
            }}
          />
          <ListFilterButton
            ref={buttonRef}
            count={filterCount}
            expanded={open}
            onClick={() => {
              if (open) closeSheet(false);
              else {
                setDraft(applied);
                setOpen(true);
              }
            }}
          />
        </div>

        {visible.length === 0 ? (
          <EmptyStateCard variant="outlined" title={SENSOR_TEXT.filterEmptyTitle} description="검색어나 필터를 바꿔 보세요">
            {filterCount > 0 ? <ButtonOutline onClick={() => apply(EMPTY_SENSOR_FILTER)}>필터 지우기</ButtonOutline> : null}
          </EmptyStateCard>
        ) : (
          <SensorList variant="mobile">
            {visible.map((s) => (
              <li key={s.id}>
                <SensorRow
                  sensor={s}
                  href={sensorDetailHref(s.id, listParams, base)}
                  selectMode={canEdit && select.selecting}
                  selected={select.ids.has(s.id)}
                  onToggle={() => select.toggle(s.id)}
                  fresh={fresh.has(s.id)}
                />
              </li>
            ))}
          </SensorList>
        )}
      </div>

      {open ? (
        <SensorFilterPanel
          value={draft}
          onChange={setDraft}
          makers={makers}
          resultCount={draftCount}
          onReset={() => setDraft(EMPTY_SENSOR_FILTER)}
          onApply={() => {
            apply(draft);
            closeSheet();
          }}
          onClose={() => closeSheet()}
        />
      ) : null}

      {canEdit && choosing ? (
        <>
          <button type="button" className={styles.choiceScrim} aria-label="닫기" tabIndex={-1} onClick={() => closeChoice()} />
          <SensorAddChoiceSheet docHref={SENSOR_DOC_PATH} directHref={sensorNewHref(listParams)} onClose={() => closeChoice()} />
        </>
      ) : null}

      {canEdit ? (
        <BulkDeleteFlow kind="sensor" selecting={select.selecting} selected={selected} run={archiveSensorsAction} onDone={select.cancel} />
      ) : null}
    </div>
  );
}
