"use client";

import { GuestLock } from "@/components/guest-lock";
import { useGuestToast } from "@/components/guest-lock/toast";
import { Icon, type IconName } from "@/components/icons";
import styles from "./styles.module.css";

type Props = { label: string; icon: IconName };

/** 둘러보기 빠른 실행 잠금 칸 (시안 13-guest quick-action-item + guest-lock) — 누르면 ex-toast 만 */
export function QuickActionLocked({ label, icon }: Props) {
  const { show } = useGuestToast();
  return (
    <button type="button" className={styles.item} onClick={show}>
      <span className={styles.iconBg}>
        <Icon name={icon} className={styles.icon} />
      </span>
      <span className={styles.label}>{label}</span>
      <GuestLock className={styles.lock} />
    </button>
  );
}
