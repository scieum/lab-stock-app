import type { Metadata } from "next";
import { FilterChipRow } from "@/components/filter-chip-row";
import { ListFilterButton } from "@/components/list-filter-button";
import { PastDateNote } from "@/components/past-date-note";
import { StorageClassChip } from "@/components/storage-class-chip";
import { EMPTY_LIST_FILTER } from "@/lib/reagent-list-filter";
import styles from "../gallery.module.css";
import { ListFilterFlowDemo, ListFilterSheetDemo, UsageDateDemo } from "./demo";

export const metadata: Metadata = { title: "시약 목록 필터 · 사용일 컴포넌트 · Lab_Stock" };

function Item({ id, name, children }: { id: string; name: string; children: React.ReactNode }) {
  return (
    <section className={styles.item} aria-labelledby={`g-${id}`}>
      <h2 id={`g-${id}`} className={styles.itemName}>
        {name}
      </h2>
      <div className={styles.stage}>{children}</div>
    </section>
  );
}

/**
 * 디자인 1.17 새 컴포넌트 갤러리 (d7 §15·§16):
 * 화면 2 list-filter-button · list-filter-sheet · filter-chip-row · storage-class-chip(필터 칩) · ex-empty-state-card(필터 0종),
 * 화면 4 usage-date · past-date-note. 저장·DB 없음.
 */
export default function GalleryFilterPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>시약 목록 필터 · 사용일 (화면 2 · 4)</h1>
      <p className={styles.lead}>
        list-filter-button · list-filter-sheet · filter-chip-row · storage-class-chip · ex-empty-state-card · usage-date · past-date-note
      </p>

      <div className={styles.grid}>
        <Item id="button" name="list-filter-button — 적용 0 · 1 · 2 (시안 2 · 2-filter · 2-filter-empty)">
          <div className={styles.row}>
            <ListFilterButton />
            <ListFilterButton count={1} />
            <ListFilterButton count={2} />
          </div>
        </Item>

        <Item id="chips" name="filter-chip-row — 시안 2-filter(산 · 12종) · 2-filter-empty(독성 · 2번 시약장 · 0종)">
          <FilterChipRow chips={[{ key: "class:산", label: "산" }]} count={12} />
          <FilterChipRow
            chips={[
              { key: "class:독성", label: "독성" },
              { key: "location", label: "2번 시약장", cabinetNumber: 2 },
            ]}
            count={0}
          />
        </Item>

        <Item id="class-chip" name="storage-class-chip — 필터 시트 크기 (미선택 · 선택)">
          <div className={styles.row}>
            <StorageClassChip size="filter" label="유기" />
            <StorageClassChip size="filter" label="산" selected />
            <StorageClassChip size="filter" label="분류 없음" />
          </div>
        </Item>

        <Item id="sheet" name="list-filter-sheet — 시안 2-filter (재고 적은 순 · 산 · 산화제 고르는 중)">
          <ListFilterSheetDemo />
        </Item>

        <Item id="sheet-empty" name="list-filter-sheet — 기본값 (이름순 · 고른 것 없음)">
          <ListFilterSheetDemo initial={EMPTY_LIST_FILTER} />
        </Item>

        <Item id="flow" name="필터 동작 — 버튼 → 시트 → 칩 줄 → 목록 / 0종이면 빈 상태 + 필터 지우기">
          <ListFilterFlowDemo />
        </Item>

        <Item id="empty" name="ex-empty-state-card — 필터 결과 0종 (시안 2-filter-empty: 독성 · 2번 시약장)">
          <ListFilterFlowDemo initial={{ ...EMPTY_LIST_FILTER, classes: ["독성"], cabinetId: "fc-2" }} />
        </Item>

        <Item id="usage-date" name="usage-date + past-date-note — 시안 4-past-date (2026-10-03, 오늘 2026-10-07)">
          <UsageDateDemo />
        </Item>

        <Item id="usage-date-today" name="usage-date — 오늘 (안내 없음)">
          <UsageDateDemo initial="2026-10-07" />
        </Item>

        <Item id="past-note" name="past-date-note">
          <PastDateNote>10월 3일 사용으로 기록해요</PastDateNote>
        </Item>
      </div>
    </main>
  );
}
