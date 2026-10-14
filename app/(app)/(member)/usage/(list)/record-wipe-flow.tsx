"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/ex-toast";
import { PageMoreMenu } from "@/components/page-more-menu";
import { RecordWipe, RecordWipeItem, type RecordWipeRequest } from "@/components/record-wipe";
import { recordWipeDoneText, type WipeCounts } from "@/lib/wipe-rules";
import { countWipeRecordsAction, wipeRecordsAction } from "../wipe-actions";

/** 기록 삭제 진입 (admin 만 — 교사·학생·둘러보기는 없음) */
export type RecordWipeEntry = {
  /** 우리 학교 이름 (school-name-confirm) */
  schoolName: string;
  /** 오늘 (한국 날짜 YYYY-MM-DD — 서버가 정한다) */
  today: string;
  /** 지울 기록이 0건 (사용 + 입고 전체) — 메뉴 항목 비활성 + '지울 기록이 없어요' */
  empty: boolean;
};

const TOAST_MS = 3000;
const ZERO: WipeCounts = { usage: 0, intake: 0 };

/**
 * 기록 삭제 흐름 (d7 §29, rules 1.29 wipe.record — 시안 10-record-wipe-mobile · 10-record-wipe-desktop):
 * page-more-menu ⋯ → record-wipe '기록 삭제' → (모바일 바텀시트 / 데스크톱 detail-drawer) record-wipe-range(기본 '이 날짜 이전')
 * → count_wipe_records 미리보기(wipe-preview) → school-name-confirm → '기록 {N+M}건 삭제' → wipe_records → 토스트.
 * menu = 머리 줄 ⋯, panel = 시트·드로어(데스크톱은 기록 상세 드로어 자리), toast = 끝난 뒤 토스트.
 */
export function useRecordWipe(entry: RecordWipeEntry | undefined, variant: "sheet" | "drawer", onOpen?: () => void) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<WipeCounts | null>(null);
  const [before, setBefore] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ key: number; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const seq = useRef(0);
  const moreRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  // 범위·날짜가 바뀌면 미리보기 수를 다시 센다 (늦게 온 옛 응답은 버린다)
  const onBeforeChange = useCallback((next: string | null | undefined) => {
    setBefore(next);
    const id = ++seq.current;
    if (next === undefined) {
      setCounts(ZERO);
      return;
    }
    setCounts(null);
    void countWipeRecordsAction(next).then(
      (res) => {
        if (id !== seq.current) return;
        if (res.ok) {
          setCounts(res.counts);
          setError(null);
        } else {
          setCounts(ZERO);
          setError(res.error);
        }
      },
      () => {
        if (id === seq.current) setCounts(ZERO);
      },
    );
  }, []);

  const close = () => {
    if (pending) return;
    seq.current++;
    setOpen(false);
    setCounts(null);
    setError(null);
    window.requestAnimationFrame(() => moreRef.current?.focus({ preventScroll: true }));
  };

  const confirm = (req: RecordWipeRequest) => {
    if (pending || before === undefined) return;
    setError(null);
    startTransition(async () => {
      const res = await wipeRecordsAction(req.before, req.schoolName);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      seq.current++;
      setOpen(false);
      setCounts(null);
      setToast({ key: Date.now(), text: recordWipeDoneText(res.counts) });
      router.refresh();
    });
  };

  if (!entry) return { open: false, menu: null, panel: null, toast: null };

  const menu = (
    <PageMoreMenu label="사용 기록 더보기" buttonRef={moreRef}>
      <RecordWipeItem
        empty={entry.empty}
        onSelect={() => {
          onOpen?.();
          setError(null);
          setOpen(true);
        }}
      />
    </PageMoreMenu>
  );
  const panel = open ? (
    <RecordWipe
      variant={variant}
      schoolName={entry.schoolName}
      today={entry.today}
      counts={counts}
      onBeforeChange={onBeforeChange}
      pending={pending}
      error={error}
      onClose={close}
      onConfirm={confirm}
    />
  ) : null;
  const toastNode = toast ? (
    <Toast key={toast.key} floating>
      {toast.text}
    </Toast>
  ) : null;
  return { open, menu, panel, toast: toastNode };
}
