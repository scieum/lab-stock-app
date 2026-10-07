"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ButtonPrimary } from "@/components/button-primary";
import { Toast } from "@/components/ex-toast";
import { PastDateNote } from "@/components/past-date-note";
import { ReagentDetailCard } from "@/components/reagent-detail-card";
import { SelectField } from "@/components/select-field";
import { TextInput } from "@/components/text-input";
import { UsageDate } from "@/components/usage-date";
import type { UsageEntry } from "@/lib/supabase/usage-entry";
import { USAGE_MEMO_MAX, pastDateNoteText } from "@/lib/usage-history-rules";
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
export function UsageForm({ entry }: { entry: UsageEntry }) {
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
                onChange={(e) => {
                  setAmount(e.target.value);
                  if (error) setError(null);
                }}
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
              onChange={(v) => {
                setUsedOn(v);
                if (error) setError(null);
              }}
            />
            <TextInput label="사용자" required value={entry.userName} readOnly />
            <TextInput
              label="메모"
              name="memo"
              autoComplete="off"
              placeholder="메모를 남겨 주세요"
              maxLength={USAGE_MEMO_MAX}
              value={memo}
              onChange={(e) => {
                setMemo(e.target.value);
                if (error) setError(null);
              }}
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
