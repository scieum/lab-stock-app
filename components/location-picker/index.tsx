"use client";

import { useState } from "react";
import { ButtonPrimary } from "@/components/button-primary";
import { CabinetNumber } from "@/components/cabinet-number";
import { CabinetLayout } from "@/components/cabinet-slot";
import { CabinetSwitcher } from "@/components/cabinet-switcher";
import { MixWarning } from "@/components/mix-warning";
import { SheetNote, SheetPanel, SheetSection, SheetTextAction } from "@/components/sheet-panel";
import { SuggestBadge } from "@/components/suggest-badge";
import {
  PLACEMENT_NOTE_SAVE,
  UNASSIGNED_LABEL,
  locationText,
  placementWarnings,
  sameSlot,
  slotId,
  slotKeys,
  type DoorType,
  type SlotClasses,
  type SlotKey,
} from "@/lib/cabinet-rules";
import styles from "./styles.module.css";

export type LocationPickerCabinet = {
  id: string;
  /** 시약장 번호 (cabinet-number) */
  number: number;
  label: string;
  doorType: DoorType;
  shelves: number;
  /** 칸별 분류 */
  slots: readonly SlotClasses[];
  /** 칸별 시약 수 (slot-count) — 키 slotId ("L1") */
  counts?: Readonly<Record<string, number>>;
  /** 칸별 이미 있는 시약들의 분류 (섞으면 위험한 조합 판정) — 키 slotId */
  reagentClasses?: Readonly<Record<string, readonly string[]>>;
};

/** 고른 위치 — null = "칸 없음" */
export type LocationChoice = ({ cabinetId: string } & SlotKey) | null;

type Props = {
  /** 옮길 시약 이름 · 분류 — 제목 아래 caption "과산화수소 · 산화제" */
  reagentName: string;
  reagentClass?: string | null;
  /** 그 학교 시약장 (번호 순) */
  cabinets: readonly LocationPickerCabinet[];
  /** 지금 위치 (없으면 "칸 없음") — 처음 보여 줄 시약장 */
  current?: LocationChoice;
  /**
   * 추천 칸 (d7 §17, lib/location-suggest suggestLocation) — 그 칸에 suggest-badge, 위에 "추천" 줄.
   * 지금 위치와 다르면 처음 선택으로 두고 그 시약장으로 연다. 지금 위치와 같으면 처음 선택 없이 지금 시약장으로 연다.
   */
  suggestion?: ({ cabinetId: string } & SlotKey) | null;
  /** 처음 보여 줄 시약장 · 처음 고른 칸 (갤러리·시안 상태 — suggestion 보다 앞선다) */
  defaultCabinetId?: string;
  defaultSlot?: SlotKey | null;
  /** "저장" (고른 칸) · "칸 없음으로" (null) — place_reagent (D2) */
  onSave?: (choice: LocationChoice) => void;
  /** × · Esc */
  onClose?: () => void;
  pending?: boolean;
  /** 저장 실패 안내 (서버 문구) */
  error?: string | null;
  /** true(기본) = 하단 시트(모바일) · 가운데 카드(데스크톱). false = 제자리(갤러리) */
  sheet?: boolean;
};

/**
 * 보관 위치 바꾸기 (디자인 1.15 location-picker, d7 §14 — 교사·admin, 화면 3 의 location-edit 로 연다).
 * 디자인 1.17(d7 §17): 추천 칸이 있으면 "추천" 소제목 + 추천 줄(번호 원 + "2번 시약장 · 우 2단" + suggest-badge, 누르면 그 칸 선택)
 * → "전체" 소제목, 배치도의 추천 칸에도 suggest-badge.
 * 제목 "보관 위치 바꾸기" + × → caption "시약명 · 분류" → cabinet-switcher(번호 + 이름, cabinet-add 없음)
 * → 고른 시약장 배치도(cabinet-slot + slot-count, 눌러서 칸 고르기) → 조용한 텍스트 동작 "칸 없음으로"
 * → 분류 불일치·섞으면 위험한 조합이면 mix-warning(막지 않음) → button-primary "저장"(칸을 고르기 전에는 비활성).
 */
export function LocationPicker({
  reagentName,
  reagentClass,
  cabinets,
  current = null,
  suggestion = null,
  defaultCabinetId,
  defaultSlot = null,
  onSave,
  onClose,
  pending = false,
  error,
  sheet = true,
}: Props) {
  const suggestCabinet = suggestion ? (cabinets.find((c) => c.id === suggestion.cabinetId) ?? null) : null;
  const suggestKey: SlotKey | null =
    suggestion && suggestCabinet && slotKeys(suggestCabinet.doorType, suggestCabinet.shelves).some((k) => sameSlot(k, suggestion))
      ? { side: suggestion.side, shelf: suggestion.shelf }
      : null;
  const suggestIsCurrent = Boolean(suggestKey && current && suggestCabinet && current.cabinetId === suggestCabinet.id && sameSlot(current, suggestKey));
  // 처음 선택: 갤러리 기본값 → 추천 칸(지금 위치가 아닐 때) → 없음
  const startSuggest = !defaultCabinetId && suggestCabinet && suggestKey && !suggestIsCurrent;
  const startId =
    (defaultCabinetId && cabinets.some((c) => c.id === defaultCabinetId) ? defaultCabinetId : undefined) ??
    (startSuggest ? suggestCabinet.id : undefined) ??
    (current && cabinets.some((c) => c.id === current.cabinetId) ? current.cabinetId : undefined) ??
    cabinets[0]?.id;
  const [cabinetId, setCabinetId] = useState<string | undefined>(startId);
  const [picked, setPicked] = useState<SlotKey | null>(defaultSlot ?? (startSuggest ? suggestKey : null));

  const cabinet = cabinets.find((c) => c.id === cabinetId) ?? null;
  const pickedKey = cabinet && picked && slotKeys(cabinet.doorType, cabinet.shelves).some((k) => sameSlot(k, picked)) ? picked : null;
  const isCurrent = Boolean(cabinet && pickedKey && current && current.cabinetId === cabinet.id && sameSlot(current, pickedKey));

  const pickedClasses = cabinet && pickedKey ? (cabinet.slots.find((s) => sameSlot(s, pickedKey))?.classes ?? []) : [];
  const others = cabinet && pickedKey ? (cabinet.reagentClasses?.[slotId(pickedKey)] ?? []) : [];
  const warning = pickedKey && !isCurrent ? placementWarnings(reagentClass, pickedClasses, others) : { kind: "none" as const };

  const caption = [reagentName, reagentClass].filter(Boolean).join(" · ");
  const canSave = Boolean(cabinet && pickedKey && !isCurrent && !pending);

  return (
    <SheetPanel
      data-component="location-picker"
      title="보관 위치 바꾸기"
      caption={caption}
      onClose={onClose}
      sheet={sheet}
      footer={
        <ButtonPrimary
          fullWidth
          disabled={!canSave}
          aria-busy={pending || undefined}
          onClick={() => {
            if (canSave && cabinet && pickedKey) onSave?.({ cabinetId: cabinet.id, side: pickedKey.side, shelf: pickedKey.shelf });
          }}
        >
          저장
        </ButtonPrimary>
      }
    >
      {cabinets.length === 0 || !cabinet ? (
        <SheetNote>아직 시약장이 없어요</SheetNote>
      ) : (
        <>
          {suggestCabinet && suggestKey ? (
            <>
              <SheetSection title="추천">
                <button
                  type="button"
                  className={styles.suggestRow}
                  data-testid="location-picker-suggest"
                  aria-label={`추천 위치 ${suggestCabinet.number}번 ${locationText(suggestCabinet, suggestKey)}${suggestIsCurrent ? " (지금 위치)" : ""}`}
                  disabled={pending}
                  onClick={() => {
                    setCabinetId(suggestCabinet.id);
                    setPicked(suggestKey);
                  }}
                >
                  <span className={styles.suggestLoc}>
                    <CabinetNumber number={suggestCabinet.number} />
                    <span className={styles.suggestText}>{locationText(suggestCabinet, suggestKey)}</span>
                  </span>
                  <SuggestBadge />
                </button>
              </SheetSection>
              <h3 className={styles.sectionTitle}>전체</h3>
            </>
          ) : null}
          <CabinetSwitcher
            label="시약장 고르기"
            items={cabinets.map((c) => ({ id: c.id, label: c.label, number: c.number }))}
            activeId={cabinet.id}
            onSelect={(id) => {
              if (id === cabinetId) return;
              setCabinetId(id);
              setPicked(null);
            }}
          />
          <CabinetLayout
            label={`${cabinet.label} 배치도 — 칸을 고르세요`}
            doorType={cabinet.doorType}
            shelves={cabinet.shelves}
            slots={cabinet.slots}
            counts={cabinet.counts}
            selected={pickedKey}
            suggested={suggestCabinet && suggestKey && suggestCabinet.id === cabinet.id ? suggestKey : null}
            onSelect={setPicked}
            disabled={pending}
          />
        </>
      )}
      {current ? (
        <SheetTextAction
          className={styles.unassign}
          disabled={pending}
          onClick={() => onSave?.(null)}
        >
          {UNASSIGNED_LABEL}으로
        </SheetTextAction>
      ) : null}
      {warning.kind !== "none" ? (
        <MixWarning
          variant="inline"
          tone={warning.kind}
          lines={warning.lines}
          note={warning.kind === "incompatible" ? PLACEMENT_NOTE_SAVE : undefined}
        />
      ) : null}
      {error ? (
        <SheetNote role="alert" tone="strong">
          {error}
        </SheetNote>
      ) : null}
    </SheetPanel>
  );
}
