"use client";

import { useEffect, useId, useRef } from "react";
import { Icon } from "@/components/icons";
import styles from "./styles.module.css";

type Props = {
  /**
   * 시안 컴포넌트 이름 (slot-sheet · location-picker · qr-print-sheet). 시트 틀 자체는 시안 이름이 아니라
   * 부르는 쪽이 자기 이름을 넘긴다 — 넘기지 않으면 data-component 없음.
   */
  "data-component"?: string;
  /** 제목 (heading-3 20/700) */
  title: string;
  /** 제목 옆 (칸 시트의 분류 칩) */
  titleAddon?: React.ReactNode;
  /** 제목 아래 보조 한 줄 (caption 회색 — "과산화수소 · 산화제") */
  caption?: string;
  /** × 닫기 · Esc. 없으면 × 를 그리지 않는다 */
  onClose?: () => void;
  closeLabel?: string;
  /** true(기본) = 모바일 tab-bar 위 하단 시트 · 데스크톱 화면 가운데. false = 항상 제자리(갤러리) */
  sheet?: boolean;
  /** 데스크톱 폭: md = 560 (칸 시트·위치 피커), lg = 640 (QR 인쇄) */
  size?: "md" | "lg";
  /** 시트 아래 영역 (button-primary 줄) — 본문이 길면 본문만 스크롤 */
  footer?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
};

/**
 * 하단 시트 틀 (디자인 1.15 slot-sheet · location-picker · qr-print-sheet 공통):
 * 흰 바탕, 회색 테두리 한 줄, 위쪽 rounded 24, 안쪽 24, 오른쪽 위 × 닫기, 딤·그림자 없음 (s2-spec 모바일 공통).
 * 모바일 = tab-bar 위쪽 선 위에 붙는 하단 시트, 데스크톱 = 화면 가운데 카드.
 * 열리면 시트로 포커스를 옮기고, 닫히면 원래 있던 곳으로 돌려준다. Esc 로 닫는다.
 */
export function SheetPanel({
  "data-component": component,
  title,
  titleAddon,
  caption,
  onClose,
  closeLabel = "닫기",
  sheet = true,
  size = "md",
  footer,
  children,
  className,
}: Props) {
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sheet) return;
    const before = document.activeElement;
    rootRef.current?.focus({ preventScroll: true });
    return () => {
      const now = document.activeElement;
      if (now && now !== document.body) return;
      if (before instanceof HTMLElement && before !== document.body && before.isConnected) before.focus({ preventScroll: true });
    };
  }, [sheet]);

  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      ref={rootRef}
      data-component={component}
      role="dialog"
      aria-modal={sheet ? "true" : undefined}
      aria-labelledby={titleId}
      tabIndex={-1}
      className={[styles.panel, sheet ? styles.sheet : "", size === "lg" ? styles.lg : "", className ?? ""].filter(Boolean).join(" ")}
    >
      <div className={styles.head}>
        <div className={styles.header}>
          <div className={styles.titleRow}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            {titleAddon}
          </div>
          {onClose ? (
            <button type="button" className={styles.close} aria-label={closeLabel} onClick={onClose}>
              <Icon name="close" className={styles.closeIcon} />
            </button>
          ) : null}
        </div>
        {caption ? <p className={styles.caption}>{caption}</p> : null}
      </div>
      <div className={styles.body}>{children}</div>
      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </div>
  );
}

/** 시트 안 소제목 묶음 (heading-4 "이 칸의 시약 (3)" · "넣을 시약 고르기") */
export function SheetSection({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  const id = useId();
  return (
    <section className={[styles.section, className ?? ""].filter(Boolean).join(" ")} aria-labelledby={title ? id : undefined}>
      {title ? (
        <h3 id={id} className={styles.sectionTitle}>
          {title}
        </h3>
      ) : null}
      {children}
    </section>
  );
}

/** 조용한 텍스트 동작 ("빼기" · "칸 없음으로" — 채움·테두리 없음, 15/600 기본색, 누름 영역 44, 핑크 아님) */
export function SheetTextAction({ children, className, type = "button", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={[styles.textAction, className ?? ""].filter(Boolean).join(" ")} {...rest}>
      {children}
    </button>
  );
}

/** 시트 안 안내 한 줄 (13 회색 — 빈 목록 등) · tone strong = 기본색 (실패 안내, 핑크 아님) */
export function SheetNote({ children, role, tone = "muted" }: { children: React.ReactNode; role?: "status" | "alert"; tone?: "muted" | "strong" }) {
  return (
    <p className={tone === "strong" ? styles.noteStrong : styles.note} role={role}>
      {children}
    </p>
  );
}
