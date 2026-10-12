"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ButtonOutline } from "@/components/button-outline";
import { ButtonPrimary } from "@/components/button-primary";
import { SensorDocTable, type SensorDocRowPatch, type SensorDocSlot } from "@/components/doc-intake-table/sensor";
import { DocUpload } from "@/components/doc-upload";
import { EmptyStateCard } from "@/components/ex-empty-state-card";
import type { LocationPickerCabinet } from "@/components/location-picker";
import { createManualUploadFile, releaseManualUploadFile, type ManualUploadFile } from "@/components/manual-upload/file";
import { BottomBar } from "@/components/page-frame";
import { SensorDocAdd } from "@/components/sensor-doc-add";
import { DesktopOnly } from "@/components/viewport-only";
import { DOC_TEXT } from "@/lib/doc-intake-rules";
import { clearFlashToast, setFlashToast } from "@/lib/flash-toast";
import { MANUAL_FILE_ERRORS, validateManualFile } from "@/lib/manual-rules";
import {
  SENSOR_DOC_TEXT,
  buildSensorDocRows,
  normalizeSensorDocExtraction,
  planSensorDoc,
  sensorDocDoneText,
  sensorDocSaveText,
  type SchoolSensor,
  type SensorDocExtraction,
  type SensorDocRow,
} from "@/lib/sensor-doc-rules";
import { setSensorHighlight } from "@/lib/sensor-highlight";
import { recordSensorDocumentAction } from "../actions";
import styles from "./doc.module.css";

const EXTRACT_URL = "/api/sensors/extract";
const AFTER_SAVE = "/sensors";
const DIRECT_HREF = "/sensors/new";
const SAVE_FAILED = "저장하지 못했어요. 잠시 후 다시 시도해 주세요";

/** 올리기 → 읽는 중 → 확인 표 / 0개 / 읽기 실패 */
type Step = "upload" | "processing" | "review" | "empty" | "failed";

/** 추출 API 응답 → 정리된 결과 / 오류 문구 */
function readExtractBody(body: unknown): { extraction: SensorDocExtraction } | { error: string } {
  if (body !== null && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (b.ok === true) {
      const extraction = normalizeSensorDocExtraction(b);
      if (extraction) return { extraction };
    }
    if (b.ok === false && typeof b.error === "string" && b.error.trim() !== "") return { error: b.error };
  }
  return { error: DOC_TEXT.failed };
}

function applyPatch(row: SensorDocRow, patch: SensorDocRowPatch): SensorDocRow {
  return {
    ...row,
    ...(patch.link ? { link: patch.link } : null),
    ...(patch.expanded !== undefined ? { expanded: patch.expanded } : null),
    ...(patch.isSensor !== undefined ? { isSensor: patch.isSensor } : null),
    ...(patch.draft
      ? {
          draft: {
            ...row.draft,
            ...patch.draft,
            // 사용자가 고친 칸은 "카탈로그" 표시를 뗀다
            catalogFilled: (row.draft.catalogFilled ?? []).filter((k) => !(k in patch.draft!)),
          },
        }
      : null),
  };
}

type Props = {
  /** 우리 학교 센서 (회사+모델 자동 연결 · 바꾸기 목록 · "지금 3개 → 5개") */
  sensors: SchoolSensor[];
  cabinets: LocationPickerCabinet[];
  slots: SensorDocSlot[];
};

/**
 * 화면 17 센서 서류로 등록 (rules 1.28 sensor.doc, d7 §28 — 화면 7 서류로 입고와 같은 흐름).
 * sensor-doc-add 머리 → doc-upload(파일 → "AI로 읽기" → 서류를 읽는 중) → POST /api/sensors/extract
 * → doc-intake-table 확인 표(sensor-link · new-sensor-fields · 센서 아님 묶음) → "확인 후 등록 · N개" = record_sensor_document 한 번
 * → 토스트 "센서 N개를 등록했어요" → 화면 17(바뀐 행 잠깐 highlight-soft).
 * 0개 = ex-empty-state-card "센서를 찾지 못했어요" + '직접 입력' + doc-upload, 읽기 실패 = "서류를 읽지 못했어요"(7-doc-fail 모양).
 * 파일은 추출 요청에만 싣고 어디에도 보관하지 않는다. 확인하기 전에는 아무것도 저장하지 않는다.
 * 모바일 = 전용 화면(아래 save-bar), 데스크톱 = 본문 페이지(아래 고정 bottom-bar).
 */
export function SensorDocScreen({ sensors, cabinets, slots }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [picked, setPicked] = useState<{ raw: File; view: ManualUploadFile } | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failMessage, setFailMessage] = useState<string | null>(null);
  const [rows, setRows] = useState<SensorDocRow[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [pending, startTransition] = useTransition();
  const viewRef = useRef<ManualUploadFile | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busy = pending || leaving;

  useEffect(
    () => () => {
      abortRef.current?.abort();
      abortRef.current = null;
      releaseManualUploadFile(viewRef.current);
      viewRef.current = null;
    },
    [],
  );

  const replaceFile = (next: { raw: File; view: ManualUploadFile } | null) => {
    releaseManualUploadFile(viewRef.current);
    viewRef.current = next?.view ?? null;
    setPicked(next);
  };

  const onFile = (file: File) => {
    if (step === "processing" || busy) return;
    const fileError = validateManualFile(file);
    const view = fileError ? null : createManualUploadFile(file);
    if (fileError || !view) {
      replaceFile(null);
      setError(fileError ?? MANUAL_FILE_ERRORS.type);
      return;
    }
    replaceFile({ raw: file, view });
    setError(null);
  };

  const read = async () => {
    if (!picked || abortRef.current || busy) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setSaveError(null);
    setStep("processing");
    const form = new FormData();
    form.append("file", picked.raw, picked.raw.name);
    let outcome: { extraction: SensorDocExtraction } | { error: string };
    try {
      const res = await fetch(EXTRACT_URL, { method: "POST", body: form, signal: controller.signal, cache: "no-store" });
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      outcome = readExtractBody(body);
      if (!res.ok && "extraction" in outcome) outcome = { error: DOC_TEXT.failed };
    } catch {
      if (controller.signal.aborted) return;
      outcome = { error: DOC_TEXT.network };
    }
    if (abortRef.current !== controller) return;
    abortRef.current = null;

    if ("error" in outcome) {
      // 읽기 실패 (7-doc-fail 모양): 파일은 그대로 두고 다시 읽을 수 있다
      setFailMessage(outcome.error);
      setStep("failed");
      return;
    }
    if (outcome.extraction.items.length === 0) {
      replaceFile(null);
      setRows([]);
      setStep("empty");
      return;
    }
    setFileName(picked.raw.name);
    setRows(buildSensorDocRows(outcome.extraction, sensors));
    setStep("review");
  };

  const cancelRead = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStep("upload");
  };

  const changeRow = (id: string, patch: SensorDocRowPatch) => {
    setSaveError(null);
    setRows((prev) => prev.map((r) => (r.id === id ? applyPatch(r, patch) : r)));
  };

  const plan = planSensorDoc(rows, sensors);

  const submit = () => {
    if (busy || !plan.canSave) return;
    setSaveError(null);
    const items = plan.items;
    const addedIds = items.flatMap((it) => (it.kind === "add" ? [it.sensorId] : []));
    startTransition(async () => {
      const res = await recordSensorDocumentAction({ items }).catch(() => null);
      if (!res) {
        setSaveError(SAVE_FAILED);
        return;
      }
      if (!res.ok) {
        setSaveError(res.error);
        return;
      }
      setLeaving(true);
      setFlashToast(sensorDocDoneText(res.addedCount || items.length));
      setSensorHighlight([...addedIds, ...res.newSensorIds]);
      try {
        router.push(AFTER_SAVE);
      } catch {
        clearFlashToast();
        setLeaving(false);
      }
    });
  };

  const reviewing = step === "review";
  const head = <SensorDocAdd variant="head" fileName={reviewing ? fileName : null} backHref={AFTER_SAVE} className={styles.head} />;

  if (reviewing) {
    return (
      <div className={styles.page} data-step={step}>
        {head}
        <div className={styles.review}>
          <SensorDocTable
            rows={rows}
            sensors={sensors}
            errors={plan.errors}
            cabinets={cabinets}
            slots={slots}
            disabled={busy}
            onRowChange={changeRow}
          />
        </div>
        <BottomBar
          className={styles.saveBar}
          note={
            saveError ? (
              <p role="alert" className={styles.note}>
                {saveError}
              </p>
            ) : plan.blockReason ? (
              <p role="status" className={styles.reason}>
                {plan.blockReason}
              </p>
            ) : null
          }
        >
          <ButtonPrimary className={styles.submit} disabled={!plan.canSave || busy} aria-busy={busy || undefined} onClick={submit}>
            {pending ? "저장 중…" : sensorDocSaveText(plan.count)}
          </ButtonPrimary>
        </BottomBar>
      </div>
    );
  }

  const failed = step === "empty" || step === "failed";

  return (
    <div className={styles.page} data-step={step}>
      {head}
      <div className={styles.column} data-name="doc-column">
        {failed ? (
          <EmptyStateCard
            variant="outlined"
            icon="upload"
            title={step === "empty" ? SENSOR_DOC_TEXT.emptyTitle : SENSOR_DOC_TEXT.failTitle}
            description={step === "empty" ? SENSOR_DOC_TEXT.emptyBody : (failMessage ?? DOC_TEXT.failed)}
          >
            <ButtonOutline href={DIRECT_HREF}>{SENSOR_DOC_TEXT.direct}</ButtonOutline>
          </EmptyStateCard>
        ) : null}
        <DocUpload
          file={picked?.view ?? null}
          heading={SENSOR_DOC_TEXT.uploadHeading}
          caption={SENSOR_DOC_TEXT.uploadCaption}
          readingTitle={SENSOR_DOC_TEXT.readingTitle}
          readingBody={SENSOR_DOC_TEXT.readingBody}
          processing={step === "processing"}
          error={error}
          disabled={busy}
          desktopBar
          onFileChange={onFile}
          onRead={() => void read()}
          onCancel={cancelRead}
        />
      </div>
      {/* 데스크톱: "AI로 읽기"는 아래 고정 bottom-bar (시안 17-doc-upload-desktop · 17-doc-fail-desktop). 모바일은 카드 안 */}
      <DesktopOnly>
        <BottomBar>
          <ButtonPrimary disabled={!picked || busy || step === "processing"} onClick={() => void read()}>
            {DOC_TEXT.read}
          </ButtonPrimary>
        </BottomBar>
      </DesktopOnly>
    </div>
  );
}
