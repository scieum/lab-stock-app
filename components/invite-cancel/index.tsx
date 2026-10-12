"use client";

import { ButtonOutline } from "@/components/button-outline";
import { ButtonPrimary } from "@/components/button-primary";
import { ModalCard } from "@/components/ex-modal-card";
import styles from "./styles.module.css";

/** rules 1.28 invite_cancel 문구 */
export const INVITE_CANCEL_TEXT = {
  item: "초대 취소",
  body: "보낸 초대로는 더 이상 가입할 수 없어요.",
  close: "닫기",
  confirm: "초대 취소",
  done: "초대를 취소했어요",
} as const;

export function inviteCancelTitle(email: string): string {
  return `${email} 초대를 취소할까요?`;
}

/**
 * "초대 취소" 메뉴 항목 (rules 1.28 invite_cancel, invite-cancel): invite-more-menu 안, ink 15/600 — 핑크 없음. admin 만.
 */
export function InviteCancel({ onSelect, disabled }: { onSelect?: () => void; disabled?: boolean }) {
  return (
    <button type="button" role="menuitem" data-component="invite-cancel" className={styles.item} onClick={onSelect} disabled={disabled}>
      {INVITE_CANCEL_TEXT.item}
    </button>
  );
}

type ConfirmProps = {
  email: string;
  pending?: boolean;
  error?: string | null;
  onCancel?: () => void;
  onConfirm?: () => void;
  /** true(기본) = 모바일 tab-bar 위 하단 시트 · 데스크톱 가운데 카드. false = 제자리(갤러리) */
  sheet?: boolean;
  modal?: boolean;
};

/**
 * 초대 취소 확인 (rules 1.28 invite_cancel.confirm, 시안 8-invite-cancel ex-modal-card):
 * "{이메일} 초대를 취소할까요?" + "보낸 초대로는 더 이상 가입할 수 없어요." + button-outline "닫기" · button-primary "초대 취소"(검정).
 * '취소' 두 개가 나란히 서지 않게 왼쪽은 "닫기". 핑크 없음.
 */
export function InviteCancelConfirm({ email, pending = false, error, onCancel, onConfirm, sheet = true, modal = true }: ConfirmProps) {
  return (
    <ModalCard
      title={inviteCancelTitle(email)}
      description={INVITE_CANCEL_TEXT.body}
      descriptionTone="body"
      density="roomy"
      hideClose
      closeIcon
      closeLabel={INVITE_CANCEL_TEXT.close}
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
        <div className={styles.actions} data-name="action-row">
          <ButtonOutline className={styles.button} disabled={pending} onClick={onCancel}>
            {INVITE_CANCEL_TEXT.close}
          </ButtonOutline>
          <ButtonPrimary className={styles.button} disabled={pending} aria-busy={pending || undefined} onClick={onConfirm}>
            {INVITE_CANCEL_TEXT.confirm}
          </ButtonPrimary>
        </div>
      </div>
    </ModalCard>
  );
}
