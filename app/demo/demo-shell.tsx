"use client";

import { usePathname } from "next/navigation";
import { GuestBanner } from "@/components/guest-banner";
import { GuestToastProvider } from "@/components/guest-lock/toast";
import { NavPill, type NavLinkItem } from "@/components/nav-pill";
import { TabBar, type TabKey } from "@/components/tab-bar";
import shell from "@/app/(app)/shell.module.css";
import styles from "./demo.module.css";

// 시안 13-guest-desktop nav-links: 홈 · 시약 목록 · QR 스캔(잠금) · 사용 기록 내역(잠금)
const LINKS: { label: string; href: string; locked?: boolean }[] = [
  { label: "홈", href: "/demo" },
  { label: "시약 목록", href: "/demo/reagents" },
  { label: "QR 스캔", href: "/scan", locked: true },
  { label: "사용 기록 내역", href: "/usage", locked: true },
];

function isActive(pathname: string, href: string) {
  return href === "/demo" ? pathname === "/demo" : pathname === href || pathname.startsWith(href + "/");
}

function activeTab(pathname: string): TabKey | undefined {
  if (pathname === "/demo") return "home";
  if (isActive(pathname, "/demo/reagents")) return "reagents";
  return undefined;
}

type Props = { schoolName: string; children: React.ReactNode };

/** 둘러보기 셸 — nav-pill(데모 학교) → guest-banner → 본문, 모바일 하단 tab-bar(guest) */
export function DemoShell({ schoolName, children }: Props) {
  const pathname = usePathname();
  const detail = /^\/demo\/reagents\/[^/]+\/?$/.test(pathname);
  const links: NavLinkItem[] = LINKS.map((l) => ({ ...l, active: !l.locked && isActive(pathname, l.href) }));
  return (
    <GuestToastProvider>
      <div className={shell.shell}>
        <div className={shell.content}>
          <NavPill
            schoolName={schoolName}
            links={links}
            title={detail ? "시약 상세" : undefined}
            backHref={detail ? "/demo/reagents" : undefined}
          />
          <GuestBanner signupHref="/signup" className={styles.banner} />
          <main className={shell.main}>{children}</main>
        </div>
        <TabBar guest active={activeTab(pathname)} />
      </div>
    </GuestToastProvider>
  );
}
