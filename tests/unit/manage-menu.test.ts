// 모바일 관리 탭(화면 18) 목록 · 요약 caption · 하단 탭 활성 · '‹ 관리' 주소 (lib/manage-menu) + ☰ · inventory-switch 없앰 확인.
// 기준(구현이 아니라 여기서 도출): harness/d7-data.md §29, design/rules.json manage(list · row · back · guest) · tab_bar(labels ·
//   labels_source · sensor_entry) · mobile_menu.removed · desktop_shell.menu, harness/dev-rules.json routes,
//   design/frames 18-mobile · 18-guest-mobile (묶음 제목 · 행 이름 · 요약 글자).
// lib/sidebar-menu(sidebarMenu · guestSidebarMenu)는 "같은 출처" 비교 대상으로만 부른다.
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  guestManageMenu,
  guestTabActiveKey,
  manageBackHref,
  manageCaption,
  manageMenu,
  tabActiveKey,
  type ManageCounts,
  type ManageGroup,
  type ManageKey,
  type TabKey,
} from "../../lib/manage-menu";
import * as sidebar from "../../lib/sidebar-menu";
import { guestSidebarMenu, sidebarMenu, type SidebarRole } from "../../lib/sidebar-menu";
import { ROOT, dev, read, rules, walk } from "./helpers";

// lib/manage-menu 는 "@/lib/sidebar-menu" 로 같은 출처를 불러온다 (vitest 설정에 @ 별칭 없음 → 같은 파일로 잇는다)
vi.mock("@/lib/sidebar-menu", () => import("../../lib/sidebar-menu"));

type FrameNode = { name: string; path: string[]; text?: { characters: string } | null };
const frame = (name: string): FrameNode[] =>
  (JSON.parse(read(join(ROOT, "design/frames", `${name}.json`))) as { frames: { nodes: FrameNode[] }[] }).frames[0].nodes;

/** 시안 18-*: manage-group 마다 제목(group-title caption) + 행(manage-row name · caption) — 노드 순서대로 */
function frameGroups(name: string): { title: string; rows: { name: string; caption: string | null }[] }[] {
  const out: { title: string; rows: { name: string; caption: string | null }[] }[] = [];
  for (const n of frame(name)) {
    if (!n.path.includes("manage-list") || !n.text) continue;
    if (n.name === "caption" && n.path.includes("group-title")) out.push({ title: n.text.characters, rows: [] });
    else if (n.name === "name" && n.path.includes("manage-row")) out[out.length - 1].rows.push({ name: n.text.characters, caption: null });
    else if (n.name === "caption" && n.path.includes("manage-row")) {
      const rows = out[out.length - 1].rows;
      rows[rows.length - 1].caption = n.text.characters;
    }
  }
  return out;
}
const F18 = frameGroups("18-mobile");
const F18G = frameGroups("18-guest-mobile");

const M = rules.manage as { list: string; row: string; back: string; guest: string; screen: number };
const TB = rules.tab_bar as { labels: string[]; labels_source: string; sensor_entry: string; mobile_screens: number[] };
const ROLES: SidebarRole[] = ["student", "teacher", "admin"];
const ROLE_KO: Record<SidebarRole, string> = { student: "학생", teacher: "교사", admin: "admin" };

/** rules manage.list "'재고' = 시약 · 센서 · 시약장(모든 역할) / '입고·주문' = …(교사·admin) / '학교' = …(admin)" */
const RULE_GROUPS: { title: string; labels: string[]; roles: SidebarRole[] }[] = [...M.list.matchAll(/'([^']+)' = ([^(/]+)\(([^)]+)\)/g)].map((m) => {
  const who = m[3].trim();
  const roles: SidebarRole[] = who === "모든 역할" ? ROLES : ROLES.filter((r) => who.split("·").map((s) => s.trim()).includes(ROLE_KO[r]));
  return { title: m[1], labels: m[2].split("·").map((s) => s.trim()).filter(Boolean), roles };
});
const groupsFor = (role: SidebarRole) => RULE_GROUPS.filter((g) => g.roles.includes(role));
const shape = (gs: ManageGroup[]) => gs.map((g) => ({ title: g.title, labels: g.items.map((i) => i.label) }));

/** 관리 행 글자 → 화면 번호 (d7 §29 관리 아래 화면 2·5·6·7·8·9·11·17 · desktop_shell.menu 와 같은 화면) */
const LABEL_SCREEN: Record<string, number> = { 시약: 2, 센서: 17, 시약장: 11, 입고: 7, "실험 매뉴얼": 5, "재주문 알림": 6, 사용자: 8, 판매처: 9 };
const route = (key: string) => {
  const r = (dev.routes as Record<string, string>)[key];
  if (!r) throw new Error(`dev-rules routes 에 ${key} 없음`);
  return r.replace(/\[[^\]]+\]/g, "00000000-0000-4000-8000-000000000001");
};
/** manage.back "관리 아래 화면(2·5·6·7·8·9·11·17)" */
const BACK_SCREENS = ((/\(([\d·]+)\)/.exec(M.back) ?? [])[1] ?? "").split("·").map(Number);

describe("[C1][S18] 관리 목록 = rules manage.list 묶음 3개 · 역할별 (사이드바와 같은 출처)", () => {
  it("[C1][S18] 기대값 원본: rules manage.list 묶음 3개 = 시안 18-mobile(admin) 묶음 제목 · 행 이름, manage.back 화면 8개, d7 §29 '같은 출처'", () => {
    expect(RULE_GROUPS.map((g) => g.title)).toEqual(["재고", "입고·주문", "학교"]);
    expect(RULE_GROUPS.map((g) => g.roles)).toEqual([ROLES, ["teacher", "admin"], ["admin"]]);
    expect(F18.map((g) => ({ title: g.title, labels: g.rows.map((r) => r.name) }))).toEqual(RULE_GROUPS.map((g) => ({ title: g.title, labels: g.labels })));
    expect(BACK_SCREENS).toEqual([2, 5, 6, 7, 8, 9, 11, 17]);
    expect(Object.values(LABEL_SCREEN).sort((a, b) => a - b)).toEqual(BACK_SCREENS);
    expect(read(join(ROOT, "harness/d7-data.md"))).toContain("항목 목록은 lib/sidebar-menu 와 같은 출처(역할별)");
  });

  it.each(ROLES)("[R-ui][S18] %s: 묶음 제목 · 행 글자 · 순서 = rules manage.list 의 그 역할 묶음", (role) => {
    expect(shape(manageMenu(role))).toEqual(groupsFor(role).map((g) => ({ title: g.title, labels: g.labels })));
  });

  it("[R-ui][S18] 학생 = '재고' 1묶음 · 교사 = 2묶음('학교' 없음) · admin = 3묶음 — 사용자 · 판매처는 admin 만, 입고 · 실험 매뉴얼 · 재주문 알림은 학생 0", () => {
    const all = (role: SidebarRole) => manageMenu(role).flatMap((g) => g.items.map((i) => i.label));
    expect(manageMenu("student")).toHaveLength(1);
    expect(manageMenu("teacher")).toHaveLength(2);
    expect(manageMenu("admin")).toHaveLength(3);
    for (const l of RULE_GROUPS[1].labels) expect(all("student"), `학생 ${l}`).not.toContain(l);
    for (const l of RULE_GROUPS[2].labels) {
      expect(all("student"), `학생 ${l}`).not.toContain(l);
      expect(all("teacher"), `교사 ${l}`).not.toContain(l);
      expect(all("admin"), `admin ${l}`).toContain(l);
    }
  });

  it.each(ROLES)("[C1][S18] %s: 행마다 key · 글자 · 아이콘 · 주소 = 같은 역할 sidebarMenu 항목 그대로 · 주소 = 그 화면 경로", (role) => {
    const side = sidebarMenu(role).flatMap((g) => g.items);
    for (const it of manageMenu(role).flatMap((g) => g.items)) {
      const s = side.find((x) => x.key === it.key);
      expect(s, `${role} ${it.key} 가 사이드바에 있음`).toBeTruthy();
      expect({ label: it.label, icon: it.icon, href: it.href }, `${role} ${it.key}`).toEqual({ label: s!.label, icon: s!.icon, href: s!.href });
      expect(it.href, `${role} ${it.label} 주소`).toBe(route(String(LABEL_SCREEN[it.label])));
    }
  });

  it.each(ROLES)("[C1][S18] %s: 관리 목록에 홈 · 기록 · QR 0 (하단 탭이 따로 있음) · 사이드바의 관리 대상 항목은 빠짐없이", (role) => {
    const labels = manageMenu(role).flatMap((g) => g.items.map((i) => i.href));
    for (const r of [route("13"), route("10"), route("12")]) expect(labels, `${role} ${r}`).not.toContain(r);
    const sideTargets = sidebarMenu(role)
      .flatMap((g) => g.items)
      .filter((i) => i.label in LABEL_SCREEN);
    expect(manageMenu(role).flatMap((g) => g.items.map((i) => i.key)).sort()).toEqual(sideTargets.map((i) => i.key).sort());
  });
});

describe("[GM-ui][S18g] 둘러보기 관리 목록 (rules manage.guest · 시안 18-guest-mobile)", () => {
  it("[GM-ui][S18g] 기대값 원본: rules manage.guest = '재고' 묶음에 시약 · 센서 두 줄만 · 시안 18-guest-mobile 같음", () => {
    expect(M.guest).toContain("'재고' 묶음에 시약 · 센서 두 줄만");
    expect(F18G.map((g) => ({ title: g.title, labels: g.rows.map((r) => r.name) }))).toEqual([{ title: "재고", labels: ["시약", "센서"] }]);
  });

  it("[GM-ui][S18g] guestManageMenu = '재고' [시약 · 센서] · 주소 = 둘러보기 경로(2-guest · 17-guest) · guestSidebarMenu 와 같은 key · 아이콘", () => {
    const g = guestManageMenu();
    expect(shape(g)).toEqual(F18G.map((x) => ({ title: x.title, labels: x.rows.map((r) => r.name) })));
    const items = g.flatMap((x) => x.items);
    expect(items.map((i) => i.href)).toEqual([route("2-guest"), route("17-guest")]);
    const side = guestSidebarMenu().flatMap((x) => x.items);
    for (const it of items) {
      const s = side.find((x) => x.key === it.key)!;
      expect({ label: it.label, icon: it.icon, href: it.href }).toEqual({ label: s.label, icon: s.icon, href: s.href });
    }
  });
});

// ---------------------------------------------------------------- 요약 caption (rules manage.row · 시안 18)

/** 행 key (구현 타입) ↔ 행 글자 — 같은 출처(sidebarMenu admin)에서 */
const KEY_OF: Record<string, ManageKey> = Object.fromEntries(manageMenu("admin").flatMap((g) => g.items.map((i) => [i.label, i.key])));
const nums = (s: string) => [...s.matchAll(/\d+/g)].map((m) => Number(m[0]));
/** 요약 글자 → 숫자 (시안 · rules 예시 틀에서 숫자만 꺼내 counts 로) */
function countsFrom(label: string, caption: string): ManageCounts {
  const n = nums(caption);
  switch (KEY_OF[label]) {
    case "reagents":
      return { reagents: { total: n[0], low: n[1] ?? 0 } };
    case "sensors":
      return { sensors: { total: n[0], broken: n[1] ?? 0 } };
    case "cabinets":
      return { cabinets: n[0] };
    case "reorder":
      return { reorder: n[0] };
    case "users":
      return { users: { student: n[0], teacher: n[1], admin: n[2] } };
    case "vendors":
      return { vendors: n[0] };
    default:
      throw new Error(`${label} 요약 없음`);
  }
}
/** rules manage.row 예시 6개 ('시약 128종 · 재고 부족 3' …) — 행 순서(시약 · 센서 · 시약장 · 재주문 알림 · 사용자 · 판매처) */
const RULE_EXAMPLES = [...((/\(예: (.+?)\)/.exec(M.row) ?? [])[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1]);
const EXAMPLE_ROWS = ["시약", "센서", "시약장", "재주문 알림", "사용자", "판매처"];

describe("[C1][S18] manage-row 요약 caption (rules manage.row 형식 · 시안 18)", () => {
  it("[C1][S18] 기대값 원본: rules manage.row 예시 6개 · '요약이 없는 항목은 이름만' · 시안 18-mobile 입고 · 실험 매뉴얼 caption 없음", () => {
    expect(RULE_EXAMPLES).toHaveLength(EXAMPLE_ROWS.length);
    expect(M.row).toContain("요약이 없는 항목은 이름만");
    const noCaption = F18.flatMap((g) => g.rows).filter((r) => r.caption === null).map((r) => r.name);
    expect(noCaption).toEqual(["입고", "실험 매뉴얼"]);
  });

  it.each(EXAMPLE_ROWS.map((l, i) => [l, RULE_EXAMPLES[i]] as const))("[C1][S18] %s: rules 예시 '%s' 그대로", (label, example) => {
    expect(manageCaption(KEY_OF[label], countsFrom(label, example))).toBe(example);
  });

  it("[C1][S18] 시안 18-mobile · 18-guest-mobile 의 요약 글자 그대로 (같은 숫자 → 같은 글자)", () => {
    for (const r of [...F18, ...F18G].flatMap((g) => g.rows)) {
      if (r.caption === null) continue;
      expect(manageCaption(KEY_OF[r.name], countsFrom(r.name, r.caption)), r.name).toBe(r.caption);
    }
  });

  it("[C1][S18] 요약 없는 행(입고 · 실험 매뉴얼) = null · 숫자를 모르는 행 = null (이름만)", () => {
    const full: ManageCounts = { reagents: { total: 1, low: 1 }, sensors: { total: 1, broken: 1 }, cabinets: 1, reorder: 1, users: { student: 1, teacher: 1, admin: 1 }, vendors: 1 };
    expect(manageCaption(KEY_OF["입고"], full)).toBeNull();
    expect(manageCaption(KEY_OF["실험 매뉴얼"], full)).toBeNull();
    for (const l of EXAMPLE_ROWS) expect(manageCaption(KEY_OF[l], {}), `${l} 숫자 모름`).toBeNull();
  });

  it("[C1][S18] 0 인 뒷부분(재고 부족 · 고장 · 역할별 인원)은 뺀다 · 총수는 0 이어도 보인다 (d7 §29 '0 이면 그 부분 생략')", () => {
    const [reagent, sensor, cabinet, reorder, , vendor] = RULE_EXAMPLES;
    const head = (s: string) => s.split(" · ")[0];
    expect(manageCaption(KEY_OF["시약"], { reagents: { total: nums(reagent)[0], low: 0 } })).toBe(head(reagent));
    expect(manageCaption(KEY_OF["센서"], { sensors: { total: nums(sensor)[0], broken: 0 } })).toBe(head(sensor));
    expect(manageCaption(KEY_OF["시약"], { reagents: { total: 0, low: 0 } })).toBe(head(reagent).replace(/\d+/, "0"));
    expect(manageCaption(KEY_OF["센서"], { sensors: { total: 0, broken: 0 } })).toBe(head(sensor).replace(/\d+/, "0"));
    expect(manageCaption(KEY_OF["시약장"], { cabinets: 0 })).toBe(cabinet.replace(/\d+/, "0"));
    expect(manageCaption(KEY_OF["재주문 알림"], { reorder: 0 })).toBe(reorder.replace(/\d+/, "0"));
    expect(manageCaption(KEY_OF["판매처"], { vendors: 0 })).toBe(vendor.replace(/\d+/, "0"));
    const users = RULE_EXAMPLES[4].split(" · ");
    expect(manageCaption(KEY_OF["사용자"], { users: { student: nums(users[0])[0], teacher: 0, admin: nums(users[2])[0] } })).toBe(`${users[0]} · ${users[2]}`);
    expect(manageCaption(KEY_OF["사용자"], { users: { student: 0, teacher: nums(users[1])[0], admin: 0 } })).toBe(users[1]);
  });

  it("[C1][S18] 요약 글자에 색 이름 · 기호 없이 숫자와 단위만 (무채색 글자 — 색은 e2e)", () => {
    for (const ex of RULE_EXAMPLES) expect(ex).toMatch(/^[가-힣a-z\d ·]+$/);
  });
});

// ---------------------------------------------------------------- 하단 탭 활성 (rules tab_bar.labels_source)

/** labels 순서 → 탭 key (구현 타입 TabKey: 홈 · 관리 · QR · 기록) */
const TAB_KEYS: TabKey[] = ["home", "manage", "scan", "records"];
const keyOfLabel = (label: string): TabKey => {
  const i = TB.labels.findIndex((l) => l === label || l.startsWith(label));
  if (i < 0) throw new Error(`tab_bar.labels 에 ${label} 없음`);
  return TAB_KEYS[i];
};
/** labels_source "화면 2·3·…·18 모바일에서 '관리'가 활성, 13 홈·10 기록·12 QR은 각자 탭" */
const ACTIVE: { screen: number; key: TabKey }[] = (() => {
  const m = /화면 ([\d·]+) 모바일에서 '([^']+)'가 활성, (.+?)은 각자 탭/.exec(TB.labels_source);
  if (!m) throw new Error("rules tab_bar.labels_source 에서 활성 탭 표를 읽지 못함");
  const manage = m[1].split("·").map((s) => ({ screen: Number(s), key: keyOfLabel(m[2]) }));
  const own = m[3].split("·").map((s) => {
    const [n, label] = s.trim().split(/\s+/);
    return { screen: Number(n), key: keyOfLabel(label) };
  });
  return [...manage, ...own];
})();

describe("[C2][S*] 하단 탭 활성 = rules tab_bar.labels_source (13 홈 · 10 기록 · 12 QR, 나머지 관리)", () => {
  it("[C2][S*] 기대값 원본: tab_bar.labels = 홈 · 관리 · QR 스캔 · 기록 · 활성 표가 tab_bar.mobile_screens 전부를 덮음", () => {
    expect(TB.labels).toEqual(["홈", "관리", "QR 스캔", "기록"]);
    expect(ACTIVE.map((a) => a.screen).sort((a, b) => a - b)).toEqual([...TB.mobile_screens].sort((a, b) => a - b));
    expect(ACTIVE.filter((a) => a.key !== "manage")).toEqual([
      { screen: 13, key: "home" },
      { screen: 10, key: "records" },
      { screen: 12, key: "scan" },
    ]);
  });

  it.each(ACTIVE.map((a) => [a.screen, a.key] as const))("[C2][S*] 화면 %i 경로 → 탭 %s", (screen, key) => {
    expect(tabActiveKey(route(String(screen)))).toBe(key);
  });

  it("[C2][S*] 더 깊은 화면도 관리: 센서 서류 등록(17-doc) · 센서 하위 경로 · 시약 상세 · MSDS · 관리 아래 · 끝 / 붙은 경로", () => {
    for (const p of [route("17-doc"), `${route("17")}/00000000-0000-4000-8000-000000000001`, route("3"), route("16"), `${route("18")}/`, `${route("2")}/`])
      expect(tabActiveKey(p), p).toBe("manage");
    expect(tabActiveKey(`${route("10")}/`), "기록 끝 /").toBe("records");
    expect(tabActiveKey(route("4")), "사용 기록 입력(4) = 관리 (labels_source 의 4)").toBe("manage");
  });

  it("[C2][S*] 탭바가 없는 화면(로그인 1 · 회원가입 14)과 비슷한 이름 경로는 어느 탭도 아님", () => {
    for (const p of [route("1"), route("14"), "/reagentsx", "/usagelog", "/scanner", "/managers"]) expect(tabActiveKey(p), p).toBeUndefined();
  });

  it("[GM-ui][S*] 둘러보기: /demo = 홈 · 둘러보기 시약 · 시약 상세 · MSDS · 센서 · 관리 = 관리 (d7 §29 둘러보기 탭)", () => {
    expect(guestTabActiveKey(route("13-guest"))).toBe("home");
    for (const k of ["2-guest", "3-guest", "16-guest", "17-guest", "18-guest"]) expect(guestTabActiveKey(route(k)), k).toBe("manage");
    expect(guestTabActiveKey("/demox")).toBeUndefined();
  });
});

describe("[C1][S*] manage-back 주소 = 관리 아래 첫 화면만 (rules manage.back)", () => {
  it.each(BACK_SCREENS)("[C1][S%i] 관리 아래 화면 → '/manage' (끝 / 도 같음)", (screen) => {
    expect(manageBackHref(route(String(screen)))).toBe(route("18"));
    expect(manageBackHref(`${route(String(screen))}/`)).toBe(route("18"));
  });

  it("[C1][S*] 더 깊은 화면(시약 상세 3 · MSDS 16 · 센서 서류 · 센서 상세)과 탭 화면(13 · 10 · 12 · 4 · 18) = null (지금처럼 ‹ 뒤로)", () => {
    for (const k of ["3", "16", "17-doc", "13", "10", "12", "4", "18", "1", "14"]) expect(manageBackHref(route(k)), k).toBeNull();
    expect(manageBackHref(`${route("17")}/00000000-0000-4000-8000-000000000001`)).toBeNull();
  });

  it("[GM-ui][S*] 둘러보기 시약 · 센서 목록 → '/demo/manage' · 시약 상세 · MSDS · 홈 = null", () => {
    for (const k of ["2-guest", "17-guest"]) expect(manageBackHref(route(k)), k).toBe(route("18-guest"));
    for (const k of ["3-guest", "16-guest", "13-guest", "18-guest"]) expect(manageBackHref(route(k)), k).toBeNull();
  });
});

// ---------------------------------------------------------------- ☰ · inventory-switch 없앰

/** rules mobile_menu.removed "☰ mobile-menu-button·mobile-menu-sheet 없앰" · tab_bar.sensor_entry "inventory-switch '시약 | 센서'는 없앰" */
const REMOVED: string[] = [
  ...((rules.mobile_menu as { removed: string }).removed.split("없앰")[0].match(/[a-z]+(?:-[a-z]+)+/g) ?? []),
  ...((/([a-z]+(?:-[a-z]+)+) '[^']*'는 없앰/.exec(TB.sensor_entry) ?? []).slice(1, 2)),
];

describe("[C1][S*] ☰ 전체 메뉴 · 시약|센서 전환 없앰 (rules mobile_menu.removed · tab_bar.sensor_entry, d7 §29)", () => {
  it("[C1][S*] 기대값 원본: 없앤 컴포넌트 = mobile-menu-button · mobile-menu-sheet · inventory-switch · dev-rules components 에 없음", () => {
    expect(REMOVED).toEqual(["mobile-menu-button", "mobile-menu-sheet", "inventory-switch"]);
    for (const n of REMOVED) expect(Object.keys(dev.components), n).not.toContain(n);
  });

  it.each(REMOVED)("[C1][S*] %s: components/ 폴더에 파일 0 · app · components · lib 소스에 이름 0", (name) => {
    const dir = join(ROOT, "components", name);
    const files = existsSync(dir) && statSync(dir).isDirectory() ? readdirSync(dir) : [];
    expect(files, `components/${name}/ 파일`).toEqual([]);
    const hits = walk(["app", "components", "lib"], [".ts", ".tsx", ".css"]).filter((f) => read(f).includes(name));
    expect(hits, `${name} 를 쓰는 소스`).toEqual([]);
  });

  it("[C1][S*] lib/sidebar-menu 에 모바일 메뉴 함수 없음 (mobileMenu · guestMobileMenu)", () => {
    expect(Object.keys(sidebar)).not.toContain("mobileMenu");
    expect(Object.keys(sidebar)).not.toContain("guestMobileMenu");
  });
});
