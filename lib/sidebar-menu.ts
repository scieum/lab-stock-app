import type { IconName } from "@/components/icons";

/**
 * 데스크톱 app-sidebar 메뉴 (design/rules.json 1.22 desktop_shell.menu, d7 §23 셸 run a).
 * - 모두: 홈 · 시약 · 센서 · 기록 · 시약장 · QR 찾기
 * - 교사·admin: + "관리" 묶음 = 입고 · 실험 매뉴얼 · 재주문 알림
 * - admin: + "학교 설정" 묶음 = 사용자 · 판매처
 * 묶음 제목(관리 · 학교 설정)은 시안 sidebar-group-title.
 * QR 찾기 = 화면 12 `/scan` (d7 §26 — 툴팁 없는 정상 메뉴).
 */
export type SidebarRole = "student" | "teacher" | "admin";

export type SidebarKey =
  | "home"
  | "reagents"
  | "sensors"
  | "records"
  | "cabinets"
  | "scan"
  | "intake"
  | "manual"
  | "reorder"
  | "users"
  | "vendors";

export type SidebarEntry = {
  key: SidebarKey;
  label: string;
  icon: IconName;
  href?: string;
  /** 둘러보기 잠금 — 누르면 ex-toast "가입하면 쓸 수 있어요" (guest-lock), 이동 없음 */
  locked?: boolean;
};
export type SidebarGroup = { title?: string; items: SidebarEntry[] };

const ALL: SidebarEntry[] = [
  { key: "home", label: "홈", icon: "home", href: "/" },
  { key: "reagents", label: "시약", icon: "flask", href: "/reagents" },
  // 2026-10-11 디자인 1.26 desktop_shell.menu: 시약 아래 "센서" (모든 역할, 화면 17)
  { key: "sensors", label: "센서", icon: "sensor", href: "/sensors" },
  { key: "records", label: "기록", icon: "record", href: "/usage" },
  { key: "cabinets", label: "시약장", icon: "cabinet", href: "/cabinets" },
  { key: "scan", label: "QR 찾기", icon: "qr", href: "/scan" },
];

const TEACHER_ADMIN: SidebarEntry[] = [
  { key: "intake", label: "입고", icon: "download", href: "/intake" },
  { key: "manual", label: "실험 매뉴얼", icon: "book", href: "/manual" },
  { key: "reorder", label: "재주문 알림", icon: "bell", href: "/reorder" },
];

const ADMIN: SidebarEntry[] = [
  { key: "users", label: "사용자", icon: "user", href: "/users" },
  { key: "vendors", label: "판매처", icon: "store", href: "/vendors" },
];

export function sidebarMenu(role: SidebarRole): SidebarGroup[] {
  const groups: SidebarGroup[] = [{ items: ALL }];
  if (role === "teacher" || role === "admin") groups.push({ title: "관리", items: TEACHER_ADMIN });
  if (role === "admin") groups.push({ title: "학교 설정", items: ADMIN });
  return groups;
}

function under(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(base + "/");
}

/**
 * 현재 화면의 활성 메뉴 (시안 *-desktop 의 활성 sidebar-item):
 * 13 홈 · 2·3·16 시약(MSDS 요약도 시약 섹션) · 4·10 기록(시안 4-desktop 1.25 — 사용 기록 입력은 기록 섹션) · 11 시약장 · 12 QR 찾기 ·
 * 7 입고 · 5 실험 매뉴얼 · 6 재주문 알림 · 8 사용자 · 9 판매처
 */
export function sidebarActiveKey(pathname: string): SidebarKey | undefined {
  if (pathname === "/") return "home";
  if (under(pathname, "/reagents") || under(pathname, "/msds")) return "reagents";
  if (under(pathname, "/sensors")) return "sensors";
  if (under(pathname, "/usage")) return "records";
  if (under(pathname, "/cabinets")) return "cabinets";
  if (under(pathname, "/scan")) return "scan";
  if (under(pathname, "/intake")) return "intake";
  if (under(pathname, "/manual")) return "manual";
  if (under(pathname, "/reorder")) return "reorder";
  if (under(pathname, "/users")) return "users";
  if (under(pathname, "/vendors")) return "vendors";
  return undefined;
}

/**
 * 둘러보기 데스크톱 사이드바 (rules.json 1.24 guest.desktop · sidebar_locks 2, 시안 13·2·3·16-guest-desktop):
 * 홈 · 시약 = 둘러보기 화면으로, 기록 · QR 찾기 = guest-lock (둘러보기 범위 밖). 시약장·관리 메뉴는 없다.
 */
export function guestSidebarMenu(): SidebarGroup[] {
  return [
    {
      items: [
        { key: "home", label: "홈", icon: "home", href: "/demo" },
        { key: "reagents", label: "시약", icon: "flask", href: "/demo/reagents" },
        // 2026-10-11 rules guest.desktop: "센서"도 활성 (데모 센서 읽기 전용)
        { key: "sensors", label: "센서", icon: "sensor", href: "/demo/sensors" },
        { key: "records", label: "기록", icon: "record", locked: true },
        { key: "scan", label: "QR 찾기", icon: "qr", locked: true },
      ],
    },
  ];
}

/** 둘러보기 활성 메뉴: /demo = 홈, /demo/reagents · /demo/msds = 시약 */
export function guestSidebarActiveKey(pathname: string): SidebarKey | undefined {
  if (pathname === "/demo" || pathname === "/demo/") return "home";
  if (under(pathname, "/demo/reagents") || under(pathname, "/demo/msds")) return "reagents";
  if (under(pathname, "/demo/sensors")) return "sensors";
  return undefined;
}

export const ROLE_TEXT: Record<SidebarRole, string> = { student: "학생", teacher: "교사", admin: "admin" };

/** 시안 sidebar-account user: "김OO · 교사" */
export function sidebarAccountLabel(displayName: string, role: SidebarRole) {
  const name = displayName.trim();
  return name ? `${name} · ${ROLE_TEXT[role]}` : ROLE_TEXT[role];
}

/**
 * 모바일 전체 메뉴 (rules.json 1.28 mobile_menu, d7 §28 — mobile-menu-sheet): 데스크톱 사이드바와 같은 출처(sidebarMenu ·
 * guestSidebarMenu)를 그대로 쓰고, 글자만 모바일 하단 tab-bar 와 맞춘다 (QR 찾기 → "QR 스캔", 시안 13-menu-mobile).
 * 활성 항목은 sidebarActiveKey · guestSidebarActiveKey 를 그대로 쓴다.
 */
const MOBILE_LABELS: Partial<Record<SidebarKey, string>> = { scan: "QR 스캔" };

function toMobile(groups: SidebarGroup[]): SidebarGroup[] {
  return groups.map((g) => ({ ...g, items: g.items.map((it) => ({ ...it, label: MOBILE_LABELS[it.key] ?? it.label })) }));
}

export function mobileMenu(role: SidebarRole): SidebarGroup[] {
  return toMobile(sidebarMenu(role));
}

/** 둘러보기 모바일 메뉴: 홈·시약·센서 활성, 기록·QR 스캔 guest-lock, 관리 묶음 없음 (rules mobile_menu.guest) */
export function guestMobileMenu(): SidebarGroup[] {
  return toMobile(guestSidebarMenu());
}
