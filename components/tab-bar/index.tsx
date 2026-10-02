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

type Props = {
  active?: TabKey;
  /**
   * true(기본) = 모바일 폭에서만 DOM 에 둔다(데스크톱은 nav-pill 링크). 하단 고정.
   * false = 폭과 관계없이 그 자리에 그린다(컴포넌트 갤러리용).
   */
  responsive?: boolean;
};

/** 모바일 하단 탭바 — 전폭 사각형(radius 0), 탭 4개 */
export function TabBar({ active, responsive = true }: Props) {
  const mobile = useSyncExternalStore(subscribe, isMobile, () => true);
  if (responsive && !mobile) return null;
  return (
    <nav
      data-component="tab-bar"
      aria-label="하단 탭"
      className={[styles.bar, responsive ? styles.fixed : ""].join(" ").trim()}
    >
      {TABS.map((t) => (
        <TabItem key={t.key} label={t.label} href={t.href} icon={t.icon} active={t.key === active} />
      ))}
    </nav>
  );
}
