"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/ex-toast";
import { PageMoreMenu } from "@/components/page-more-menu";
import { ReagentWipeConfirm, ReagentWipeItem } from "@/components/reagent-wipe";
import { reagentWipeDoneText } from "@/lib/wipe-rules";
import { wipeReagentsAction } from "./wipe-actions";
import styles from "./wipe.module.css";

type Props = {
  /** 지울 시약 수 (보관 안 된 우리 학교 시약 — 목록 전체, 필터와 무관) */
  count: number;
  /** 우리 학교 이름 (school-name-confirm) */
  schoolName: string;
};

const TOAST_MS = 3000;

/**
 * 시약 전체 삭제 흐름 (d7 §29, rules 1.29 wipe.reagent — 시안 2-wipe-mobile · 2-wipe-desktop):
 * page-more-menu ⋯ → reagent-wipe '시약 전체 삭제'(0종이면 비활성 + '지울 시약이 없어요') → 확인 카드(school-name-confirm) →
 * wipe_reagents → 토스트 '시약 {N}종을 삭제했어요' → 목록을 다시 받아 빈 목록.
 * admin 화면에만 그린다 (R8 교사 0 · R5 학생 0 · 둘러보기 숨김) — 부르는 쪽이 정한다. 선택 모드에서는 그리지 않는다.
 * 모바일 = 목록 머리 오른쪽 · tab-bar 위 하단 시트 / 데스크톱 = page-actions 끝 · 본문 가운데 카드 440(딤 없음).
 */
export function ReagentWipeFlow({ count, schoolName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ key: number; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const moreRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const close = () => {
    if (pending) return;
    setOpen(false);
    setValue("");
    setError(null);
    window.requestAnimationFrame(() => moreRef.current?.focus({ preventScroll: true }));
  };

  const confirm = () => {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const res = await wipeReagentsAction(value);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setValue("");
      setToast({ key: Date.now(), text: reagentWipeDoneText(res.count) });
      router.refresh();
    });
  };

  return (
    <>
      <PageMoreMenu label="시약 목록 더보기" buttonRef={moreRef}>
        <ReagentWipeItem count={count} onSelect={() => setOpen(true)} />
      </PageMoreMenu>
      {open ? (
        <div className={styles.dialog}>
          <ReagentWipeConfirm
            count={count}
            schoolName={schoolName}
            value={value}
            onValueChange={setValue}
            pending={pending}
            error={error}
            modal={false}
            onCancel={close}
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
