"use client";

import { useState } from "react";
import { ClassFilterButton } from "@/components/class-filter";
import { ClassSelect, EMPTY_CLASS_DRAFT, type ClassDraft } from "@/components/class-select";
import { ReagentAdd } from "@/components/reagent-add";
import { ReagentDelete, ReagentDeleteConfirm } from "@/components/reagent-delete";
import { ReagentMoreMenu } from "@/components/reagent-more-menu";
import { ReagentPickerDropdown, ReagentPickerSheet } from "@/components/reagent-picker";
import { UsageBatchList, type BatchListItem } from "@/components/usage-batch-list";
import { EMPTY_CLASS_FILTER, type ClassFilter, type ClassInfo } from "@/lib/class-info";

export const SAMPLE_REAGENTS = [
  { id: "r-ethanol", name: "에탄올", stock: 1200, unit: "mL" },
  { id: "r-phenol", name: "페놀프탈레인 용액", stock: 120, unit: "mL" },
  { id: "r-naoh", name: "수산화나트륨", stock: 500, unit: "g" },
  { id: "r-hcl", name: "염산", stock: 50, unit: "mL" },
  { id: "r-water", name: "증류수", stock: 5000, unit: "mL" },
  { id: "r-agno3", name: "질산은", stock: 25, unit: "g" },
];

export const SAMPLE_RECENT_CLASSES: ClassInfo[] = [
  { grade: 1, classNo: 2, subject: "통합과학" },
  { grade: 1, classNo: 3, subject: "통합과학" },
  { grade: 2, classNo: 1, subject: "화학" },
];

const RECENT_IDS = ["r-ethanol", "r-phenol", "r-naoh"];

/** reagent-picker 모바일 바텀시트 (제자리) — 4-picker-mobile: 에탄올 담음 · 2개 고름 */
export function PickerSheetDemo() {
  const [log, setLog] = useState<string | null>(null);
  return (
    <>
      <ReagentPickerSheet
        sheet={false}
        reagents={SAMPLE_REAGENTS}
        recentIds={RECENT_IDS}
        addedIds={new Set(["r-ethanol"])}
        initialSelected={["r-phenol", "r-naoh"]}
        onAdd={(ids) => setLog(`${ids.length}개 담기`)}
        onClose={() => setLog("닫기")}
      />
      {log ? <p role="status">{log}</p> : null}
    </>
  );
}

/** reagent-add 검색 칸 + reagent-picker 드롭다운 — 4-picker-desktop */
export function PickerDropdownDemo() {
  const [query, setQuery] = useState("");
  const [session, setSession] = useState<Set<string>>(new Set(["r-phenol", "r-naoh"]));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
      <ReagentAdd variant="search" value={query} onChange={setQuery} expanded />
      <ReagentPickerDropdown
        reagents={SAMPLE_REAGENTS}
        recentIds={RECENT_IDS}
        addedIds={new Set(["r-ethanol", ...session])}
        sessionIds={session}
        query={query}
        onToggle={(id) =>
          setSession((cur) => {
            const next = new Set(cur);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })
        }
        onClose={() => setQuery("")}
      />
    </div>
  );
}

/** usage-batch-list (카드 / 표) — 사용량을 바꿔 보면 재고 초과 · 빈 값 오류가 보인다 */
export function BatchListDemo({ layout, error = false, empty = false }: { layout: "cards" | "table"; error?: boolean; empty?: boolean }) {
  const [items, setItems] = useState<BatchListItem[]>(
    empty
      ? []
      : [
          { ...SAMPLE_REAGENTS[0], amount: "50" },
          { ...SAMPLE_REAGENTS[1], amount: error ? "150" : "10" },
          { ...SAMPLE_REAGENTS[2], amount: error ? "" : "5" },
        ],
  );
  return (
    <UsageBatchList
      layout={layout}
      items={items}
      showEmptyErrors={error}
      onAmountChange={(id, v) => setItems((cur) => cur.map((i) => (i.id === id ? { ...i, amount: v } : i)))}
      onRemove={(id) => setItems((cur) => cur.filter((i) => i.id !== id))}
      addAction={<ReagentAdd onClick={() => undefined} />}
    />
  );
}

/** class-select — 최근 칩을 누르면 세 칸이 채워진다 */
export function ClassSelectDemo({ filled = false }: { filled?: boolean }) {
  const [value, setValue] = useState<ClassDraft>(filled ? { grade: 1, classNo: 2, subject: "통합과학" } : EMPTY_CLASS_DRAFT);
  return <ClassSelect value={value} onChange={setValue} maxGrade={3} recent={SAMPLE_RECENT_CLASSES} />;
}

/** class-filter — 학년 → 반 (제자리 열림) */
export function ClassFilterDemo({ open = false }: { open?: boolean }) {
  const [value, setValue] = useState<ClassFilter>(open ? { grade: 1, classNo: null } : EMPTY_CLASS_FILTER);
  return <ClassFilterButton value={value} onChange={setValue} maxGrade={3} defaultOpen={open} inline={open} />;
}

/** reagent-more-menu + reagent-delete (열린 메뉴) */
export function MoreMenuDemo({ open = false }: { open?: boolean }) {
  const [log, setLog] = useState<string | null>(null);
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", minHeight: open ? "calc(var(--button-min-height) * 3)" : undefined }}>
      <ReagentMoreMenu label="과산화수소 더보기" defaultOpen={open}>
        <ReagentDelete onSelect={() => setLog("시약 삭제 → 확인 모달")} />
      </ReagentMoreMenu>
      {log ? <p role="status">{log}</p> : null}
    </div>
  );
}

/** 시약 삭제 확인 (제자리) — 3-delete */
export function DeleteConfirmDemo() {
  const [log, setLog] = useState<string | null>(null);
  return (
    <>
      <ReagentDeleteConfirm name="과산화수소" sheet={false} modal={false} onCancel={() => setLog("취소")} onConfirm={() => setLog("삭제")} />
      {log ? <p role="status">{log}</p> : null}
    </>
  );
}
