"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { QrPrint } from "@/components/qr-print";
import { QrPrintSheet } from "@/components/qr-print-sheet";
import { ReagentRow } from "@/components/reagent-row";
import { SheetNote } from "@/components/sheet-panel";
import { SlotAssign } from "@/components/slot-assign";
import { SlotSheet } from "@/components/slot-sheet";
import { StorageClassPicker } from "@/components/storage-class-chip";
import {
  UNASSIGNED_LABEL,
  mixWarnings,
  removedSlots,
  sameSlot,
  slotId,
  slotKeys,
  slotName,
  slotTitle,
  toggleClass,
  withJosa,
  type DoorType,
  type ShelfCount,
  type SlotKey,
  type SlotSide,
  type StorageClass,
} from "@/lib/cabinet-rules";
import { useUnsavedGuard } from "@/lib/use-unsaved-guard";
import { addCabinetAction, deleteCabinetAction, placeReagentAction, renameCabinetAction, saveCabinetLayoutAction } from "./actions";
import styles from "./cabinets.module.css";

/** 칸 시트·칸 없음 목록의 시약 한 줄 (재고는 서버가 만든 글자) */
export type CabinetsScreenReagent = { id: string; name: string; amount: string; storageClass: StorageClass | null };

type SlotView = { side: SlotSide; shelf: number; classes: StorageClass[] };

export type CabinetsScreenActive = {
  id: string;
  /** 학교 안 고정 번호 (cabinet-number) */
  number: number;
  label: string;
  doorType: DoorType;
  shelves: ShelfCount;
  /** 저장된 격자의 모든 칸 — DB 칸 id(행이 없으면 null)와 그 칸의 시약 */
  slots: (SlotView & { slotId: string | null; reagents: CabinetsScreenReagent[] })[];
  /** 이 시약장에 배치된 시약 수 */
  placedCount: number;
  /** 칸별 배치 시약 수 (0 인 칸은 없음) */
  placedBySlot: { side: SlotSide; shelf: number; count: number }[];
};

type Props = {
  /** 교사·admin — 화면을 그릴지 정하는 값일 뿐, 쓰기 권한은 서버(DB 함수)가 세션으로 다시 본다 */
  canManage: boolean;
  /** 자기 학교 이름 — QR 라벨 글자 (교사·admin 만 넘어온다) */
  schoolName: string;
  /** QR 내용의 앱 주소 (요청 기준, 교사·admin 만 넘어온다) */
  origin: string;
  /** 자기 학교 시약장 (번호 순) */
  cabinets: { id: string; number: number; label: string }[];
  /** `?c=` 의 시약장 (없으면 첫 시약장). 시약장이 0개면 null */
  active: CabinetsScreenActive | null;
  /** 칸 없음 시약 (이름순) */
  unassigned: CabinetsScreenReagent[];
};

/** 저장하지 않은 편집 — 어느 시약장의 것인지 같이 쥔다 (다른 시약장으로 바꾸면 버려진다) */
type Draft = { forId: string; doorType: DoorType; shelves: ShelfCount; slots: SlotView[] };
type Open =
  | { kind: "rename" | "delete" | "print"; forId: string }
  | { kind: "slot"; forId: string; key: SlotKey }
  | { kind: "unsaved"; forId: string; then: { kind: "href"; href: string } | { kind: "add" } };
type Op = "add" | "save" | "rename" | "delete" | "place";

/** 저장 후 토스트를 보여 주는 시간 */
const TOAST_MS = 4000;
const FIRST_SLOT: SlotKey = { side: "L", shelf: 1 };
const CABINETS_PATH = "/cabinets";

function sameClasses(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((c, i) => c === b[i]);
}

/**
 * 화면 11 시약장 설정 (디자인 1.15).
 * 배치(CabinetScreen): 데스크톱 2단 — 왼쪽 switcher(번호 pill · 끝에 cabinet-add) · 제목(번호 + 이름 + 요약) · 배치도(칸마다 slot-count) ·
 * 범례 · 칸 없음 목록 / 오른쪽 cabinet-edit 카드(관리 줄 "이름 바꾸기" · qr-print · "삭제" → 문 형태 · 단 수 → 선택 칸 분류 → mix-warning → 저장).
 * 모바일 한 열(시안 11-mobile 순서), 저장은 tab-bar 바로 위 고정. 학생은 편집 카드 없이 배치도·범례·경고·목록만 (R7).
 *
 * 칸 누르기: 모든 역할 = 칸 시트(slot-sheet — 그 칸 시약 목록, 행 → 시약 상세). 교사·admin 은 시트 안에서 넣기(slot-assign)·빼기를 하고,
 * 같은 누름으로 그 칸이 선택 칸(분류 편집 대상)도 된다. 넣기·빼기는 바로 저장된다(place_reagent) — 분류 불일치·위험 조합은 경고만.
 * 편집(문 형태·단 수·칸 분류)은 "저장" 전까지 이 화면 안 상태다. 편집 중에 다른 시약장·다른 화면으로 가거나 시약장을 추가하면
 * 확인 카드 "저장하지 않은 변경이 있어요"(버리고 이동 / 계속 편집), 새로고침·창 닫기는 브라우저 기본 확인 (useUnsavedGuard).
 * 학교·역할 값은 보내지 않는다.
 */
export function CabinetsScreen({ canManage, schoolName, origin, cabinets, active, unassigned }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selected, setSelected] = useState<SlotKey | null>(FIRST_SLOT);
  const [open, setOpen] = useState<Open | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ key: number; text: string } | null>(null);
  const [op, setOp] = useState<Op | null>(null);
  const [placingId, setPlacingId] = useState<string | null>(null);
  const [assignRound, setAssignRound] = useState(0);
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
    setSlotError(null);
  }
  // 시트는 연 시약장에만 속한다 — 다른 시약장으로 바꾸면 닫힌 것으로 본다
  const shown = open && open.forId === activeId ? open : null;
  // 칸 시트는 편집을 막지 않는다 (시안 11-slot: 시트 뒤 화면 그대로). 이름·삭제·인쇄·확인 카드는 막는다
  const locked = pending || (shown !== null && shown.kind !== "slot");

  // 편집 중인 값 (없으면 서버 값)
  const edit = canManage && active && draft && draft.forId === active.id ? draft : active;
  const keys = edit ? slotKeys(edit.doorType, edit.shelves) : [];
  const classesOf = (list: readonly SlotView[], key: SlotKey) => list.find((s) => sameSlot(s, key))?.classes ?? [];
  const dirty = Boolean(
    active &&
      edit &&
      edit !== active &&
      (edit.doorType !== active.doorType ||
        edit.shelves !== active.shelves ||
        keys.some((k) => !sameClasses(classesOf(edit.slots, k), classesOf(active.slots, k)))),
  );

  // 저장하지 않은 편집 지키기: 앱 안 링크 이동은 확인 카드, 새로고침·닫기는 브라우저 기본 확인
  useUnsavedGuard({
    active: canManage && dirty,
    onBlocked: (href) => {
      if (!active) return;
      setOpen({ kind: "unsaved", forId: active.id, then: { kind: "href", href } });
    },
    // 지금 시약장 pill (같은 시약장으로의 이동 — 편집이 그대로 남는다)
    allow: (url) => url.pathname === CABINETS_PATH && url.searchParams.get("c") === activeId,
  });

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

  const doAdd = () => {
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
      router.push(`${CABINETS_PATH}?c=${res.cabinet.id}`, { scroll: false });
    });
  };

  const add = () => {
    if (!canManage || locked) return;
    if (dirty && active) {
      setOpen({ kind: "unsaved", forId: active.id, then: { kind: "add" } });
      return;
    }
    doAdd();
  };

  const unassignedList =
    unassigned.length > 0 ? (
      <section className={styles.unassigned} aria-labelledby="cabinets-unassigned">
        <h2 id="cabinets-unassigned" className={styles.sectionTitle}>
          {UNASSIGNED_LABEL} 시약 ({unassigned.length})
        </h2>
        {unassigned.map((r) => (
          <ReagentRow key={r.id} title={r.name} body={r.amount} trailingCaption={UNASSIGNED_LABEL} href={`/reagents/${r.id}`} />
        ))}
      </section>
    ) : undefined;

  const toastNode = toast ? (
    <Toast key={toast.key} floating>
      {toast.text}
    </Toast>
  ) : null;

  // 시약장 0개 (시안 11-empty): 제목 줄 + 빈 상태 카드만
  if (!active || !edit) {
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

  const selectedKey = canManage && selected && keys.some((k) => sameSlot(k, selected)) ? selected : null;
  const selectedClasses = selectedKey ? classesOf(edit.slots, selectedKey) : [];
  const warnings = mixWarnings(edit.slots, edit.doorType, edit.shelves).map((w) => w.text);

  // 칸 줄이기 안내 (d7 §9): 저장된 격자에서 사라지는 칸에 배치된 시약 수
  const gone = removedSlots(active, edit);
  const unplaced = active.placedBySlot.filter((p) => gone.some((k) => sameSlot(k, p))).reduce((n, p) => n + p.count, 0);
  const notice = unplaced > 0 ? `이 변경으로 시약 ${unplaced}종이 '${UNASSIGNED_LABEL}'이 돼요` : undefined;

  // 칸 안 시약 수 (slot-count — 저장된 배치 기준)
  const counts: Record<string, number> = {};
  for (const s of active.slots) if (s.reagents.length > 0) counts[slotId(s)] = s.reagents.length;

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

  const openSheet = (kind: "rename" | "delete" | "print") => {
    if (locked) return;
    setSheetError(null);
    setOpen({ kind, forId: active.id });
  };

  const closeSheet = () => {
    if (pending) return;
    setOpen(null);
    setSheetError(null);
    setSlotError(null);
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
      setOpen(null);
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
      setOpen(null);
      setDraft(null);
      setSelected(FIRST_SLOT);
      setSaveError(null);
      setToast({ key: Date.now(), text: `${withJosa(res.label || active.label, "을", "를")} 삭제했어요` });
      // 남은 첫 시약장이 활성 (0개가 되면 빈 상태) — 지운 id 를 주소에서 뺀다
      router.replace(CABINETS_PATH, { scroll: false });
    });
  };

  // 칸 누르기: 모든 역할 = 칸 시트, 교사·admin 은 그 칸이 선택 칸(분류 편집 대상)도 된다 (D1 결정)
  const pressSlot = (key: SlotKey) => {
    if (canManage) setSelected(key);
    setSlotError(null);
    setOpen({ kind: "slot", forId: active.id, key });
  };

  // 칸 시트의 칸 (저장된 격자 기준 — 편집으로 새로 생긴 칸은 저장 전까지 DB 칸이 없다)
  const slotKey = shown?.kind === "slot" ? shown.key : null;
  const slotSaved = slotKey ? (active.slots.find((s) => sameSlot(s, slotKey)) ?? null) : null;
  const slotLabel = slotKey ? slotTitle(slotKey, active.doorType) : "";

  // 넣기·빼기: 바로 저장 (place_reagent). 경고는 화면이 보여 줄 뿐 막지 않는다
  const place = (reagent: CabinetsScreenReagent, target: string | null) => {
    if (!canManage || pending) return;
    setSlotError(null);
    setPlacingId(reagent.id);
    run("place", async () => {
      try {
        const res = await placeReagentAction({ reagentId: reagent.id, slotId: target }).catch(() => null);
        if (!res) {
          setSlotError("저장하지 못했어요. 잠시 후 다시 시도해 주세요");
          return;
        }
        if (!res.ok) {
          setSlotError(res.error);
          return;
        }
        if (target) setAssignRound((n) => n + 1);
        setToast({
          key: Date.now(),
          text: target
            ? `${withJosa(reagent.name, "을", "를")} ${slotLabel}에 넣었어요`
            : `${withJosa(reagent.name, "을", "를")} 뺐어요(${UNASSIGNED_LABEL})`,
        });
      } finally {
        setPlacingId(null);
      }
    });
  };

  // 확인 카드: "버리고 이동" — 편집을 버리고 막았던 이동·추가를 이어 간다
  const discardAndGo = () => {
    if (shown?.kind !== "unsaved") return;
    const then = shown.then;
    setDraft(null);
    setSaveError(null);
    setOpen(null);
    if (then.kind === "add") doAdd();
    else router.push(then.href, { scroll: !then.href.startsWith(CABINETS_PATH) });
  };

  const top = (
    <>
      <CabinetSwitcher
        items={cabinets.map((c) => ({ id: c.id, number: c.number, label: c.label, href: `${CABINETS_PATH}?c=${c.id}` }))}
        activeId={active.id}
      >
        {canManage ? <CabinetAdd pending={pending && op === "add"} disabled={locked} onClick={add} /> : null}
      </CabinetSwitcher>
      {addError ? (
        <p className={styles.error} role="alert">
          {addError}
        </p>
      ) : null}
      <CabinetTitle number={active.number} label={active.label} doorType={edit.doorType} shelves={edit.shelves} />
    </>
  );

  const board = (
    <>
      <CabinetLayout
        doorType={edit.doorType}
        shelves={edit.shelves}
        slots={edit.slots}
        counts={counts}
        selected={canManage ? selectedKey : null}
        onSelect={pressSlot}
        disabled={canManage ? locked : undefined}
      />
      <CabinetLegend showSelected={canManage} />
    </>
  );

  const editPanel = canManage ? (
    <CabinetEdit
      layout="panel"
      busy={locked}
      onRename={() => openSheet("rename")}
      onDelete={() => openSheet("delete")}
      qrPrint={<QrPrint disabled={locked} expanded={shown?.kind === "print"} onClick={() => openSheet("print")} />}
      selects={
        <CabinetSelects>
          <CabinetDoorSelect value={edit.doorType} disabled={locked} onChange={(doorType) => change({ doorType })} />
          <CabinetShelfSelect value={edit.shelves} disabled={locked} onChange={(shelves) => change({ shelves })} />
        </CabinetSelects>
      }
      picker={
        selectedKey ? (
          <StorageClassPicker slotName={slotName(selectedKey, edit.doorType)} selected={selectedClasses} onToggle={toggle} disabled={locked} />
        ) : undefined
      }
      warning={<MixWarning lines={warnings} />}
      footer={
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
      }
    />
  ) : undefined;

  const pageClass = [styles.page, canManage ? (notice ? styles.withNotice : styles.withSave) : ""].filter(Boolean).join(" ");

  return (
    <div className={pageClass}>
      <h1 className={styles.title}>시약장 설정</h1>

      <CabinetScreen
        top={top}
        board={board}
        bottom={unassignedList}
        edit={editPanel}
        aside={canManage ? undefined : <MixWarning lines={warnings} />}
      />

      {slotKey ? (
        <SlotSheet
          key={`${active.id}-${slotId(slotKey)}`}
          title={slotLabel}
          classes={slotSaved?.classes ?? []}
          reagents={slotSaved?.reagents ?? []}
          hrefOf={(id) => `/reagents/${id}`}
          canEdit={canManage}
          pendingId={placingId}
          onRemove={(id) => {
            const r = slotSaved?.reagents.find((x) => x.id === id);
            if (r) place(r, null);
          }}
          onClose={closeSheet}
        >
          {slotSaved?.slotId ? (
            <SlotAssign
              key={`${active.id}-${slotId(slotKey)}-${assignRound}`}
              candidates={unassigned}
              slotClasses={slotSaved.classes}
              slotReagentClasses={slotSaved.reagents.map((r) => r.storageClass)}
              pending={pending && op === "place"}
              error={slotError}
              onAssign={(id) => {
                const r = unassigned.find((u) => u.id === id);
                if (r && slotSaved.slotId) place(r, slotSaved.slotId);
              }}
            />
          ) : (
            <SheetNote>시약장 설정을 저장하면 이 칸에 시약을 넣을 수 있어요</SheetNote>
          )}
        </SlotSheet>
      ) : null}

      {canManage && shown?.kind === "print" ? (
        <QrPrintSheet
          schoolName={schoolName}
          origin={origin}
          cabinets={cabinets}
          defaultTarget={active.id}
          onClose={closeSheet}
        />
      ) : null}

      {canManage && shown && (shown.kind === "rename" || shown.kind === "delete" || shown.kind === "unsaved") ? (
        <div className={styles.dialog}>
          {shown.kind === "rename" ? (
            <CabinetRenameSheet
              key={active.id}
              modal={false}
              defaultName={active.label}
              cabinetNumber={active.number}
              pending={pending}
              error={sheetError}
              onSave={rename}
              onCancel={closeSheet}
            />
          ) : shown.kind === "delete" ? (
            <CabinetDeleteConfirm
              key={active.id}
              modal={false}
              reagentCount={active.placedCount}
              pending={pending}
              error={sheetError}
              onConfirm={remove}
              onCancel={closeSheet}
            />
          ) : (
            <CabinetUnsavedConfirm modal={false} cabinetLabel={active.label} onDiscard={discardAndGo} onContinue={() => setOpen(null)} />
          )}
        </div>
      ) : null}

      {toastNode}
    </div>
  );
}
