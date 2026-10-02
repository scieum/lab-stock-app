// 화면(D3) e2e 공용 도우미.
// - 기대값은 design/rules.json · harness/dev-rules.json 에서 읽는다 (테스트에 숫자를 하드코딩하지 않는다).
// - 계정 값은 db-helpers.ts 의 .env.local 로딩을 그대로 쓴다 (파일에 값을 쓰지 않는다).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, type TestInfo } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import "./db-helpers"; // .env.local 로딩 (계정·공개 키 환경변수)
import { type Role } from "./db-helpers";

type RoleRule = {
  role?: string;
  component?: string;
  components?: string[];
  max?: number;
  only_roles?: string[];
  min_per_role?: number;
  roles?: string[];
};

export type DesignRules = {
  roles: Record<string, RoleRule>;
  screens_required: Record<string, string[] | string>;
  tab_bar: { component: string; item: string; items: number; labels: string[]; mobile_screens: number[] };
  never: {
    N1: {
      school_name_pattern: string;
      distinct_school_names: number;
      screens_require_school_name: number[];
      school_select_only_on: number[];
      school_select_levels: string[];
      school_select_screen: number;
    };
  };
  neis: { default_sido: string; default_region: string; exclude_sido: string[]; school_kind: string };
};

export type DevRules = {
  routes: Record<string, string>;
  viewports: Record<string, [number, number]>;
  components: Record<string, number[]>;
};

const readJson = <T>(rel: string): T => JSON.parse(readFileSync(join(process.cwd(), rel), "utf8")) as T;

export const rules = readJson<DesignRules>("design/rules.json");
export const devRules = readJson<DevRules>("harness/dev-rules.json");

export function routeOf(screen: number): string {
  const r = devRules.routes[String(screen)];
  if (!r) throw new Error(`dev-rules.json routes 에 화면 ${screen} 없음`);
  return r;
}

/** 경로 → 화면 번호 (dev-rules.json routes, [param] 은 한 세그먼트) */
export function screenOfPath(pathname: string): number | null {
  for (const [id, route] of Object.entries(devRules.routes)) {
    const re = new RegExp("^" + route.replace(/\[[^\]]+\]/g, "[^/]+") + "/?$");
    if (re.test(pathname)) return Number(id);
  }
  return null;
}

export type ViewportName = "mobile" | "desktop";

/** Playwright 프로젝트 이름(mobile/desktop) → dev-rules.json viewports 로 창 크기 고정 */
export async function useProjectViewport(page: Page, info: TestInfo): Promise<ViewportName> {
  const name = info.project.name as ViewportName;
  const vp = devRules.viewports[name];
  if (!vp) throw new Error(`dev-rules.json viewports 에 '${name}' 없음`);
  await page.setViewportSize({ width: vp[0], height: vp[1] });
  return name;
}

export const sel = (name: string) => `[data-component="${name}"]`;

export function countComponent(page: Page, name: string): Promise<number> {
  return page.locator(sel(name)).count();
}

/** rules.json roles 의 역할 이름 */
export const ROLE_NAME: Record<Exclude<Role, "schoolB">, string> = {
  student: "학생",
  teacher: "교사",
  admin: "admin",
};

/** profiles.role 값 */
export const PROFILE_ROLE: Record<Role, string> = {
  student: "student",
  teacher: "teacher",
  admin: "admin",
  schoolB: "teacher",
};

export type RoleCheck = { rule: string; component: string; op: "max" | "min"; value: number };

/**
 * 한 화면·한 역할(또는 로그인 전 = null)에 적용되는 rules.json roles 검사 목록.
 * - role+max: 그 역할이면 개수 ≤ max. 로그인 전(null)은 가장 낮은 권한으로 보고 같은 상한을 적용.
 * - only_roles: 목록 밖 역할(로그인 전 포함)은 0.
 * - min_per_role: 그 컴포넌트가 이 화면 시안(dev-rules components)에 있을 때만 ≥ min.
 */
export function roleChecks(screen: number, role: string | null): RoleCheck[] {
  const out: RoleCheck[] = [];
  for (const [id, r] of Object.entries(rules.roles)) {
    const comps = r.components ?? (r.component ? [r.component] : []);
    for (const c of comps) {
      if (r.max !== undefined && (role === null || r.role === role)) {
        out.push({ rule: id, component: c, op: "max", value: r.max });
      }
      if (r.only_roles && (role === null || !r.only_roles.includes(role))) {
        out.push({ rule: id, component: c, op: "max", value: 0 });
      }
      if (
        r.min_per_role !== undefined &&
        role !== null &&
        (r.roles ?? []).includes(role) &&
        (devRules.components[c] ?? []).includes(screen)
      ) {
        out.push({ rule: id, component: c, op: "min", value: r.min_per_role });
      }
    }
  }
  return out;
}

/** 테스트 계정 이메일·비밀번호 (환경변수에서만) */
export function credentialsOf(role: Role): { email: string; password: string } {
  const prefix = { student: "TEST_STUDENT", teacher: "TEST_TEACHER", admin: "TEST_ADMIN", schoolB: "TEST_SCHOOL_B" }[role];
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  if (!email || !password) throw new Error(`환경변수 ${prefix}_EMAIL/PASSWORD 가 없습니다`);
  return { email, password };
}

/**
 * 화면 1 에서 이메일·비밀번호만으로 로그인 (화면 1 에는 학교 선택이 없다 — d7 §4-2) → 화면 1 을 벗어날 때까지 기다린다.
 * 하이드레이션 신호: 입력 뒤 제출 버튼이 켜진다 = React 상태에 값이 들어갔다.
 * 하이드레이션 전에 입력돼 상태에 안 남았으면 다시 입력한다.
 */
export async function loginViaUi(page: Page, role: Role): Promise<void> {
  const { email, password } = credentialsOf(role);
  await page.goto(routeOf(1));
  await waitLoginScreen(page);
  const submit = page.locator('form button[type="submit"]');
  await expect(async () => {
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await expect(submit).toBeEnabled({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await submit.click();
  await page.waitForURL((u) => !u.pathname.startsWith(routeOf(1)), { timeout: 45_000 });
  await page.waitForLoadState("load");
}

/** seed 의 schools 이름 전체 (supabase/seed.sql insert into public.schools … 의 name 열) */
export function seedSchoolNames(): string[] {
  const sql = readFileSync(join(process.cwd(), "supabase", "seed.sql"), "utf8");
  const m = sql.match(/insert into public\.schools\s*\(([^)]*)\)\s*values([\s\S]*?);/i);
  if (!m) throw new Error("seed.sql 에 schools insert 없음");
  const cols = m[1].split(",").map((c) => c.trim());
  const idx = cols.indexOf("name");
  if (idx < 0) throw new Error("seed.sql schools 에 name 열 없음");
  const rows = [...m[2].matchAll(/\(([^()]*)\)/g)].map((r) => [...r[1].matchAll(/'([^']*)'/g)].map((x) => x[1]));
  return rows.map((r) => r[idx]).filter(Boolean);
}

export type BrowserSession = { userId: string; role: string; schoolName: string };

/**
 * 브라우저에 로그인된 세션(쿠키 sb-*-auth-token)으로 RLS 를 거쳐 자기 profiles·schools 를 읽는다.
 * 추가 로그인 호출이 없어서 Supabase Auth 요청 한도를 쓰지 않는다. service role 미사용.
 */
export async function browserSession(page: Page): Promise<BrowserSession> {
  const { client, userId } = await browserClient(page);
  const prof = await client.from("profiles").select("school_id, role").eq("user_id", userId).single();
  if (prof.error || !prof.data) throw new Error(`profiles 자기 행 없음: ${prof.error?.message}`);
  const sch = await client.from("schools").select("name").eq("id", prof.data.school_id as string).single();
  if (sch.error || !sch.data) throw new Error(`schools 자기 학교 없음: ${sch.error?.message}`);
  return { userId, role: prof.data.role as string, schoolName: sch.data.name as string };
}

/**
 * 브라우저 세션 쿠키의 access token 으로 만든 supabase-js 클라이언트 (publishable 키 + RLS).
 * 추가 로그인 호출 없음. service role 미사용.
 */
export async function browserClient(page: Page): Promise<{ client: SupabaseClient; userId: string }> {
  const cookies = (await page.context().cookies()).filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name));
  if (cookies.length === 0) throw new Error("로그인 세션 쿠키(sb-*-auth-token) 없음");
  cookies.sort((a, b) => Number(a.name.split(".").pop()) - Number(b.name.split(".").pop()));
  let raw = cookies.map((c) => decodeURIComponent(c.value)).join("");
  if (raw.startsWith("base64-")) raw = Buffer.from(raw.slice("base64-".length), "base64url").toString("utf8");
  const sess = JSON.parse(raw) as { access_token: string; user: { id: string } };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / PUBLISHABLE_KEY 없음");
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${sess.access_token}` } },
  });
  return { client, userId: sess.user.id };
}

/** 화면 1 이 그려졌는지 (빈 화면에서 0개를 세어 통과하지 않도록) */
export async function waitLoginScreen(page: Page): Promise<void> {
  await page.waitForLoadState("load");
  await expect(page.locator(sel("ex-auth-form-card")).first()).toBeVisible();
}

/** seed.sql 의 `insert into public.{table} (cols) values (...)` 행들을 열 이름 → 문자열 값으로 읽는다 (따옴표 값만) */
export function seedRows(table: string): Record<string, string>[] {
  const sql = readFileSync(join(process.cwd(), "supabase", "seed.sql"), "utf8");
  const m = sql.match(
    new RegExp(String.raw`insert into public\.${table}\s*\(([^)]*)\)\s*values([\s\S]*?)\s+on conflict`, "i"),
  );
  if (!m) throw new Error(`seed.sql 에 ${table} insert 없음`);
  const cols = m[1].split(",").map((c) => c.trim());
  const out: Record<string, string>[] = [];
  for (const line of m[2].split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith("(")) continue;
    // 값: '…' | null | 숫자 — 쉼표로 나누되 따옴표 안 쉼표는 무시
    const vals = [...t.slice(1, t.lastIndexOf(")")).matchAll(/'((?:[^']|'')*)'|([^,\s][^,]*)/g)].map((v) =>
      v[1] !== undefined ? v[1].replace(/''/g, "'") : v[2].trim(),
    );
    if (vals.length !== cols.length) throw new Error(`seed.sql ${table} 행 열 수 불일치: ${t}`);
    out.push(Object.fromEntries(cols.map((c, i) => [c, vals[i]])));
  }
  if (out.length === 0) throw new Error(`seed.sql ${table} 행 0개`);
  return out;
}
