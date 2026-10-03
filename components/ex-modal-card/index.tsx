"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ButtonOutline } from "@/components/button-outline";
import styles from "./styles.module.css";

export type ModalCardField = {
  label: string;
  value: React.ReactNode;
};

type Props = {
  /** 상단 제목 (시약명, heading-3) */
  title: string;
  /** 제목 아래 큰 숫자 (사용량, display) */
  amount?: React.ReactNode;
  /** 숫자 옆 단위 (g · mL · 병) */
  unit?: string;
  /** 라벨-값 행 (사용자 · 일시 · 메모) */
  fields?: ModalCardField[];
  /** 라벨-값 행과 닫기 버튼 사이 (msds-entry 자리) */
  children?: React.ReactNode;
  /** 닫기 버튼·Esc 로 부른다. 없으면 카드가 스스로 사라진다 */
  onClose?: () => void;
  closeLabel?: string;
  /** true(기본) = 모바일에서 tab-bar 위쪽 선에 붙는 하단 시트. false = 항상 제자리(갤러리) */
  sheet?: boolean;
};

/**
 * 상세 모달 카드 (화면 10 기록 상세).
 * 모바일: tab-bar 위에 붙는 하단 시트 / 데스크탑: 부모 배치를 따르는 카드(목록 옆).
 */
export function ModalCard({
  title,
  amount,
  unit,
  fields = [],
  children,
  onClose,
  closeLabel = "닫기",
  sheet = true,
}: Props) {
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [dismissed, setDismissed] = useState(false);

  // 열릴 때 카드로 포커스를 옮기고, 닫히면 원래 있던 곳(누른 행)으로 돌려준다
  useEffect(() => {
    const before = document.activeElement;
    rootRef.current?.focus({ preventScroll: true });
    return () => {
      if (before instanceof HTMLElement && before !== document.body && before.isConnected) {
        before.focus({ preventScroll: true });
      }
    };
  }, []);

  useEffect(() => {
    if (dismissed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (onClose) onClose();
      else setDismissed(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, dismissed]);

  if (dismissed) return null;

  const close = () => {
    if (onClose) onClose();
    else setDismissed(true);
  };

  return (
    <div
      ref={rootRef}
      data-component="ex-modal-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className={[styles.card, sheet ? styles.sheet : ""].join(" ").trim()}
    >
      <div className={styles.summary}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {amount !== undefined && amount !== null ? (
          <p className={styles.amount}>
            <span className={styles.amountValue}>{amount}</span>
            {unit ? <span className={styles.amountUnit}>{unit}</span> : null}
          </p>
        ) : null}
      </div>
      {fields.length > 0 ? (
        <dl className={styles.fields}>
          {fields.map((f) => (
            <div key={f.label} className={styles.row}>
              <dt className={styles.fieldLabel}>{f.label}</dt>
              <dd className={styles.fieldValue}>{f.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {children}
      <ButtonOutline className={styles.close} onClick={close}>
        {closeLabel}
      </ButtonOutline>
    </div>
  );
}
