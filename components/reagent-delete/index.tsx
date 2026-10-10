"use client";

import { ButtonOutline } from "@/components/button-outline";
import { ButtonPrimary } from "@/components/button-primary";
import { ModalCard } from "@/components/ex-modal-card";
import styles from "./styles.module.css";

/** rules.json 1.25 reagent_delete 문구 */
export const REAGENT_DELETE_TEXT = {
  item: "시약 삭제",
  body: "목록·시약장·재주문 알림에서 사라져요. 사용·입고 기록은 남아요.",
  note: "되돌릴 수 없어요.",
  done: "시약을 삭제했어요",
} as const;

export function reagentDeleteTitle(name: string): string {
  return `'${name}' 시약을 삭제할까요?`;
}

/**
 * "시약 삭제" 메뉴 항목 (디자인 1.25 reagent-delete): reagent-more-menu 안, ink 글자 15/600 — 핑크 없음.
 * 교사·admin 에게만 그린다 (R5, 둘러보기 숨김).
 */
export function ReagentDelete({ onSelect, disabled }: { onSelect?: () => void; disabled?: boolean }) {
  return (
    <button type="button" role="menuitem" data-component="reagent-delete" className={styles.item} onClick={onSelect} disabled={disabled}>
      {REAGENT_DELETE_TEXT.item}
    </button>
  );
}

type ConfirmProps = {
  name: string;
  pending?: boolean;
  /** 서버 거절 안내 */
  error?: string | null;
  onCancel?: () => void;
  onConfirm?: () => void;
  /** true(기본) = 모바일 tab-bar 위 하단 시트 · 데스크톱 가운데 카드. false = 제자리(갤러리) */
  sheet?: boolean;
  modal?: boolean;
};

/**
 * 시약 삭제 확인 (ex-modal-card, 시안 3-delete): 제목 "'{시약명}' 시약을 삭제할까요?" · 본문 15 · muted "되돌릴 수 없어요." ·
 * button-outline "취소" + button-primary "삭제"(검정, 시약장 삭제와 같음) · 오른쪽 위 ×. 핑크 없음.
 */
export function ReagentDeleteConfirm({ name, pending = false, error, onCancel, onConfirm, sheet = true, modal = true }: ConfirmProps) {
  return (
    <ModalCard
      title={reagentDeleteTitle(name)}
      description={REAGENT_DELETE_TEXT.body}
      descriptionTone="body"
      caption={REAGENT_DELETE_TEXT.note}
      density="roomy"
      hideClose
      closeIcon
      closeLabel="닫기"
      onClose={onCancel}
      sheet={sheet}
      modal={modal}
    >
      <div className={styles.body}>
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
