"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { ReagentRow } from "@/components/reagent-row";
import { StorageClassPicker } from "@/components/storage-class-chip";
import {
  UNASSIGNED_LABEL,
  cabinetMeta,
  mixWarnings,
  removedSlots,
  sameSlot,
  slotKeys,
  slotName,
  toggleClass,
  withJosa,
  type DoorType,
  type ShelfCount,
  type SlotKey,
  type SlotSide,
  type StorageClass,
} from "@/lib/cabinet-rules";
import { addCabinetAction, deleteCabinetAction, renameCabinetAction, saveCabinetLayoutAction } from "./actions";
import styles from "./cabinets.module.css";

type SlotView = { side: SlotSide; shelf: number; classes: StorageClass[] };

export type CabinetsScreenActive = {
  id: string;
  label: string;
  doorType: DoorType;
  shelves: ShelfCount;
  /** 저장된 격자의 모든 칸 */
  slots: SlotView[];
  /** 이 시약장에 배치된 시약 수 */
  placedCount: number;
  /** 칸별 배치 시약 수 (0 인 칸은 없음) */
  placedBySlot: { side: SlotSide; shelf: number; count: number }[];
};

type Props = {
  /** 교사·admin — 화면을 그릴지 정하는 값일 뿐, 쓰기 권한은 서버(DB 함수)가 세션으로 다시 본다 */
  canManage: boolean;
  /** 자기 학교 시약장 (만든 순서) */
  cabinets: { id: string; label: string }[];
  /** `?c=` 의 시약장 (없으면 첫 시약장). 시약장이 0개면 null */
  active: CabinetsScreenActive | null;
  /** 칸 없음 시약 (재고는 서버가 만든 글자) */
  unassigned: { id: string; name: string; stock: string }[];
};

/** 저장하지 않은 편집 — 어느 시약장의 것인지 같이 쥔다 (다른 시약장으로 바꾸면 버려진다) */
type Draft = { forId: string; doorType: DoorType; shelves: ShelfCount; slots: SlotView[] };
type Sheet = { kind: "rename" | "delete"; forId: string } | null;
type Op = "add" | "save" | "rename" | "delete";

/** 저장 후 토스트를 보여 주는 시간 */
const TOAST_MS = 4000;
const FIRST_SLOT: SlotKey = { side: "L", shelf: 1 };

function sameClasses(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((c, i) => c === b[i]);
}

/**
 * 화면 11 시약장 설정.
 * 시안: cabinet-switcher(끝에 cabinet-add) → 시약장 이름 + 요약 → cabinet-edit(관리 줄 · 문 형태 · 단 수 · 배치도 · 범례 ·
 *       선택 칸 분류 칩 · mix-warning · 저장) → 칸 없음 시약. 학생은 cabinet-add·cabinet-edit 없이 배치도·범례·경고·목록만.
 * 편집(문 형태·단 수·칸 분류·선택 칸)은 이 화면 안 상태다 — "저장" 전까지 서버 값은 그대로이고,
 * 다른 시약장으로 바꾸거나 화면을 떠나면 저장하지 않은 편집은 버려진다 ("저장" 은 바뀐 것이 있을 때만 켜진다).
 * 학교·역할 값은 보내지 않는다.
 */
export function CabinetsScreen({ canManage, cabinets, active, unassigned }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selected, setSelected] = useState<SlotKey | null>(FIRST_SLOT);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ key: number; text: string } | null>(null);
  const [op, setOp] = useState<Op | null>(null);
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const activeId = active?.id ?? null;
  // 다른 시약장으로 바뀌면(전환·추가·삭제) 저장하지 않은 편집과 안내를 버린다 — 돌아와도 서버 값부터 시작한다
  const [seenId, setSeenId] = useState(activeId);
  if (seenId !== activeId) {
    setSeenId(activeId);
    setDraft(null);
    setAddError(null);
    setSaveError(null);
  }
  // 시트는 연 시약장에만 속한다 — 다른 시약장으로 바꾸면 닫힌 것으로 본다
  const open = sheet && sheet.forId === activeId ? sheet.kind : null;
  const locked = pending || open !== null;

  const run = (kind: Op, work: () => Promise<void>) => {
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

  const add = () => {
    if (!canManage || locked) return;
    setAddError(null);
    run("add", async () => {
      const res = await addCabinetAction().catch(() => null);
      if (!res) {
        setAddError("추가하지 못했어요. 잠시 후 다시 시도해 주세요");
        return;
      }
      if (!res.ok) {
        setAddError(res.error);
        return;
      }
      setSelected(FIRST_SLOT);
      setSaveError(null);
      setToast({ key: Date.now(), text: `${withJosa(res.cabinet.label, "을", "를")} 추가했어요` });
      router.push(`/cabinets?c=${res.cabinet.id}`, { scroll: false });
    });
  };

  const unassignedList =
    unassigned.length > 0 ? (
      <section className={styles.unassigned} aria-labelledby="cabinets-unassigned">
        <h2 id="cabinets-unassigned" className={styles.sectionTitle}>
          {UNASSIGNED_LABEL} 시약 ({unassigned.length})
        </h2>
        {unassigned.map((r) => (
          <ReagentRow key={r.id} title={r.name} body={r.stock} trailingCaption={UNASSIGNED_LABEL} href={`/reagents/${r.id}`} />
        ))}
      </section>
    ) : null;

  const toastNode = toast ? (
    <Toast key={toast.key} floating>
      {toast.text}
    </Toast>
  ) : null;

  // 시약장 0개 (시안 11-empty): 제목 줄 + 빈 상태 카드만
  if (!active) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>시약장 설정</h1>
        <h2 className={styles.pageTitle}>시약장 0개</h2>
        <div className={styles.emptyArea}>
          <div className={styles.emptyCard}>
            <EmptyStateCard
              variant="outlined"
              icon="cabinet"
              title="아직 시약장이 없어요"
              description={canManage ? "'+ 시약장 추가'를 눌러 첫 시약장을 만들어 주세요" : "교사가 시약장을 추가하면 여기에 보여요"}
            >
              {canManage ? <CabinetAdd pending={pending && op === "add"} disabled={pending} onClick={add} /> : null}
            </EmptyStateCard>
          </div>
          {addError ? (
            <p className={styles.error} role="alert">
              {addError}
            </p>
          ) : null}
        </div>
        {toastNode}
      </div>
    );
  }

  // 편집 중인 값 (없으면 서버 값)
  const edit = canManage && draft && draft.forId === active.id ? draft : active;
  const keys = slotKeys(edit.doorType, edit.shelves);
  const classesOf = (list: readonly SlotView[], key: SlotKey) => list.find((s) => sameSlot(s, key))?.classes ?? [];
  const dirty =
    edit !== active &&
    (edit.doorType !== active.doorType ||
      edit.shelves !== active.shelves ||
      keys.some((k) => !sameClasses(classesOf(edit.slots, k), classesOf(active.slots, k))));

  const selectedKey = canManage && selected && keys.some((k) => sameSlot(k, selected)) ? selected : null;
  const selectedClasses = selectedKey ? classesOf(edit.slots, selectedKey) : [];
  const warnings = mixWarnings(edit.slots, edit.doorType, edit.shelves).map((w) => w.text);

  // 칸 줄이기 안내 (d7 §9): 저장된 격자에서 사라지는 칸에 배치된 시약 수
  const gone = removedSlots(active, edit);
  const unplaced = active.placedBySlot.filter((p) => gone.some((k) => sameSlot(k, p))).reduce((n, p) => n + p.count, 0);
  const notice = unplaced > 0 ? `이 변경으로 시약 ${unplaced}종이 '${UNASSIGNED_LABEL}'이 돼요` : undefined;

  const change = (patch: Partial<Omit<Draft, "forId">>) => {
    if (locked) return;
    setSaveError(null);
    setDraft({ forId: active.id, doorType: edit.doorType, shelves: edit.shelves, slots: edit.slots, ...patch });
  };

  const toggle = (cls: string) => {
    if (!selectedKey) return;
    const classes = toggleClass(selectedClasses, cls);
    change({ slots: [...edit.slots.filter((s) => !sameSlot(s, selectedKey)), { ...selectedKey, classes }] });
  };

  const save = () => {
    if (locked || !dirty) return;
    setSaveError(null);
    const input = {
      cabinetId: active.id,
      doorType: edit.doorType,
      shelves: edit.shelves,
      slots: keys.map((k) => ({ side: k.side, shelf: k.shelf, classes: classesOf(edit.slots, k) })),
    };
    run("save", async () => {
      const res = await saveCabinetLayoutAction(input).catch(() => null);
      if (!res) {
        setSaveError("저장하지 못했어요. 잠시 후 다시 시도해 주세요");
        return;
      }
      if (!res.ok) {
        setSaveError(res.error);
        return;
      }
      // 서버가 저장한 값으로 맞춘다 (칸 없음 목록·배치 수는 서버가 같이 다시 내려 준다)
      setDraft({ forId: res.cabinetId, doorType: res.doorType, shelves: res.shelves, slots: res.slots });
      setToast({ key: Date.now(), text: "시약장 설정을 저장했어요" });
    });
  };

  const openSheet = (kind: "rename" | "delete") => {
    if (locked) return;
    setSheetError(null);
    setSheet({ kind, forId: active.id });
  };

  const closeSheet = () => {
    if (pending) return;
    setSheet(null);
    setSheetError(null);
  };

  const rename = (label: string) => {
    if (pending) return;
    if (label === active.label) {
      closeSheet();
      return;
    }
    setSheetError(null);
    run("rename", async () => {
      const res = await renameCabinetAction({ cabinetId: active.id, label }).catch(() => null);
      if (!res) {
        setSheetError("저장하지 못했어요. 잠시 후 다시 시도해 주세요");
        return;
      }
      if (!res.ok) {
        setSheetError(res.error);
        return;
      }
      setSheet(null);
      setToast({ key: Date.now(), text: "이름을 바꿨어요" });
    });
  };

  const remove = () => {
    if (pending) return;
    setSheetError(null);
    run("delete", async () => {
      const res = await deleteCabinetAction({ cabinetId: active.id }).catch(() => null);
      if (!res) {
        setSheetError("삭제하지 못했어요. 잠시 후 다시 시도해 주세요");
        return;
      }
      if (!res.ok) {
        setSheetError(res.error);
        return;
      }
      setSheet(null);
      setDraft(null);
      setSelected(FIRST_SLOT);
      setSaveError(null);
      setToast({ key: Date.now(), text: `${withJosa(res.label || active.label, "을", "를")} 삭제했어요` });
      // 남은 첫 시약장이 활성 (0개가 되면 빈 상태) — 지운 id 를 주소에서 뺀다
      router.replace("/cabinets", { scroll: false });
    });
  };

  const board = (
    <>
      <CabinetLayout
        doorType={edit.doorType}
        shelves={edit.shelves}
        slots={edit.slots}
        selected={selectedKey}
        onSelect={canManage ? setSelected : undefined}
        readOnly={!canManage}
        disabled={canManage ? locked : undefined}
      />
      <CabinetLegend showSelected={canManage} />
    </>
  );

  const pageClass = [styles.page, canManage ? (notice ? styles.withNotice : styles.withSave) : ""].filter(Boolean).join(" ");

  return (
    <div className={pageClass}>
      <h1 className={styles.title}>시약장 설정</h1>

      <CabinetSwitcher items={cabinets.map((c) => ({ id: c.id, label: c.label, href: `/cabinets?c=${c.id}` }))} activeId={active.id}>
        {canManage ? <CabinetAdd pending={pending && op === "add"} disabled={locked} onClick={add} /> : null}
      </CabinetSwitcher>
      {addError ? (
        <p className={styles.error} role="alert">
          {addError}
        </p>
      ) : null}

      <div className={styles.header}>
        <h2 className={styles.cabinetTitle}>{active.label}</h2>
        <span className={styles.cabinetMeta}>{cabinetMeta(edit.doorType, edit.shelves)}</span>
      </div>

      {canManage ? (
        <CabinetEdit
          busy={locked}
          onRename={() => openSheet("rename")}
          onDelete={() => openSheet("delete")}
          selects={
            <CabinetSelects>
              <CabinetDoorSelect value={edit.doorType} disabled={locked} onChange={(doorType) => change({ doorType })} />
              <CabinetShelfSelect value={edit.shelves} disabled={locked} onChange={(shelves) => change({ shelves })} />
            </CabinetSelects>
          }
          board={board}
        >
          {selectedKey ? (
            <StorageClassPicker
              slotName={slotName(selectedKey, edit.doorType)}
              selected={selectedClasses}
              onToggle={toggle}
              disabled={locked}
            />
          ) : null}
          <MixWarning lines={warnings} />
          <CabinetSaveBar notice={notice}>
            {saveError ? (
              <p className={styles.error} role="alert">
                {saveError}
              </p>
            ) : null}
            <ButtonPrimary fullWidth disabled={locked || !dirty} aria-busy={(pending && op === "save") || undefined} onClick={save}>
              저장
            </ButtonPrimary>
          </CabinetSaveBar>
        </CabinetEdit>
      ) : (
        <div className={styles.view}>
          {board}
          <MixWarning lines={warnings} />
        </div>
      )}

      {unassignedList}

      {canManage && open ? (
        <div className={styles.dialog}>
          {open === "rename" ? (
            <CabinetRenameSheet
              key={active.id}
              modal={false}
              defaultName={active.label}
              pending={pending}
              error={sheetError}
              onSave={rename}
              onCancel={closeSheet}
            />
          ) : (
            <CabinetDeleteConfirm
              key={active.id}
              modal={false}
              reagentCount={active.placedCount}
              pending={pending}
              error={sheetError}
              onConfirm={remove}
              onCancel={closeSheet}
            />
          )}
        </div>
      ) : null}

      {toastNode}
    </div>
  );
}
