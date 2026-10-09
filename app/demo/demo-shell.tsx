"use client";

import { usePathname } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { GuestBanner } from "@/components/guest-banner";
import { GuestToastProvider } from "@/components/guest-lock/toast";
import { NavPill, type NavLinkItem } from "@/components/nav-pill";
import { TabBar, type TabKey } from "@/components/tab-bar";
import { guestSidebarActiveKey, guestSidebarMenu } from "@/lib/sidebar-menu";
import { useIsDesktop } from "@/lib/use-viewport";
import shell from "@/app/(app)/shell.module.css";
import styles from "./demo.module.css";

// 시안 13-guest-mobile nav-links (모바일 nav-pill — 데스크톱 링크 줄은 쓰지 않는다): 홈 · 시약 목록 · QR 스캔(잠금) · 사용 기록 내역(잠금)
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

/** 화면 16 둘러보기 /demo/msds/[id] — 모바일 nav 제목을 페이지가 알아 nav-pill·guest-banner 는 페이지가 DemoNav 로 그린다 */
function isDemoMsdsPath(pathname: string) {
  return /^\/demo\/msds\/[^/]+\/?$/.test(pathname);
}

/** 데스크톱 목록 + 드로어 화면 (2g · 3g · 16g) — 여백은 목록 틀(desk frame)이 둔다 */
function isDemoDeskPath(pathname: string) {
  return /^\/demo\/(reagents(\/[^/]+)?|msds\/[^/]+)\/?$/.test(pathname);
}

type Props = { schoolName: string; children: React.ReactNode };

type DemoNavProps = {
  schoolName: string;
  /** 화면 16: 뒤로가기 + 제목 */
  page?: { title: string; backHref: string; activeHref: string };
};

/**
 * 둘러보기 모바일 nav-pill + guest-banner (셸 맨 위 두 줄). 모바일 폭에서만 —
 * 데스크톱(≥ 1024)은 nav-pill 없이 셸의 app-sidebar + 본문 위 guest-banner (d7 §23 run d).
 * 첫 그림(폭 모름)에는 그려 두고 CSS 로 데스크톱에서 숨긴 뒤, 하이드레이션 뒤 데스크톱이면 DOM 에서 뺀다.
 */
export function DemoNav(props: DemoNavProps) {
  const desktop = useIsDesktop();
  if (desktop) return null;
  return (
    <div className={shell.mobileOnly}>
      <MobileDemoNav {...props} />
    </div>
  );
}

function MobileDemoNav({ schoolName, page }: DemoNavProps) {
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

/**
 * 둘러보기 셸 (rules.json 1.24 guest.desktop, d7 §23 run d).
 * - 모바일(< 1024): nav-pill(데모 학교) → guest-banner → 본문, 하단 tab-bar(guest: QR 스캔·기록 잠금) — 그대로.
 * - 데스크톱(≥ 1024): 왼쪽 app-sidebar(위 "데모 학교", 홈·시약 + 잠긴 기록·QR 찾기 guest-lock 2, 관리 메뉴 없음,
 *   아래 "둘러보는 중" + 로그인) + 오른쪽 본문 = 맨 위 guest-banner(전폭) → 로그인 후 데스크톱과 같은 본문(읽기 전용).
 */
export function DemoShell({ schoolName, children }: Props) {
  const pathname = usePathname();
  const desktop = useIsDesktop();
  const desk = isDemoDeskPath(pathname);
  return (
    <GuestToastProvider>
      <div className={[shell.shell, shell.withSidebar, styles.shell].join(" ")}>
        {desktop === false ? null : (
          <AppSidebar
            className={shell.sidebar}
            schoolName={schoolName}
            groups={guestSidebarMenu()}
            active={guestSidebarActiveKey(pathname)}
            guest={{ loginHref: "/login" }}
          />
        )}
        <div className={[shell.content, shell.beside, styles.content].join(" ")}>
          {isDemoMsdsPath(pathname) ? null : <DemoNav schoolName={schoolName} />}
          {desktop === false ? null : (
            <div className={styles.desktopOnly}>
              <GuestBanner signupHref="/signup" className={styles.deskBanner} />
            </div>
          )}
          <main className={[shell.main, desk ? styles.flush : styles.pageBody].join(" ")}>{children}</main>
        </div>
        <TabBar guest active={activeTab(pathname)} />
      </div>
    </GuestToastProvider>
  );
}
