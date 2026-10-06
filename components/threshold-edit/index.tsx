"use client";

import { useEffect, useRef, useState } from "react";
import { ButtonOutline } from "@/components/button-outline";
import { ButtonPrimary } from "@/components/button-primary";
import { Icon } from "@/components/icons";
import { TextInput } from "@/components/text-input";
import { THRESHOLD_ZERO_HINT, checkThreshold } from "@/lib/reorder-rules";
import styles from "./styles.module.css";

type ButtonProps = {
  mode: "button";
  /** 연필을 누르면 편집을 시작한다 */
  onStart?: () => void;
  disabled?: boolean;
};

type FormProps = {
  mode: "form";
  /** 입력의 처음 값 (지금 기준 — 없으면 빈 값) */
  defaultValue?: string;
  /** 단위 suffix ("병" · "mL" · "g") */
  unit: string;
  /** "저장" — 검사를 통과한 숫자 (0 = 알림 없음) */
  onSave?: (value: number) => void;
  /** "취소" · Esc */
  onCancel?: () => void;
  pending?: boolean;
  /** 저장 실패 안내 (서버 문구) */
  error?: string | null;
  /** true = 열리자마자 입력으로 포커스 (연필을 눌러 열었을 때). 처음부터 열린 상태(갤러리)는 false */
  autoFocus?: boolean;
};

type Props = ButtonProps | FormProps;

/**
 * 재주문 기준 직접 입력 (디자인 1.15 threshold-edit, d7 §14 — 교사·admin 만, R5: 학생 0개).
 * mode="button": reorder-threshold 값 오른쪽 연필 버튼(누름 영역 44, 아이콘 하늘색).
 * mode="form": 값 자리의 숫자 text-input(단위 suffix) + 안내 "0이면 재주문 알림을 보내지 않아요" + button-primary "저장" · button-outline "취소".
 * 빈 값·음수·숫자 아님·소수 4자리 이상은 입력 아래 기본색 안내(핑크 아님)로 막는다 (lib/reorder-rules checkThreshold).
 */
export function ThresholdEdit(props: Props) {
  if (props.mode === "button") {
    return (
      <span data-component="threshold-edit" className={styles.wrap}>
        <button type="button" className={styles.pencil} aria-label="재주문 기준 고치기" disabled={props.disabled} onClick={props.onStart}>
          <Icon name="pen" className={styles.pencilIcon} />
        </button>
      </span>
    );
  }
  return <ThresholdForm {...props} />;
}

function ThresholdForm({ defaultValue = "", unit, onSave, onCancel, pending = false, error, autoFocus = false }: FormProps) {
  const [value, setValue] = useState(defaultValue);
  const [touched, setTouched] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const checked = checkThreshold(value);
  const message = touched && !checked.ok ? checked.error : error ?? undefined;

  // 연필로 열면 바로 고쳐 쓸 수 있게 입력으로 포커스
  useEffect(() => {
    if (!autoFocus) return;
    const input = formRef.current?.querySelector("input");
    input?.focus({ preventScroll: true });
    input?.select();
  }, [autoFocus]);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setTouched(true);
    if (!checked.ok || pending) return;
    onSave?.(checked.value);
  };

  return (
    <form
      ref={formRef}
      data-component="threshold-edit"
      className={styles.form}
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === "Escape" && onCancel) {
          e.preventDefault();
          onCancel();
        }
      }}
      noValidate
    >
      <TextInput
        aria-label="재주문 기준"
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="done"
        unit={unit}
        unitTone="plain"
        value={value}
        error={message}
        onChange={(e) => {
          setValue(e.target.value);
          setTouched(true);
        }}
      />
      <p className={styles.hint}>{THRESHOLD_ZERO_HINT}</p>
      <div className={styles.actions}>
        <ButtonOutline className={styles.action} disabled={pending} onClick={onCancel}>
          취소
        </ButtonOutline>
        <ButtonPrimary type="submit" className={styles.action} disabled={pending || (touched && !checked.ok)} aria-busy={pending || undefined}>
          저장
        </ButtonPrimary>
      </div>
    </form>
  );
}
