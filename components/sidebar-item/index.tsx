"use client";

import { useId } from "react";
import Link from "next/link";
import { GuestLock } from "@/components/guest-lock";
import { useGuestToast } from "@/components/guest-lock/toast";
import { Icon, type IconName } from "@/components/icons";
import { LinkPending } from "@/components/link-pending";
import { linkPrefetch } from "@/lib/link-prefetch";
import styles from "./styles.module.css";

type Props = {
  label: string;
  icon: IconName;
  /** 없으면 비활성 — 아직 없는 화면(QR 찾기 = 화면 12). 눌러도 이동하지 않고 "준비 중" 툴팁 */
  href?: string;
  active?: boolean;
  /** 둘러보기 잠금 (rules.json guest.sidebar_locks) — 글자 뒤 guest-lock, 누르면 ex-toast (GuestToastProvider 안에서만) */
  locked?: boolean;
};

/** 둘러보기 잠긴 메뉴 (시안 13-guest-desktop sidebar-item + guest-lock): 모양은 비활성 항목, 누르면 "가입하면 쓸 수 있어요" */
function LockedSidebarItem({ label, icon }: { label: string; icon: IconName }) {
  const { show } = useGuestToast();
  return (
    <button data-component="sidebar-item" type="button" className={styles.item} onClick={show}>
      <Icon name={icon} className={styles.icon} />
      <span className={styles.label}>{label}</span>
      <GuestLock className={styles.lock} />
    </button>
  );
}

/**
 * 데스크톱 사이드바 메뉴 한 줄 (시안 1.22 sidebar-item): 높이 44 · 좌우 12 · 아이콘 20 + 사이 12 + 글자 15/400.
 * 활성 = 하늘색 옅은 바탕(highlight-soft) + 하늘색 아이콘, 글자는 그대로 검정. 비활성 = 회색 아이콘. radius 0.
 */
export function SidebarItem({ label, icon, href, active = false, locked = false }: Props) {
  if (locked) return <LockedSidebarItem label={label} icon={icon} />;
  return <SidebarLinkItem label={label} icon={icon} href={href} active={active} />;
}

function SidebarLinkItem({ label, icon, href, active = false }: Omit<Props, "locked">) {
  const tipId = useId();
  if (!href) {
    return (
      <button
        data-component="sidebar-item"
        type="button"
        className={styles.itemDisabled}
        aria-disabled="true"
        aria-describedby={tipId}
      >
        <Icon name={icon} className={styles.icon} />
        <span className={styles.label}>{label}</span>
        <span id={tipId} role="tooltip" className={styles.tooltip}>
          준비 중
        </span>
      </button>
    );
  }
  return (
    <Link
      data-component="sidebar-item"
      href={href}
      prefetch={linkPrefetch(href)}
      className={active ? styles.itemActive : styles.item}
      aria-current={active ? "page" : undefined}
    >
      <Icon name={icon} className={styles.icon} />
      <span className={styles.label}>{label}</span>
      <LinkPending />
    </Link>
  );
}
