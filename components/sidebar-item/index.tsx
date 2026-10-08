"use client";

import { useId } from "react";
import Link from "next/link";
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
};

/**
 * 데스크톱 사이드바 메뉴 한 줄 (시안 1.22 sidebar-item): 높이 44 · 좌우 12 · 아이콘 20 + 사이 12 + 글자 15/400.
 * 활성 = 하늘색 옅은 바탕(highlight-soft) + 하늘색 아이콘, 글자는 그대로 검정. 비활성 = 회색 아이콘. radius 0.
 */
export function SidebarItem({ label, icon, href, active = false }: Props) {
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
