"use client";

import { GuestLock } from "@/components/guest-lock";
import { useGuestToast } from "@/components/guest-lock/toast";
import styles from "./styles.module.css";

/** 둘러보기 데스크톱 nav-link 잠금 (시안 13·2·3-guest-desktop nav-links: QR 스캔·사용 기록 내역 + guest-lock) */
export function NavLinkLocked({ label }: { label: string }) {
  const { show } = useGuestToast();
  return (
    <button type="button" className={styles.link} onClick={show}>
      <span className={styles.linkRow}>
        {label}
        <GuestLock />
      </span>
    </button>
  );
}
