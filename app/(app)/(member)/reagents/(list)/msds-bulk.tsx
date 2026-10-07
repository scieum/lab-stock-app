"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Toast } from "@/components/ex-toast";
import { MsdsBulkBanner } from "@/components/msds-bulk-banner";
import { MsdsCandidates } from "@/components/msds-candidates";
import { MSDS_BULK_MAX, MSDS_TEXT, bulkDoneText } from "@/lib/msds-rules";
import { useMsdsSearch } from "@/lib/use-msds-search";
import { refreshAfterMsdsAction, setReagentMsdsAction } from "../msds-actions";

const TOAST_MS = 2500;

export type MsdsBulkTarget = { id: string; name: string };

type Props = {
  /** 지금 목록에서 MSDS 없는 시약 (목록 순서) */
  targets: readonly MsdsBulkTarget[];
};

/**
 * 화면 2 MSDS 일괄 찾기 (디자인 1.17 2-msds-bulk, d7 §20) — 교사·admin 이 "MSDS 없는 시약만" 필터를 켰을 때.
 * msds-bulk-banner "MSDS 없는 시약 N종 · 한 번에 찾기" → 시약마다 차례로 후보 시트(제목 = 시약 이름 + "1 / N",
 * "알맞은 MSDS를 골라 주세요") → "이 MSDS로"(또는 직접 주소) = 바로 set_reagent_msds 저장 / "건너뛰기" → 다음.
 * 한 번에 최대 20종(목록 앞에서부터). 끝나거나 × 로 닫으면 저장한 수만큼 토스트 "N종에 MSDS를 넣었어요" + 목록 다시 받기.
 */
export function MsdsBulk({ targets }: Props) {
  const { state, search, reset } = useMsdsSearch();
  /** 시작할 때 고정한 대상 (진행 중 목록이 바뀌어도 그대로) */
  const [queue, setQueue] = useState<MsdsBulkTarget[] | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const saved = useRef(0);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const current = queue ? queue[index] : undefined;

  const finish = () => {
    const n = saved.current;
    saved.current = 0;
    setQueue(null);
    setIndex(0);
    setError(null);
    reset();
    if (n > 0) {
      setToast(bulkDoneText(n));
      void refreshAfterMsdsAction();
    }
  };

  const goTo = (list: MsdsBulkTarget[], i: number) => {
    if (i >= list.length) {
      finish();
      return;
    }
    setIndex(i);
    setError(null);
    void search(list[i].name);
  };

  const start = () => {
    const list = targets.slice(0, MSDS_BULK_MAX).map((t) => ({ id: t.id, name: t.name }));
    if (list.length === 0) return;
    saved.current = 0;
    setToast(null);
    setQueue(list);
    goTo(list, 0);
  };

  const save = (msdsUrl: string, casNo: string | null) => {
    if (!queue || !current || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await setReagentMsdsAction({ reagentId: current.id, msdsUrl, casNo, revalidate: false }).catch(() => null);
      if (!res || !res.ok) {
        setError(res ? res.error : MSDS_TEXT.saveFailed);
        return;
      }
      saved.current += 1;
      goTo(queue, index + 1);
    });
  };

  return (
    <>
      {targets.length > 0 ? <MsdsBulkBanner count={targets.length} onStart={start} disabled={queue !== null} /> : null}
      {queue && current ? (
        <MsdsCandidates
          key={current.id}
          title={current.name}
          progress={`${index + 1} / ${queue.length}`}
          caption={MSDS_TEXT.pick}
          status={state.status}
          candidates={state.status === "ready" ? state.candidates : undefined}
          message={state.status === "error" ? state.message : undefined}
          onRetry={() => void search(current.name)}
          onConfirm={(c) => save(c.msdsUrl, c.cas)}
          onSubmitUrl={(url) => save(url, null)}
          onSkip={() => goTo(queue, index + 1)}
          onClose={() => {
            if (!pending) finish();
          }}
          pending={pending}
          error={error}
        />
      ) : null}
      {toast ? <Toast floating>{toast}</Toast> : null}
    </>
  );
}
