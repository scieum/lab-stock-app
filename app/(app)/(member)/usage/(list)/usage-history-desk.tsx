"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { ButtonOutline } from "@/components/button-outline";
import {
  DataTable,
  DataTableButtonCell,
  DataTableCell,
  DataTableGroupRow,
  DataTablePagination,
  DataTableRow,
  type DataTableColumn,
} from "@/components/data-table";
import { DetailDrawer, DrawerRow, DrawerRows } from "@/components/detail-drawer";
import { ClassFilterButton } from "@/components/class-filter";
import { ClassLabel } from "@/components/class-label";
import { DeletedReagentTag } from "@/components/deleted-reagent-tag";
import { EmptyStateCard } from "@/components/ex-empty-state-card";
import { MsdsEntry } from "@/components/msds-entry";
import { SegmentedControl } from "@/components/segmented-control";
import { TextInput, TextInputSelect } from "@/components/text-input";
import { msdsSummaryPath } from "@/lib/msds-summary";
import { TABLE_PAGE_SIZE, paginate, parsePage } from "@/lib/paginate";
import { USAGE_HISTORY_LIMIT, USAGE_PERIOD_OPTIONS, USAGE_QUERY_MAX } from "@/lib/usage-history-rules";
import type { UsageFilters, UsageHistoryGroup, UsageHistoryItem } from "./usage-history-screen";
import styles from "./usage-history.module.css";

const SCOPE_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "mine", label: "내 기록" },
];
const PERIODS = USAGE_PERIOD_OPTIONS.map((o) => ({ value: o.value, label: o.label }));

/* 시안 10-desktop(1.25) 열 폭 (표 안쪽 624 기준: 88 · 184 · 136 · 96 · 64 · 56) */
const COLUMNS_W = { day: "14.1%", name: "29.5%", cls: "21.8%", user: "15.4%", amount: "10.2%", time: "9%" };

type Props = {
  filters: UsageFilters;
  groups: UsageHistoryGroup[];
  truncated: boolean;
  /** 학교급별 최고 학년 (class-filter) */
  maxGrade: number;
};

/** 주소창만 바꾼다 (서버 조회 없음 — 열린 기록 · 쪽 · 정렬은 화면 상태). push = 뒤로가기로 되돌릴 수 있게 */
function setParams(edit: (p: URLSearchParams) => void, mode: "push" | "replace") {
  const url = new URL(window.location.href);
  edit(url.searchParams);
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

type Row = { kind: "group"; key: string; label: string } | { kind: "record"; record: UsageHistoryItem };

/**
 * 화면 10 사용 기록 — 데스크톱 (디자인 1.24 10-desktop, d7 §23 run b).
 * page-head(제목 "기록" + "N건" / 시약명 검색) → toolbar(segmented-control 전체/내 기록 + 기간) →
 * data-table(사용일 · 시약명 · 사용자 · 사용량 · 기록 시각, 사용일 묶음 머리 행 date-group-row, 10행씩) → pagination.
 * 행을 누르면 오른쪽 detail-drawer(모달 대신): 시약명 → 사용량(32/700) → 사용자 · 사용일 · 기록 시각 · 메모 → msds-entry → "닫기".
 * 열린 기록은 주소창 ?id= (새로고침·뒤로가기 유지), 쪽 ?page=, 사용일 정렬 ?order=asc(기본 최신순).
 */
export function UsageHistoryDesk({ filters, groups, truncated, maxGrade }: Props) {
  const { pending, shown, text, changeText, sendQuery, changeScope, changePeriod, changeClass } = filters;
  const sp = useSearchParams();
  const openId = sp.get("id");
  const asc = sp.get("order") === "asc";

  const records = useMemo(() => {
    const all = groups.flatMap((g) => g.records);
    return asc ? [...all].reverse() : all;
  }, [groups, asc]);
  const total = records.length;
  const { rows: pageRecords, page, pageCount } = paginate(records, parsePage(sp.get("page")), TABLE_PAGE_SIZE);
  const selected = openId ? (records.find((r) => r.id === openId) ?? null) : null;

  // 쪽 안의 기록을 사용일 묶음으로 (묶음 머리 = 서버가 만든 "10월 7일 · 오늘")
  const labelOf = useMemo(() => new Map(groups.map((g) => [g.key, g.label])), [groups]);
  const rows: Row[] = [];
  let lastDay: string | null = null;
  for (const r of pageRecords) {
    if (r.usedOn !== lastDay) {
      rows.push({ kind: "group", key: r.usedOn, label: labelOf.get(r.usedOn) ?? r.dayLabel });
      lastDay = r.usedOn;
    }
    rows.push({ kind: "record", record: r });
  }

  const open = (id: string) => setParams((p) => p.set("id", id), "push");
  const close = () => setParams((p) => p.delete("id"), "push");

  const columns: DataTableColumn[] = [
    {
      key: "day",
      label: "사용일",
      width: COLUMNS_W.day,
      sort: asc ? "asc" : "desc",
      onSort: () =>
        setParams((p) => {
          if (asc) p.delete("order");
          else p.set("order", "asc");
          p.delete("page");
        }, "replace"),
    },
    { key: "name", label: "시약명", width: COLUMNS_W.name },
    { key: "class", label: "수업", width: COLUMNS_W.cls },
    { key: "user", label: "사용자", width: COLUMNS_W.user },
    { key: "amount", label: "사용량", width: COLUMNS_W.amount },
    { key: "time", label: "기록 시각", width: COLUMNS_W.time },
  ];

  return (
    <div className={styles.deskFrame}>
      <div className={styles.deskList} aria-busy={pending ? true : undefined}>
        <div className={styles.deskHead} data-name="page-head">
          <div className={styles.deskTitleRow}>
            <h1 className={styles.deskTitle}>기록</h1>
            <span className={styles.deskCount}>{total}건</span>
          </div>
          <TextInput
            className={styles.deskSearch}
            inputMode="search"
            name="q"
            icon="search"
            placeholder="시약명 검색"
            autoComplete="off"
            enterKeyHint="search"
            maxLength={USAGE_QUERY_MAX}
            value={text}
            onChange={(e) => changeText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                sendQuery(text);
              }
            }}
          />
        </div>

        <div className={styles.deskToolbar} role="search" aria-label="사용 기록 필터" data-name="toolbar">
          <SegmentedControl size="sm" label="기록 범위" options={SCOPE_OPTIONS} value={shown.onlyMine ? "mine" : "all"} onChange={changeScope} />
          <TextInputSelect
            className={styles.deskPeriod}
            aria-label="기간"
            name="period"
            options={PERIODS}
            value={shown.period}
            onChange={(e) => changePeriod(e.target.value)}
          />
          {/* d7 §24: 반 필터 — 학년 → 반 (드롭다운) */}
          <ClassFilterButton value={shown.classFilter} onChange={changeClass} maxGrade={maxGrade} />
        </div>

        <DataTable
          label="사용 기록"
          columns={columns}
          empty={total === 0 ? <EmptyStateCard variant="outlined" title="아직 사용 기록이 없어요" /> : undefined}
        >
          {total === 0
            ? null
            : rows.map((row) =>
                row.kind === "group" ? (
                  <DataTableGroupRow key={`g-${row.key}`} label={row.label} colSpan={columns.length} />
                ) : (
                  <DataTableRow
                    key={row.record.id}
                    clickable
                    tall={row.record.recordedCaption !== null}
                    selected={row.record.id === selected?.id}
                  >
                    <DataTableCell>{row.record.dayLabel}</DataTableCell>
                    <DataTableButtonCell
                      current={row.record.id === selected?.id}
                      caption={row.record.recordedCaption ?? undefined}
                      onClick={() => (row.record.id === selected?.id ? close() : open(row.record.id))}
                    >
                      {row.record.reagentDeleted ? (
                        <span className={styles.deskDeletedName}>
                          <span className={styles.deskMutedName}>{row.record.reagentName}</span>
                          <DeletedReagentTag />
                        </span>
                      ) : (
                        row.record.reagentName
                      )}
                    </DataTableButtonCell>
                    <DataTableCell>
                      <ClassLabel value={row.record.classInfo} variant="cell" />
                    </DataTableCell>
                    <DataTableCell>{row.record.userName}</DataTableCell>
                    <DataTableCell>{row.record.amountLabel}</DataTableCell>
                    <DataTableCell>{row.record.recordedTime}</DataTableCell>
                  </DataTableRow>
                ),
              )}
        </DataTable>

        {total === 0 ? null : (
          <DataTablePagination
            page={page}
            pageCount={pageCount}
            label="사용 기록 쪽"
            onPage={(p) => setParams((params) => (p > 1 ? params.set("page", String(p)) : params.delete("page")), "replace")}
          />
        )}

        {truncated ? (
          <p className={styles.more}>최근 {USAGE_HISTORY_LIMIT}건까지만 보여요. 기간을 줄이거나 시약명으로 검색해 보세요</p>
        ) : null}
      </div>

      {selected ? (
        <DetailDrawer
          key={selected.id}
          focusKey={selected.id}
          title={selected.reagentName}
          onClose={close}
          actions={<ButtonOutline onClick={close}>닫기</ButtonOutline>}
        >
          <p className={styles.deskAmount}>{selected.amountLabel}</p>
          <DrawerRows label="기록 정보">
            <DrawerRow label="사용자">{selected.userName}</DrawerRow>
            <DrawerRow label="사용일">{selected.usedOn}</DrawerRow>
            <DrawerRow label="수업">
              <ClassLabel value={selected.classInfo} variant="value" />
            </DrawerRow>
            <DrawerRow label="기록 시각">{selected.recordedCaption ? selected.recordedAt : selected.recordedTime}</DrawerRow>
            <DrawerRow label="메모">{selected.memo ?? "-"}</DrawerRow>
          </DrawerRows>
          {/* d7 §24: 보관(삭제)된 시약은 시약 · MSDS 로 가는 링크 없음 — 태그만 */}
          {selected.reagentDeleted ? (
            <div>
              <DeletedReagentTag />
            </div>
          ) : (
            <MsdsEntry
              variant="button"
              href={selected.msdsUrl ?? undefined}
              // d7 §22: "MSDS 보기" = 화면 16, 뒤로 = 이 화면(/usage)
              summaryHref={msdsSummaryPath(selected.reagentId, { from: "usage" })}
              summaryIcon="chevron-right"
              notice="MSDS 링크가 아직 등록되지 않았어요"
            />
          )}
        </DetailDrawer>
      ) : null}
    </div>
  );
}
