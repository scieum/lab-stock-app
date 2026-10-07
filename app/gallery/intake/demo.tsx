"use client";

import { useEffect, useRef, useState } from "react";
import { ButtonPrimary } from "@/components/button-primary";
import { DocIntakeTable } from "@/components/doc-intake-table";
import { DocUpload } from "@/components/doc-upload";
import { Toast } from "@/components/ex-toast";
import { IntakeMode, type IntakeMode as IntakeModeValue } from "@/components/intake-mode";
import { createManualUploadFile, releaseManualUploadFile, type ManualUploadFile } from "@/components/manual-upload/file";
import { NewReagentFields } from "@/components/new-reagent-fields";
import { ReagentLink } from "@/components/reagent-link";
import {
  DOC_TEXT,
  buildDocRows,
  defaultDocIntakeDate,
  docIntakeDoneText,
  patchDocRow,
  planDocIntake,
  type DocLink,
  type DocRow,
  type NewReagentDraft,
} from "@/lib/doc-intake-rules";
import { validateManualFile } from "@/lib/manual-rules";
import styles from "../gallery.module.css";
import { SAMPLE_TODAY, sampleDocReagents, sampleExtraction } from "./sample";

/** intake-mode 동작 (서류로 입고 ↔ 직접 입력) */
export function IntakeModeDemo() {
  const [mode, setMode] = useState<IntakeModeValue>("doc");
  return (
    <>
      <IntakeMode value={mode} onChange={setMode} />
      <p className={styles.lead}>지금: {mode === "doc" ? DOC_TEXT.modeDoc : DOC_TEXT.modeDirect}</p>
    </>
  );
}

/**
 * 서류로 입고 동작 예시: 파일 고르기 → AI로 읽기(가짜, 1초) → 확인 표 → 확인 후 입고 → 토스트.
 * 네트워크·저장 없음 — 추출 결과는 sample.ts 의 고정 값.
 */
export function DocIntakeFlowDemo() {
  const [file, setFile] = useState<ManualUploadFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"upload" | "processing" | "review" | "done">("upload");
  const [rows, setRows] = useState<DocRow[]>([]);
  const [date, setDate] = useState(SAMPLE_TODAY);
  const [done, setDone] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<ManualUploadFile | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      releaseManualUploadFile(fileRef.current);
    },
    [],
  );

  const plan = planDocIntake(rows, sampleDocReagents, date, SAMPLE_TODAY);

  if (step === "done" && done) return <Toast>{done}</Toast>;

  if (step === "review") {
    return (
      <>
        <DocIntakeTable
          rows={rows}
          reagents={sampleDocReagents}
          intakeDate={date}
          today={SAMPLE_TODAY}
          findMsds={false}
          onDateChange={setDate}
          onRowChange={(id, patch) => setRows((prev) => prev.map((r) => (r.id === id ? patchDocRow(r, patch, sampleDocReagents) : r)))}
          onRestart={() => setStep("upload")}
        />
        {plan.blockReason ? <p className={styles.lead}>{plan.blockReason}</p> : null}
        <ButtonPrimary
          disabled={!plan.canSave}
          onClick={() => {
            setDone(docIntakeDoneText(plan.items.length));
            setStep("done");
          }}
        >
          {DOC_TEXT.submit}
        </ButtonPrimary>
      </>
    );
  }

  return (
    <DocUpload
      file={file}
      error={error}
      processing={step === "processing"}
      onFileChange={(f) => {
        const err = validateManualFile(f);
        if (err) {
          setError(err);
          return;
        }
        releaseManualUploadFile(fileRef.current);
        const view = createManualUploadFile(f);
        fileRef.current = view;
        setFile(view);
        setError(null);
      }}
      onRead={() => {
        setStep("processing");
        timer.current = setTimeout(() => {
          setRows(buildDocRows(sampleExtraction, sampleDocReagents));
          setDate(defaultDocIntakeDate(sampleExtraction.docDate, SAMPLE_TODAY));
          setStep("review");
        }, 1000);
      }}
      onCancel={() => {
        if (timer.current) clearTimeout(timer.current);
        setStep("upload");
      }}
    />
  );
}

/** reagent-link 동작: 바꾸기 · 빼기 · 다시 넣기 · 새 시약으로 등록 */
export function ReagentLinkDemo() {
  const [link, setLink] = useState<DocLink>({ kind: "reagent", reagentId: "r-hcl" });
  const [expanded, setExpanded] = useState(false);
  return (
    <ReagentLink
      itemName="염산 35% 500mL"
      link={link}
      reagents={sampleDocReagents}
      expanded={expanded}
      summary="새 시약 · 산 · 2,000 mL"
      onChange={(l) => {
        setLink(l);
        if (l.kind === "new") setExpanded(true);
      }}
      onInclude={() => setLink({ kind: "reagent", reagentId: "r-hcl" })}
      onToggleExpand={() => setExpanded((e) => !e)}
    />
  );
}

/** new-reagent-fields 동작: 이름 · 분류 · 단위 · 재고량 · MSDS 직접 입력 (MSDS 찾기 시트는 /gallery/msds) */
export function NewReagentFieldsDemo() {
  const [value, setValue] = useState<NewReagentDraft>({
    name: "질산칼륨",
    storageClass: "산화제",
    suggestedClass: "산화제",
    unit: "g",
    stock: "500",
    stockEdited: false,
    msdsUrl: "",
  });
  return (
    <NewReagentFields
      itemName="질산칼륨 500g"
      value={value}
      findMsds={false}
      onChange={(patch) => setValue((v) => ({ ...v, ...patch }))}
    />
  );
}
