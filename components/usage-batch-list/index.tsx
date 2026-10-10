"use client";

import { DataTable, type DataTableColumn } from "@/components/data-table";
import { EmptyStateCard } from "@/components/ex-empty-state-card";
import { UsageItemRow } from "@/components/usage-item-row";
import { USAGE_BATCH_TEXT, batchHeading } from "@/lib/usage-batch-rules";
import styles from "./styles.module.css";

export type BatchListItem = {
  id: string;
  name: string;
  stock: number;
  unit: string;
  /** 사용량 입력 값 */
  amount: string;
  /** 서버가 표시한 문제 안내 (저장 실패) */
  flagged?: string | null;
};

type Props = {
  /** cards = 모바일 카드 쌓기 · table = 데스크톱 data-table */
  layout?: "cards" | "table";
  items: readonly BatchListItem[];
  onAmountChange?: (id: string, value: string) => void;
  onRemove?: (id: string) => void;
  /** 모바일 머리 오른쪽 (reagent-add "+ 시약 추가") — 0개일 때는 빈 카드 안에 둔다 */
  addAction?: React.ReactNode;
  /** 빈 값 오류를 처음부터 보여 준다 (갤러리 4-error) */
  showEmptyErrors?: boolean;
  disabled?: boolean;
};

/* 시안 4-desktop 열 폭 (표 안쪽 606 기준: 248 · 120 · 168 · 70) */
const COLUMNS: DataTableColumn[] = [
  { key: "name", label: "시약명", width: "41%" },
  { key: "stock", label: "현재 재고", width: "20%" },
  { key: "amount", label: "사용량", width: "27.5%" },
  { key: "remove", label: "빼기", width: "11.5%" },
];

/**
 * 담은 시약 목록 (디자인 1.25 usage-batch-list, 화면 4). 머리 "담은 시약 N개"(18/700).
 * 모바일 = usage-item-row 카드 쌓기(사이 12), 오른쪽 위 reagent-add. 0개 = ex-empty-state-card "시약을 골라 주세요" + reagent-add.
 * 데스크톱 = data-table 시약명 | 현재 재고 | 사용량 | 빼기. 0개 = 표 안 ex-empty-state-card(+ "위 검색 칸에서 …"). 핑크 없음.
 */
export function UsageBatchList({
  layout = "cards",
  items,
  onAmountChange,
  onRemove,
  addAction,
  showEmptyErrors = false,
  disabled,
}: Props) {
  const heading = <h2 className={styles.heading}>{batchHeading(items.length)}</h2>;

  if (layout === "table") {
    return (
      <section data-component="usage-batch-list" className={styles.root} aria-label={batchHeading(items.length)}>
        {heading}
        <DataTable
          label="담은 시약"
          columns={COLUMNS}
          empty={
            items.length === 0 ? (
              <EmptyStateCard variant="outlined" icon="flask" title={USAGE_BATCH_TEXT.emptyTitle} description={USAGE_BATCH_TEXT.emptyBody}>
                <p className={styles.hint}>{USAGE_BATCH_TEXT.emptyHint}</p>
              </EmptyStateCard>
            ) : undefined
          }
        >
          {items.map((i) => (
            <UsageItemRow
              key={i.id}
              layout="row"
              name={i.name}
              stock={i.stock}
              unit={i.unit}
              amount={i.amount}
              flagged={i.flagged}
              showEmptyError={showEmptyErrors}
              disabled={disabled}
              onAmountChange={(v) => onAmountChange?.(i.id, v)}
              onRemove={() => onRemove?.(i.id)}
            />
          ))}
        </DataTable>
      </section>
    );
  }

  return (
    <section data-component="usage-batch-list" className={styles.root} aria-label={batchHeading(items.length)}>
      <div className={styles.head} data-name="batch-head">
        {heading}
        {items.length > 0 ? addAction : null}
      </div>
      {items.length === 0 ? (
        <EmptyStateCard variant="outlined" title={USAGE_BATCH_TEXT.emptyTitle} description={USAGE_BATCH_TEXT.emptyBody}>
          {addAction}
        </EmptyStateCard>
      ) : (
        <ul className={styles.cards} aria-label="담은 시약">
          {items.map((i) => (
            <UsageItemRow
              key={i.id}
              layout="card"
              name={i.name}
              stock={i.stock}
              unit={i.unit}
              amount={i.amount}
              flagged={i.flagged}
              showEmptyError={showEmptyErrors}
              disabled={disabled}
              onAmountChange={(v) => onAmountChange?.(i.id, v)}
              onRemove={() => onRemove?.(i.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
