"use client";

import { usePathname } from "next/navigation";
import { NavPill, type NavLinkItem } from "@/components/nav-pill";
import { TabBar, type TabKey } from "@/components/tab-bar";
import styles from "./shell.module.css";

// 시안 13-desktop nav-links 순서
// staffOnly = 교사·admin 에게만 보인다 (s2-spec 화면 7: 학생 nav 에는 입고 진입 링크가 없다)
// adminOnly = admin 에게만 보인다 (s2-spec 화면 8: 학생·교사 nav 에는 사용자 관리 진입 링크가 없다)
// 재주문 알림 = 교사·admin (s2-spec 화면 6: 학생 nav 에 진입 링크 없음), 판매처 설정 = admin (화면 9)
const LINKS: { label: string; href: string; staffOnly?: boolean; adminOnly?: boolean }[] = [
  { label: "홈", href: "/" },
  { label: "시약 목록", href: "/reagents" },
  { label: "사용 기록 내역", href: "/usage" },
  { label: "시약장 설정", href: "/cabinets" },
  { label: "QR 스캔", href: "/scan" },
  { label: "재주문 알림", href: "/reorder", staffOnly: true },
  { label: "입고·시약 등록", href: "/intake", staffOnly: true },
  { label: "사용자 관리", href: "/users", adminOnly: true },
  { label: "판매처 설정", href: "/vendors", adminOnly: true },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

function activeTab(pathname: string): TabKey | undefined {
  if (pathname === "/") return "home";
  // s2-spec 화면 8: 모바일 활성 탭 = "홈" (홈 quick-action "사용자 관리"로 들어온다)
  if (isActive(pathname, "/users")) return "home";
  if (isActive(pathname, "/reagents")) return "reagents";
  // s2-spec 화면 7: 모바일 활성 탭 = "시약"
  if (isActive(pathname, "/intake")) return "reagents";
  // s2-spec 화면 11 (run 20261004-2256): 모바일 활성 탭 = "시약" (11 · 11-empty · 11-delete 모두)
  if (isActive(pathname, "/cabinets")) return "reagents";
  // s2-spec 화면 6 · 9: 모바일 활성 탭 = "시약"
  if (isActive(pathname, "/reorder") || isActive(pathname, "/vendors")) return "reagents";
  if (isActive(pathname, "/scan")) return "scan";
  if (isActive(pathname, "/usage")) return "records";
  // s2-spec 화면 5: 모바일 활성 탭 = "기록" (명세 표기 그대로)
  if (isActive(pathname, "/manual")) return "records";
  return undefined;
}

type SubPage = { title: string; backHref: string; links?: { label: string; href: string; active?: boolean }[] };

/** 하위 화면 (시안: nav-pill = 뒤로가기 + 제목 + 학교명. 화면 4 데스크톱은 링크 2개) */
function subPage(pathname: string, staff: boolean): SubPage | undefined {
  if (/^\/reagents\/[^/]+\/?$/.test(pathname)) return { title: "시약 상세", backHref: "/reagents" };
  if (/^\/usage\/new\/?$/.test(pathname)) {
    // 시안 4-desktop nav-links: 시약 목록(활성) · 재주문 알림 (재주문 알림은 교사·admin 만 — 학생 nav 에는 없다)
    return {
      title: "사용 기록",
      backHref: "/reagents",
      links: [
        { label: "시약 목록", href: "/reagents", active: true },
        ...(staff ? [{ label: "재주문 알림", href: "/reorder" }] : []),
      ],
    };
  }
  // 화면 5 실험 매뉴얼: 화면 6(재주문 알림)의 하위 화면 — 뒤로가기는 화면 6, 데스크톱 nav 는 "재주문 알림"을 현재 섹션으로 표시.
  // 학생은 이 화면에 오지 못한다(page 가 / 로 보낸다) — 그래도 학생 nav 에는 재주문 알림 링크를 그리지 않는다
  if (/^\/manual\/?$/.test(pathname)) {
    return {
      title: "실험 매뉴얼",
      backHref: "/reorder",
      links: staff ? [{ label: "재주문 알림", href: "/reorder", active: true }] : undefined,
    };
  }
  return undefined;
}

/** 최상위 섹션인데 모바일 nav-pill 에 제목을 같이 보여 주는 화면 (시안 7-mobile · 10-mobile: 워드마크 + nav-title) */
function sectionTitle(pathname: string): string | undefined {
  if (isActive(pathname, "/intake")) return "입고·시약 등록";
  // 시안 10-mobile: 워드마크 + "사용 기록 내역" (/usage/new 는 하위 화면이라 subPage 가 먼저 잡는다)
  if (/^\/usage\/?$/.test(pathname)) return "사용 기록 내역";
  // 시안 8-mobile: 워드마크 + "사용자 관리"
  if (isActive(pathname, "/users")) return "사용자 관리";
  // 시안 11-mobile: 워드마크 + "시약장 설정"
  if (isActive(pathname, "/cabinets")) return "시약장 설정";
  // 시안 6-mobile · 9-mobile: 워드마크 + 제목
  if (isActive(pathname, "/reorder")) return "재주문 알림";
  if (isActive(pathname, "/vendors")) return "판매처 설정";
  return undefined;
}

type Props = {
  schoolName: string;
  /** 교사·admin 여부 — false 면 staffOnly 링크를 그리지 않는다 */
  staff?: boolean;
  /** admin 여부 — false 면 adminOnly 링크를 그리지 않는다 */
  admin?: boolean;
  children: React.ReactNode;
};

/**
 * 로그아웃 (d7 §10): 세션 쿠키를 지운 뒤 /login 으로 문서 전체를 새로 연다 —
 * 라우터가 쥐고 있던 화면(자기 학교 데이터)이 남지 않는다. 실패하면 던져서 메뉴가 안내를 보여 준다.
 */
async function logout() {
  const res = await fetch("/api/auth/logout", { method: "POST" });
  if (!res.ok) throw new Error("logout failed");
  // 일부러 라우터 이동(router.push)이 아닌 문서 이동 — 라우터 캐시까지 비운다
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/login");
  // 문서가 바뀔 때까지 메뉴를 "진행 중"으로 둔다 (다시 누르지 못하게)
  await new Promise<never>(() => {});
}

export function AppShell({ schoolName, staff = false, admin = false, children }: Props) {
  const pathname = usePathname();
  const sub = subPage(pathname, staff);
  const links: NavLinkItem[] | undefined = sub
    ? sub.links
    : LINKS.filter((l) => (staff || !l.staffOnly) && (admin || !l.adminOnly)).map((l) => ({
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
          onLogout={logout}
        />
        <main className={styles.main}>{children}</main>
      </div>
      <TabBar active={activeTab(pathname)} />
    </div>
  );
}
