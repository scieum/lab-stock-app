"use client";

import { useState } from "react";
import { ButtonPrimary } from "@/components/button-primary";
import { MixWarning } from "@/components/mix-warning";
import { ReagentRow } from "@/components/reagent-row";
import { SheetNote, SheetSection } from "@/components/sheet-panel";
import { SuggestBadge } from "@/components/suggest-badge";
import { TextInput } from "@/components/text-input";
import { PLACEMENT_NOTE_PUT, UNASSIGNED_LABEL, placementWarnings } from "@/lib/cabinet-rules";
import styles from "./styles.module.css";

export type SlotAssignCandidate = {
  id: string;
  name: string;
  /** 재고량 문구 ("1병" · "5g") */
  amount: string;
  /** 시약 보관 분류 (없으면 경고 없음) */
  storageClass?: string | null;
  /** 이 칸이 이 시약의 추천 칸 (d7 §17) — 이름 옆 suggest-badge, 목록 위로 */
  suggested?: boolean;
};

type Props = {
  /** "칸 없음" 시약 (그 학교에서 칸이 없는 시약 — d7 §9) */
  candidates: readonly SlotAssignCandidate[];
  /** 이 칸의 분류 (불일치 경고 판정) */
  slotClasses: readonly string[];
  /** 이 칸에 이미 있는 시약들의 분류 (섞으면 위험한 조합 판정) */
  slotReagentClasses?: readonly (string | null | undefined)[];
  /** 처음에 고르는 목록이 열려 있는지 (갤러리·시안 상태) */
  defaultOpen?: boolean;
  /** 처음 고른 시약 */
  defaultSelectedId?: string | null;
  /** 처음 검색어 */
  defaultQuery?: string;
  /** "시약 넣기" — 고른 시약을 이 칸에 넣는다 (place_reagent, D2) */
  onAssign?: (reagentId: string) => void;
  pending?: boolean;
  /** 넣기 실패 안내 (서버 문구) */
  error?: string | null;
};

const matches = (name: string, query: string) => name.toLocaleLowerCase("ko").includes(query.trim().toLocaleLowerCase("ko"));

/**
 * 시약 넣기 (디자인 1.15 slot-assign, 교사·admin 만 — R7: 학생 0개). 칸 시트(slot-sheet) 아래쪽에 둔다.
 * 처음에는 button-primary "시약 넣기" 만 있고, 누르면 "넣을 시약 고르기"(검색 + "칸 없음" 시약 목록)가 열린다.
 * 이 칸이 추천 칸인 시약(d7 §17)은 이름 옆 suggest-badge "추천" 과 함께 목록 맨 위에 둔다.
 * 시약을 고르면 분류 불일치 경고(mix-warning — 막지 않음)가 보이고, "시약 넣기" 가 그 시약을 이 칸에 넣는다.
 *
 * data-component="slot-assign" 은 시안대로 맨 아래 버튼 묶음에 붙는다 (고르기 목록·경고는 시트의 형제 노드).
 */
export function SlotAssign({
  candidates,
  slotClasses,
  slotReagentClasses = [],
  defaultOpen = false,
  defaultSelectedId = null,
  defaultQuery = "",
  onAssign,
  pending = false,
  error,
}: Props) {
  const [open, setOpen] = useState(defaultOpen || defaultSelectedId !== null);
  const [query, setQuery] = useState(defaultQuery);
  const [selectedId, setSelectedId] = useState<string | null>(defaultSelectedId);

  // 추천 칸인 시약을 위로 (그 안·나머지는 받은 순서 그대로)
  const ordered = [...candidates.filter((c) => c.suggested), ...candidates.filter((c) => !c.suggested)];
  const shown = query.trim() === "" ? ordered : ordered.filter((c) => matches(c.name, query));
  const selected = candidates.find((c) => c.id === selectedId) ?? null;
  const warning = selected ? placementWarnings(selected.storageClass, slotClasses, slotReagentClasses) : { kind: "none" as const };

  const press = () => {
    if (!open) {
      setOpen(true);
      return;
    }
    if (selected && !pending) onAssign?.(selected.id);
  };

  return (
    <>
      {open ? (
        <SheetSection title="넣을 시약 고르기">
          <TextInput
            icon="search"
            type="search"
            placeholder="시약명 검색"
            value={query}
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
          />
          {candidates.length === 0 ? (
            <SheetNote>&apos;{UNASSIGNED_LABEL}&apos; 시약이 없어요</SheetNote>
          ) : shown.length === 0 ? (
            <SheetNote role="status">찾는 시약이 없어요</SheetNote>
          ) : (
            <div role="group" aria-label="넣을 시약" className={styles.list}>
              {shown.map((c) => (
                <ReagentRow
                  key={c.id}
                  title={c.name}
                  body={c.amount}
                  caption={[c.storageClass, UNASSIGNED_LABEL].filter(Boolean).join(" · ")}
                  badge={c.suggested ? <SuggestBadge /> : undefined}
                  selected={c.id === selectedId}
                  onSelect={() => setSelectedId((id) => (id === c.id ? null : c.id))}
                />
              ))}
            </div>
          )}
        </SheetSection>
      ) : null}
      {warning.kind !== "none" ? (
        <MixWarning
          variant="inline"
          tone={warning.kind}
          lines={warning.lines}
          note={warning.kind === "incompatible" ? PLACEMENT_NOTE_PUT : undefined}
        />
      ) : null}
      {error ? <SheetNote role="alert" tone="strong">{error}</SheetNote> : null}
      <div data-component="slot-assign" className={styles.action}>
        <ButtonPrimary
          fullWidth
          aria-expanded={open}
          disabled={pending || (open && !selected)}
          aria-busy={pending || undefined}
          onClick={press}
        >
          시약 넣기
        </ButtonPrimary>
      </div>
    </>
  );
}
