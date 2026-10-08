"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ButtonPrimary } from "@/components/button-primary";
import { DrawerField, DrawerRows } from "@/components/detail-drawer";
import { Toast } from "@/components/ex-toast";
import { PastDateNote } from "@/components/past-date-note";
import { ReagentDetailCard } from "@/components/reagent-detail-card";
import { SelectField } from "@/components/select-field";
import { TextInput } from "@/components/text-input";
import { UsageDate } from "@/components/usage-date";
import type { UsageEntry } from "@/lib/supabase/usage-entry";
import { USAGE_MEMO_MAX, pastDateNoteText } from "@/lib/usage-history-rules";
import { usageNewHref } from "@/lib/reagent-desk";
import { DeskDrawer } from "../../_desk/desk-drawer";
import { recordUsageAction } from "./actions";
import styles from "./usage.module.css";

const numberFmt = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });
const TOAST_MS = 3000;

/**
 * 화면 4 사용 기록 입력 (디자인 1.17).
 * 시안: reagent-detail-card → usage-form(사용량 · usage-date 사용일 · 사용자 · 메모) → bottom-actions(past-date-note + 저장).
 * 사용일(d7 §15): 기본 오늘, 날짜 고르기의 최댓값 = 오늘(한국 날짜). 오늘이 아니면 저장 버튼 위에 "10월 3일 사용으로 기록해요".
 * 메모는 선택 항목("필수" 표시 없음, 최대 200자). 사용자는 DB(record_usage)가 로그인 사용자로 채우므로 읽기 전용.
 */
function useUsageForm(entry: UsageEntry) {
  const router = useRouter();
  const { reagent } = entry;
  const [stock, setStock] = useState(reagent?.stock ?? 0);
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [usedOn, setUsedOn] = useState(entry.today);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState(0);
  const [pending, startTransition] = useTransition();
  const errorId = useId();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(0), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!reagent || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await recordUsageAction(reagent.id, amount, memo, usedOn);
      if (res.stock !== undefined) setStock(res.stock);
      if (res.ok) {
        setAmount("");
        setMemo("");
        setUsedOn(entry.today);
        setToast(Date.now());
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  // 날짜를 지우면(빈 값) 저장 때 오늘로 기록된다 — 안내는 오늘이 아닌 실제 날짜일 때만
  const past = usedOn !== "" && usedOn < entry.today;

  const changeAmount = (v: string) => {
    setAmount(v);
    if (error) setError(null);
  };
  const changeMemo = (v: string) => {
    setMemo(v);
    if (error) setError(null);
  };
  const changeDate = (v: string) => {
    setUsedOn(v);
    if (error) setError(null);
  };

  return { router, reagent, stock, amount, memo, usedOn, error, toast, pending, errorId, submit, past, changeAmount, changeMemo, changeDate };
}

export function UsageForm({ entry }: { entry: UsageEntry }) {
  const { router, reagent, stock, amount, memo, usedOn, error, toast, pending, errorId, submit, past, changeAmount, changeMemo, changeDate } =
    useUsageForm(entry);

  return (
    <div className={[styles.page, past ? styles.withNote : ""].filter(Boolean).join(" ")}>
      <div className={styles.layout}>
        <div className={styles.summary}>
          {reagent ? (
            <ReagentDetailCard variant="compact" name={reagent.name} stock={numberFmt.format(stock)} unit={reagent.unit} />
          ) : (
            <div className={styles.picker}>
              <SelectField
                label="시약"
                placeholder="시약을 선택하세요"
                options={entry.options}
                onChange={(v) => router.push(`/usage/new?reagent=${encodeURIComponent(v)}`)}
              />
            </div>
          )}
        </div>
        <form className={styles.formColumn} onSubmit={submit} noValidate>
          <div className={styles.form} data-name="usage-form">
            <div className={styles.amountField}>
              <TextInput
                label="사용량"
                required
                name="amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                unit={reagent?.unit}
                value={amount}
                onChange={(e) => changeAmount(e.target.value)}
                disabled={!reagent}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
              />
              {error ? (
                <p id={errorId} role="alert" className={styles.error}>
                  {error}
                </p>
              ) : null}
            </div>
            <UsageDate
              value={usedOn}
              max={entry.today}
              disabled={!reagent}
              onChange={changeDate}
            />
            <TextInput label="사용자" required value={entry.userName} readOnly />
            <TextInput
              label="메모"
              name="memo"
              autoComplete="off"
              placeholder="메모를 남겨 주세요"
              maxLength={USAGE_MEMO_MAX}
              value={memo}
              onChange={(e) => changeMemo(e.target.value)}
              disabled={!reagent}
            />
          </div>
          <div className={styles.actions} data-name="bottom-actions">
            {past ? <PastDateNote>{pastDateNoteText(usedOn)}</PastDateNote> : null}
            <ButtonPrimary type="submit" className={styles.primary} disabled={!reagent || pending}>
              {pending ? "저장 중…" : "사용 기록 저장"}
            </ButtonPrimary>
          </div>
        </form>
      </div>
      {toast ? (
        <Toast key={toast} floating>
          사용 기록을 저장했어요
        </Toast>
      ) : null}
    </div>
  );
}

/**
 * 화면 4 사용 기록 입력 — 데스크톱 (디자인 1.24 4-desktop · 4-past-date-desktop, d7 §23 run b):
 * 시약 목록 옆 오른쪽 detail-drawer. drawer-nav("‹ 시약 상세" + ×) → drawer-title("사용 기록" + "에탄올 · 현재 1,200 mL") →
 * usage-form(form-row: 사용량 필수 · 사용일 필수(usage-date) · 사용자 필수 · 메모) → drawer-actions((지난 날짜면) past-date-note + "사용 기록 저장").
 * 시약 없이 열면(?reagent 없음) 첫 줄에서 시약을 고른다. 저장하면 토스트 + 목록 재고가 서버에서 다시 내려온다.
 */
export function UsageFormDrawer({ entry }: { entry: UsageEntry }) {
  const { router, reagent, stock, amount, memo, usedOn, error, toast, pending, errorId, submit, past, changeAmount, changeMemo, changeDate } =
    useUsageForm(entry);
  const sp = useSearchParams();
  const formId = useId();
  const ids = { amount: useId(), date: useId(), user: useId(), memo: useId() };

  return (
    <>
      <DeskDrawer
        reagentId={reagent?.id ?? null}
        back={reagent ? "detail" : undefined}
        title="사용 기록"
        caption={reagent ? `${reagent.name} · 현재 ${numberFmt.format(stock)} ${reagent.unit}` : undefined}
        focusKey={reagent?.id ?? "pick"}
        actions={
          <>
            {past ? <PastDateNote>{pastDateNoteText(usedOn)}</PastDateNote> : null}
            <ButtonPrimary type="submit" form={formId} disabled={!reagent || pending}>
              {pending ? "저장 중…" : "사용 기록 저장"}
            </ButtonPrimary>
          </>
        }
      >
        <form id={formId} onSubmit={submit} noValidate>
          <DrawerRows name="usage-form">
            {reagent ? null : (
              <div className={styles.drawerPick} data-name="form-row">
                <SelectField
                  label="시약"
                  inlineLabel
                  placeholder="시약을 선택하세요"
                  options={entry.options}
                  onChange={(v) => router.push(usageNewHref(v, sp), { scroll: false })}
                />
              </div>
            )}
            <DrawerField label="사용량" required htmlFor={ids.amount}>
              <TextInput
                id={ids.amount}
                aria-label="사용량"
                required
                name="amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0"
                unit={reagent?.unit}
                value={amount}
                onChange={(e) => changeAmount(e.target.value)}
                disabled={!reagent}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
              />
              {error ? (
                <p id={errorId} role="alert" className={styles.error}>
                  {error}
                </p>
              ) : null}
            </DrawerField>
            <DrawerField label="사용일" required htmlFor={ids.date}>
              <UsageDate id={ids.date} label="" value={usedOn} max={entry.today} disabled={!reagent} onChange={changeDate} />
            </DrawerField>
            <DrawerField label="사용자" required htmlFor={ids.user}>
              <TextInput id={ids.user} aria-label="사용자" value={entry.userName} readOnly />
            </DrawerField>
            <DrawerField label="메모" htmlFor={ids.memo}>
              <TextInput
                id={ids.memo}
                aria-label="메모"
                name="memo"
                autoComplete="off"
                placeholder="메모를 남겨 주세요"
                maxLength={USAGE_MEMO_MAX}
                value={memo}
                onChange={(e) => changeMemo(e.target.value)}
                disabled={!reagent}
              />
            </DrawerField>
          </DrawerRows>
        </form>
      </DeskDrawer>
      {toast ? (
        <Toast key={toast} floating>
          사용 기록을 저장했어요
        </Toast>
      ) : null}
    </>
  );
}
