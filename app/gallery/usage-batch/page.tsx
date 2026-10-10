import type { Metadata } from "next";
import { ClassLabel } from "@/components/class-label";
import { DeletedReagentTag } from "@/components/deleted-reagent-tag";
import { DataRecordRow } from "@/components/ex-data-table-cell";
import { RecentClassChip } from "@/components/recent-class-chip";
import { ReagentAdd } from "@/components/reagent-add";
import { UsageItemRow } from "@/components/usage-item-row";
import { UsageOverStock } from "@/components/usage-over-stock";
import { overStockText } from "@/lib/usage-batch-rules";
import styles from "../gallery.module.css";
import {
  BatchListDemo,
  ClassFilterDemo,
  ClassSelectDemo,
  DeleteConfirmDemo,
  MoreMenuDemo,
  PickerDropdownDemo,
  PickerSheetDemo,
} from "./demo";

export const metadata: Metadata = { title: "여러 시약 사용 기록 · 시약 삭제 · 수업 컴포넌트 · Lab_Stock" };

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
 * 디자인 1.25 새 컴포넌트 갤러리 (d7 §24):
 * 화면 4 reagent-picker · reagent-add · usage-batch-list · usage-item-row · usage-over-stock · class-select · recent-class-chip,
 * 화면 10 class-label · class-filter · deleted-reagent-tag, 화면 3 reagent-more-menu · reagent-delete. 저장·DB 없음.
 */
export default function GalleryUsageBatchPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>여러 시약 사용 기록 · 시약 삭제 · 수업 (화면 3 · 4 · 10)</h1>
      <p className={styles.lead}>
        reagent-picker · reagent-add · usage-batch-list · usage-item-row · usage-over-stock · class-select · recent-class-chip ·
        class-label · class-filter · deleted-reagent-tag · reagent-more-menu · reagent-delete
      </p>

      <div className={styles.grid}>
        <Item id="add" name="reagent-add — 모바일 버튼 · 데스크톱 검색 칸 (4 · 4-empty)">
          <div className={styles.row}>
            <ReagentAdd />
            <ReagentAdd disabled />
          </div>
          <ReagentAdd variant="search" value="" />
        </Item>

        <Item id="picker-sheet" name="reagent-picker — 모바일 바텀시트 (4-picker-mobile: 담음 · 체크 2 · 2개 담기)">
          <PickerSheetDemo />
        </Item>

        <Item id="picker-dropdown" name="reagent-picker — 데스크톱 검색 아래 드롭다운 (4-picker-desktop)">
          <PickerDropdownDemo />
        </Item>

        <Item id="list-cards" name="usage-batch-list — 모바일 카드 (4-mobile)">
          <BatchListDemo layout="cards" />
        </Item>

        <Item id="list-table" name="usage-batch-list — 데스크톱 data-table (4-desktop)">
          <BatchListDemo layout="table" />
        </Item>

        <Item id="list-error" name="usage-batch-list · usage-item-row · usage-over-stock — 오류 (4-error: 재고 초과 · 빈 값)">
          <BatchListDemo layout="cards" error />
          <BatchListDemo layout="table" error />
        </Item>

        <Item id="list-empty" name="usage-batch-list — 0개 (4-empty: ex-empty-state-card + reagent-add)">
          <BatchListDemo layout="cards" empty />
          <BatchListDemo layout="table" empty />
        </Item>

        <Item id="row" name="usage-item-row — 한 줄 (카드)">
          <ul style={{ margin: 0, padding: 0 }}>
            <UsageItemRow name="에탄올" stock={1200} unit="mL" amount="50" />
          </ul>
        </Item>

        <Item id="over" name="usage-over-stock — mix-warning 모양 (accent-soft · 핑크 아이콘)">
          <UsageOverStock>{overStockText(120, "mL")}</UsageOverStock>
        </Item>

        <Item id="class-select" name="class-select — 빈 값 · 최근 칩 고름 (4 · 4-empty)">
          <ClassSelectDemo />
          <ClassSelectDemo filled />
        </Item>

        <Item id="recent-chip" name="recent-class-chip — 기본 · 고름">
          <div className={styles.row}>
            <RecentClassChip label="1학년 2반 · 통합과학" selected />
            <RecentClassChip label="1학년 3반 · 통합과학" />
            <RecentClassChip label="2학년 1반 · 화학" />
          </div>
        </Item>

        <Item id="class-label" name="class-label — 모바일 caption · 표 칸 · 드로어 값 · 없음">
          <ClassLabel value={{ grade: 1, classNo: 2, subject: "통합과학" }} />
          <ClassLabel value={{ grade: 2, classNo: 1, subject: null }} variant="cell" />
          <ClassLabel value={{ grade: null, classNo: null, subject: "통합과학" }} variant="value" />
          <ClassLabel value={null} variant="cell" />
        </Item>

        <Item id="class-filter" name="class-filter — 닫힘 · 학년 고름(반 줄 열림)">
          <ClassFilterDemo />
          <ClassFilterDemo open />
        </Item>

        <Item id="deleted" name="deleted-reagent-tag — 화면 10 기록 행 (시약명 회색 + 태그)">
          <DeletedReagentTag />
          <DataRecordRow
            title="과망가니즈산 칼륨"
            titleMuted
            titleAddon={<DeletedReagentTag />}
            subtitle="교사 박OO · 09:40"
            amount="5 g"
          />
          <DataRecordRow
            title="에탄올"
            subtitle="교사 김OO · 14:05"
            extra={<ClassLabel value={{ grade: 1, classNo: 2, subject: "통합과학" }} />}
            amount="50 mL"
          />
        </Item>

        <Item id="more-menu" name="reagent-more-menu · reagent-delete — 닫힘 · 열림 (3-delete)">
          <MoreMenuDemo />
          <MoreMenuDemo open />
        </Item>

        <Item id="delete-confirm" name="시약 삭제 확인 (ex-modal-card, 3-delete — 검정 삭제 · 핑크 없음)">
          <DeleteConfirmDemo />
        </Item>
      </div>
    </main>
  );
}
