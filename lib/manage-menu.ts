import type { IconName } from "@/components/icons";
import { guestSidebarMenu, sidebarMenu, type SidebarEntry, type SidebarKey, type SidebarRole } from "@/lib/sidebar-menu";

/**
 * 모바일 관리 탭 (화면 18 /manage, design/rules.json 1.29 manage, d7 §29).
 * 항목은 데스크톱 app-sidebar 와 같은 출처(lib/sidebar-menu sidebarMenu · guestSidebarMenu)에서 꺼내
 * 묶음 3개로 다시 나눈다 — 역할별로 보이는 항목이 사이드바와 늘 같다.
 * - '재고' = 시약 · 센서 · 시약장 (모든 역할)
 * - '입고·주문' = 입고 · 실험 매뉴얼 · 재주문 알림 (교사·admin)
 * - '학교' = 사용자 · 판매처 (admin)
 * 둘러보기(18-guest-mobile) = '재고' 묶음에 시약 · 센서 두 줄만.
 */
export type ManageKey = Extract<SidebarKey, "reagents" | "sensors" | "cabinets" | "intake" | "manual" | "reorder" | "users" | "vendors">;

export type ManageItem = { key: ManageKey; label: string; icon: IconName; href: string };
export type ManageGroup = { title: string; items: ManageItem[] };

const GROUPS: { title: string; keys: ManageKey[] }[] = [
  { title: "재고", keys: ["reagents", "sensors", "cabinets"] },
  { title: "입고·주문", keys: ["intake", "manual", "reorder"] },
  { title: "학교", keys: ["users", "vendors"] },
];

function toGroups(entries: SidebarEntry[]): ManageGroup[] {
  const byKey = new Map<SidebarKey, SidebarEntry>();
  for (const e of entries) if (e.href && !e.locked) byKey.set(e.key, e);
  return GROUPS.map((g) => ({
    title: g.title,
    items: g.keys.flatMap((key) => {
      const e = byKey.get(key);
      return e && e.href ? [{ key, label: e.label, icon: e.icon, href: e.href }] : [];
    }),
  })).filter((g) => g.items.length > 0);
}

/** 로그인 후 관리 목록 (역할별) */
export function manageMenu(role: SidebarRole): ManageGroup[] {
  return toGroups(sidebarMenu(role).flatMap((g) => g.items));
}

/** 둘러보기 관리 목록 — '재고' 묶음의 시약 · 센서 (데모 경로) */
export function guestManageMenu(): ManageGroup[] {
  return toGroups(guestSidebarMenu().flatMap((g) => g.items));
}

/** 관리 목록 요약 숫자 (한 번의 서버 읽기 결과). 없는 값은 그 항목 요약을 그리지 않는다 */
export type ManageCounts = {
  reagents?: { total: number; low: number };
  sensors?: { total: number; broken: number };
  cabinets?: number;
  reorder?: number;
  users?: { student: number; teacher: number; admin: number };
  vendors?: number;
};

const num = (n: number) => n.toLocaleString("ko-KR");

/**
 * manage-row 요약 caption (rules manage.row 예시 형식):
 * '시약 128종 · 재고 부족 3' · '센서 12개 · 고장 1' · '시약장 2개' · '알림 2건' · '학생 40 · 교사 3 · admin 1' · '4곳'.
 * 뒤쪽 부분(재고 부족 · 고장 · 역할별 인원)은 0 이면 뺀다. 요약이 없는 항목(입고 · 실험 매뉴얼)과 숫자를 모르는 항목은 null = 이름만.
 */
export function manageCaption(key: ManageKey, counts: ManageCounts): string | null {
  switch (key) {
    case "reagents": {
      const c = counts.reagents;
      if (!c) return null;
      return c.low > 0 ? `시약 ${num(c.total)}종 · 재고 부족 ${num(c.low)}` : `시약 ${num(c.total)}종`;
    }
    case "sensors": {
      const c = counts.sensors;
      if (!c) return null;
      return c.broken > 0 ? `센서 ${num(c.total)}개 · 고장 ${num(c.broken)}` : `센서 ${num(c.total)}개`;
    }
    case "cabinets":
      return counts.cabinets === undefined ? null : `시약장 ${num(counts.cabinets)}개`;
    case "reorder":
      return counts.reorder === undefined ? null : `알림 ${num(counts.reorder)}건`;
    case "users": {
      const c = counts.users;
      if (!c) return null;
      const parts = [
        c.student > 0 ? `학생 ${num(c.student)}` : "",
        c.teacher > 0 ? `교사 ${num(c.teacher)}` : "",
        c.admin > 0 ? `admin ${num(c.admin)}` : "",
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(" · ") : null;
    }
    case "vendors":
      return counts.vendors === undefined ? null : `${num(counts.vendors)}곳`;
    default:
      return null;
  }
}

function under(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(base + "/");
}

/** 하단 tab-bar 키 (rules tab_bar.labels 홈 · 관리 · QR 스캔 · 기록) */
export type TabKey = "home" | "manage" | "scan" | "records";

/**
 * 로그인 후 활성 탭 (rules tab_bar.labels_source, d7 §29):
 * 13 홈 = 홈 · 10 /usage = 기록 · 12 /scan = QR 스캔 ·
 * 그 밖의 관리 아래 화면(2·5·6·7·8·9·11·17)과 더 깊은 화면(3·4 /usage/new·16·센서 상세·폼·서류) · 18 /manage = 관리.
 */
export function tabActiveKey(pathname: string): TabKey | undefined {
  if (pathname === "/" || pathname === "") return "home";
  if (/^\/usage\/?$/.test(pathname)) return "records";
  if (under(pathname, "/scan")) return "scan";
  if (
    under(pathname, "/manage") ||
    under(pathname, "/usage") ||
    under(pathname, "/reagents") ||
    under(pathname, "/msds") ||
    under(pathname, "/sensors") ||
    under(pathname, "/cabinets") ||
    under(pathname, "/intake") ||
    under(pathname, "/manual") ||
    under(pathname, "/reorder") ||
    under(pathname, "/users") ||
    under(pathname, "/vendors")
  )
    return "manage";
  return undefined;
}

/** 둘러보기 활성 탭: /demo = 홈, /demo/manage · 시약 · MSDS · 센서 = 관리 */
export function guestTabActiveKey(pathname: string): TabKey | undefined {
  if (pathname === "/demo" || pathname === "/demo/") return "home";
  if (
    under(pathname, "/demo/manage") ||
    under(pathname, "/demo/reagents") ||
    under(pathname, "/demo/msds") ||
    under(pathname, "/demo/sensors")
  )
    return "manage";
  return undefined;
}

/** 관리 아래 첫 화면 (manage-back '‹ 관리' 를 두는 곳): 2·5·6·7·8·9·11·17 목록 화면 */
const MANAGE_CHILDREN = ["/reagents", "/manual", "/reorder", "/intake", "/users", "/vendors", "/cabinets", "/sensors"];
const GUEST_MANAGE_CHILDREN = ["/demo/reagents", "/demo/sensors"];

/**
 * manage-back 이 갈 곳 — 관리 아래 첫 화면이면 '/manage'(둘러보기 '/demo/manage'), 아니면 null
 * (시약 상세 3 · MSDS 16 · 센서 상세·폼 등 더 깊은 화면은 지금처럼 ‹ 뒤로).
 */
export function manageBackHref(pathname: string): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  if (MANAGE_CHILDREN.includes(path)) return "/manage";
  if (GUEST_MANAGE_CHILDREN.includes(path)) return "/demo/manage";
  return null;
}
