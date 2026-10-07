"use client";

import { useId, useState } from "react";
import { Icon } from "@/components/icons";
import { NewReagentFields } from "@/components/new-reagent-fields";
import { ReagentLink } from "@/components/reagent-link";
import { TextInput } from "@/components/text-input";
import {
  DOC_TEXT,
  notReagentText,
  planDocIntake,
  type DocReagent,
  type DocRow,
  type DocRowPatch,
} from "@/lib/doc-intake-rules";
import styles from "./styles.module.css";

type Props = {
  /** 확인 표의 행 (lib/doc-intake-rules buildDocRows — 상태는 화면이 가진다) */
  rows: readonly DocRow[];
  /** 우리 학교 시약 (자동 연결 · 바꾸기 선택지 · 단위) */
  reagents: readonly DocReagent[];
  /** 입고일 (서류 날짜, 없으면 오늘) */
  intakeDate: string;
  /** 오늘 (Asia/Seoul) — 입고일 상한 */
  today: string;
  onDateChange?: (date: string) => void;
  onRowChange?: (id: string, patch: DocRowPatch) => void;
  /** "다른 파일" — 없으면 그리지 않는다 */
  onRestart?: () => void;
  /** 새 시약 칸의 MSDS 찾기 (갤러리 정적 상태는 false) */
  findMsds?: boolean;
  /** 저장 중 잠금 */
  disabled?: boolean;
  /** 시작할 때 "시약 아님" 묶음을 펼쳐 둔다 (갤러리) */
  defaultNotReagentOpen?: boolean;
  className?: string;
};

const MANUAL_NOTE = "규격으로 계산할 수 없어요 — 입고량을 직접 입력해 주세요";

/**
 * 서류 입고 확인 표 (디자인 1.17 doc-intake-table — 7-doc-review, d7 §21. 화면 5 방식):
 * 제목 "읽은 내용 확인" + "고칠 곳이 있으면 고친 뒤 입고하세요" → 서류 날짜(= 입고일, 미래 불가)
 * → (데스크톱) 머리행 품명 · 규격 · 수량 → 품목 행마다:
 *   윗줄 품명 · 규격 · 수량 칸 → reagent-link(우리 학교 시약 · 바꾸기 · 빼기 · 새 시약으로 등록)
 *   → 연결 행: 입고량 칸(그 시약 단위, 언제나 고칠 수 있음) + 무채색 환산 줄 "500 mL × 4병 = 2,000 mL"
 *   → 새 시약 행: 환산 줄 + new-reagent-fields(펼침) 또는 요약 줄(접힘)
 * → 표 아래 접힌 묶음 "시약 아님 N개" (펼치면 품목마다 "시약으로 넣기").
 * 모바일 = 행마다 회색 카드(radius 16, 안쪽 16, 흰 입력), 데스크톱 = 머리행 + 가는 선으로 나눈 행(회색 입력).
 * 행 상태·환산·오류는 lib/doc-intake-rules planDocIntake 가 정한다.
 */
export function DocIntakeTable({
  rows,
  reagents,
  intakeDate,
  today,
  onDateChange,
  onRowChange,
  onRestart,
  findMsds = true,
  disabled = false,
  defaultNotReagentOpen = false,
  className,
}: Props) {
  const titleId = useId();
  const otherId = useId();
  const [otherOpen, setOtherOpen] = useState(defaultNotReagentOpen);
  const plan = planDocIntake(rows, reagents, intakeDate, today);
  const views = new Map(plan.rows.map((v) => [v.id, v]));
  const tableRows = rows.filter((r) => r.isReagent);
  const others = rows.filter((r) => !r.isReagent);
  const dateError = intakeDate === "" ? "입고일을 확인해 주세요" : intakeDate > today ? "입고일은 오늘 이후로 정할 수 없어요" : undefined;

  return (
    <section
      data-component="doc-intake-table"
      className={[styles.root, className ?? ""].filter(Boolean).join(" ")}
      aria-labelledby={titleId}
    >
      <div className={styles.head} data-name="table-head">
        <div className={styles.headText}>
          <h2 id={titleId} className={styles.title}>
            {DOC_TEXT.reviewTitle}
          </h2>
          <p className={styles.caption}>{DOC_TEXT.reviewCaption}</p>
        </div>
        {onRestart ? (
          <button type="button" className={styles.restart} disabled={disabled} onClick={onRestart}>
            다른 파일
          </button>
        ) : null}
      </div>

      <div className={styles.date} data-name="doc-date">
        <TextInput
          className={styles.dateInput}
          label={DOC_TEXT.dateLabel}
          labelTone="strong"
          type="date"
          max={today}
          value={intakeDate}
          disabled={disabled}
          error={dateError}
          onChange={(e) => onDateChange?.(e.target.value)}
        />
      </div>

      <div className={styles.header} aria-hidden="true" data-name="table-header">
        <span>품명</span>
        <span>규격</span>
        <span>수량</span>
      </div>

      <div className={styles.rows} role="list" aria-label="서류 품목">
        {tableRows.map((row) => {
          const view = views.get(row.id);
          if (!view) return null;
          const reagent = view.reagent;
          const qtyUnit = row.item.quantityUnit ?? "개";
          return (
            <div
              key={row.id}
              role="listitem"
              className={styles.row}
              data-name="doc-item-row"
              data-row-id={row.id}
              data-link={row.link.kind}
              data-error={view.error ? "" : undefined}
            >
              <div className={styles.itemLine} data-name="item-line">
                <div className={styles.itemName} data-name="item-name">
                  <p className={styles.itemTitle}>{row.item.name}</p>
                  <p className={styles.itemSpec}>
                    <span className={styles.specLabel}>규격 </span>
                    {row.item.spec ?? "—"}
                  </p>
                </div>
                <div className={styles.itemQty} data-name="item-qty">
                  <span className={styles.qtyLabel} aria-hidden="true">
                    수량
                  </span>
                  <TextInput
                    className={styles.qtyInput}
                    inputMode="decimal"
                    autoComplete="off"
                    aria-label={`${row.item.name} 수량`}
                    unit={qtyUnit}
                    unitTone="plain"
                    value={row.quantity}
                    disabled={disabled}
                    onChange={(e) => onRowChange?.(row.id, { quantity: e.target.value })}
                  />
                </div>
              </div>

              <ReagentLink
                itemName={row.item.name}
                link={row.link}
                reagents={reagents}
                expanded={row.expanded}
                summary={view.summary}
                disabled={disabled}
                onChange={(link) => onRowChange?.(row.id, { link })}
                onInclude={() =>
                  onRowChange?.(row.id, {
                    link: row.autoReagentId ? { kind: "reagent", reagentId: row.autoReagentId } : { kind: "new" },
                  })
                }
                onToggleExpand={() => onRowChange?.(row.id, { expanded: !row.expanded })}
              />

              {row.link.kind === "reagent" && reagent ? (
                <div className={styles.amountLine} data-name="amount-line">
                  <TextInput
                    className={styles.amountInput}
                    label="입고량"
                    labelTone="strong"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="직접 입력"
                    aria-label={`${row.item.name} 입고량`}
                    unit={reagent.unit}
                    unitTone="plain"
                    edited={row.amountEdited}
                    value={row.amount}
                    disabled={disabled}
                    onChange={(e) => onRowChange?.(row.id, { amount: e.target.value })}
                  />
                </div>
              ) : null}

              {view.active && view.note ? (
                <p className={styles.note} data-name="unit-convert">
                  {view.note}
                </p>
              ) : null}
              {view.active && view.manual && row.link.kind === "reagent" ? (
                <p className={styles.note} data-name="unit-manual">
                  {MANUAL_NOTE}
                </p>
              ) : null}

              {row.link.kind === "new" && row.expanded ? (
                <NewReagentFields
                  itemName={row.item.name}
                  value={row.newReagent}
                  error={view.error}
                  disabled={disabled}
                  findMsds={findMsds}
                  onChange={(patch) => onRowChange?.(row.id, { newReagent: patch })}
                />
              ) : null}

              {view.error && !(row.link.kind === "new" && row.expanded) ? (
                <p className={styles.error} role="alert">
                  <Icon name="warning" className={styles.errorIcon} />
                  <span>{view.error}</span>
                </p>
              ) : null}
            </div>
          );
        })}
        {tableRows.length === 0 ? (
          <p className={styles.empty} role="status">
            표에 올린 품목이 없어요. 아래 묶음에서 시약으로 넣을 수 있어요
          </p>
        ) : null}
      </div>

      {others.length > 0 ? (
        <div className={styles.others} data-name="not-reagent-group">
          <button
            type="button"
            className={styles.othersToggle}
            aria-expanded={otherOpen}
            aria-controls={otherId}
            onClick={() => setOtherOpen((o) => !o)}
          >
            <span>{notReagentText(others.length)}</span>
            <Icon name={otherOpen ? "chevron-up" : "chevron-down"} className={styles.othersIcon} />
          </button>
          {otherOpen ? (
            <ul id={otherId} className={styles.otherList}>
              {others.map((row) => (
                <li key={row.id} className={styles.otherItem} data-row-id={row.id}>
                  <span className={styles.otherName}>
                    {row.item.name}
                    {row.item.spec ? <span className={styles.otherSpec}> · {row.item.spec}</span> : null}
                  </span>
                  <button
                    type="button"
                    className={styles.otherAction}
                    disabled={disabled}
                    aria-label={`${row.item.name} ${DOC_TEXT.addAsReagent}`}
                    onClick={() => onRowChange?.(row.id, { isReagent: true })}
                  >
                    {DOC_TEXT.addAsReagent}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
