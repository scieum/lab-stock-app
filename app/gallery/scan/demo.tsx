"use client";

import { useState } from "react";
import { BadgeLowStock } from "@/components/badge-low-stock";
import { DataTableCell } from "@/components/ex-data-table-cell";
import { QrManualEntry } from "@/components/qr-manual-entry";
import { QrResultSheet } from "@/components/qr-result-sheet";
import { QrScan } from "@/components/qr-scan";
import { ReagentRow } from "@/components/reagent-row";
import styles from "../gallery.module.css";

const ROWS = [
  { name: "염산", qty: "1병", slot: "좌 1단", low: true },
  { name: "수산화나트륨", qty: "500 g", slot: "좌 1단", low: false },
  { name: "에탄올", qty: "200 mL", slot: "좌 2단", low: false },
  { name: "과산화수소", qty: "2병", slot: "우 1단", low: true },
];

const noop = () => {};

function Section({ id, name, children }: { id: string; name: string; children: React.ReactNode }) {
  return (
    <section className={styles.item} aria-labelledby={`g-${id}`}>
      <h2 id={`g-${id}`} className={styles.itemName}>
        {name}
      </h2>
      <div className={styles.stage}>{children}</div>
    </section>
  );
}

export function ScanGalleryDemo() {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [flashOn, setFlashOn] = useState(false);
  return (
    <div className={styles.grid}>
      <Section id="scan-mobile" name="qr-scan — 모바일 (시안 12-mobile, 플래시 button-pill-soft)">
        <QrScan flash={{ on: flashOn, supported: true, onToggle: () => setFlashOn((v) => !v) }} />
      </Section>
      <Section id="scan-card" name="qr-scan — 데스크톱 scan-card 안 (시안 12-desktop)">
        <QrScan size="card" />
      </Section>
      <Section id="scan-unavailable" name="qr-scan — 카메라를 쓸 수 없음 (개발 예외, d7 §26)">
        <QrScan unavailable={{ onManual: noop }} flash={{ on: false, supported: false, onToggle: noop }} />
      </Section>
      <Section id="manual-button" name="qr-manual-entry — 모바일 버튼 (시안 12-mobile)">
        <QrManualEntry variant="button" onOpen={noop} />
      </Section>
      <Section id="manual-card" name="qr-manual-entry — 입력 카드 (시안 12-desktop)">
        <QrManualEntry
          variant="card"
          value={value}
          error={error}
          onChange={(v) => {
            setValue(v);
            setError(undefined);
          }}
          onSubmit={(v) => setError(/^\d+$/.test(v.trim()) ? `${v.trim()}번 시약장이 없어요` : "시약장 번호를 숫자로 적어 주세요")}
        />
      </Section>
      <Section id="result-sheet" name="qr-result-sheet — 모바일 바텀시트 (시안 12-result-mobile)">
        <QrResultSheet variant="sheet" inline number={1} title="1번 시약장" caption="양문형 · 4단 · 시약 4개" layoutHref="/cabinets" onClose={noop}>
          {ROWS.map((r) => (
            <ReagentRow key={r.name} title={r.name} body={r.qty} caption={r.slot} lowStock={r.low} />
          ))}
        </QrResultSheet>
      </Section>
      <Section id="result-empty" name="qr-result-sheet — 시약 0개">
        <QrResultSheet variant="sheet" inline empty number={2} title="2번 시약장" caption="한문형 · 3단 · 시약 0개" layoutHref="/cabinets" onClose={noop} />
      </Section>
      <Section id="result-drawer" name="qr-result-sheet — 데스크톱 detail-drawer 안 (시안 12-result-desktop)">
        <QrResultSheet variant="drawer" inline number={1} title="1번 시약장" caption="양문형 · 4단 · 시약 4개" layoutHref="/cabinets" onClose={noop}>
          <table className={styles.table}>
            <thead>
              <tr>
                <DataTableCell variant="header">시약명</DataTableCell>
                <DataTableCell variant="header">칸 위치</DataTableCell>
                <DataTableCell variant="header">재고</DataTableCell>
                <DataTableCell variant="header">상태</DataTableCell>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.name}>
                  <DataTableCell>{r.name}</DataTableCell>
                  <DataTableCell>{r.slot}</DataTableCell>
                  <DataTableCell>{r.qty}</DataTableCell>
                  <DataTableCell>{r.low ? <BadgeLowStock /> : null}</DataTableCell>
                </tr>
              ))}
            </tbody>
          </table>
        </QrResultSheet>
      </Section>
    </div>
  );
}
