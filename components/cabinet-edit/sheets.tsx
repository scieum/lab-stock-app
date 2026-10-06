"use client";

import { useEffect, useRef, useState } from "react";
import { ButtonOutline } from "@/components/button-outline";
import { ButtonPrimary } from "@/components/button-primary";
import { ModalCard } from "@/components/ex-modal-card";
import { TextInput } from "@/components/text-input";
import { CABINET_NAME_MAX, UNASSIGNED_LABEL, cabinetNumberFixedText } from "@/lib/cabinet-rules";
import styles from "./styles.module.css";

type SheetProps = {
  /** Esc 로 닫을 때 (없으면 onCancel) */
  onClose?: () => void;
  /** true(기본) = 모바일에서 tab-bar 위쪽 선에 붙는 하단 시트. false = 항상 제자리(갤러리) */
  sheet?: boolean;
  modal?: boolean;
};

type RenameProps = SheetProps & {
  /** 지금 이름 — 입력에 들어 있다 */
  defaultName?: string;
  /** 시약장 번호 — caption "번호 1은 바뀌지 않아요" (이름과 별개, 바뀌지 않음). 없으면 caption 없음 */
  cabinetNumber?: number;
  maxLength?: number;
  pending?: boolean;
  /** 저장 실패 안내 (서버 문구 — 예: 같은 이름이 있어요) */
  error?: string | null;
  /** "저장" — 앞뒤 공백을 뗀 이름 */
  onSave?: (name: string) => void;
  /** "취소" */
  onCancel?: () => void;
};

/** 이름 바꾸기 시트 (ex-modal-card): "시약장 이름" + text-input + 글자 수 + caption "번호 N은 바뀌지 않아요" + "저장"(비어 있으면 비활성) + "취소" */
export function CabinetRenameSheet({
  defaultName = "",
  cabinetNumber,
  maxLength = CABINET_NAME_MAX,
  pending = false,
  error,
  onSave,
  onCancel,
  onClose,
  sheet,
  modal,
}: RenameProps) {
  const [name, setName] = useState(defaultName);
  const formRef = useRef<HTMLFormElement>(null);
  const trimmed = name.trim();
  const length = [...name].length;
  const canSave = trimmed.length > 0 && length <= maxLength && !pending;

  // 열리면 바로 고쳐 쓸 수 있게 입력으로 포커스 (카드가 먼저 포커스를 받은 뒤)
  useEffect(() => {
    const input = formRef.current?.querySelector("input");
    input?.focus({ preventScroll: true });
    input?.select();
  }, []);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSave) return;
    onSave?.(trimmed);
  };

  return (
    <ModalCard title="시약장 이름" density="roomy" hideClose onClose={onClose ?? onCancel} sheet={sheet} modal={modal}>
      <form ref={formRef} className={styles.sheetForm} onSubmit={submit} noValidate>
        <div className={styles.sheetField}>
          <TextInput
            aria-label="시약장 이름"
            placeholder="시약장 이름"
            value={name}
            maxLength={maxLength}
            autoComplete="off"
            enterKeyHint="done"
            counter={`${length}/${maxLength}`}
            error={error ?? undefined}
            onChange={(e) => setName(e.target.value)}
          />
          {cabinetNumber !== undefined ? <p className={styles.sheetCaption}>{cabinetNumberFixedText(cabinetNumber)}</p> : null}
        </div>
        <div className={styles.sheetActions}>
          <ButtonPrimary type="submit" fullWidth disabled={!canSave} aria-busy={pending || undefined}>
            저장
          </ButtonPrimary>
          <ButtonOutline className={styles.sheetButton} disabled={pending} onClick={onCancel}>
            취소
          </ButtonOutline>
        </div>
      </form>
    </ModalCard>
  );
}

type DeleteProps = SheetProps & {
  /** 이 시약장 칸에 배치된 시약 수 — 삭제하면 "칸 없음"이 된다 */
  reagentCount?: number;
  pending?: boolean;
  /** 삭제 실패 안내 (서버 문구) */
  error?: string | null;
  /** "취소" */
  onCancel?: () => void;
  /** "삭제" */
  onConfirm?: () => void;
};

/**
 * 삭제 확인 카드 (ex-modal-card, 시안 11-delete): "이 시약장을 삭제할까요?" + 안내 + 보조 + "취소" · "삭제".
 * 핑크를 쓰지 않는다 (시약장 삭제는 재고·안전 신호가 아니다).
 */
export function CabinetDeleteConfirm({ reagentCount = 0, pending = false, error, onCancel, onConfirm, onClose, sheet, modal }: DeleteProps) {
  const description =
    reagentCount > 0 ? `배치된 시약 ${reagentCount}개는 '${UNASSIGNED_LABEL}'으로 바뀌어요` : "이 시약장에 배치된 시약은 없어요";
  return (
    <ModalCard
      title="이 시약장을 삭제할까요?"
      description={description}
      descriptionTone="strong"
      caption="시약 정보와 재고는 지워지지 않아요"
      density="roomy"
      hideClose
      onClose={onClose ?? onCancel}
      sheet={sheet}
      modal={modal}
    >
      <div className={styles.confirmBody}>
        {error ? (
          <p className={styles.sheetError} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.confirm}>
          <ButtonOutline className={styles.confirmButton} disabled={pending} onClick={onCancel}>
            취소
          </ButtonOutline>
          <ButtonPrimary className={styles.confirmButton} disabled={pending} aria-busy={pending || undefined} onClick={onConfirm}>
            삭제
          </ButtonPrimary>
        </div>
      </div>
    </ModalCard>
  );
}

type UnsavedProps = SheetProps & {
  /** 편집 중인 시약장 이름 — "이동하면 1번 시약장에서 바꾼 내용이 사라져요" */
  cabinetLabel: string;
  /** "버리고 이동" — 편집을 버리고 누른 곳으로 간다 */
  onDiscard?: () => void;
  /** "계속 편집" · Esc — 카드를 닫고 편집 화면에 머문다 */
  onContinue?: () => void;
};

/**
 * 저장 안 한 편집 확인 (디자인 1.15 11-unsaved, rules.json cabinet.unsaved_confirm, d7 §14):
 * 편집 중 시약장 전환·화면 이탈 → ex-modal-card "저장하지 않은 변경이 있어요" + 안내 +
 * 가로 2버튼 button-outline "버리고 이동"(왼쪽) · button-primary "계속 편집"(오른쪽). 핑크·하늘색 없음.
 */
export function CabinetUnsavedConfirm({ cabinetLabel, onDiscard, onContinue, onClose, sheet, modal }: UnsavedProps) {
  return (
    <ModalCard
      title="저장하지 않은 변경이 있어요"
      description={`이동하면 ${cabinetLabel}에서 바꾼 내용이 사라져요`}
      hideClose
      onClose={onClose ?? onContinue}
      sheet={sheet}
      modal={modal}
    >
      <div className={styles.confirm}>
        <ButtonOutline className={styles.confirmButton} onClick={onDiscard}>
          버리고 이동
        </ButtonOutline>
        <ButtonPrimary className={styles.confirmButton} onClick={onContinue}>
          계속 편집
        </ButtonPrimary>
      </div>
    </ModalCard>
  );
}
