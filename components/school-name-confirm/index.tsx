"use client";

import { useId } from "react";
import { TextInput } from "@/components/text-input";
import { SCHOOL_NAME_TEXT, schoolNameConfirmCaption, schoolNameState } from "@/lib/wipe-rules";
import styles from "./styles.module.css";

type Props = {
  /** 우리 학교 이름 (placeholder · caption) */
  schoolName: string;
  value: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  /** ex-modal-card 안 (시안 2-wipe: 위 16) */
  spaced?: boolean;
  className?: string;
};

/**
 * school-name-confirm (rules 1.29 wipe.school_name_confirm, 시안 2-wipe · 10-record-wipe):
 * caption "확인을 위해 학교 이름 '{학교명}'을 입력하세요" → text-input(field 채움, placeholder = 학교명). 사이 8.
 * 앞뒤 공백만 정리하고 정확히 같아야 확인 버튼이 켜진다(부르는 쪽이 schoolNameMatches 로 본다). 다르면 muted '학교 이름이 달라요'.
 * 붙여 넣기 허용.
 */
export function SchoolNameConfirm({ schoolName, value, onChange, disabled, spaced = false, className }: Props) {
  const id = useId();
  const captionId = `${id}-caption`;
  const noteId = `${id}-note`;
  const state = schoolNameState(value, schoolName);
  return (
    <div data-component="school-name-confirm" className={[styles.wrap, spaced ? styles.spaced : "", className ?? ""].filter(Boolean).join(" ")}>
      <label id={captionId} htmlFor={id} className={styles.caption}>
        {schoolNameConfirmCaption(schoolName)}
      </label>
      <TextInput
        id={id}
        className={styles.input}
        placeholder={schoolName}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        readOnly={!onChange}
        disabled={disabled}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-labelledby={captionId}
        aria-describedby={state === "mismatch" ? noteId : undefined}
        aria-invalid={state === "mismatch" || undefined}
      />
      {state === "mismatch" ? (
        <p id={noteId} className={styles.note} aria-live="polite">
          {SCHOOL_NAME_TEXT.mismatch}
        </p>
      ) : null}
    </div>
  );
}
