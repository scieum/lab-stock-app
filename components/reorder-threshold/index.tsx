"use client";

import { useState } from "react";
import { AutoThresholdBadge } from "@/components/auto-threshold-badge";
import { ThresholdEdit } from "@/components/threshold-edit";
import {
  autoCaptionText,
  reorderBasisText,
  thresholdSourceText,
  thresholdText,
  type AutoBasis,
  type ThresholdSource,
} from "@/lib/reorder-rules";
import styles from "./styles.module.css";

type Props = {
  /** 재주문 기준 = reagents.min_stock (0·없음 = "아직 없어요") */
  minStock: number | null;
  /** 시약 단위 ("병" · "mL" · "g") */
  unit: string;
  /** 화면 5 가 채운 근거 (1조 사용량 · 조 수) — 둘 다 있으면 값 아래 "1반 1회 실험량 … × …조 기준" (d7 §11) */
  perGroup?: number | null;
  groups?: number | null;
  /**
   * 기준의 출처 (reagents.min_stock_source, d7 §11-1·§18). 주면 자동일 때 값 옆 auto-threshold-badge "자동" + 캡션
   * (auto: "최근 사용량으로 계산했어요" · "마지막 입고량의 20%로 계산했어요" / basis: "1반 1회 실험량 … × …조 기준" / manual: "직접 입력").
   * 없으면(갤러리 예시) 예전처럼 화면 5 근거만.
   */
  source?: ThresholdSource;
  /** 자동 값의 근거 (source = 'auto' 일 때) */
  autoBasis?: AutoBasis;
  /** "자동으로 돌리기" (교사·admin, source 가 'auto' 가 아닐 때 입력 상태 안에) — reset_reorder_threshold */
  onResetAuto?: () => void;
  /** true = 교사·admin — threshold-edit (R5: 학생 false) */
  canEdit?: boolean;
  /** 처음부터 입력 상태 (갤러리·시안 상태) — 상태를 부르는 쪽이 쥐려면 editing · onEditingChange */
  defaultEditing?: boolean;
  /** 입력 상태 (제어형) — 저장이 끝나면 부르는 쪽이 false 로 닫는다 */
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
  /** 입력의 처음 값 (갤러리 — 오류 예시) */
  defaultValue?: string;
  /** "저장" — 0 이상 숫자 (set_reorder_threshold, D2) */
  onSave?: (value: number) => void;
  pending?: boolean;
  /** 저장 실패 안내 */
  error?: string | null;
};

/**
 * 재주문 기준 줄 (디자인 1.15 reorder-threshold, d7 §14): reagent-detail-card 안 reagent-location 아래 한 줄.
 * caption "재주문 기준" + 값 "3병"(없으면 "아직 없어요" 회색). 화면 5 근거가 있으면 값 아래 기준 문구.
 * 교사·admin 은 값 오른쪽 연필(threshold-edit) → 누르면 값 자리가 숫자 입력 + 저장/취소로 바뀐다.
 * 직접 입력하면 근거(1조 사용량·조 수)는 지워지고 출처가 'manual'("직접 입력")이 된다 (d7 §14 — DB 가 한다).
 * 출처(d7 §11-1·§18, 시안 1.17 3): 자동이면 값 옆 auto-threshold-badge "자동" + 캡션, 화면 5 근거·직접 입력은 caption 만.
 * 자동이 아니면 입력 상태 안에 "자동으로 돌리기"(threshold-edit).
 */
export function ReorderThreshold({
  minStock,
  unit,
  perGroup,
  groups,
  source,
  autoBasis,
  onResetAuto,
  canEdit = false,
  defaultEditing = false,
  editing: editingProp,
  onEditingChange,
  defaultValue,
  onSave,
  pending,
  error,
}: Props) {
  const [editingState, setEditingState] = useState(defaultEditing);
  // 연필을 눌러 연 경우에만 입력으로 포커스 (처음부터 열린 갤러리 예시는 포커스를 가져가지 않는다)
  const [opened, setOpened] = useState(false);
  const editing = canEdit && (editingProp ?? editingState);
  const setEditing = (next: boolean) => {
    setEditingState(next);
    setOpened(next);
    onEditingChange?.(next);
  };
  const has = typeof minStock === "number" && minStock > 0;
  const auto = source === "auto";
  let basis: string | null;
  if (auto) {
    // 자동인데 값이 0(값 자리가 "아직 없어요")이거나 근거를 모르면 캡션을 두지 않는다
    basis = has ? autoCaptionText({ minStock, autoBasis }) : null;
  } else if (source) {
    basis = thresholdSourceText({ source, autoBasis, minStock: minStock ?? 0, unit, perGroup, groups });
  } else {
    basis = has && perGroup && groups ? reorderBasisText({ minStock: minStock ?? 0, unit, perGroup, groups }) : null;
  }

  if (editing) {
    return (
      <div data-component="reorder-threshold" className={[styles.row, styles.editing].join(" ")}>
        <span className={styles.label}>재주문 기준</span>
        <ThresholdEdit
          mode="form"
          unit={unit}
          defaultValue={defaultValue ?? (has ? String(minStock) : "")}
          pending={pending}
          error={error}
          autoFocus={opened}
          onCancel={() => setEditing(false)}
          onSave={(value) => onSave?.(value)}
          onResetAuto={source && !auto ? onResetAuto : undefined}
        />
      </div>
    );
  }

  return (
    <div data-component="reorder-threshold" className={styles.row}>
      <div className={styles.field}>
        <span className={styles.label}>재주문 기준</span>
        <span className={styles.valueGroup}>
          <span className={styles.valueLine}>
            <span className={has ? styles.value : styles.none}>{thresholdText(minStock, unit)}</span>
            {auto ? <AutoThresholdBadge testId="reorder-threshold-auto" /> : null}
          </span>
          {basis ? (
            <span className={styles.basis} data-testid={source ? "reorder-threshold-source" : undefined}>
              {basis}
            </span>
          ) : null}
        </span>
      </div>
      {canEdit ? <ThresholdEdit mode="button" disabled={pending} onStart={() => setEditing(true)} /> : null}
    </div>
  );
}
