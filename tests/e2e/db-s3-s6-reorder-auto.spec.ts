// [R-db][S6] · [R-db][S3] · [R-db][S5] · [R-db][S7] · [N1-db][S3] · [N1-db][S6] · [GM-db][S*]
// 재주문 기준 자동 (d7 §11-1, 2026-10-06 사용자 결정) — reagents.min_stock_source · min_stock_auto_basis,
// 자동 값(최근 28일 사용량 합 ÷ 2 / 마지막 입고량 × 20% / 0), 사용·입고·등록 때 다시 계산(source = 'auto' 만),
// save_reorder_basis(auto → 항상 바꿈) · set_reorder_threshold(→ manual) · reset_reorder_threshold(→ auto, "자동으로 돌리기"),
// 직접 update 가드(출처 열 직접 변경 거부 · 값을 직접 고치면 출처를 맞춤), low_stock_since 가 자동 값을 따라감.
// 기준: harness/d7-data.md §11-1 · §11 · §13 · §14 · §5, harness/d5-gates.md R-db·N1-db·GM-db.
// 숫자(28일 · ÷ 2 · 20% · 소수 3자리)는 d7 §11-1 문장에서 읽는다 (reorder-auto-helpers).
//
// 절대 규칙 (운영 DB):
// - 성공하는 쓰기는 일회용 학교 A'(admin·교사·학생)·B'(admin·교사)의 일회용 계정·임시 시약으로만 한다.
//   일회용 학교·계정은 service role 로 만든다 (screen-8-helpers: createUser + register_profile, 세션은 generateLink → verifyOtp).
// - 판정 대상 호출은 항상 로그인 세션(publishable 키)으로 한다. service role 은 준비·정리·대조 조회에만 쓴다.
//   (2026-10-07 d7 §15: "28일 창 밖" 사용 기록은 이제 세션의 record_usage(사용일 = 과거)로 만든다 — 창은 사용일 기준.)
// - 공용 계정(학교 A 학생·교사·admin, 학교 B 교사)은 읽기와 "거부되어야 하는 호출"만 한다. 공용 학교 A 시약의 출처를 바꾸지 않는다.
//   거부 호출이 구현 결함으로 통과했을 때만 그 시약을 service role 로 원래 값으로 되돌린다(정상이라면 호출 없음).
// - 데모 학교에는 쓰지 않는다. 데모 학교 시약은 이 스펙 앞뒤로 전체 열이 같아야 한다 (자동 다시 계산에서 빠짐).
// - usage_logs 는 reagents·계정 FK 가 cascade 가 아니다 → 정리 순서: usage_logs → 시약(intake_logs cascade) → 프로필 → 계정 → 학교.
//   끝에 잔여물 0 을 단언한다.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type TestInfo } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ROLE_LABEL, anonClient, signIn, type Role } from "./db-helpers";
import { AUTO_WINDOW_DAYS, autoFromIntake, autoFromUsage, withoutAutoDrift } from "./reorder-auto-helpers";
import {
  HAS_SERVICE,
  NO_RESIDUE,
  addMember,
  clientFor,
  profileByService,
  service,
  sweep,
  tempSchool,
  type TempSchool,
  type TempUser,
} from "./screen-8-helpers";

test.describe.configure({ mode: "default" });

/** 데모 학교 고정 id — lib/supabase/demo-data.ts (server-only 모듈이라 소스 텍스트에서 읽는다) */
const DEMO_SCHOOL_ID = (() => {
  const src = readFileSync(join(process.cwd(), "lib", "supabase", "demo-data.ts"), "utf8");
  const m = src.match(/export const DEMO_SCHOOL_ID\s*=\s*"([0-9a-f-]{36})"/);
  if (!m) throw new Error("lib/supabase/demo-data.ts 에서 DEMO_SCHOOL_ID 를 찾지 못했습니다");
  return m[1];
})();

const storageClasses = (JSON.parse(readFileSync(join(process.cwd(), "design", "rules.json"), "utf8")) as {
  cabinet: { storage_classes: string[] };
}).cabinet.storage_classes;

const GROUP = "rauto";
const SUCCESS_TIMEOUT = 420_000;
const NO_SERVICE_REASON =
  "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)";

/** Postgres 오류 코드 */
const DENIED = "42501";
const NOT_FOUND = "P0002";
/** 직접 update 가드의 오류 문구 (마이그레이션 20261006200000 계약) */
const SOURCE_GUARD_MESSAGE = "reorder threshold source only through functions";

type Row = Record<string, unknown>;
type DbError = { code?: string; message: string; details?: string | null; hint?: string | null };
type Res = { data: unknown; error: DbError | null };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tag = () => randomUUID().slice(0, 8);

// ---------- reagents 읽기 ----------

const COLS =
  "id, school_id, name, stock, min_stock, reorder_per_group, reorder_groups, low_stock_since, min_stock_source, min_stock_auto_basis";

type Reagent = {
  id: string;
  school_id: string;
  name: string;
  stock: number;
  min_stock: number;
  reorder_per_group: number | null;
  reorder_groups: number | null;
  low_stock_since: string | null;
  min_stock_source: string;
  min_stock_auto_basis: string | null;
};

function toReagent(r: Row): Reagent {
  return {
    id: r.id as string,
    school_id: r.school_id as string,
    name: r.name as string,
    stock: Number(r.stock),
    min_stock: Number(r.min_stock),
    reorder_per_group: r.reorder_per_group === null ? null : Number(r.reorder_per_group),
    reorder_groups: r.reorder_groups === null ? null : Number(r.reorder_groups),
    low_stock_since: (r.low_stock_since as string | null) ?? null,
    min_stock_source: r.min_stock_source as string,
    min_stock_auto_basis: (r.min_stock_auto_basis as string | null) ?? null,
  };
}

/** 로그인 세션(RLS)으로 읽은 시약 1행 */
async function readR(c: SupabaseClient, id: string): Promise<Reagent> {
  const r = await c.from("reagents").select(COLS).eq("id", id);
  expect(r.error, `reagents 조회: ${r.error?.message}`).toBeNull();
  expect(r.data ?? [], "reagents 조회 행").toHaveLength(1);
  return toReagent((r.data ?? [])[0] as Row);
}

/** 대조 조회 (service role): 시약 1행 (없으면 null) */
async function readByService(id: string): Promise<Reagent | null> {
  const r = await service().from("reagents").select(COLS).eq("id", id).maybeSingle();
  expect(r.error, `reagents 대조 조회: ${r.error?.message}`).toBeNull();
  return r.data ? toReagent(r.data as Row) : null;
}

/** 기준 관련 열만 */
const thresholdOf = (r: Reagent) => ({
  min_stock: r.min_stock,
  reorder_per_group: r.reorder_per_group,
  reorder_groups: r.reorder_groups,
  min_stock_source: r.min_stock_source,
  min_stock_auto_basis: r.min_stock_auto_basis,
});

const auto = (value: number, basis: "usage" | "intake" | null) => ({
  min_stock: value,
  reorder_per_group: null,
  reorder_groups: null,
  min_stock_source: "auto",
  min_stock_auto_basis: basis,
});

// ---------- 호출 ----------

async function register(c: SupabaseClient, stock: number): Promise<Reagent> {
  const res = await c.rpc("register_reagent", {
    p_name: `RA-시약-${tag()}`,
    p_storage_class: storageClasses[0],
    p_stock: stock,
    p_unit: "g",
    p_intake_date: "2026-09-15",
    p_msds_url: null,
  });
  expect(res.error, `register_reagent (준비): ${res.error?.code} ${res.error?.message}`).toBeNull();
  const row = (Array.isArray(res.data) ? res.data[0] : res.data) as Row;
  return readR(c, row.id as string);
}

async function use(c: SupabaseClient, id: string, amount: number): Promise<void> {
  const res = await c.rpc("record_usage", { reagent_id: id, amount });
  expect(res.error, `record_usage(${amount}): ${res.error?.code} ${res.error?.message}`).toBeNull();
}

async function intake(c: SupabaseClient, id: string, amount: number): Promise<void> {
  const res = await c.rpc("record_intake", { p_reagent_id: id, p_amount: amount, p_intake_date: "2026-09-20" });
  expect(res.error, `record_intake(${amount}): ${res.error?.code} ${res.error?.message}`).toBeNull();
}

const resetCall = async (c: SupabaseClient, id: string): Promise<Res> => c.rpc("reset_reorder_threshold", { p_reagent_id: id });
const setCall = async (c: SupabaseClient, id: string, v: number): Promise<Res> =>
  c.rpc("set_reorder_threshold", { p_reagent_id: id, p_min_stock: v });
const saveCall = async (c: SupabaseClient, items: unknown): Promise<Res> => c.rpc("save_reorder_basis", { p_items: items });

/** reset 성공: 반환 {reagent_id, min_stock, previous_min_stock} (키 정확히 셋) */
function expectReset(res: Res, what: string, want: { reagent_id: string; min_stock: number; previous_min_stock: number }): void {
  expect(res.error, `${what}: ${res.error?.code} ${res.error?.message}`).toBeNull();
  const out = (Array.isArray(res.data) ? res.data[0] : res.data) as Row;
  expect(Object.keys(out ?? {}).sort(), `${what} 반환 키`).toEqual(["min_stock", "previous_min_stock", "reagent_id"]);
  expect({ reagent_id: out.reagent_id, min_stock: Number(out.min_stock), previous_min_stock: Number(out.previous_min_stock) }, `${what} 반환값`).toEqual(want);
}

/** 거부: 오류가 있고(PostgREST 의 "함수 못 찾음" PGRST… 이 아님), 결과가 없고, 코드가 맞다 */
function expectRejected(res: Res, what: string, code?: string): void {
  expect(res.error, `${what} 는 오류여야 함 (반환 ${JSON.stringify(res.data)})`).not.toBeNull();
  expect(String(res.error?.code ?? ""), `${what}: ${res.error?.message}`).not.toMatch(/^PGRST/);
  expect(res.data ?? null, `${what} 반환값`).toBeNull();
  if (code) expect(res.error?.code, `${what} errcode (${res.error?.message})`).toBe(code);
}

function expectOk(res: Res, what: string): void {
  expect(res.error, `${what}: ${res.error?.code} ${res.error?.message}`).toBeNull();
}

/** 오류의 겉모습 (존재 여부가 새지 않는지 견줄 때) */
const shape = (res: Res) => ({
  code: res.error?.code ?? null,
  message: res.error?.message ?? null,
  details: res.error?.details ?? null,
  hint: res.error?.hint ?? null,
  data: res.data ?? null,
});

/** 바뀐(또는 돌려받은) 행 수: RLS 로 안 보이면 error 없이 0행, 권한이 없으면 오류 — 어느 쪽이든 0 */
function changed(res: { error: unknown; data: unknown }): number {
  if (res.error) return 0;
  return Array.isArray(res.data) ? res.data.length : res.data ? 1 : 0;
}

const update = async (c: SupabaseClient, id: string, patch: Row): Promise<Res> => c.from("reagents").update(patch).eq("id", id).select(COLS);

/** 성공해야 하는 직접 update → 바뀐 뒤의 행 */
async function patchOk(c: SupabaseClient, id: string, patch: Row, what: string): Promise<Reagent> {
  const res = await update(c, id, patch);
  expect(res.error, `${what}: ${res.error?.code} ${res.error?.message}`).toBeNull();
  const rows = (res.data ?? []) as Row[];
  expect(rows, `${what} 반환 행`).toHaveLength(1);
  return toReagent(rows[0]);
}

/** d7 §11 "아래로 내려가면 그 시각": 방금 일어난 일의 시각 */
const NEAR_NOW_MS = 120_000;
function expectNearNow(value: string | null, what: string): number {
  expect(value, `${what}: 시각 값이 있어야 함`).not.toBeNull();
  const t = Date.parse(value!);
  expect(Number.isNaN(t), `${what}: 시각 형식 (${value})`).toBe(false);
  expect(Math.abs(Date.now() - t), `${what}: 현재 시각 근처 (${value})`).toBeLessThan(NEAR_NOW_MS);
  return t;
}

// ---------- 일회용 학교 ----------

interface Fixture {
  school: TempSchool;
  other: TempSchool;
  teacherUser: TempUser;
  admin: SupabaseClient;
  teacher: SupabaseClient;
  student: SupabaseClient;
  otherAdmin: SupabaseClient;
  otherTeacher: SupabaseClient;
}

let fixtureCache: Promise<Fixture> | null = null;

async function makeTeacher(school: TempSchool, admin: SupabaseClient, info: TestInfo): Promise<TempUser> {
  const u = await addMember(school, info, GROUP, "교사");
  const up = await admin.rpc("change_member_role", { p_user_id: u.id, p_role: "teacher" });
  expect(up.error, `일회용 교사 역할 지정: ${up.error?.message}`).toBeNull();
  expect((await profileByService(u.id))?.role).toBe("teacher");
  return u;
}

/** 워커당 한 번: 일회용 학교 A'(admin·교사·학생) + 일회용 학교 B'(admin·교사) */
function fixture(info: TestInfo): Promise<Fixture> {
  fixtureCache ??= (async () => {
    const school = await tempSchool(info, GROUP);
    const admin = await clientFor(school.admin);
    const teacherUser = await makeTeacher(school, admin, info);
    const studentUser = await addMember(school, info, GROUP, "학생");
    expect((await profileByService(studentUser.id))?.role).toBe("student");
    const other = await tempSchool(info, GROUP);
    const otherAdmin = await clientFor(other.admin);
    const otherTeacherUser = await makeTeacher(other, otherAdmin, info);
    return {
      school,
      other,
      teacherUser,
      admin,
      teacher: await clientFor(teacherUser),
      student: await clientFor(studentUser),
      otherAdmin,
      otherTeacher: await clientFor(otherTeacherUser),
    };
  })();
  fixtureCache.catch(() => {
    fixtureCache = null;
  });
  return fixtureCache;
}

/** 일회용 학교의 사용 기록·시약(intake_logs cascade)을 비운다 (service role — 준비·정리) */
async function purge(schoolIds: string[]): Promise<void> {
  if (!schoolIds.length) return;
  const sb = service();
  const u = await sb.from("usage_logs").delete().in("school_id", schoolIds);
  expect(u.error, `일회용 학교 사용 기록 정리: ${u.error?.message}`).toBeNull();
  const r = await sb.from("reagents").delete().in("school_id", schoolIds);
  expect(r.error, `일회용 학교 시약 정리: ${r.error?.message}`).toBeNull();
}

async function fresh(info: TestInfo): Promise<Fixture> {
  test.setTimeout(SUCCESS_TIMEOUT);
  const f = await fixture(info);
  await purge([f.school.id, f.other.id]);
  return f;
}

/** 한국 날짜 "YYYY-MM-DD" (오늘 − daysAgo일) */
const seoulDaysAgo = (daysAgo: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() - daysAgo * 24 * 3600 * 1000));

/**
 * 과거 사용일의 사용 기록 1행. 2026-10-07 부터 28일 창은 사용일(used_on, d7 §15·§11-1) 기준이고, record_usage 가 사용일을 받으므로
 * 교사 세션의 record_usage(used_on = 한국 오늘 − daysAgo)로 만든다 (재고도 차감된다 — 시약은 넉넉한 재고로 등록).
 * 이 호출도 자동 다시 계산을 일으키지만, 판정은 이 뒤의 세션 호출(record_usage·record_intake) 결과로 한다.
 */
async function pastUsage(f: Fixture, reagentId: string, amount: number, daysAgo: number): Promise<void> {
  const usedOn = seoulDaysAgo(daysAgo);
  const r = await f.teacher.rpc("record_usage", { reagent_id: reagentId, amount, used_on: usedOn });
  expect(r.error, `준비: 과거 사용 기록(사용일 ${usedOn} = ${daysAgo}일 전) ${r.error?.code} ${r.error?.message}`).toBeNull();
  expect((r.data as Row | null)?.used_on, "저장된 사용일").toBe(usedOn);
}

// ---------- 공용·데모 학교 스냅숏 (읽기만) ----------

type Shared = { a: Row[]; b: Row[]; demo: Row[] };
/** 다른 스펙이 학교 A·B 에 잠깐 만드는 임시 시약 이름 접두사 */
const FOREIGN_TEMP = ["R-db-", "N1-db-", "S7-ui-"];

async function rowsOf(c: SupabaseClient, schoolId: string, what: string): Promise<Row[]> {
  const r = await c.from("reagents").select(COLS).eq("school_id", schoolId).order("id");
  expect(r.error, `${what} reagents 조회: ${r.error?.message}`).toBeNull();
  return ((r.data ?? []) as Row[]).filter((x) => !FOREIGN_TEMP.some((p) => String(x.name).startsWith(p)));
}

async function sharedRead(): Promise<Shared> {
  const a = await signIn("teacher");
  const b = await signIn("schoolB");
  return { a: await rowsOf(a.client, a.schoolId, "학교 A"), b: await rowsOf(b.client, b.schoolId, "학교 B"), demo: await rowsOf(anonClient(), DEMO_SCHOOL_ID, "데모 학교") };
}

/** 공용 학교 A·B: 출처가 'auto' 인 시약의 값은 다른 스펙의 기록으로 움직인다 — 그 값만 빼고(출처는 남기고) 견준다 */
const stableShared = (s: Shared) => ({ a: s.a.map(withoutAutoDrift), b: s.b.map(withoutAutoDrift), demo: s.demo });

/** 거부되어야 할 호출의 대상이 될 공용 학교 시약: 직접 지정한('manual'·'basis') 기준 중 가장 큰 것 (다른 스펙이 움직이지 않는 값) */
function stableTarget(rows: Row[], what: string): Reagent {
  const list = rows.map(toReagent).filter((r) => r.min_stock_source !== "auto");
  expect(list.length, `전제: ${what} 에 직접 지정한 기준이 있는 시약`).toBeGreaterThan(0);
  return [...list].sort((x, y) => y.min_stock - x.min_stock || x.id.localeCompare(y.id))[0];
}

/** 비상 복원: 거부되어야 할 호출이 구현 결함으로 공용 시약의 기준을 바꿨을 때만 (정상이라면 호출 없음) */
async function restoreIfChanged(before: Reagent): Promise<void> {
  if (!HAS_SERVICE) return;
  const now = await readByService(before.id);
  if (!now || JSON.stringify(thresholdOf(now)) === JSON.stringify(thresholdOf(before))) return;
  await service().from("reagents").update(thresholdOf(before)).eq("id", before.id);
}

let sharedBefore: Shared | null = null;

test.beforeAll(async ({}, info) => {
  info.setTimeout(120_000);
  sharedBefore = await sharedRead();
});

test.afterAll(async ({}, info) => {
  info.setTimeout(420_000);
  // 정리가 먼저다 (아래 단언이 실패해도 일회용 계정·학교가 남지 않게)
  let left: Awaited<ReturnType<typeof sweep>> | null = null;
  const rest: Record<string, number> = {};
  if (HAS_SERVICE) {
    const sb = service();
    const schools = await sb.from("schools").select("id").like("neis_code", `S8UI-${GROUP}-${info.project.name}-%`);
    const ids = (schools.data ?? []).map((s) => s.id as string);
    if (ids.length) {
      await sb.from("usage_logs").delete().in("school_id", ids);
      await sb.from("reagents").delete().in("school_id", ids);
    }
    for (const table of ["reagents", "intake_logs", "usage_logs"]) {
      const r = ids.length ? await sb.from(table).select("id").in("school_id", ids) : { data: [] as unknown[] };
      rest[table] = (r.data ?? []).length;
    }
    left = await sweep(GROUP, info.project.name);
    fixtureCache = null;
  }
  if (left) {
    expect(rest, "일회용 학교의 시약·기록 잔여물").toEqual({ reagents: 0, intake_logs: 0, usage_logs: 0 });
    expect(left, "일회용 계정·학교·프로필 잔여물").toEqual(NO_RESIDUE);
  }
  if (sharedBefore) {
    const before = sharedBefore;
    let after = await sharedRead();
    for (let i = 0; i < 30 && JSON.stringify(stableShared(after)) !== JSON.stringify(stableShared(before)); i++) {
      await sleep(2_000);
      after = await sharedRead();
    }
    // 데모 학교는 자동 다시 계산에서 빠진다 (d7 §11-1 "데모 학교 제외" · §5) — seed 의 min_stock·출처·근거·알림 시각 전체 그대로
    expect(after.demo, "데모 학교 reagents (전체 열)").toEqual(before.demo);
    expect(stableShared(after).a, "학교 A reagents (출처 포함, 자동 기준 값 제외)").toEqual(stableShared(before).a);
    expect(stableShared(after).b, "학교 B reagents (출처 포함, 자동 기준 값 제외)").toEqual(stableShared(before).b);
  }
});

// ======================================================================
// 공용·데모 — 읽기와 "거부되어야 하는 호출"만
// ======================================================================

test(`[R-db][S3] 학교 A 학생: reset_reorder_threshold ${DENIED} — 자기 학교 시약의 기준·출처 그대로`, async () => {
  const st = await signIn("student");
  expect(st.profileRole, "전제: 학생 계정").toBe("student");
  const target = stableTarget(await rowsOf(st.client, st.schoolId, "학교 A"), "학교 A");
  expect((await readR(st.client, target.id)).id, "전제(양성 대조군): 학생도 자기 학교 시약은 읽는다").toBe(target.id);
  let res: Res;
  try {
    res = await resetCall(st.client, target.id);
  } finally {
    await restoreIfChanged(target);
  }
  expectRejected(res, "학생 reset_reorder_threshold(자기 학교 시약)", DENIED);
  expect(thresholdOf(await readR(st.client, target.id)), "학생 시도 뒤").toEqual(thresholdOf(target));
  // 없는 id 도 역할 거부가 먼저 (함수 안쪽을 알려 주지 않는다)
  expectRejected(await resetCall(st.client, randomUUID()), "학생 reset_reorder_threshold(없는 id)", DENIED);
});

test(`[R-db][S3] anon: reset_reorder_threshold 실행 불가(${DENIED}) — 학교 A·데모 시약 그대로`, async () => {
  const anon = anonClient();
  const t = await signIn("teacher");
  const target = stableTarget(await rowsOf(t.client, t.schoolId, "학교 A"), "학교 A");
  const demo = (await rowsOf(anon, DEMO_SCHOOL_ID, "데모 학교")).map(toReagent);
  expect(demo.length, "전제: 데모 학교 시약").toBeGreaterThan(0);
  let a: Res;
  let d: Res;
  try {
    a = await resetCall(anon, target.id);
    d = await resetCall(anon, demo[0].id);
  } finally {
    await restoreIfChanged(target);
  }
  expectRejected(a, "anon reset_reorder_threshold(학교 A 시약)", DENIED);
  expectRejected(d, "anon reset_reorder_threshold(데모 시약)", DENIED);
  expectRejected(await resetCall(anon, randomUUID()), "anon reset_reorder_threshold(없는 id)", DENIED);
  expect(thresholdOf(await readR(t.client, target.id))).toEqual(thresholdOf(target));
  expect(thresholdOf(await readR(anon, demo[0].id)), "데모 시약").toEqual(thresholdOf(demo[0]));
});

test(`[GM-db][S*] 데모 학교 시약 id 로 reset_reorder_threshold: 학교 A 학생·교사·admin, 학교 B 교사 모두 거부(교사·admin·학교 B 는 ${NOT_FOUND}, 학생 ${DENIED}) — 데모 시약 전체 열 그대로`, async () => {
  const anon = anonClient();
  const before = await rowsOf(anon, DEMO_SCHOOL_ID, "데모 학교");
  expect(before.length, "전제: 데모 학교 시약").toBeGreaterThan(0);
  const target = toReagent(before[0]);
  for (const [role, code] of [["student", DENIED], ["teacher", NOT_FOUND], ["admin", NOT_FOUND], ["schoolB", NOT_FOUND]] as [Role, string][]) {
    const s = await signIn(role);
    const res = await resetCall(s.client, target.id);
    expectRejected(res, `${ROLE_LABEL[role]} reset_reorder_threshold(데모 시약)`, code);
    if (code === NOT_FOUND) {
      const ghost = await resetCall(s.client, randomUUID());
      expect(shape(res), `${ROLE_LABEL[role]}: 데모 시약과 없는 id 의 응답이 같음 (존재 여부 비노출)`).toEqual(shape(ghost));
    }
  }
  expect(await rowsOf(anon, DEMO_SCHOOL_ID, "데모 학교"), "데모 학교 시약 (전체 열)").toEqual(before);
});

test(`[GM-db][S*] 데모 학교 seed: 출처 열이 세 값 중 하나·자동 근거는 auto 일 때만, 공용 학교 A·B 도 같은 규칙 (읽기만)`, async () => {
  const a = await signIn("teacher");
  const b = await signIn("schoolB");
  for (const [what, rows] of [
    ["데모 학교", await rowsOf(anonClient(), DEMO_SCHOOL_ID, "데모 학교")],
    ["학교 A", await rowsOf(a.client, a.schoolId, "학교 A")],
    ["학교 B", await rowsOf(b.client, b.schoolId, "학교 B")],
  ] as [string, Row[]][]) {
    expect(rows.length, `전제: ${what} 시약`).toBeGreaterThan(0);
    for (const x of rows.map(toReagent)) {
      expect(["auto", "basis", "manual"], `${what} "${x.name}" min_stock_source`).toContain(x.min_stock_source);
      if (x.min_stock_source !== "auto") expect(x.min_stock_auto_basis, `${what} "${x.name}" 자동이 아니면 자동 근거 null`).toBeNull();
      else expect([null, "usage", "intake"], `${what} "${x.name}" 자동 근거`).toContain(x.min_stock_auto_basis);
      if (x.min_stock_source === "basis") expect([x.reorder_per_group, x.reorder_groups].every((v) => v !== null), `${what} "${x.name}" basis 면 근거 열 있음`).toBe(true);
    }
  }
});

// ======================================================================
// 일회용 학교 (service role 로 준비·정리). 키가 없으면 skip.
// ======================================================================

test.describe("일회용 학교", () => {
  test.describe.configure({ mode: "default" });
  test.skip(!HAS_SERVICE, NO_SERVICE_REASON);

  // ---------- 자동 값: 입고 근거 ----------

  test(`[R-db][S7] 등록 직후 자동 기준 = 첫 입고량 × 20%('auto'·'intake'), record_intake 뒤 = 마지막 입고량 × 20%(합·재고가 아님), 소수 3자리 반올림, 기록 없는 직접 등록 시약은 0·근거 null`, async ({}, info) => {
    const f = await fresh(info);
    const r = await register(f.teacher, 10);
    expect(thresholdOf(r), "등록 직후 (교사)").toEqual(auto(autoFromIntake(10), "intake"));
    expect(r.low_stock_since).toBeNull();
    const ra = await register(f.admin, 1);
    expect(thresholdOf(ra), "등록 직후 (admin, 최솟값 1)").toEqual(auto(autoFromIntake(1), "intake"));

    // 입고: 마지막 입고량 기준 (지금 재고·입고 합이 아니다)
    await intake(f.teacher, r.id, 50);
    let now = await readR(f.teacher, r.id);
    expect(now.stock, "입고 뒤 재고").toBe(60);
    expect(thresholdOf(now), "입고 50 뒤").toEqual(auto(autoFromIntake(50), "intake"));
    await intake(f.admin, r.id, 5);
    now = await readR(f.teacher, r.id);
    expect(thresholdOf(now), "더 작은 입고 5 뒤 — 마지막 입고량 기준이라 내려간다").toEqual(auto(autoFromIntake(5), "intake"));

    // 소수 3자리 반올림: 1.234 × 20% = 0.2468 → 0.247
    await intake(f.teacher, r.id, 1.234);
    now = await readR(f.teacher, r.id);
    expect(now.min_stock, "1.234 × 20% (소수 3자리)").toBe(autoFromIntake(1.234));
    expect(now.min_stock, "대조: 반올림 값").toBe(0.247);

    // 입고 기록이 없는 시약(교사의 직접 insert, min_stock 0) → 자동, 값 0, 근거 null — 0 이면 알림 없음
    const ins = await f.teacher.from("reagents").insert({ school_id: f.school.id, name: `RA-직접-${tag()}`, unit: "g", stock: 0, min_stock: 0 }).select(COLS);
    expect(ins.error, `교사 직접 insert: ${ins.error?.message}`).toBeNull();
    const bare = toReagent(((ins.data ?? []) as Row[])[0]);
    expect(thresholdOf(bare), "기록 없음").toEqual(auto(0, null));
    expect(bare.low_stock_since, "기준 0 = 알림 없음 (재고 0 이어도)").toBeNull();
  });

  // ---------- 자동 값: 사용량 근거 ----------

  test(`[R-db][S6] 사용 기록이 생기면 자동 기준 = 최근 28일 사용량 합 ÷ 2('usage') — 교사·학생 record_usage 모두, 입고보다 우선, 소수 3자리 반올림(0.0005 → 0.001)`, async ({}, info) => {
    const f = await fresh(info);
    const r = await register(f.teacher, 100);
    await use(f.teacher, r.id, 6);
    let now = await readR(f.teacher, r.id);
    expect(thresholdOf(now), "교사 사용 6 뒤").toEqual(auto(autoFromUsage([6]), "usage"));
    expect(now.min_stock, "대조: 6 ÷ 2").toBe(3);

    // 학생의 사용 기록도 다시 계산한다 (트리거 — 학생이 기준을 직접 쓰는 것은 아니다)
    await use(f.student, r.id, 4);
    now = await readR(f.student, r.id);
    expect(thresholdOf(now), "학생 사용 4 뒤").toEqual(auto(autoFromUsage([6, 4]), "usage"));

    // 사용 기록이 있으면 입고가 들어와도 사용량 근거 그대로
    await intake(f.admin, r.id, 500);
    now = await readR(f.teacher, r.id);
    expect(thresholdOf(now), "입고 500 뒤에도 사용량 근거").toEqual(auto(autoFromUsage([6, 4]), "usage"));
    expect(now.stock, "재고 = 100 - 6 - 4 + 500").toBe(590);

    // 반올림: 0.001 ÷ 2 = 0.0005 → 0.001
    const tiny = await register(f.teacher, 1);
    await use(f.teacher, tiny.id, 0.001);
    expect(thresholdOf(await readR(f.teacher, tiny.id)), "0.001 사용 뒤").toEqual(auto(autoFromUsage([0.001]), "usage"));
    expect((await readR(f.teacher, tiny.id)).min_stock, "대조: 0.0005 → 0.001").toBe(0.001);
  });

  test(`[R-db][S6] 28일 창: 창 밖(29일 전) 사용 기록은 빼고 창 안(27일 전)은 더한다 — 창 밖 기록만 있으면 입고 근거`, async ({}, info) => {
    const f = await fresh(info);
    expect(AUTO_WINDOW_DAYS, "d7 §11-1 의 기간").toBeGreaterThan(2);
    const outside = AUTO_WINDOW_DAYS + 1;
    const inside = AUTO_WINDOW_DAYS - 1;

    // 창 밖 기록만 → 다음 입고 때 입고 근거로 계산
    const a = await register(f.teacher, 100);
    await pastUsage(f, a.id, 80, outside);
    await intake(f.teacher, a.id, 30);
    expect(thresholdOf(await readR(f.teacher, a.id)), `${outside}일 전 기록만 있을 때 (입고 30 뒤)`).toEqual(auto(autoFromIntake(30), "intake"));

    // 창 밖 + 창 안 + 지금 → 창 안·지금만 더한다
    const b = await register(f.teacher, 100);
    await pastUsage(f, b.id, 80, outside);
    await pastUsage(f, b.id, 7, inside);
    await use(f.teacher, b.id, 3);
    const now = await readR(f.teacher, b.id);
    expect(thresholdOf(now), `${outside}일 전 80 은 빼고 ${inside}일 전 7 + 지금 3`).toEqual(auto(autoFromUsage([7, 3]), "usage"));
    expect(now.min_stock, "대조: 창 밖까지 더한 값이 아니다").not.toBe(autoFromUsage([80, 7, 3]));

    // reset 도 같은 창으로 계산한다
    expectOk(await setCall(f.teacher, b.id, 999), "준비: set_reorder_threshold 999");
    expectReset(await resetCall(f.admin, b.id), "reset_reorder_threshold", { reagent_id: b.id, min_stock: autoFromUsage([7, 3]), previous_min_stock: 999 });
  });

  // ---------- manual·basis 는 다시 계산하지 않는다 ----------

  test(`[R-db][S6] 'manual'(set_reorder_threshold)·'basis'(save_reorder_basis) 기준은 사용·입고 뒤에도 그대로 — 자동 기준만 다시 계산`, async ({}, info) => {
    const f = await fresh(info);
    const man = await register(f.teacher, 100);
    const bas = await register(f.teacher, 100);
    const aut = await register(f.teacher, 100);
    expectOk(await setCall(f.teacher, man.id, 7), "set_reorder_threshold 7");
    expectOk(await saveCall(f.admin, [{ reagent_id: bas.id, per_group: 2, groups: 6 }]), "save_reorder_basis 2 × 6");
    const manBase = thresholdOf(await readR(f.teacher, man.id));
    const basBase = thresholdOf(await readR(f.teacher, bas.id));
    expect(manBase, "manual 7").toEqual({ min_stock: 7, reorder_per_group: null, reorder_groups: null, min_stock_source: "manual", min_stock_auto_basis: null });
    expect(basBase, "basis 12").toEqual({ min_stock: 12, reorder_per_group: 2, reorder_groups: 6, min_stock_source: "basis", min_stock_auto_basis: null });

    for (const id of [man.id, bas.id, aut.id]) {
      await use(f.teacher, id, 40);
      await use(f.student, id, 10);
      await intake(f.admin, id, 3);
    }
    expect(thresholdOf(await readR(f.teacher, man.id)), "manual: 사용·입고 뒤 그대로").toEqual(manBase);
    expect(thresholdOf(await readR(f.teacher, bas.id)), "basis: 사용·입고 뒤 그대로").toEqual(basBase);
    expect(thresholdOf(await readR(f.teacher, aut.id)), "대조: auto 는 다시 계산").toEqual(auto(autoFromUsage([40, 10]), "usage"));
  });

  // ---------- set_reorder_threshold → manual ----------

  test(`[R-db][S3] set_reorder_threshold: 자동 기준을 덮어쓰고 'manual'(자동 근거 null), previous_min_stock = 지금 자동 값, 0 도 'manual'(다시 자동이 되지 않음)`, async ({}, info) => {
    const f = await fresh(info);
    const r = await register(f.teacher, 100);
    await use(f.teacher, r.id, 10);
    const autoValue = autoFromUsage([10]);
    expect(thresholdOf(await readR(f.teacher, r.id)), "전제: 사용량 자동 기준").toEqual(auto(autoValue, "usage"));

    const res = await setCall(f.admin, r.id, 2);
    expectOk(res, "admin set_reorder_threshold 2");
    const out = res.data as Row;
    expect({ ...out, min_stock: Number(out.min_stock), previous_min_stock: Number(out.previous_min_stock) }).toEqual({ reagent_id: r.id, min_stock: 2, previous_min_stock: autoValue });
    expect(thresholdOf(await readR(f.teacher, r.id))).toEqual({ min_stock: 2, reorder_per_group: null, reorder_groups: null, min_stock_source: "manual", min_stock_auto_basis: null });

    expectOk(await setCall(f.teacher, r.id, 0), "교사 set_reorder_threshold 0");
    await use(f.teacher, r.id, 10);
    expect(thresholdOf(await readR(f.teacher, r.id)), "직접 0 은 'manual' — 사용 기록이 생겨도 그대로").toEqual({
      min_stock: 0,
      reorder_per_group: null,
      reorder_groups: null,
      min_stock_source: "manual",
      min_stock_auto_basis: null,
    });
  });

  // ---------- reset_reorder_threshold ("자동으로 돌리기") ----------

  test(`[R-db][S3] reset_reorder_threshold 교사·admin: 'manual'·'basis' → 'auto' + 지금 자동 값(사용량/입고/0) · 근거 열 null · 반환 {reagent_id, min_stock, previous_min_stock} · 그 뒤 사용 기록으로 다시 계산 · 다른 시약 그대로`, async ({}, info) => {
    const f = await fresh(info);
    // manual → auto(usage)
    const m = await register(f.teacher, 100);
    await use(f.teacher, m.id, 8);
    expectOk(await setCall(f.teacher, m.id, 50), "준비: manual 50");
    // basis → auto(intake: 사용 기록 없음)
    const b = await register(f.teacher, 40);
    expectOk(await saveCall(f.teacher, [{ reagent_id: b.id, per_group: 3, groups: 6 }]), "준비: basis 18");
    // 기록 없음 → auto(0, null)
    const ins = await f.teacher.from("reagents").insert({ school_id: f.school.id, name: `RA-직접-${tag()}`, unit: "g", stock: 5, min_stock: 9 }).select(COLS);
    expect(ins.error, `준비: 직접 insert(min_stock 9): ${ins.error?.message}`).toBeNull();
    const none = toReagent(((ins.data ?? []) as Row[])[0]);
    expect(none.min_stock_source, "직접 insert 의 min_stock > 0 → 'manual'").toBe("manual");
    const bystander = await register(f.teacher, 20);
    expectOk(await setCall(f.teacher, bystander.id, 3), "준비: 다른 시약 manual 3");
    const bystanderBefore = await readR(f.teacher, bystander.id);

    expectReset(await resetCall(f.teacher, m.id), "교사 reset(manual)", { reagent_id: m.id, min_stock: autoFromUsage([8]), previous_min_stock: 50 });
    expect(thresholdOf(await readR(f.teacher, m.id)), "manual → auto(usage)").toEqual(auto(autoFromUsage([8]), "usage"));

    expectReset(await resetCall(f.admin, b.id), "admin reset(basis)", { reagent_id: b.id, min_stock: autoFromIntake(40), previous_min_stock: 18 });
    expect(thresholdOf(await readR(f.teacher, b.id)), "basis → auto(intake) · 근거 열 null").toEqual(auto(autoFromIntake(40), "intake"));

    expectReset(await resetCall(f.teacher, none.id), "교사 reset(기록 없음)", { reagent_id: none.id, min_stock: 0, previous_min_stock: 9 });
    expect(thresholdOf(await readR(f.teacher, none.id)), "기록 없음 → auto 0 · 근거 null").toEqual(auto(0, null));

    // 이미 auto 인 시약도 다시 계산된 같은 값 (반환 previous = 지금 값)
    expectReset(await resetCall(f.teacher, m.id), "교사 reset(이미 auto)", { reagent_id: m.id, min_stock: autoFromUsage([8]), previous_min_stock: autoFromUsage([8]) });

    // 돌린 뒤에는 사용·입고로 다시 계산된다
    await use(f.student, m.id, 12);
    expect(thresholdOf(await readR(f.teacher, m.id)), "reset 뒤 사용 12").toEqual(auto(autoFromUsage([8, 12]), "usage"));
    await intake(f.teacher, b.id, 25);
    expect(thresholdOf(await readR(f.teacher, b.id)), "reset 뒤 입고 25").toEqual(auto(autoFromIntake(25), "intake"));

    expect(await readR(f.teacher, bystander.id), "다른 시약 그대로").toEqual(bystanderBefore);
    // 학생에게도 같은 값으로 읽힌다 (같은 학교)
    expect(thresholdOf(await readR(f.student, m.id))).toEqual(auto(autoFromUsage([8, 12]), "usage"));
  });

  test(`[R-db][S3] reset_reorder_threshold 거부: 일회용 학생 ${DENIED}·anon ${DENIED}·없는 id ${NOT_FOUND} — 값·출처 그대로`, async ({}, info) => {
    const f = await fresh(info);
    const r = await register(f.teacher, 100);
    expectOk(await setCall(f.teacher, r.id, 77), "준비: manual 77");
    const before = await readR(f.teacher, r.id);

    expectRejected(await resetCall(f.student, r.id), "일회용 학생 reset", DENIED);
    expectRejected(await resetCall(anonClient(), r.id), "anon reset", DENIED);
    expectRejected(await resetCall(f.teacher, randomUUID()), "교사 reset(없는 id)", NOT_FOUND);
    expectRejected(await resetCall(f.admin, randomUUID()), "admin reset(없는 id)", NOT_FOUND);
    expect(await readR(f.teacher, r.id), "거부 뒤 그대로").toEqual(before);
    // 공용 학교 A 학생도 (다른 학교 시약이어도) 역할 거부
    expectRejected(await resetCall((await signIn("student")).client, r.id), "학교 A 학생 reset(일회용 학교 시약)", DENIED);
    expect(await readR(f.teacher, r.id), "공용 학생 시도 뒤 그대로").toEqual(before);
  });

  // ---------- 학교 분리 ----------

  test(`[N1-db][S3] reset_reorder_threshold 교차 학교: A'↔B'·일회용↔공용 학교 A·B 시약 id 는 ${NOT_FOUND}(없는 id 와 같은 응답)·값 그대로`, async ({}, info) => {
    const f = await fresh(info);
    const mineA = await register(f.teacher, 100);
    const mineB = await register(f.otherTeacher, 100);
    expectOk(await setCall(f.teacher, mineA.id, 55), "준비: A' manual 55");
    expectOk(await setCall(f.otherTeacher, mineB.id, 66), "준비: B' manual 66");
    const stA = await readR(f.admin, mineA.id);
    const stB = await readR(f.otherAdmin, mineB.id);

    for (const [who, c, foreign] of [
      ["A' 교사", f.teacher, mineB],
      ["A' admin", f.admin, mineB],
      ["B' 교사", f.otherTeacher, mineA],
      ["B' admin", f.otherAdmin, mineA],
    ] as [string, SupabaseClient, Reagent][]) {
      const seen = await c.from("reagents").select("id").eq("id", foreign.id);
      expect(seen.error ? [] : seen.data ?? [], `전제: ${who} 에게 다른 학교 시약은 0행`).toHaveLength(0);
      const cross = await resetCall(c, foreign.id);
      expectRejected(cross, `${who} reset(다른 학교 시약)`, NOT_FOUND);
      const ghost = await resetCall(c, randomUUID());
      expect(shape(cross), `${who}: 다른 학교 시약과 없는 id 의 응답이 같음`).toEqual(shape(ghost));
      expect(JSON.stringify(cross.error), `${who}: 오류에 다른 학교 시약 이름·id 없음`).not.toContain(foreign.name);
      expect(JSON.stringify(cross.error)).not.toContain(foreign.id);
    }
    expect(await readR(f.admin, mineA.id), "A' 시약 그대로").toEqual(stA);
    expect(await readR(f.otherAdmin, mineB.id), "B' 시약 그대로").toEqual(stB);

    // 공용 학교 A·B 교사·admin → 일회용 학교 시약
    for (const role of ["teacher", "admin", "schoolB"] as Role[]) {
      const s = await signIn(role);
      const cross = await resetCall(s.client, mineA.id);
      expectRejected(cross, `${ROLE_LABEL[role]} reset(일회용 학교 시약)`, NOT_FOUND);
      expect(shape(cross), `${ROLE_LABEL[role]}: 없는 id 와 같은 응답`).toEqual(shape(await resetCall(s.client, randomUUID())));
    }
    expect(await readR(f.admin, mineA.id), "공용 계정 시도 뒤 A' 시약 그대로").toEqual(stA);

    // 일회용 교사·admin → 공용 학교 A·B 시약 (직접 지정한 기준의 시약 — 통과했다면 비상 복원)
    const t = await signIn("teacher");
    const b = await signIn("schoolB");
    for (const [school, reader, schoolId] of [["학교 A", t.client, t.schoolId], ["학교 B", b.client, b.schoolId]] as [string, SupabaseClient, string][]) {
      const target = stableTarget(await rowsOf(reader, schoolId, school), school);
      for (const [who, c] of [["일회용 교사", f.teacher], ["일회용 admin", f.admin]] as [string, SupabaseClient][]) {
        let res: Res;
        try {
          res = await resetCall(c, target.id);
        } finally {
          await restoreIfChanged(target);
        }
        expectRejected(res, `${who} reset(${school} 시약)`, NOT_FOUND);
        expect(thresholdOf(await readR(reader, target.id)), `${who} 시도 뒤 ${school} 시약`).toEqual(thresholdOf(target));
      }
    }
  });

  test(`[N1-db][S6] 다른 학교의 사용·입고 기록은 내 시약의 자동 기준에 닿지 않는다 (B' 의 기록 뒤 A' 시약 그대로)`, async ({}, info) => {
    const f = await fresh(info);
    const mine = await register(f.teacher, 100);
    const theirs = await register(f.otherTeacher, 100);
    const before = await readR(f.teacher, mine.id);
    await use(f.otherTeacher, theirs.id, 90);
    await intake(f.otherAdmin, theirs.id, 1);
    expect(thresholdOf(await readR(f.otherTeacher, theirs.id)), "대조: B' 시약은 다시 계산됨").toEqual(auto(autoFromUsage([90]), "usage"));
    expect(await readR(f.teacher, mine.id), "A' 시약 그대로").toEqual(before);
    // 다른 학교 시약에 기록 시도 자체도 거부
    expect((await f.otherTeacher.rpc("record_usage", { reagent_id: mine.id, amount: 1 })).error, "B' 교사 record_usage(A' 시약) 오류").not.toBeNull();
    expect(await readR(f.teacher, mine.id), "A' 시약 그대로 (교차 기록 시도 뒤)").toEqual(before);
  });

  // ---------- 직접 update·insert 가드 ----------

  test(`[R-db][S3] 직접 update 가드: min_stock_source·min_stock_auto_basis 직접 변경 ${DENIED}("${SOURCE_GUARD_MESSAGE}")·다른 열과 섞어도 전체 거부 · min_stock 직접 변경 → 'manual' · 근거 열 직접 변경 → 'basis' · stock 만 바꾸면 출처 그대로 · 학생 0행`, async ({}, info) => {
    const f = await fresh(info);
    const r = await register(f.teacher, 100);
    await use(f.teacher, r.id, 10);
    const base = await readR(f.teacher, r.id);
    expect(thresholdOf(base), "전제: auto(usage)").toEqual(auto(autoFromUsage([10]), "usage"));

    const bad: [string, Row][] = [
      ["source → manual", { min_stock_source: "manual" }],
      ["source → basis", { min_stock_source: "basis" }],
      ["auto_basis → intake", { min_stock_auto_basis: "intake" }],
      ["auto_basis → null", { min_stock_auto_basis: null }],
      ["source + min_stock", { min_stock_source: "manual", min_stock: 3 }],
      ["source + stock", { min_stock_source: "basis", stock: 1 }],
    ];
    for (const [who, c] of [["교사", f.teacher], ["admin", f.admin]] as [string, SupabaseClient][]) {
      for (const [what, patch] of bad) {
        const res = await update(c, r.id, patch);
        expectRejected(res, `${who} 직접 update(${what})`, DENIED);
        expect(res.error?.message, `${who} ${what} 오류 문구`).toBe(SOURCE_GUARD_MESSAGE);
      }
      expect(await readR(f.teacher, r.id), `${who} 거부 뒤 그대로`).toEqual(base);
    }

    // 학생: 0행(또는 오류)·그대로
    for (const patch of [{ min_stock_source: "manual" }, { min_stock: 1 }, { reorder_per_group: 1, reorder_groups: 1 }] as Row[]) {
      expect(changed(await update(f.student, r.id, patch)), `학생 직접 update(${JSON.stringify(patch)})`).toBe(0);
    }
    expect(await readR(f.teacher, r.id), "학생 시도 뒤 그대로").toEqual(base);

    // stock 만 바꾸면 출처·값 그대로 (자동 기준은 사용·입고·등록 때만 다시 계산)
    let now = await patchOk(f.teacher, r.id, { stock: 1 }, "교사 stock 직접 update");
    expect(thresholdOf(now), "stock 만 바꾼 뒤").toEqual(thresholdOf(base));

    // min_stock 직접 → manual
    now = await patchOk(f.admin, r.id, { min_stock: 4 }, "admin min_stock 직접 update");
    expect(thresholdOf(now), "min_stock 직접 → 'manual'").toEqual({ min_stock: 4, reorder_per_group: null, reorder_groups: null, min_stock_source: "manual", min_stock_auto_basis: null });
    await use(f.teacher, r.id, 1);
    expect((await readR(f.teacher, r.id)).min_stock, "manual 이 된 뒤 사용 기록에도 그대로").toBe(4);

    // 근거 열 직접 → basis
    now = await patchOk(f.teacher, r.id, { reorder_per_group: 2, reorder_groups: 3 }, "교사 근거 열 직접 update");
    expect(thresholdOf(now), "근거 열 직접 → 'basis'").toEqual({ min_stock: 4, reorder_per_group: 2, reorder_groups: 3, min_stock_source: "basis", min_stock_auto_basis: null });
    // 근거 열을 비우면 → manual
    now = await patchOk(f.teacher, r.id, { reorder_per_group: null, reorder_groups: null }, "교사 근거 열 비우기");
    expect(now.min_stock_source, "근거 열을 비우면 'manual'").toBe("manual");

    // 자동으로 돌린 뒤에도 출처 직접 변경은 여전히 거부
    expectReset(await resetCall(f.teacher, r.id), "reset", { reagent_id: r.id, min_stock: autoFromUsage([10, 1]), previous_min_stock: 4 });
    const afterReset = await readR(f.teacher, r.id);
    expectRejected(await update(f.admin, r.id, { min_stock_source: "manual" }), "reset 뒤 source 직접 변경", DENIED);
    expect(await readR(f.teacher, r.id)).toEqual(afterReset);
  });

  test(`[R-db][S3] 직접 insert: 출처는 넣은 값으로 정해진다(넘긴 min_stock_source·auto_basis 는 무시) — min_stock 0 → 'auto', > 0 → 'manual', 근거 열 → 'basis'`, async ({}, info) => {
    const f = await fresh(info);
    const cases: [string, Row, { min_stock: number; source: string }][] = [
      ["min_stock 0 + source 'basis' 넘김", { min_stock: 0, min_stock_source: "basis", min_stock_auto_basis: "usage" }, { min_stock: 0, source: "auto" }],
      ["min_stock 5 + source 'auto' 넘김", { min_stock: 5, min_stock_source: "auto", min_stock_auto_basis: "intake" }, { min_stock: 5, source: "manual" }],
      ["근거 열 + source 'manual' 넘김", { min_stock: 12, reorder_per_group: 2, reorder_groups: 6, min_stock_source: "manual" }, { min_stock: 12, source: "basis" }],
    ];
    for (const [what, extra, want] of cases) {
      const res = await f.teacher.from("reagents").insert({ school_id: f.school.id, name: `RA-직접-${tag()}`, unit: "g", stock: 50, ...extra }).select(COLS);
      expect(res.error, `${what}: ${res.error?.code} ${res.error?.message}`).toBeNull();
      const row = toReagent(((res.data ?? []) as Row[])[0]);
      expect([row.min_stock, row.min_stock_source, row.min_stock_auto_basis], what).toEqual([want.min_stock, want.source, null]);
    }
    // 학생 insert 는 거부 (대조)
    const st = await f.student.from("reagents").insert({ school_id: f.school.id, name: `RA-학생-${tag()}`, unit: "g", stock: 1, min_stock_source: "manual" }).select("id");
    expect(st.error, "학생 reagents insert 는 오류여야 함").not.toBeNull();
  });

  // ---------- save_reorder_basis 와 자동 (사용량 근거) ----------

  test(`[R-db][S5] save_reorder_basis: 사용량 근거 자동 기준(더 큼)도 필요량으로 항상 바꿈('changed'·'basis') → 그 뒤 사용 기록으로 다시 계산되지 않음 · reset 하면 다시 자동`, async ({}, info) => {
    const f = await fresh(info);
    const r = await register(f.teacher, 200);
    await use(f.teacher, r.id, 100);
    const autoValue = autoFromUsage([100]);
    expect(thresholdOf(await readR(f.teacher, r.id))).toEqual(auto(autoValue, "usage"));

    const res = await saveCall(f.teacher, [{ reagent_id: r.id, per_group: 1, groups: 6 }]);
    expectOk(res, "save_reorder_basis 1 × 6");
    expect((res.data as Row[]).map((x) => ({ ...x, required: Number(x.required), previous_min_stock: Number(x.previous_min_stock) }))).toEqual([
      { reagent_id: r.id, required: 6, previous_min_stock: autoValue, outcome: "changed" },
    ]);
    const saved = thresholdOf(await readR(f.teacher, r.id));
    expect(saved, "basis 6").toEqual({ min_stock: 6, reorder_per_group: 1, reorder_groups: 6, min_stock_source: "basis", min_stock_auto_basis: null });
    await use(f.student, r.id, 50);
    expect(thresholdOf(await readR(f.teacher, r.id)), "basis 는 사용 기록 뒤 그대로").toEqual(saved);

    expectReset(await resetCall(f.admin, r.id), "reset", { reagent_id: r.id, min_stock: autoFromUsage([100, 50]), previous_min_stock: 6 });
    expect(thresholdOf(await readR(f.teacher, r.id))).toEqual(auto(autoFromUsage([100, 50]), "usage"));
  });

  // ---------- low_stock_since ----------

  test(`[R-db][S6] low_stock_since 가 출처 전환을 따라간다: 직접 큰 기준(부족·그 시각) → reset 으로 작은 자동 값(부족 풀림·null) → 사용으로 자동 값이 재고를 넘음(새 시각)`, async ({}, info) => {
    const f = await fresh(info);
    const r = await register(f.teacher, 20);
    expectOk(await setCall(f.teacher, r.id, 500), "set_reorder_threshold 500");
    let now = await readR(f.teacher, r.id);
    const t1 = expectNearNow(now.low_stock_since, "manual 500 > 재고 20");

    expectReset(await resetCall(f.teacher, r.id), "reset", { reagent_id: r.id, min_stock: autoFromIntake(20), previous_min_stock: 500 });
    now = await readR(f.teacher, r.id);
    expect(now.low_stock_since, "자동 값(입고 20 × 20%) < 재고 → 부족 풀림").toBeNull();

    await sleep(1_200);
    await use(f.student, r.id, 15);
    now = await readR(f.teacher, r.id);
    expect(now, "사용 15 뒤: 재고 5 < 자동 값 7.5").toMatchObject({ stock: 5, min_stock: autoFromUsage([15]), min_stock_source: "auto" });
    const t2 = expectNearNow(now.low_stock_since, "자동 값이 재고를 넘음");
    expect(t2).toBeGreaterThan(t1);
  });
});
