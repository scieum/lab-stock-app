"use client";

import { useId } from "react";
import { ButtonOutline } from "@/components/button-outline";
import { ButtonPrimary } from "@/components/button-primary";
import { TextInput } from "@/components/text-input";
import styles from "./styles.module.css";

export const QR_MANUAL_HEADING = "시약장 번호로 찾기";
export const QR_MANUAL_HELPER = "QR 인쇄 라벨에 적힌 번호를 입력하세요";
export const QR_MANUAL_PLACEHOLDER = "예: 1";

type ButtonProps = {
  /** button = 시안 12-mobile: 전폭 button-outline "시약장 번호로 찾기" (누르면 번호로 찾기로 바꾼다) */
  variant: "button";
  /** 누르면 번호로 찾기로 바꾼다 (화면 상태) */
  onOpen?: () => void;
  /** 또는 주소로 바꾼다 (onOpen 이 없을 때) */
  href?: string;
  className?: string;
};

type CardProps = {
  /** card = 시안 12-desktop: 흰 카드(hairline · radius 24 · 안쪽 24) — 제목 17/600 · helper 13 회색 · text-input "예: 1" + button-primary "찾기" */
  variant: "card";
  value: string;
  onChange: (value: string) => void;
  /** 찾기 (Enter 도 같다) — 숫자 검사·조회는 부르는 쪽 (d7 §26 번호로 찾기) */
  onSubmit: (value: string) => void;
  /** 입력 아래 오류 ("{n}번 시약장이 없어요" · "시약장 번호를 숫자로 적어 주세요") */
  error?: string;
  /** 찾는 중 — 버튼 비활성 */
  pending?: boolean;
  /** 열릴 때 입력에 포커스 (모바일 "번호로 찾기"로 바꾼 직후) */
  autoFocus?: boolean;
  className?: string;
};

type Props = ButtonProps | CardProps;

/** 시약장 번호로 찾기 (디자인 1.26 화면 12 qr-manual-entry) — 모바일 버튼 한 줄 / 데스크톱 입력 카드 */
export function QrManualEntry(props: Props) {
  if (props.variant === "button") {
    return (
      <div data-component="qr-manual-entry" className={[styles.button, props.className ?? ""].filter(Boolean).join(" ")}>
        <ButtonOutline className={styles.full} href={props.onOpen ? undefined : props.href} onClick={props.onOpen}>
          {QR_MANUAL_HEADING}
        </ButtonOutline>
      </div>
    );
  }
  return <ManualCard {...props} />;
}

function ManualCard({ value, onChange, onSubmit, error, pending = false, autoFocus, className }: CardProps) {
  const headingId = useId();
  return (
    <section
      data-component="qr-manual-entry"
      aria-labelledby={headingId}
      className={[styles.card, className ?? ""].filter(Boolean).join(" ")}
    >
      <div className={styles.head}>
        <h2 id={headingId} className={styles.heading} data-name="heading">
          {QR_MANUAL_HEADING}
        </h2>
        <p className={styles.helper} data-name="helper">
          {QR_MANUAL_HELPER}
        </p>
      </div>
      <form
        className={styles.row}
        data-name="entry-row"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!pending) onSubmit(value);
        }}
      >
        <TextInput
          className={styles.input}
          icon="search"
          inputMode="numeric"
          enterKeyHint="search"
          autoComplete="off"
          autoFocus={autoFocus}
          aria-label="시약장 번호"
          placeholder={QR_MANUAL_PLACEHOLDER}
          value={value}
          error={error}
          onChange={(e) => onChange(e.target.value)}
        />
        <ButtonPrimary type="submit" className={styles.submit} disabled={pending}>
          찾기
        </ButtonPrimary>
      </form>
    </section>
  );
}
