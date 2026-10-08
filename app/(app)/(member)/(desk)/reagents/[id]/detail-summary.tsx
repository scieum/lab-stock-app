"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { DrawerRow, DrawerRows } from "@/components/detail-drawer";
import { Toast } from "@/components/ex-toast";
import { LocationPicker, type LocationChoice } from "@/components/location-picker";
import { ReagentDetailCard } from "@/components/reagent-detail-card";
import { ReagentLocation } from "@/components/reagent-location";
import { ReorderThreshold } from "@/components/reorder-threshold";
import { UNASSIGNED_LABEL } from "@/lib/cabinet-rules";
import { thresholdText } from "@/lib/reorder-rules";
import type { PickerCabinet, PickerSuggestion, ReagentPlacement, ReagentThreshold } from "@/lib/supabase/reagent-detail";
import type { StorageClass } from "@/lib/cabinet-rules";
import { placeReagentAtAction, resetReorderThresholdAction, setReorderThresholdAction } from "./actions";

/** 저장 후 토스트를 보여 주는 시간 */
const TOAST_MS = 4000;

type Props = {
  reagent: {
    id: string;
    name: string;
    /** 재고 숫자 (서버가 만든 글자) */
    stock: string;
    unit: string;
    lowStock: boolean;
    intakeDate: string;
    storageClass: StorageClass | null;
  };
  placement: ReagentPlacement | null;
  threshold: ReagentThreshold;
  /**
   * 위치 피커 데이터 — 교사·admin 일 때만 서버가 내려 준다(학생은 null).
   * 있으면 location-edit "위치 바꾸기" · threshold-edit 연필을 그린다 (R5·R7: 학생 0개)
   */
  picker: PickerCabinet[] | null;
  /** 위치 추천 칸 (d7 §17) — 피커가 그 칸에 suggest-badge 를 달고 처음 선택으로 둔다 */
  suggestion?: PickerSuggestion | null;
  /** true = 피커를 연 채로 시작 (화면 7 [다른 칸]) */
  initialPicking?: boolean;
  /**
   * card = reagent-detail-card(모바일, 기본) · drawer = 데스크톱 detail-drawer 의 정보 줄들 (시안 3-desktop info-rows:
   * 현재 재고 → 입고일 → reagent-location → reorder-threshold → extraRows). 위치 피커는 드로어 왼쪽 팝오버로 뜬다.
   */
  layout?: "card" | "drawer";
  /** drawer 배치에서 마지막에 덧붙이는 줄 (CAS 번호 · 분류 등) */
  extraRows?: { label: string; value: string }[];
};

/**
 * 화면 3 요약 카드 (디자인 1.15): reagent-detail-card 안 입고일 → reagent-location(번호 + "1번 시약장 · 우 1단" / "칸 없음")
 * → reorder-threshold("3병" / "아직 없어요").
 * 교사·admin: 위치 바꾸기 → location-picker(모바일 tab-bar 위 하단 시트 · 데스크톱 가운데) → 저장/칸 없음으로 → place_reagent,
 * 연필 → 숫자 입력(0 = 알림 없음) → set_reorder_threshold, 출처가 자동이 아니면 입력 상태의 "자동으로 돌리기" → reset_reorder_threshold. 저장하면 토스트 + 서버가 화면을 다시 내려 준다(revalidatePath).
 */
export function DetailSummary({
  reagent,
  placement,
  threshold,
  picker,
  suggestion = null,
  initialPicking = false,
  layout = "card",
  extraRows = [],
}: Props) {
  const canEdit = picker !== null;
  const [picking, setPicking] = useState(canEdit && initialPicking);
  const [editing, setEditing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [thresholdError, setThresholdError] = useState<string | null>(null);
  const [op, setOp] = useState<"place" | "threshold" | null>(null);
  const [toast, setToast] = useState<{ key: number; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const run = (kind: "place" | "threshold", work: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setOp(kind);
    startTransition(async () => {
      try {
        await work();
      } finally {
        inFlight.current = false;
      }
    });
  };

  const current: LocationChoice = placement
    ? { cabinetId: placement.cabinet.id, side: placement.slot.side, shelf: placement.slot.shelf }
    : null;

  const savePlace = (choice: LocationChoice) => {
    if (!canEdit) return;
    setPlaceError(null);
    run("place", async () => {
      const res = await placeReagentAtAction({ reagentId: reagent.id, location: choice }).catch(() => null);
      if (!res) {
        setPlaceError("저장하지 못했어요. 잠시 후 다시 시도해 주세요");
        return;
      }
      if (!res.ok) {
        setPlaceError(res.error);
        return;
      }
      setPicking(false);
      setToast({ key: Date.now(), text: choice ? "보관 위치를 바꿨어요" : `보관 위치를 '${UNASSIGNED_LABEL}'으로 바꿨어요` });
    });
  };

  const saveThreshold = (value: number) => {
    if (!canEdit) return;
    setThresholdError(null);
    run("threshold", async () => {
      const res = await setReorderThresholdAction({ reagentId: reagent.id, minStock: value }).catch(() => null);
      if (!res) {
        setThresholdError("저장하지 못했어요. 잠시 후 다시 시도해 주세요");
        return;
      }
      if (!res.ok) {
        setThresholdError(res.error);
        return;
      }
      setEditing(false);
      setToast({
        key: Date.now(),
        text:
          res.minStock > 0
            ? `재주문 기준을 ${thresholdText(res.minStock, threshold.unit)}으로 바꿨어요`
            : "재주문 기준을 0으로 바꿨어요 — 재주문 알림을 보내지 않아요",
      });
    });
  };

  // "자동으로 돌리기" (d7 §11-1): 출처 'auto' + 자동 값으로 다시 계산 → 토스트, 서버가 값·표시를 다시 내려 준다
  const resetThreshold = () => {
    if (!canEdit) return;
    setThresholdError(null);
    run("threshold", async () => {
      const res = await resetReorderThresholdAction({ reagentId: reagent.id }).catch(() => null);
      if (!res) {
        setThresholdError("저장하지 못했어요. 잠시 후 다시 시도해 주세요");
        return;
      }
      if (!res.ok) {
        setThresholdError(res.error);
        return;
      }
      setEditing(false);
      setToast({
        key: Date.now(),
        text:
          res.minStock > 0
            ? `재주문 기준을 자동(${thresholdText(res.minStock, threshold.unit)})으로 돌렸어요`
            : "재주문 기준을 자동으로 돌렸어요 — 아직 계산할 기록이 없어요",
      });
    });
  };

  const rowLayout = layout === "drawer" ? "row" : "card";
  const lines = (
    <>
      <ReagentLocation
        layout={rowLayout}
        cabinet={placement?.cabinet ?? null}
        slot={placement?.slot ?? null}
        canEdit={canEdit}
        editing={picking}
        editDisabled={pending}
        onEdit={() => {
          setPlaceError(null);
          setPicking(true);
        }}
      />
      <ReorderThreshold
        minStock={threshold.minStock}
        unit={threshold.unit}
        perGroup={threshold.perGroup}
        groups={threshold.groups}
        source={threshold.source}
        autoBasis={threshold.autoBasis}
        onResetAuto={resetThreshold}
        canEdit={canEdit}
        editing={editing}
        onEditingChange={(next) => {
          setThresholdError(null);
          setEditing(next);
        }}
        pending={pending && op === "threshold"}
        error={thresholdError}
        onSave={saveThreshold}
        layout={rowLayout}
      />
    </>
  );

  return (
    <>
      {layout === "drawer" ? (
        <DrawerRows label="시약 정보">
          <DrawerRow label="현재 재고" display unit={reagent.unit}>
            {reagent.stock}
          </DrawerRow>
          <DrawerRow label="입고일">{reagent.intakeDate || "-"}</DrawerRow>
          {lines}
          {extraRows.map((r) => (
            <DrawerRow key={r.label} label={r.label}>
              {r.value}
            </DrawerRow>
          ))}
        </DrawerRows>
      ) : (
        <ReagentDetailCard
          name={reagent.name}
          stock={reagent.stock}
          unit={reagent.unit}
          lowStock={reagent.lowStock}
          intakeDate={reagent.intakeDate}
          meta={lines}
        />
      )}
      {canEdit && picking && picker ? (
        <LocationPicker
          reagentName={reagent.name}
          reagentClass={reagent.storageClass}
          cabinets={picker}
          current={current}
          suggestion={suggestion}
          pending={pending && op === "place"}
          error={placeError}
          onSave={savePlace}
          onClose={() => {
            if (pending) return;
            setPicking(false);
            setPlaceError(null);
          }}
        />
      ) : null}
      {toast ? (
        <Toast key={toast.key} floating>
          {toast.text}
        </Toast>
      ) : null}
    </>
  );
}
