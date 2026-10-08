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
  if (isDemoMsdsPath(pathname)) return "reagents";
  return undefined;
}

/** 화면 16 둘러보기 /demo/msds/[id] — nav 제목을 페이지가 알아 nav-pill·guest-banner 는 페이지가 DemoNav 로 그린다 */
function isDemoMsdsPath(pathname: string) {
  return /^\/demo\/msds\/[^/]+\/?$/.test(pathname);
}

type Props = { schoolName: string; children: React.ReactNode };

type DemoNavProps = {
  schoolName: string;
  /** 화면 16: 뒤로가기 + 제목 (데스크톱 주 메뉴는 "시약 목록" 현재 섹션) */
  page?: { title: string; backHref: string; activeHref: string };
};

/** 둘러보기 nav-pill + guest-banner (셸 맨 위 두 줄) */
export function DemoNav({ schoolName, page }: DemoNavProps) {
  const pathname = usePathname();
  const detail = /^\/demo\/reagents\/[^/]+\/?$/.test(pathname);
  const links: NavLinkItem[] = LINKS.map((l) => ({
    ...l,
    active: !l.locked && (page ? l.href === page.activeHref : isActive(pathname, l.href)),
  }));
  return (
    <>
      <NavPill
        schoolName={schoolName}
        links={links}
        title={page ? page.title : detail ? "시약 상세" : undefined}
        backHref={page ? page.backHref : detail ? "/demo/reagents" : undefined}
        desktopWordmark={page ? true : undefined}
      />
      <GuestBanner signupHref="/signup" className={styles.banner} />
    </>
  );
}

/** 둘러보기 셸 — nav-pill(데모 학교) → guest-banner → 본문, 모바일 하단 tab-bar(guest) */
export function DemoShell({ schoolName, children }: Props) {
  const pathname = usePathname();
  return (
    <GuestToastProvider>
      <div className={shell.shell}>
        <div className={shell.content}>
          {isDemoMsdsPath(pathname) ? null : <DemoNav schoolName={schoolName} />}
          <main className={shell.main}>{children}</main>
        </div>
        <TabBar guest active={activeTab(pathname)} />
      </div>
    </GuestToastProvider>
  );
}
