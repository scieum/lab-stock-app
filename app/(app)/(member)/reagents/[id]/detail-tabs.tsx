"use client";

import { useState } from "react";
import { DataTable, DataTableRow } from "@/components/ex-data-table";
import { DataTableCell } from "@/components/ex-data-table-cell";
import { SegmentedControl, type SegmentOption } from "@/components/segmented-control";
import type { ReagentUsageRow } from "@/lib/supabase/reagent-detail";
import styles from "./detail.module.css";

export type InfoRow = { label: string; value: string };

type Tab = "info" | "usage";

// 시안 3: 정보 · 사용 기록 (사용 기록이 선택된 상태)
const TABS: SegmentOption[] = [
  { value: "info", label: "정보" },
  { value: "usage", label: "사용 기록" },
];

type Props = { info: InfoRow[]; usage: ReagentUsageRow[] };

/** 시약 상세 탭 — 정보 표 / 최근 사용 기록 표 */
export function DetailTabs({ info, usage }: Props) {
  const [tab, setTab] = useState<Tab>("usage");

  return (
    <>
      <SegmentedControl
        options={TABS}
        value={tab}
        onChange={(v) => setTab(v === "info" ? "info" : "usage")}
        variant="indicator"
        label="시약 상세 탭"
      />
      {tab === "usage" ? (
        <div className={styles.panel} role="tabpanel" aria-label="사용 기록">
          <DataTable
            label="최근 사용 기록"
            head={
              <>
                <DataTableCell variant="header">사용 날짜</DataTableCell>
                <DataTableCell variant="header">사용자</DataTableCell>
                <DataTableCell variant="header">사용량</DataTableCell>
              </>
            }
          >
            {usage.map((u, i) => (
              <DataTableRow key={u.id} selected={i === 0}>
                <DataTableCell>{u.date}</DataTableCell>
                <DataTableCell>{u.user}</DataTableCell>
                <DataTableCell>{u.amount}</DataTableCell>
              </DataTableRow>
            ))}
          </DataTable>
          {usage.length === 0 ? <p className={styles.empty}>아직 사용 기록이 없어요</p> : null}
        </div>
      ) : (
        <div className={styles.panel} role="tabpanel" aria-label="정보">
          <DataTable
            label="시약 정보"
            head={
              <>
                <DataTableCell variant="header">항목</DataTableCell>
                <DataTableCell variant="header">내용</DataTableCell>
              </>
            }
          >
            {info.map((r) => (
              <DataTableRow key={r.label}>
                <DataTableCell>{r.label}</DataTableCell>
                <DataTableCell>{r.value}</DataTableCell>
              </DataTableRow>
            ))}
          </DataTable>
        </div>
      )}
    </>
  );
}
