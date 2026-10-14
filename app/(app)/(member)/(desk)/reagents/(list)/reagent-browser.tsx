"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { BulkDeleteFlow } from "@/components/bulk-action-bar/flow";
import { ButtonOutline } from "@/components/button-outline";
import { EmptyStateCard } from "@/components/ex-empty-state-card";
import { FilterChipRow } from "@/components/filter-chip-row";
import { ListFilterButton } from "@/components/list-filter-button";
import { ListFilterSheet } from "@/components/list-filter-sheet";
import { ListSelectToggle } from "@/components/list-select-toggle";
import { ReagentRow } from "@/components/reagent-row";
import { SelectCheckbox } from "@/components/select-checkbox";
import { SegmentedControl, type SegmentOption } from "@/components/segmented-control";
import { TextInput } from "@/components/text-input";
import {
  EMPTY_LIST_FILTER,
  applyListFilter,
  listFilterChips,
  removeListFilterChip,
  writeListFilter,
  type FilterCabinet,
  type ListFilter,
} from "@/lib/reagent-list-filter";
import type { ReagentListItem } from "@/lib/supabase/reagents-data";
import { useBulkSelect } from "@/lib/use-bulk-select";
import { archiveReagentsAction } from "../bulk-actions";
import { ReagentWipeFlow } from "../reagent-wipe-flow";
import { MsdsBulk } from "./msds-bulk";
import styles from "./reagents.module.css";

export type ReagentFilter = "all" | "low-stock";

const FILTERS: SegmentOption[] = [
  { value: "all", label: "전체" },
  { value: "low-stock", label: "재고 부족" },
];

type Props = {
  items: ReagentListItem[];
  /** 학교 시약장 (필터 시트 보관 위치) */
  cabinets?: FilterCabinet[];
  initialFilter: ReagentFilter;
  initialQuery: string;
  /** 주소창에서 읽은 필터·정렬 (잘못된 값은 서버에서 이미 버렸다) */
  initialListFilter?: ListFilter;
  /** 행 링크의 상세 경로 앞부분 (기본 /reagents, 둘러보기는 /demo/reagents) */
  detailBase?: string;
  /** true = 교사·admin — "MSDS 없는 시약만" 필터를 켜면 msds-bulk-banner 일괄 찾기 (d7 §20). 학생·둘러보기는 false */
  canFindMsds?: boolean;
  /** true = 교사·admin — 선택 모드 · 여러 개 삭제 (d7 §25 bulk_delete, R5). 학생·둘러보기는 false */
  canSelect?: boolean;
  /** admin 만 — 우리 학교 이름. 있으면 목록 머리 오른쪽 page-more-menu ⋯ '시약 전체 삭제' (d7 §29). 교사·학생·둘러보기는 없음 */
  wipeSchoolName?: string;
};

/** 주소창(?filter·?q + 필터 시트 값)을 화면 상태와 맞춘다 — 새로고침·뒤로가기에도 같은 목록 */
function syncUrl(filter: ReagentFilter, q: string, list: ListFilter) {
  const url = new URL(window.location.href);
  if (filter === "low-stock") url.searchParams.set("filter", "low-stock");
  else url.searchParams.delete("filter");
  if (q) url.searchParams.set("q", q);
  else url.searchParams.delete("q");
  writeListFilter(url.searchParams, list);
  window.history.replaceState(window.history.state, "", url);
}

function matchesBase(r: ReagentListItem, filter: ReagentFilter, q: string): boolean {
  return (filter === "all" || r.lowStock) && (!q || r.name.toLowerCase().includes(q) || (r.casNo ?? "").toLowerCase().includes(q));
}

/**
 * 화면 2 시약 목록 (디자인 1.17): segmented-control "전체 / 재고 부족" → 검색 + list-filter-button →
 * (적용 필터가 있으면) filter-chip-row → 목록. 필터는 list-filter-sheet 에서 고르고 "{N}종 보기"로 적용한다 (d7 §16).
 * 모든 조건은 함께(AND) 적용하고, 결과 0 이면 ex-empty-state-card "조건에 맞는 시약이 없어요" + "필터 지우기".
 */
export function ReagentBrowser({
  items,
  cabinets = [],
  initialFilter,
  initialQuery,
  initialListFilter = EMPTY_LIST_FILTER,
  detailBase = "/reagents",
  canFindMsds = false,
  canSelect = false,
  wipeSchoolName,
}: Props) {
  const [filter, setFilter] = useState<ReagentFilter>(initialFilter);
  const [query, setQuery] = useState(initialQuery);
  const [applied, setApplied] = useState<ListFilter>(initialListFilter);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ListFilter>(initialListFilter);
  const sheetId = useId();
  const anchorRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const select = useBulkSelect();
  const selecting = canSelect && select.selecting;

  const q = query.trim().toLowerCase();
  const base = useMemo(() => items.filter((r) => matchesBase(r, filter, q)), [items, filter, q]);
  const visible = useMemo(() => applyListFilter(base, applied), [base, applied]);
  const draftCount = useMemo(() => (open ? applyListFilter(base, draft).length : 0), [open, base, draft]);
  const chips = listFilterChips(applied, cabinets);
  const selected = visible.filter((r) => select.ids.has(r.id)).map((r) => ({ id: r.id, name: r.name }));
  // d7 §20: 교사·admin 이 "MSDS 없는 시약만"을 켰을 때 — 지금 목록(다른 조건과 함께 거른 것)이 일괄 찾기 대상
  const msdsTargets = useMemo(
    () => (canFindMsds && applied.noMsds ? visible.filter((r) => !r.hasMsds).map((r) => ({ id: r.id, name: r.name, cas: r.casNo })) : []),
    [canFindMsds, applied.noMsds, visible],
  );

  const changeFilter = (v: string) => {
    const f: ReagentFilter = v === "low-stock" ? "low-stock" : "all";
    setFilter(f);
    syncUrl(f, query.trim(), applied);
  };
  const changeQuery = (v: string) => {
    setQuery(v);
    syncUrl(filter, v.trim(), applied);
  };
  const apply = (next: ListFilter) => {
    setApplied(next);
    syncUrl(filter, query.trim(), next);
  };

  const openSheet = () => {
    setDraft(applied);
    setOpen(true);
  };
  const closeSheet = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus({ preventScroll: true });
  };

  // 바깥을 누르면 적용하지 않고 닫는다 (데스크톱 드롭다운 · 모바일 시트 위쪽 빈 곳)
  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      if (e.target instanceof Node && anchorRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  let empty: React.ReactNode = null;
  // 시약 0종 (처음 · 시약 전체 삭제 뒤 — rules wipe.reagent 빈 목록): 데스크톱과 같은 ex-empty-state-card
  if (items.length === 0) empty = <EmptyStateCard variant="outlined" title="등록된 시약이 없어요" />;
  else if (visible.length === 0 && chips.length > 0) {
    empty = (
      <EmptyStateCard variant="outlined" title="조건에 맞는 시약이 없어요" description="칩을 하나씩 빼거나 필터를 지워 보세요">
        <ButtonOutline onClick={() => apply(EMPTY_LIST_FILTER)}>필터 지우기</ButtonOutline>
      </EmptyStateCard>
    );
  } else if (visible.length === 0) {
    empty = <p className={styles.empty}>{q ? "검색 결과가 없어요" : "재고 부족 시약이 없어요"}</p>;
  }

  return (
    <>
      {canFindMsds && applied.noMsds ? <MsdsBulk targets={msdsTargets} /> : null}
      {selecting ? (
        <ListSelectToggle
          selecting
          count={selected.length}
          capped={select.capped}
          onCancel={select.cancel}
          onSelectAll={() => select.selectAll(visible.map((r) => r.id))}
        />
      ) : (
        <div className={styles.listHead} data-name="list-head">
          <h1 className={styles.title}>{`시약 ${visible.length}종`}</h1>
          {/* 시안 2-wipe-mobile head-actions: 선택 → page-more-menu ⋯ (admin) */}
          {(canSelect && items.length > 0) || wipeSchoolName ? (
            <div className={styles.headActions} data-name="head-actions">
              {canSelect && items.length > 0 ? <ListSelectToggle selecting={false} onStart={select.start} disabled={visible.length === 0} /> : null}
              {wipeSchoolName ? <ReagentWipeFlow count={items.length} schoolName={wipeSchoolName} /> : null}
            </div>
          ) : null}
        </div>
      )}
      <div className={styles.toolbar}>
        <div className={styles.segment}>
          <SegmentedControl options={FILTERS} value={filter} onChange={changeFilter} label="시약 필터" />
        </div>
        <div className={styles.searchRow}>
          <TextInput
            className={styles.search}
            type="search"
            icon="search"
            placeholder="시약명 검색"
            value={query}
            onChange={(e) => changeQuery(e.target.value)}
          />
          <div ref={anchorRef} className={styles.filterAnchor}>
            <ListFilterButton
              ref={buttonRef}
              className={styles.filterButton}
              count={chips.length}
              expanded={open}
              controls={open ? sheetId : undefined}
              onClick={() => (open ? closeSheet(false) : openSheet())}
            />
            {open ? (
              <ListFilterSheet
                id={sheetId}
                value={draft}
                onChange={setDraft}
                cabinets={cabinets}
                resultCount={draftCount}
                onReset={() => setDraft(EMPTY_LIST_FILTER)}
                onApply={() => {
                  apply(draft);
                  closeSheet();
                }}
                onClose={() => closeSheet()}
              />
            ) : null}
          </div>
        </div>
        {chips.length > 0 ? (
          <FilterChipRow
            chips={chips}
            count={visible.length}
            onRemove={(key) => apply(removeListFilterChip(applied, key))}
            onClearAll={() => apply(EMPTY_LIST_FILTER)}
          />
        ) : null}
      </div>
      {empty ?? (
        <ul className={styles.list} aria-label="시약 목록">
          {visible.map((r) => (
            <li key={r.id}>
              {selecting ? (
                <ReagentRow
                  title={r.name}
                  body={r.stock}
                  caption={r.intake}
                  lowStock={r.lowStock}
                  selected={select.ids.has(r.id)}
                  leading={<SelectCheckbox checked={select.ids.has(r.id)} />}
                  onSelect={() => select.toggle(r.id)}
                />
              ) : (
                <ReagentRow
                  title={r.name}
                  body={r.stock}
                  caption={r.intake}
                  lowStock={r.lowStock}
                  href={`${detailBase}/${r.id}`}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {canSelect ? (
        <BulkDeleteFlow kind="reagent" selecting={selecting} selected={selected} run={archiveReagentsAction} onDone={select.cancel} />
      ) : null}
    </>
  );
}
