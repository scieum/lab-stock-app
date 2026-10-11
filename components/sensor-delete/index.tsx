"use client";

import { ButtonOutline } from "@/components/button-outline";
import { ButtonPrimary } from "@/components/button-primary";
import { ModalCard } from "@/components/ex-modal-card";
import { ReagentMoreMenu } from "@/components/reagent-more-menu";
import { SENSOR_TEXT } from "@/lib/sensor-rules";
import styles from "./styles.module.css";

export function sensorDeleteTitle(name: string): string {
  return `'${name}' 센서를 삭제할까요?`;
}

type Props = {
  /** 센서 이름 — 버튼 이름 "{이름} 더보기" */
  name: string;
  /** "센서 삭제" 를 누르면 (확인 모달은 부르는 쪽이 연다) */
  onSelect?: () => void;
  disabled?: boolean;
  /** ⋯ 버튼 ref (확인 모달을 닫은 뒤 포커스를 돌려줄 곳) */
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
  /** 갤러리 — 처음부터 메뉴가 열림 */
  defaultOpen?: boolean;
};

/**
 * 센서 삭제 (디자인 1.26 sensor.detail · delete, sensor-delete): 상세 머리 ⋯(44 원) → 작은 메뉴 "센서 삭제"(ink 15/600, 핑크 없음).
 * 교사·admin 만 (R5 — 학생 · 둘러보기 0). 모바일 = 제목 줄 오른쪽 · 데스크톱 = 드로어 머리 × 왼쪽.
 */
export function SensorDelete({ name, onSelect, disabled, buttonRef, defaultOpen }: Props) {
  return (
    <div data-component="sensor-delete" className={styles.wrap}>
      <ReagentMoreMenu component="more-menu" label={`${name} 더보기`} buttonRef={buttonRef} defaultOpen={defaultOpen}>
        <button type="button" role="menuitem" className={styles.item} onClick={onSelect} disabled={disabled}>
          {SENSOR_TEXT.deleteItem}
        </button>
      </ReagentMoreMenu>
    </div>
  );
}

type ConfirmProps = {
  name: string;
  pending?: boolean;
  error?: string | null;
  onCancel?: () => void;
  onConfirm?: () => void;
  sheet?: boolean;
  modal?: boolean;
};

/** 센서 삭제 확인 (시약 삭제와 같은 모달 — 본문 "목록과 홈에서 사라져요.") */
export function SensorDeleteConfirm({ name, pending = false, error, onCancel, onConfirm, sheet = true, modal = true }: ConfirmProps) {
  return (
    <ModalCard
      title={sensorDeleteTitle(name)}
      description={SENSOR_TEXT.deleteBody}
      descriptionTone="body"
      caption={SENSOR_TEXT.deleteNote}
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
