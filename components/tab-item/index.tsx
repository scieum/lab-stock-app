"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Toast } from "@/components/ex-toast";
import { GuestLock } from "@/components/guest-lock";
import { useGuestToast } from "@/components/guest-lock/toast";
import { Icon } from "@/components/icons";
import { LinkPending } from "@/components/link-pending";
import { TAB_SOON_TOAST, TabSoon } from "@/components/tab-soon";
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
  /**
   * 아직 없는 화면 (디자인 1.26 tab_bar.qr_pending — 화면 12 전까지 QR 스캔): 회색(text-faint) 아이콘·라벨 + 아래 tab-soon "준비 중".
   * 링크 대신 버튼 — 누르면 ex-toast "준비 중이에요" 만 (이동 없음)
   */
  soon?: boolean;
};

const SOON_TOAST_MS = 2500;

/** 준비 중 탭 (이동 없음, 누르면 토스트) */
function SoonTabItem({ label, icon }: { label: string; icon: Props["icon"] }) {
  const [shownAt, setShownAt] = useState(0);
  useEffect(() => {
    if (!shownAt) return;
    const t = setTimeout(() => setShownAt(0), SOON_TOAST_MS);
    return () => clearTimeout(t);
  }, [shownAt]);
  return (
    <>
      <button
        data-component="tab-item"
        type="button"
        className={[styles.item, styles.soon].join(" ")}
        onClick={() => setShownAt(Date.now())}
      >
        <Icon name={icon} className={styles.icon} />
        <span className={styles.label}>{label}</span>
        <TabSoon />
      </button>
      {shownAt ? (
        <Toast key={shownAt} floating>
          {TAB_SOON_TOAST}
        </Toast>
      ) : null}
    </>
  );
}

/** 하단 탭바 항목 (활성: 검정 글자 + 하늘색 아이콘, 비활성: 회색) */
export function TabItem({ label, href, icon, active, locked, soon }: Props) {
  const { show } = useGuestToast();
  if (soon && !locked) return <SoonTabItem label={label} icon={icon} />;
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
