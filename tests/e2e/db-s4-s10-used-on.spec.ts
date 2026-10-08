// [R-db][S4] · [R-db][S10] · [R-db][S6] · [N1-db][S4] · [N1-db][S10] · [GM-db][S4]
// 사용일 (d7 §15, 2026-10-07 — design/rules.json 1.17 usage_date) DB 권한·동작 — 실제 RLS·함수 (publishable 키 + 각 계정 세션).
// 기준: harness/d7-data.md §15 (used_on = 한국 날짜, 기본 오늘, 오늘 이후 거부, 과거 하한 없음, 화면 10 정렬·기간 = 사용일,
//       §11-1 28일 = used_on ≥ 오늘 − 27일), §2·§5 (자기 학교만 · 데모 쓰기 금지), §7 (usage_history).
//
// 절대 규칙 (운영 DB):
// - 성공하는 쓰기는 일회용 학교 A'(admin·교사·학생)·B'(admin)의 일회용 계정·임시 시약으로만 한다.
//   일회용 학교·계정은 service role 로 만든다 (screen-8-helpers: createUser + register_profile, 세션은 generateLink → verifyOtp).
// - 판정 대상 호출은 항상 로그인 세션(publishable 키)으로 한다. service role 은 준비·정리·대조 조회만.
// - 공용 학교 A·B·데모 학교에는 쓰지 않는다. 데모 학교는 "거부되어야 하는 호출"만 하고 앞뒤 전체 행이 같아야 한다.
// - usage_logs 는 reagents·계정 FK 가 cascade 가 아니다 → 정리 순서: usage_logs → 시약(intake_logs cascade) → 프로필 → 계정 → 학교. 끝에 잔여물 0.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type TestInfo } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anonClient } from "./db-helpers";
import { AUTO_WINDOW_DAYS, autoFromIntake, autoFromUsage } from "./reorder-auto-helpers";
import { tempSchoolLike, HAS_SERVICE, NO_RESIDUE, addMember, clientFor, profileByService, service, sweep, tempSchool, type TempSchool, type TempUser } from "./screen-8-helpers";

test.describe.configure({ mode: "default" });

const GROUP = "usedon";
const TIMEOUT = 300_000;
const NO_SERVICE_REASON = "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)";

/** d7 §15 "오늘 이후는 거부" — 마이그레이션 계약의 오류 코드 (datetime_field_overflow) */
const FUTURE_CODE = "22008";

const D7 = readFileSync(join(process.cwd(), "harness", "d7-data.md"), "utf8");
const D7_15 = D7.slice(D7.indexOf("## 15."), D7.indexOf("\n## ", D7.indexOf("## 15.") + 1));
/** d7 §15 재주문 기준 자동: "used_on ≥ 오늘 − 27일" */
const WINDOW_BACK = Number((/used_on ≥ 오늘 − (\d+)일/.exec(D7_15) ?? [])[1]);

const DEMO_SCHOOL_ID = (() => {
  const src = readFileSync(join(process.cwd(), "lib", "supabase", "demo-data.ts"), "utf8");
  const m = src.match(/export const DEMO_SCHOOL_ID\s*=\s*"([0-9a-f-]{36})"/);
  if (!m) throw new Error("lib/supabase/demo-data.ts 에서 DEMO_SCHOOL_ID 를 찾지 못했습니다");
  return m[1];
})();
const storageClasses = (JSON.parse(readFileSync(join(process.cwd(), "design", "rules.json"), "utf8")) as { cabinet: { storage_classes: string[] } }).cabinet.storage_classes;

type Row = Record<string, unknown>;
type DbError = { code?: string; message: string };
type Res = { data: unknown; error: DbError | null };
type RoleKey = "student" | "teacher" | "admin";
const ROLE_TEXT: Record<RoleKey, string> = { student: "학생", teacher: "교사", admin: "admin" };
const ROLES: RoleKey[] = ["student", "teacher", "admin"];

// ---------- 한국 날짜 ----------
const KST = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
const seoulOf = (d: Date) => KST.format(d);
/** 한국 오늘 − days (days 음수 = 미래) */
const daysAgo = (days: number) => seoulOf(new Date(Date.now() - days * 86_400_000));
/** "YYYY-MM-DD" 의 한국 0시 */
const kstMidnight = (ymd: string) => new Date(`${ymd}T00:00:00+09:00`);
/** 판정 시작 시각의 한국 날짜가 끝날 때까지 바뀌지 않게 — 한국 자정 앞뒤 2분이면 기다린다 */
async function awayFromMidnight(): Promise<void> {
  for (;;) {
    const now = Date.now();
    const next = kstMidnight(daysAgo(-1)).getTime();
    const prev = kstMidnight(daysAgo(0)).getTime();
    if (next - now > 120_000 && now - prev > 120_000) return;
    await new Promise((r) => setTimeout(r, 30_000));
  }
}

const firstRow = (data: unknown): Row | null => (Array.isArray(data) ? ((data[0] as Row | undefined) ?? null) : ((data as Row | null) ?? null));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- 일회용 학교 ----------
interface Fixture {
  a: TempSchool;
  b: TempSchool;
  users: Record<RoleKey, TempUser>;
  c: Record<RoleKey, SupabaseClient>;
  bAdmin: SupabaseClient;
}

let fixtureCache: Promise<Fixture> | null = null;

function fixture(info: TestInfo): Promise<Fixture> {
  fixtureCache ??= (async () => {
    const a = await tempSchool(info, GROUP);
    const admin = await clientFor(a.admin);
    const teacher = await addMember(a, info, GROUP, "교사");
    const up = await admin.rpc("change_member_role", { p_user_id: teacher.id, p_role: "teacher" });
    expect(up.error, `준비: 일회용 교사 역할 (${up.error?.message})`).toBeNull();
    const student = await addMember(a, info, GROUP, "학생");
    expect((await profileByService(teacher.id))?.role).toBe("teacher");
    expect((await profileByService(student.id))?.role).toBe("student");
    const b = await tempSchool(info, GROUP);
    return {
      a,
      b,
      users: { admin: a.admin, teacher, student },
      c: { admin, teacher: await clientFor(teacher), student: await clientFor(student) },
      bAdmin: await clientFor(b.admin),
    };
  })();
  fixtureCache.catch(() => {
    fixtureCache = null;
  });
  return fixtureCache;
}

let seq = 0;
/** 임시 시약 (DB 함수 register_reagent — 일회용 admin 세션). 재고 넉넉히 */
async function reagent(c: SupabaseClient, stock = 100): Promise<string> {
  seq += 1;
  const res = await c.rpc("register_reagent", {
    p_name: `임시사용일-${seq}-${Math.random().toString(36).slice(2, 7)}`,
    p_storage_class: storageClasses[0],
    p_stock: stock,
    p_unit: "g",
    p_intake_date: "2026-09-15",
    p_msds_url: null,
  });
  expect(res.error, `준비: register_reagent (${res.error?.message})`).toBeNull();
  return firstRow(res.data)!.id as string;
}

const record = (c: SupabaseClient, id: string, amount: number, usedOn?: string | null, memo?: string): Promise<Res> => {
  const args: Row = { reagent_id: id, amount };
  if (usedOn !== undefined) args.used_on = usedOn;
  if (memo !== undefined) args.memo = memo;
  return c.rpc("record_usage", args) as unknown as Promise<Res>;
};

async function stockOf(id: string): Promise<number> {
  const r = await service().from("reagents").select("stock").eq("id", id).single();
  if (r.error) throw new Error(`대조 조회 실패: ${r.error.message}`);
  return Number(r.data.stock);
}
async function logsOf(id: string): Promise<Row[]> {
  const r = await service().from("usage_logs").select("id, school_id, user_id, amount, used_at, used_on, memo").eq("reagent_id", id).order("used_at");
  if (r.error) throw new Error(`대조 조회 실패: ${r.error.message}`);
  return (r.data ?? []) as Row[];
}

function expectRejected(res: Res, what: string, code?: string): void {
  expect(res.error, `${what}: 거부되어야 함`).not.toBeNull();
  expect(String(res.error?.code ?? ""), `${what}: ${res.error?.message}`).not.toMatch(/^PGRST/);
  if (code) expect(res.error?.code, `${what}: 오류 코드 (${res.error?.message})`).toBe(code);
  expect(firstRow(res.data), `${what}: 반환 행 없음`).toBeNull();
}

// ---------- 데모 학교 스냅숏 (anon 읽기) ----------
async function demoSnapshot(): Promise<{ logs: Row[]; reagents: Row[] }> {
  const anon = anonClient();
  const logs = await anon.from("usage_logs").select("*").eq("school_id", DEMO_SCHOOL_ID).order("id");
  const reagents = await anon.from("reagents").select("*").eq("school_id", DEMO_SCHOOL_ID).order("id");
  expect(logs.error, `anon 데모 usage_logs: ${logs.error?.message}`).toBeNull();
  expect(reagents.error, `anon 데모 reagents: ${reagents.error?.message}`).toBeNull();
  expect((reagents.data ?? []).length, "데모 시약 ≥1 (양성 대조군)").toBeGreaterThan(0);
  return { logs: (logs.data ?? []) as Row[], reagents: (reagents.data ?? []) as Row[] };
}

let demoBefore: { logs: Row[]; reagents: Row[] } | null = null;

test.beforeAll(async ({}, info) => {
  info.setTimeout(120_000);
  demoBefore = await demoSnapshot();
});

test.afterAll(async ({}, info) => {
  info.setTimeout(TIMEOUT);
  let left: Awaited<ReturnType<typeof sweep>> | null = null;
  const rest: Record<string, number> = {};
  let sharedLogsByTemp = -1;
  if (HAS_SERVICE) {
    const sb = service();
    const schools = await sb.from("schools").select("id").like("neis_code", tempSchoolLike(GROUP, info.project.name));
    const ids = (schools.data ?? []).map((s) => s.id as string);
    const profs = ids.length ? await sb.from("profiles").select("user_id").in("school_id", ids) : { data: [] as Row[] };
    const tempUsers = ((profs.data ?? []) as Row[]).map((p) => p.user_id as string);
    if (ids.length) {
      await sb.from("usage_logs").delete().in("school_id", ids);
      await sb.from("reagents").delete().in("school_id", ids);
    }
    for (const table of ["reagents", "intake_logs", "usage_logs"]) {
      const r = ids.length ? await sb.from(table).select("id").in("school_id", ids) : { data: [] as unknown[] };
      rest[table] = (r.data ?? []).length;
    }
    // 공용 학교(A·B·데모)에 일회용 계정이 남긴 사용 기록 = 0
    const shared = await sb.from("schools").select("id").or("neis_code.like.TEST-SCHOOL-%,is_demo.eq.true");
    const sharedIds = (shared.data ?? []).map((s) => s.id as string);
    sharedLogsByTemp = tempUsers.length && sharedIds.length ? ((await sb.from("usage_logs").select("id").in("school_id", sharedIds).in("user_id", tempUsers)).data ?? []).length : 0;
    left = await sweep(GROUP, info.project.name);
    fixtureCache = null;
  }
  if (left) {
    expect(rest, "일회용 학교의 시약·기록 잔여물").toEqual({ reagents: 0, intake_logs: 0, usage_logs: 0 });
    expect(left, "일회용 계정·학교·프로필 잔여물").toEqual(NO_RESIDUE);
    expect(sharedLogsByTemp, "공용 학교 A·B·데모에 일회용 계정의 사용 기록").toBe(0);
  }
  if (demoBefore) {
    const after = await demoSnapshot();
    expect(after.logs, "데모 usage_logs (전체 열) 불변").toEqual(demoBefore.logs);
    expect(after.reagents, "데모 reagents (전체 열) 불변").toEqual(demoBefore.reagents);
  }
});

test.describe("일회용 학교", () => {
  test.skip(!HAS_SERVICE, NO_SERVICE_REASON);

  test("[R-db][S4] 기대값 원본: d7 §15 사용일 규칙 · §11-1 28일 창 = used_on ≥ 오늘 − 27일", () => {
    expect(D7_15).toMatch(/used_on date not null/);
    expect(D7_15).toMatch(/기본 = 오늘 한국 날짜/);
    expect(D7_15).toMatch(/오늘\(한국 날짜\) 이후는 거부/);
    expect(WINDOW_BACK, "d7 §15 28일 창 뒤로 N일").toBe(AUTO_WINDOW_DAYS - 1);
  });

  for (const role of ROLES) {
    test(`[R-db][S4] 일회용 ${ROLE_TEXT[role]} record_usage 사용일: 생략 = 한국 오늘 · 과거(어제·40일 전·2000-01-01) 그대로 저장 · 기록 시각(used_at)은 지금 · 재고 차감`, async ({}, info) => {
      test.setTimeout(TIMEOUT);
      const f = await fixture(info);
      await awayFromMidnight();
      const id = await reagent(f.c.admin);
      const today = daysAgo(0);
      const cases: (string | undefined)[] = [undefined, null as unknown as string, daysAgo(1), daysAgo(40), "2000-01-01", today];
      let stock = await stockOf(id);
      for (const usedOn of cases) {
        const t0 = Date.now();
        const res = await record(f.c[role], id, 1, usedOn);
        expect(res.error, `record_usage(used_on=${String(usedOn)}): ${res.error?.code} ${res.error?.message}`).toBeNull();
        const row = firstRow(res.data)!;
        const want = usedOn ?? today;
        expect(row.used_on, `반환 used_on (인자 ${String(usedOn)})`).toBe(want);
        const saved = (await logsOf(id)).find((l) => l.id === row.id)!;
        expect(saved.used_on, "저장된 used_on").toBe(want);
        expect(saved.user_id, "자기 user_id").toBe(f.users[role].id);
        expect(saved.school_id, "자기 학교").toBe(f.a.id);
        expect(Math.abs(Date.parse(String(saved.used_at)) - t0), "used_at = 기록한 시각(지금)").toBeLessThan(60_000);
        expect(await stockOf(id), "재고 1 차감").toBe(stock - 1);
        stock -= 1;
      }
    });

    test(`[R-db][S4] 일회용 ${ROLE_TEXT[role]} record_usage 미래 사용일(내일·다음 달·내년) → ${FUTURE_CODE} 거부 · 재고·usage_logs 그대로`, async ({}, info) => {
      test.setTimeout(TIMEOUT);
      const f = await fixture(info);
      await awayFromMidnight();
      const id = await reagent(f.c.admin);
      const stock = await stockOf(id);
      for (const usedOn of [daysAgo(-1), daysAgo(-31), daysAgo(-366)]) {
        expectRejected(await record(f.c[role], id, 1, usedOn), `${ROLE_TEXT[role]} used_on=${usedOn}`, FUTURE_CODE);
        expectRejected(await record(f.c[role], id, 1, usedOn, "메모와 함께"), `${ROLE_TEXT[role]} used_on=${usedOn} + 메모`, FUTURE_CODE);
      }
      expect(await stockOf(id), "재고 그대로").toBe(stock);
      expect(await logsOf(id), "usage_logs 0행").toEqual([]);
      // 대조군: 같은 호출을 오늘로 하면 된다
      expect((await record(f.c[role], id, 1, daysAgo(0))).error, "대조: 오늘 사용일").toBeNull();
    });

    test(`[R-db][S4] 일회용 ${ROLE_TEXT[role]} usage_logs 직접 insert 로도 미래 사용일은 ${FUTURE_CODE} 거부 (행 0)`, async ({}, info) => {
      test.setTimeout(TIMEOUT);
      const f = await fixture(info);
      await awayFromMidnight();
      const id = await reagent(f.c.admin);
      for (const usedOn of [daysAgo(-1), daysAgo(-400)]) {
        const ins = await f.c[role]
          .from("usage_logs")
          .insert({ school_id: f.a.id, reagent_id: id, user_id: f.users[role].id, amount: 1, used_on: usedOn })
          .select("id");
        expect(ins.error, `직접 insert used_on=${usedOn} 는 오류여야 함`).not.toBeNull();
        expect(ins.error?.code, `직접 insert used_on=${usedOn}: ${ins.error?.message}`).toBe(FUTURE_CODE);
      }
      expect(await logsOf(id), "usage_logs 0행").toEqual([]);
    });
  }

  test(`[R-db][S4] 일회용 교사 record_usage 날짜가 아닌 사용일("2026-02-30"·"2026-13-01"·"내일") → 거부 (22xxx, 재고 그대로)`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const id = await reagent(f.c.admin);
    const stock = await stockOf(id);
    for (const v of ["2026-02-30", "2026-13-01", "내일"]) {
      const res = await record(f.c.teacher, id, 1, v);
      expectRejected(res, `used_on=${v}`);
      expect(String(res.error?.code), `used_on=${v} 오류 코드 (${res.error?.message})`).toMatch(/^22/);
    }
    expect(await stockOf(id)).toBe(stock);
    expect(await logsOf(id)).toEqual([]);
  });

  test(`[N1-db][S4] 일회용 학교 B' admin 이 학교 A' 시약에 과거 사용일 record_usage → 거부 (재고·기록 그대로) · A' 학생도 B' 시약에 거부`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const aId = await reagent(f.c.admin);
    const bId = await reagent(f.bAdmin);
    const [aStock, bStock] = [await stockOf(aId), await stockOf(bId)];
    expectRejected(await record(f.bAdmin, aId, 1, daysAgo(3)), "B' admin → A' 시약", "P0002");
    for (const role of ROLES) expectRejected(await record(f.c[role], bId, 1, daysAgo(3)), `A' ${ROLE_TEXT[role]} → B' 시약`, "P0002");
    expect([await stockOf(aId), await stockOf(bId)]).toEqual([aStock, bStock]);
    expect([...(await logsOf(aId)), ...(await logsOf(bId))]).toEqual([]);
    // 대조군: 자기 학교 시약은 된다
    expect((await record(f.bAdmin, bId, 1, daysAgo(3))).error, "대조: B' admin → B' 시약").toBeNull();
  });

  test(`[GM-db][S4] 데모 학교 시약에 과거 사용일 record_usage: 일회용 학생·교사·admin · anon 모두 거부 (데모 usage_logs·reagents 불변)`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const before = await demoSnapshot();
    const target = before.reagents[0].id as string;
    for (const role of ROLES) expectRejected(await record(f.c[role], target, 0.01, daysAgo(2), "GM 사용일"), `${ROLE_TEXT[role]} → 데모 시약`);
    expectRejected(await record(anonClient(), target, 0.01, daysAgo(2)), "anon → 데모 시약");
    const after = await demoSnapshot();
    expect(after.logs, "데모 usage_logs 불변").toEqual(before.logs);
    expect(after.reagents, "데모 reagents 불변").toEqual(before.reagents);
  });

  test(`[R-db][S10] usage_history 정렬 = 사용일 최신순, 같은 날은 기록 시각 최신순 · 늦게 기록한 지난 날짜는 그 날짜 자리 · used_on 반환`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    await awayFromMidnight();
    const id = await reagent(f.c.admin);
    // 기록 순서와 사용일 순서를 일부러 섞는다
    const plan: { role: RoleKey; usedOn: string }[] = [
      { role: "student", usedOn: daysAgo(0) },
      { role: "teacher", usedOn: daysAgo(5) },
      { role: "admin", usedOn: daysAgo(1) },
      { role: "student", usedOn: daysAgo(5) },
      { role: "teacher", usedOn: daysAgo(0) },
      { role: "admin", usedOn: daysAgo(400) },
    ];
    const made: { id: string; usedOn: string; at: number }[] = [];
    for (const p of plan) {
      const res = await record(f.c[p.role], id, 1, p.usedOn);
      expect(res.error, `준비 record_usage ${p.usedOn}: ${res.error?.message}`).toBeNull();
      const row = firstRow(res.data)!;
      made.push({ id: row.id as string, usedOn: p.usedOn, at: Date.parse(String(row.used_at)) });
      await sleep(20);
    }
    const want = [...made].sort((x, y) => (x.usedOn === y.usedOn ? y.at - x.at : x.usedOn < y.usedOn ? 1 : -1)).map((m) => m.id);
    for (const role of ROLES) {
      const res = await f.c[role].rpc("usage_history", { p_limit: 500 });
      expect(res.error, `${ROLE_TEXT[role]} usage_history: ${res.error?.message}`).toBeNull();
      const rows = (res.data ?? []) as Row[];
      const mine = rows.filter((r) => r.reagent_id === id);
      expect(mine.map((r) => r.id), `${ROLE_TEXT[role]}: 사용일 최신순 · 같은 날 기록 시각 최신순`).toEqual(want);
      for (const r of mine) expect(r.used_on, "used_on 반환 = 기록한 사용일").toBe(made.find((m) => m.id === r.id)!.usedOn);
      for (let i = 1; i < rows.length; i++) {
        const [a, b] = [rows[i - 1], rows[i]];
        expect(String(a.used_on) >= String(b.used_on), `전체 목록 ${i - 1}→${i} 사용일 순`).toBe(true);
        if (a.used_on === b.used_on) expect(Date.parse(String(a.used_at)) >= Date.parse(String(b.used_at)), `전체 목록 ${i - 1}→${i} 같은 날 기록 시각 순`).toBe(true);
      }
    }
  });

  test(`[R-db][S10] usage_history 기간(p_since) = 시작 시각의 한국 날짜 이후 사용일: 한국 0시 경계 · 기록 시각과 무관 · 1·3개월`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    await awayFromMidnight();
    const id = await reagent(f.c.admin);
    const days = [0, 1, 2, 40, 400];
    const byDay = new Map<number, string>();
    for (const d of days) {
      const res = await record(f.c.teacher, id, 1, daysAgo(d));
      expect(res.error, `준비 ${d}일 전: ${res.error?.message}`).toBeNull();
      byDay.set(d, firstRow(res.data)!.id as string);
    }
    const ids = async (since: string | null) => {
      const res = await f.c.student.rpc("usage_history", { p_since: since, p_limit: 500 });
      expect(res.error, `usage_history(p_since=${since}): ${res.error?.message}`).toBeNull();
      const rows = ((res.data ?? []) as Row[]).filter((r) => r.reagent_id === id);
      return days.filter((d) => rows.some((r) => r.id === byDay.get(d)));
    };
    // 모든 기록은 지금 기록했다(used_at = 지금) — 기간은 사용일로만 가른다
    expect(await ids(null), "기간 없음 = 전부").toEqual(days);
    expect(await ids(kstMidnight(daysAgo(1)).toISOString()), "한국 어제 0시부터 = 오늘·어제").toEqual([0, 1]);
    expect(await ids(new Date(kstMidnight(daysAgo(1)).getTime() - 1).toISOString()), "어제 0시 1ms 전(= 그제) 부터 = 오늘·어제·그제").toEqual([0, 1, 2]);
    expect(await ids(new Date(kstMidnight(daysAgo(0)).getTime() - 1).toISOString()), "어제 23:59:59.999(한국) 부터 = 어제 포함").toEqual([0, 1]);
    expect(await ids(kstMidnight(daysAgo(0)).toISOString()), "오늘 0시부터 = 오늘만").toEqual([0]);
    expect(await ids(new Date().toISOString()), "지금부터 = 오늘 사용일 전부(기록 시각이 앞이어도)").toEqual([0]);
    expect(await ids(kstMidnight(daysAgo(-1)).toISOString()), "내일 0시부터 = 0").toEqual([]);
    // 화면 기간(최근 1·3개월)과 같은 시작: 지금 − N개월 (d7 §7)
    const monthsBack = (n: number) => {
      const d = new Date();
      const day = d.getUTCDate();
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() - n);
      d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
      return d.toISOString();
    };
    expect(await ids(monthsBack(1)), "최근 1개월 = 40일 전 빠짐").toEqual([0, 1, 2]);
    expect(await ids(monthsBack(3)), "최근 3개월 = 40일 전 포함 · 400일 전 빠짐").toEqual([0, 1, 2, 40]);
  });

  test(`[N1-db][S10] usage_history 학교 분리: 일회용 A' 학생·교사·admin 에게 B' 의 지난 사용일 기록 0, B' admin 에게 A' 기록 0 (기간 전체)`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const aId = await reagent(f.c.admin);
    const bId = await reagent(f.bAdmin);
    const aLog = firstRow((await record(f.c.student, aId, 1, daysAgo(10))).data)!.id as string;
    const bLog = firstRow((await record(f.bAdmin, bId, 1, daysAgo(10))).data)!.id as string;
    for (const role of ROLES) {
      const rows = ((await f.c[role].rpc("usage_history", { p_limit: 500 })).data ?? []) as Row[];
      expect(rows.map((r) => r.id), `${ROLE_TEXT[role]}: 자기 학교 기록 보임 (대조)`).toContain(aLog);
      expect(rows.filter((r) => r.id === bLog || r.reagent_id === bId), `${ROLE_TEXT[role]}: B' 기록 0`).toEqual([]);
      const direct = await f.c[role].from("usage_logs").select("id").eq("id", bLog);
      expect(direct.data ?? [], `${ROLE_TEXT[role]}: B' usage_logs 직접 조회 0`).toEqual([]);
    }
    const bRows = ((await f.bAdmin.rpc("usage_history", { p_limit: 500 })).data ?? []) as Row[];
    expect(bRows.map((r) => r.id), "B' admin: 자기 기록 보임 (대조)").toContain(bLog);
    expect(bRows.filter((r) => r.id === aLog || r.reagent_id === aId), "B' admin: A' 기록 0").toEqual([]);
    for (const since of [null, kstMidnight(daysAgo(30)).toISOString()]) {
      const rows = ((await f.bAdmin.rpc("usage_history", { p_since: since, p_query: "임시사용일", p_limit: 500 })).data ?? []) as Row[];
      for (const r of rows) expect(r.reagent_id, `B' admin p_since=${since}: A' 시약 0`).not.toBe(aId);
    }
  });

  test(`[R-db][S6] 재주문 기준 자동 28일 창 = 사용일 기준 (d7 §15·§11-1): ${AUTO_WINDOW_DAYS - 1}일 전 사용일은 더하고 ${AUTO_WINDOW_DAYS}일 전은 뺀다 · 늦게 기록해도 사용일로 판정`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    await awayFromMidnight();
    const inside = AUTO_WINDOW_DAYS - 1;
    const outside = AUTO_WINDOW_DAYS;
    const read = async (id: string) => {
      const r = await f.c.teacher.from("reagents").select("min_stock, min_stock_source, min_stock_auto_basis").eq("id", id).single();
      expect(r.error, `시약 읽기: ${r.error?.message}`).toBeNull();
      return { min_stock: Number(r.data!.min_stock), source: r.data!.min_stock_source, basis: r.data!.min_stock_auto_basis };
    };
    // 창 밖(28일 전) 사용일만 → 사용량 근거가 없다 → 마지막 입고(등록 100) × 20%
    const x = await reagent(f.c.admin, 100);
    expect((await record(f.c.teacher, x, 30, daysAgo(outside))).error, `${outside}일 전 기록`).toBeNull();
    expect(await read(x), `${outside}일 전 사용일만 → 입고 근거`).toEqual({ min_stock: autoFromIntake(100), source: "auto", basis: "intake" });
    // 창 안 경계(27일 전) 사용일 → 사용량 근거, 창 밖 30 은 빠진다
    expect((await record(f.c.student, x, 8, daysAgo(inside))).error, `${inside}일 전 기록`).toBeNull();
    expect(await read(x), `${inside}일 전 8 은 더하고 ${outside}일 전 30 은 뺀다`).toEqual({ min_stock: autoFromUsage([8]), source: "auto", basis: "usage" });
    // 오늘 사용 + 지난 사용일 → 창 안 것만 합
    expect((await record(f.c.admin, x, 2)).error, "오늘 기록").toBeNull();
    expect(await read(x), "창 안(27일 전 8 + 오늘 2)").toEqual({ min_stock: autoFromUsage([8, 2]), source: "auto", basis: "usage" });
    expect((await read(x)).min_stock, "대조: 창 밖까지 더한 값이 아니다").not.toBe(autoFromUsage([30, 8, 2]));
  });
});
