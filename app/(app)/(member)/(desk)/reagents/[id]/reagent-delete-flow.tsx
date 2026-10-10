"use client";

import { useState, useTransition } from "react";
import { REAGENT_DELETE_TEXT, ReagentDelete, ReagentDeleteConfirm } from "@/components/reagent-delete";
import { ReagentMoreMenu } from "@/components/reagent-more-menu";
import { clearFlashToast, setFlashToast } from "@/lib/flash-toast";
import { archiveReagentAction } from "./actions";
import styles from "./detail.module.css";

type Props = {
  reagentId: string;
  name: string;
  /** 삭제 뒤 갈 곳 = 화면 2 (데스크톱은 지금 목록 쿼리 그대로) */
  listHref: string;
};

/**
 * 시약 삭제 흐름 (d7 §24, 디자인 1.25 3-delete): reagent-more-menu ⋯ → reagent-delete "시약 삭제" → 확인 모달(ex-modal-card) →
 * archive_reagent(보관) → 화면 2 (서버 액션이 redirect) → 토스트 "시약을 삭제했어요"(셸의 FlashToast — 이동 뒤에도 남는다).
 * 교사·admin 화면에만 그린다 (R5 — 학생 · 둘러보기 0개).
 * 모바일 = 카드 오른쪽 위 · tab-bar 위 하단 시트 / 데스크톱 = 드로어 머리 × 왼쪽 · 본문 가운데 카드(딤 없음).
 */
export function ReagentDeleteFlow({ reagentId, name, listHref }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const confirm = () => {
    if (pending || done) return;
    setError(null);
    // 성공하면 서버 액션이 화면 2 로 보낸다 — 토스트는 이동한 화면에서 셸이 띄운다
    setFlashToast(REAGENT_DELETE_TEXT.done);
    startTransition(async () => {
      const res = await archiveReagentAction({ reagentId, listHref });
      if (res && !res.ok) {
        clearFlashToast();
        setError(res.error);
        return;
      }
      setDone(true);
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
    </>
  );
}
