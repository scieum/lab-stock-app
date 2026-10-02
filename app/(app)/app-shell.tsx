"use client";

import { usePathname } from "next/navigation";
import { NavPill, type NavLinkItem } from "@/components/nav-pill";
import { TabBar, type TabKey } from "@/components/tab-bar";
import styles from "./shell.module.css";

// 시안 13-desktop nav-links 순서
const LINKS: { label: string; href: string }[] = [
  { label: "홈", href: "/" },
  { label: "시약 목록", href: "/reagents" },
  { label: "사용 기록 내역", href: "/usage" },
  { label: "시약장 설정", href: "/cabinets" },
  { label: "QR 스캔", href: "/scan" },
  { label: "재주문 알림", href: "/reorder" },
  { label: "입고·시약 등록", href: "/intake" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

function activeTab(pathname: string): TabKey | undefined {
  if (pathname === "/") return "home";
  if (isActive(pathname, "/reagents")) return "reagents";
  if (isActive(pathname, "/scan")) return "scan";
  if (isActive(pathname, "/usage")) return "records";
  return undefined;
}

type SubPage = { title: string; backHref: string; links?: { label: string; href: string; active?: boolean }[] };

/** 하위 화면 (시안: nav-pill = 뒤로가기 + 제목 + 학교명. 화면 4 데스크톱은 링크 2개) */
function subPage(pathname: string): SubPage | undefined {
  if (/^\/reagents\/[^/]+\/?$/.test(pathname)) return { title: "시약 상세", backHref: "/reagents" };
  if (/^\/usage\/new\/?$/.test(pathname)) {
    // 시안 4-desktop nav-links: 시약 목록(활성) · 재주문 알림
    return {
      title: "사용 기록",
      backHref: "/reagents",
      links: [
        { label: "시약 목록", href: "/reagents", active: true },
        { label: "재주문 알림", href: "/reorder" },
      ],
    };
  }
  return undefined;
}

type Props = { schoolName: string; children: React.ReactNode };

export function AppShell({ schoolName, children }: Props) {
  const pathname = usePathname();
  const sub = subPage(pathname);
  const links: NavLinkItem[] | undefined = sub
    ? sub.links
    : LINKS.map((l) => ({ ...l, active: isActive(pathname, l.href) }));
  return (
    <div className={styles.shell}>
      <div className={styles.content}>
        <NavPill schoolName={schoolName} links={links} title={sub?.title} backHref={sub?.backHref} />
        <main className={styles.main}>{children}</main>
      </div>
      <TabBar active={activeTab(pathname)} />
    </div>
  );
}
