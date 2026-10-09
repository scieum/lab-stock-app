"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { BadgeLowStock } from "@/components/badge-low-stock";
import { ButtonOutline } from "@/components/button-outline";
import { CabinetNumber } from "@/components/cabinet-number";
import {
  DataTable,
  DataTableCell,
  DataTableLinkCell,
  DataTablePagination,
  DataTableRow,
  type DataTableColumn,
} from "@/components/data-table";
import { EmptyStateCard } from "@/components/ex-empty-state-card";
import { FilterChipRow } from "@/components/filter-chip-row";
import { ListFilterButton } from "@/components/list-filter-button";
import { ListFilterSheet } from "@/components/list-filter-sheet";
import { SegmentedControl, type SegmentOption } from "@/components/segmented-control";
import { TextInput } from "@/components/text-input";
import { locationText } from "@/lib/cabinet-rules";
import { TABLE_PAGE_SIZE, paginate, parsePage } from "@/lib/paginate";
import { deskSelectedId, reagentDetailHref } from "@/lib/reagent-desk";
import {
  EMPTY_LIST_FILTER,
  applyListFilter,
  listFilterChips,
  parseListFilter,
  removeListFilterChip,
  writeListFilter,
  type FilterCabinet,
  type ListFilter,
  type ListSort,
} from "@/lib/reagent-list-filter";
import type { ReagentListItem } from "@/lib/supabase/reagents-data";
import { MsdsBulk } from "../reagents/(list)/msds-bulk";
import { useDeskBase } from "./desk-base";
import styles from "./desk.module.css";

const SCOPES: SegmentOption[] = [
  { value: "all", label: "전체" },
  { value: "low-stock", label: "재고 부족" },
];

type Props = {
  items: ReagentListItem[];
  cabinets: FilterCabinet[];
  /** 교사·admin — MSDS 한 번에 찾기 띠 (d7 §20) */
  canFindMsds: boolean;
};

/** 주소창 쿼리를 고친다 (Next 라우터와 함께 바뀐다 — useSearchParams 가 새 값을 준다). 목록 조건이 바뀌면 1쪽으로 */
function replaceQuery(edit: (p: URLSearchParams) => void, keepPage = false) {
  const url = new URL(window.location.href);
  edit(url.searchParams);
  if (!keepPage) url.searchParams.delete("page");
  window.history.replaceState(null, "", url);
}

/* 시안 2-desktop 열 폭 (표 안쪽 1104 기준 비율 — 드로어가 열린 3-desktop 의 624 에서도 같은 비율) */
const W = { name: "18%", cls: "10.5%", loc: "23.5%", stock: "11%", status: "12.5%", intake: "15.5%", msds: "9%" };

/**
 * 데스크톱 시약 목록 (디자인 1.24 2-desktop, d7 §23 run b) — /reagents · /reagents/[id] · /msds/[id] · /usage/new 공통 왼쪽 본문.
 * page-head(제목 "시약" + "N종" · "재고 부족 n · MSDS 없음 n" / 검색 + list-filter-button 드롭다운) →
 * (교사·admin 이 "MSDS 없는 시약만"을 켰으면) msds-bulk-banner → toolbar(segmented-control 전체/재고 부족 + filter-chip-row) →
 * data-table(시약명↑ · 보관 분류 · 보관 위치 · 재고 · 상태 · 최근 입고일 · MSDS, 10행씩) → pagination.
 * 행을 누르면 오른쪽 드로어(시약 상세)가 열린다 — 주소 /reagents/[id]?{목록 쿼리}. 목록 상태는 모두 주소창에 둔다.
 */
export function ReagentDeskTable({ items, cabinets, canFindMsds }: Props) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const selectedId = deskSelectedId(pathname, sp);
  // 둘러보기(/demo) 데스크톱: 행 주소 앞머리 /demo, 머리 줄 요약은 "재고 부족 n" 만 (시안 2-guest-desktop)
  const hrefBase = useDeskBase();
  const guest = hrefBase === "/demo";

  const scope = sp.get("filter") === "low-stock" ? "low-stock" : "all";
  const urlQuery = sp.get("q") ?? "";
  // 검색 입력은 글자를 바로 들고(한글 조합 중에도), 주소에는 같은 값을 쓴다
  const [query, setQuery] = useState(urlQuery);
  const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery);
  if (urlQuery !== seenUrlQuery) {
    setSeenUrlQuery(urlQuery);
    if (urlQuery !== query) setQuery(urlQuery);
  }
  const applied = useMemo(() => parseListFilter(sp, cabinets), [sp, cabinets]);
  const requestedPage = parsePage(sp.get("page"));

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ListFilter>(applied);
  const sheetId = useId();
  const anchorRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const q = query.trim().toLowerCase();
  const base = useMemo(
    () =>
      items.filter(
        (r) => (scope === "all" || r.lowStock) && (!q || r.name.toLowerCase().includes(q) || (r.casNo ?? "").toLowerCase().includes(q)),
      ),
    [items, scope, q],
  );
  const visible = useMemo(() => applyListFilter(base, applied), [base, applied]);
  const draftCount = useMemo(() => (open ? applyListFilter(base, draft).length : 0), [open, base, draft]);
  const chips = listFilterChips(applied, cabinets);
  const { rows, page, pageCount } = paginate(visible, requestedPage, TABLE_PAGE_SIZE);

  const lowCount = items.filter((r) => r.lowStock).length;
  const noMsdsCount = items.filter((r) => !r.hasMsds).length;
  // d7 §20: 교사·admin 이 "MSDS 없는 시약만"을 켰을 때만 띠 (모바일과 같다) — 지금 목록(다른 조건과 함께 거른 것)이 대상
  const msdsTargets = useMemo(
    () => (canFindMsds && applied.noMsds ? visible.filter((r) => !r.hasMsds).map((r) => ({ id: r.id, name: r.name, cas: r.casNo })) : []),
    [canFindMsds, applied.noMsds, visible],
  );

  const cabinetById = useMemo(() => new Map(cabinets.map((c) => [c.id, c])), [cabinets]);

  const apply = (next: ListFilter) => replaceQuery((p) => writeListFilter(p, next));
  const setSort = (sort: ListSort) => apply({ ...applied, sort });

  const openSheet = () => {
    setDraft(applied);
    setOpen(true);
  };
  const closeSheet = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus({ preventScroll: true });
  };

  // 바깥을 누르면 적용하지 않고 닫는다 (드롭다운)
  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      if (e.target instanceof Node && anchorRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const columns: DataTableColumn[] = [
    { key: "name", label: "시약명", width: W.name, sort: applied.sort === "name" ? "asc" : "none", onSort: () => setSort("name") },
    { key: "class", label: "보관 분류", width: W.cls },
    { key: "location", label: "보관 위치", width: W.loc },
    { key: "stock", label: "재고", width: W.stock, sort: applied.sort === "stock" ? "asc" : "none", onSort: () => setSort("stock") },
    { key: "status", label: "상태", width: W.status },
    { key: "intake", label: "최근 입고일", width: W.intake, sort: applied.sort === "intake" ? "desc" : "none", onSort: () => setSort("intake") },
    { key: "msds", label: "MSDS", width: W.msds },
  ];

  let empty: React.ReactNode = null;
  if (items.length === 0) empty = <EmptyStateCard variant="outlined" title="등록된 시약이 없어요" />;
  else if (visible.length === 0 && chips.length > 0) {
    empty = (
      <EmptyStateCard variant="outlined" title="조건에 맞는 시약이 없어요" description="칩을 하나씩 빼거나 필터를 지워 보세요">
        <ButtonOutline onClick={() => apply(EMPTY_LIST_FILTER)}>필터 지우기</ButtonOutline>
      </EmptyStateCard>
    );
  } else if (visible.length === 0) {
    empty = <EmptyStateCard variant="outlined" title={q ? "검색 결과가 없어요" : "재고 부족 시약이 없어요"} />;
  }

  const listQueryOf = (p: number) => {
    const next = new URLSearchParams(sp.toString());
    if (p > 1) next.set("page", String(p));
    else next.delete("page");
    return next;
  };

  return (
    <div className={styles.listBody}>
      <div className={styles.pageHead} data-name="page-head">
        <div className={styles.pageTitle}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>시약</h1>
            <span className={styles.count}>{visible.length}종</span>
          </div>
          <p className={styles.summary}>
            {guest ? `재고 부족 ${lowCount}` : `재고 부족 ${lowCount} · MSDS 없음 ${noMsdsCount}`}
          </p>
        </div>
        <div className={styles.pageActions}>
          <TextInput
            className={styles.search}
            type="search"
            icon="search"
            placeholder="시약명 검색"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              const v = e.target.value.trim();
              replaceQuery((p) => (v ? p.set("q", v) : p.delete("q")));
            }}
          />
          <div ref={anchorRef} className={styles.filterAnchor}>
            <ListFilterButton
              ref={buttonRef}
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
      </div>

      {canFindMsds && applied.noMsds ? (
        <div data-sheet-placement="top-end">
          <MsdsBulk targets={msdsTargets} />
        </div>
      ) : null}

      <div className={styles.toolbar} data-name="toolbar">
        <SegmentedControl
          options={SCOPES}
          value={scope}
          onChange={(v) => replaceQuery((p) => (v === "low-stock" ? p.set("filter", "low-stock") : p.delete("filter")))}
          label="시약 필터"
          size="sm"
        />
        {chips.length > 0 ? (
          <FilterChipRow
            className={styles.chips}
            chips={chips}
            count={visible.length}
            onRemove={(key) => apply(removeListFilterChip(applied, key))}
            onClearAll={() => apply(EMPTY_LIST_FILTER)}
          />
        ) : null}
      </div>

      <DataTable label="시약 목록" columns={columns} empty={empty}>
        {empty
          ? null
          : rows.map((r) => {
              const current = r.id === selectedId;
              const cab = r.slot ? cabinetById.get(r.slot.cabinetId) : undefined;
              const placed = Boolean(cab && r.slot);
              return (
                <DataTableRow key={r.id} selected={current} clickable>
                  <DataTableLinkCell href={reagentDetailHref(r.id, listQueryOf(page), hrefBase)} current={current}>
                    {r.name}
                  </DataTableLinkCell>
                  <DataTableCell tone={r.storageClass ? "default" : "muted"}>{r.storageClass ?? "-"}</DataTableCell>
                  <DataTableCell tone={placed ? "default" : "muted"}>
                    <span className={styles.location}>
                      {placed && cab ? <CabinetNumber number={cab.number} /> : null}
                      <span className={styles.locationText}>{locationText(cab, r.slot)}</span>
                    </span>
                  </DataTableCell>
                  <DataTableCell>{r.stock}</DataTableCell>
                  <DataTableCell>{r.lowStock ? <BadgeLowStock /> : null}</DataTableCell>
                  <DataTableCell tone={r.intakeDate ? "default" : "muted"}>{r.intakeDate ?? "-"}</DataTableCell>
                  <DataTableCell tone={r.hasMsds ? "default" : "muted"}>{r.hasMsds ? "있음" : "없음"}</DataTableCell>
                </DataTableRow>
              );
            })}
      </DataTable>

      {empty ? null : (
        <DataTablePagination
          page={page}
          pageCount={pageCount}
          label="시약 목록 쪽"
          onPage={(p) => replaceQuery((params) => (p > 1 ? params.set("page", String(p)) : params.delete("page")), true)}
        />
      )}
    </div>
  );
}
