"use client";

import { ButtonPillSoft } from "@/components/button-pill-soft";
import { Icon } from "@/components/icons";
import { USAGE_BATCH_TEXT } from "@/lib/usage-batch-rules";
import styles from "./styles.module.css";

type ButtonProps = {
  /** button = 모바일 button-pill-soft "+ 시약 추가" (누르면 바텀시트) */
  variant?: "button";
  onClick?: () => void;
  disabled?: boolean;
  /** 바텀시트가 열려 있음 */
  expanded?: boolean;
  controls?: string;
  className?: string;
};

type SearchProps = {
  /** search = 데스크톱 검색 칸 "시약 추가 — 이름으로 찾기" (아래 드롭다운 reagent-picker) */
  variant: "search";
  value: string;
  onChange?: (value: string) => void;
  onFocus?: () => void;
  /** 칸을 누름 (없으면 onFocus) */
  onPress?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** 드롭다운이 열려 있음 (칸 테두리 ink) */
  expanded?: boolean;
  controls?: string;
  disabled?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  className?: string;
};

/**
 * 시약 추가 (디자인 1.25 reagent-add, 화면 4).
 * 모바일 = button-pill-soft(+ 아이콘 하늘색, "시약 추가") → reagent-picker 바텀시트.
 * 데스크톱 = 전폭 검색 칸(회색 상자 · + 아이콘 · placeholder "시약 추가 — 이름으로 찾기"), 열리면 ink 테두리 + 아래 드롭다운.
 */
export function ReagentAdd(props: ButtonProps | SearchProps) {
  if (props.variant === "search") {
    const { value, onChange, onFocus, onPress, onKeyDown, expanded = false, controls, disabled, inputRef, className } = props;
    return (
      <div
        data-component="reagent-add"
        data-open={expanded ? "" : undefined}
        className={[styles.search, expanded ? styles.open : "", className ?? ""].filter(Boolean).join(" ")}
      >
        <Icon name="plus" className={styles.icon} />
        <input
          ref={inputRef}
          className={styles.input}
          type="search"
          role="combobox"
          aria-label={USAGE_BATCH_TEXT.add}
          aria-expanded={expanded}
          aria-controls={controls}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder={USAGE_BATCH_TEXT.addSearch}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.value)}
          readOnly={onChange ? undefined : true}
          onFocus={onFocus}
          onClick={onPress ?? onFocus}
          onKeyDown={onKeyDown}
        />
      </div>
    );
  }
  const { onClick, disabled, expanded, controls, className } = props;
  return (
    <span data-component="reagent-add" className={[styles.wrap, className ?? ""].filter(Boolean).join(" ")}>
      <ButtonPillSoft
        className={styles.button}
        onClick={onClick}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={expanded}
        aria-controls={controls}
      >
        <Icon name="plus" className={styles.icon} />
        {USAGE_BATCH_TEXT.add}
      </ButtonPillSoft>
    </span>
  );
}
