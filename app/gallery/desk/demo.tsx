"use client";

import { useState } from "react";
import { BadgeLowStock } from "@/components/badge-low-stock";
import { ButtonOutline } from "@/components/button-outline";
import { ButtonPrimary } from "@/components/button-primary";
import { CabinetNumber } from "@/components/cabinet-number";
import {
  DataTable,
  DataTableButtonCell,
  DataTableCell,
  DataTableGroupRow,
  DataTablePagination,
  DataTableRow,
  DataTableRowMenu,
  type DataTableColumn,
} from "@/components/data-table";
import { DetailDrawer, DrawerActionRow, DrawerField, DrawerRow, DrawerRows } from "@/components/detail-drawer";
import { EmptyStateCard } from "@/components/ex-empty-state-card";
import { StorageClassChip } from "@/components/storage-class-chip";
import { TextInput } from "@/components/text-input";
import styles from "./desk.module.css";

type Sample = { id: string; name: string; cls: string; cab: number | null; loc: string; stock: string; low: boolean; intake: string; msds: boolean };

// 시안 2-desktop 표 예시 (일부)
const SAMPLE: Sample[] = [
  { id: "1", name: "과망가니즈산칼륨", cls: "산화제", cab: 2, loc: "2번 시약장 · 좌 1단", stock: "25 g", low: false, intake: "2026-08-20", msds: true },
  { id: "2", name: "과산화수소", cls: "산화제", cab: 1, loc: "1번 시약장 · 우 1단", stock: "2병", low: true, intake: "2026-09-14", msds: true },
  { id: "3", name: "아세트산", cls: "산", cab: null, loc: "칸 없음", stock: "450 mL", low: false, intake: "2026-08-28", msds: false },
  { id: "4", name: "에탄올", cls: "인화성", cab: 1, loc: "1번 시약장 · 좌 3단", stock: "200 mL", low: true, intake: "2026-08-11", msds: true },
];

const W = { name: "18%", cls: "10.5%", loc: "23.5%", stock: "11%", status: "12.5%", intake: "15.5%", msds: "9%" };

/** data-table 예시: 정렬(누르면 바뀜) · 선택 행 · 재고 부족 · 칸 없음 · MSDS 없음 · 쪽 번호 */
export function ReagentTableDemo() {
  const [sort, setSort] = useState<"name" | "stock" | "intake">("name");
  const [selected, setSelected] = useState("2");
  const [page, setPage] = useState(1);
  const columns: DataTableColumn[] = [
    { key: "name", label: "시약명", width: W.name, sort: sort === "name" ? "asc" : "none", onSort: () => setSort("name") },
    { key: "class", label: "보관 분류", width: W.cls },
    { key: "location", label: "보관 위치", width: W.loc },
    { key: "stock", label: "재고", width: W.stock, sort: sort === "stock" ? "asc" : "none", onSort: () => setSort("stock") },
    { key: "status", label: "상태", width: W.status },
    { key: "intake", label: "최근 입고일", width: W.intake, sort: sort === "intake" ? "desc" : "none", onSort: () => setSort("intake") },
    { key: "msds", label: "MSDS", width: W.msds },
  ];
  return (
    <>
      <DataTable label="시약 목록 (예시)" columns={columns}>
        {SAMPLE.map((r) => (
          <DataTableRow key={r.id} selected={r.id === selected} clickable>
            <DataTableButtonCell current={r.id === selected} onClick={() => setSelected(r.id)}>
              {r.name}
            </DataTableButtonCell>
            <DataTableCell>{r.cls}</DataTableCell>
            <DataTableCell tone={r.cab ? "default" : "muted"}>
              <span className={styles.location}>
                {r.cab ? <CabinetNumber number={r.cab} /> : null}
                <span>{r.loc}</span>
              </span>
            </DataTableCell>
            <DataTableCell>{r.stock}</DataTableCell>
            <DataTableCell>{r.low ? <BadgeLowStock /> : null}</DataTableCell>
            <DataTableCell>{r.intake}</DataTableCell>
            <DataTableCell tone={r.msds ? "default" : "muted"}>{r.msds ? "있음" : "없음"}</DataTableCell>
          </DataTableRow>
        ))}
      </DataTable>
      <DataTablePagination page={page} pageCount={3} onPage={setPage} label="예시 쪽" />
    </>
  );
}

/** data-table 빈 상태 (시안 2-filter-empty: 머리행 아래 ex-empty-state-card) */
export function EmptyTableDemo() {
  return (
    <DataTable
      label="시약 목록 (빈 예시)"
      columns={[
        { key: "name", label: "시약명", width: "40%" },
        { key: "stock", label: "재고", width: "30%" },
        { key: "msds", label: "MSDS", width: "30%" },
      ]}
      empty={
        <EmptyStateCard variant="outlined" title="조건에 맞는 시약이 없어요" description="칩을 하나씩 빼거나 필터를 지워 보세요">
          <ButtonOutline>필터 지우기</ButtonOutline>
        </EmptyStateCard>
      }
    />
  );
}

const noop = () => undefined;

/** data-table 묶음 머리 행 + 두 줄 행 (시안 10-desktop) · 행 끝 더보기 (시안 8·9-desktop) */
export function GroupTableDemo() {
  return (
    <>
      <DataTable
        label="사용 기록 (예시)"
        columns={[
          { key: "day", label: "사용일", width: "20%", sort: "desc", onSort: noop },
          { key: "name", label: "시약명", width: "32%" },
          { key: "user", label: "사용자", width: "22%" },
          { key: "amount", label: "사용량", width: "16%" },
          { key: "time", label: "기록 시각", width: "10%" },
        ]}
      >
        <DataTableGroupRow label="10월 7일 · 오늘" colSpan={5} />
        <DataTableRow selected>
          <DataTableCell>10월 7일</DataTableCell>
          <DataTableButtonCell current onClick={noop}>
            염산
          </DataTableButtonCell>
          <DataTableCell>학생 이OO</DataTableCell>
          <DataTableCell>20 mL</DataTableCell>
          <DataTableCell>14:05</DataTableCell>
        </DataTableRow>
        <DataTableGroupRow label="10월 3일" colSpan={5} />
        <DataTableRow tall>
          <DataTableCell>10월 3일</DataTableCell>
          <DataTableButtonCell caption="10월 7일에 기록" onClick={noop}>
            에탄올
          </DataTableButtonCell>
          <DataTableCell>교사 김OO</DataTableCell>
          <DataTableCell>50 mL</DataTableCell>
          <DataTableCell>09:30</DataTableCell>
        </DataTableRow>
      </DataTable>
      <DataTable
        label="판매처 (예시)"
        columns={[
          { key: "name", label: "판매처명", width: "58%", sort: "asc", onSort: noop },
          { key: "contact", label: "연락처", width: "32%" },
          { key: "more", label: "", width: "10%", align: "end" },
        ]}
      >
        <DataTableRow>
          <DataTableCell>과학교재사</DataTableCell>
          <DataTableCell>043-210-1100</DataTableCell>
          <DataTableCell align="end">
            <DataTableRowMenu
              label="과학교재사 더보기"
              items={[
                { label: "수정", onSelect: noop },
                { label: "삭제", onSelect: noop },
              ]}
            />
          </DataTableCell>
        </DataTableRow>
      </DataTable>
    </>
  );
}

/** detail-drawer 예시: drawer-head(제목 + ×) · 상태 칩 · 정보 줄 · 버튼 줄 (시안 3-desktop) */
export function DetailDrawerDemo() {
  return (
    <div className={styles.drawerStage}>
      <DetailDrawer
        inline
        title="과산화수소"
        closeHref="/gallery/desk"
        actions={
          <DrawerActionRow>
            <ButtonPrimary>사용 기록</ButtonPrimary>
            <ButtonOutline>입고</ButtonOutline>
          </DrawerActionRow>
        }
      >
        <div className={styles.chips}>
          <BadgeLowStock />
          <StorageClassChip readOnly label="산화제" />
        </div>
        <DrawerRows label="시약 정보 (예시)">
          <DrawerRow label="현재 재고" display unit="병">
            2
          </DrawerRow>
          <DrawerRow label="입고일">2026-09-14</DrawerRow>
          <DrawerRow label="CAS 번호">7722-84-1</DrawerRow>
        </DrawerRows>
      </DetailDrawer>
    </div>
  );
}

/** detail-drawer 예시: drawer-nav(뒤로 + ×) → drawer-title(제목 + 캡션) → form-row (시안 4-desktop) */
export function FormDrawerDemo() {
  return (
    <div className={styles.drawerStage}>
      <DetailDrawer
        inline
        title="사용 기록"
        caption="에탄올 · 현재 1,200 mL"
        back={{ href: "/gallery/desk", label: "시약 상세" }}
        closeHref="/gallery/desk"
        actions={<ButtonPrimary>사용 기록 저장</ButtonPrimary>}
      >
        <DrawerRows name="usage-form">
          <DrawerField label="사용량" required htmlFor="g-desk-amount">
            <TextInput id="g-desk-amount" aria-label="사용량" defaultValue="50" unit="mL" />
          </DrawerField>
          <DrawerField label="메모" htmlFor="g-desk-memo">
            <TextInput id="g-desk-memo" aria-label="메모" placeholder="메모를 남겨 주세요" />
          </DrawerField>
        </DrawerRows>
      </DetailDrawer>
    </div>
  );
}
