"use client";

import { useState } from "react";
import { ButtonPrimary } from "@/components/button-primary";
import { CabinetAdd } from "@/components/cabinet-add";
import { CabinetDoorSelect } from "@/components/cabinet-door-select";
import { CabinetDeleteConfirm, CabinetEdit, CabinetRenameSheet, CabinetSaveBar, CabinetSelects } from "@/components/cabinet-edit";
import { CabinetShelfSelect } from "@/components/cabinet-shelf-select";
import { CabinetLayout, CabinetLegend } from "@/components/cabinet-slot";
import { CabinetSwitcher } from "@/components/cabinet-switcher";
import { EmptyStateCard } from "@/components/ex-empty-state-card";
import { Toast } from "@/components/ex-toast";
import { MixWarning } from "@/components/mix-warning";
import { NavPill } from "@/components/nav-pill";
import { ReagentRow } from "@/components/reagent-row";
import { StorageClassPicker } from "@/components/storage-class-chip";
import {
  DEFAULT_DOOR_TYPE,
  DEFAULT_SHELVES,
  UNASSIGNED_LABEL,
  cabinetMeta,
  defaultCabinetName,
  mixWarnings,
  removedSlots,
  sameSlot,
  slotKeys,
  slotName,
  toggleClass,
  withJosa,
  type SlotKey,
} from "@/lib/cabinet-rules";
import type { SampleCabinet, SampleReagent } from "./sample";
import styles from "./cabinets.module.css";

type Props = {
  /** teacher = 편집(교사·admin), student = 보기 전용 */
  role: "teacher" | "student";
  cabinets: SampleCabinet[];
  unassigned?: SampleReagent[];
  /** 처음 활성 시약장 (없으면 첫 시약장) */
  activeId?: string;
  /** 처음 열려 있는 시트 */
  open?: "rename" | "delete";
};

/** 화면 11 예시 — 실제 화면(/cabinets, D3)과 같은 컴포넌트를 갤러리 안 상태로만 움직인다 (저장·DB 없음) */
export function CabinetsDemo({ role, cabinets: initial, unassigned = [], activeId: initialActive, open: initialOpen }: Props) {
  const staff = role === "teacher";
  const [cabinets, setCabinets] = useState(initial);
  const [activeId, setActiveId] = useState(initialActive ?? initial[0]?.id);
  const [selected, setSelected] = useState<SlotKey | null>(staff ? { side: "L", shelf: 1 } : null);
  const [open, setOpen] = useState<"rename" | "delete" | null>(initialOpen ?? null);
  const [toast, setToast] = useState<string | null>(null);
  const [nextNumber, setNextNumber] = useState(initial.length + 1);

  const active = cabinets.find((c) => c.id === activeId) ?? cabinets[0];
  const original = initial.find((c) => c.id === active?.id);

  const update = (patch: Partial<SampleCabinet>) => {
    if (!active) return;
    setCabinets((list) => list.map((c) => (c.id === active.id ? { ...c, ...patch } : c)));
  };

  const add = () => {
    const label = defaultCabinetName(nextNumber);
    const id = `c-new-${nextNumber}`;
    setCabinets((list) => [...list, { id, label, doorType: DEFAULT_DOOR_TYPE, shelves: DEFAULT_SHELVES, slots: [], reagentCount: 0 }]);
    setNextNumber((n) => n + 1);
    setActiveId(id);
    setSelected({ side: "L", shelf: 1 });
    setToast(`${withJosa(label, "을", "를")} 추가했어요`);
  };

  if (!active) {
    return (
      <div className={styles.screen}>
        <h3 className={styles.pageTitle}>시약장 0개</h3>
        <EmptyStateCard
          variant="outlined"
          icon="cabinet"
          title="아직 시약장이 없어요"
          description={staff ? "'+ 시약장 추가'를 눌러 첫 시약장을 만들어 주세요" : "교사가 시약장을 추가하면 여기에 보여요"}
        >
          {staff ? <CabinetAdd onClick={add} /> : null}
        </EmptyStateCard>
      </div>
    );
  }

  const keys = slotKeys(active.doorType, active.shelves);
  const selectedKey = selected && keys.some((k) => sameSlot(k, selected)) ? selected : null;
  const selectedClasses = active.slots.find((s) => sameSlot(s, selectedKey))?.classes ?? [];
  const warnings = mixWarnings(active.slots, active.doorType, active.shelves).map((w) => w.text);
  const removed = original ? removedSlots(original, active).length : 0;

  const toggle = (cls: string) => {
    if (!selectedKey) return;
    const classes = toggleClass(selectedClasses, cls);
    const rest = active.slots.filter((s) => !sameSlot(s, selectedKey));
    update({ slots: [...rest, { ...selectedKey, classes }] });
  };

  const layout = (
    <>
      <CabinetLayout
        doorType={active.doorType}
        shelves={active.shelves}
        slots={active.slots}
        selected={selectedKey}
        onSelect={staff ? setSelected : undefined}
        readOnly={!staff}
      />
      <CabinetLegend showSelected={staff} />
    </>
  );

  return (
    <div className={styles.screen}>
      <CabinetSwitcher
        items={cabinets.map((c) => ({ id: c.id, label: c.label }))}
        activeId={active.id}
        onSelect={(id) => {
          setActiveId(id);
          setOpen(null);
        }}
      >
        {staff ? <CabinetAdd onClick={add} /> : null}
      </CabinetSwitcher>

      <div className={styles.header}>
        <h3 className={styles.cabinetTitle}>{active.label}</h3>
        <span className={styles.cabinetMeta}>{cabinetMeta(active.doorType, active.shelves)}</span>
      </div>

      {staff ? (
        <CabinetEdit busy={open !== null} onRename={() => setOpen("rename")} onDelete={() => setOpen("delete")}>
          <CabinetSelects>
            <CabinetDoorSelect value={active.doorType} onChange={(doorType) => update({ doorType })} />
            <CabinetShelfSelect value={active.shelves} onChange={(shelves) => update({ shelves })} />
          </CabinetSelects>
          {layout}
          {selectedKey ? (
            <StorageClassPicker slotName={slotName(selectedKey, active.doorType)} selected={selectedClasses} onToggle={toggle} />
          ) : null}
          <MixWarning lines={warnings} />
          <CabinetSaveBar
            sticky={false}
            notice={removed > 0 ? `이 변경으로 사라지는 칸 ${removed}개의 시약은 '${UNASSIGNED_LABEL}'이 돼요` : undefined}
          >
            <ButtonPrimary fullWidth onClick={() => setToast("시약장 설정을 저장했어요")}>
              저장
            </ButtonPrimary>
          </CabinetSaveBar>
        </CabinetEdit>
      ) : (
        <>
          {layout}
          <MixWarning lines={warnings} />
        </>
      )}

      {open === "rename" ? (
        <CabinetRenameSheet
          key={active.id}
          sheet={false}
          defaultName={active.label}
          onCancel={() => setOpen(null)}
          onSave={(label) => {
            update({ label });
            setOpen(null);
            setToast("이름을 바꿨어요");
          }}
        />
      ) : null}
      {open === "delete" ? (
        <CabinetDeleteConfirm
          sheet={false}
          reagentCount={active.reagentCount}
          onCancel={() => setOpen(null)}
          onConfirm={() => {
            const rest = cabinets.filter((c) => c.id !== active.id);
            setCabinets(rest);
            setActiveId(rest[0]?.id);
            setOpen(null);
            setToast(`${withJosa(active.label, "을", "를")} 삭제했어요`);
          }}
        />
      ) : null}

      {unassigned.length > 0 ? (
        <div className={styles.unassigned}>
          <h3 className={styles.sectionTitle}>
            {UNASSIGNED_LABEL} 시약 ({unassigned.length})
          </h3>
          {unassigned.map((r) => (
            <ReagentRow key={r.id} title={r.name} body={r.stock} trailingCaption={UNASSIGNED_LABEL} href={`/reagents/${r.id}`} />
          ))}
        </div>
      ) : null}

      {toast ? <Toast>{toast}</Toast> : null}
    </div>
  );
}

/** nav-pill 학교명 메뉴 예시 (d7 §10) — 갤러리에서는 실제로 로그아웃하지 않고 눌렀다는 것만 보여 준다 */
export function NavLogoutDemo({ schoolName }: { schoolName: string }) {
  const [count, setCount] = useState(0);
  return (
    <>
      <NavPill schoolName={schoolName} sectionTitle="시약장 설정" onLogout={() => setCount((n) => n + 1)} />
      <p className={styles.note} role="status">
        {count > 0 ? `로그아웃을 ${count}번 눌렀어요 (갤러리에서는 실제로 로그아웃하지 않아요)` : "학교명을 누르면 메뉴가 열려요"}
      </p>
    </>
  );
}
