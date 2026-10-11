"use client";

import { ButtonOutline } from "@/components/button-outline";
import { ButtonPrimary } from "@/components/button-primary";
import { ModalCard } from "@/components/ex-modal-card";
import { bulkNamesText } from "@/lib/sensor-rules";
import styles from "./confirm.module.css";

export type BulkKind = "reagent" | "sensor";

const NOUN: Record<BulkKind, string> = { reagent: "시약", sensor: "센서" };

/** rules bulk_delete.confirm 본문 — 센서는 "목록과 홈에서 사라져요." */
export const BULK_DELETE_BODY: Record<BulkKind, string> = {
  reagent: "목록·시약장·재주문 알림에서 사라져요. 사용·입고 기록은 남아요.",
  sensor: "목록과 홈에서 사라져요.",
};

export const BULK_DELETE_NOTE = "되돌릴 수 없어요.";

/** "시약 5개를 삭제할까요?" */
export function bulkDeleteTitle(kind: BulkKind, n: number): string {
  return `${NOUN[kind]} ${n}개를 삭제할까요?`;
}

/** 토스트 "시약 5개를 삭제했어요" (rules bulk_delete.after) */
export function bulkDeleteDone(kind: BulkKind, n: number): string {
  return `${NOUN[kind]} ${n}개를 삭제했어요`;
}

type Props = {
  kind: BulkKind;
  /** 고른 항목 이름 (목록 순서) — 앞 3개 + "외 N개" */
  names: string[];
  pending?: boolean;
  error?: string | null;
  onCancel?: () => void;
  onConfirm?: () => void;
  /** true(기본) = 모바일 tab-bar 위 하단 시트 · 데스크톱 가운데 카드. false = 제자리(갤러리) */
  sheet?: boolean;
  modal?: boolean;
};

/**
 * 여러 개 삭제 확인 (디자인 1.26 bulk_delete.confirm, 프레임 2-bulk-delete): ex-modal-card —
 * 제목 "{시약|센서} N개를 삭제할까요?" + × · 이름 3개 + "외 N개"(13) · 본문 15 · muted "되돌릴 수 없어요." ·
 * button-outline "취소" + button-primary "삭제"(검정). 핑크 없음.
 */
export function BulkDeleteConfirm({ kind, names, pending = false, error, onCancel, onConfirm, sheet = true, modal = true }: Props) {
  return (
    <ModalCard
      title={bulkDeleteTitle(kind, names.length)}
      description={bulkNamesText(names)}
      descriptionTone="strong"
      density="roomy"
      hideClose
      closeIcon
      closeLabel="닫기"
      onClose={onCancel}
      sheet={sheet}
      modal={modal}
    >
      <div className={styles.body}>
        <p className={styles.text}>{BULK_DELETE_BODY[kind]}</p>
        <p className={styles.note}>{BULK_DELETE_NOTE}</p>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.actions} data-name="modal-actions">
          <ButtonOutline className={styles.button} disabled={pending} onClick={onCancel}>
            취소
          </ButtonOutline>
          <ButtonPrimary className={styles.button} disabled={pending} aria-busy={pending || undefined} onClick={onConfirm}>
            삭제
          </ButtonPrimary>
        </div>
      </div>
    </ModalCard>
  );
}
