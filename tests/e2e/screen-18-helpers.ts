// 화면 18 관리 공용: rules manage 기대값(묶음·행→화면·요약 형식), 로그인 세션(RLS) 숫자, 화면 목록 읽기.
// 기준: harness/d7-data.md §29, design/rules.json manage. service role 미사용.
import { expect, type Page } from "@playwright/test";
import { MANAGE_BACK_SCREENS, MANAGE_RULES, MANAGE_SCREEN, browserClient, routeOf, sel } from "./screen-helpers";
import { frameActiveLabel } from "../desktop-shell";

export const SCREEN = MANAGE_SCREEN;
export const LIST = "manage-list";
export const GROUP = "manage-group";
export const ROW = "manage-row";

// ---------- 기대값: rules manage ----------

/** rules manage.list "'재고' = 시약 · 센서 · 시약장(모든 역할) / '입고·주문' = 입고 · 실험 매뉴얼 · 재주문 알림(교사·admin) / '학교' = 사용자 · 판매처(admin)" */
export type GroupRule = { title: string; items: string[]; roles: string[] | "all" };
export const GROUPS: GroupRule[] = [...MANAGE_RULES.list.matchAll(/'([^']+)' = ([^(/]+)\(([^)]+)\)/g)].map((m) => ({
  title: m[1],
  items: m[2].split("·").map((x) => x.trim()).filter(Boolean),
  roles: m[3] === "모든 역할" ? "all" : m[3].split("·").map((x) => x.trim()),
}));

/** 역할(rules roles 이름 학생·교사·admin)이 보는 묶음 */
export const groupsFor = (ruleRole: string): GroupRule[] => GROUPS.filter((g) => g.roles === "all" || g.roles.includes(ruleRole));

/**
 * 행 이름 → 화면: 관리 아래 화면(rules manage.back) 의 새 프레임 {N}-desktop 활성 sidebar-item 글자 (행 이름 = 데스크톱 메뉴 문구 — 같은 출처, d7 §29)
 */
export const ROW_SCREEN: Record<string, number> = Object.fromEntries(MANAGE_BACK_SCREENS.map((s) => [frameActiveLabel(s), s]));

/** rules manage.row 요약 예시 ('시약 128종 · 재고 부족 3' · '센서 12개 · 고장 1' · '시약장 2개' · '알림 2건' · '학생 40 · 교사 3 · admin 1' · '4곳') */
export const EXAMPLES: string[] = [...MANAGE_RULES.row.matchAll(/'([^']*\d[^']*)'/g)].map((m) => m[1]);
/** 예시 한 개를 ' · ' 부분으로 나눠 숫자 자리를 {n} 로 */
export const template = (prefix: RegExp): string[] => {
  const ex = EXAMPLES.find((e) => prefix.test(e));
  if (!ex) throw new Error(`rules manage.row 예시에서 ${prefix} 를 찾지 못함`);
  return ex.split(" · ").map((p) => p.replace(/\d[\d,]*/, "{n}"));
};
export const fill = (part: string, n: number) => part.replace("{n}", n.toLocaleString("ko-KR"));
/** 첫 부분은 늘 보이고 뒤 부분은 0 이면 뺀다 (예시: '시약장 2개' 처럼 부족 0 이면 생략 — d7 §29 "0 이면 그 부분 생략 규칙은 rules 예시대로") */
export const withTail = (parts: string[], nums: number[]) => [fill(parts[0], nums[0]), ...parts.slice(1).map((p, i) => (nums[i + 1] > 0 ? fill(p, nums[i + 1]) : "")).filter(Boolean)].join(" · ");
export const T_REAGENT = template(/^시약 \d/);
export const T_SENSOR = template(/^센서 \d/);
export const T_CABINET = template(/^시약장 \d/);
export const T_ALERT = template(/^알림 \d/);
export const T_USERS = template(/^학생 \d/);
export const T_VENDOR = template(/^\d+곳$/);

export type Counts = {
  reagents: number;
  low: number;
  sensors: number;
  broken: number;
  cabinets: number;
  users?: { student: number; teacher: number; admin: number };
  vendors?: number;
};

/** 로그인 세션(RLS — publishable 키 + 쿠키 access token)으로 센 자기 학교 숫자. service role 미사용 */
export async function dbCounts(page: Page, admin: boolean): Promise<Counts> {
  const { client, userId } = await browserClient(page);
  const me = await client.from("profiles").select("school_id").eq("user_id", userId).single();
  expect(me.error, "자기 profiles").toBeNull();
  const school = me.data!.school_id as string;
  const [r, s, c] = await Promise.all([
    client.from("reagents").select("id, school_id, stock, min_stock"),
    client.from("sensors").select("id, school_id, status"),
    client.from("cabinets").select("id, school_id"),
  ]);
  for (const x of [r, s, c]) expect(x.error, `RLS 조회 ${x.error?.message}`).toBeNull();
  for (const rows of [r.data, s.data, c.data]) expect((rows ?? []).filter((x) => x.school_id !== school), "RLS: 자기 학교 행만").toEqual([]);
  const out: Counts = {
    reagents: (r.data ?? []).length,
    // d7 §11 알림 대상 · 홈 재고 부족 = stock < min_stock
    low: (r.data ?? []).filter((x) => Number(x.stock) < Number(x.min_stock)).length,
    sensors: (s.data ?? []).length,
    broken: (s.data ?? []).filter((x) => x.status === "broken").length,
    cabinets: (c.data ?? []).length,
  };
  if (admin) {
    const [p, v] = await Promise.all([
      client.from("profiles").select("role").eq("school_id", school),
      // 우리 학교가 등록한 판매처 (공통 목록 school_id null 제외 — 화면 9 '우리 학교')
      client.from("vendors").select("id").eq("school_id", school),
    ]);
    expect(p.error, "profiles").toBeNull();
    expect(v.error, "vendors").toBeNull();
    const by = (role: string) => (p.data ?? []).filter((x) => x.role === role).length;
    out.users = { student: by("student"), teacher: by("teacher"), admin: by("admin") };
    out.vendors = (v.data ?? []).length;
  }
  return out;
}

/** 행 이름 → 기대 요약 caption (없으면 null = 이름만) */
export function expectedCaption(label: string, c: Counts): string | null {
  const s = ROW_SCREEN[label];
  if (s === 2) return withTail(T_REAGENT, [c.reagents, c.low]);
  if (s === 17) return withTail(T_SENSOR, [c.sensors, c.broken]);
  if (s === 11) return withTail(T_CABINET, [c.cabinets]);
  if (s === 6) return withTail(T_ALERT, [c.low]);
  if (s === 8 && c.users) {
    const n = [c.users.student, c.users.teacher, c.users.admin];
    const parts = T_USERS.map((p, i) => (n[i] > 0 ? fill(p, n[i]) : "")).filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
  }
  if (s === 9 && c.vendors !== undefined) return withTail(T_VENDOR, [c.vendors]);
  return null; // 입고 · 실험 매뉴얼 = 요약 없음 (시안 18-mobile row-text 이름만)
}

export const squash = (s: string) => s.replace(/\s+/g, "");

export type ShownRow = { group: string; label: string; text: string; href: string };

/** 화면의 묶음 · 행 (DOM 순서) */
export async function readList(page: Page): Promise<{ groups: string[]; rows: ShownRow[] }> {
  const list = page.locator(`main ${sel(LIST)}`);
  return list.evaluate((root, names) => {
    const groups: string[] = [];
    const rows: { group: string; label: string; text: string; href: string }[] = [];
    for (const g of Array.from(root.querySelectorAll(`[data-component="${names.group}"]`))) {
      const rowEls = Array.from(g.querySelectorAll(`[data-component="${names.row}"]`));
      // 묶음 제목 = 묶음 안에서 행 밖의 글자
      const clone = g.cloneNode(true) as HTMLElement;
      clone.querySelectorAll(`[data-component="${names.row}"]`).forEach((r) => r.remove());
      const title = (clone.textContent ?? "").replace(/\s+/g, " ").trim();
      groups.push(title);
      for (const r of rowEls) {
        const spans = Array.from(r.querySelectorAll("span")).filter((s) => s.children.length === 0 && (s.textContent ?? "").trim() !== "");
        rows.push({
          group: title,
          label: (spans[0]?.textContent ?? "").trim(),
          text: (r.textContent ?? "").replace(/\s+/g, ""),
          href: r.getAttribute("href") ?? "",
        });
      }
    }
    return { groups, rows };
  }, { group: GROUP, row: ROW });
}

export async function waitManage(page: Page): Promise<void> {
  await expect.poll(() => new URL(page.url()).pathname, { message: "화면 18 경로", timeout: 30_000 }).toBe(routeOf(SCREEN));
  await expect(page.locator(`main ${sel(LIST)}`), "manage-list").toBeVisible({ timeout: 45_000 });
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0, { timeout: 30_000 });
}
