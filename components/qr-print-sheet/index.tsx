"use client";

import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ButtonPrimary } from "@/components/button-primary";
import { CabinetNumber } from "@/components/cabinet-number";
import { DetailDrawer } from "@/components/detail-drawer";
import { QrLabel } from "@/components/qr-label";
import { SelectField } from "@/components/select-field";
import { SheetPanel } from "@/components/sheet-panel";
import { QR_LABELS_PER_PAGE, cabinetQrUrl, qrPrintCaption } from "@/lib/cabinet-rules";
import styles from "./styles.module.css";

const noopSubscribe = () => () => {};

export type QrPrintCabinet = {
  id: string;
  /** 시약장 번호 (cabinet-number) */
  number: number;
  /** 시약장 이름 */
  label: string;
};

/** 인쇄 대상: 시약장 하나(id) 또는 "all" */
export type QrPrintTarget = string;
export const QR_PRINT_ALL = "all";

type Props = {
  /** 학교명 (라벨 글자) */
  schoolName: string;
  /** QR 내용의 앞부분 — 앱 주소 ("https://…"). QR = {origin}/scan?cabinet={id} */
  origin: string;
  /** 그 학교 시약장 (번호 순) */
  cabinets: readonly QrPrintCabinet[];
  /** 처음 대상 — 기본 = 지금 보고 있는 시약장 (rules.json cabinet.qr_print_layout) */
  defaultTarget?: QrPrintTarget;
  /** × · Esc */
  onClose?: () => void;
  /** "인쇄" — 없으면 브라우저 인쇄(window.print) */
  onPrint?: (cabinetIds: string[]) => void;
  /** true(기본) = 하단 시트(모바일) · 가운데 카드(데스크톱). false = 제자리(갤러리) */
  sheet?: boolean;
  /**
   * drawer = 데스크톱 오른쪽 detail-drawer (시안 11-print-desktop, d7 §23 run c): 제목 "QR 인쇄" + × →
   * print-target("시약장" 드롭다운: 시약장들 + "모두") → A4 미리보기 → "A4 한 장에 라벨 N개" → drawer-actions "인쇄".
   * 기본 sheet = 모바일 하단 시트(대상 pill 한 줄).
   */
  variant?: "sheet" | "drawer";
};

/**
 * QR 인쇄 시트 (디자인 1.15 qr-print-sheet, d7 §14 — 교사·admin): 제목 "QR 인쇄" + ×,
 * 시약장 선택 pill(번호 + 이름, 끝에 "모두") → 흰 A4 미리보기 안 qr-label 들 → "A4 한 장에 라벨 N개" → button-primary "인쇄".
 * 인쇄는 브라우저 인쇄: 화면에 보이지 않는 인쇄 전용 사본(body 바로 아래)만 A4 에 2열로 찍힌다 (app/globals.css @media print).
 * 서버에 아무것도 저장하지 않는다.
 */
export function QrPrintSheet({ schoolName, origin, cabinets, defaultTarget, onClose, onPrint, sheet = true, variant = "sheet" }: Props) {
  const [target, setTarget] = useState<QrPrintTarget>(() => {
    if (defaultTarget === QR_PRINT_ALL) return QR_PRINT_ALL;
    if (defaultTarget && cabinets.some((c) => c.id === defaultTarget)) return defaultTarget;
    return cabinets[0]?.id ?? QR_PRINT_ALL;
  });
  // 인쇄 사본은 브라우저에서만 (body 로 옮겨 그린다) — 서버 렌더·하이드레이션 중에는 없음
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const chosen = target === QR_PRINT_ALL ? cabinets : cabinets.filter((c) => c.id === target);
  const pages: QrPrintCabinet[][] = [];
  for (let i = 0; i < chosen.length; i += QR_LABELS_PER_PAGE) pages.push(chosen.slice(i, i + QR_LABELS_PER_PAGE));

  const print = () => {
    if (chosen.length === 0) return;
    if (onPrint) onPrint(chosen.map((c) => c.id));
    else window.print();
  };

  const option = (value: QrPrintTarget, content: React.ReactNode, hasNumber: boolean) => (
    <button
      key={value}
      type="button"
      className={[styles.option, hasNumber ? styles.optionNumbered : ""].filter(Boolean).join(" ")}
      aria-pressed={target === value}
      onClick={() => setTarget(value)}
    >
      {content}
    </button>
  );

  const preview = (
    <div className={styles.previewArea} data-name="preview-area">
      <div className={styles.a4} role="group" aria-label="인쇄 미리보기 (A4)">
        {chosen.map((c) => (
          <QrLabel key={c.id} schoolName={schoolName} number={c.number} name={c.label} content={cabinetQrUrl(origin, c.id)} />
        ))}
      </div>
    </div>
  );

  const printCopy =
    mounted && chosen.length > 0
      ? createPortal(
          <div data-print-root="" aria-hidden="true">
            {pages.map((page, i) => (
              <div key={i} data-print-page="">
                {page.map((c) => (
                  <QrLabel key={c.id} bare schoolName={schoolName} number={c.number} name={c.label} content={cabinetQrUrl(origin, c.id)} />
                ))}
              </div>
            ))}
          </div>,
          document.body,
        )
      : null;

  if (variant === "drawer") {
    const options = [
      ...cabinets.map((c) => ({ value: c.id, label: c.label })),
      ...(cabinets.length > 1 ? [{ value: QR_PRINT_ALL, label: "모두" }] : []),
    ];
    // qr-print-sheet = 드로어 안 내용 전체(제목 줄 포함 — 시안 detail-drawer > qr-print-sheet > sheet-head). 묶음은 배치에 끼어들지 않는다
    return (
      <div data-component="qr-print-sheet" className={styles.drawerRoot}>
        <DetailDrawer
          title="QR 인쇄"
          onClose={onClose}
          inline={!sheet}
          className={styles.drawer}
          actions={
            <ButtonPrimary fullWidth disabled={chosen.length === 0} onClick={print}>
              인쇄
            </ButtonPrimary>
          }
        >
          <div className={styles.drawerBody}>
            <div data-name="print-target">
              <SelectField label="시약장" tone="form" options={options} value={target} onChange={setTarget} />
            </div>
            {preview}
            <p className={styles.caption} role="status" data-name="print-caption">
              {qrPrintCaption(chosen.length)}
            </p>
          </div>
          {printCopy}
        </DetailDrawer>
      </div>
    );
  }

  return (
    <SheetPanel
      data-component="qr-print-sheet"
      title="QR 인쇄"
      onClose={onClose}
      sheet={sheet}
      size="lg"
      footer={
        <>
          <p className={styles.caption} role="status">
            {qrPrintCaption(chosen.length)}
          </p>
          <ButtonPrimary fullWidth disabled={chosen.length === 0} onClick={print}>
            인쇄
          </ButtonPrimary>
        </>
      }
    >
      <div role="group" aria-label="인쇄할 시약장" className={styles.targets}>
        {cabinets.map((c) =>
          option(
            c.id,
            <>
              <CabinetNumber number={c.number} />
              <span className={styles.optionLabel}>{c.label}</span>
            </>,
            true,
          ),
        )}
        {cabinets.length > 1 ? option(QR_PRINT_ALL, <span className={styles.optionLabel}>모두</span>, false) : null}
      </div>

      {preview}

      {printCopy}
    </SheetPanel>
  );
}
