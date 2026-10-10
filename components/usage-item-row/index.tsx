"use client";

import { useId, useState } from "react";
import { UsageOverStock } from "@/components/usage-over-stock";
import {
  USAGE_BATCH_TEXT,
  checkAmount,
  currentStockText,
  overStockText,
  stockText,
} from "@/lib/usage-batch-rules";
import styles from "./styles.module.css";

type Props = {
  /** card = 모바일 카드(canvas-soft, rounded.sm) · row = 데스크톱 data-table 한 행 (+ 오류 줄) */
  layout?: "card" | "row";
  name: string;
  stock: number;
  unit: string;
  /** 사용량 입력 값 (쓰는 그대로) */
  amount: string;
  onAmountChange?: (value: string) => void;
  onRemove?: () => void;
  /** 처음부터 빈 값 오류를 보여 준다 (서버 거절 · 갤러리) */
  showEmptyError?: boolean;
  /** 서버가 이 행을 문제로 표시한 안내 (저장 실패 — 한 트랜잭션 전부 취소). 칸 오류가 없을 때 그 자리에 보인다 */
  flagged?: string | null;
  disabled?: boolean;
  /** 입력 칸 포커스용 */
  inputRef?: React.Ref<HTMLInputElement>;
};

/**
 * 담은 시약 한 줄 (디자인 1.25 usage-item-row, 화면 4).
 * card(모바일 4-mobile): canvas-soft 카드 · radius 16 · 안쪽 16 · 사이 8 — row-head(시약명 17/600 + "현재 1,200 mL" 12 회색 · 조용한 "빼기")
 *   → amount-row(흰 입력 칸 + 단위 12 회색) → (사용량 > 재고) usage-over-stock / (빈 값·0) 입력 칸 두 줄 굵기 ink 테두리 + "사용량을 적어 주세요".
 * row(데스크톱 4-desktop): 시약명 17/600 | 현재 재고 13 회색 | 사용량 입력(120) + 단위 | 빼기 — 오류는 그 아래 error-row.
 * 빈 값 오류는 칸을 한 번 떠난 뒤(또는 showEmptyError)에만, 재고 초과는 바로 보인다.
 */
export function UsageItemRow({
  layout = "card",
  name,
  stock,
  unit,
  amount,
  onAmountChange,
  onRemove,
  showEmptyError = false,
  flagged = null,
  disabled,
  inputRef,
}: Props) {
  const [touched, setTouched] = useState(false);
  const errorId = useId();
  const check = checkAmount(amount, stock);
  const emptyError = (touched || showEmptyError || Boolean(flagged)) && (check.kind === "empty" || check.kind === "invalid");
  const over = check.kind === "over";
  const invalid = emptyError || over || Boolean(flagged);
  const errorText = check.kind === "invalid" ? USAGE_BATCH_TEXT.amountNumber : USAGE_BATCH_TEXT.amountRequired;

  const input = (
    <div
      data-component="text-input"
      className={[styles.inputBox, emptyError ? styles.inputError : "", layout === "row" ? styles.inputCell : ""].filter(Boolean).join(" ")}
    >
      <input
        ref={inputRef}
        className={styles.input}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        aria-label={`${name} 사용량`}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={invalid ? errorId : undefined}
        value={amount}
        disabled={disabled}
        onChange={(e) => onAmountChange?.(e.target.value)}
        onBlur={() => setTouched(true)}
      />
    </div>
  );

  const removeButton = (
    <button type="button" className={styles.remove} onClick={onRemove} disabled={disabled} aria-label={`${name} 빼기`} data-name="remove-link">
      {USAGE_BATCH_TEXT.remove}
    </button>
  );

  const error = over ? (
    <UsageOverStock id={errorId}>{overStockText(stock, unit)}</UsageOverStock>
  ) : emptyError ? (
    <p id={errorId} role="alert" className={styles.fieldError} data-name="field-error">
      {errorText}
    </p>
  ) : flagged ? (
    <p id={errorId} role="alert" className={styles.fieldError} data-name="field-error">
      {flagged}
    </p>
  ) : null;

  if (layout === "row") {
    return (
      <>
        <tr
          data-component="usage-item-row"
          data-flagged={flagged ? "" : undefined}
          className={[styles.tr, error ? styles.trWithError : ""].filter(Boolean).join(" ")}
        >
          <td className={styles.td}>
            <span className={styles.name}>{name}</span>
          </td>
          <td className={[styles.td, styles.stockCell].join(" ")}>{stockText(stock, unit)}</td>
          <td className={styles.td}>
            <span className={styles.amountCell}>
              {input}
              <span className={styles.unit}>{unit}</span>
            </span>
          </td>
          <td className={styles.td}>{removeButton}</td>
        </tr>
        {error ? (
          <tr className={styles.errorTr} data-name="error-row">
            <td colSpan={4} className={styles.errorTd}>
              {error}
            </td>
          </tr>
        ) : null}
      </>
    );
  }

  return (
    <li data-component="usage-item-row" data-flagged={flagged ? "" : undefined} className={styles.card}>
      <div className={styles.head} data-name="row-head">
        <div className={styles.nameCol} data-name="name-col">
          <span className={styles.name}>{name}</span>
          <span className={styles.caption}>{currentStockText(stock, unit)}</span>
        </div>
        {removeButton}
      </div>
      <div className={styles.amountRow} data-name="amount-row">
        {input}
        <span className={styles.unit}>{unit}</span>
      </div>
      {error}
    </li>
  );
}
