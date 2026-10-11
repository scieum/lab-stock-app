"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Toast } from "@/components/ex-toast";
import { BulkActionBar } from "./index";
import { BulkDeleteConfirm, bulkDeleteDone, type BulkKind } from "./confirm";
import styles from "./flow.module.css";

export type BulkRunResult = { ok: true; count: number } | { ok: false; error: string };

type Props = {
  kind: BulkKind;
  /** 선택 모드인가 (아니면 바 · 모달을 그리지 않는다 — 토스트는 남는다) */
  selecting: boolean;
  /** 고른 항목 (목록 순서) */
  selected: { id: string; name: string }[];
  /** 보관 서버 액션 (archive_reagents · archive_sensors) */
  run: (ids: string[]) => Promise<BulkRunResult>;
  /** 끝난 뒤 — 선택 모드 끝 (목록은 서버가 다시 보낸다) */
  onDone: () => void;
};

const TOAST_MS = 3000;

/**
 * 여러 개 삭제 흐름 (디자인 1.26 bulk_delete, d7 §25): 1개 이상 고르면 bulk-action-bar → "삭제" → 확인 모달(ex-modal-card) →
 * 보관 → 토스트 "{시약|센서} N개를 삭제했어요", 목록 그대로 · 선택 모드 끝. 교사·admin 화면에만 그린다.
 * 모바일 = tab-bar 위 바 · 하단 시트 / 데스크톱 = 본문 아래 바 · 본문 가운데 카드(딤 없음).
 */
export function BulkDeleteFlow({ kind, selecting, selected, run, onDone }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ key: number; text: string } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const open = selecting && confirming && selected.length > 0;

  const cancel = () => {
    if (pending) return;
    setConfirming(false);
    setError(null);
    // 닫은 뒤 포커스를 바의 "삭제"로 돌려준다
    window.requestAnimationFrame(() => barRef.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true }));
  };

  const confirm = () => {
    if (pending) return;
    setError(null);
    const ids = selected.map((s) => s.id);
    startTransition(async () => {
      const res = await run(ids);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setConfirming(false);
      setToast({ key: Date.now(), text: bulkDeleteDone(kind, res.count) });
      onDone();
    });
  };

  return (
    <>
      {/* 확인 모달이 열린 동안 모바일은 바를 숨긴다 (하단 시트와 같은 자리). 데스크톱은 그대로 (시안 2-bulk-delete-desktop) */}
      {selecting && selected.length > 0 ? (
        <div ref={barRef} className={[styles.barSpace, open ? styles.underSheet : ""].filter(Boolean).join(" ")}>
          <BulkActionBar count={selected.length} pending={pending} onDelete={() => setConfirming(true)} />
        </div>
      ) : null}
      {open ? (
        <div className={styles.dialog}>
          <BulkDeleteConfirm
            kind={kind}
            names={selected.map((s) => s.name)}
            pending={pending}
            error={error}
            modal={false}
            onCancel={cancel}
            onConfirm={confirm}
          />
        </div>
      ) : null}
      {toast ? (
        <Toast key={toast.key} floating>
          {toast.text}
        </Toast>
      ) : null}
    </>
  );
}
