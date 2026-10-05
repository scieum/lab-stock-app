"use client";

import { useId } from "react";
import { DataTableCell } from "@/components/ex-data-table-cell";
import { Icon } from "@/components/icons";
import { SelectField } from "@/components/select-field";
import { TextInput } from "@/components/text-input";
import {
  MANUAL_UNITS,
  existingBasisText,
  formatAmountText,
  isManualUnit,
  outcomeText,
  planSave,
  type ExtractionRow,
  type ManualReagent,
  type ManualUnit,
  type RowView,
} from "@/lib/manual-rules";
import styles from "./styles.module.css";

/** 행에서 사용자가 바꿀 수 있는 값 */
export type ExtractionRowPatch = Partial<Pick<ExtractionRow, "perGroup" | "unit" | "reagentId">>;

export type ExtractionTableProps = {
  /** 확인 표의 행 (lib/manual-rules normalizeExtraction 결과 — 상태는 화면이 가진다) */
  rows: ExtractionRow[];
  /** 조 수 (1반 1회 필요량 = 1조 사용량 × 조 수) */
  groups: number;
  /** 우리 학교 시약 (연결 선택지 · 단위 · 기존 기준) */
  reagents: ManualReagent[];
  /** 사용량·단위·연결 시약을 바꿨을 때 */
  onRowChange?: (id: string, patch: ExtractionRowPatch) => void;
  /** 행 삭제 (추출이 틀린 행) */
  onRowRemove?: (id: string) => void;
  /** "닫기" — 없으면 그리지 않는다 */
  onClose?: () => void;
  /** 저장 중 등: 입력·선택·삭제 잠금 */
  disabled?: boolean;
  title?: string;
  /** 0행 문구 */
  emptyText?: string;
};

const HEAD = ["시약명", "1조 사용량", "단위", "1반 1회 필요량"] as const;
const UNLINKED = "";
const UNLINKED_LABEL = "등록되지 않은 시약";

/**
 * 추출 결과 확인 표 (화면 5 의 2단계, 제어형).
 * 시안의 4열(ex-data-table-cell: 머리 4 + 행마다 4)은 그대로 두고, 시안에 없는 요소(d7 §13 사용자 결정)는
 * 행마다 4열 아래의 보조 줄에 둔다: "우리 학교 시약" 선택 · 행 삭제 · 기존 기준 · 저장 제외/단위 불일치 안내.
 * 행 상태·필요량·저장 가능 여부는 lib/manual-rules planSave 가 정한다.
 */
export function ExtractionTable({
  rows,
  groups,
  reagents,
  onRowChange,
  onRowRemove,
  onClose,
  disabled = false,
  title = "추출 결과 확인",
  emptyText = "시약을 찾지 못했어요. 파일을 확인하고 다시 추출해 주세요",
}: ExtractionTableProps) {
  const titleId = useId();
  const plan = planSave(rows, reagents, groups);
  const views = new Map(plan.rows.map((v) => [v.id, v]));
  const reagentOptions = [
    { value: UNLINKED, label: UNLINKED_LABEL },
    ...reagents.map((r) => ({ value: r.id, label: `${r.name} (${r.unit})` })),
  ];

  return (
    <section data-component="extraction-table" className={styles.root} aria-labelledby={titleId}>
      <div className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {onClose ? (
          <button type="button" className={styles.close} onClick={onClose}>
            닫기
          </button>
        ) : null}
      </div>
      <div className={styles.body}>
        <table className={styles.table} aria-labelledby={titleId}>
          <colgroup>
            <col className={styles.colName} />
            <col className={styles.colAmount} />
            <col className={styles.colUnit} />
            <col className={styles.colRequired} />
          </colgroup>
          <thead>
            <tr className={styles.headRow}>
              {HEAD.map((h) => (
                <DataTableCell key={h} variant="header">
                  {h}
                </DataTableCell>
              ))}
            </tr>
          </thead>
          {rows.map((row) => {
            const view = views.get(row.id);
            if (!view) return null;
            return (
              <tbody key={row.id} className={styles.group} data-row-id={row.id} data-status={view.status}>
                <tr className={styles.mainRow}>
                  <DataTableCell>
                    <span className={styles.name}>{row.name}</span>
                  </DataTableCell>
                  <DataTableCell>
                    <TextInput
                      density="cell"
                      edited={view.edited}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      aria-label={`${row.name} 1조 사용량`}
                      aria-invalid={view.status === "amount" ? true : undefined}
                      value={row.perGroup}
                      disabled={disabled}
                      onChange={(e) => onRowChange?.(row.id, { perGroup: e.target.value })}
                    />
                  </DataTableCell>
                  <DataTableCell>
                    <span className={styles.unitBox}>
                      <select
                        className={styles.unitSelect}
                        aria-label={`${row.name} 단위`}
                        aria-invalid={view.status === "unit" || view.status === "mismatch" ? true : undefined}
                        value={row.unit}
                        disabled={disabled}
                        onChange={(e) => {
                          const v = e.target.value;
                          onRowChange?.(row.id, { unit: isManualUnit(v) ? v : "" });
                        }}
                      >
                        {row.unit === "" ? <option value="">선택</option> : null}
                        {MANUAL_UNITS.map((u: ManualUnit) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                      <Icon name="chevron-down" className={styles.unitIcon} />
                    </span>
                  </DataTableCell>
                  <DataTableCell>
                    <span className={styles.required}>{view.requiredText}</span>
                  </DataTableCell>
                </tr>
                <tr className={styles.detailRow}>
                  <td colSpan={HEAD.length} className={styles.detail}>
                    <div className={styles.link} role="group" aria-label={`${row.name} 연결`}>
                      <div className={styles.linkSelect}>
                        <SelectField
                          tone="form"
                          label="우리 학교 시약"
                          options={reagentOptions}
                          value={view.reagent ? view.reagent.id : UNLINKED}
                          disabled={disabled}
                          onChange={(v) => onRowChange?.(row.id, { reagentId: v === UNLINKED ? null : v })}
                        />
                      </div>
                      <button
                        type="button"
                        className={styles.remove}
                        aria-label={`${row.name} 행 삭제`}
                        disabled={disabled}
                        onClick={() => onRowRemove?.(row.id)}
                      >
                        삭제
                      </button>
                    </div>
                    <RowNotes view={view} />
                  </td>
                </tr>
              </tbody>
            );
          })}
        </table>
        {rows.length === 0 ? (
          <p className={styles.empty} role="status">
            {emptyText}
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** 보조 줄의 안내: 기존 기준(+ 저장 결과 예측) · 같은 시약 합산 · 저장 제외 · 오류 */
function RowNotes({ view }: { view: RowView }) {
  const basis = view.reagent ? existingBasisText(view.reagent) : null;
  const outcome = view.status === "ok" ? outcomeText(view) : null;
  const merged =
    view.status === "ok" && view.mergedCount > 1 && view.mergedRequired !== null && view.reagent
      ? `같은 시약 ${view.mergedCount}행 — 합쳐서 ${formatAmountText(view.mergedRequired, view.reagent.unit)}로 저장해요`
      : null;
  const isError = view.status === "amount" || view.status === "unit" || view.status === "mismatch";
  if (!basis && !merged && !view.message) return null;
  return (
    <div className={styles.notes}>
      {basis ? (
        <p className={styles.note} data-note="basis">
          {outcome ? `${basis} · ${outcome}` : basis}
        </p>
      ) : null}
      {merged ? (
        <p className={styles.note} data-note="merged">
          {merged}
        </p>
      ) : null}
      {view.message ? (
        <p className={isError ? styles.warn : styles.note} data-note={isError ? "error" : "skipped"}>
          <Icon name={isError ? "warning" : "info"} className={styles.noteIcon} />
          <span>{view.message}</span>
        </p>
      ) : null}
    </div>
  );
}
