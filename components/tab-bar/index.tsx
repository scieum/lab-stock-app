"use client";

import { useSyncExternalStore } from "react";
import { TabItem } from "@/components/tab-item";
import { MOBILE_MEDIA_QUERY } from "@/lib/breakpoints";
import styles from "./styles.module.css";

export type TabKey = "home" | "reagents" | "scan" | "records";

// rules.json tab_bar.labels 순서: 홈 · 시약 · QR 스캔 · 기록
const TABS: { key: TabKey; label: string; href: string; icon: "home" | "flask" | "qr" | "record" }[] = [
  { key: "home", label: "홈", href: "/", icon: "home" },
  { key: "reagents", label: "시약", href: "/reagents", icon: "flask" },
  { key: "scan", label: "QR 스캔", href: "/scan", icon: "qr" },
  { key: "records", label: "기록", href: "/usage", icon: "record" },
];

function subscribe(cb: () => void) {
  const mq = window.matchMedia(MOBILE_MEDIA_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

const isMobile = () => window.matchMedia(MOBILE_MEDIA_QUERY).matches;

/**
 * 둘러보기(/demo) 탭: 홈·시약은 데모 경로(dev-rules.json routes 13-guest·2-guest),
 * QR 스캔·기록은 잠금 (design/rules.json guest.locked_tabs, tab_locks 2)
 */
const GUEST_HREF: Partial<Record<TabKey, string>> = { home: "/demo", reagents: "/demo/reagents" };
const GUEST_LOCKED: TabKey[] = ["scan", "records"];

type Props = {
  active?: TabKey;
  /**
   * true(기본) = 모바일 폭에서만 DOM 에 둔다(데스크톱은 nav-pill 링크). 하단 고정.
   * false = 폭과 관계없이 그 자리에 그린다(컴포넌트 갤러리용).
   */
  responsive?: boolean;
  /** 둘러보기 셸 — 라벨·순서·개수는 같고 경로·잠금만 다르다 */
  guest?: boolean;
};

/** 모바일 하단 탭바 — 전폭 사각형(radius 0), 탭 4개 */
export function TabBar({ active, responsive = true, guest = false }: Props) {
  const mobile = useSyncExternalStore(subscribe, isMobile, () => true);
  if (responsive && !mobile) return null;
  return (
    <nav
      data-component="tab-bar"
      aria-label="하단 탭"
      className={[styles.bar, responsive ? styles.fixed : ""].join(" ").trim()}
    >
      {TABS.map((t) => (
        <TabItem
          key={t.key}
          label={t.label}
          href={guest ? (GUEST_HREF[t.key] ?? t.href) : t.href}
          icon={t.icon}
          active={t.key === active}
          locked={guest && GUEST_LOCKED.includes(t.key)}
        />
      ))}
    </nav>
  );
}
