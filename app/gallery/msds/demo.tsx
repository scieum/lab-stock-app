"use client";

import { useState } from "react";
import { Toast } from "@/components/ex-toast";
import { MsdsBulkBanner } from "@/components/msds-bulk-banner";
import { MsdsCandidates } from "@/components/msds-candidates";
import { MsdsSearch } from "@/components/msds-search";
import { TextInput } from "@/components/text-input";
import { MSDS_TEXT, bulkDoneText, type MsdsCandidate } from "@/lib/msds-rules";
import styles from "../gallery.module.css";
import { sampleBulkTargets, sampleMsdsCandidates, sampleSearch } from "./sample";

/** 화면 3 동작 예시: "MSDS 찾기" → 후보 시트(제자리) → "이 MSDS로" = 저장한 셈 + 토스트 (네트워크·DB 없음) */
export function MsdsFindDemo({ name = "질산은" }: { name?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(name);
  const [results, setResults] = useState<MsdsCandidate[]>([]);
  const [saved, setSaved] = useState<MsdsCandidate | null>(null);

  const run = (q: string) => setResults(sampleSearch(q));

  if (saved) {
    return (
      <>
        <p className={styles.lead}>
          {saved.name} · {saved.cas ? `CAS ${saved.cas}` : "CAS 없음"}
        </p>
        <Toast>{MSDS_TEXT.saved}</Toast>
      </>
    );
  }
  return (
    <>
      <p className={styles.lead}>{MSDS_TEXT.missing}</p>
      <MsdsSearch
        onClick={() => {
          setQuery(name);
          run(name);
          setOpen(true);
        }}
      />
      {open ? (
        <MsdsCandidates
          sheet={false}
          caption={name}
          query={query}
          onQueryChange={setQuery}
          onSearch={() => run(query)}
          status="ready"
          candidates={results}
          onConfirm={(c) => {
            setSaved(c);
            setOpen(false);
          }}
          onSubmitUrl={(url) => {
            setSaved({ chemId: "direct", name: url, cas: null, msdsUrl: url });
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

/** 화면 7 동작 예시: 시약명이 비면 "MSDS 찾기" 비활성, 고르면 MSDS 칸에 주소 */
export function MsdsRegisterDemo() {
  const [name, setName] = useState("질산칼륨");
  const [url, setUrl] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <>
      <TextInput label="시약명" labelTone="strong" value={name} onChange={(e) => setName(e.target.value)} />
      <div className={styles.row}>
        <TextInput label="MSDS 연결 주소" labelTone="strong" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
        <MsdsSearch size="sm" disabled={name.trim() === ""} onClick={() => setOpen(true)} />
      </div>
      {open ? (
        <MsdsCandidates
          sheet={false}
          caption={name.trim()}
          query={name.trim()}
          onQueryChange={() => undefined}
          status="ready"
          candidates={sampleSearch(name)}
          onConfirm={(c) => {
            setUrl(c.msdsUrl);
            setOpen(false);
          }}
          onDirect={() => setOpen(false)}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

/** 화면 2 일괄 예시: 띠 → 시약마다 후보(건너뛰기 · 이 MSDS로) → "N종에 MSDS를 넣었어요" */
export function MsdsBulkDemo() {
  const [index, setIndex] = useState<number | null>(null);
  const [saved, setSaved] = useState(0);
  const [done, setDone] = useState<string | null>(null);
  const total = sampleBulkTargets.length;
  const current = index !== null ? sampleBulkTargets[index] : null;

  const next = (didSave: boolean) => {
    const n = saved + (didSave ? 1 : 0);
    setSaved(n);
    if (index === null || index + 1 >= total) {
      setIndex(null);
      setDone(n > 0 ? bulkDoneText(n) : null);
      return;
    }
    setIndex(index + 1);
  };

  return (
    <>
      <MsdsBulkBanner
        count={total}
        bleed={false}
        disabled={index !== null}
        onStart={() => {
          setSaved(0);
          setDone(null);
          setIndex(0);
        }}
      />
      {current ? (
        <MsdsCandidates
          key={current.id}
          sheet={false}
          title={current.name}
          progress={`${(index ?? 0) + 1} / ${total}`}
          caption={MSDS_TEXT.pick}
          status="ready"
          candidates={sampleSearch(current.name)}
          onConfirm={() => next(true)}
          onSubmitUrl={() => next(true)}
          onSkip={() => next(false)}
          onClose={() => setIndex(null)}
        />
      ) : null}
      {done ? <Toast>{done}</Toast> : null}
    </>
  );
}

/** 시안 2-msds-bulk 제자리 (건너뛰기 · 이 MSDS로 — 누르면 아무 일 없음) */
export function MsdsCandidatesBulkStatic() {
  return (
    <MsdsCandidates
      sheet={false}
      title="질산은"
      progress="1 / 4"
      caption={MSDS_TEXT.pick}
      status="ready"
      candidates={sampleMsdsCandidates}
      onSkip={() => undefined}
      onConfirm={() => undefined}
    />
  );
}
