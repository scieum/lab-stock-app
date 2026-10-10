"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/ex-toast";
import { REAGENT_DELETE_TEXT, ReagentDelete, ReagentDeleteConfirm } from "@/components/reagent-delete";
import { ReagentMoreMenu } from "@/components/reagent-more-menu";
import { archiveReagentAction } from "./actions";
import styles from "./detail.module.css";

/** 토스트를 보여 주고 화면 2 로 가기까지 */
const LEAVE_MS = 1500;

type Props = {
  reagentId: string;
  name: string;
  /** 삭제 뒤 갈 곳 = 화면 2 (데스크톱은 지금 목록 쿼리 그대로) */
  listHref: string;
};

/**
 * 시약 삭제 흐름 (d7 §24, 디자인 1.25 3-delete): reagent-more-menu ⋯ → reagent-delete "시약 삭제" → 확인 모달(ex-modal-card) →
 * archive_reagent(보관) → 토스트 "시약을 삭제했어요" → 화면 2. 교사·admin 화면에만 그린다 (R5 — 학생 · 둘러보기 0개).
 * 모바일 = 카드 오른쪽 위 · tab-bar 위 하단 시트 / 데스크톱 = 드로어 머리 × 왼쪽 · 본문 가운데 카드(딤 없음).
 */
export function ReagentDeleteFlow({ reagentId, name, listHref }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const confirm = () => {
    if (pending || done) return;
    setError(null);
    startTransition(async () => {
      const res = await archiveReagentAction({ reagentId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(true);
      setConfirming(false);
      setTimeout(() => router.push(listHref), LEAVE_MS);
    });
  };

  return (
    <>
      <ReagentMoreMenu label={`${name} 더보기`}>
        <ReagentDelete onSelect={() => setConfirming(true)} disabled={done} />
      </ReagentMoreMenu>
      {confirming ? (
        <div className={styles.deleteDialog}>
          <ReagentDeleteConfirm
            name={name}
            pending={pending}
            error={error}
            modal={false}
            onCancel={() => {
              if (pending) return;
              setConfirming(false);
              setError(null);
            }}
            onConfirm={confirm}
          />
        </div>
      ) : null}
      {done ? <Toast floating>{REAGENT_DELETE_TEXT.done}</Toast> : null}
    </>
  );
}
