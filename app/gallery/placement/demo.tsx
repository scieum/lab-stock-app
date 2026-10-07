"use client";

import { useState } from "react";
import { Toast } from "@/components/ex-toast";
import { LocationPicker, type LocationChoice } from "@/components/location-picker";
import { ReagentDetailCard } from "@/components/reagent-detail-card";
import { ReagentLocation } from "@/components/reagent-location";
import { ReorderThreshold } from "@/components/reorder-threshold";
import { formatAmount } from "@/lib/format";
import { sampleCabinets, samplePickerCabinets, sampleSuggestion } from "../cabinets/sample";

/**
 * 화면 3 칸 배치·재주문 기준 동작 예시 (교사) — 실제 화면(/reagents/[id], D3)과 같은 컴포넌트를 갤러리 안 상태로만 움직인다.
 * 저장·DB 없음. 피커는 제자리(sheet=false)로 카드 아래에 연다.
 */
export function PlacementDemo() {
  const [location, setLocation] = useState<LocationChoice>({ cabinetId: "c-1", side: "R", shelf: 1 });
  const [picking, setPicking] = useState(false);
  const [minStock, setMinStock] = useState<number | null>(3);
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const cabinet = location ? (sampleCabinets.find((c) => c.id === location.cabinetId) ?? null) : null;

  return (
    <>
      <ReagentDetailCard
        name="과산화수소"
        stock={2}
        unit="병"
        lowStock={minStock !== null && 2 < minStock}
        intakeDate="2026-09-14"
        meta={
          <>
            <ReagentLocation cabinet={cabinet} slot={location} canEdit editing={picking} onEdit={() => setPicking(true)} />
            <ReorderThreshold
              minStock={minStock}
              unit="병"
              canEdit
              editing={editing}
              onEditingChange={setEditing}
              onSave={(value) => {
                setMinStock(value);
                setEditing(false);
                setToast(`재주문 기준을 ${formatAmount(value, "병")}으로 바꿨어요`);
              }}
            />
          </>
        }
      />
      {picking ? (
        <LocationPicker
          sheet={false}
          reagentName="과산화수소"
          reagentClass="산화제"
          cabinets={samplePickerCabinets}
          current={location}
          suggestion={sampleSuggestion({ id: "p-6", storageClass: "산화제" })}
          onClose={() => setPicking(false)}
          onSave={(choice) => {
            setLocation(choice);
            setPicking(false);
            setToast("보관 위치를 바꿨어요");
          }}
        />
      ) : null}
      {toast ? <Toast>{toast}</Toast> : null}
    </>
  );
}
