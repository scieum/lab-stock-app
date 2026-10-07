"use client";

import { useState } from "react";
import { ButtonOutline } from "@/components/button-outline";
import { EmptyStateCard } from "@/components/ex-empty-state-card";
import { FilterChipRow } from "@/components/filter-chip-row";
import { ListFilterButton } from "@/components/list-filter-button";
import { ListFilterSheet } from "@/components/list-filter-sheet";
import { PastDateNote } from "@/components/past-date-note";
import { ReagentRow } from "@/components/reagent-row";
import { UsageDate } from "@/components/usage-date";
import {
  EMPTY_LIST_FILTER,
  applyListFilter,
  listFilterChips,
  removeListFilterChip,
  type ListFilter,
} from "@/lib/reagent-list-filter";
import { pastDateNoteText } from "@/lib/usage-history-rules";
import { sampleFilterCabinets as cabinets, sampleFilterReagents as reagents } from "./sample";

/** 시안 2-filter: 시트 안에서 고르는 중 = 재고 적은 순 · 산 · 산화제 */
const FRAME_DRAFT: ListFilter = { ...EMPTY_LIST_FILTER, sort: "stock", classes: ["산", "산화제"] };

/** list-filter-sheet 제자리 예시 (갤러리 안 상태만, 저장 없음) */
export function ListFilterSheetDemo({ initial = FRAME_DRAFT }: { initial?: ListFilter }) {
  const [draft, setDraft] = useState<ListFilter>(initial);
  return (
    <ListFilterSheet
      sheet={false}
      value={draft}
      onChange={setDraft}
      cabinets={cabinets}
      resultCount={applyListFilter(reagents, draft).length}
      onReset={() => setDraft(EMPTY_LIST_FILTER)}
      onApply={() => undefined}
    />
  );
}

/** usage-date + past-date-note (시안 4-past-date: 2026-10-03, 오늘 2026-10-07) */
export function UsageDateDemo({ today = "2026-10-07", initial = "2026-10-03" }: { today?: string; initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <UsageDate value={value} max={today} onChange={setValue} />
      {value && value < today ? <PastDateNote>{pastDateNoteText(value)}</PastDateNote> : null}
    </>
  );
}

/**
 * 화면 2 필터 동작 예시: list-filter-button(배지) → list-filter-sheet → filter-chip-row → 목록 / 0종이면 빈 상태 + "필터 지우기".
 * 실제 화면(/reagents)과 같은 컴포넌트·순수 함수(lib/reagent-list-filter)를 갤러리 안 상태로만 움직인다.
 */
export function ListFilterFlowDemo({ initial = { ...EMPTY_LIST_FILTER, classes: ["산"] } }: { initial?: ListFilter }) {
  const [applied, setApplied] = useState<ListFilter>(initial);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ListFilter>(initial);
  const visible = applyListFilter(reagents, applied);
  const chips = listFilterChips(applied, cabinets);
  return (
    <>
      <div>
        <ListFilterButton
          count={chips.length}
          expanded={open}
          onClick={() => {
            setDraft(applied);
            setOpen(!open);
          }}
        />
      </div>
      {open ? (
        <ListFilterSheet
          sheet={false}
          value={draft}
          onChange={setDraft}
          cabinets={cabinets}
          resultCount={applyListFilter(reagents, draft).length}
          onReset={() => setDraft(EMPTY_LIST_FILTER)}
          onApply={() => {
            setApplied(draft);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
      {chips.length > 0 ? (
        <FilterChipRow
          chips={chips}
          count={visible.length}
          onRemove={(key) => setApplied(removeListFilterChip(applied, key))}
          onClearAll={() => setApplied(EMPTY_LIST_FILTER)}
        />
      ) : null}
      {visible.length === 0 ? (
        <EmptyStateCard variant="outlined" title="조건에 맞는 시약이 없어요" description="칩을 하나씩 빼거나 필터를 지워 보세요">
          <ButtonOutline onClick={() => setApplied(EMPTY_LIST_FILTER)}>필터 지우기</ButtonOutline>
        </EmptyStateCard>
      ) : (
        visible.map((r) => (
          <ReagentRow key={r.id} title={r.name} body={r.stock} caption={r.intake} lowStock={r.lowStock} href="/gallery/filter" />
        ))
      )}
    </>
  );
}
