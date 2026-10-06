"use client";

import { ReagentRow } from "@/components/reagent-row";
import { SheetNote, SheetPanel, SheetSection, SheetTextAction } from "@/components/sheet-panel";
import { StorageClassChip } from "@/components/storage-class-chip";
import { SLOT_UNSET_LABEL, sortClasses } from "@/lib/cabinet-rules";
import styles from "./styles.module.css";

export type SlotSheetReagent = {
  id: string;
  name: string;
  /** 재고량 문구 ("200mL") */
  amount: string;
  /** 시약 보관 분류 ("유기") */
  storageClass?: string | null;
};

type Props = {
  /** 칸 제목 "좌 2단" (lib/cabinet-rules slotTitle) */
  title: string;
  /** 이 칸의 분류 — 제목 옆 보기 전용 storage-class-chip (없으면 "미지정") */
  classes: readonly string[];
  /** 이 칸에 배치된 시약 */
  reagents: readonly SlotSheetReagent[];
  /** true = 교사·admin: 행마다 "빼기" + children(slot-assign) 자리. false = 학생: 목록만 */
  canEdit?: boolean;
  /** 있으면 시약 행(이름 부분)이 그 시약 상세로 가는 링크 (화면 11 → 화면 3) */
  hrefOf?: (reagentId: string) => string;
  /** "빼기" — 그 시약을 "칸 없음"으로 (place_reagent null, D2) */
  onRemove?: (reagentId: string) => void;
  /** 빼는 중인 시약 (그 행의 "빼기" 비활성) */
  pendingId?: string | null;
  /** × · Esc */
  onClose?: () => void;
  /** true(기본) = 하단 시트(모바일) · 가운데 카드(데스크톱). false = 제자리(갤러리) */
  sheet?: boolean;
  /** 목록 아래 — 교사·admin 의 slot-assign (학생에게는 넘기지 않는다) */
  children?: React.ReactNode;
};

/**
 * 칸 시트 (디자인 1.15 slot-sheet, d7 §14): 화면 11 에서 칸(cabinet-slot)을 누르면 열린다 — 모든 역할.
 * 제목 "좌 2단" + 그 칸의 분류 칩(보기 전용) → "이 칸의 시약 (N)" + reagent-row(시약명 · 재고량 · 분류),
 * 교사·admin 은 행마다 조용한 텍스트 동작 "빼기" 와 아래 slot-assign. 학생은 목록만.
 */
export function SlotSheet({
  title,
  classes,
  reagents,
  canEdit = false,
  hrefOf,
  onRemove,
  pendingId = null,
  onClose,
  sheet = true,
  children,
}: Props) {
  const sorted = sortClasses(classes);
  return (
    <SheetPanel
      data-component="slot-sheet"
      title={title}
      titleAddon={
        <span className={styles.chips}>
          {sorted.length > 0
            ? sorted.map((c) => <StorageClassChip key={c} label={c} readOnly />)
            : <StorageClassChip label={SLOT_UNSET_LABEL} readOnly />}
        </span>
      }
      onClose={onClose}
      sheet={sheet}
    >
      <SheetSection title={`이 칸의 시약 (${reagents.length})`}>
        {reagents.length === 0 ? (
          <SheetNote>이 칸에 둔 시약이 없어요</SheetNote>
        ) : (
          <div className={styles.list}>
            {reagents.map((r) => (
              <ReagentRow
                key={r.id}
                title={r.name}
                body={r.amount}
                caption={r.storageClass ?? undefined}
                href={hrefOf ? hrefOf(r.id) : undefined}
                action={
                  canEdit ? (
                    <SheetTextAction
                      aria-label={`${r.name} 빼기`}
                      disabled={pendingId === r.id}
                      aria-busy={pendingId === r.id || undefined}
                      onClick={onRemove ? () => onRemove(r.id) : undefined}
                    >
                      빼기
                    </SheetTextAction>
                  ) : undefined
                }
              />
            ))}
          </div>
        )}
      </SheetSection>
      {canEdit ? children : null}
    </SheetPanel>
  );
}
