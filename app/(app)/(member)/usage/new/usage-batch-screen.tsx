"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ButtonPrimary } from "@/components/button-primary";
import { ClassSelect, EMPTY_CLASS_DRAFT, classDraftValue, type ClassDraft } from "@/components/class-select";
import { Toast } from "@/components/ex-toast";
import { BottomBar, PageColumn, PageHead } from "@/components/page-frame";
import { PastDateNote } from "@/components/past-date-note";
import { ReagentAdd } from "@/components/reagent-add";
import { ReagentPickerDropdown, ReagentPickerSheet } from "@/components/reagent-picker";
import { TextInput } from "@/components/text-input";
import { UsageBatchList, type BatchListItem } from "@/components/usage-batch-list";
import { UsageDate } from "@/components/usage-date";
import { DesktopOnly, MobileOnly } from "@/components/viewport-only";
import type { UsageEntry } from "@/lib/supabase/usage-entry";
import {
  USAGE_BATCH_MAX,
  USAGE_BATCH_TEXT,
  batchDoneText,
  batchHeading,
  batchSaveLabel,
  canSaveBatch,
  type BatchStock,
} from "@/lib/usage-batch-rules";
import { USAGE_MEMO_MAX, pastDateNoteText } from "@/lib/usage-history-rules";
import { recordUsageBatchAction } from "./actions";
import styles from "./usage.module.css";

/** 저장 뒤 토스트를 보여 주고 들어온 화면으로 가기까지 */
const LEAVE_MS = 1500;
const TOAST_MS = 3000;

type Item = { id: string; amount: string; flagged: string | null };
type FieldError = { field: "date" | "memo" | "class" | "items"; message: string } | null;

type Props = {
  entry: UsageEntry;
  /** 저장 뒤 돌아갈 화면 (들어온 화면) */
  returnHref: string;
};

/**
 * 화면 4 여러 시약 사용 기록 (디자인 1.25 4-mobile · 4-desktop · 4-picker · 4-empty · 4-error · 4-past-date, d7 §24).
 * 담은 시약마다 사용량, 공통 칸 순서 사용일 → 수업(선택) → 메모(선택), 사용자 = 로그인한 사람(DB 가 정한다).
 * 저장 = record_usage_batch 한 번(한 트랜잭션) → 토스트 "N개 시약 사용을 기록했어요" → 들어온 화면.
 * 모바일 = 전용 화면(reagent-add → 바텀시트 체크 → "{N}개 담기", 저장 바는 tab-bar 위),
 * 데스크톱 = 본문 페이지(page-head → 가운데 640 열: 검색 칸 + 드롭다운 → data-table → 공통 칸, 아래 고정 bottom-bar).
 */
export function UsageBatchScreen({ entry, returnHref }: Props) {
  const router = useRouter();
  const formId = useId();
  const sheetId = useId();
  const dropdownId = useId();

  const [stocks, setStocks] = useState<Map<string, BatchStock & { name: string }>>(
    () => new Map(entry.reagents.map((r) => [r.id, { stock: r.stock, unit: r.unit, name: r.name }])),
  );
  const [items, setItems] = useState<Item[]>(() => entry.initialIds.map((id) => ({ id, amount: "", flagged: null })));
  const [usedOn, setUsedOn] = useState(entry.today);
  const [memo, setMemo] = useState("");
  const [cls, setCls] = useState<ClassDraft>(EMPTY_CLASS_DRAFT);
  const [fieldError, setFieldError] = useState<FieldError>(null);
  const [toast, setToast] = useState<{ key: number; text: string } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [pending, startTransition] = useTransition();

  // 모바일 바텀시트 · 데스크톱 드롭다운
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sessionIds, setSessionIds] = useState<Set<string>>(new Set());
  const searchGroupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // "닫기" 뒤 검색 칸으로 포커스를 돌려줄 때는 포커스로 여는 동작을 한 번 건너뛴다 (사용자가 다시 누르면 열린다)
  const skipFocusOpen = useRef(false);

  useEffect(() => {
    if (!toast || leaving) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast, leaving]);

  // 드롭다운: 바깥을 누르면 닫는다
  useEffect(() => {
    if (!dropOpen) return;
    const outside = (e: Event) => {
      if (e.target instanceof Node && searchGroupRef.current?.contains(e.target)) return;
      setDropOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [dropOpen]);

  const busy = pending || leaving;
  const addedIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const remaining = USAGE_BATCH_MAX - items.length;
  const listItems: BatchListItem[] = items.flatMap((i) => {
    const s = stocks.get(i.id);
    return s ? [{ id: i.id, name: s.name, stock: s.stock, unit: s.unit, amount: i.amount, flagged: i.flagged }] : [];
  });
  const canSave = !busy && canSaveBatch(items.map((i) => ({ reagentId: i.id, amount: i.amount })), stocks);
  const past = usedOn !== "" && usedOn < entry.today;
  const saveLabel = pending ? "저장 중…" : batchSaveLabel(items.length);

  const clearErrors = () => {
    if (fieldError) setFieldError(null);
  };

  const addIds = (ids: string[]) => {
    setItems((cur) => {
      const have = new Set(cur.map((i) => i.id));
      const next = [...cur];
      for (const id of ids) {
        if (have.has(id) || next.length >= USAGE_BATCH_MAX || !stocks.has(id)) continue;
        next.push({ id, amount: "", flagged: null });
        have.add(id);
      }
      return next;
    });
    clearErrors();
  };

  const remove = (id: string) => {
    setItems((cur) => cur.filter((i) => i.id !== id));
    setSessionIds((cur) => {
      if (!cur.has(id)) return cur;
      const next = new Set(cur);
      next.delete(id);
      return next;
    });
    clearErrors();
  };

  const changeAmount = (id: string, amount: string) => {
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, amount, flagged: null } : i)));
    clearErrors();
  };

  const openDropdown = () => {
    if (busy) return;
    if (!dropOpen) setSessionIds(new Set());
    setDropOpen(true);
  };

  const toggleFromDropdown = (id: string) => {
    if (sessionIds.has(id)) {
      remove(id);
      return;
    }
    addIds([id]);
    setSessionIds((cur) => new Set(cur).add(id));
  };

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSave) return;
    setFieldError(null);
    const value = classDraftValue(cls);
    startTransition(async () => {
      const res = await recordUsageBatchAction({
        items: items.map((i) => ({ reagentId: i.id, amount: i.amount })),
        usedOn,
        memo,
        classGrade: value.grade,
        classNo: value.classNo,
        classSubject: value.subject,
      });
      if (res.ok) {
        setLeaving(true);
        setToast({ key: Date.now(), text: batchDoneText(res.count) });
        setTimeout(() => router.push(returnHref), LEAVE_MS);
        return;
      }
      if (res.stocks) {
        const fresh = res.stocks;
        setStocks((cur) => {
          const next = new Map(cur);
          for (const [id, s] of cur) if (fresh[id] !== undefined) next.set(id, { ...s, stock: fresh[id] });
          return next;
        });
      }
      if (res.flags && res.flags.length > 0) {
        const byId = new Map(res.flags.map((f) => [f.reagentId, f.message]));
        setItems((cur) => cur.map((i) => ({ ...i, flagged: byId.get(i.id) ?? null })));
      }
      if (res.field && res.field !== "items") setFieldError({ field: res.field, message: res.error });
      setToast({ key: Date.now(), text: res.flags?.length ? USAGE_BATCH_TEXT.saveFailed : res.error });
    });
  };

  const dateError = fieldError?.field === "date" ? fieldError.message : undefined;
  const memoError = fieldError?.field === "memo" ? fieldError.message : undefined;
  const classError = fieldError?.field === "class" ? fieldError.message : null;

  const pickerReagents = entry.reagents.map((r) => ({ ...r, stock: stocks.get(r.id)?.stock ?? r.stock }));

  const classSelect = (
    <ClassSelect
      value={cls}
      onChange={(v) => {
        setCls(v);
        clearErrors();
      }}
      maxGrade={entry.maxGrade}
      recent={entry.recentClasses}
      disabled={busy}
      error={classError}
    />
  );

  const saveButton = (
    <ButtonPrimary type="submit" form={formId} className={styles.saveButton} disabled={!canSave} aria-busy={pending || undefined}>
      {saveLabel}
    </ButtonPrimary>
  );

  return (
    <form id={formId} className={styles.page} onSubmit={submit} noValidate data-past={past ? "" : undefined}>
      <PageHead title={USAGE_BATCH_TEXT.title} subtitle={USAGE_BATCH_TEXT.caption} />

      {/* 모바일 (4-mobile): 담은 시약 카드 → 사용일 → 수업 → 메모, 저장 바는 tab-bar 위 */}
      <MobileOnly>
        <div className={styles.mobileColumn}>
          <UsageBatchList
            layout="cards"
            items={listItems}
            onAmountChange={changeAmount}
            onRemove={remove}
            disabled={busy}
            addAction={
              <ReagentAdd onClick={() => setSheetOpen(true)} disabled={busy || remaining <= 0} expanded={sheetOpen} controls={sheetOpen ? sheetId : undefined} />
            }
          />
          <UsageDate value={usedOn} max={entry.today} disabled={busy} error={dateError} onChange={(v) => { setUsedOn(v); clearErrors(); }} />
          {classSelect}
          <TextInput
            label="메모"
            name="memo"
            autoComplete="off"
            placeholder={USAGE_BATCH_TEXT.memoPlaceholder}
            maxLength={USAGE_MEMO_MAX}
            value={memo}
            disabled={busy}
            error={memoError}
            onChange={(e) => {
              setMemo(e.target.value);
              clearErrors();
            }}
          />
        </div>
        <BottomBar className={styles.mobileBar}>
          {past ? <PastDateNote>{pastDateNoteText(usedOn)}</PastDateNote> : null}
          {saveButton}
        </BottomBar>
        {sheetOpen ? (
          <ReagentPickerSheet
            id={sheetId}
            reagents={pickerReagents}
            recentIds={entry.recentIds}
            addedIds={addedIds}
            remaining={remaining}
            onAdd={(ids) => {
              addIds(ids);
              setSheetOpen(false);
            }}
            onClose={() => setSheetOpen(false)}
          />
        ) : null}
      </MobileOnly>

      {/* 데스크톱 (4-desktop): 가운데 640 — 검색 칸 + 드롭다운 → data-table → 공통 칸, 아래 고정 bottom-bar */}
      <DesktopOnly>
        <PageColumn barSpace>
          <div ref={searchGroupRef} className={styles.searchGroup} data-name="search-group">
            <ReagentAdd
              variant="search"
              inputRef={searchRef}
              value={query}
              expanded={dropOpen}
              controls={dropOpen ? dropdownId : undefined}
              disabled={busy}
              onChange={(v) => {
                setQuery(v);
                openDropdown();
              }}
              onPress={openDropdown}
              onFocus={() => {
                if (skipFocusOpen.current) {
                  skipFocusOpen.current = false;
                  return;
                }
                openDropdown();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
                if (e.key === "Escape" && dropOpen) {
                  e.preventDefault();
                  setDropOpen(false);
                }
              }}
            />
            {dropOpen ? (
              <ReagentPickerDropdown
                id={dropdownId}
                reagents={pickerReagents}
                recentIds={entry.recentIds}
                addedIds={addedIds}
                remaining={remaining}
                query={query}
                sessionIds={sessionIds}
                onToggle={toggleFromDropdown}
                onClose={() => {
                  setDropOpen(false);
                  setQuery("");
                  skipFocusOpen.current = true;
                  searchRef.current?.focus({ preventScroll: true });
                  // 이미 포커스가 있어 focus 이벤트가 오지 않았으면 표시를 지운다
                  window.requestAnimationFrame(() => {
                    skipFocusOpen.current = false;
                  });
                }}
              />
            ) : null}
          </div>
          <UsageBatchList layout="table" items={listItems} onAmountChange={changeAmount} onRemove={remove} disabled={busy} />
          <div className={styles.commonFields} data-name="common-fields">
            <div className={styles.formRow}>
              <UsageDate
                className={styles.rowField}
                value={usedOn}
                max={entry.today}
                disabled={busy}
                error={dateError}
                onChange={(v) => {
                  setUsedOn(v);
                  clearErrors();
                }}
              />
            </div>
            {classSelect}
            <div className={styles.formRow} data-name="memo-row">
              <TextInput
                className={styles.rowField}
                label="메모"
                name="memo"
                autoComplete="off"
                placeholder={USAGE_BATCH_TEXT.memoPlaceholder}
                maxLength={USAGE_MEMO_MAX}
                value={memo}
                disabled={busy}
                error={memoError}
                onChange={(e) => {
                  setMemo(e.target.value);
                  clearErrors();
                }}
              />
            </div>
          </div>
        </PageColumn>
        <BottomBar
          start={
            past ? (
              <PastDateNote>{pastDateNoteText(usedOn)}</PastDateNote>
            ) : (
              <span className={styles.summary}>{batchHeading(items.length)}</span>
            )
          }
        >
          {saveButton}
        </BottomBar>
      </DesktopOnly>

      {toast ? (
        <Toast key={toast.key} floating>
          {toast.text}
        </Toast>
      ) : null}
    </form>
  );
}
