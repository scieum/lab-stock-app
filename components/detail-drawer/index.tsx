"use client";

import { useEffect, useId, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { linkPrefetch } from "@/lib/link-prefetch";
import styles from "./styles.module.css";

type Props = {
  /** 제목 (20/700) — 시약명 · "사용 기록" · "MSDS · 질산은" · "판매처 등록" */
  title: React.ReactNode;
  /** 제목 아래 회색 한 줄 (12) — "에탄올 · 현재 1,200 mL" · 출처 줄 */
  caption?: React.ReactNode;
  /**
   * 위 줄 뒤로 링크 (시안 4·16 drawer-nav "‹ 시약 상세"). 있으면 제목은 그 아래 drawer-title 로,
   * 없으면 제목과 × 가 한 줄(drawer-head).
   */
  back?: { href: string; label: string };
  /** × · Esc 로 갈 주소 (드로어 상태가 주소창에 있는 화면 — 목록 주소). onClose 보다 먼저 본다 */
  closeHref?: string;
  /** × · Esc (주소 대신 화면 상태로 여닫는 드로어) */
  onClose?: () => void;
  closeLabel?: string;
  /** 아래 고정 줄 (drawer-actions: 버튼들) */
  actions?: React.ReactNode;
  /** 바뀌면 제목으로 포커스를 다시 옮긴다 (같은 드로어에서 다른 행을 열 때) */
  focusKey?: string;
  /** true = 제자리 상자 (갤러리 — 화면 높이 고정·포커스 이동 없음) */
  inline?: boolean;
  children?: React.ReactNode;
  className?: string;
};

/** 드로어 밖에서 지금 열린 고르기 창(팝오버·시트·메뉴·모달) — 있으면 Esc 는 그쪽이 먼저 닫는다 */
function overlayOpen(drawer: HTMLElement | null): boolean {
  const open = document.querySelectorAll("[role='dialog'], [role='menu'], [role='listbox'], [role='alertdialog']");
  for (const el of open) {
    if (el === drawer) continue;
    // 숨은 것(다른 폭 전용 사본 등)은 보지 않는다
    if (el.getClientRects().length === 0) continue;
    return true;
  }
  return false;
}

/**
 * 오른쪽 상세 드로어 (디자인 1.24 detail-drawer, rules.json desktop_shell.drawer_width 480):
 * 데스크톱에서 본문을 밀어내는 오른쪽 열 (사이드바 240 + 본문 + 드로어 480) — 화면 높이로 고정(sticky), 본문만 스크롤.
 * 흰 바탕 + 왼쪽 hairline. 안쪽 24 · 묶음 사이 16. 위: 제목 + ×(44, 하늘색) 또는 뒤로 링크 + × → 제목·캡션.
 * 아래 drawer-actions: 위 hairline, 안쪽 16·24, 버튼 사이 8.
 * 열리면 제목으로 포커스를 옮기고, 닫히면(× · Esc) 연 곳(목록 행)으로 돌려준다. 비모달(뒤 목록을 계속 쓸 수 있다).
 * Esc 는 드로어 안·밖에 다른 고르기 창(팝오버·메뉴·모달)이 열려 있으면 그쪽에 양보한다.
 */
export function DetailDrawer({
  title,
  caption,
  back,
  closeHref,
  onClose,
  closeLabel = "닫기",
  actions,
  focusKey,
  inline = false,
  children,
  className,
}: Props) {
  const router = useRouter();
  const titleId = useId();
  const rootRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  // 열릴 때(·다른 행으로 바뀔 때) 제목으로 포커스, 연 요소를 기억
  useEffect(() => {
    const active = document.activeElement;
    if (inline) return;
    if (active instanceof HTMLElement && active !== document.body && !rootRef.current?.contains(active)) opener.current = active;
    titleRef.current?.focus({ preventScroll: true });
  }, [focusKey, inline]);

  // 닫히면(드로어가 사라지면) 연 곳으로 포커스를 돌려준다 — 포커스가 갈 곳을 잃었을 때만
  useEffect(
    () => () => {
      const from = opener.current;
      // 주소 이동 뒤 목록이 다시 보일 때까지 몇 프레임 기다리며 시도한다 (포커스가 갈 곳을 잃었을 때만)
      let tries = 0;
      const attempt = () => {
        const now = document.activeElement;
        if (now && now !== document.body) return;
        if (from && from.isConnected) {
          from.focus({ preventScroll: true });
          if (document.activeElement === from) return;
        }
        if (++tries < 60) window.requestAnimationFrame(attempt);
      };
      window.requestAnimationFrame(attempt);
    },
    [],
  );

  const close = () => {
    if (closeHref) router.push(closeHref, { scroll: false });
    else onClose?.();
  };
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    if (inline || (!closeHref && !onClose)) return;
    // 캡처 단계에서 본다 — 다른 창의 Esc 처리(문서 단계)가 그 창을 닫기 전에 "열려 있었는지" 판정한다
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (overlayOpen(rootRef.current)) return;
      closeRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [closeHref, onClose, inline]);

  const closeButton =
    closeHref || onClose ? (
      closeHref ? (
        <Link href={closeHref} scroll={false} prefetch={linkPrefetch(closeHref)} className={styles.close} aria-label={closeLabel} data-name="drawer-close">
          <Icon name="close" className={styles.closeIcon} />
        </Link>
      ) : (
        <button type="button" className={styles.close} aria-label={closeLabel} onClick={close} data-name="drawer-close">
          <Icon name="close" className={styles.closeIcon} />
        </button>
      )
    ) : null;

  const heading = (
    <h2 id={titleId} ref={titleRef} tabIndex={-1} className={styles.title}>
      {title}
    </h2>
  );

  return (
    <section
      ref={rootRef}
      data-component="detail-drawer"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className={[styles.drawer, inline ? styles.inline : "", className ?? ""].filter(Boolean).join(" ")}
    >
      <div className={styles.body} data-name="drawer-body">
        {back ? (
          <>
            <div className={styles.headRow} data-name="drawer-nav">
              <Link href={back.href} scroll={false} prefetch={linkPrefetch(back.href)} className={styles.back} data-name="back-link">
                ‹ {back.label}
              </Link>
              {closeButton}
            </div>
            <div className={styles.titleBlock} data-name="drawer-title">
              {heading}
              {caption ? <p className={styles.caption}>{caption}</p> : null}
            </div>
          </>
        ) : (
          <>
            <div className={styles.headRow} data-name="drawer-head">
              {heading}
              {closeButton}
            </div>
            {caption ? <p className={styles.caption}>{caption}</p> : null}
          </>
        )}
        {children}
      </div>
      {actions ? (
        <div className={styles.actions} data-name="drawer-actions">
          {actions}
        </div>
      ) : null}
    </section>
  );
}

/** 드로어 안 정보 줄 묶음 (시안 info-rows · usage-form · vendor-form) */
export function DrawerRows({ children, label, name = "info-rows" }: { children: React.ReactNode; label?: string; name?: string }) {
  return (
    <div className={styles.rows} role={label ? "group" : undefined} aria-label={label} data-name={name}>
      {children}
    </div>
  );
}

/**
 * 드로어 안 정보 한 줄 (시안 info-row: 위아래 12 · 아래 hairline, 라벨 104 칸 12 회색 + 값 15).
 * display = 큰 숫자(32/700) + 단위(15 회색) — "현재 재고 2 병".
 */
export function DrawerRow({ label, children, unit, display = false }: { label: string; children: React.ReactNode; unit?: string; display?: boolean }) {
  return (
    <div className={styles.row} data-name="info-row">
      <span className={styles.rowLabel}>{label}</span>
      <span className={styles.rowValue}>
        {display ? (
          <span className={styles.display}>
            <span className={styles.displayValue}>{children}</span>
            {unit ? <span className={styles.displayUnit}>{unit}</span> : null}
          </span>
        ) : (
          children
        )}
      </span>
    </div>
  );
}

/**
 * 드로어 안 입력 한 줄 (시안 form-row: 위아래 12 · 아래 hairline, 라벨 104 칸(13 회색 + "필수" 12 회색) + 입력 311).
 * 입력(TextInput 등)은 라벨 없이 넘기고 htmlFor 로 이 라벨과 잇는다.
 */
export function DrawerField({
  label,
  required = false,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.row} data-name="form-row">
      <span className={styles.fieldLabel}>
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>}
        {required ? <span className={styles.required}>필수</span> : null}
      </span>
      <div className={styles.fieldValue}>{children}</div>
    </div>
  );
}

/** drawer-actions 안 버튼 줄 (버튼이 폭을 나눠 가진다). wideLast = 마지막(주) 버튼을 더 넓게 */
export function DrawerActionRow({ children, wideLast = false }: { children: React.ReactNode; wideLast?: boolean }) {
  return <div className={[styles.actionRow, wideLast ? styles.wideLast : ""].filter(Boolean).join(" ")}>{children}</div>;
}
