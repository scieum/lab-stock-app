"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ButtonOutline } from "@/components/button-outline";
import { ButtonPrimary } from "@/components/button-primary";
import { Toast } from "@/components/ex-toast";
import { ExtractionTable, type ExtractionRowPatch } from "@/components/extraction-table";
import {
  ManualUpload,
  createManualUploadFile,
  releaseManualUploadFile,
  type ManualUploadFile,
} from "@/components/manual-upload";
import { BottomBar, PageColumn, PageHead } from "@/components/page-frame";
import { TextInput } from "@/components/text-input";
import {
  MANUAL_FILE_ERRORS,
  checkGroups,
  normalizeExtraction,
  planSave,
  validateManualFile,
  type ExtractedItem,
  type ExtractionRow,
  type ManualReagent,
} from "@/lib/manual-rules";
import { saveReorderBasisAction } from "./actions";
import styles from "./manual.module.css";

const EXTRACT_URL = "/api/manual/extract";
/** 저장 후 토스트를 보여 주는 시간 — 지나면 화면 6(/reorder)으로 간다 (화면 7 과 같다) */
const TOAST_MS = 1500;
const AFTER_SAVE = "/reorder";
const SAVED = "재주문 기준을 저장했어요";
const NETWORK_ERROR = "서버에 연결하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요";
const EXTRACT_FAILED = "AI 추출에 실패했어요. 잠시 후 다시 시도해 주세요";
const SAVE_FAILED = "저장하지 못했어요. 잠시 후 다시 시도해 주세요";
const EMPTY_TEXT = "시약을 찾지 못했어요. 다른 파일로 바꾸거나 다시 추출해 주세요";
const RETRY_CONFIRM = "다시 추출하면 고친 내용이 사라져요. 다시 추출할까요?";

type Step = "input" | "processing" | "result";

type Props = {
  /** 우리 학교 시약 (이름순) — 자동 연결·선택 칸·"기존 기준" 표시용 */
  reagents: ManualReagent[];
};

/** 추출 API 응답에서 items / error 만 꺼낸다 (모양이 다르면 실패로 본다) */
function readExtractBody(body: unknown): { items: ExtractedItem[] } | { error: string } {
  if (body !== null && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (b.ok === true && Array.isArray(b.items)) return { items: b.items as ExtractedItem[] };
    if (b.ok === false && typeof b.error === "string" && b.error.trim() !== "") return { error: b.error };
  }
  return { error: EXTRACT_FAILED };
}

/**
 * 화면 5 실험 매뉴얼.
 * 1단계: 파일(PDF·JPG·PNG, 4MB 이하) + 조 수 → "AI 추출" → 처리 중 → 2단계: 추출 결과 확인·고치기 → "확인 후 저장"
 * → ex-toast → 화면 6. 사용자가 "확인 후 저장"을 누르기 전에는 아무것도 저장하지 않는다.
 * 파일은 추출 요청에만 실어 보내고 어디에도 보관하지 않는다 (미리보기 주소는 화면을 떠날 때 푼다).
 * 추출 결과는 이 화면의 상태에만 있다 — 화면을 떠나면 사라진다.
 */
export function ManualScreen({ reagents }: Props) {
  const router = useRouter();
  const [picked, setPicked] = useState<{ raw: File; view: ManualUploadFile } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [groupsText, setGroupsText] = useState("");
  const [step, setStep] = useState<Step>("input");
  const [rows, setRows] = useState<ExtractionRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const viewRef = useRef<ManualUploadFile | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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
    if (!toast) return;
    const t = setTimeout(() => router.push(AFTER_SAVE), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast, router]);

  const groups = checkGroups(groupsText);
  const groupsValue = groups.ok ? groups.value : Number.NaN;
  const groupsError = groupsText.trim() === "" || groups.ok ? undefined : groups.error;
  const plan = planSave(rows, reagents, groupsValue);
  const saving = pending || toast !== null;
  const processing = step === "processing";

  const replaceFile = (next: { raw: File; view: ManualUploadFile } | null) => {
    releaseManualUploadFile(viewRef.current);
    viewRef.current = next?.view ?? null;
    setPicked(next);
  };

  const onFileChange = (file: File | null) => {
    if (step !== "input") return;
    if (!file) {
      replaceFile(null);
      setFileError(null);
      return;
    }
    const error = validateManualFile(file);
    const view = error ? null : createManualUploadFile(file);
    if (error || !view) {
      replaceFile(null);
      setFileError(error ?? MANUAL_FILE_ERRORS.type);
      return;
    }
    replaceFile({ raw: file, view });
    setFileError(null);
  };

  const extract = async () => {
    // 처리 중·저장 중에는 다시 보내지 않는다
    if (!picked || !groups.ok || abortRef.current || saving) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setFileError(null);
    setSaveError(null);
    setStep("processing");

    const form = new FormData();
    form.append("file", picked.raw, picked.raw.name);
    form.append("groups", String(groups.value));

    let outcome: { items: ExtractedItem[] } | { error: string };
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
      if (!res.ok && "items" in outcome) outcome = { error: EXTRACT_FAILED };
    } catch {
      if (controller.signal.aborted) return;
      outcome = { error: NETWORK_ERROR };
    }
    if (abortRef.current !== controller) return;
    abortRef.current = null;

    if ("error" in outcome) {
      // 실패: 1단계로 (파일·조 수 유지) + 서버 문구
      setRows([]);
      setDirty(false);
      setFileError(outcome.error);
      setStep("input");
      return;
    }
    setRows(normalizeExtraction(outcome.items, reagents));
    setDirty(false);
    setStep("result");
  };

  const retry = () => {
    if (dirty && !window.confirm(RETRY_CONFIRM)) return;
    void extract();
  };

  const close = () => {
    if (saving) return;
    setRows([]);
    setDirty(false);
    setSaveError(null);
    setStep("input");
  };

  const changeRow = (id: string, patch: ExtractionRowPatch) => {
    setSaveError(null);
    setDirty(true);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRow = (id: string) => {
    setSaveError(null);
    setDirty(true);
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const save = () => {
    if (saving || !plan.canSave) return;
    setSaveError(null);
    const items = plan.items;
    startTransition(async () => {
      try {
        const res = await saveReorderBasisAction({ items });
        if (res.ok) setToast(SAVED);
        else setSaveError(res.error);
      } catch {
        setSaveError(SAVE_FAILED);
      }
    });
  };

  return (
    <div className={styles.page} data-step={step}>
      <PageHead title="실험 매뉴얼" />
      <PageColumn barSpace>
        <div className={styles.layout}>
          <div className={styles.uploadColumn}>
            <ManualUpload
              variant="upload"
              file={picked?.view ?? null}
              error={fileError}
              processing={processing}
              // 2단계에서는 파일을 잠근다 — 바꾸려면 "닫기"로 1단계에 돌아간다 (실수로 추출 결과를 버리지 않게)
              disabled={step === "result"}
              onFileChange={onFileChange}
            />
            <TextInput
              label="조 수"
              unit="조"
              unitTone="plain"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={3}
              value={groupsText}
              disabled={processing || saving}
              error={groupsError}
              onChange={(e) => {
                setSaveError(null);
                setGroupsText(e.target.value);
              }}
            />
            {step !== "result" ? (
              <BottomBar className={styles.bottom} dataAttrs={{ "data-bottom-actions": "" }}>
                <div className={[styles.actions, styles.single].join(" ")}>
                  <ButtonPrimary fullWidth onClick={() => void extract()} disabled={!picked || !groups.ok || processing}>
                    AI 추출
                  </ButtonPrimary>
                </div>
              </BottomBar>
            ) : null}
          </div>
          {step === "result" ? (
            <div className={styles.resultColumn}>
              <ExtractionTable
                rows={rows}
                groups={groupsValue}
                reagents={reagents}
                disabled={saving}
                emptyText={EMPTY_TEXT}
                onClose={close}
                onRowChange={changeRow}
                onRowRemove={removeRow}
              />
              <BottomBar
                className={styles.bottom}
                dataAttrs={{ "data-bottom-actions": "" }}
                note={
                  saveError ? (
                    <p className={styles.error} role="alert" data-save-error>
                      {saveError}
                    </p>
                  ) : plan.blockReason ? (
                    <p className={styles.reason} role="status" data-save-block>
                      {plan.blockReason}
                    </p>
                  ) : null
                }
              >
                <div className={styles.actions}>
                  <ButtonOutline onClick={retry} disabled={saving || !groups.ok}>
                    다시 추출
                  </ButtonOutline>
                  <ButtonPrimary fullWidth onClick={save} disabled={saving || !plan.canSave}>
                    확인 후 저장
                  </ButtonPrimary>
                </div>
              </BottomBar>
            </div>
          ) : null}
        </div>
      </PageColumn>
      {toast ? <Toast floating>{toast}</Toast> : null}
    </div>
  );
}
