"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ButtonPrimary } from "@/components/button-primary";
import { Toast } from "@/components/ex-toast";
import { ReagentDetailCard } from "@/components/reagent-detail-card";
import { SelectField } from "@/components/select-field";
import { TextInput } from "@/components/text-input";
import type { UsageEntry } from "@/lib/supabase/usage-entry";
import { USAGE_MEMO_MAX } from "@/lib/usage-history-rules";
import { recordUsageAction } from "./actions";
import styles from "./usage.module.css";

const numberFmt = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });
const TOAST_MS = 3000;

/**
 * 화면 4 사용 기록 입력.
 * 시안: 요약 열(reagent-detail-card) + 폼 열(usage-form: 사용 날짜 · 사용량 · 사용자 · 메모 + bottom-actions).
 * 메모는 선택 항목("필수" 표시 없음, 최대 200자).
 * 사용 날짜·사용자는 DB(record_usage)가 기록 시각·로그인 사용자로 채우므로 읽기 전용으로 보여 준다.
 */
export function UsageForm({ entry }: { entry: UsageEntry }) {
  const router = useRouter();
  const { reagent } = entry;
  const [stock, setStock] = useState(reagent?.stock ?? 0);
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
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
      const res = await recordUsageAction(reagent.id, amount, memo);
      if (res.stock !== undefined) setStock(res.stock);
      if (res.ok) {
        setAmount("");
        setMemo("");
        setToast(Date.now());
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div className={styles.page}>
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
            <TextInput label="사용 날짜" required icon="calendar" value={entry.today} readOnly />
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
          <div className={styles.actions}>
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
