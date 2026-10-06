"use client";

import { useEffect, useRef, useState } from "react";
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
import { TextInput } from "@/components/text-input";
import {
  checkGroups,
  normalizeExtraction,
  planSave,
  validateManualFile,
  type ExtractedItem,
  type ExtractionRow,
  type ManualReagent,
} from "@/lib/manual-rules";
import local from "./manual.module.css";

type ResultProps = {
  rows: ExtractionRow[];
  groups: number;
  reagents: ManualReagent[];
  /** 처음부터 보여 줄 토스트 */
  defaultToast?: string | null;
};

/**
 * 2단계 예시: extraction-table + 하단 버튼 줄("다시 추출" · "확인 후 저장").
 * 값 고치기·시약 바꾸기·행 삭제는 이 예시 안의 상태만 바꾼다 (서버 없음). "다시 추출"은 처음 행으로 되돌린다.
 */
export function ManualResultExample({ rows: initial, groups, reagents, defaultToast = null }: ResultProps) {
  const [rows, setRows] = useState(initial);
  const [toast, setToast] = useState<string | null>(defaultToast);
  const plan = planSave(rows, reagents, groups);

  const change = (id: string, patch: ExtractionRowPatch) => {
    setToast(null);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  return (
    <div className={local.screen}>
      <ExtractionTable
        rows={rows}
        groups={groups}
        reagents={reagents}
        onRowChange={change}
        onRowRemove={(id) => {
          setToast(null);
          setRows((prev) => prev.filter((r) => r.id !== id));
        }}
      />
      <BottomActions
        blockReason={plan.blockReason}
        onRetry={() => {
          setToast(null);
          setRows(initial);
        }}
        onSave={() => setToast("재주문 기준을 저장했어요")}
      />
      {toast ? (
        <div className={local.toastRow}>
          <Toast>{toast}</Toast>
        </div>
      ) : null}
    </div>
  );
}

/** 하단 버튼 줄 (화면 쪽 구성): 저장할 수 없으면 "확인 후 저장" 비활성 + 이유 */
function BottomActions({
  blockReason,
  onRetry,
  onSave,
  busy = false,
}: {
  blockReason: string | null;
  onRetry: () => void;
  onSave: () => void;
  busy?: boolean;
}) {
  return (
    <div className={local.bottom}>
      {blockReason ? (
        <p className={local.reason} role="status" data-save-block>
          {blockReason}
        </p>
      ) : null}
      <div className={local.actions}>
        <ButtonOutline onClick={onRetry} disabled={busy}>
          다시 추출
        </ButtonOutline>
        <ButtonPrimary fullWidth onClick={onSave} disabled={busy || blockReason !== null}>
          확인 후 저장
        </ButtonPrimary>
      </div>
    </div>
  );
}

type DemoProps = {
  reagents: ManualReagent[];
  /** 가짜 추출 결과 (실제 AI 호출 없음) */
  extracted: ExtractedItem[];
  defaultGroups?: string;
  /** 처리 중으로 보이는 시간 (ms) */
  delay?: number;
};

/**
 * 화면 5 흐름 데모: 1단계(파일 + 조 수 → "AI 추출") → 처리 중 → 2단계(추출 결과 확인 → "확인 후 저장") → 토스트.
 * 파일은 브라우저 안에서만 쓰고 어디에도 보내지 않는다. 추출 결과는 정해 둔 가짜 값이다.
 */
export function ManualFlowDemo({ reagents, extracted, defaultGroups = "6", delay = 1500 }: DemoProps) {
  const [file, setFile] = useState<ManualUploadFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [groupsText, setGroupsText] = useState(defaultGroups);
  const [step, setStep] = useState<"input" | "processing" | "result">("input");
  const [rows, setRows] = useState<ExtractionRow[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<ManualUploadFile | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      releaseManualUploadFile(fileRef.current);
    },
    [],
  );

  const groups = checkGroups(groupsText);
  const groupsValue = groups.ok ? groups.value : Number.NaN;
  const plan = planSave(rows, reagents, groupsValue);

  const replaceFile = (next: ManualUploadFile | null) => {
    releaseManualUploadFile(fileRef.current);
    fileRef.current = next;
    setFile(next);
  };

  const onFileChange = (picked: File | null) => {
    setToast(null);
    setStep("input");
    setRows([]);
    if (!picked) {
      replaceFile(null);
      setFileError(null);
      return;
    }
    const error = validateManualFile(picked);
    if (error) {
      replaceFile(null);
      setFileError(error);
      return;
    }
    replaceFile(createManualUploadFile(picked));
    setFileError(null);
  };

  const extract = () => {
    if (!file || !groups.ok) return;
    setToast(null);
    setStep("processing");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setRows(normalizeExtraction(extracted, reagents));
      setStep("result");
    }, delay);
  };

  return (
    <div className={local.screen} data-step={step}>
      <div className={local.layout}>
        <div className={local.uploadColumn}>
          <ManualUpload
            variant="upload"
            file={file}
            error={fileError}
            processing={step === "processing"}
            onFileChange={onFileChange}
          />
          <TextInput
            label="조 수"
            unit="조"
            unitTone="plain"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={groupsText}
            disabled={step === "processing"}
            error={groups.ok ? undefined : groups.error}
            onChange={(e) => {
              setToast(null);
              setGroupsText(e.target.value);
            }}
          />
          {step !== "result" ? (
            <ButtonPrimary fullWidth onClick={extract} disabled={!file || !groups.ok || step === "processing"}>
              AI 추출
            </ButtonPrimary>
          ) : null}
        </div>
        {step === "result" ? (
          <div className={local.resultColumn}>
            <ExtractionTable
              rows={rows}
              groups={groupsValue}
              reagents={reagents}
              onClose={() => {
                setToast(null);
                setRows([]);
                setStep("input");
              }}
              onRowChange={(id, patch) => {
                setToast(null);
                setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
              }}
              onRowRemove={(id) => {
                setToast(null);
                setRows((prev) => prev.filter((r) => r.id !== id));
              }}
            />
            <BottomActions
              blockReason={plan.blockReason}
              onRetry={extract}
              onSave={() => setToast("재주문 기준을 저장했어요")}
            />
          </div>
        ) : null}
      </div>
      {toast ? (
        <div className={local.toastRow}>
          <Toast>{toast}</Toast>
        </div>
      ) : null}
      {toast ? (
        <p className={local.note} data-demo-items>
          저장할 항목: {JSON.stringify(plan.items)}
        </p>
      ) : null}
    </div>
  );
}
