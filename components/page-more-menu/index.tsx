"use client";

import { ReagentMoreMenu } from "@/components/reagent-more-menu";
import styles from "./styles.module.css";

type Props = {
  /** 메뉴 항목 (reagent-wipe · record-wipe 의 메뉴 항목) */
  children: React.ReactNode;
  label?: string;
  /** 갤러리 예시 — 처음부터 열린 메뉴 */
  defaultOpen?: boolean;
  className?: string;
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
};

/**
 * page-more-menu (rules 1.29 wipe.entry, 시안 2-wipe · 10-record-wipe list-head): 화면 2·10 페이지 머리 오른쪽 ⋯ 44 원형 버튼 →
 * 작은 메뉴(reagent-more-menu 와 같은 모양 — canvas · radius 16 · hairline-soft · 그림자 없음). admin 에게만 그린다
 * (R8 교사 0 · R5 학생 0 · 둘러보기 숨김). 두 폭 같은 자리. 선택 모드와 섞지 않는다(부르는 쪽이 선택 모드에서는 그리지 않는다).
 */
export function PageMoreMenu({ children, label = "더보기", defaultOpen, className, buttonRef }: Props) {
  return (
    <div data-component="page-more-menu" className={[styles.wrap, className ?? ""].filter(Boolean).join(" ")}>
      <ReagentMoreMenu component={null} label={label} defaultOpen={defaultOpen} buttonRef={buttonRef}>
        {children}
      </ReagentMoreMenu>
    </div>
  );
}

type ItemProps = {
  /** 이 항목의 시안 이름 (reagent-wipe · record-wipe) */
  "data-component": "reagent-wipe" | "record-wipe";
  label: string;
  /** 지울 것이 0건 — 항목 비활성(text-faint) + caption 이유 */
  disabled?: boolean;
  /** 비활성 이유 ('지울 시약이 없어요' · '지울 기록이 없어요') */
  disabledCaption?: string;
  onSelect?: () => void;
};

/** page-more-menu 안 항목 — ink 15/600, 비활성이면 text-faint + 아래 caption 이유 (rules wipe.empty) */
export function PageMoreMenuItem({ "data-component": component, label, disabled = false, disabledCaption, onSelect }: ItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      data-component={component}
      className={styles.item}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onSelect}
    >
      <span className={styles.label}>{label}</span>
      {disabled && disabledCaption ? <span className={styles.caption}>{disabledCaption}</span> : null}
    </button>
  );
}
