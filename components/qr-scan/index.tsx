"use client";

import { useId } from "react";
import { ButtonOutline } from "@/components/button-outline";
import { ButtonPillSoft } from "@/components/button-pill-soft";
import styles from "./styles.module.css";

export const QR_SCAN_TITLE = "시약장 문에 붙은 QR을 맞춰주세요";
export const QR_SCAN_HELP = "카메라는 시약장 QR을 읽는 데만 사용해요";
export const QR_SCAN_CAPTION = "QR 인쇄 라벨의 번호로도 찾을 수 있어요";
export const QR_CAMERA_UNAVAILABLE = "카메라를 쓸 수 없어요. 시약장 번호로 찾아 주세요";

type Flash = {
  /** 켜짐 (aria-pressed) */
  on: boolean;
  /** 트랙 torch 지원 — false 면 버튼 비활성 (d7 §26) */
  supported: boolean;
  onToggle: () => void;
};

type Props = {
  /** mobile = 미리보기 높이 300 (시안 12-mobile) · card = 360 (시안 12-desktop scan-card 안) */
  size?: "mobile" | "card";
  /**
   * camera-preview 안에 그릴 것 — 화면이 넘기는 <video>(useQrScanner 의 videoRef). 없으면 어두운 빈 상자 + scan-frame 만.
   */
  children?: React.ReactNode;
  /**
   * 카메라를 쓸 수 없음 (권한 거부·카메라 없음 — 시안에 없는 상태, 개발 예외 d7 §26):
   * camera-preview 자리에 안내 + "번호로 찾기"로 바꾸는 button-outline
   */
  unavailable?: { onManual: () => void; manualLabel?: string } | null;
  /** 플래시 버튼 (시안 12-mobile button-pill-soft "플래시"). 없으면 그리지 않는다 (데스크톱 시안에 없음) */
  flash?: Flash | null;
  className?: string;
};

/** 스캔 틀 (시안 scan-frame 180: 흰 모서리 네 개) */
function ScanFrame() {
  return (
    <svg data-name="scan-frame" className={styles.frame} viewBox="0 0 180 180" fill="none" aria-hidden="true" focusable="false">
      <path d="M3 45V3h42M135 3h42v42M177 135v42h-42M45 177H3v-42" stroke="currentColor" strokeWidth={4} />
    </svg>
  );
}

/**
 * QR 스캔 (디자인 1.26 화면 12 qr-scan): scan-guide(제목 18/700 + scan-help 13 회색) → camera-preview(어두운 상자 radius 24 + scan-frame)
 * → scan-caption(12 회색) → 플래시(button-pill-soft). 표현만 — 카메라는 부르는 쪽이 children(<video>)·flash 로 연결한다.
 */
export function QrScan({ size = "mobile", children, unavailable, flash, className }: Props) {
  const titleId = useId();
  return (
    <section
      data-component="qr-scan"
      aria-labelledby={titleId}
      className={[styles.scan, className ?? ""].filter(Boolean).join(" ")}
    >
      <div className={styles.guide} data-name="scan-guide">
        <h2 id={titleId} className={styles.title} data-name="scan-title">
          {QR_SCAN_TITLE}
        </h2>
        <p className={styles.help} data-name="scan-help">
          {QR_SCAN_HELP}
        </p>
      </div>
      {unavailable ? (
        <div
          className={[styles.preview, styles.unavailable, size === "card" ? styles.card : ""].filter(Boolean).join(" ")}
          data-name="camera-unavailable"
          role="status"
        >
          <p className={styles.unavailableText}>{QR_CAMERA_UNAVAILABLE}</p>
          <ButtonOutline onClick={unavailable.onManual}>{unavailable.manualLabel ?? "번호로 찾기"}</ButtonOutline>
        </div>
      ) : (
        <div className={[styles.preview, size === "card" ? styles.card : ""].filter(Boolean).join(" ")} data-name="camera-preview">
          {children ? <div className={styles.media}>{children}</div> : null}
          <ScanFrame />
        </div>
      )}
      <p className={styles.caption} data-name="scan-caption">
        {QR_SCAN_CAPTION}
      </p>
      {flash ? (
        <ButtonPillSoft
          leadingIcon="flash"
          className={styles.flash}
          aria-pressed={flash.on}
          disabled={!flash.supported || Boolean(unavailable)}
          onClick={flash.onToggle}
        >
          플래시
        </ButtonPillSoft>
      ) : null}
    </section>
  );
}
