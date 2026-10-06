"use client";

import { useState } from "react";
import { ButtonPrimary } from "@/components/button-primary";
import { CabinetAdd } from "@/components/cabinet-add";
import { CabinetDoorSelect } from "@/components/cabinet-door-select";
import {
  CabinetDeleteConfirm,
  CabinetEdit,
  CabinetRenameSheet,
  CabinetSaveBar,
  CabinetScreen,
  CabinetSelects,
  CabinetTitle,
  CabinetUnsavedConfirm,
} from "@/components/cabinet-edit";
import { CabinetShelfSelect } from "@/components/cabinet-shelf-select";
import { CabinetLayout, CabinetLegend } from "@/components/cabinet-slot";
import { CabinetSwitcher } from "@/components/cabinet-switcher";
import { EmptyStateCard } from "@/components/ex-empty-state-card";
import { Toast } from "@/components/ex-toast";
import { MixWarning } from "@/components/mix-warning";
import { NavPill } from "@/components/nav-pill";
import { QrPrint } from "@/components/qr-print";
import { QrPrintSheet } from "@/components/qr-print-sheet";
import { ReagentRow } from "@/components/reagent-row";
import { SlotAssign } from "@/components/slot-assign";
import { SlotSheet } from "@/components/slot-sheet";
import { StorageClassPicker } from "@/components/storage-class-chip";
import {
  DEFAULT_DOOR_TYPE,
  DEFAULT_SHELVES,
  UNASSIGNED_LABEL,
  defaultCabinetName,
  mixWarnings,
  removedSlots,
  sameSlot,
  slotId,
  slotKeys,
  slotName,
  slotTitle,
  toggleClass,
  withJosa,
  type SlotKey,
} from "@/lib/cabinet-rules";
import { SAMPLE_ORIGIN, samplePlaced, type SampleCabinet, type SamplePlacedReagent, type SampleReagent } from "./sample";
import styles from "./cabinets.module.css";

type Open = "rename" | "delete" | "print" | "slot" | "unsaved";

type Props = {
  /** teacher = 편집(교사·admin), student = 보기 전용 */
  role: "teacher" | "student";
  cabinets: SampleCabinet[];
  /** 칸 없음 시약 (목록 · 시약 넣기 후보) */
  unassigned?: SampleReagent[];
  /** 처음 활성 시약장 (없으면 첫 시약장) */
  activeId?: string;
  /** 처음 열려 있는 시트 */
  open?: Open;
  /** 처음 고른 칸 (open="slot" 이면 그 칸 시트) */
  slot?: SlotKey;
  /** 처음 편집 중인 상태 (open="unsaved" 예시 — 좌1단 분류를 바꾼 채) */
  dirty?: boolean;
  /** 학교명 (QR 라벨) */
  schoolName?: string;
};

const sameLayout = (a: SampleCabinet | undefined, b: SampleCabinet | undefined) =>
  Boolean(a && b) &&
  a!.doorType === b!.doorType &&
  a!.shelves === b!.shelves &&
  slotKeys(a!.doorType, a!.shelves).every((k) => {
    const x = a!.slots.find((s) => sameSlot(s, k))?.classes ?? [];
    const y = b!.slots.find((s) => sameSlot(s, k))?.classes ?? [];
    return x.length === y.length && x.every((c) => y.includes(c));
  });

/**
 * 화면 11 예시 — 실제 화면(/cabinets, D3)과 같은 컴포넌트를 갤러리 안 상태로만 움직인다 (저장·DB 없음).
 * 디자인 1.15: 번호 pill · 칸 안 시약 수 · 칸 누르기 = 칸 시트(교사·admin 은 그 칸이 분류 편집 대상도 된다) ·
 * QR 인쇄 · 저장 안 한 편집 확인 · 데스크톱 2단(CabinetScreen).
 */
export function CabinetsDemo({
  role,
  cabinets: initial,
  unassigned: initialUnassigned = [],
  activeId: initialActive,
  open: initialOpen,
  slot: initialSlot,
  dirty: initialDirty = false,
  schoolName = "샘플고등학교",
}: Props) {
  const staff = role === "teacher";
  const [saved, setSaved] = useState(initial);
  const [cabinets, setCabinets] = useState(() =>
    initialDirty && initial[0]
      ? initial.map((c, i) =>
          i === 0 ? { ...c, slots: c.slots.map((s) => (s.side === "L" && s.shelf === 1 ? { ...s, classes: toggleClass(s.classes, "산") } : s)) } : c,
        )
      : initial,
  );
  const [activeId, setActiveId] = useState(initialActive ?? initial[0]?.id);
  const [selected, setSelected] = useState<SlotKey | null>(initialSlot ?? (staff ? { side: "L", shelf: 1 } : null));
  const [open, setOpen] = useState<Open | null>(initialOpen ?? null);
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(initialOpen === "unsaved" ? (initial[1]?.id ?? null) : null);
  const [toast, setToast] = useState<string | null>(null);
  const [lastNumber, setLastNumber] = useState(Math.max(0, ...initial.map((c) => c.number)));
  const [placed, setPlaced] = useState<SamplePlacedReagent[]>(samplePlaced);
  const [unassigned, setUnassigned] = useState<SampleReagent[]>(initialUnassigned);

  const active = cabinets.find((c) => c.id === activeId) ?? cabinets[0];
  const original = saved.find((c) => c.id === active?.id);
  const dirty = staff && active !== undefined && !sameLayout(active, original);

  const update = (patch: Partial<SampleCabinet>) => {
    if (!active) return;
    setCabinets((list) => list.map((c) => (c.id === active.id ? { ...c, ...patch } : c)));
  };

  const add = () => {
    const number = lastNumber + 1;
    const label = defaultCabinetName(number);
    const id = `c-new-${number}`;
    const fresh: SampleCabinet = { id, number, label, doorType: DEFAULT_DOOR_TYPE, shelves: DEFAULT_SHELVES, slots: [], reagentCount: 0 };
    setCabinets((list) => [...list, fresh]);
    setSaved((list) => [...list, fresh]);
    setLastNumber(number);
    setActiveId(id);
    setSelected({ side: "L", shelf: 1 });
    setToast(`${withJosa(label, "을", "를")} 추가했어요`);
  };

  // 시약장 전환: 저장 안 한 편집이 있으면 먼저 확인 (rules.json cabinet.unsaved_confirm)
  const switchTo = (id: string) => {
    if (id === active?.id) return;
    if (dirty) {
      setPendingSwitch(id);
      setOpen("unsaved");
      return;
    }
    setActiveId(id);
    setOpen(null);
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
  const counts: Record<string, number> = {};
  for (const r of placed) if (r.cabinetId === active.id) counts[r.slot] = (counts[r.slot] ?? 0) + 1;
  const inSlot = selectedKey ? placed.filter((r) => r.cabinetId === active.id && r.slot === slotId(selectedKey)) : [];

  const toggle = (cls: string) => {
    if (!selectedKey) return;
    const classes = toggleClass(selectedClasses, cls);
    const rest = active.slots.filter((s) => !sameSlot(s, selectedKey));
    update({ slots: [...rest, { ...selectedKey, classes }] });
  };

  // 칸 누르기: 모든 역할 = 칸 시트, 교사·admin 은 그 칸이 선택 칸(분류 편집 대상)도 된다
  const pressSlot = (key: SlotKey) => {
    setSelected(key);
    setOpen("slot");
  };

  const top = (
    <>
      <CabinetSwitcher items={cabinets.map((c) => ({ id: c.id, label: c.label, number: c.number }))} activeId={active.id} onSelect={switchTo}>
        {staff ? <CabinetAdd onClick={add} /> : null}
      </CabinetSwitcher>
      <CabinetTitle number={active.number} label={active.label} doorType={active.doorType} shelves={active.shelves} />
    </>
  );

  const board = (
    <>
      <CabinetLayout
        doorType={active.doorType}
        shelves={active.shelves}
        slots={active.slots}
        counts={counts}
        selected={staff ? selectedKey : null}
        onSelect={pressSlot}
      />
      <CabinetLegend showSelected={staff} />
    </>
  );

  const bottom =
    unassigned.length > 0 ? (
      <div className={styles.unassigned}>
        <h3 className={styles.sectionTitle}>
          {UNASSIGNED_LABEL} 시약 ({unassigned.length})
        </h3>
        {unassigned.map((r) => (
          <ReagentRow key={r.id} title={r.name} body={r.amount} trailingCaption={UNASSIGNED_LABEL} href={`/reagents/${r.id}`} />
        ))}
      </div>
    ) : undefined;

  const edit = staff ? (
    <CabinetEdit
      layout="panel"
      busy={open !== null && open !== "slot"}
      onRename={() => setOpen("rename")}
      onDelete={() => setOpen("delete")}
      qrPrint={<QrPrint expanded={open === "print"} onClick={() => setOpen("print")} />}
      selects={
        <CabinetSelects>
          <CabinetDoorSelect value={active.doorType} onChange={(doorType) => update({ doorType })} />
          <CabinetShelfSelect value={active.shelves} onChange={(shelves) => update({ shelves })} />
        </CabinetSelects>
      }
      picker={
        selectedKey ? (
          <StorageClassPicker slotName={slotName(selectedKey, active.doorType)} selected={selectedClasses} onToggle={toggle} />
        ) : undefined
      }
      warning={<MixWarning lines={warnings} />}
      footer={
        <CabinetSaveBar
          sticky={false}
          notice={removed > 0 ? `이 변경으로 사라지는 칸 ${removed}개의 시약은 '${UNASSIGNED_LABEL}'이 돼요` : undefined}
        >
          <ButtonPrimary
            fullWidth
            onClick={() => {
              setSaved((list) => list.map((c) => (c.id === active.id ? active : c)));
              setToast("시약장 설정을 저장했어요");
            }}
          >
            저장
          </ButtonPrimary>
        </CabinetSaveBar>
      }
    />
  ) : undefined;

  return (
    <div className={styles.screen}>
      <CabinetScreen top={top} board={board} bottom={bottom} edit={edit} aside={staff ? undefined : <MixWarning lines={warnings} />} />

      {open === "slot" && selectedKey ? (
        <SlotSheet
          sheet={false}
          title={slotTitle(selectedKey, active.doorType)}
          classes={selectedClasses}
          reagents={inSlot}
          canEdit={staff}
          onClose={() => setOpen(null)}
          onRemove={(id) => {
            const r = placed.find((p) => p.id === id);
            if (!r) return;
            setPlaced((list) => list.filter((p) => p.id !== id));
            setUnassigned((list) => [...list, { id: r.id, name: r.name, amount: r.amount, storageClass: r.storageClass }]);
            setToast(`${withJosa(r.name, "을", "를")} 뺐어요(${UNASSIGNED_LABEL})`);
          }}
        >
          <SlotAssign
            key={`${active.id}-${slotId(selectedKey)}`}
            candidates={unassigned}
            slotClasses={selectedClasses}
            slotReagentClasses={inSlot.map((r) => r.storageClass)}
            onAssign={(id) => {
              const r = unassigned.find((u) => u.id === id);
              if (!r) return;
              setUnassigned((list) => list.filter((u) => u.id !== id));
              setPlaced((list) => [...list, { ...r, cabinetId: active.id, slot: slotId(selectedKey) }]);
              setToast(`${withJosa(r.name, "을", "를")} ${slotTitle(selectedKey, active.doorType)}에 넣었어요`);
            }}
          />
        </SlotSheet>
      ) : null}

      {open === "print" ? (
        <QrPrintSheet
          sheet={false}
          schoolName={schoolName}
          origin={SAMPLE_ORIGIN}
          cabinets={cabinets.map((c) => ({ id: c.id, number: c.number, label: c.label }))}
          defaultTarget={active.id}
          onClose={() => setOpen(null)}
          onPrint={(ids) => setToast(`라벨 ${ids.length}개를 인쇄해요 (갤러리에서는 인쇄 창을 열지 않아요)`)}
        />
      ) : null}

      {open === "unsaved" ? (
        <CabinetUnsavedConfirm
          sheet={false}
          cabinetLabel={active.label}
          onContinue={() => {
            setOpen(null);
            setPendingSwitch(null);
          }}
          onDiscard={() => {
            setCabinets((list) => list.map((c) => (c.id === active.id ? (original ?? c) : c)));
            if (pendingSwitch) setActiveId(pendingSwitch);
            setPendingSwitch(null);
            setOpen(null);
          }}
        />
      ) : null}

      {open === "rename" ? (
        <CabinetRenameSheet
          key={active.id}
          sheet={false}
          defaultName={active.label}
          onCancel={() => setOpen(null)}
          onSave={(label) => {
            update({ label });
            setSaved((list) => list.map((c) => (c.id === active.id ? { ...c, label } : c)));
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
            setSaved((list) => list.filter((c) => c.id !== active.id));
            setActiveId(rest[0]?.id);
            setOpen(null);
            setToast(`${withJosa(active.label, "을", "를")} 삭제했어요`);
          }}
        />
      ) : null}

      {toast ? <Toast>{toast}</Toast> : null}
    </div>
  );
}

/** 계정 메뉴 예시 (nav-account-menu, d7 §10) — 갤러리에서는 실제로 로그아웃하지 않고 눌렀다는 것만 보여 준다 */
export function NavLogoutDemo({ schoolName }: { schoolName: string }) {
  const [count, setCount] = useState(0);
  return (
    <>
      <NavPill schoolName={schoolName} sectionTitle="시약장 설정" onLogout={() => setCount((n) => n + 1)} />
      <p className={styles.note} role="status">
        {count > 0 ? `로그아웃을 ${count}번 눌렀어요 (갤러리에서는 실제로 로그아웃하지 않아요)` : "학교명 옆 ▾ 를 누르면 메뉴가 열려요"}
      </p>
    </>
  );
}
