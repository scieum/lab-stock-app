"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ButtonOutline } from "@/components/button-outline";
import { ButtonPrimary } from "@/components/button-primary";
import { DocIntakeTable } from "@/components/doc-intake-table";
import { DocUpload } from "@/components/doc-upload";
import { EmptyStateCard } from "@/components/ex-empty-state-card";
import { Toast } from "@/components/ex-toast";
import { IntakeMode, type IntakeMode as IntakeModeValue } from "@/components/intake-mode";
import { LocationSuggest } from "@/components/location-suggest";
import { BottomBar, PageColumn, PageHead } from "@/components/page-frame";
import { createManualUploadFile, releaseManualUploadFile, type ManualUploadFile } from "@/components/manual-upload/file";
import { ReagentRegister, type ReagentRegisterValues } from "@/components/reagent-register";
import { SegmentedControl } from "@/components/segmented-control";
import { StockIntake, type IntakeReagent, type StockIntakeValues } from "@/components/stock-intake";
import { DesktopOnly } from "@/components/viewport-only";
import {
  DOC_TEXT,
  buildDocRows,
  defaultDocIntakeDate,
  docIntakeDoneText,
  normalizeDocExtraction,
  patchDocRow,
  planDocIntake,
  type DocExtraction,
  type DocRow,
  type DocRowPatch,
} from "@/lib/doc-intake-rules";
import { INTAKE_UNITS, STORAGE_CLASSES } from "@/lib/intake-rules";
import { MANUAL_FILE_ERRORS, validateManualFile } from "@/lib/manual-rules";
import type { LocationSuggestEntry } from "@/lib/supabase/location-suggest";
import { placeSuggestedAction, recordDocumentIntakeAction, recordIntakeAction, registerReagentAction } from "./actions";
import styles from "./intake.module.css";

type Tab = "intake" | "register";

const TABS: { value: Tab; label: string }[] = [
  { value: "intake", label: "기존 시약 입고" },
  { value: "register", label: "새 시약 등록" },
];
const STORAGE_CLASS_OPTIONS = [...STORAGE_CLASSES];
const UNIT_OPTIONS = [...INTAKE_UNITS];
/** 저장 후 토스트를 보여 주는 시간 — 지나면 화면 2(/reagents)로 간다 */
const TOAST_MS = 1500;
const AFTER_SAVE = "/reagents";
const PLACE_FAILED = "저장하지 못했어요. 잠시 후 다시 시도해 주세요";
const SAVE_FAILED = "저장하지 못했어요. 잠시 후 다시 시도해 주세요";
const EXTRACT_URL = "/api/intake/extract";

/** 서류로 입고 단계: 올리기 → 읽는 중 → 확인 표 / 품목 0개 */
type DocStep = "upload" | "processing" | "review" | "empty";

/** 추출 API 응답 → 정리된 추출 결과 / 오류 문구 (모양이 다르면 실패) */
function readExtractBody(body: unknown): { extraction: DocExtraction } | { error: string } {
  if (body !== null && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (b.ok === true) {
      const extraction = normalizeDocExtraction(b);
      if (extraction) return { extraction };
    }
    if (b.ok === false && typeof b.error === "string" && b.error.trim() !== "") return { error: b.error };
  }
  return { error: DOC_TEXT.failed };
}

/** 등록 직후 위치 추천 상태 (d7 §17) — 시약마다 추천 칸 + 넣었는지 */
type SuggestState = { items: (LocationSuggestEntry & { placed: boolean })[] };

type Props = {
  /** 자기 학교 시약 (이름순) */
  reagents: IntakeReagent[];
  /** 입고일 기본값 (Asia/Seoul, YYYY-MM-DD) */
  today: string;
  /** 맨 위 intake-mode 처음 값 (기본 = 서류로 입고, ?mode=direct·?tab·?reagent = 직접 입력) */
  initialMode?: IntakeModeValue;
  initialTab: Tab;
  /** ?reagent 로 들어온 자기 학교 시약 */
  initialReagentId?: string;
};

/**
 * 화면 7 입고·시약 등록.
 * 맨 위 intake-mode(디자인 1.17, d7 §21): "직접 입력 / 서류로 입고", 기본 = 서류로 입고.
 * 서류로 입고: doc-upload(파일 → "AI로 읽기" → 읽는 중) → doc-intake-table(확인·고치기) → "확인 후 입고"
 *   = record_document_intake 한 번(한 트랜잭션) → ex-toast "{N}개 품목을 입고했어요"
 *   → 새 시약이 있고 시약장이 있으면 location-suggest(여러 개 + "모두 추천대로"), 아니면 화면 2.
 *   품목 0개 = ex-empty-state-card "서류에서 품목을 찾지 못했어요" + [직접 입력] + "다른 파일 올리기".
 *   파일은 추출 요청에만 싣고 어디에도 보관하지 않는다. 확인하기 전에는 아무것도 저장하지 않는다.
 * 직접 입력: 지금까지의 갈래 그대로 — segmented-control(기존 시약 입고 / 새 시약 등록) → 고른 갈래 하나만.
 *   저장 성공 → ex-toast → 화면 2. 새 시약 등록 성공(d7 §17): 시약장이 있으면 location-suggest.
 */
export function IntakeScreen({ reagents, today, initialMode = "doc", initialTab, initialReagentId }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<IntakeModeValue>(initialMode);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [suggest, setSuggest] = useState<SuggestState | null>(null);
  const [placing, setPlacing] = useState<{ id: string | null; all: boolean } | null>(null);
  const [placeError, setPlaceError] = useState<string | null>(null);
  /** 토스트 뒤 화면 2 로 갈지 (위치 추천 중에는 가지 않는다) */
  const [leaving, setLeaving] = useState(false);
  const inFlight = useRef(false);
  // ---- 서류로 입고 (d7 §21) ----
  const [docStep, setDocStep] = useState<DocStep>("upload");
  const [picked, setPicked] = useState<{ raw: File; view: ManualUploadFile } | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [docRows, setDocRows] = useState<DocRow[]>([]);
  const [docDate, setDocDate] = useState(today);
  const [docSaveError, setDocSaveError] = useState<string | null>(null);
  const viewRef = useRef<ManualUploadFile | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // 저장이 끝나 화면 2로 넘어가는 동안에도 다시 제출하지 못하게 잠근다
  const busy = pending || toast !== null;

  // 화면을 떠날 때: 진행 중인 추출 요청을 끊고 미리보기 주소를 푼다
  useEffect(
    () => () => {
      abortRef.current?.abort();
      abortRef.current = null;
      releaseManualUploadFile(viewRef.current);
      viewRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => router.push(AFTER_SAVE), TOAST_MS);
    return () => clearTimeout(t);
  }, [leaving, router]);

  const changeTab = (next: Tab) => {
    if (busy) return;
    setError(null);
    setTab(next);
  };

  const changeMode = (next: IntakeModeValue) => {
    if (busy || docStep === "processing") return;
    setError(null);
    setMode(next);
  };

  /* ───────── 서류로 입고 ───────── */

  const replaceFile = (next: { raw: File; view: ManualUploadFile } | null) => {
    releaseManualUploadFile(viewRef.current);
    viewRef.current = next?.view ?? null;
    setPicked(next);
  };

  const onDocFile = (file: File) => {
    if (docStep === "processing" || busy) return;
    const fileError = validateManualFile(file);
    const view = fileError ? null : createManualUploadFile(file);
    if (fileError || !view) {
      replaceFile(null);
      setDocError(fileError ?? MANUAL_FILE_ERRORS.type);
      return;
    }
    replaceFile({ raw: file, view });
    setDocError(null);
  };

  /** "AI로 읽기" — 파일을 추출 요청에만 싣는다 (어디에도 저장하지 않는다) */
  const readDoc = async () => {
    if (!picked || abortRef.current || busy) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setDocError(null);
    setDocSaveError(null);
    setDocStep("processing");

    const form = new FormData();
    form.append("file", picked.raw, picked.raw.name);
    let outcome: { extraction: DocExtraction } | { error: string };
    try {
      const res = await fetch(EXTRACT_URL, { method: "POST", body: form, signal: controller.signal, cache: "no-store" });
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      outcome = readExtractBody(body);
      // 2xx 가 아닌데 ok:true 모양이 올 일은 없지만, 오면 실패로 본다
      if (!res.ok && "extraction" in outcome) outcome = { error: DOC_TEXT.failed };
    } catch {
      if (controller.signal.aborted) return;
      outcome = { error: DOC_TEXT.network };
    }
    if (abortRef.current !== controller) return;
    abortRef.current = null;

    if ("error" in outcome) {
      // 실패: 올리기 단계로 (파일 유지) + 서버 문구
      setDocError(outcome.error);
      setDocStep("upload");
      return;
    }
    if (outcome.extraction.items.length === 0) {
      replaceFile(null);
      setDocRows([]);
      setDocStep("empty");
      return;
    }
    setDocRows(buildDocRows(outcome.extraction, reagents));
    setDocDate(defaultDocIntakeDate(outcome.extraction.docDate, today));
    setDocStep("review");
  };

  const cancelRead = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setDocStep("upload");
  };

  const restartDoc = () => {
    if (busy) return;
    setDocRows([]);
    setDocSaveError(null);
    setDocError(null);
    setDocStep("upload");
  };

  const changeDocRow = (id: string, patch: DocRowPatch) => {
    setDocSaveError(null);
    setDocRows((prev) => prev.map((r) => (r.id === id ? patchDocRow(r, patch, reagents) : r)));
  };

  const docPlan = planDocIntake(docRows, reagents, docDate, today);

  const submitDoc = () => {
    if (busy || !docPlan.canSave) return;
    setDocSaveError(null);
    const items = docPlan.items;
    startTransition(async () => {
      const res = await recordDocumentIntakeAction({ intakeDate: docDate, items }).catch(() => null);
      if (!res) {
        setDocSaveError(SAVE_FAILED);
        return;
      }
      if (!res.ok) {
        setDocSaveError(res.error);
        return;
      }
      setToast(docIntakeDoneText(res.intakeCount));
      // 새 시약이 있고 시약장이 있으면 위치 추천 (d7 §17·§21), 없으면 화면 2
      if (res.suggest && res.suggest.hasCabinets && res.suggest.items.length > 0) {
        setSuggest({ items: res.suggest.items.map((i) => ({ ...i, placed: false })) });
      } else {
        setLeaving(true);
      }
    });
  };

  /* ───────── 직접 입력 ───────── */

  const submitIntake = (values: StockIntakeValues) => {
    if (busy) return;
    setError(null);
    startTransition(async () => {
      const res = await recordIntakeAction(values);
      if (res.ok) {
        setToast("입고를 기록했어요");
        setLeaving(true);
      } else setError(res.error);
    });
  };

  const submitRegister = (values: ReagentRegisterValues) => {
    if (busy) return;
    setError(null);
    startTransition(async () => {
      const res = await registerReagentAction(values);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setToast("시약을 등록했어요");
      // 시약장이 있으면 위치 추천 (d7 §17), 없으면 지금처럼 화면 2
      if (res.suggest && res.suggest.hasCabinets && res.suggest.items.length > 0) {
        setSuggest({ items: res.suggest.items.map((i) => ({ ...i, placed: false })) });
      } else {
        setLeaving(true);
      }
    });
  };

  const place = (ids: string[], all: boolean) => {
    if (!suggest || inFlight.current || leaving) return;
    const targets = suggest.items.filter((i) => ids.includes(i.id) && i.suggestion && !i.placed);
    if (targets.length === 0) return;
    inFlight.current = true;
    setPlaceError(null);
    setPlacing({ id: all ? null : targets[0].id, all });
    startTransition(async () => {
      try {
        const res = await placeSuggestedAction({
          items: targets.map((t) => ({ reagentId: t.id, slotId: t.suggestion!.slotId })),
        }).catch(() => null);
        if (!res) {
          setPlaceError(PLACE_FAILED);
          return;
        }
        const next = suggest.items.map((i) => (res.placed.includes(i.id) ? { ...i, placed: true } : i));
        setSuggest({ items: next });
        if (res.error) setPlaceError(res.error);
        // 추천 칸이 있는 시약을 모두 뒀으면 토스트 뒤 화면 2
        if (next.every((i) => !i.suggestion || i.placed)) {
          setToast(next.filter((i) => i.placed).length > 1 ? "추천 위치에 모두 뒀어요" : "보관 위치를 정했어요");
          setLeaving(true);
        }
      } finally {
        inFlight.current = false;
        setPlacing(null);
      }
    });
  };

  const head = <PageHead title="입고" mobileTitle="입고·시약 등록" />;

  if (suggest) {
    return (
      <div className={styles.page}>
        {head}
        {toast ? <Toast>{toast}</Toast> : null}
        <PageColumn barSpace>
          <LocationSuggest
            items={suggest.items.map((i) => ({
              id: i.id,
              name: i.name,
              storageClass: i.storageClass,
              suggestion: i.suggestion ? { cabinetNumber: i.suggestion.cabinetNumber, text: i.suggestion.text } : null,
              placed: i.placed,
            }))}
            otherHref={(id) => `/reagents/${id}?pick=location`}
            onPlace={(id) => place([id], false)}
            onPlaceAll={() => place(suggest.items.map((i) => i.id), true)}
            onLater={() => router.push(AFTER_SAVE)}
            pendingId={placing && !placing.all ? placing.id : null}
            pendingAll={Boolean(placing?.all) || leaving}
            error={placeError}
            bar
          />
        </PageColumn>
      </div>
    );
  }

  const reviewing = mode === "doc" && docStep === "review";

  return (
    <div className={styles.page} data-mode={mode}>
      {head}
      <PageColumn wide={reviewing} barSpace={mode === "doc"}>
        <IntakeMode className={styles.mode} value={mode} onChange={changeMode} disabled={busy || docStep === "processing"} />
        {mode === "doc" ? (
          <div className={[styles.docColumn, reviewing ? styles.reviewing : ""].filter(Boolean).join(" ")}>
            {reviewing ? (
              <>
                <DocIntakeTable
                  rows={docRows}
                  reagents={reagents}
                  intakeDate={docDate}
                  today={today}
                  onDateChange={(d) => {
                    setDocSaveError(null);
                    setDocDate(d);
                  }}
                  onRowChange={changeDocRow}
                  onRestart={restartDoc}
                  disabled={busy}
                />
                <BottomBar
                  className={styles.docActions}
                  note={
                    docSaveError ? (
                      <p role="alert" className={styles.docError}>
                        {docSaveError}
                      </p>
                    ) : docPlan.blockReason ? (
                      <p role="status" className={styles.docReason}>
                        {docPlan.blockReason}
                      </p>
                    ) : null
                  }
                >
                  <ButtonPrimary className={styles.docSubmit} disabled={!docPlan.canSave || busy} onClick={submitDoc}>
                    {pending ? "저장 중…" : DOC_TEXT.submit}
                  </ButtonPrimary>
                </BottomBar>
              </>
            ) : (
              <>
                {docStep === "empty" ? (
                  <EmptyStateCard variant="outlined" icon="upload" title={DOC_TEXT.emptyTitle} description={DOC_TEXT.emptyBody}>
                    <ButtonOutline onClick={() => changeMode("direct")}>{DOC_TEXT.modeDirect}</ButtonOutline>
                  </EmptyStateCard>
                ) : null}
                <DocUpload
                  file={picked?.view ?? null}
                  heading={docStep === "empty" ? DOC_TEXT.uploadAgainHeading : DOC_TEXT.uploadHeading}
                  processing={docStep === "processing"}
                  error={docError}
                  disabled={busy}
                  desktopBar
                  onFileChange={onDocFile}
                  onRead={() => void readDoc()}
                  onCancel={cancelRead}
                />
                {/* 데스크톱: "AI로 읽기"는 아래 고정 bottom-bar (시안 7-desktop · 7-doc-upload · 7-doc-fail). 모바일은 카드 안 그대로 */}
                <DesktopOnly>
                  <BottomBar>
                    <ButtonPrimary disabled={!picked || busy || docStep === "processing"} onClick={() => void readDoc()}>
                      {DOC_TEXT.read}
                    </ButtonPrimary>
                  </BottomBar>
                </DesktopOnly>
              </>
            )}
          </div>
        ) : (
          <>
            <div className={styles.segment}>
              <SegmentedControl
                label="직접 입력 갈래"
                options={TABS}
                value={tab}
                onChange={(v) => changeTab(v === "register" ? "register" : "intake")}
              />
            </div>
            {tab === "intake" ? (
              <StockIntake
                reagents={reagents}
                defaultIntakeDate={today}
                defaultSelectedId={initialReagentId}
                onSubmit={submitIntake}
                pending={busy}
                error={error}
                onRegisterNew={() => changeTab("register")}
              />
            ) : (
              <ReagentRegister
                storageClasses={STORAGE_CLASS_OPTIONS}
                units={UNIT_OPTIONS}
                defaultIntakeDate={today}
                onSubmit={submitRegister}
                pending={busy}
                error={error}
                findMsds
              />
            )}
          </>
        )}
      </PageColumn>
      {toast ? <Toast floating>{toast}</Toast> : null}
    </div>
  );
}
