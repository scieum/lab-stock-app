"use client";

import { ButtonOutline } from "@/components/button-outline";
import { ButtonPrimary } from "@/components/button-primary";
import { ModalCard } from "@/components/ex-modal-card";
import { Icon } from "@/components/icons";
import { PageMoreMenuItem } from "@/components/page-more-menu";
import { SchoolNameConfirm } from "@/components/school-name-confirm";
import { REAGENT_WIPE_TEXT, canWipeReagents, reagentWipeTitle, schoolNameMatches } from "@/lib/wipe-rules";
import styles from "./styles.module.css";

/**
 * 위험 표시 제목 (rules 1.29 wipe.danger_mark): 앞에 ink 외곽선 경고 아이콘 24(세모 !) + 제목 20/700, 사이 8. 핑크·빨강 없음.
 * data-component = 시안 이름 (reagent-wipe · record-wipe).
 */
export function WipeHeading({ "data-component": component, children }: { "data-component": "reagent-wipe" | "record-wipe"; children: React.ReactNode }) {
  return (
    <span data-component={component} className={styles.heading}>
      <Icon name="warning" className={styles.warning} />
      <span>{children}</span>
    </span>
  );
}

/** page-more-menu 안 '시약 전체 삭제' — 지울 시약이 0종이면 비활성 + '지울 시약이 없어요' */
export function ReagentWipeItem({ count, onSelect }: { count: number; onSelect?: () => void }) {
  return (
    <PageMoreMenuItem
      data-component="reagent-wipe"
      label={REAGENT_WIPE_TEXT.item}
      disabled={count <= 0}
      disabledCaption={REAGENT_WIPE_TEXT.empty}
      onSelect={onSelect}
    />
  );
}

type ConfirmProps = {
  /** 지울 시약 수 (보관 안 된 우리 학교 시약) */
  count: number;
  schoolName: string;
  /** school-name-confirm 입력값 */
  value: string;
  onValueChange?: (value: string) => void;
  pending?: boolean;
  error?: string | null;
  onCancel?: () => void;
  onConfirm?: () => void;
  /** true(기본) = 모바일 tab-bar 위 하단 시트 · 데스크톱 부모 자리 카드. false = 제자리(갤러리) */
  sheet?: boolean;
  modal?: boolean;
};

/**
 * 시약 전체 삭제 확인 (rules 1.29 wipe.reagent, 시안 2-wipe-mobile · 2-wipe-desktop ex-modal-card):
 * 경고 아이콘 + '시약 {N}종을 모두 삭제할까요?' + 본문 두 줄 + school-name-confirm + button-outline '닫기' / button-primary '전체 삭제'
 * (검정, 학교명이 맞기 전엔 꺼짐 — 꺼진 모양 = rules wipe.disabled_button).
 */
export function ReagentWipeConfirm({
  count,
  schoolName,
  value,
  onValueChange,
  pending = false,
  error,
  onCancel,
  onConfirm,
  sheet = true,
  modal = true,
}: ConfirmProps) {
  const enabled = canWipeReagents({ count, schoolNameOk: schoolNameMatches(value, schoolName), pending });
  return (
    <ModalCard
      title={<WipeHeading data-component="reagent-wipe">{reagentWipeTitle(count)}</WipeHeading>}
      hideClose
      closeIcon
      closeLabel={REAGENT_WIPE_TEXT.close}
      onClose={onCancel}
      sheet={sheet}
      modal={modal}
    >
      <div className={styles.body}>
        <p className={styles.text}>{REAGENT_WIPE_TEXT.body}</p>
        <p className={styles.text}>{REAGENT_WIPE_TEXT.note}</p>
        <SchoolNameConfirm spaced schoolName={schoolName} value={value} onChange={onValueChange} disabled={pending} />
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.actions} data-name="modal-actions">
          <ButtonOutline className={styles.button} disabled={pending} onClick={onCancel}>
            {REAGENT_WIPE_TEXT.close}
          </ButtonOutline>
          <ButtonPrimary className={styles.button} disabled={!enabled} aria-busy={pending || undefined} onClick={enabled ? onConfirm : undefined}>
            {REAGENT_WIPE_TEXT.confirm}
          </ButtonPrimary>
        </div>
      </div>
    </ModalCard>
  );
}
