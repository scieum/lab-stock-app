"use client";

import { useId, useState } from "react";
import { AgeConfirm } from "@/components/age-confirm";
import { Icon } from "@/components/icons";
import { PrivacyConsentDetail } from "@/components/privacy-consent-detail";
import styles from "./styles.module.css";

export type TermsAgreeValue = { terms: boolean; privacy: boolean; age: boolean };
type TermKey = keyof TermsAgreeValue;

export const TERMS_TEXT = {
  legend: "약관 동의",
  all: "모두 동의",
  terms: "서비스 이용약관 동의 (필수)",
  termsSummary: "Lab_Stock은 학교 과학실 시약 재고를 학교별로 관리하는 서비스예요. 계정은 가입할 때 고른 학교에만 연결돼요.",
  privacy: "개인정보 수집·이용 동의 (필수)",
} as const;

const NONE: TermsAgreeValue = { terms: false, privacy: false, age: false };

type Props = {
  /** 제어 값 (가입 폼). 없으면 스스로 쥔다 (defaultValue — 갤러리) */
  value?: TermsAgreeValue;
  defaultValue?: TermsAgreeValue;
  onChange?: (next: TermsAgreeValue) => void;
  /** 칸 아래 오류 (signup-rules 'terms') */
  error?: string;
  /** 갤러리 예시 — 처음부터 펼친 행 */
  defaultOpen?: TermKey | null;
};

/**
 * terms-agree (rules 1.32 privacy_consent.rows, 시안 14 · 14-consent): 모두 동의 + 서비스 이용약관(필수) + 개인정보 수집·이용(필수)
 * + age-confirm. '모두 동의'가 셋 다 체크. 행 › 를 누르면 그 행 아래 펼침(한 번에 하나) — 개인정보 행은 privacy-consent-detail.
 * 체크 상자는 data-term 을 가진다 (가입 폼의 첫 오류 칸 포커스가 찾는다).
 */
export function TermsAgree({ value: outer, defaultValue = NONE, onChange: outerChange, error, defaultOpen = null }: Props) {
  const [inner, setInner] = useState<TermsAgreeValue>(defaultValue);
  const value = outer ?? inner;
  const onChange = (next: TermsAgreeValue) => {
    if (outer === undefined) setInner(next);
    outerChange?.(next);
  };
  const [open, setOpen] = useState<TermKey | null>(defaultOpen);
  const baseId = useId();
  const allAgreed = value.terms && value.privacy && value.age;
  const toggleOpen = (k: TermKey) => setOpen((o) => (o === k ? null : k));
  const set = (k: TermKey, v: boolean) => onChange({ ...value, [k]: v });

  const row = (k: "terms" | "privacy", label: string, detail: React.ReactNode) => {
    const detailId = `${baseId}-${k}`;
    return (
      <div className={styles.termItem}>
        <div className={styles.termRow}>
          <label className={styles.termLabelWrap}>
            <input
              type="checkbox"
              data-term={k}
              className={styles.checkInput}
              checked={value[k]}
              onChange={(e) => set(k, e.target.checked)}
            />
            <span className={styles.checkHit} aria-hidden="true">
              <span className={styles.checkCircle}>
                <Icon name="check" className={styles.checkIcon} />
              </span>
            </span>
            <span className={styles.termLabel}>{label}</span>
          </label>
          <button
            type="button"
            className={styles.termView}
            aria-expanded={open === k}
            aria-controls={detailId}
            aria-label={`${label} 내용 보기`}
            onClick={() => toggleOpen(k)}
          >
            <Icon name={open === k ? "chevron-down" : "chevron-right"} className={styles.termViewIcon} />
          </button>
        </div>
        {open === k ? <div className={styles.detailWrap}>{detail}</div> : null}
      </div>
    );
  };

  return (
    <fieldset data-component="terms-agree" className={styles.terms} data-name="terms">
      <legend className={styles.srOnly}>{TERMS_TEXT.legend}</legend>
      <label className={styles.termAll}>
        <input
          type="checkbox"
          className={styles.checkInput}
          checked={allAgreed}
          onChange={() => onChange({ terms: !allAgreed, privacy: !allAgreed, age: !allAgreed })}
        />
        <span className={styles.checkHit} aria-hidden="true">
          <span className={styles.checkCircle}>
            <Icon name="check" className={styles.checkIcon} />
          </span>
        </span>
        <span className={styles.termAllLabel}>{TERMS_TEXT.all}</span>
      </label>
      <hr className={styles.divider} />
      {row(
        "terms",
        TERMS_TEXT.terms,
        <p id={`${baseId}-terms`} className={styles.termSummary}>
          {TERMS_TEXT.termsSummary}
        </p>,
      )}
      {row("privacy", TERMS_TEXT.privacy, <PrivacyConsentDetail id={`${baseId}-privacy`} />)}
      <AgeConfirm checked={value.age} onChange={(v) => set("age", v)} open={open === "age"} onToggle={() => toggleOpen("age")} />
      {error ? <p className={styles.error}>{error}</p> : null}
    </fieldset>
  );
}
