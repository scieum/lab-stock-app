"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeLowStock } from "@/components/badge-low-stock";
import { DataTableCell } from "@/components/ex-data-table-cell";
import { Toast } from "@/components/ex-toast";
import { PageHead } from "@/components/page-frame";
import { QrManualEntry } from "@/components/qr-manual-entry";
import { QrResultSheet } from "@/components/qr-result-sheet";
import { QrScan } from "@/components/qr-scan";
import { ReagentRow } from "@/components/reagent-row";
import { SegmentedControl, type SegmentOption } from "@/components/segmented-control";
import { DesktopOnly, MobileOnly } from "@/components/viewport-only";
import { parseCabinetQr } from "@/lib/cabinet-rules";
import { parseCabinetNumber, SCAN_TEXT } from "@/lib/scan-rules";
import { useQrScanner } from "@/lib/use-qr-scanner";
import { useIsDesktop } from "@/lib/use-viewport";
import { findCabinetAction } from "./actions";
import type { ScanCabinetView, ScanFindResult } from "./scan-types";
import styles from "./scan.module.css";

type Mode = "scan" | "manual";

const MODES: SegmentOption[] = [
  { value: "scan", label: "QR 스캔" },
  { value: "manual", label: "번호로 찾기" },
];

const TOAST_MS = 4000;
const SCAN_PATH = "/scan";

/** 탭이 보이는가 (다른 탭·앱으로 가면 카메라를 끈다) */
function subscribeVisibility(cb: () => void) {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}
const pageVisible = () => document.visibilityState !== "hidden";
const serverVisible = () => false;

/** 주소창만 바꾼다 (Next 라우터와 동기 — 서버 다시 읽기 없음). 결과 열림 = /scan?cabinet={id}, 닫힘 = /scan */
function replaceAddress(cabinetId: string | null) {
  const next = cabinetId ? `${SCAN_PATH}?cabinet=${encodeURIComponent(cabinetId)}` : SCAN_PATH;
  if (`${window.location.pathname}${window.location.search}` !== next) window.history.replaceState(null, "", next);
}

type Props = {
  /** 주소창 /scan?cabinet={id} 로 들어왔을 때 우리 학교 시약장 결과 */
  initialResult: ScanCabinetView | null;
  /** 주소창 cabinet 이 우리 학교 것이 아니면 토스트 ("{학교명} 시약장 QR이 아니에요" · "시약장 QR이 아니에요") */
  initialToast: string | null;
};

/**
 * 화면 12 QR 찾기 (디자인 1.26 시안 12 · 12-result, d7 §26).
 * 모바일 = (셸 nav-pill × "QR 스캔") segmented-control "QR 스캔 | 번호로 찾기" → qr-scan(카메라 · 플래시) + qr-manual-entry 버튼
 *   / 번호로 찾기 = qr-manual-entry 입력 카드. 결과 = tab-bar 위 qr-result-sheet 바텀시트(reagent-row).
 * 데스크톱 = page-head "QR 찾기" → find-cards(scan-card qr-scan · qr-manual-entry 카드). 결과 = 오른쪽 detail-drawer 안 qr-result-sheet(result-table).
 * 카메라: 화면을 떠남 · 번호로 찾기 · 결과 열림 · 탭 숨김이면 끈다. 영상은 서버로 보내지 않는다 (브라우저에서 QR 만 읽어 시약장 id 를 보낸다).
 */
export function ScanScreen({ initialResult, initialToast }: Props) {
  const desktop = useIsDesktop();
  const visible = useSyncExternalStore(subscribeVisibility, pageVisible, serverVisible);
  const [mode, setMode] = useState<Mode>("scan");
  const [result, setResult] = useState<ScanCabinetView | null>(initialResult);
  const [toast, setToast] = useState<{ key: number; text: string } | null>(initialToast ? { key: 0, text: initialToast } : null);
  const [manualValue, setManualValue] = useState("");
  const [manualError, setManualError] = useState<string | undefined>();
  const [manualFocus, setManualFocus] = useState(false);
  const [pending, startTransition] = useTransition();
  const toastSeq = useRef(1);
  const desktopEntryRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  /** 세션이 끝났으면 로그인 뒤 /scan 으로 돌아온다 */
  const toLogin = useCallback(() => router.push(`/login?next=${encodeURIComponent(SCAN_PATH)}`), [router]);

  // 주소창 cabinet 이 결과가 되지 못했으면(다른 학교 · 시약장 QR 아님) 주소를 /scan 으로 되돌린다
  useEffect(() => {
    if (!initialResult && new URLSearchParams(window.location.search).has("cabinet")) replaceAddress(null);
  }, [initialResult]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = useCallback((text: string) => {
    setToast({ key: toastSeq.current++, text });
  }, []);

  const openResult = useCallback((cabinet: ScanCabinetView) => {
    setResult(cabinet);
    replaceAddress(cabinet.id);
  }, []);

  const closeResult = useCallback(() => {
    setResult(null);
    replaceAddress(null);
  }, []);

  // QR 읽기 (같은 코드 연속은 useQrScanner 의 반복 거르개가 한 번만 넘긴다)
  const onCode = useCallback(
    (text: string) => {
      const cabinetId = parseCabinetQr(text, window.location.origin);
      if (!cabinetId) {
        showToast(SCAN_TEXT.notCabinetQr);
        return;
      }
      startTransition(async () => {
        const r: ScanFindResult = await findCabinetAction({ by: "qr", cabinetId });
        if (r.kind === "found") openResult(r.cabinet);
        else if (r.kind === "signed-out") toLogin();
        else showToast(r.text);
      });
    },
    [openResult, showToast, toLogin],
  );

  // 카메라: 폭을 안 뒤(하이드레이션 뒤) · 결과 닫힘 · 탭 보임 · (모바일) QR 스캔 탭일 때만
  const cameraOn = desktop !== null && visible && result === null && (desktop || mode === "scan");
  const { videoRef, status, torchOn, torchSupported, toggleTorch } = useQrScanner({ active: cameraOn, onCode });
  const unavailable = status === "unavailable";

  const submitNumber = (raw: string) => {
    const parsed = parseCabinetNumber(raw);
    if (!parsed.ok) {
      setManualError(parsed.error);
      return;
    }
    setManualError(undefined);
    startTransition(async () => {
      const r = await findCabinetAction({ by: "number", number: parsed.value });
      if (r.kind === "found") openResult(r.cabinet);
      else if (r.kind === "signed-out") toLogin();
      else setManualError(r.text);
    });
  };

  const changeNumber = (v: string) => {
    setManualValue(v);
    setManualError(undefined);
  };

  const toManual = () => {
    setMode("manual");
    setManualFocus(true);
  };

  /** 데스크톱: 카메라를 못 쓰면 옆 번호 카드 입력으로 */
  const focusDesktopEntry = () => {
    desktopEntryRef.current?.querySelector<HTMLInputElement>("input")?.focus();
  };

  const video = <video ref={videoRef} className={styles.video} muted playsInline aria-hidden="true" />;
  const flash = { on: torchOn, supported: torchSupported, onToggle: () => void toggleTorch() };

  const toastNode = toast ? (
    <Toast key={toast.key} floating>
      {toast.text}
    </Toast>
  ) : null;

  const mobile = (
    <MobileOnly>
      <div className={styles.mobile}>
        <PageHead title="QR 스캔" />
        <SegmentedControl label="찾는 방법" options={MODES} value={mode} onChange={(v) => (v === "manual" ? toManual() : setMode("scan"))} />
        {mode === "scan" ? (
          <>
            <QrScan size="mobile" flash={flash} unavailable={unavailable ? { onManual: toManual } : null}>
              {desktop === false && !unavailable ? video : null}
            </QrScan>
            <QrManualEntry variant="button" onOpen={toManual} />
          </>
        ) : (
          <QrManualEntry
            variant="card"
            value={manualValue}
            onChange={changeNumber}
            onSubmit={submitNumber}
            error={manualError}
            pending={pending}
            autoFocus={manualFocus}
          />
        )}
        {result && desktop !== true ? (
          <QrResultSheet
            variant="sheet"
            number={result.number}
            title={result.label}
            caption={result.caption}
            layoutHref={result.layoutHref}
            onClose={closeResult}
            empty={result.rows.length === 0}
            focusKey={result.id}
          >
            {result.rows.map((r) => (
              <ReagentRow key={r.id} title={r.name} body={r.stock} caption={r.slot} lowStock={r.lowStock} href={`/reagents/${r.id}`} />
            ))}
          </QrResultSheet>
        ) : null}
      </div>
    </MobileOnly>
  );

  const desk = (
    <DesktopOnly>
      <div className={styles.frame}>
        <div className={styles.body}>
          <PageHead title="QR 찾기" mobileTitle="QR 스캔" subtitle="시약장 QR을 비추거나 번호를 입력하세요" />
          <div className={styles.cards} data-name="find-cards">
            <div className={styles.scanCard} data-name="scan-card">
              <QrScan size="card" unavailable={unavailable ? { onManual: focusDesktopEntry, manualLabel: "번호로 찾기" } : null}>
                {desktop === true && !unavailable ? video : null}
              </QrScan>
            </div>
            <div className={styles.entryCard} ref={desktopEntryRef}>
              <QrManualEntry
                variant="card"
                value={manualValue}
                onChange={changeNumber}
                onSubmit={submitNumber}
                error={manualError}
                pending={pending}
              />
            </div>
          </div>
        </div>
        {result && desktop !== false ? (
          <QrResultSheet
            variant="drawer"
            number={result.number}
            title={result.label}
            caption={result.caption}
            layoutHref={result.layoutHref}
            onClose={closeResult}
            empty={result.rows.length === 0}
            focusKey={result.id}
          >
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
                {result.rows.map((r) => (
                  <tr key={r.id}>
                    <DataTableCell>
                      <Link href={`/reagents/${r.id}`} className={styles.nameLink} title={r.name}>
                        {r.name}
                      </Link>
                    </DataTableCell>
                    <DataTableCell>{r.slot}</DataTableCell>
                    <DataTableCell>{r.stock}</DataTableCell>
                    <DataTableCell>{r.lowStock ? <BadgeLowStock /> : null}</DataTableCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </QrResultSheet>
        ) : null}
      </div>
    </DesktopOnly>
  );

  return (
    <>
      {mobile}
      {desk}
      {toastNode}
    </>
  );
}
