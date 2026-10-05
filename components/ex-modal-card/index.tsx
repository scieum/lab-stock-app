"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ButtonOutline } from "@/components/button-outline";
import { Icon } from "@/components/icons";
import styles from "./styles.module.css";

export type ModalCardField = {
  label: string;
  value: React.ReactNode;
};

type Props = {
  /** 상단 제목 (시약명, heading-3) */
  title: string;
  /** 제목 아래 안내 한 줄 (화면 8: "역할을 고르고 변경을 누르세요", body-sm 회색) */
  description?: string;
  /** default = 회색 안내(기본), strong = 기본 글자색 안내 (화면 11 삭제 확인: "배치된 시약 6개는 …") */
  descriptionTone?: "default" | "strong";
  /** 안내 아래 보조 한 줄 (화면 11 삭제 확인: "시약 정보와 재고는 지워지지 않아요", caption 회색) */
  caption?: string;
  /**
   * roomy = 안쪽 여백 24 · 묶음 사이 24 · 글자 사이 8 (시안 11-delete 확인 카드).
   * tight = 닫기 버튼 없는 카드(hideClose)도 안쪽 24·16(데스크탑 24) · 묶음 사이 12 (시안 6 판매처 연결). 기본은 기존 간격
   */
  density?: "default" | "roomy" | "tight";
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
  /**
   * true = 기본 닫기 버튼을 그리지 않는다 (화면 8 초대·역할 변경·삭제 확인: 본문 children 이 자기 버튼을 가진다).
   * Esc 로 닫히는 것은 그대로다.
   */
  hideClose?: boolean;
  /**
   * true = 카드 오른쪽 위에 작은 닫기(×) 버튼을 둔다 (화면 8 시트: 시안에 닫기 버튼이 없어 Esc 를 못 쓰는
   * 터치 기기·읽기 도구에서 닫을 길이 필요하다). 기본 false.
   */
  closeIcon?: boolean;
  /** true(기본) = 모바일에서 tab-bar 위쪽 선에 붙는 하단 시트. false = 항상 제자리(갤러리) */
  sheet?: boolean;
  /**
   * true(기본) = 모달 대화상자(aria-modal).
   * false = 비모달 — 뒤 화면(목록)을 계속 조작할 수 있는 자리(화면 10: 목록 옆 패널 · 목록 위 하단 시트)에서 쓴다.
   */
  modal?: boolean;
};

/**
 * 상세 모달 카드 (화면 10 기록 상세).
 * 모바일: tab-bar 위에 붙는 하단 시트 / 데스크탑: 부모 배치를 따르는 카드(목록 옆).
 */
export function ModalCard({
  title,
  description,
  descriptionTone = "default",
  caption,
  density = "default",
  amount,
  unit,
  fields = [],
  children,
  onClose,
  closeLabel = "닫기",
  hideClose = false,
  closeIcon = false,
  sheet = true,
  modal = true,
}: Props) {
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [dismissed, setDismissed] = useState(false);

  // 열릴 때 카드로 포커스를 옮기고, 닫히면 원래 있던 곳(누른 행)으로 돌려준다.
  // 닫는 쪽이 이미 포커스를 다른 곳에 두었으면(예: 다른 행을 눌렀음) 건드리지 않는다
  useEffect(() => {
    const before = document.activeElement;
    rootRef.current?.focus({ preventScroll: true });
    return () => {
      const now = document.activeElement;
      if (now && now !== document.body) return;
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
      aria-modal={modal ? "true" : undefined}
      aria-labelledby={titleId}
      tabIndex={-1}
      className={[
        styles.card,
        sheet ? styles.sheet : "",
        hideClose ? styles.plain : "",
        closeIcon ? styles.withIconClose : "",
        density === "roomy" ? styles.roomy : "",
        density === "tight" ? styles.tight : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={styles.summary}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {description ? (
          <p className={descriptionTone === "strong" ? styles.descriptionStrong : styles.description}>{description}</p>
        ) : null}
        {caption ? <p className={styles.caption}>{caption}</p> : null}
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
      {hideClose ? null : (
        <ButtonOutline className={styles.close} onClick={close}>
          {closeLabel}
        </ButtonOutline>
      )}
      {closeIcon ? (
        <button type="button" className={styles.iconClose} aria-label={closeLabel} onClick={close}>
          <Icon name="close" className={styles.iconCloseIcon} />
        </button>
      ) : null}
    </div>
  );
}
