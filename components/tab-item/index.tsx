"use client";

import Link from "next/link";
import { GuestLock } from "@/components/guest-lock";
import { useGuestToast } from "@/components/guest-lock/toast";
import { Icon } from "@/components/icons";
import { LinkPending } from "@/components/link-pending";
import { linkPrefetch } from "@/lib/link-prefetch";
import styles from "./styles.module.css";

type Props = {
  label: string;
  href: string;
  icon: "home" | "flask" | "qr" | "record";
  active?: boolean;
  /**
   * 둘러보기 잠금 (시안 13·2·3-guest tab-bar: QR 스캔·기록). 링크 대신 버튼 — 아이콘 오른쪽 위에 guest-lock,
   * 누르면 ex-toast "가입하면 쓸 수 있어요" 만 띄운다 (이동·요청 없음).
   */
  locked?: boolean;
};

/** 하단 탭바 항목 (활성: 검정 글자 + 하늘색 아이콘, 비활성: 회색) */
export function TabItem({ label, href, icon, active, locked }: Props) {
  const { show } = useGuestToast();
  if (locked) {
    return (
      <button data-component="tab-item" type="button" className={styles.item} onClick={show}>
        <span className={styles.iconWrap}>
          <Icon name={icon} className={styles.icon} />
          <GuestLock className={styles.lock} />
        </span>
        <span className={styles.label}>{label}</span>
      </button>
    );
  }
  return (
    <Link
      data-component="tab-item"
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
