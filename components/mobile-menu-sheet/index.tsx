"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ButtonPrimary } from "@/components/button-primary";
import { GuestLock } from "@/components/guest-lock";
import { useGuestToast } from "@/components/guest-lock/toast";
import { Icon } from "@/components/icons";
import { LinkPending } from "@/components/link-pending";
import { linkPrefetch } from "@/lib/link-prefetch";
import type { SidebarGroup, SidebarKey } from "@/lib/sidebar-menu";
import styles from "./styles.module.css";

export const MOBILE_MENU_TEXT = {
  close: "닫기",
  logout: "로그아웃",
  signup: "가입하기",
  guestSchool: "데모 학교",
} as const;

type Props = {
  id?: string;
  /** 학교명 (둘러보기 = "데모 학교") */
  schoolName: string;
  /** "정OO · admin" (lib/sidebar-menu sidebarAccountLabel). 둘러보기는 없음 */
  account?: string;
  /** 역할별 묶음 (lib/sidebar-menu mobileMenu · guestMobileMenu — 데스크톱 사이드바와 같은 출처) */
  groups: SidebarGroup[];
  /** 지금 화면 (sidebarActiveKey · guestSidebarActiveKey) */
  active?: SidebarKey;
  onClose?: () => void;
  /** 맨 아래 "로그아웃" (d7 §10 과 같은 동작) */
  onLogout?: () => void | Promise<void>;
  /** 둘러보기: 로그아웃 대신 button-primary "가입하기" */
  guest?: { signupHref: string };
  /** true(기본) = 전체 높이 바텀시트(fixed). false = 제자리(갤러리) */
  floating?: boolean;
};

/**
 * 모바일 전체 메뉴 시트 (rules 1.28 mobile_menu.sheet, 시안 13-menu-mobile mobile-menu-sheet):
 * 전체 높이 바텀시트(위 radius 24, 아래 0, border-strong 테두리) — 머리 = 학교명(17/600) + "이름 · 역할"(12 muted) + × 44, 아래 hairline-soft.
 * 묶음 = desktop_shell.menu 와 같은 역할별 묶음(묶음 사이 hairline-soft + 묶음 제목 12 muted), 항목 = 아이콘 20 + 15 글자, 52 높이, 사각.
 * 지금 화면 = highlight-soft 채움 + highlight 아이콘 + 600. 맨 아래 "로그아웃"(조용한 15 muted). 둘러보기 잠금 = guest-lock + 토스트.
 */
export function MobileMenuSheet({ id, schoolName, account, groups, active, onClose, onLogout, guest, floating = true }: Props) {
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const { show } = useGuestToast();

  useEffect(() => {
    if (!floating) return;
    const before = document.activeElement;
    rootRef.current?.focus({ preventScroll: true });
    return () => {
      if (before instanceof HTMLElement && before.isConnected) before.focus({ preventScroll: true });
    };
  }, [floating]);

  useEffect(() => {
    if (!onClose || !floating) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, floating]);

  const logout = async () => {
    if (leaving) return;
    setLeaving(true);
    try {
      await onLogout?.();
    } finally {
      setLeaving(false);
    }
  };

  return (
    <div
      ref={rootRef}
      id={id}
      data-component="mobile-menu-sheet"
      role="dialog"
      aria-modal={floating ? "true" : undefined}
      aria-labelledby={titleId}
      tabIndex={-1}
      className={[styles.sheet, floating ? styles.floating : ""].filter(Boolean).join(" ")}
    >
      <div className={styles.head} data-name="sheet-head">
        <div className={styles.titleBox} data-name="sheet-title">
          <h2 id={titleId} className={styles.school}>
            {schoolName}
          </h2>
          {account ? <p className={styles.user}>{account}</p> : null}
        </div>
        {onClose ? (
          <button type="button" className={styles.close} aria-label={MOBILE_MENU_TEXT.close} onClick={onClose}>
            <Icon name="close" className={styles.closeIcon} />
          </button>
        ) : null}
      </div>
      <nav className={styles.list} aria-label="전체 메뉴" data-name="menu-list">
        {groups.map((g, gi) => (
          <div key={g.title ?? gi} role="group" aria-label={g.title} className={[styles.group, gi > 0 ? styles.groupLine : ""].filter(Boolean).join(" ")}>
            {g.title ? (
              <p className={styles.groupTitle} aria-hidden="true" data-name="menu-group-title">
                {g.title}
              </p>
            ) : null}
            {g.items.map((it) =>
              it.locked || !it.href ? (
                <button key={it.key} type="button" className={styles.item} data-name="menu-item" onClick={show}>
                  <Icon name={it.icon} className={styles.icon} />
                  <span className={styles.label}>{it.label}</span>
                  <GuestLock className={styles.lock} />
                </button>
              ) : (
                <Link
                  key={it.key}
                  href={it.href}
                  prefetch={linkPrefetch(it.href)}
                  className={it.key === active ? styles.itemActive : styles.item}
                  aria-current={it.key === active ? "page" : undefined}
                  data-name="menu-item"
                  onClick={onClose}
                >
                  <Icon name={it.icon} className={styles.icon} />
                  <span className={styles.label}>{it.label}</span>
                  <LinkPending />
                </Link>
              ),
            )}
          </div>
        ))}
      </nav>
      <div className={styles.foot}>
        {guest ? (
          <ButtonPrimary href={guest.signupHref} fullWidth>
            {MOBILE_MENU_TEXT.signup}
          </ButtonPrimary>
        ) : onLogout ? (
          <button type="button" className={styles.logout} data-name="menu-logout" disabled={leaving} aria-busy={leaving || undefined} onClick={logout}>
            {MOBILE_MENU_TEXT.logout}
          </button>
        ) : null}
      </div>
    </div>
  );
}
