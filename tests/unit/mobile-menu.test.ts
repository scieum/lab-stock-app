// 모바일 전체 메뉴 항목 (lib/sidebar-menu mobileMenu · guestMobileMenu — d7 §28 "모바일 전체 메뉴", rules 1.28 mobile_menu).
// 기대값: rules mobile_menu.sheet(desktop_shell.menu 와 같은 역할별 묶음 · 'QR 스캔') · guest, d7 §28(화면 12 가 있으므로 QR 스캔은 정상 항목),
//         design/frames/13-menu-mobile(admin 항목 글자 · 묶음 제목), harness/dev-rules.json routes 12.
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { guestMobileMenu, guestSidebarMenu, mobileMenu, sidebarMenu, type SidebarGroup, type SidebarRole } from "../../lib/sidebar-menu";
import { ROOT, dev, read, rules } from "./helpers";

type FrameNode = { name: string; path: string[]; text?: { characters: string } | null };
const nodes = (JSON.parse(read(join(ROOT, "design/frames/13-menu-mobile.json"))) as { frames: { nodes: FrameNode[] }[] }).frames[0].nodes;
const inSheet = nodes.filter((n) => n.path.includes("mobile-menu-sheet"));
/** 시안 13-menu-mobile (admin) 의 묶음: 제목 없음 → 관리 → 학교 설정, 항목 글자 */
const FRAME_GROUPS: { title?: string; labels: string[] }[] = (() => {
  const out: { title?: string; labels: string[] }[] = [{ labels: [] }];
  for (const n of inSheet) {
    if (n.name === "caption" && n.path.includes("menu-group-title")) out.push({ title: n.text!.characters, labels: [] });
    if (n.name === "label" && n.path.includes("menu-item")) out[out.length - 1].labels.push(n.text!.characters);
  }
  return out;
})();
const D7 = read(join(ROOT, "harness/d7-data.md"));
const D7_28 = D7.slice(D7.indexOf("## 28."), D7.indexOf("\n## ", D7.indexOf("## 28.") + 1));
const ROW = D7_28.split("\n").find((l) => l.startsWith("| 모바일 전체 메뉴 |")) ?? "";
const MM = rules.mobile_menu as { sheet: string; guest: string };
const QR_MOBILE = "QR 스캔";
const ROLES: SidebarRole[] = ["student", "teacher", "admin"];

const shape = (gs: SidebarGroup[]) => gs.map((g) => ({ title: g.title, items: g.items.map((i) => ({ key: i.key, href: i.href, icon: i.icon, locked: Boolean(i.locked) })) }));
const labels = (gs: SidebarGroup[]) => gs.map((g) => ({ title: g.title, labels: g.items.map((i) => i.label) }));

describe("[C1][S13] 모바일 전체 메뉴 = 데스크톱 사이드바와 같은 출처 (rules mobile_menu · d7 §28)", () => {
  it("[C1][S13] 기대값 원본: 시안 13-menu-mobile admin 묶음 3개(제목 없음 · 관리 · 학교 설정) · 'QR 스캔' · rules sheet '같은 역할별 묶음' · d7 'QR 스캔은 정상 항목'", () => {
    expect(FRAME_GROUPS.map((g) => g.title)).toEqual([undefined, "관리", "학교 설정"]);
    expect(FRAME_GROUPS[0].labels).toContain(QR_MOBILE);
    expect(MM.sheet).toContain("desktop_shell.menu와 같은 역할별 묶음");
    expect(MM.sheet).toContain(QR_MOBILE);
    expect(ROW).toContain("QR 스캔은 정상 항목");
    expect(dev.routes["12"]).toBe("/scan");
  });

  it.each(ROLES)("[C1][S13] %s: 묶음 · 항목 key · 주소 · 아이콘 = sidebarMenu 그대로 (잠금 없음)", (role) => {
    const m = mobileMenu(role);
    expect(shape(m)).toEqual(shape(sidebarMenu(role)));
    for (const g of m) for (const it of g.items) {
      expect(it.locked, `${role} ${it.key} 잠금 없음`).toBeFalsy();
      expect(it.href, `${role} ${it.key} 주소`).toBeTruthy();
    }
  });

  it.each(ROLES)("[C1][S13] %s: 글자 = 사이드바 글자, QR 만 'QR 스캔' (화면 12 /scan 정상 항목)", (role) => {
    const m = mobileMenu(role);
    const s = sidebarMenu(role);
    for (const [gi, g] of m.entries()) {
      for (const [ii, it] of g.items.entries()) {
        const want = it.key === "scan" ? QR_MOBILE : s[gi].items[ii].label;
        expect(it.label, `${role} ${it.key}`).toBe(want);
      }
    }
    const scan = m.flatMap((g) => g.items).find((i) => i.key === "scan")!;
    expect(scan.href).toBe(dev.routes["12"]);
    expect(m.flatMap((g) => g.items).map((i) => i.label)).not.toContain("준비 중");
  });

  it("[C1][S13] admin 글자 = 시안 13-menu-mobile 그대로 · 교사 = 앞 2묶음 · 학생 = 첫 묶음만 (관리 · 학교 설정 없음)", () => {
    expect(labels(mobileMenu("admin"))).toEqual(FRAME_GROUPS);
    expect(labels(mobileMenu("teacher"))).toEqual(FRAME_GROUPS.slice(0, 2));
    expect(labels(mobileMenu("student"))).toEqual(FRAME_GROUPS.slice(0, 1));
  });

  it("[C1][S13] mobileMenu 를 불러도 데스크톱 사이드바 글자는 그대로 (같은 출처를 바꾸지 않음)", () => {
    const before = JSON.stringify(sidebarMenu("admin"));
    mobileMenu("admin");
    guestMobileMenu();
    expect(JSON.stringify(sidebarMenu("admin"))).toBe(before);
    const desktopScan = sidebarMenu("admin").flatMap((g) => g.items).find((i) => i.key === "scan")!;
    expect(desktopScan.label, "데스크톱은 따로 (모바일 글자로 바뀌지 않음)").not.toBe(QR_MOBILE);
  });
});

describe("[C1][S13] 둘러보기 모바일 메뉴 (rules mobile_menu.guest)", () => {
  it("[C1][S13] 기대값 원본: rules guest = 홈·시약·센서 활성 · 기록·QR 스캔 guest-lock · 관리 묶음 숨김", () => {
    expect(MM.guest).toContain("홈·시약·센서 활성");
    expect(MM.guest).toContain("기록·QR 스캔 guest-lock");
    expect(MM.guest).toContain("관리 묶음 숨김");
  });

  it("[C1][S13] guestMobileMenu: 제목 있는 묶음 0 · 홈·시약·센서 = 주소 있음 · 기록·QR 스캔 = 잠금(주소 없음) · 그 밖 항목 없음 · guestSidebarMenu 와 같은 key", () => {
    const g = guestMobileMenu();
    expect(g.filter((x) => x.title)).toEqual([]);
    const items = g.flatMap((x) => x.items);
    expect(items.map((i) => i.label)).toEqual(["홈", "시약", "센서", "기록", QR_MOBILE]);
    for (const i of items.slice(0, 3)) {
      expect(i.locked, `${i.label} 활성`).toBeFalsy();
      expect(i.href, `${i.label} 주소`).toMatch(/^\/demo/);
    }
    for (const i of items.slice(3)) {
      expect(i.locked, `${i.label} 잠금`).toBe(true);
      expect(i.href, `${i.label} 이동 없음`).toBeUndefined();
    }
    expect(shape(g)).toEqual(shape(guestSidebarMenu()));
  });
});
