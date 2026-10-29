"use client";

import { useId, useState } from "react";
import { Icon } from "@/components/icons";
import styles from "@/components/terms-agree/styles.module.css";

export const AGE_CONFIRM_TEXT = {
  label: "만 14세 이상입니다 (필수)",
  detail: "만 14세 미만은 보호자 동의가 필요해서 Lab_Stock에 가입할 수 없어요.",
} as const;

type Props = {
  /** 제어 값 (terms-agree). 없으면 스스로 쥔다 (defaultChecked — 갤러리) */
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  /** 펼침 상태를 부르는 쪽이 쥘 때 (terms-agree — 한 번에 하나만 펼침). 없으면 스스로 */
  open?: boolean;
  onToggle?: () => void;
  /** 갤러리 예시 — 처음부터 펼친 모습 */
  defaultOpen?: boolean;
};

/**
 * age-confirm (rules 1.32 privacy_consent.age_confirm, 시안 14-consent): terms-agree 안 '만 14세 이상입니다 (필수)' 행.
 * › 를 누르면 행 아래 canvas-soft 상자에 한 줄, 펼친 행의 › 는 ⌄. 체크하지 않으면 signup-error-summary '약관에 동의해 주세요'.
 */
export function AgeConfirm({ checked: outer, defaultChecked = false, onChange, open, onToggle, defaultOpen = false }: Props) {
  const [innerChecked, setInnerChecked] = useState(defaultChecked);
  const checked = outer ?? innerChecked;
  const [innerOpen, setInnerOpen] = useState(defaultOpen);
  const isOpen = open ?? innerOpen;
  const detailId = useId();
  const toggle = () => (onToggle ? onToggle() : setInnerOpen((o) => !o));
  return (
    <div data-component="age-confirm" className={styles.termItem}>
      <div className={styles.termRow}>
        <label className={styles.termLabelWrap}>
          <input
            type="checkbox"
            data-term="age"
            className={styles.checkInput}
            checked={checked}
            onChange={(e) => {
              if (outer === undefined) setInnerChecked(e.target.checked);
              onChange?.(e.target.checked);
            }}
          />
          <span className={styles.checkHit} aria-hidden="true">
            <span className={styles.checkCircle}>
              <Icon name="check" className={styles.checkIcon} />
            </span>
          </span>
          <span className={styles.termLabel}>{AGE_CONFIRM_TEXT.label}</span>
        </label>
        <button
          type="button"
          className={styles.termView}
          aria-expanded={isOpen}
          aria-controls={detailId}
          aria-label={`${AGE_CONFIRM_TEXT.label} 내용 보기`}
          onClick={toggle}
        >
          <Icon name={isOpen ? "chevron-down" : "chevron-right"} className={styles.termViewIcon} />
        </button>
      </div>
      {isOpen ? (
        <div className={styles.detailWrap}>
          <p id={detailId} className={styles.termSummary}>
            {AGE_CONFIRM_TEXT.detail}
          </p>
        </div>
      ) : null}
    </div>
  );
}
