"use client";

import { useMemo, useState } from "react";
import { ReagentRow } from "@/components/reagent-row";
import { SegmentedControl, type SegmentOption } from "@/components/segmented-control";
import { TextInput } from "@/components/text-input";
import type { ReagentListItem } from "@/lib/supabase/reagents-data";
import styles from "./reagents.module.css";

export type ReagentFilter = "all" | "low-stock";

const FILTERS: SegmentOption[] = [
  { value: "all", label: "전체" },
  { value: "low-stock", label: "재고 부족" },
];

type Props = {
  items: ReagentListItem[];
  initialFilter: ReagentFilter;
  initialQuery: string;
  /** 행 링크의 상세 경로 앞부분 (기본 /reagents, 둘러보기는 /demo/reagents) */
  detailBase?: string;
};

/** 주소창(?filter·?q)을 화면 상태와 맞춘다 — 새로고침·뒤로가기에도 같은 목록 */
function syncUrl(filter: ReagentFilter, q: string) {
  const url = new URL(window.location.href);
  if (filter === "low-stock") url.searchParams.set("filter", "low-stock");
  else url.searchParams.delete("filter");
  if (q) url.searchParams.set("q", q);
  else url.searchParams.delete("q");
  window.history.replaceState(window.history.state, "", url);
}

export function ReagentBrowser({ items, initialFilter, initialQuery, detailBase = "/reagents" }: Props) {
  const [filter, setFilter] = useState<ReagentFilter>(initialFilter);
  const [query, setQuery] = useState(initialQuery);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (r) =>
        (filter === "all" || r.lowStock) &&
        (!q || r.name.toLowerCase().includes(q) || (r.casNo ?? "").toLowerCase().includes(q)),
    );
  }, [items, filter, query]);

  const changeFilter = (v: string) => {
    const f: ReagentFilter = v === "low-stock" ? "low-stock" : "all";
    setFilter(f);
    syncUrl(f, query.trim());
  };
  const changeQuery = (v: string) => {
    setQuery(v);
    syncUrl(filter, v.trim());
  };

  let empty: string | null = null;
  if (items.length === 0) empty = "등록된 시약이 없어요";
  else if (visible.length === 0) empty = query.trim() ? "검색 결과가 없어요" : "재고 부족 시약이 없어요";

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.segment}>
          <SegmentedControl options={FILTERS} value={filter} onChange={changeFilter} label="시약 필터" />
        </div>
        <TextInput
          className={styles.search}
          type="search"
          icon="search"
          placeholder="시약명 검색"
          value={query}
          onChange={(e) => changeQuery(e.target.value)}
        />
      </div>
      {empty ? (
        <p className={styles.empty}>{empty}</p>
      ) : (
        <ul className={styles.list} aria-label="시약 목록">
          {visible.map((r) => (
            <li key={r.id}>
              <ReagentRow
                title={r.name}
                body={r.stock}
                caption={r.intake}
                lowStock={r.lowStock}
                href={`${detailBase}/${r.id}`}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
