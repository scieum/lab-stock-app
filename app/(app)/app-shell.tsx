"use client";

import { usePathname } from "next/navigation";
import { NavPill, type NavLinkItem } from "@/components/nav-pill";
import { TabBar, type TabKey } from "@/components/tab-bar";
import styles from "./shell.module.css";

// 시안 13-desktop nav-links 순서
// staffOnly = 교사·admin 에게만 보인다 (s2-spec 화면 7: 학생 nav 에는 입고 진입 링크가 없다)
const LINKS: { label: string; href: string; staffOnly?: boolean }[] = [
  { label: "홈", href: "/" },
  { label: "시약 목록", href: "/reagents" },
  { label: "사용 기록 내역", href: "/usage" },
  { label: "시약장 설정", href: "/cabinets" },
  { label: "QR 스캔", href: "/scan" },
  { label: "재주문 알림", href: "/reorder" },
  { label: "입고·시약 등록", href: "/intake", staffOnly: true },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

function activeTab(pathname: string): TabKey | undefined {
  if (pathname === "/") return "home";
  if (isActive(pathname, "/reagents")) return "reagents";
  // s2-spec 화면 7: 모바일 활성 탭 = "시약"
  if (isActive(pathname, "/intake")) return "reagents";
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

/** 최상위 섹션인데 모바일 nav-pill 에 제목을 같이 보여 주는 화면 (시안 7-mobile · 10-mobile: 워드마크 + nav-title) */
function sectionTitle(pathname: string): string | undefined {
  if (isActive(pathname, "/intake")) return "입고·시약 등록";
  // 시안 10-mobile: 워드마크 + "사용 기록 내역" (/usage/new 는 하위 화면이라 subPage 가 먼저 잡는다)
  if (/^\/usage\/?$/.test(pathname)) return "사용 기록 내역";
  return undefined;
}

type Props = {
  schoolName: string;
  /** 교사·admin 여부 — false 면 staffOnly 링크를 그리지 않는다 */
  staff?: boolean;
  children: React.ReactNode;
};

export function AppShell({ schoolName, staff = false, children }: Props) {
  const pathname = usePathname();
  const sub = subPage(pathname);
  const links: NavLinkItem[] | undefined = sub
    ? sub.links
    : LINKS.filter((l) => staff || !l.staffOnly).map((l) => ({
        label: l.label,
        href: l.href,
        active: isActive(pathname, l.href),
      }));
  return (
    <div className={styles.shell}>
      <div className={styles.content}>
        <NavPill
          schoolName={schoolName}
          links={links}
          title={sub?.title}
          backHref={sub?.backHref}
          sectionTitle={sub ? undefined : sectionTitle(pathname)}
        />
        <main className={styles.main}>{children}</main>
      </div>
      <TabBar active={activeTab(pathname)} />
    </div>
  );
}
