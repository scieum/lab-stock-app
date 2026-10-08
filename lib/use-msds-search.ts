"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MSDS_TEXT, checkMsdsQuery, isCasQuery, readCandidates, readSearchedAs, readSearchedVia, type MsdsCandidate, type MsdsSearchedVia } from "@/lib/msds-rules";

export type MsdsSearchState =
  | { status: "idle" }
  | { status: "loading"; query: string }
  | { status: "ready"; query: string; candidates: MsdsCandidate[]; searchedAs: string | null; searchedVia: MsdsSearchedVia | null }
  | { status: "error"; query: string; message: string };

/** 서버 오류 본문의 문구 (없으면 기본 문구). 키·주소는 서버가 이미 넣지 않는다 */
function errorMessage(body: unknown, status: number): string {
  const msg = body && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
  if (typeof msg === "string" && msg.trim() !== "") return msg;
  if (status === 503) return MSDS_TEXT.noKey;
  return MSDS_TEXT.upstream;
}

/**
 * GET /api/msds/search 를 부르는 화면 쪽 상태 (d7 §20). 새 검색을 시작하면 앞 요청은 취소한다.
 * cas = 시약에 저장된 CAS (화면 3·2 일괄 — 검색 보강 (1)). 화면 7 은 이름만.
 * 화면이 사라지면 진행 중 요청도 취소한다.
 */
export function useMsdsSearch() {
  const [state, setState] = useState<MsdsSearchState>({ status: "idle" });
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => () => ctrl.current?.abort(), []);

  const search = useCallback(async (raw: string, cas?: string | null) => {
    const q = checkMsdsQuery(raw);
    ctrl.current?.abort();
    if (!q.ok) {
      setState({ status: "error", query: raw, message: MSDS_TEXT.badQuery });
      return;
    }
    const c = new AbortController();
    ctrl.current = c;
    setState({ status: "loading", query: q.value });
    try {
      const params = new URLSearchParams({ q: q.value });
      const c2 = typeof cas === "string" ? cas.trim() : "";
      if (c2 && isCasQuery(c2)) params.set("cas", c2);
      const res = await fetch(`/api/msds/search?${params}`, {
        signal: c.signal,
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const body: unknown = await res.json().catch(() => null);
      if (c.signal.aborted) return;
      if (!res.ok) {
        setState({ status: "error", query: q.value, message: errorMessage(body, res.status) });
        return;
      }
      const candidates = readCandidates(body);
      if (!candidates) {
        setState({ status: "error", query: q.value, message: MSDS_TEXT.upstream });
        return;
      }
      setState({ status: "ready", query: q.value, candidates, searchedAs: readSearchedAs(body), searchedVia: readSearchedVia(body) });
    } catch {
      if (c.signal.aborted) return;
      setState({ status: "error", query: q.value, message: MSDS_TEXT.upstream });
    }
  }, []);

  const reset = useCallback(() => {
    ctrl.current?.abort();
    setState({ status: "idle" });
  }, []);

  return { state, search, reset };
}
