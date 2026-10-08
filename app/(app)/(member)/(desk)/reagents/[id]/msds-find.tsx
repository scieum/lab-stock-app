"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/ex-toast";
import { MsdsCandidates } from "@/components/msds-candidates";
import { MsdsSearch } from "@/components/msds-search";
import { MSDS_TEXT, type MsdsCandidate } from "@/lib/msds-rules";
import { useMsdsSearch } from "@/lib/use-msds-search";
import { setReagentMsdsAction } from "../msds-actions";

const TOAST_MS = 2000;
/** 저장 뒤 화면을 다시 받으면 이 버튼(MSDS 없는 자리)은 사라진다 — 토스트는 늘 있는 MsdsSavedToast 가 띄운다 */
const SAVED_EVENT = "lab-stock:msds-saved";

/** casNo = 시약에 저장된 CAS — 검색 보강 (1) 로 함께 보낸다 (d7 §20) */
type Props = { reagentId: string; reagentName: string; casNo?: string | null };

/**
 * 화면 3 MSDS 없는 시약의 "MSDS 찾기" (디자인 1.17 3-msds, d7 §20) — 교사·admin 에게만 둔다.
 * 누르면 시약 이름으로 찾아 후보 시트(msds-candidates) → "이 MSDS로"(또는 직접 주소) → set_reagent_msds 저장
 * (CAS 는 시약 CAS 가 비어 있을 때만 DB 가 채운다) → 토스트 "MSDS를 넣었어요" → 화면을 다시 받는다.
 */
export function MsdsFind({ reagentId, reagentName, casNo = null }: Props) {
  const router = useRouter();
  const { state, search, reset } = useMsdsSearch();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(reagentName);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const start = () => {
    setError(null);
    setQuery(reagentName);
    setOpen(true);
    void search(reagentName, casNo);
  };

  /** 검색 상자에서 시약 이름을 그대로 두면 시약 CAS 도 함께, 바꿨으면 입력한 검색어만 */
  const searchQuery = () => void search(query, query.trim() === reagentName.trim() ? casNo : null);

  const close = () => {
    if (pending) return;
    setOpen(false);
    reset();
  };

  const save = (msdsUrl: string, casNo: string | null) => {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const res = await setReagentMsdsAction({ reagentId, msdsUrl, casNo }).catch(() => null);
      if (!res) {
        setError(MSDS_TEXT.saveFailed);
        return;
      }
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      reset();
      window.dispatchEvent(new CustomEvent(SAVED_EVENT));
      router.refresh();
    });
  };

  return (
    <>
      <MsdsSearch onClick={start} aria-expanded={open} />
      {open ? (
        <MsdsCandidates
          caption={reagentName}
          query={query}
          onQueryChange={setQuery}
          onSearch={searchQuery}
          status={state.status}
          candidates={state.status === "ready" ? state.candidates : undefined}
          searchedAs={state.status === "ready" ? state.searchedAs : null}
          searchedVia={state.status === "ready" ? state.searchedVia : null}
          searchedQuery={state.status === "idle" ? undefined : state.query}
          message={state.status === "error" ? state.message : undefined}
          onRetry={searchQuery}
          onConfirm={(c: MsdsCandidate) => save(c.msdsUrl, c.cas)}
          onSubmitUrl={(url) => save(url, null)}
          onClose={close}
          pending={pending}
          error={error}
        />
      ) : null}
    </>
  );
}

/** 화면 3 저장 토스트 "MSDS를 넣었어요" — 시약 상세에 늘 두고, MsdsFind 가 저장하면 띄운다 */
export function MsdsSavedToast() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const on = () => setShown(true);
    window.addEventListener(SAVED_EVENT, on);
    return () => window.removeEventListener(SAVED_EVENT, on);
  }, []);

  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(false), TOAST_MS);
    return () => clearTimeout(t);
  }, [shown]);

  return shown ? <Toast floating>{MSDS_TEXT.saved}</Toast> : null;
}
