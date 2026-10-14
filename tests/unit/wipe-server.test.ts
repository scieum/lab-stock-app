// 시약 전체 삭제 · 기록 삭제 서버 읽기/쓰기(lib/supabase/wipe) · 관리 요약(lib/supabase/manage getManageSummary · getDemoManageCounts).
// 기준(구현이 아니라 여기서 도출): harness/d7-data.md §29(전체 삭제 진입 admin 만 · school-name-confirm '학교 이름이 달라요' ·
//   wipe_reagents(p_school_name) · count_wipe_records(p_before, null = 전체) · wipe_records(p_before, p_school_name) 반환 {usage_count, intake_count} ·
//   서버(DB 함수)가 학교명을 다시 받아 확인 · 화면 18 요약 = 역할별 항목 · 한 번의 서버 읽기(RLS)),
//   design/rules.json wipe.school_name_confirm · manage.list(재고 = 모든 역할 / 입고·주문 재주문 알림 = 교사·admin / 학교 사용자·판매처 = admin) · manage.guest.
// DB 는 가짜 클라이언트(호출 기록) — RLS 자체는 tests/e2e/db-s2-s10-wipe.spec.ts 가 실제 DB 로 본다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROOT, rules } from "./helpers";

// ---------- 모듈 잇기 (vitest 에 @ 별칭 없음) ----------
vi.mock("server-only", () => ({}));
vi.mock("@/lib/wipe-rules", async () => await import("../../lib/wipe-rules"));
vi.mock("@/lib/types", async () => await import("../../lib/types"));

const DEMO_ID = (() => {
  const m = readFileSync(join(ROOT, "lib", "supabase", "demo-data.ts"), "utf8").match(/export const DEMO_SCHOOL_ID\s*=\s*"([0-9a-f-]{36})"/);
  if (!m) throw new Error("lib/supabase/demo-data.ts 에서 DEMO_SCHOOL_ID 를 찾지 못함");
  return m[1];
})();
vi.mock("../../lib/supabase/demo-data", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const src = fs.readFileSync(path.join(process.cwd(), "lib", "supabase", "demo-data.ts"), "utf8");
  return { DEMO_SCHOOL_ID: (src.match(/export const DEMO_SCHOOL_ID\s*=\s*"([0-9a-f-]{36})"/) ?? [])[1] };
});

// ---------- 가짜 Supabase ----------
type Call = { table: string; select: string; opts: unknown; filters: [string, unknown][] };
type TableResult = { data?: unknown; count?: number | null; error?: unknown };

const h = vi.hoisted(() => ({
  claimsSub: "user-1" as string | null,
  rpcResult: { data: null as unknown, error: null as unknown },
  rpcCalls: [] as { fn: string; args: Record<string, unknown> }[],
  calls: [] as { table: string; select: string; opts: unknown; filters: [string, unknown][] }[],
  tables: {} as Record<string, (filters: [string, unknown][], opts: unknown) => { data?: unknown; count?: number | null; error?: unknown }>,
  session: { kind: "signed-out" } as Record<string, unknown>,
}));

function fakeClient() {
  return {
    auth: { getClaims: async () => ({ data: h.claimsSub ? { claims: { sub: h.claimsSub } } : null, error: null }) },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      h.rpcCalls.push({ fn, args });
      return h.rpcResult;
    },
    from(table: string) {
      return {
        select(select: string, opts?: unknown) {
          const call: Call = { table, select, opts, filters: [] };
          h.calls.push(call);
          const q = {
            eq(col: string, v: unknown) {
              call.filters.push([col, v]);
              return q;
            },
            then(res: (v: TableResult) => unknown, rej?: (e: unknown) => unknown) {
              const fn = h.tables[table];
              const out: TableResult = fn ? fn(call.filters, opts) : { data: [], count: 0, error: null };
              return Promise.resolve({ data: out.data ?? null, count: out.count ?? null, error: out.error ?? null }).then(res, rej);
            },
          };
          return q;
        },
      };
    },
  };
}

vi.mock("../../lib/supabase/server", () => ({
  createClient: async () => fakeClient(),
  getServerClient: async () => fakeClient(),
  getServerSession: async () => h.session,
}));
vi.mock("../../lib/supabase/anon", () => ({ createAnonClient: () => fakeClient() }));

import { countWipeRecords, wipeReagents, wipeRecords } from "../../lib/supabase/wipe";
import { getDemoManageCounts, getManageSummary } from "../../lib/supabase/manage";
import { RECORD_WIPE_TEXT } from "../../lib/wipe-rules";

// ---------- 기대값 원본 ----------
/** rules wipe.school_name_confirm "다르면 muted '학교 이름이 달라요'" */
const MISMATCH = (() => {
  const m = /다르면 muted '([^']+)'/.exec(rules.wipe.school_name_confirm as string);
  if (!m) throw new Error("rules wipe.school_name_confirm 에서 학교명 틀림 문구를 읽지 못함");
  return m[1];
})();
const D7 = readFileSync(join(ROOT, "harness", "d7-data.md"), "utf8");
const D7_29 = D7.slice(D7.indexOf("## 29."), D7.indexOf("\n## ", D7.indexOf("## 29.") + 1));

/** DB 함수 오류 (마이그레이션 20261013210000 계약 — d7 §29 42501 admin·자기 학교·데모 / 22023 학교명·미래) */
const DB_ERRORS = {
  notAuthenticated: { code: "42501", message: "not authenticated" },
  noProfile: { code: "42501", message: "no profile" },
  demo: { code: "42501", message: "demo school is read-only" },
  adminOnly: { code: "42501", message: "admin only" },
  permissionDenied: { code: "42501", message: "permission denied for function wipe_reagents" },
  mismatch: { code: "22023", message: "school name mismatch" },
  future: { code: "22023", message: "before date in the future" },
  stockChanged: { code: "P0001", message: "records wipe must not change reagent stock" },
  network: { code: "", message: "fetch failed" },
} as const;

const HANGUL = /[가-힣]/;

beforeEach(() => {
  h.claimsSub = "user-1";
  h.rpcResult = { data: null, error: null };
  h.rpcCalls.length = 0;
  h.calls.length = 0;
  h.tables = {};
  h.session = { kind: "signed-out" };
});

describe("[R-db][S2] [R-db][S10] lib/supabase/wipe — DB 오류 코드 → 사용자 문구", () => {
  it("기대값 원본: rules 학교명 틀림 문구 · d7 §29 학교명 일치는 서버(DB 함수)도 다시 확인", () => {
    expect(MISMATCH).toBe("학교 이름이 달라요");
    expect(D7_29).toMatch(/서버\(DB 함수\)도 학교명을 다시 받아 확인한다/);
    expect(D7_29).toMatch(/p_before 미래 거부\(22023\)/);
  });

  const all = [wipeReagents, (n: unknown) => wipeRecords(null, n)] as const;
  const names = ["wipeReagents", "wipeRecords"];

  it("22023 school name mismatch → rules 문구 '학교 이름이 달라요' (두 함수 모두)", async () => {
    for (const [i, fn] of all.entries()) {
      h.rpcResult = { data: null, error: DB_ERRORS.mismatch };
      const r = await fn("임시고등학교");
      expect(r, names[i]).toEqual({ ok: false, error: MISMATCH });
    }
  });

  it("22023 before date in the future → 미래 날짜 문구(화면 날짜 칸과 같은 글) · 학교명 문구와 다름 (count · wipe 모두)", async () => {
    h.rpcResult = { data: null, error: DB_ERRORS.future };
    const c = await countWipeRecords("2026-10-13");
    const w = await wipeRecords("2026-10-13", "임시고등학교");
    expect(c).toEqual({ ok: false, error: RECORD_WIPE_TEXT.futureDate });
    expect(w).toEqual({ ok: false, error: RECORD_WIPE_TEXT.futureDate });
    expect(RECORD_WIPE_TEXT.futureDate).not.toBe(MISMATCH);
    expect(RECORD_WIPE_TEXT.futureDate).toMatch(HANGUL);
  });

  it("42501 은 이유별로 다른 한국어 문구: 로그인 없음 = 프로필 없음 · 데모 · admin 아님(= 그 밖의 42501) — DB 영문 메시지 노출 0", async () => {
    const text = async (e: { code: string; message: string }) => {
      h.rpcResult = { data: null, error: e };
      const r = await wipeReagents("임시고등학교");
      expect(r.ok).toBe(false);
      return (r as { error: string }).error;
    };
    const signedOut = await text(DB_ERRORS.notAuthenticated);
    const noProfile = await text(DB_ERRORS.noProfile);
    const demo = await text(DB_ERRORS.demo);
    const admin = await text(DB_ERRORS.adminOnly);
    const perm = await text(DB_ERRORS.permissionDenied);
    expect(noProfile, "no profile = 로그인 없음과 같은 안내").toBe(signedOut);
    expect(perm, "그 밖의 42501 = admin 만").toBe(admin);
    expect(new Set([signedOut, demo, admin]).size, "로그인 · 데모 · admin 문구 서로 다름").toBe(3);
    for (const t of [signedOut, demo, admin, perm]) {
      expect(t).toMatch(HANGUL);
      expect(t).not.toMatch(/42501|read-only|admin only|not authenticated|permission denied/i);
      expect(t).not.toBe(MISMATCH);
    }
  });

  it("P0001(재고 지문 달라짐 — 전체 취소) · 알 수 없는 오류 → 같은 실패 문구 · 학교명/미래/권한 문구와 다름 · 영문 노출 0", async () => {
    const texts: string[] = [];
    for (const e of [DB_ERRORS.stockChanged, DB_ERRORS.network, { code: "22023", message: "something else" }]) {
      h.rpcResult = { data: null, error: e };
      const r = await wipeRecords(null, "임시고등학교");
      expect(r.ok).toBe(false);
      texts.push((r as { error: string }).error);
    }
    expect(new Set(texts).size, "일반 실패 문구 하나").toBe(1);
    expect(texts[0]).toMatch(HANGUL);
    expect(texts[0]).not.toMatch(/stock|fetch|P0001/i);
    expect([MISMATCH, RECORD_WIPE_TEXT.futureDate]).not.toContain(texts[0]);
    h.rpcResult = { data: null, error: DB_ERRORS.adminOnly };
    expect(((await wipeReagents("x")) as { error: string }).error).not.toBe(texts[0]);
  });
});

describe("[R-db][S2] [R-db][S10] lib/supabase/wipe — DB 함수 호출 인자 · 반환", () => {
  it("wipeReagents: rpc wipe_reagents {p_school_name: 입력 그대로(앞뒤 공백 정리는 DB)} 1회 · 반환 수 → {ok, count}", async () => {
    h.rpcResult = { data: 7, error: null };
    expect(await wipeReagents("  임시고등학교 ")).toEqual({ ok: true, count: 7 });
    expect(h.rpcCalls).toEqual([{ fn: "wipe_reagents", args: { p_school_name: "  임시고등학교 " } }]);
    h.rpcResult = { data: 0, error: null };
    expect(await wipeReagents("임시고등학교")).toEqual({ ok: true, count: 0 });
  });

  it("wipeReagents: 학교명이 문자열 아님 → 학교명 문구 · DB 호출 0 / 로그인 없음 → DB 호출 0", async () => {
    for (const v of [undefined, null, 3, {}]) expect(await wipeReagents(v)).toEqual({ ok: false, error: MISMATCH });
    h.claimsSub = null;
    const r = await wipeReagents("임시고등학교");
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).not.toBe(MISMATCH);
    expect(h.rpcCalls, "DB 호출 없음").toEqual([]);
  });

  it("countWipeRecords: null = 전체(p_before null) · 'YYYY-MM-DD' 그대로 · 반환 {usage_count, intake_count} → {usage, intake}", async () => {
    h.rpcResult = { data: { usage_count: 12, intake_count: 3 }, error: null };
    expect(await countWipeRecords(null)).toEqual({ ok: true, counts: { usage: 12, intake: 3 } });
    expect(await countWipeRecords("2026-03-01")).toEqual({ ok: true, counts: { usage: 12, intake: 3 } });
    expect(h.rpcCalls).toEqual([
      { fn: "count_wipe_records", args: { p_before: null } },
      { fn: "count_wipe_records", args: { p_before: "2026-03-01" } },
    ]);
  });

  it("countWipeRecords · wipeRecords: 달력에 없는 날·형식 틀림·빈 값·undefined → 날짜 문구 · DB 호출 0", async () => {
    for (const v of ["2026-02-30", "2026-13-01", "2026/03/01", "20260301", "", undefined, 20260301]) {
      expect(await countWipeRecords(v), String(v)).toEqual({ ok: false, error: RECORD_WIPE_TEXT.invalidDate });
      expect(await wipeRecords(v, "임시고등학교"), String(v)).toEqual({ ok: false, error: RECORD_WIPE_TEXT.invalidDate });
    }
    expect(h.rpcCalls).toEqual([]);
  });

  it("wipeRecords: rpc wipe_records {p_before, p_school_name 그대로} · 반환 {usage_count, intake_count} → counts · 모양이 틀린 반환 = 실패(성공으로 보이지 않음)", async () => {
    h.rpcResult = { data: { usage_count: 5, intake_count: 0 }, error: null };
    expect(await wipeRecords("2026-03-01", " 임시고등학교")).toEqual({ ok: true, counts: { usage: 5, intake: 0 } });
    expect(await wipeRecords(null, "임시고등학교")).toEqual({ ok: true, counts: { usage: 5, intake: 0 } });
    expect(h.rpcCalls).toEqual([
      { fn: "wipe_records", args: { p_before: "2026-03-01", p_school_name: " 임시고등학교" } },
      { fn: "wipe_records", args: { p_before: null, p_school_name: "임시고등학교" } },
    ]);
    for (const bad of [null, 5, { usage_count: "x", intake_count: 1 }, {}]) {
      h.rpcResult = { data: bad, error: null };
      expect((await wipeRecords(null, "임시고등학교")).ok, JSON.stringify(bad)).toBe(false);
      expect((await countWipeRecords(null)).ok, JSON.stringify(bad)).toBe(false);
    }
    for (const v of [undefined, 1]) expect(await wipeRecords(null, v)).toEqual({ ok: false, error: MISMATCH });
  });
});

// ---------- 관리 요약 ----------
const SCHOOL = { id: "school-a", name: "임시고등학교" };
const member = (role: string) => ({ kind: "member", userId: "u", role, displayName: "이름", school: SCHOOL });

function seedTables(): void {
  h.tables = {
    // stock < min_stock = 재고 부족 (2개)
    reagents: () => ({ data: [
      { stock: 1, min_stock: 5 },
      { stock: 5, min_stock: 5 },
      { stock: 0, min_stock: 2 },
      { stock: 10, min_stock: 0 },
    ] }),
    sensors: (f) => ({ count: f.some(([c, v]) => c === "status" && v === "broken") ? 1 : 6 }),
    cabinets: () => ({ count: 2 }),
    profiles: () => ({ data: [{ role: "student" }, { role: "student" }, { role: "student" }, { role: "teacher" }, { role: "admin" }] }),
    vendors: () => ({ count: 4 }),
  };
}

/** rules manage.list 에서 역할별 항목 (재고 = 모든 역할 / 입고·주문 = 교사·admin / 학교 = admin) */
const LIST = rules.manage.list as string;

describe("[R-db][S18] lib/supabase/manage getManageSummary — 역할별 요약 필드 · 자기 학교 · 한 번의 읽기", () => {
  it("기대값 원본: rules manage.list 묶음별 역할 · d7 §29 요약 숫자는 한 번의 서버 읽기(RLS)", () => {
    expect(LIST).toMatch(/'재고' = 시약 · 센서 · 시약장\(모든 역할\)/);
    expect(LIST).toMatch(/재주문 알림\(교사·admin\)/);
    expect(LIST).toMatch(/'학교' = 사용자 · 판매처\(admin\)/);
    expect(D7_29).toMatch(/요약 숫자는 한 번의 서버 읽기\(RLS\)로/);
  });

  it("학생: 시약 {total, low} · 센서 {total, broken} · 시약장만 — 재주문 · 사용자 · 판매처 없음 · profiles · vendors 를 읽지 않음", async () => {
    seedTables();
    h.session = member("student");
    const r = await getManageSummary();
    expect(r).toEqual({
      kind: "ok",
      data: { role: "student", schoolName: SCHOOL.name, counts: { reagents: { total: 4, low: 2 }, sensors: { total: 6, broken: 1 }, cabinets: 2 } },
    });
    expect(h.calls.map((c) => c.table).filter((t) => t === "profiles" || t === "vendors"), "학생은 profiles · vendors 읽기 0").toEqual([]);
  });

  it("교사: + 재주문 알림 수(= 재고 부족 수, 화면 6 기준 stock < min_stock) — 사용자 · 판매처 없음", async () => {
    seedTables();
    h.session = member("teacher");
    const r = await getManageSummary();
    expect(r.kind).toBe("ok");
    const counts = (r as { data: { counts: Record<string, unknown> } }).data.counts;
    expect(counts).toEqual({ reagents: { total: 4, low: 2 }, sensors: { total: 6, broken: 1 }, cabinets: 2, reorder: 2 });
    expect(h.calls.map((c) => c.table).filter((t) => t === "profiles" || t === "vendors")).toEqual([]);
  });

  it("admin: + 사용자 {학생 a · 교사 b · admin c} · 판매처 N (우리 학교)", async () => {
    seedTables();
    h.session = member("admin");
    const r = await getManageSummary();
    expect(r).toEqual({
      kind: "ok",
      data: {
        role: "admin",
        schoolName: SCHOOL.name,
        counts: { reagents: { total: 4, low: 2 }, sensors: { total: 6, broken: 1 }, cabinets: 2, reorder: 2, users: { student: 3, teacher: 1, admin: 1 }, vendors: 4 },
      },
    });
  });

  it("[N1-db][S18] 모든 읽기에 school_id = 자기 학교 조건 · 한 번(테이블마다 1회, 센서 고장 수만 따로) · 숫자 세기는 head 요청", async () => {
    seedTables();
    h.session = member("admin");
    await getManageSummary();
    for (const c of h.calls) expect(c.filters, `${c.table} school_id 조건`).toContainEqual(["school_id", SCHOOL.id]);
    const tables = h.calls.map((c) => c.table).sort();
    expect(tables).toEqual(["cabinets", "profiles", "reagents", "sensors", "sensors", "vendors"]);
    for (const c of h.calls.filter((x) => ["sensors", "cabinets", "vendors"].includes(x.table))) {
      expect(c.opts, `${c.table} = count 만`).toMatchObject({ count: "exact", head: true });
    }
  });

  it("읽기 오류가 난 항목은 숫자를 비운다(0 으로 지어내지 않음) — 이름만 보이게", async () => {
    seedTables();
    h.tables.reagents = () => ({ error: { message: "x" } });
    h.tables.vendors = () => ({ error: { message: "x" }, count: null });
    h.session = member("admin");
    const r = await getManageSummary();
    const counts = (r as { data: { counts: Record<string, unknown> } }).data.counts;
    expect(counts.reagents).toBeUndefined();
    expect(counts.reorder).toBeUndefined();
    expect(counts.vendors).toBeUndefined();
    expect(counts.cabinets).toBe(2);
  });

  it("로그인 없음 · 확인 불가 → signed-out / 소속 학교 없음 → no-school · DB 표 읽기 0", async () => {
    seedTables();
    for (const [s, kind] of [
      [{ kind: "signed-out" }, "signed-out"],
      [{ kind: "unavailable", userId: "u" }, "signed-out"],
      [{ kind: "no-school", userId: "u" }, "no-school"],
    ] as const) {
      h.session = s;
      expect(await getManageSummary()).toEqual({ kind });
    }
    expect(h.calls).toEqual([]);
  });
});

describe("[GM-db][S18] lib/supabase/manage getDemoManageCounts — 둘러보기 = 데모 학교 시약 · 센서만", () => {
  it("rules manage.guest '재고' 묶음 시약 · 센서 두 줄 → counts = {reagents, sensors} 만 · 모든 읽기 school_id = 데모 학교", async () => {
    expect(rules.manage.guest as string).toMatch(/시약 · 센서 두 줄만/);
    seedTables();
    const counts = await getDemoManageCounts();
    expect(counts).toEqual({ reagents: { total: 4, low: 2 }, sensors: { total: 6, broken: 1 } });
    expect(h.calls.length).toBeGreaterThan(0);
    for (const c of h.calls) expect(c.filters, `${c.table} 데모 학교 조건`).toContainEqual(["school_id", DEMO_ID]);
    expect(h.calls.map((c) => c.table).filter((t) => !["reagents", "sensors"].includes(t)), "시약 · 센서 밖 읽기 0").toEqual([]);
  });
});
