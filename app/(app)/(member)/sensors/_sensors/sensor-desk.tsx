"use client";

import { useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { BulkDeleteFlow } from "@/components/bulk-action-bar/flow";
import { ButtonOutline } from "@/components/button-outline";
import { DataTable, DataTablePagination, type DataTableColumn } from "@/components/data-table";
import { EmptyStateCard } from "@/components/ex-empty-state-card";
import { ListFilterButton } from "@/components/list-filter-button";
import { ListSelectToggle, selectedCountText } from "@/components/list-select-toggle";
import { SelectCheckbox } from "@/components/select-checkbox";
import { SensorAdd } from "@/components/sensor-add";
import { SensorList } from "@/components/sensor-list";
import { SensorTableRow } from "@/components/sensor-row";
import { TextInput } from "@/components/text-input";
import { TABLE_PAGE_SIZE, paginate, parsePage } from "@/lib/paginate";
import {
  EMPTY_SENSOR_FILTER,
  SENSOR_TEXT,
  applySensorFilter,
  parseSensorFilter,
  sensorFilterCount,
  sensorSummary,
  writeSensorFilter,
  type SensorFilter,
} from "@/lib/sensor-rules";
import type { SensorItem } from "@/lib/supabase/sensors";
import { useBulkSelect } from "@/lib/use-bulk-select";
import { archiveSensorsAction } from "../actions";
import { SensorFilterPanel } from "./filter-panel";
import { sensorDetailHref, sensorNewHref, sensorSelectedId, type SensorBase } from "./hrefs";
import { usedMakers } from "./sensor-browser";
import styles from "./sensors.module.css";

type Props = {
  items: SensorItem[];
  canEdit: boolean;
  base?: SensorBase;
};

/** 주소창 쿼리를 고친다 (Next 라우터와 함께 바뀐다). 목록 조건이 바뀌면 1쪽으로 */
function replaceQuery(edit: (p: URLSearchParams) => void, keepPage = false) {
  const url = new URL(window.location.href);
  edit(url.searchParams);
  if (!keepPage) url.searchParams.delete("page");
  window.history.replaceState(null, "", url);
}

/* 시안 17-desktop 열 폭 (표 안쪽 1104 기준: 220 · 130 · 150 · 150 · 100 · 250 · 104) */
const W = { name: "20%", type: "11.8%", maker: "13.6%", model: "13.6%", qty: "9%", loc: "22.6%", status: "9.4%" };
const W_SELECT = "4.4%";

/**
 * 화면 17 센서 목록 — 데스크톱 (디자인 1.26 17-desktop): page-head(제목 "센서" + "N개" · "고장 n · 점검 필요 n" /
 * 검색 + list-filter-button + list-select-toggle + sensor-add) → sensor-list(data-table: 이름 · 종류 · 회사 · 모델 · 수량 · 보관 위치 · 상태, 10행씩)
 * → pagination. 행을 누르면 오른쪽 detail-drawer (/sensors/[id]). 선택 모드 = 첫 열 select-checkbox(머리 칸 = 전체 선택) + bulk-action-bar.
 */
export function SensorDesk({ items, canEdit, base = "" }: Props) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const selectedId = sensorSelectedId(pathname);
  const urlQuery = sp.get("q") ?? "";
  const [query, setQuery] = useState(urlQuery);
  const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery);
  if (urlQuery !== seenUrlQuery) {
    setSeenUrlQuery(urlQuery);
    if (urlQuery !== query) setQuery(urlQuery);
  }
  const applied = useMemo(() => parseSensorFilter(sp), [sp]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SensorFilter>(applied);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const select = useBulkSelect();

  const visible = useMemo(() => applySensorFilter(items, query, applied), [items, query, applied]);
  const draftCount = useMemo(() => (open ? applySensorFilter(items, query, draft).length : 0), [open, items, query, draft]);
  const makers = useMemo(() => usedMakers(items), [items]);
  const { rows, page, pageCount } = paginate(visible, parsePage(sp.get("page")), TABLE_PAGE_SIZE);
  const selecting = canEdit && select.selecting;
  const selected = visible.filter((s) => select.ids.has(s.id)).map((s) => ({ id: s.id, name: s.name }));
  const allPicked = selected.length > 0 && selected.length === Math.min(visible.length, 100);

  const apply = (next: SensorFilter) => replaceQuery((p) => writeSensorFilter(p, next));
  const closeSheet = (focus = true) => {
    setOpen(false);
    if (focus) buttonRef.current?.focus({ preventScroll: true });
  };

  const listQueryOf = (p: number) => {
    const next = new URLSearchParams(sp.toString());
    if (p > 1) next.set("page", String(p));
    else next.delete("page");
    return next;
  };

  const columns: DataTableColumn[] = [
    ...(selecting
      ? [
          {
            key: "select",
            label: "선택",
            width: W_SELECT,
            header: (
              <SelectCheckbox
                checked={allPicked ? true : selected.length > 0 ? "mixed" : false}
                label="전체 선택"
                onToggle={() => select.selectAll(visible.map((s) => s.id))}
              />
            ),
          },
        ]
      : []),
    { key: "name", label: "이름", width: W.name, sort: "asc" },
    { key: "type", label: "종류", width: W.type },
    { key: "maker", label: "회사", width: W.maker },
    { key: "model", label: "모델", width: W.model },
    { key: "qty", label: "수량", width: W.qty },
    { key: "loc", label: "보관 위치", width: W.loc },
    { key: "status", label: "상태", width: W.status },
  ];

  if (items.length === 0) {
    return (
      <div className={styles.deskBody}>
        <div className={styles.pageHead} data-name="page-head">
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{SENSOR_TEXT.title}</h1>
            <span className={styles.count}>0개</span>
          </div>
        </div>
        <div className={styles.deskEmpty}>
          <EmptyStateCard variant="outlined" icon="sensor" iconTone="ink" fullActions title={SENSOR_TEXT.emptyTitle} description={SENSOR_TEXT.emptyBody}>
            {canEdit ? <SensorAdd href={sensorNewHref(sp)} fullWidth /> : null}
          </EmptyStateCard>
        </div>
      </div>
    );
  }

  const filterCount = sensorFilterCount(applied);
  let empty: React.ReactNode = null;
  if (visible.length === 0) {
    empty = (
      <EmptyStateCard variant="outlined" title={SENSOR_TEXT.filterEmptyTitle} description="검색어나 필터를 바꿔 보세요">
        {filterCount > 0 ? <ButtonOutline onClick={() => apply(EMPTY_SENSOR_FILTER)}>필터 지우기</ButtonOutline> : null}
      </EmptyStateCard>
    );
  }

  return (
    <div className={styles.deskBody}>
      <div className={styles.pageHead} data-name="page-head">
        <div className={styles.pageTitle}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{SENSOR_TEXT.title}</h1>
            <span className={styles.count}>
              {selecting ? `${visible.length}개 · ${selectedCountText(selected.length)}` : `${visible.length}개`}
            </span>
          </div>
          <p className={styles.summary}>{sensorSummary(items)}</p>
          {selecting && select.capped ? <p className={styles.capped}>앞의 100개만 골랐어요</p> : null}
        </div>
        <div className={styles.pageActions}>
          <TextInput
            className={styles.deskSearch}
            type="search"
            icon="search"
            placeholder={SENSOR_TEXT.searchPlaceholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              const v = e.target.value.trim();
              replaceQuery((p) => (v ? p.set("q", v) : p.delete("q")));
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
          {canEdit ? (
            <ListSelectToggle variant="desktop" selecting={selecting} onStart={select.start} onCancel={select.cancel} disabled={visible.length === 0} />
          ) : null}
          {canEdit && !selecting ? <SensorAdd href={sensorNewHref(sp)} /> : null}
        </div>
      </div>

      <SensorList variant="desktop">
        <DataTable label="센서 목록" columns={columns} empty={empty ?? undefined}>
          {empty
            ? null
            : rows.map((s) => (
                <SensorTableRow
                  key={s.id}
                  sensor={s}
                  href={sensorDetailHref(s.id, listQueryOf(page), base)}
                  current={s.id === selectedId}
                  selectMode={selecting}
                  selected={select.ids.has(s.id)}
                  onToggle={() => select.toggle(s.id)}
                />
              ))}
        </DataTable>
      </SensorList>

      {empty ? null : (
        <DataTablePagination
          page={page}
          pageCount={pageCount}
          label="센서 목록 쪽"
          onPage={(p) => replaceQuery((params) => (p > 1 ? params.set("page", String(p)) : params.delete("page")), true)}
        />
      )}

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

      {canEdit ? <BulkDeleteFlow kind="sensor" selecting={selecting} selected={selected} run={archiveSensorsAction} onDone={select.cancel} /> : null}
    </div>
  );
}
