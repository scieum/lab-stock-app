// [R-db][S9] · [N1-db][S9] · [R-db][S6] · [N1-db][S6] · [GM-db][S*]
// 재주문 알림(화면 6)·판매처 설정(화면 9) — DB 권한·제약·low_stock_since 전이.
// 실제 RLS·제약·트리거 (publishable/anon 키 + 각 계정 로그인)로 판정한다.
// 기준: harness/d7-data.md §1·§2·§5·§11·§12, harness/d5-gates.md R-db·N1-db·GM-db, design/rules.json roles R2·R3.
//
// 절대 규칙 (운영 DB):
// - 공용 테스트 계정 4개(학교 A 학생·교사·admin, 학교 B 교사)로는 읽기와 "거부되어야 하는 호출"만 한다.
//   거부 호출이 구현 결함으로 통과했을 때만 비상 정리(방금 만든 행을 id 로 삭제 / 지워진 공통 행을 스냅숏 그대로 복원)를 한다.
// - 성공하는 쓰기(판매처 생성·수정·삭제, 시약 stock·min_stock·기준 열 변경)는 일회용 학교의 일회용 계정으로만 한다.
//   일회용 학교·계정은 service role 로 만든다 (screen-8-helpers: createUser + register_profile, 세션은 generateLink → verifyOtp).
//   service role 은 준비·정리·대조 조회에만 쓰고, 판정 대상 호출은 항상 로그인 세션(publishable 키)으로 한다.
// - 공통 목록(school_id null) 행은 읽기만 한다. 데모 학교·실사용 학교에는 쓰지 않는다.
// - usage_logs: reagents FK 가 cascade 가 아니고 user_id FK 도 cascade 가 아니다 (사용 기록이 남으면 시약·계정 삭제가 막힌다).
//   record_usage 가 트리거를 거치는지 보려고 일회용 학교의 임시 시약에만 사용 기록을 만들고,
//   정리에서 service role 로 그 학교의 usage_logs 를 먼저 지운다 — 순서: usage_logs → 시약(intake_logs cascade) → 판매처 → 프로필 → 계정 → 학교.
//   끝에 잔여물 0 을 단언한다.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type TestInfo } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ROLE_LABEL, anonClient, signIn, type Role, type Session } from "./db-helpers";
import { autoFromIntake, autoFromUsage, withoutAutoDrift } from "./reorder-auto-helpers";
import { tempSchoolLike,
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

import { COMMON_SEED as D7_COMMON_SEED } from "./screen-6-9-helpers";

test.describe.configure({ mode: "default" });

// ---------- 규칙 (d7 §12 · §11) ----------

/** d7 §12 "테이블": name 1~40자, contact 40자, website http(s):// 300자, note 60자 */
const NAME_MAX = 40;
const CONTACT_MAX = 40;
const WEBSITE_MAX = 300;
const NOTE_MAX = 60;

/** 공통 목록 seed = d7 §12 처음 seed + §12-1 추가 seed ("공통 목록은 모두 N곳" 과 같은 수 — screen-6-9-helpers 가 문서에서 읽는다) */
const COMMON_SEED: { name: string; website: string }[] = [...D7_COMMON_SEED].sort((a, b) => a.name.localeCompare(b.name));

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

const GROUP = "s69db";
const SUCCESS_TIMEOUT = 420_000;
const NO_SERVICE_REASON =
  "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)";

/** Postgres 오류 코드 */
const RLS_DENIED = "42501";
const CHECK_VIOLATION = "23514";
const UNIQUE_VIOLATION = "23505";

type Row = Record<string, unknown>;
type DbError = { code?: string; message: string; details?: string | null };
type Res = { data: unknown; error: DbError | null };
type Actor = Role | "anon";

const labelOf = (who: Actor) => (who === "anon" ? "anon" : ROLE_LABEL[who]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const chars = (n: number, ch = "가") => ch.repeat(n);
const tag = () => randomUUID().slice(0, 8);

async function clientOf(who: Actor): Promise<{ client: SupabaseClient; session: Session | null }> {
  if (who === "anon") return { client: anonClient(), session: null };
  const session = await signIn(who);
  return { client: session.client, session };
}

function rowsOf(data: unknown): Row[] {
  if (Array.isArray(data)) return data as Row[];
  return data ? [data as Row] : [];
}

/** 바뀐(또는 돌려받은) 행 수: RLS 로 안 보이면 error 없이 0행, 권한이 없으면 오류 — 어느 쪽이든 0 이어야 한다 */
function changed(res: Res): number {
  return res.error ? 0 : rowsOf(res.data).length;
}

/** DB 가 오류로 거부했는지: 오류가 있고, PostgREST 의 "열·테이블 못 찾음"(PGRST…)이 아니며, 돌려준 행이 없다 */
function expectError(res: Res, what: string, code?: string): void {
  expect(res.error, `${what} 는 오류여야 함`).not.toBeNull();
  expect(String(res.error?.code ?? ""), `${what}: ${res.error?.message}`).not.toMatch(/^PGRST/);
  expect(rowsOf(res.data), `${what} 반환 행`).toHaveLength(0);
  if (code) expect(res.error?.code, `${what} errcode (${res.error?.message})`).toBe(code);
}

function expectOne(res: Res, what: string): Row {
  expect(res.error, `${what}: ${res.error?.code} ${res.error?.message} ${res.error?.details ?? ""}`).toBeNull();
  const rows = rowsOf(res.data);
  expect(rows, `${what} 반환 행`).toHaveLength(1);
  return rows[0];
}

// ---------- vendors 호출 ----------

const vInsert = async (c: SupabaseClient, row: Row): Promise<Res> => c.from("vendors").insert(row).select("*");
const vUpdate = async (c: SupabaseClient, id: string, patch: Row): Promise<Res> =>
  c.from("vendors").update(patch).eq("id", id).select("*");
const vDelete = async (c: SupabaseClient, id: string): Promise<Res> => c.from("vendors").delete().eq("id", id).select("*");

/** 이 계정에게 보이는 vendors 전체 (오류 = 0행으로 센다 — 권한 없음도 "못 읽음") */
async function visibleVendors(c: SupabaseClient): Promise<Row[]> {
  const r = await c.from("vendors").select("*").order("id");
  return r.error ? [] : ((r.data ?? []) as Row[]);
}

const commonOf = (rows: Row[]) => rows.filter((v) => v.school_id === null);
const nameSite = (rows: Row[]) =>
  rows.map((v) => ({ name: v.name as string, website: v.website as string })).sort((a, b) => a.name.localeCompare(b.name));

/** 공통 목록 스냅숏 (전체 열). 읽기만 — 학교 A admin 세션(RLS 로 공통 행이 보인다) */
async function commonSnapshot(): Promise<Row[]> {
  const admin = await signIn("admin");
  const r = await admin.client.from("vendors").select("*").is("school_id", null).order("id");
  expect(r.error, `공통 목록 조회: ${r.error?.message}`).toBeNull();
  return (r.data ?? []) as Row[];
}

/** 비상 정리: 거부되어야 할 insert 가 구현 결함으로 성공했을 때만, 방금 만든 행을 id 로 지운다 (정상이라면 호출 없음) */
async function dropLeaked(res: Res): Promise<void> {
  if (res.error) return;
  const ids = rowsOf(res.data).map((r) => r.id as string).filter(Boolean);
  if (!ids.length) return;
  if (HAS_SERVICE) await service().from("vendors").delete().in("id", ids);
  else await (await signIn("admin")).client.from("vendors").delete().in("id", ids);
}

/** 비상 복원: 공통 행이 구현 결함으로 바뀌거나 지워졌을 때만, 스냅숏 그대로 되돌린다 (정상이라면 호출 없음) */
async function restoreCommon(before: Row[]): Promise<void> {
  if (!HAS_SERVICE) return;
  const now = await service().from("vendors").select("*").is("school_id", null).order("id");
  if (JSON.stringify(now.data ?? []) === JSON.stringify(before)) return;
  await service().from("vendors").upsert(before, { onConflict: "id" });
}

/** 거부되어야 하는 insert: 오류(RLS 42501) + 그 이름의 행이 생기지 않음 */
async function expectInsertDenied(c: SupabaseClient, who: string, row: Row): Promise<void> {
  const res = await vInsert(c, row);
  await dropLeaked(res);
  expectError(res, `${who} vendors insert(school_id = ${String(row.school_id)})`, RLS_DENIED);
  if (HAS_SERVICE) {
    const left = await service().from("vendors").select("id").eq("name", row.name as string);
    expect(left.data ?? [], `${who} insert 뒤 그 이름의 행`).toHaveLength(0);
  }
}

/**
 * 공통 행에 대한 update·delete 가 0행이고 값이 그대로인지. 덜 위험한 호출 먼저(지금 값 그대로 update → 값 바꾸는 update → delete) —
 * 앞 단언이 실패하면 뒤 호출은 하지 않는다.
 */
async function expectCommonUntouchable(c: SupabaseClient, who: string, before: Row[]): Promise<void> {
  expect(before.length, "전제: 공통 목록 행").toBeGreaterThan(0);
  const target = before[0];
  const id = target.id as string;
  try {
    const same = await vUpdate(c, id, { name: target.name });
    expect(changed(same), `${who} 공통 행 update(지금 이름 그대로)`).toBe(0);
    const patch = await vUpdate(c, id, { note: "S69-침범", contact: "S69-침범", website: "https://s69.invalid" });
    expect(changed(patch), `${who} 공통 행 update`).toBe(0);
    const own = await vUpdate(c, id, { school_id: null, name: "S69-침범" });
    expect(changed(own), `${who} 공통 행 update(이름)`).toBe(0);
    expect(await commonSnapshot(), `${who} update 뒤 공통 목록`).toEqual(before);
    const del = await vDelete(c, id);
    expect(changed(del), `${who} 공통 행 delete`).toBe(0);
    expect(await commonSnapshot(), `${who} delete 뒤 공통 목록`).toEqual(before);
  } finally {
    await restoreCommon(before);
  }
}

// ---------- 공용·데모 학교 스냅숏 (읽기만) ----------

/** 다른 스펙이 학교 A·B 에 잠깐 만드는 임시 시약 이름 접두사 (db-helpers pickReagent 가 건너뛰는 것과 같은 목록) */
const FOREIGN_TEMP = ["R-db-", "N1-db-", "S7-ui-"];
const isForeignTemp = (r: Row) => FOREIGN_TEMP.some((p) => String(r.name).startsWith(p));

type Shared = { reagentsA: Row[]; reagentsB: Row[]; reagentsDemo: Row[]; vendors: Row[] };

async function reagentsSeen(c: SupabaseClient, schoolId: string, what: string): Promise<Row[]> {
  const r = await c.from("reagents").select("*").eq("school_id", schoolId).order("id");
  expect(r.error, `${what} reagents 조회: ${r.error?.message}`).toBeNull();
  return ((r.data ?? []) as Row[]).filter((x) => !isForeignTemp(x));
}

/**
 * 학교 A·B·데모의 reagents 전체 열(다른 스펙의 임시 시약 제외) + vendors 전체(공통 + 학교 A·B·데모).
 * vendors 는 service role 대조 조회(있으면) — 없으면 학교 A admin·학교 B 교사에게 보이는 행.
 */
async function sharedRead(): Promise<Shared> {
  const a = await signIn("teacher");
  const b = await signIn("schoolB");
  let vendors: Row[];
  if (HAS_SERVICE) {
    const v = await service()
      .from("vendors")
      .select("*")
      .or(`school_id.is.null,school_id.in.(${[a.schoolId, b.schoolId, DEMO_SCHOOL_ID].join(",")})`)
      .order("id");
    expect(v.error, `vendors 대조 조회: ${v.error?.message}`).toBeNull();
    vendors = (v.data ?? []) as Row[];
  } else {
    const seen = [...(await visibleVendors((await signIn("admin")).client)), ...(await visibleVendors(b.client))];
    vendors = [...new Map(seen.map((v) => [v.id as string, v])).values()].sort((x, y) => String(x.id).localeCompare(String(y.id)));
  }
  return {
    reagentsA: await reagentsSeen(a.client, a.schoolId, "학교 A"),
    reagentsB: await reagentsSeen(b.client, b.schoolId, "학교 B"),
    reagentsDemo: await reagentsSeen(anonClient(), DEMO_SCHOOL_ID, "데모 학교"),
    vendors,
  };
}

/** 다른 스펙이 병렬로 학교 A·B 시약 stock 을 잠깐 바꿨다 되돌린다 — 연속 두 번 같은 값이 읽힐 때까지 기다린 "가만히 있는" 상태 */
async function sharedAtRest(): Promise<Shared> {
  let prev = await sharedRead();
  for (let i = 0; i < 20; i++) {
    await sleep(2_000);
    const next = await sharedRead();
    if (JSON.stringify(next) === JSON.stringify(prev)) return next;
    prev = next;
  }
  return prev;
}

// ---------- 일회용 학교 ----------

interface Fixture {
  school: TempSchool;
  other: TempSchool;
  teacherUser: TempUser;
  studentUser: TempUser;
  otherTeacherUser: TempUser;
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
      studentUser,
      otherTeacherUser,
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

/** 일회용 학교의 사용 기록·시약(intake_logs cascade)·판매처를 비운다 (service role — 준비·정리) */
async function purge(schoolIds: string[]): Promise<void> {
  if (!schoolIds.length) return;
  const sb = service();
  const u = await sb.from("usage_logs").delete().in("school_id", schoolIds);
  expect(u.error, `일회용 학교 사용 기록 정리: ${u.error?.message}`).toBeNull();
  const r = await sb.from("reagents").delete().in("school_id", schoolIds);
  expect(r.error, `일회용 학교 시약 정리: ${r.error?.message}`).toBeNull();
  const v = await sb.from("vendors").delete().in("school_id", schoolIds);
  expect(v.error, `일회용 학교 판매처 정리: ${v.error?.message}`).toBeNull();
}

async function fresh(info: TestInfo): Promise<Fixture> {
  test.setTimeout(SUCCESS_TIMEOUT);
  const f = await fixture(info);
  await purge([f.school.id, f.other.id]);
  return f;
}

/** 대조 조회 (service role): 한 학교의 판매처 전체 열 */
async function vendorsOf(schoolId: string): Promise<Row[]> {
  const r = await service().from("vendors").select("*").eq("school_id", schoolId).order("created_at").order("id");
  expect(r.error, `vendors 대조 조회: ${r.error?.message}`).toBeNull();
  return (r.data ?? []) as Row[];
}

async function vendorById(id: string): Promise<Row | null> {
  const r = await service().from("vendors").select("*").eq("id", id).maybeSingle();
  expect(r.error, `vendors 대조 조회: ${r.error?.message}`).toBeNull();
  return (r.data as Row | null) ?? null;
}

/** 일회용 admin 의 판매처 등록 (성공해야 함) */
async function newVendor(admin: SupabaseClient, schoolId: string, patch: Row = {}): Promise<Row> {
  const row = { school_id: schoolId, name: `S69-판매처-${tag()}`, ...patch };
  return expectOne(await vInsert(admin, row), `admin vendors insert(${JSON.stringify(patch)})`);
}

// ---------- reagents 호출 (일회용 학교) ----------

const INTAKE_DATE = "2026-09-15";
const REAGENT_COLS =
  "id, school_id, name, unit, stock, min_stock, reorder_per_group, reorder_groups, low_stock_since, min_stock_source, min_stock_auto_basis";

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

/** 임시 시약: register_reagent (d7 §6 · §11-1 — 자동 기준 = 첫 입고량 × 20% 로 시작) */
async function newReagent(c: SupabaseClient, stock: number): Promise<Reagent> {
  const res = await c.rpc("register_reagent", {
    p_name: `S69-시약-${tag()}`,
    p_storage_class: storageClasses[0],
    p_stock: stock,
    p_unit: "g",
    p_intake_date: INTAKE_DATE,
    p_msds_url: null,
  });
  const row = expectOne(res, "register_reagent (준비)");
  return readReagent(c, row.id as string);
}

/** 로그인 세션(RLS)으로 읽은 시약 행 */
async function readReagent(c: SupabaseClient, id: string): Promise<Reagent> {
  const r = await c.from("reagents").select(REAGENT_COLS).eq("id", id);
  expect(r.error, `reagents 조회: ${r.error?.message}`).toBeNull();
  expect(r.data ?? [], "reagents 조회 행").toHaveLength(1);
  return toReagent((r.data ?? [])[0] as Row);
}

const rUpdate = async (c: SupabaseClient, id: string, patch: Row): Promise<Res> =>
  c.from("reagents").update(patch).eq("id", id).select(REAGENT_COLS);

/** 성공해야 하는 직접 update → 바뀐 뒤의 행 */
async function patchReagent(c: SupabaseClient, id: string, patch: Row, what: string): Promise<Reagent> {
  return toReagent(expectOne(await rUpdate(c, id, patch), what));
}

async function useReagent(c: SupabaseClient, id: string, amount: number): Promise<void> {
  const res = await c.rpc("record_usage", { reagent_id: id, amount });
  expect(res.error, `record_usage(${amount}): ${res.error?.code} ${res.error?.message}`).toBeNull();
}

async function intakeReagent(c: SupabaseClient, id: string, amount: number): Promise<void> {
  const res = await c.rpc("record_intake", { p_reagent_id: id, p_amount: amount, p_intake_date: INTAKE_DATE });
  expect(res.error, `record_intake(${amount}): ${res.error?.code} ${res.error?.message}`).toBeNull();
}

/** 화면 6 알림 대상 (d7 §11: stock < min_stock) 으로 이 계정에게 보이는 시약 id */
async function alertIdsOf(c: SupabaseClient): Promise<string[]> {
  const r = await c.from("reagents").select("id, stock, min_stock");
  expect(r.error, `reagents 조회: ${r.error?.message}`).toBeNull();
  return ((r.data ?? []) as Row[]).filter((x) => Number(x.stock) < Number(x.min_stock)).map((x) => x.id as string);
}

/** d7 §11 "아래로 내려가면 그 시각": 방금 일어난 일의 시각 — 테스트 시계와의 차이가 작다 */
const NEAR_NOW_MS = 120_000;
function expectNearNow(value: string | null, what: string): number {
  expect(value, `${what}: 시각 값이 있어야 함`).not.toBeNull();
  const t = Date.parse(value!);
  expect(Number.isNaN(t), `${what}: 시각 형식 (${value})`).toBe(false);
  expect(Math.abs(Date.now() - t), `${what}: 현재 시각 근처 (${value})`).toBeLessThan(NEAR_NOW_MS);
  return t;
}

/** 다음 쓰기가 같은 시각을 받지 않도록 띄운다 (잘못 now() 로 다시 채우면 값이 달라지게) */
const TICK_MS = 1_200;

// ---------- 앞뒤 불변 확인·정리 ----------

let sharedBefore: Shared | null = null;

test.beforeAll(async ({}, info) => {
  info.setTimeout(180_000);
  sharedBefore = await sharedAtRest();
});

test.afterAll(async ({}, info) => {
  info.setTimeout(420_000);
  // 정리가 먼저다 (아래 단언이 실패해도 일회용 계정·학교가 남지 않게)
  let left: Awaited<ReturnType<typeof sweep>> | null = null;
  const rest: Record<string, number> = {};
  if (HAS_SERVICE) {
    const sb = service();
    const schools = await sb.from("schools").select("id").like("neis_code", tempSchoolLike(GROUP, info.project.name));
    const ids = (schools.data ?? []).map((s) => s.id as string);
    if (ids.length) {
      await sb.from("usage_logs").delete().in("school_id", ids);
      await sb.from("reagents").delete().in("school_id", ids);
      await sb.from("vendors").delete().in("school_id", ids);
    }
    left = await sweep(GROUP, info.project.name);
    for (const table of ["vendors", "reagents", "intake_logs", "usage_logs"]) {
      const r = ids.length ? await sb.from(table).select("id").in("school_id", ids) : { data: [] as unknown[] };
      rest[table] = (r.data ?? []).length;
    }
    fixtureCache = null;
  }
  if (left) {
    expect(left, "일회용 계정·학교·프로필 잔여물").toEqual(NO_RESIDUE);
    expect(rest, "일회용 학교의 판매처·시약·기록 잔여물").toEqual({ vendors: 0, reagents: 0, intake_logs: 0, usage_logs: 0 });
  }
  // 공용 학교 A·B·데모 학교의 reagents(전체 열)·vendors(전체)는 그대로
  if (sharedBefore) {
    const before = sharedBefore;
    // 출처가 'auto' 인 공용 시약의 기준 값은 다른 스펙의 사용·입고 기록으로 DB 가 다시 계산한다(d7 §11-1) — 그 값만 빼고 견준다(출처는 견준다)
    const stable = (x: Shared) => ({ ...x, reagentsA: x.reagentsA.map(withoutAutoDrift), reagentsB: x.reagentsB.map(withoutAutoDrift) });
    let after: Shared = await sharedRead();
    for (let i = 0; i < 30 && JSON.stringify(stable(after)) !== JSON.stringify(stable(before)); i++) {
      await sleep(2_000);
      after = await sharedRead();
    }
    expect(after.vendors, "공통 목록 + 학교 A·B·데모 vendors").toEqual(before.vendors);
    expect(after.reagentsDemo, "데모 학교 reagents (자동 다시 계산에서 빠짐 — 전체 열)").toEqual(before.reagentsDemo);
    expect(stable(after).reagentsA, "학교 A reagents (자동 기준 값 제외)").toEqual(stable(before).reagentsA);
    expect(stable(after).reagentsB, "학교 B reagents (자동 기준 값 제외)").toEqual(stable(before).reagentsB);
  }
});

// ======================================================================
// 공용 계정 — 읽기와 "거부되어야 하는 호출"만
// ======================================================================

test(`[R-db][S9] 학생(학교 A): vendors select 0행(공통 목록 포함), insert·update·delete 거부`, async () => {
  const st = await signIn("student");
  expect(st.profileRole, "전제: 학생 계정").toBe("student");
  const before = await commonSnapshot();
  expect(before.length, "전제(양성 대조군): 공통 목록이 admin 에게는 보임").toBe(COMMON_SEED.length);

  expect(await visibleVendors(st.client), "학생에게 보이는 vendors").toHaveLength(0);
  for (const v of before) {
    const byId = await st.client.from("vendors").select("id, name, website").eq("id", v.id as string);
    expect(byId.error ? [] : byId.data ?? [], `학생 → 공통 행 "${String(v.name)}" id 직접 조회`).toHaveLength(0);
  }

  await expectInsertDenied(st.client, "학생", { school_id: st.schoolId, name: `S69-거부-학생-${tag()}` });
  await expectInsertDenied(st.client, "학생", { school_id: null, name: `S69-거부-학생-공통-${tag()}` });
  await expectCommonUntouchable(st.client, "학생", before);
});

test(`[R-db][S9] 교사(학교 A): 읽기만 — 공통 목록은 보이고 insert·update·delete 거부`, async () => {
  const t = await signIn("teacher");
  expect(t.profileRole, "전제: 교사 계정").toBe("teacher");
  const before = await commonSnapshot();

  const seen = await visibleVendors(t.client);
  expect(commonOf(seen), "교사에게 보이는 공통 목록 = admin 에게 보이는 공통 목록").toEqual(before);
  expect(seen.filter((v) => v.school_id !== null && v.school_id !== t.schoolId), "교사에게 보이는 다른 학교 판매처").toHaveLength(0);

  await expectInsertDenied(t.client, "교사", { school_id: t.schoolId, name: `S69-거부-교사-${tag()}` });
  await expectInsertDenied(t.client, "교사", { school_id: null, name: `S69-거부-교사-공통-${tag()}` });
  await expectCommonUntouchable(t.client, "교사", before);
});

test(`[R-db][S9] admin(학교 A): school_id null·다른 학교로 insert 거부, 공통 행 update·delete 0행·전체 열 그대로`, async () => {
  const admin = await signIn("admin");
  const b = await signIn("schoolB");
  expect(admin.profileRole, "전제: admin 계정").toBe("admin");
  expect(b.schoolId, "전제: 학교 B 는 다른 학교").not.toBe(admin.schoolId);
  const before = await commonSnapshot();

  await expectInsertDenied(admin.client, "admin", { school_id: null, name: `S69-거부-admin-공통-${tag()}` });
  await expectInsertDenied(admin.client, "admin", { school_id: b.schoolId, name: `S69-거부-admin-학교B-${tag()}` });
  // school_id 를 주지 않으면 null(= 공통) — 역시 거부
  await expectInsertDenied(admin.client, "admin", { name: `S69-거부-admin-생략-${tag()}` });
  await expectCommonUntouchable(admin.client, "admin", before);

  // 학교 B 교사에게도 학교 A admin 의 시도는 아무 흔적이 없다
  expect(commonOf(await visibleVendors(b.client)), "학교 B 교사에게 보이는 공통 목록").toEqual(before);
});

test(`[N1-db][S9] 공용 학교 A 교사·admin, 학교 B 교사가 공통 목록(d7 §12 seed 이름·website)을 읽고, 다른 학교 판매처는 0행`, async () => {
  for (const role of ["teacher", "admin", "schoolB"] as Role[]) {
    const s = await signIn(role);
    const seen = await visibleVendors(s.client);
    expect(nameSite(commonOf(seen)), `${ROLE_LABEL[role]} 에게 보이는 공통 목록`).toEqual(COMMON_SEED);
    for (const v of commonOf(seen)) expect(v.school_id, "공통 행 school_id").toBeNull();
    expect(seen.filter((v) => v.school_id !== null && v.school_id !== s.schoolId), `${ROLE_LABEL[role]} 에게 보이는 다른 학교 판매처`).toHaveLength(0);
  }
});

test(`[GM-db][S*] anon: vendors 0행(공통 목록도 못 읽음), insert·update·delete 불가`, async () => {
  const anon = anonClient();
  const before = await commonSnapshot();
  expect(before.length, "전제(양성 대조군): 공통 목록 행 있음").toBe(COMMON_SEED.length);

  expect(await visibleVendors(anon), "anon 에게 보이는 vendors").toHaveLength(0);
  for (const v of before) {
    const byId = await anon.from("vendors").select("id, name").eq("id", v.id as string);
    expect(byId.error ? [] : byId.data ?? [], `anon → 공통 행 "${String(v.name)}" id 직접 조회`).toHaveLength(0);
  }
  const a = await signIn("teacher");
  for (const schoolId of [null, a.schoolId, DEMO_SCHOOL_ID]) {
    const res = await vInsert(anon, { school_id: schoolId, name: `S69-거부-anon-${tag()}` });
    await dropLeaked(res);
    expectError(res, `anon vendors insert(school_id = ${String(schoolId)})`);
  }
  await expectCommonUntouchable(anon, "anon", before);
});

test(`[GM-db][S*] 데모 학교 school_id 로 판매처 insert: 학교 A 학생·교사·admin, 학교 B 교사 모두 거부, 데모 학교 판매처 0행`, async () => {
  for (const who of ["student", "teacher", "admin", "schoolB"] as Role[]) {
    const { client } = await clientOf(who);
    await expectInsertDenied(client, labelOf(who), { school_id: DEMO_SCHOOL_ID, name: `S69-거부-데모-${tag()}` });
    const seen = await visibleVendors(client);
    expect(seen.filter((v) => v.school_id === DEMO_SCHOOL_ID), `${labelOf(who)} 에게 보이는 데모 학교 판매처`).toHaveLength(0);
  }
});

test(`[R-db][S6] 공용 학교 A·B·데모(읽기만): 모든 시약에서 low_stock_since 값 있음 ⇔ stock < min_stock`, async () => {
  const a = await signIn("teacher");
  const b = await signIn("schoolB");
  const sets: [string, SupabaseClient, string][] = [
    ["학교 A", a.client, a.schoolId],
    ["학교 B", b.client, b.schoolId],
    ["데모 학교", anonClient(), DEMO_SCHOOL_ID],
  ];
  for (const [what, client, schoolId] of sets) {
    const r = await client.from("reagents").select(REAGENT_COLS).eq("school_id", schoolId);
    expect(r.error, `${what} reagents(재주문 열 포함) 조회: ${r.error?.message}`).toBeNull();
    const rows = ((r.data ?? []) as Row[]).map(toReagent);
    expect(rows.length, `전제: ${what} 시약`).toBeGreaterThan(0);
    for (const x of rows) {
      const low = x.stock < x.min_stock;
      expect(x.low_stock_since !== null, `${what} "${x.name}" stock ${x.stock} / min ${x.min_stock} → low_stock_since ${x.low_stock_since}`).toBe(low);
    }
  }
});

test(`[GM-db][S*] anon: 데모 학교 시약의 low_stock_since·재주문 기준 열 update 0행·값 그대로`, async () => {
  const anon = anonClient();
  const before = await anon.from("reagents").select(REAGENT_COLS).eq("school_id", DEMO_SCHOOL_ID).order("id");
  expect(before.error, `데모 시약 조회: ${before.error?.message}`).toBeNull();
  expect((before.data ?? []).length, "전제: 데모 학교 시약").toBeGreaterThan(0);
  const target = (before.data ?? [])[0] as Row;
  for (const patch of [{ low_stock_since: "2020-01-01T00:00:00Z" }, { low_stock_since: null }, { reorder_per_group: 3, reorder_groups: 6 }] as Row[]) {
    const res = await rUpdate(anon, target.id as string, patch);
    expect(changed(res), `anon 데모 시약 update(${JSON.stringify(patch)})`).toBe(0);
  }
  const after = await anon.from("reagents").select(REAGENT_COLS).eq("school_id", DEMO_SCHOOL_ID).order("id");
  expect(after.data, "데모 학교 시약(재주문 열)").toEqual(before.data);
});

// ======================================================================
// 성공 경로·제약 — 일회용 학교 (service role 로 준비·정리). 키가 없으면 skip.
// ======================================================================

test.describe("일회용 학교", () => {
  test.describe.configure({ mode: "default" });
  test.skip(!HAS_SERVICE, NO_SERVICE_REASON);

  // ---------- 판매처: 역할 ----------

  test(`[R-db][S9] admin insert 성공(school_id = 자기 학교) → 같은 학교 교사에게 보이고 학생은 0행`, async ({}, info) => {
    const f = await fresh(info);
    expect(await vendorsOf(f.school.id), "빈 학교에서 시작").toHaveLength(0);

    const name = `S69-등록-${tag()}`;
    const made = expectOne(
      await vInsert(f.admin, { school_id: f.school.id, name, contact: "043-000-0000", website: "https://vendor.example.test/shop", note: "시약 전문" }),
      "admin vendors insert",
    );
    expect(made).toMatchObject({ school_id: f.school.id, name, contact: "043-000-0000", website: "https://vendor.example.test/shop", note: "시약 전문" });
    expectNearNow(made.created_at as string, "created_at");
    expect(await vendorsOf(f.school.id), "vendors 행 = 반환 행").toEqual([made]);

    const own = (rows: Row[]) => rows.filter((v) => v.school_id !== null);
    expect(own(await visibleVendors(f.admin)), "admin 에게 보이는 우리 학교 판매처").toEqual([made]);
    expect(own(await visibleVendors(f.teacher)), "교사에게 보이는 우리 학교 판매처").toEqual([made]);
    expect(await visibleVendors(f.student), "학생에게 보이는 vendors (공통 포함)").toHaveLength(0);
    const byId = await f.student.from("vendors").select("id").eq("id", made.id as string);
    expect(byId.error ? [] : byId.data ?? [], "학생 → 판매처 id 직접 조회").toHaveLength(0);

    // 이름만 있어도 등록된다 (연락처·웹사이트·note 는 null 허용)
    const bare = expectOne(await vInsert(f.admin, { school_id: f.school.id, name: `S69-이름만-${tag()}` }), "admin insert(이름만)");
    expect(bare).toMatchObject({ school_id: f.school.id, contact: null, website: null, note: null });
  });

  test(`[R-db][S9] 교사·학생의 insert·update·delete 거부(교사는 읽기만) — 판매처 행 그대로`, async ({}, info) => {
    const f = await fresh(info);
    const made = await newVendor(f.admin, f.school.id, { contact: "010-0000-0000", website: "https://a.example.test", note: "원래" });
    const id = made.id as string;

    for (const [who, c] of [["교사", f.teacher], ["학생", f.student]] as [string, SupabaseClient][]) {
      const ins = await vInsert(c, { school_id: f.school.id, name: `S69-거부-${who}-${tag()}` });
      expectError(ins, `${who} vendors insert`, RLS_DENIED);
      for (const patch of [{ name: made.name }, { name: "S69-침범" }, { contact: "침범" }, { website: "https://evil.example.test" }, { note: "침범" }] as Row[]) {
        expect(changed(await vUpdate(c, id, patch)), `${who} vendors update(${JSON.stringify(patch)})`).toBe(0);
      }
      expect(changed(await vDelete(c, id)), `${who} vendors delete`).toBe(0);
      expect(await vendorsOf(f.school.id), `${who} 시도 뒤 판매처`).toEqual([made]);
    }
  });

  test(`[R-db][S9] admin update(이름·연락처·웹사이트·note)·delete 성공`, async ({}, info) => {
    const f = await fresh(info);
    const made = await newVendor(f.admin, f.school.id);
    const keep = await newVendor(f.admin, f.school.id);
    const id = made.id as string;

    const patch = { name: `S69-수정-${tag()}`, contact: "02-123-4567", website: "http://changed.example.test/path?q=1", note: "수정한 note" };
    const up = expectOne(await vUpdate(f.admin, id, patch), "admin vendors update");
    expect(up).toMatchObject({ id, school_id: f.school.id, created_at: made.created_at, ...patch });
    expect(await vendorById(id), "update 뒤 행").toEqual(up);
    expect((await visibleVendors(f.teacher)).find((v) => v.id === id), "교사에게 보이는 수정된 행").toEqual(up);

    // 값을 비우는 수정 (연락처·웹사이트·note 는 null 허용)
    const cleared = expectOne(await vUpdate(f.admin, id, { contact: null, website: null, note: null }), "admin update(null 로 비우기)");
    expect(cleared).toMatchObject({ id, name: patch.name, contact: null, website: null, note: null });

    const del = expectOne(await vDelete(f.admin, id), "admin vendors delete");
    expect(del.id).toBe(id);
    expect(await vendorById(id), "delete 뒤 행").toBeNull();
    expect(await vendorsOf(f.school.id), "다른 판매처는 그대로").toEqual([keep]);
  });

  test(`[R-db][S9] school_id 를 null(공통)·다른 학교·데모 학교로 바꾸는 update 거부 — 행 그대로`, async ({}, info) => {
    const f = await fresh(info);
    const a = await signIn("teacher");
    const made = await newVendor(f.admin, f.school.id, { note: "원래" });
    const id = made.id as string;
    const commonBefore = await commonSnapshot();

    for (const [what, schoolId] of [["null(공통)", null], ["다른 일회용 학교", f.other.id], ["공용 학교 A", a.schoolId], ["데모 학교", DEMO_SCHOOL_ID]] as [string, string | null][]) {
      const res = await vUpdate(f.admin, id, { school_id: schoolId });
      // 비상 정리: 구현 결함으로 옮겨졌다면 그 행(이 테스트가 만든 행)을 바로 지운다 — 정상이라면 호출 없음
      if (!res.error) await service().from("vendors").delete().eq("id", id);
      expectError(res, `admin vendors update(school_id → ${what})`);
      expect(await vendorById(id), `school_id → ${what} 시도 뒤 행`).toEqual(made);
    }
    expect(await commonSnapshot(), "공통 목록").toEqual(commonBefore);
    expect(await vendorsOf(f.other.id), "다른 일회용 학교 판매처").toHaveLength(0);

    // insert 도 같다: null·다른 학교
    for (const schoolId of [null, f.other.id]) {
      const res = await vInsert(f.admin, { school_id: schoolId, name: `S69-거부-${tag()}` });
      if (!res.error) await service().from("vendors").delete().in("id", rowsOf(res.data).map((r) => r.id as string));
      expectError(res, `admin vendors insert(school_id = ${String(schoolId)})`, RLS_DENIED);
    }
    expect(await commonSnapshot(), "공통 목록").toEqual(commonBefore);
    expect(await vendorsOf(f.other.id), "다른 일회용 학교 판매처").toHaveLength(0);
    expect(await vendorsOf(f.school.id), "우리 학교 판매처").toEqual([made]);
  });

  // ---------- 판매처: 제약 ----------

  const BAD: [string, Row][] = [
    ["이름 빈 값", { name: "" }],
    ["이름 공백만", { name: "   " }],
    ["이름 null", { name: null }],
    [`이름 ${NAME_MAX + 1}자`, { name: chars(NAME_MAX + 1) }],
    [`연락처 ${CONTACT_MAX + 1}자`, { contact: chars(CONTACT_MAX + 1, "1") }],
    ["웹사이트 javascript:alert(1)", { website: "javascript:alert(1)" }],
    ["웹사이트 ftp://x", { website: "ftp://x" }],
    ["웹사이트 공백 포함", { website: "https://a b.example.test" }],
    ["웹사이트 줄바꿈 포함", { website: "https://a.example.test\njavascript:alert(1)" }],
    ["웹사이트 앞에 다른 글자", { website: "x https://a.example.test" }],
    ["웹사이트 스킴만 없음", { website: "www.example.test" }],
    ["웹사이트 빈 값", { website: "" }],
    [`웹사이트 ${WEBSITE_MAX + 1}자`, { website: `https://${chars(WEBSITE_MAX + 1 - "https://".length, "a")}` }],
    [`note ${NOTE_MAX + 1}자`, { note: chars(NOTE_MAX + 1) }],
  ];

  test(`[R-db][S9] 제약 거부: 이름 빈 값·공백만·${NAME_MAX + 1}자, 연락처 ${CONTACT_MAX + 1}자, 웹사이트 http(s) 아님·공백·${WEBSITE_MAX + 1}자, note ${NOTE_MAX + 1}자 (insert·update 모두)`, async ({}, info) => {
    const f = await fresh(info);
    const made = await newVendor(f.admin, f.school.id, { contact: "원래", website: "https://ok.example.test", note: "원래" });

    for (const [what, patch] of BAD) {
      const ins = await vInsert(f.admin, { school_id: f.school.id, name: `S69-제약-${tag()}`, ...patch });
      expectError(ins, `insert(${what})`);
      expect(ins.error?.code, `insert(${what}) errcode (${ins.error?.message})`).toBe("name" in patch && patch.name === null ? "23502" : CHECK_VIOLATION);

      const up = await vUpdate(f.admin, made.id as string, patch);
      expectError(up, `update(${what})`);
      expect(up.error?.code, `update(${what}) errcode (${up.error?.message})`).toBe("name" in patch && patch.name === null ? "23502" : CHECK_VIOLATION);
    }
    expect(await vendorsOf(f.school.id), "거부된 시도 뒤 판매처").toEqual([made]);
  });

  test(`[R-db][S9] 경계값 허용: 이름 ${NAME_MAX}자·연락처 ${CONTACT_MAX}자·웹사이트 ${WEBSITE_MAX}자·note ${NOTE_MAX}자, http:// 도 허용`, async ({}, info) => {
    const f = await fresh(info);
    const edge = {
      name: chars(NAME_MAX),
      contact: chars(CONTACT_MAX, "1"),
      website: `https://${chars(WEBSITE_MAX - "https://".length, "a")}`,
      note: chars(NOTE_MAX),
    };
    expect(edge.website).toHaveLength(WEBSITE_MAX);
    const made = expectOne(await vInsert(f.admin, { school_id: f.school.id, ...edge }), "insert(경계값)");
    expect(made).toMatchObject(edge);

    const one = expectOne(await vInsert(f.admin, { school_id: f.school.id, name: "가", website: "http://x" }), "insert(이름 1자 · http://)");
    expect(one).toMatchObject({ name: "가", website: "http://x" });

    // update 로도 경계값까지 허용
    const edge2 = { ...edge, name: chars(NAME_MAX, "나") };
    const up = expectOne(await vUpdate(f.admin, one.id as string, edge2), "update(경계값)");
    expect(up).toMatchObject(edge2);
    expect(await vendorsOf(f.school.id), "판매처 2행").toHaveLength(2);
  });

  test(`[R-db][S9] 같은 학교 중복 이름(대소문자·공백 차이) ${UNIQUE_VIOLATION}, 공통 목록과 같은 이름·다른 학교와 같은 이름은 허용`, async ({}, info) => {
    const f = await fresh(info);
    const base = `Sigma Aldrich ${tag()}`;
    const made = await newVendor(f.admin, f.school.id, { name: base });
    const second = await newVendor(f.admin, f.school.id);

    const variants = [base, base.toLowerCase(), base.toUpperCase(), base.replace(/ /g, ""), base.replace(/ /g, "   "), ` ${base} `];
    for (const name of variants) {
      const ins = await vInsert(f.admin, { school_id: f.school.id, name });
      expectError(ins, `같은 학교 중복 이름 insert("${name}")`, UNIQUE_VIOLATION);
      const up = await vUpdate(f.admin, second.id as string, { name });
      expectError(up, `같은 학교 중복 이름으로 update("${name}")`, UNIQUE_VIOLATION);
    }
    expect(await vendorsOf(f.school.id), "거부된 시도 뒤 판매처").toEqual([made, second]);

    // 자기 이름의 대소문자·공백만 바꾸는 수정은 중복이 아니다
    const self = expectOne(await vUpdate(f.admin, made.id as string, { name: base.toUpperCase() }), "자기 이름 대문자로 update");
    expect(self.name).toBe(base.toUpperCase());

    // 공통 목록과 같은 이름은 학교 판매처로 허용 (d7 §12: 중복 불가는 "같은 학교 안")
    const commonBefore = await commonSnapshot();
    const commonName = COMMON_SEED[0].name;
    const sameAsCommon = expectOne(await vInsert(f.admin, { school_id: f.school.id, name: commonName }), `공통 목록과 같은 이름("${commonName}") insert`);
    expect(sameAsCommon).toMatchObject({ school_id: f.school.id, name: commonName });
    expect(await commonSnapshot(), "공통 목록은 그대로").toEqual(commonBefore);

    // 다른 학교와 같은 이름 허용
    const otherSame = expectOne(await vInsert(f.otherAdmin, { school_id: f.other.id, name: base }), "다른 학교가 같은 이름 insert");
    expect(otherSame).toMatchObject({ school_id: f.other.id, name: base });
    const otherCommon = expectOne(await vInsert(f.otherAdmin, { school_id: f.other.id, name: commonName }), "다른 학교도 공통 목록과 같은 이름 insert");
    expect(otherCommon.school_id).toBe(f.other.id);
  });

  // ---------- 판매처: 학교 분리 ----------

  test(`[N1-db][S9] 일회용 학교 A' 의 판매처는 일회용 학교 B'·공용 학교 A·B 의 교사·admin·학생·anon 에게 0행, 다른 학교 admin 의 update·delete 0행·값 그대로`, async ({}, info) => {
    const f = await fresh(info);
    const made = await newVendor(f.admin, f.school.id, { contact: "043-111-2222", website: "https://secret.example.test", note: "A' 전용" });
    const mine = await newVendor(f.otherAdmin, f.other.id, { note: "B' 전용" });
    const id = made.id as string;
    expect((await visibleVendors(f.teacher)).some((v) => v.id === id), "전제(양성 대조군): 같은 학교 교사에게는 보임").toBe(true);

    const others: [string, SupabaseClient][] = [
      ["일회용 학교 B' admin", f.otherAdmin],
      ["일회용 학교 B' 교사", f.otherTeacher],
      ["학교 A 교사", (await signIn("teacher")).client],
      ["학교 A admin", (await signIn("admin")).client],
      ["학교 A 학생", (await signIn("student")).client],
      ["학교 B 교사", (await signIn("schoolB")).client],
      ["anon", anonClient()],
    ];
    for (const [who, c] of others) {
      const seen = await visibleVendors(c);
      expect(seen.filter((v) => v.school_id === f.school.id), `${who} 에게 보이는 A' 판매처`).toHaveLength(0);
      const byId = await c.from("vendors").select("*").eq("id", id);
      expect(byId.error ? [] : byId.data ?? [], `${who} → A' 판매처 id 직접 조회`).toHaveLength(0);
      const byName = await c.from("vendors").select("id").eq("name", made.name as string);
      expect(byName.error ? [] : byName.data ?? [], `${who} → A' 판매처 이름 조회`).toHaveLength(0);
      const bySchool = await c.from("vendors").select("id").eq("school_id", f.school.id);
      expect(bySchool.error ? [] : bySchool.data ?? [], `${who} → A' school_id 조회`).toHaveLength(0);

      for (const patch of [{ name: made.name }, { note: "N1-침범" }, { website: "https://evil.example.test" }] as Row[]) {
        expect(changed(await vUpdate(c, id, patch)), `${who} A' 판매처 update(${JSON.stringify(patch)})`).toBe(0);
      }
      expect(changed(await vDelete(c, id)), `${who} A' 판매처 delete`).toBe(0);
      expect(await vendorById(id), `${who} 시도 뒤 A' 판매처`).toEqual(made);
    }

    // 다른 학교 admin 이 A' 판매처를 자기 학교로 끌어오는 것도 0행
    expect(changed(await vUpdate(f.otherAdmin, id, { school_id: f.other.id })), "B' admin 이 A' 판매처 school_id 를 자기 학교로").toBe(0);
    expect(await vendorsOf(f.school.id), "A' 판매처").toEqual([made]);
    expect(await vendorsOf(f.other.id), "B' 판매처").toEqual([mine]);
    // 반대 방향도 같다
    expect((await visibleVendors(f.admin)).filter((v) => v.school_id === f.other.id), "A' admin 에게 보이는 B' 판매처").toHaveLength(0);
    expect((await visibleVendors(f.otherTeacher)).filter((v) => v.school_id !== null), "B' 교사에게 보이는 학교 판매처 = B' 것만").toEqual([mine]);
  });

  test(`[N1-db][S9] 일회용 학교 A'·B' 의 교사·admin 도 공통 목록(d7 §12 seed)을 읽고 쓸 수 없음, 학생은 0행`, async ({}, info) => {
    const f = await fresh(info);
    const before = await commonSnapshot();
    for (const [who, c] of [["A' admin", f.admin], ["A' 교사", f.teacher], ["B' admin", f.otherAdmin], ["B' 교사", f.otherTeacher]] as [string, SupabaseClient][]) {
      const seen = await visibleVendors(c);
      expect(commonOf(seen), `${who} 에게 보이는 공통 목록`).toEqual(before);
      expect(nameSite(commonOf(seen)), `${who} 에게 보이는 공통 목록 이름·website`).toEqual(COMMON_SEED);
      await expectCommonUntouchable(c, who, before);
    }
    expect(await visibleVendors(f.student), "A' 학생에게 보이는 vendors").toHaveLength(0);
    await expectCommonUntouchable(f.student, "A' 학생", before);
  });

  test(`[GM-db][S*] 데모 학교 school_id 로 판매처 insert·옮기기: 일회용 admin·교사·학생 모두 거부`, async ({}, info) => {
    const f = await fresh(info);
    for (const [who, c] of [["일회용 admin", f.admin], ["일회용 교사", f.teacher], ["일회용 학생", f.student]] as [string, SupabaseClient][]) {
      const res = await vInsert(c, { school_id: DEMO_SCHOOL_ID, name: `S69-거부-데모-${tag()}` });
      if (!res.error) await service().from("vendors").delete().in("id", rowsOf(res.data).map((r) => r.id as string));
      expectError(res, `${who} vendors insert(데모 학교)`, RLS_DENIED);
    }
    const made = await newVendor(f.admin, f.school.id);
    const moved = await vUpdate(f.admin, made.id as string, { school_id: DEMO_SCHOOL_ID });
    if (!moved.error) await service().from("vendors").delete().eq("id", made.id as string);
    expectError(moved, "일회용 admin update(school_id → 데모 학교)");
    expect(await vendorsOf(DEMO_SCHOOL_ID), "데모 학교 판매처").toHaveLength(0);
    expect(await vendorsOf(f.school.id), "일회용 학교 판매처").toEqual([made]);
  });

  // ---------- 재주문: low_stock_since ----------

  test(`[R-db][S6] low_stock_since 전이: 등록 직후(자동 기준 = 입고량 × 20%) null → stock = min_stock(직접 지정 → 'manual') 은 null → 부족해지면 그 시각 → 더 줄어도(record_usage·직접 update) 유지 → record_intake 로 기준 이상이면 null → 다시 부족해지면 새 시각`, async ({}, info) => {
    const f = await fresh(info);
    const c = f.teacher;

    // 등록 직후: 자동 기준 = 첫 입고량 × 20% (d7 §6 · §11-1) < 재고 → 부족 아님
    let r = await newReagent(c, 10);
    const id = r.id;
    expect(r, "등록 직후").toMatchObject({
      stock: 10,
      min_stock: autoFromIntake(10),
      low_stock_since: null,
      reorder_per_group: null,
      reorder_groups: null,
      min_stock_source: "auto",
      min_stock_auto_basis: "intake",
    });

    // stock = min_stock 은 부족이 아니다 (d7 §11: stock < min_stock). 직접 지정한 기준 → 출처 'manual' (사용·입고로 다시 계산되지 않는다)
    r = await patchReagent(c, id, { min_stock: 10 }, "min_stock = stock");
    expect(r, "stock = min_stock").toMatchObject({ stock: 10, min_stock: 10, low_stock_since: null, min_stock_source: "manual", min_stock_auto_basis: null });

    // 기준을 stock 보다 크게 → 부족해진 시각
    r = await patchReagent(c, id, { min_stock: 12 }, "min_stock > stock");
    const t1 = expectNearNow(r.low_stock_since, "min_stock 12 > stock 10");
    const since1 = r.low_stock_since;
    expect(await readReagent(f.admin, id), "admin 이 읽은 행").toEqual(r);

    // 부족한 상태가 이어지면 유지: record_usage (교사) — DB 함수도 같은 규칙을 거친다
    await sleep(TICK_MS);
    await useReagent(c, id, 2);
    r = await readReagent(c, id);
    expect(r, "record_usage(2) 뒤").toMatchObject({ stock: 8, min_stock: 12, low_stock_since: since1 });

    // 유지: 학생의 record_usage
    await sleep(TICK_MS);
    await useReagent(f.student, id, 1);
    r = await readReagent(c, id);
    expect(r, "학생 record_usage(1) 뒤").toMatchObject({ stock: 7, low_stock_since: since1 });

    // 유지: 교사의 stock 직접 update · 기준을 바꿔도 여전히 부족 · 다른 열 수정
    r = await patchReagent(c, id, { stock: 6 }, "stock 직접 update");
    expect(r, "stock 6 직접 update 뒤").toMatchObject({ stock: 6, low_stock_since: since1 });
    r = await patchReagent(c, id, { min_stock: 11 }, "min_stock 11 (여전히 부족)");
    expect(r, "min_stock 11 뒤").toMatchObject({ min_stock: 11, low_stock_since: since1 });
    r = await patchReagent(c, id, { name: `${r.name}-이름변경` }, "이름 수정");
    expect(r.low_stock_since, "이름 수정 뒤").toBe(since1);
    r = await patchReagent(c, id, { reorder_per_group: 2, reorder_groups: 6 }, "재주문 기준 열 수정");
    expect(r, "재주문 기준 열 수정 뒤").toMatchObject({ reorder_per_group: 2, reorder_groups: 6, low_stock_since: since1 });

    // 기준 이상으로 입고: 아직 모자라면 유지, stock = min_stock 이 되면 null
    await intakeReagent(c, id, 4);
    r = await readReagent(c, id);
    expect(r, "record_intake(4) 뒤 (10 < 11)").toMatchObject({ stock: 10, min_stock: 11, low_stock_since: since1 });
    await intakeReagent(c, id, 1);
    r = await readReagent(c, id);
    expect(r, "record_intake(1) 뒤 (11 = 11)").toMatchObject({ stock: 11, min_stock: 11, low_stock_since: null, min_stock_source: "basis" });

    // 다시 부족해지면 새 시각 (예전 시각이 되살아나지 않는다)
    await sleep(TICK_MS);
    await useReagent(c, id, 1);
    r = await readReagent(c, id);
    expect(r, "다시 record_usage(1) 뒤").toMatchObject({ stock: 10, min_stock: 11 });
    const t2 = expectNearNow(r.low_stock_since, "다시 부족");
    expect(t2, `새 시각(${r.low_stock_since}) > 예전 시각(${since1})`).toBeGreaterThan(t1);
    const since2 = r.low_stock_since;

    // 기준을 낮춰 부족이 풀리면 null, 다시 올리면 또 새 시각
    r = await patchReagent(c, id, { min_stock: 0 }, "min_stock 0");
    expect(r.low_stock_since, "min_stock 0 뒤").toBeNull();
    await sleep(TICK_MS);
    r = await patchReagent(c, id, { min_stock: 50 }, "min_stock 50");
    expect(expectNearNow(r.low_stock_since, "기준을 다시 올림"), `새 시각(${r.low_stock_since}) > 예전 시각(${since2})`).toBeGreaterThan(t2);

    // 대조 조회: 다른 시약은 영향 없음
    const other = await newReagent(f.admin, 5);
    expect(other.low_stock_since, "새로 등록한 다른 시약").toBeNull();
    expect(other.min_stock, "새로 등록한 다른 시약의 자동 기준은 자기 입고량만 본다").toBe(autoFromIntake(5));
  });

  test(`[R-db][S6] low_stock_since 는 자동 기준 값의 변화도 따라간다: 사용 기록으로 자동 값이 재고를 넘으면 그 시각(재고 변화 없이도), 입고로 재고가 기준 이상이면 null`, async ({}, info) => {
    const f = await fresh(info);
    const c = f.teacher;
    const r0 = await newReagent(c, 10);
    expect(r0, "등록 직후 자동 기준").toMatchObject({ min_stock: autoFromIntake(10), min_stock_source: "auto", low_stock_since: null });

    // 사용 4: 재고 6, 자동 값 = 4 ÷ 2 = 2 (사용량 근거) → 부족 아님
    await useReagent(c, r0.id, 4);
    let r = await readReagent(c, r0.id);
    expect(r, "record_usage(4) 뒤").toMatchObject({ stock: 6, min_stock: autoFromUsage([4]), min_stock_auto_basis: "usage", low_stock_since: null });

    // 학생 사용 5: 재고 1, 자동 값 = 9 ÷ 2 = 4.5 → 부족해진 시각
    await sleep(TICK_MS);
    await useReagent(f.student, r0.id, 5);
    r = await readReagent(c, r0.id);
    expect(r, "학생 record_usage(5) 뒤").toMatchObject({ stock: 1, min_stock: autoFromUsage([4, 5]), min_stock_source: "auto", min_stock_auto_basis: "usage" });
    const t1 = expectNearNow(r.low_stock_since, "자동 기준이 재고를 넘음");
    const since1 = r.low_stock_since;
    expect(await alertIdsOf(f.admin), "화면 6 알림 대상 (교사·admin)").toContain(r0.id);

    // 입고 100: 재고 101, 자동 값은 사용량 근거 그대로(사용 기록이 있으면 사용량 우선) → 부족 풀림
    await intakeReagent(c, r0.id, 100);
    r = await readReagent(c, r0.id);
    expect(r, "record_intake(100) 뒤").toMatchObject({ stock: 101, min_stock: autoFromUsage([4, 5]), min_stock_auto_basis: "usage", low_stock_since: null });

    // 재고는 그대로인데 자동 값만 오르는 경우: 다른 시약(재고 넉넉)의 기록은 이 시약 값에 닿지 않는다
    const big = await newReagent(c, 1000);
    await useReagent(c, big.id, 999);
    expect(await readReagent(c, r0.id), "다른 시약의 사용 기록 뒤 이 시약 그대로").toEqual(r);

    // 자동 값이 재고를 다시 넘으면 새 시각 (예전 시각이 되살아나지 않는다)
    await sleep(TICK_MS);
    await useReagent(c, r0.id, 100);
    r = await readReagent(c, r0.id);
    expect(r, "record_usage(100) 뒤").toMatchObject({ stock: 1, min_stock: autoFromUsage([4, 5, 100]) });
    const t2 = expectNearNow(r.low_stock_since, "다시 부족");
    expect(t2, `새 시각(${r.low_stock_since}) > 예전 시각(${since1})`).toBeGreaterThan(t1);
  });

  test(`[R-db][S6] low_stock_since 를 API 로 직접 써도(과거 날짜·null·미래) 계산값으로 덮임 — update·insert 모두`, async ({}, info) => {
    const f = await fresh(info);
    const c = f.teacher;
    const PAST = "2020-01-01T00:00:00+00:00";
    const FUTURE = "2099-01-01T00:00:00+00:00";

    // 부족하지 않은 시약: 값을 써도 null
    const ok = await newReagent(c, 10);
    for (const v of [PAST, FUTURE]) {
      const r = await patchReagent(c, ok.id, { low_stock_since: v }, `부족하지 않은 시약에 low_stock_since = ${v}`);
      expect(r.low_stock_since, `부족하지 않은 시약에 ${v} 를 써도 null`).toBeNull();
    }

    // 부족해지는 update 에 과거 날짜를 같이 써도 그 시각(now)
    let low = await patchReagent(c, ok.id, { min_stock: 20, low_stock_since: PAST }, "부족해지는 update + 과거 날짜");
    const t1 = expectNearNow(low.low_stock_since, "부족해지는 update + 과거 날짜");
    const since = low.low_stock_since;

    // 이미 부족한 시약: 과거·미래·null 을 써도 그대로
    await sleep(TICK_MS);
    for (const v of [PAST, FUTURE, null]) {
      low = await patchReagent(f.admin, ok.id, { low_stock_since: v }, `부족한 시약에 low_stock_since = ${String(v)}`);
      expect(low.low_stock_since, `부족한 시약에 ${String(v)} 를 써도 유지`).toBe(since);
    }
    // 학생은 애초에 수정할 수 없다
    expect(changed(await rUpdate(f.student, ok.id, { low_stock_since: PAST })), "학생 low_stock_since update").toBe(0);
    expect((await readReagent(c, ok.id)).low_stock_since, "학생 시도 뒤").toBe(since);

    // 부족이 풀리는 update 에 값을 같이 써도 null
    low = await patchReagent(c, ok.id, { min_stock: 10, low_stock_since: FUTURE }, "부족이 풀리는 update + 미래 날짜");
    expect(low.low_stock_since, "부족이 풀리는 update + 미래 날짜").toBeNull();
    expect(t1).toBeGreaterThan(Date.parse(PAST));

    // insert: 부족한 채로 넣으면 그 시각, 직접 쓴 과거 날짜는 무시. 부족하지 않으면 써도 null
    const insLow = expectOne(
      await c.from("reagents").insert({ school_id: f.school.id, name: `S69-시약-insert-${tag()}`, unit: "g", stock: 1, min_stock: 5, low_stock_since: PAST }).select(REAGENT_COLS),
      "교사 reagents insert(부족 + 과거 날짜)",
    );
    expectNearNow(toReagent(insLow).low_stock_since, "부족한 채로 insert");
    const insOk = expectOne(
      await c.from("reagents").insert({ school_id: f.school.id, name: `S69-시약-insert-${tag()}`, unit: "g", stock: 5, min_stock: 5, low_stock_since: PAST }).select(REAGENT_COLS),
      "교사 reagents insert(stock = min_stock + 과거 날짜)",
    );
    expect(toReagent(insOk).low_stock_since, "부족하지 않은 채로 insert").toBeNull();
  });

  // ---------- 재주문: 기준 열 ----------

  test(`[R-db][S6] reorder_per_group·reorder_groups: 교사·admin update 가능, 학생 거부, 0·음수 per_group·0 이하 groups 거부`, async ({}, info) => {
    const f = await fresh(info);
    const made = await newReagent(f.teacher, 10);
    const id = made.id;
    expect(made, "등록 직후 기준 열은 null (d7 §11 null 허용)").toMatchObject({ reorder_per_group: null, reorder_groups: null });

    let r = await patchReagent(f.teacher, id, { reorder_per_group: 2.5, reorder_groups: 6 }, "교사 기준 열 update");
    // 기준 값(min_stock)은 등록 때의 자동 값 그대로, 근거 열을 직접 쓰면 출처는 'basis' (d7 §11-1 · 직접 update 가드)
    expect(made.min_stock, "전제: 등록 직후 자동 기준").toBe(autoFromIntake(10));
    expect(r).toMatchObject({ reorder_per_group: 2.5, reorder_groups: 6, stock: 10, min_stock: made.min_stock, low_stock_since: null, min_stock_source: "basis", min_stock_auto_basis: null });
    r = await patchReagent(f.admin, id, { reorder_per_group: 3, reorder_groups: 8 }, "admin 기준 열 update");
    expect(r).toMatchObject({ reorder_per_group: 3, reorder_groups: 8 });
    const kept = r;

    // 학생: 0행·값 그대로 (학생도 같은 학교 시약은 읽는다)
    for (const patch of [{ reorder_per_group: 99 }, { reorder_groups: 99 }, { reorder_per_group: null, reorder_groups: null }, { min_stock: 99 }] as Row[]) {
      expect(changed(await rUpdate(f.student, id, patch)), `학생 reagents update(${JSON.stringify(patch)})`).toBe(0);
    }
    expect(await readReagent(f.teacher, id), "학생 시도 뒤").toEqual(kept);

    // 제약
    for (const patch of [{ reorder_per_group: 0 }, { reorder_per_group: -1 }, { reorder_per_group: -0.5 }, { reorder_groups: 0 }, { reorder_groups: -1 }] as Row[]) {
      for (const [who, c] of [["교사", f.teacher], ["admin", f.admin]] as [string, SupabaseClient][]) {
        expectError(await rUpdate(c, id, patch), `${who} update(${JSON.stringify(patch)})`, CHECK_VIOLATION);
      }
    }
    expect(await readReagent(f.teacher, id), "거부된 시도 뒤").toEqual(kept);

    // 경계값: groups 1, 아주 작은 양수 per_group, 다시 null
    r = await patchReagent(f.teacher, id, { reorder_per_group: 0.01, reorder_groups: 1 }, "경계값");
    expect(r).toMatchObject({ reorder_per_group: 0.01, reorder_groups: 1 });
    r = await patchReagent(f.teacher, id, { reorder_per_group: null, reorder_groups: null }, "null 로 비우기");
    expect(r, "근거 열을 비우면 직접 정한 기준 → 'manual'").toMatchObject({ reorder_per_group: null, reorder_groups: null, min_stock_source: "manual" });
  });

  // ---------- 재주문: 학교 분리 ----------

  test(`[N1-db][S6] 다른 학교(일회용 B'·공용 A·B)·anon 은 부족 시약의 low_stock_since·기준 열을 읽을 수 없고(0행) 수정도 0행`, async ({}, info) => {
    const f = await fresh(info);
    const made = await newReagent(f.teacher, 10);
    const id = made.id;
    const low = await patchReagent(f.teacher, id, { min_stock: 30, reorder_per_group: 5, reorder_groups: 6 }, "부족 + 기준 열");
    expectNearNow(low.low_stock_since, "전제: 부족 시약");
    expect(await readReagent(f.student, id), "전제(양성 대조군): 같은 학교 학생에게는 보임").toEqual(low);

    const others: [string, SupabaseClient][] = [
      ["일회용 학교 B' admin", f.otherAdmin],
      ["일회용 학교 B' 교사", f.otherTeacher],
      ["학교 A 교사", (await signIn("teacher")).client],
      ["학교 A admin", (await signIn("admin")).client],
      ["학교 A 학생", (await signIn("student")).client],
      ["학교 B 교사", (await signIn("schoolB")).client],
      ["anon", anonClient()],
    ];
    for (const [who, c] of others) {
      const byId = await c.from("reagents").select(REAGENT_COLS).eq("id", id);
      expect(byId.error ? [] : byId.data ?? [], `${who} → 시약 id 직접 조회`).toHaveLength(0);
      const bySchool = await c.from("reagents").select("id, low_stock_since").eq("school_id", f.school.id);
      expect(bySchool.error ? [] : bySchool.data ?? [], `${who} → school_id 조회`).toHaveLength(0);
      const lowList = await c.from("reagents").select("id, school_id").not("low_stock_since", "is", null);
      expect(
        (lowList.error ? [] : lowList.data ?? []).filter((x) => x.school_id === f.school.id),
        `${who} 의 부족 시약 목록에 A' 시약`,
      ).toHaveLength(0);

      for (const patch of [{ low_stock_since: null }, { reorder_per_group: 1, reorder_groups: 1 }, { min_stock: 0 }, { stock: 999 }] as Row[]) {
        expect(changed(await rUpdate(c, id, patch)), `${who} A' 시약 update(${JSON.stringify(patch)})`).toBe(0);
      }
    }
    expect(await readReagent(f.teacher, id), "다른 학교 시도 뒤").toEqual(low);

    // 다른 학교의 함수 호출도 A' 시약의 재고·알림을 바꾸지 못한다
    const use = await f.otherTeacher.rpc("record_usage", { reagent_id: id, amount: 1 });
    expect(use.error, "B' 교사 record_usage(A' 시약) 는 오류여야 함").not.toBeNull();
    const intake = await f.otherTeacher.rpc("record_intake", { p_reagent_id: id, p_amount: 100, p_intake_date: INTAKE_DATE });
    expect(intake.error, "B' 교사 record_intake(A' 시약) 는 오류여야 함").not.toBeNull();
    expect(await readReagent(f.teacher, id), "다른 학교 함수 호출 뒤").toEqual(low);
  });
});
