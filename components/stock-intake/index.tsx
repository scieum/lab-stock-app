"use client";

import { useId, useState } from "react";
import { ButtonOutline } from "@/components/button-outline";
import { ButtonPillSoft } from "@/components/button-pill-soft";
import { ButtonPrimary } from "@/components/button-primary";
import { EmptyStateCard } from "@/components/ex-empty-state-card";
import { Icon } from "@/components/icons";
import { ReagentRow } from "@/components/reagent-row";
import { TextInput } from "@/components/text-input";
import styles from "./styles.module.css";

export type IntakeReagent = {
  id: string;
  name: string;
  /** 현재 재고량 */
  stock: number;
  /** 병 · mL · g */
  unit: string;
};

export type StockIntakeValues = {
  reagentId: string;
  amount: number;
  /** YYYY-MM-DD */
  intakeDate: string;
};

type Props = {
  /** 우리 학교 시약, 이름순 (검색은 이 목록 안에서 이름으로 거른다. 검색어가 비면 전체를 보여 준다) */
  reagents: IntakeReagent[];
  /** 입고일 기본값 = 오늘 (YYYY-MM-DD). 서버에서 학교 시간대로 계산해 넘긴다 */
  defaultIntakeDate: string;
  /** 처음부터 골라 둘 시약 (화면 3 "입고" 버튼으로 들어온 경우) */
  defaultSelectedId?: string;
  defaultQuery?: string;
  defaultQuantity?: number;
  /** 프리셋 칩 값 */
  presets?: number[];
  onSubmit?: (values: StockIntakeValues) => void;
  /** 저장 중 (버튼 비활성) */
  pending?: boolean;
  /** 저장 실패 안내 */
  error?: string | null;
  /** 검색 0건 안내의 "새 시약 등록" — 있으면 콜백(갈래 전환), 없으면 registerHref 링크. 버튼은 항상 그린다 */
  onRegisterNew?: () => void;
  /** onRegisterNew 가 없을 때 "새 시약 등록" 이 가는 곳 */
  registerHref?: string;
  /** 모바일에서 하단 버튼 줄을 tab-bar 바로 위에 고정 (갤러리에서는 false) */
  stickyActions?: boolean;
};

const QUANTITY_ERROR = "1 이상 입력하세요";
const DEFAULT_PRESETS = [1, 5, 10];
const DEFAULT_REGISTER_HREF = "/intake?tab=register";
const numberFmt = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });

/** 시안 표기: "3병" · "30 g" · "500 mL" */
function stockText(value: number, unit: string): string {
  return unit === "병" ? `${numberFmt.format(value)}${unit}` : `${numberFmt.format(value)} ${unit}`;
}

/** 빈 값·음수·숫자 아님 → null */
function parseQuantity(text: string): number | null {
  const t = text.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function quantityText(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/**
 * 화면 7 "기존 시약 입고" 갈래.
 * 검색(text-input) → 결과(reagent-row)에서 1개 선택 → 선택한 시약 카드 → 스테퍼 + 프리셋 칩 → 재고 미리보기 → 입고일 → "입고".
 * 저장은 하지 않는다 — onSubmit 으로 값만 넘긴다.
 */
export function StockIntake({
  reagents,
  defaultIntakeDate,
  defaultSelectedId,
  defaultQuery = "",
  defaultQuantity = 1,
  presets = DEFAULT_PRESETS,
  onSubmit,
  pending,
  error,
  onRegisterNew,
  registerHref = DEFAULT_REGISTER_HREF,
  stickyActions = true,
}: Props) {
  const [query, setQuery] = useState(defaultQuery);
  const [selectedId, setSelectedId] = useState<string | null>(defaultSelectedId ?? null);
  const [quantity, setQuantity] = useState(quantityText(defaultQuantity));
  const [intakeDate, setIntakeDate] = useState(defaultIntakeDate);
  const quantityLabelId = useId();
  const quantityErrorId = useId();

  const q = query.trim().toLowerCase();
  const selected = reagents.find((r) => r.id === selectedId) ?? null;
  // 검색어가 있으면 이름으로 거른다. 비어 있으면 전체(넘겨받은 순서 = 이름순)를 보여 주되,
  // 이미 고른 시약이 있으면 그 한 줄만 남겨 수량 입력이 목록 아래로 멀리 밀리지 않게 한다(X 로 선택을 풀면 다시 전체).
  const results = q ? reagents.filter((r) => r.name.toLowerCase().includes(q)) : selected ? [selected] : reagents;

  const amount = parseQuantity(quantity);
  const quantityValid = amount !== null && amount >= 1;
  const canSubmit = Boolean(selected) && quantityValid && intakeDate !== "" && !pending;

  const step = (delta: number) => setQuantity(quantityText(Math.max(0, (amount ?? 0) + delta)));

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selected || !canSubmit || amount === null) return;
    onSubmit?.({ reagentId: selected.id, amount, intakeDate });
  };

  return (
    <form
      data-component="stock-intake"
      className={[styles.root, stickyActions ? styles.sticky : ""].join(" ").trim()}
      onSubmit={submit}
      noValidate
    >
      <div className={styles.searchColumn}>
        <TextInput
          icon="search"
          type="search"
          placeholder="시약명 검색"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {results.length > 0 ? (
          <ul className={styles.results} aria-label={q ? "검색 결과" : "시약 목록"}>
            {results.map((r) => (
              <li key={r.id}>
                <ReagentRow
                  title={r.name}
                  body={`현재 ${stockText(r.stock, r.unit)}`}
                  selected={r.id === selectedId}
                  onSelect={() => setSelectedId(r.id)}
                />
              </li>
            ))}
          </ul>
        ) : null}
        {q && results.length === 0 ? (
          <EmptyStateCard
            title="찾는 시약이 없어요"
            description="시약명을 확인하거나 새로 등록하세요"
            actionLabel="새 시약 등록"
            onAction={onRegisterNew}
            actionHref={onRegisterNew ? undefined : registerHref}
          />
        ) : null}
      </div>

      <div className={styles.intakeColumn}>
        {selected ? (
          <>
            <div className={styles.selectedCard} data-name="selected-reagent">
              <div className={styles.cardBody}>
                <span className={styles.caption}>선택한 시약</span>
                <span className={styles.name}>{selected.name}</span>
              </div>
              <button
                type="button"
                className={styles.close}
                aria-label="선택 취소"
                onClick={() => setSelectedId(null)}
              >
                <Icon name="close" className={styles.closeIcon} />
              </button>
            </div>

            <div className={styles.quantityBlock}>
              <div className={styles.quantityField} data-name="quantity-field">
                <div className={styles.labelRow}>
                  <span id={quantityLabelId} className={styles.label}>
                    입고 수량
                  </span>
                  <span className={styles.required}>필수</span>
                </div>
                <div className={styles.stepper} role="group" aria-labelledby={quantityLabelId}>
                  <ButtonOutline
                    shape="circle"
                    aria-label="수량 1 줄이기"
                    disabled={amount === null || amount <= 0}
                    onClick={() => step(-1)}
                  >
                    −
                  </ButtonOutline>
                  <TextInput
                    className={styles.quantityInput}
                    density="compact"
                    unit={selected.unit}
                    unitTone="plain"
                    name="amount"
                    inputMode="decimal"
                    autoComplete="off"
                    aria-label="입고 수량"
                    aria-invalid={quantityValid ? undefined : true}
                    aria-describedby={quantityValid ? undefined : quantityErrorId}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                  <ButtonOutline shape="circle" aria-label="수량 1 늘리기" onClick={() => step(1)}>
                    +
                  </ButtonOutline>
                </div>
              </div>
              {quantityValid ? null : (
                <p id={quantityErrorId} role="alert" className={styles.fieldError}>
                  {QUANTITY_ERROR}
                </p>
              )}
            </div>

            <div className={styles.presets} role="group" aria-label="수량 바로 넣기" data-name="preset-chips">
              {presets.map((p) => (
                <ButtonPillSoft key={p} selected={amount === p} onClick={() => setQuantity(quantityText(p))}>
                  {p}
                </ButtonPillSoft>
              ))}
            </div>

            <p className={styles.preview} data-name="intake-preview">
              <Icon name="info" className={styles.infoIcon} />
              <span>
                현재 {stockText(selected.stock, selected.unit)}
                {quantityValid && amount !== null
                  ? ` → 입고 후 ${stockText(selected.stock + amount, selected.unit)}`
                  : ""}
              </span>
            </p>

            <TextInput
              label="입고일"
              labelTone="strong"
              required
              icon="calendar"
              type="date"
              name="intake_date"
              value={intakeDate}
              onChange={(e) => setIntakeDate(e.target.value)}
            />
          </>
        ) : null}

        {error ? (
          <p role="alert" className={styles.fieldError}>
            {error}
          </p>
        ) : null}

        <div className={styles.actions} data-name="bottom-actions">
          <ButtonPrimary type="submit" className={styles.primary} disabled={!canSubmit}>
            {pending ? "저장 중…" : "입고"}
          </ButtonPrimary>
        </div>
      </div>
    </form>
  );
}
