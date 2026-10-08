"use client";

import { useId, useRef, useState } from "react";
import { MsdsCandidates } from "@/components/msds-candidates";
import { SheetAnchor } from "@/components/sheet-panel";
import { MsdsSearch } from "@/components/msds-search";
import { StorageClassChip } from "@/components/storage-class-chip";
import { SuggestBadge } from "@/components/suggest-badge";
import { TextInput, TextInputSelect } from "@/components/text-input";
import { DOC_UNITS, type DocUnit, type NewReagentDraft } from "@/lib/doc-intake-rules";
import { STORAGE_CLASSES } from "@/lib/intake-rules";
import { useMsdsSearch } from "@/lib/use-msds-search";
import styles from "./styles.module.css";

export type NewReagentPatch = Partial<Pick<NewReagentDraft, "name" | "storageClass" | "unit" | "stock" | "msdsUrl">>;

type Props = {
  /** 서류 품명 (읽기 도구 이름) */
  itemName: string;
  value: NewReagentDraft;
  onChange?: (patch: NewReagentPatch) => void;
  /** 이 행의 오류 문구 (planDocIntake) */
  error?: string | null;
  disabled?: boolean;
  /**
   * MSDS 찾기 (msds-search → msds-candidates 시트, d7 §20). false 면 버튼 없이 직접 입력만 (갤러리 정적 상태).
   */
  findMsds?: boolean;
  className?: string;
};

const NO_MSDS = "아직 없어요";

/**
 * 서류 입고의 새 시약 칸 (디자인 1.17 new-reagent-fields — 7-doc-review · 7-msds, d7 §21).
 * "새 시약으로 등록"을 고른 행 아래로 펼쳐진다(위 여백 12, 사이 12):
 * 이름(기본 = 규격을 뗀 품명) → 보관 분류 칩 8종(AI 추천 분류가 처음 선택 + 그 옆 suggest-badge "추천")
 * → 단위(병·mL·g, 규격에서 추정) · 재고량(입고량 규칙) 두 칸 → MSDS("아직 없어요" + msds-search "MSDS 찾기" · 직접 입력).
 * 저장하지 않는다 — onChange 로 값만 넘긴다.
 */
export function NewReagentFields({ itemName, value, onChange, error, disabled = false, findMsds = true, className }: Props) {
  const classLabelId = useId();
  const msdsLabelId = useId();
  const msdsRef = useRef<HTMLDivElement>(null);
  const [direct, setDirect] = useState(false);
  const [finding, setFinding] = useState(false);
  const [query, setQuery] = useState("");
  const msds = useMsdsSearch();
  const name = value.name.trim();
  const showUrl = direct || value.msdsUrl.trim() !== "";

  const openFinder = () => {
    if (!name) return;
    setQuery(name);
    setFinding(true);
    void msds.search(name);
  };
  const closeFinder = () => {
    setFinding(false);
    msds.reset();
  };
  const openDirect = () => {
    closeFinder();
    setDirect(true);
    // 다음 그리기 뒤 주소 칸으로
    requestAnimationFrame(() => msdsRef.current?.querySelector("input")?.focus());
  };

  return (
    <div
      data-component="new-reagent-fields"
      className={[styles.root, className ?? ""].filter(Boolean).join(" ")}
      role="group"
      aria-label={`${itemName} 새 시약`}
    >
      <TextInput
        className={styles.name}
        label="이름"
        labelTone="strong"
        autoComplete="off"
        maxLength={80}
        value={value.name}
        disabled={disabled}
        onChange={(e) => onChange?.({ name: e.target.value })}
      />
      <div className={[styles.field, styles.classes].join(" ")} role="group" aria-labelledby={classLabelId}>
        <span id={classLabelId} className={styles.label}>
          보관 분류
        </span>
        <div className={styles.chips} data-name="storage-class-chips">
          {STORAGE_CLASSES.map((c) => (
            <span key={c} className={styles.chipSlot}>
              <StorageClassChip
                label={c}
                selected={value.storageClass === c}
                disabled={disabled}
                onToggle={() => onChange?.({ storageClass: value.storageClass === c ? "" : c })}
              />
              {value.suggestedClass === c ? <SuggestBadge /> : null}
            </span>
          ))}
        </div>
      </div>

      <div className={styles.pair} data-name="field-pair">
        <TextInputSelect
          className={styles.unit}
          label="단위"
          options={DOC_UNITS.map((u) => ({ value: u, label: u }))}
          value={value.unit}
          disabled={disabled}
          onChange={(e) => {
            const u = e.target.value;
            if ((DOC_UNITS as readonly string[]).includes(u)) onChange?.({ unit: u as DocUnit });
          }}
        />
        <TextInput
          className={styles.stock}
          label="재고량"
          labelTone="strong"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          unit={value.unit}
          unitTone="plain"
          value={value.stock}
          disabled={disabled}
          onChange={(e) => onChange?.({ stock: e.target.value })}
        />
      </div>
      <div className={[styles.field, styles.msds].join(" ")} data-name="msds-field" role="group" aria-labelledby={msdsLabelId}>
        <span id={msdsLabelId} className={styles.label}>
          MSDS
        </span>
        <div className={styles.msdsRow} data-name="msds-row" ref={msdsRef}>
          {showUrl ? (
            <TextInput
              className={styles.msdsInput}
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://"
              aria-label={`${itemName} MSDS 주소`}
              value={value.msdsUrl}
              disabled={disabled}
              onChange={(e) => onChange?.({ msdsUrl: e.target.value })}
            />
          ) : (
            <span className={styles.msdsCaption}>{NO_MSDS}</span>
          )}
          {findMsds ? (
            <MsdsSearch
              size="sm"
              onClick={openFinder}
              disabled={name === "" || disabled}
              aria-expanded={finding}
              title={name === "" ? "이름을 먼저 입력하세요" : undefined}
            />
          ) : null}
          {showUrl ? null : (
            <button type="button" className={styles.direct} disabled={disabled} onClick={openDirect}>
              직접 입력
            </button>
          )}
        </div>
      </div>

      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}

      {findMsds && finding ? (
        <SheetAnchor
          placement="above"
          avoidBottomBar
          anchor={() => msdsRef.current?.querySelector<HTMLElement>('[data-component="msds-search"]') ?? msdsRef.current}
        >
          <MsdsCandidates
            caption={name}
            query={query}
            onQueryChange={setQuery}
            onSearch={() => void msds.search(query)}
            status={msds.state.status}
            candidates={msds.state.status === "ready" ? msds.state.candidates : undefined}
            searchedAs={msds.state.status === "ready" ? msds.state.searchedAs : null}
            searchedVia={msds.state.status === "ready" ? msds.state.searchedVia : null}
            searchedQuery={msds.state.status === "idle" ? undefined : msds.state.query}
            message={msds.state.status === "error" ? msds.state.message : undefined}
            onRetry={() => void msds.search(query)}
            onConfirm={(c) => {
              onChange?.({ msdsUrl: c.msdsUrl });
              closeFinder();
            }}
            onDirect={openDirect}
            onClose={closeFinder}
          />
        </SheetAnchor>
      ) : null}
    </div>
  );
}
