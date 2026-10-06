// [R-db][S5] · [N1-db][S5] · [GM-db][S*]
// 실험 매뉴얼(화면 5) 재주문 기준 저장 — DB 함수 save_reorder_basis(p_items jsonb).
// 실제 권한·함수 (publishable/anon 키 + 각 계정 로그인)로 판정한다.
// 기준: harness/d7-data.md §13 "저장"·"조 수"·§11·§5, harness/d5-gates.md R-db·N1-db·GM-db.
//
// 절대 규칙 (운영 DB):
// - 공용 테스트 계정 4개(학교 A 학생·교사·admin, 학교 B 교사)로는 읽기와 "거부되어야 하는 호출"만 한다.
//   거부되어야 하는 호출이 구현 결함으로 통과해도 공용 시약이 바뀌지 않게 두 겹으로 막는다:
//   (1) 권한·학교 거부를 보는 호출은 필요량을 그 시약의 지금 기준보다 크지 않게 잡는다(통과해도 "유지"),
//   (2) 호출 앞뒤로 기준 세 열을 견주고, 달라졌으면 service role 로 원래 값으로 되돌린다(정상이라면 호출 없음).
// - 성공하는 저장은 일회용 학교의 일회용 계정·임시 시약(register_reagent — min_stock 0)으로만 한다.
//   service role 은 준비·정리·대조 조회에만 쓰고, 판정 대상 호출은 항상 로그인 세션(publishable 키)으로 한다.
// - 데모 학교·실사용 학교에는 쓰지 않는다. usage_logs 는 만들지 않는다(임시 시약·계정을 지울 수 있게).
// - 정리 순서: 시약(intake_logs cascade) → 프로필 → 계정 → 학교. 끝에 잔여물 0 을 단언한다.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type TestInfo } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ROLE_LABEL, anonClient, signIn, type Role } from "./db-helpers";
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

// ---------- 규칙 (d7 §13) ----------

/** d7 §13 "조 수": "1~20 정수" — 문서에서 읽는다 */
const [GROUPS_MIN, GROUPS_MAX] = (() => {
  const doc = readFileSync(join(process.cwd(), "harness", "d7-data.md"), "utf8");
  const line = doc.split(/\r?\n/).find((l) => l.startsWith("| 조 수 |"));
  const m = line?.match(/(\d+)\s*~\s*(\d+)\s*정수/);
  if (!m) throw new Error("harness/d7-data.md §13 에서 '조 수' 범위를 읽지 못했습니다");
  return [Number(m[1]), Number(m[2])];
})();

/** 오케스트레이터가 준 함수 계약: 한 번에 1~50개, 1조 사용량 0 초과 1,000,000 이하 */
const ITEMS_MAX = 50;
const PER_GROUP_MAX = 1_000_000;

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

const GROUP = "s5db";
const SUCCESS_TIMEOUT = 420_000;
const NO_SERVICE_REASON =
  "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)";

/** Postgres 오류 코드 */
const DENIED = "42501";
const INVALID = "22023";
const NOT_FOUND = "P0002";

type Row = Record<string, unknown>;
type DbError = { code?: string; message: string; details?: string | null; hint?: string | null };
type Res = { data: unknown; error: DbError | null };
type Item = { reagent_id?: unknown; per_group?: unknown; groups?: unknown };
type Outcome = { reagent_id: string; required: number; previous_min_stock: number; outcome: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tag = () => randomUUID().slice(0, 8);

const save = async (c: SupabaseClient, items: unknown): Promise<Res> => c.rpc("save_reorder_basis", { p_items: items });

/** 거부: 오류가 있고(PostgREST 의 "함수 못 찾음" PGRST… 이 아님), 결과가 없고, 코드가 맞다 */
function expectRejected(res: Res, what: string, code?: string): void {
  expect(res.error, `${what} 는 오류여야 함 (반환 ${JSON.stringify(res.data)})`).not.toBeNull();
  expect(String(res.error?.code ?? ""), `${what}: ${res.error?.message}`).not.toMatch(/^PGRST/);
  expect(res.data ?? null, `${what} 반환값`).toBeNull();
  if (code) expect(res.error?.code, `${what} errcode (${res.error?.message})`).toBe(code);
}

/** 성공: 오류 없음 + 항목 수만큼의 결과 (reagent_id 로 찾는다) */
function expectSaved(res: Res, what: string, count: number): Map<string, Outcome> {
  expect(res.error, `${what}: ${res.error?.code} ${res.error?.message} ${res.error?.details ?? ""}`).toBeNull();
  expect(Array.isArray(res.data), `${what} 반환값은 배열`).toBe(true);
  const rows = res.data as Row[];
  expect(rows, `${what} 반환 항목 수`).toHaveLength(count);
  const out = new Map<string, Outcome>();
  for (const r of rows) {
    expect(Object.keys(r).sort(), `${what} 반환 항목의 키`).toEqual(["outcome", "previous_min_stock", "reagent_id", "required"]);
    out.set(r.reagent_id as string, {
      reagent_id: r.reagent_id as string,
      required: Number(r.required),
      previous_min_stock: Number(r.previous_min_stock),
      outcome: r.outcome as string,
    });
  }
  expect(out.size, `${what} 반환 항목의 reagent_id 는 서로 다름`).toBe(count);
  return out;
}

// ---------- reagents 읽기 ----------

const REAGENT_COLS = "id, school_id, name, unit, stock, min_stock, reorder_per_group, reorder_groups, low_stock_since";

type Reagent = {
  id: string;
  school_id: string;
  name: string;
  stock: number;
  min_stock: number;
  reorder_per_group: number | null;
  reorder_groups: number | null;
  low_stock_since: string | null;
};
type Basis = Pick<Reagent, "id" | "min_stock" | "reorder_per_group" | "reorder_groups">;

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
  };
}

const basisOf = (r: Reagent): Basis => ({
  id: r.id,
  min_stock: r.min_stock,
  reorder_per_group: r.reorder_per_group,
  reorder_groups: r.reorder_groups,
});

/** 다른 스펙이 학교 A·B 에 잠깐 만드는 임시 시약 이름 접두사 (db-helpers pickReagent 가 건너뛰는 것과 같은 목록) */
const FOREIGN_TEMP = ["R-db-", "N1-db-", "S7-ui-"];
const isForeignTemp = (r: Row) => FOREIGN_TEMP.some((p) => String(r.name).startsWith(p));

async function reagentsSeen(c: SupabaseClient, schoolId: string, what: string): Promise<Row[]> {
  const r = await c.from("reagents").select("*").eq("school_id", schoolId).order("id");
  expect(r.error, `${what} reagents 조회: ${r.error?.message}`).toBeNull();
  return ((r.data ?? []) as Row[]).filter((x) => !isForeignTemp(x));
}

async function readReagent(c: SupabaseClient, id: string): Promise<Reagent> {
  const r = await c.from("reagents").select(REAGENT_COLS).eq("id", id);
  expect(r.error, `reagents 조회: ${r.error?.message}`).toBeNull();
  expect(r.data ?? [], "reagents 조회 행").toHaveLength(1);
  return toReagent((r.data ?? [])[0] as Row);
}

async function readMany(c: SupabaseClient, ids: string[]): Promise<Reagent[]> {
  const r = await c.from("reagents").select(REAGENT_COLS).in("id", ids).order("id");
  expect(r.error, `reagents 조회: ${r.error?.message}`).toBeNull();
  expect(r.data ?? [], "reagents 조회 행").toHaveLength(ids.length);
  return ((r.data ?? []) as Row[]).map(toReagent);
}

/**
 * 공용·데모 학교에서 "거부 호출"의 대상으로 쓸 시약: 기준(min_stock)이 가장 큰 것.
 * 함께 돌려주는 safe 항목은 필요량이 그 기준보다 크지 않다 — 거부가 구현 결함으로 통과해도 값이 바뀌지 않는다.
 */
async function guarded(c: SupabaseClient, schoolId: string, what: string): Promise<{ target: Reagent; safe: Item }> {
  const rows = (await reagentsSeen(c, schoolId, what)).map(toReagent);
  expect(rows.length, `전제: ${what} 시약`).toBeGreaterThan(0);
  const target = [...rows].sort((a, b) => b.min_stock - a.min_stock || a.id.localeCompare(b.id))[0];
  expect(target.min_stock, `전제: ${what} 에 기준(min_stock)이 0.001 이상인 시약이 있음`).toBeGreaterThanOrEqual(0.001);
  return { target, safe: { reagent_id: target.id, per_group: 0.001, groups: GROUPS_MIN } };
}

/** 비상 복원: 거부되어야 할 호출이 구현 결함으로 공용 시약의 기준을 바꿨을 때만 (정상이라면 호출 없음) */
async function restoreBasis(before: Reagent): Promise<void> {
  if (!HAS_SERVICE) return;
  const sb = service();
  const now = await sb.from("reagents").select(REAGENT_COLS).eq("id", before.id).maybeSingle();
  if (!now.data || JSON.stringify(basisOf(toReagent(now.data as Row))) === JSON.stringify(basisOf(before))) return;
  await sb
    .from("reagents")
    .update({ min_stock: before.min_stock, reorder_per_group: before.reorder_per_group, reorder_groups: before.reorder_groups })
    .eq("id", before.id);
}

/** 거부되어야 하는 호출 1회 + 대상 시약(공용·데모)의 기준 세 열이 그대로인지. reader 는 그 시약을 읽을 수 있는 세션 */
async function expectDeniedUntouched(
  caller: SupabaseClient,
  items: unknown,
  what: string,
  code: string | undefined,
  reader: SupabaseClient,
  target: Reagent,
): Promise<Res> {
  let res: Res;
  let after: Reagent;
  try {
    res = await save(caller, items);
    after = await readReagent(reader, target.id);
  } finally {
    await restoreBasis(target);
  }
  expect(basisOf(after), `${what} 뒤 "${target.name}" 의 min_stock·reorder_per_group·reorder_groups`).toEqual(basisOf(target));
  expectRejected(res, what, code);
  return res;
}

/** 오류의 겉모습 (존재 여부가 새지 않는지 견줄 때) */
const shape = (res: Res) => ({
  code: res.error?.code ?? null,
  message: res.error?.message ?? null,
  details: res.error?.details ?? null,
  hint: res.error?.hint ?? null,
  data: res.data ?? null,
});

// ---------- 잘못된 입력 (d7 §13: 조 수 1~20 정수 · 계약: 1~50개, 0 < per_group ≤ 1,000,000, 중복 불가) ----------

/**
 * id 한 개로 만드는 "모양이 잘못된" 입력 목록 — 전부 22023 이어야 한다.
 * amount = 잘못되지 않은 자리에 넣는 1조 사용량. 공용 시약에는 아주 작은 값을 준다(검증이 빠져 통과해도 "유지"가 되게).
 */
function invalidInputs(id: string, amount: number): [string, unknown][] {
  const ok = { reagent_id: id, per_group: amount, groups: GROUPS_MIN };
  return [
    ["배열이 아님(객체 1개)", ok],
    ["배열이 아님(문자열)", "items"],
    ["배열이 아님(숫자)", 5],
    ["배열이 아님(null)", null],
    ["빈 배열", []],
    ["원소가 객체가 아님(문자열)", [id]],
    ["원소가 객체가 아님(null)", [null]],
    ["원소가 객체가 아님(배열)", [[id, amount, GROUPS_MIN]]],
    ["reagent_id 없음", [{ per_group: amount, groups: GROUPS_MIN }]],
    ["reagent_id null", [{ ...ok, reagent_id: null }]],
    ["reagent_id 가 uuid 아님(글자)", [{ ...ok, reagent_id: "abc" }]],
    ["reagent_id 가 uuid 아님(빈 값)", [{ ...ok, reagent_id: "" }]],
    ["reagent_id 가 uuid 아님(숫자)", [{ ...ok, reagent_id: 123 }]],
    ["reagent_id 뒤에 다른 글자", [{ ...ok, reagent_id: `${id}' or 1=1 --` }]],
    ["per_group 0", [{ ...ok, per_group: 0 }]],
    ["per_group 음수", [{ ...ok, per_group: -1 }]],
    ["per_group 음수 소수", [{ ...ok, per_group: -0.5 }]],
    [`per_group ${PER_GROUP_MAX + 1}`, [{ ...ok, per_group: PER_GROUP_MAX + 1 }]],
    [`per_group ${PER_GROUP_MAX}.001`, [{ ...ok, per_group: PER_GROUP_MAX + 0.001 }]],
    ["per_group 문자열", [{ ...ok, per_group: "3" }]],
    ["per_group null", [{ ...ok, per_group: null }]],
    ["per_group 없음", [{ reagent_id: id, groups: GROUPS_MIN }]],
    [`groups ${GROUPS_MIN - 1}`, [{ ...ok, groups: GROUPS_MIN - 1 }]],
    ["groups 음수", [{ ...ok, groups: -1 }]],
    [`groups ${GROUPS_MAX + 1}`, [{ ...ok, groups: GROUPS_MAX + 1 }]],
    ["groups 2.5", [{ ...ok, groups: 2.5 }]],
    ["groups 문자열", [{ ...ok, groups: "6" }]],
    ["groups null", [{ ...ok, groups: null }]],
    ["groups 없음", [{ reagent_id: id, per_group: amount }]],
    ["같은 시약 두 번", [ok, { ...ok, per_group: amount * 2 }]],
    ["같은 시약 두 번(대문자 id)", [ok, { ...ok, reagent_id: id.toUpperCase() }]],
    [
      `${ITEMS_MAX + 1}개`,
      [ok, ...Array.from({ length: ITEMS_MAX }, () => ({ reagent_id: randomUUID(), per_group: amount, groups: GROUPS_MIN }))],
    ],
  ];
}

// ---------- 공용·데모 학교 스냅숏 (읽기만) ----------

type Shared = { reagentsA: Row[]; reagentsB: Row[]; reagentsDemo: Row[] };

async function sharedRead(): Promise<Shared> {
  const a = await signIn("teacher");
  const b = await signIn("schoolB");
  return {
    reagentsA: await reagentsSeen(a.client, a.schoolId, "학교 A"),
    reagentsB: await reagentsSeen(b.client, b.schoolId, "학교 B"),
    reagentsDemo: await reagentsSeen(anonClient(), DEMO_SCHOOL_ID, "데모 학교"),
  };
}

/** 다른 스펙이 병렬로 학교 A·B 시약 stock 을 잠깐 바꿨다 되돌린다 — 연속 두 번 같은 값이 읽힐 때까지 기다린 상태 */
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

/** 재주문 기준 세 열만 (다른 스펙이 바꾸지 않는 열 — 병렬 실행과 무관하게 언제나 같아야 한다) */
const basisRows = (rows: Row[]) => rows.map((r) => basisOf(toReagent(r)));

// ---------- 일회용 학교 ----------

interface Fixture {
  school: TempSchool;
  other: TempSchool;
  teacherUser: TempUser;
  studentUser: TempUser;
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

/** 일회용 학교의 시약(intake_logs cascade)을 비운다 (service role — 준비·정리) */
async function purge(schoolIds: string[]): Promise<void> {
  if (!schoolIds.length) return;
  const r = await service().from("reagents").delete().in("school_id", schoolIds);
  expect(r.error, `일회용 학교 시약 정리: ${r.error?.message}`).toBeNull();
}

async function fresh(info: TestInfo): Promise<Fixture> {
  test.setTimeout(SUCCESS_TIMEOUT);
  const f = await fixture(info);
  await purge([f.school.id, f.other.id]);
  return f;
}

const INTAKE_DATE = "2026-09-15";

/** 임시 시약: register_reagent (d7 §6 — min_stock 0 으로 시작) */
async function newReagent(c: SupabaseClient, stock: number): Promise<Reagent> {
  const res = await c.rpc("register_reagent", {
    p_name: `S5-시약-${tag()}`,
    p_storage_class: storageClasses[0],
    p_stock: stock,
    p_unit: "g",
    p_intake_date: INTAKE_DATE,
    p_msds_url: null,
  });
  expect(res.error, `register_reagent (준비): ${res.error?.code} ${res.error?.message}`).toBeNull();
  const row = (Array.isArray(res.data) ? res.data[0] : res.data) as Row;
  const made = await readReagent(c, row.id as string);
  expect(made, "전제: 등록 직후 기준 없음 (d7 §6·§11)").toMatchObject({
    stock,
    min_stock: 0,
    reorder_per_group: null,
    reorder_groups: null,
    low_stock_since: null,
  });
  return made;
}

/** d7 §11 "아래로 내려가면 그 시각": 방금 일어난 일의 시각 */
const NEAR_NOW_MS = 120_000;
function expectNearNow(value: string | null, what: string): void {
  expect(value, `${what}: 시각 값이 있어야 함`).not.toBeNull();
  const t = Date.parse(value!);
  expect(Number.isNaN(t), `${what}: 시각 형식 (${value})`).toBe(false);
  expect(Math.abs(Date.now() - t), `${what}: 현재 시각 근처 (${value})`).toBeLessThan(NEAR_NOW_MS);
}

/** 화면 6 의 알림 대상(d7 §11: 같은 학교 시약 중 stock < min_stock)으로 이 계정에게 보이는 시약 id */
async function alertIds(c: SupabaseClient): Promise<string[]> {
  const r = await c.from("reagents").select("id, stock, min_stock");
  expect(r.error, `reagents 조회: ${r.error?.message}`).toBeNull();
  return ((r.data ?? []) as Row[]).filter((x) => Number(x.stock) < Number(x.min_stock)).map((x) => x.id as string);
}

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
    const schools = await sb.from("schools").select("id").like("neis_code", `S8UI-${GROUP}-${info.project.name}-%`);
    const ids = (schools.data ?? []).map((s) => s.id as string);
    if (ids.length) await sb.from("reagents").delete().in("school_id", ids);
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
  // 공용 학교 A·B·데모 학교의 reagents 는 그대로
  if (sharedBefore) {
    const before = sharedBefore;
    let after: Shared = await sharedRead();
    // 재주문 기준 세 열은 기다릴 것 없이 같아야 한다 (이 열을 바꾸는 다른 스펙이 없다)
    expect(basisRows(after.reagentsA), "학교 A reagents 의 min_stock·reorder_per_group·reorder_groups").toEqual(basisRows(before.reagentsA));
    expect(basisRows(after.reagentsB), "학교 B reagents 의 min_stock·reorder_per_group·reorder_groups").toEqual(basisRows(before.reagentsB));
    for (let i = 0; i < 30 && JSON.stringify(after) !== JSON.stringify(before); i++) {
      await sleep(2_000);
      after = await sharedRead();
    }
    expect(after.reagentsDemo, "데모 학교 reagents (전체 열)").toEqual(before.reagentsDemo);
    expect(after.reagentsA, "학교 A reagents (전체 열)").toEqual(before.reagentsA);
    expect(after.reagentsB, "학교 B reagents (전체 열)").toEqual(before.reagentsB);
  }
});

// ======================================================================
// 공용 계정 — 읽기와 "거부되어야 하는 호출"만
// ======================================================================

test(`[R-db][S5] 학생(학교 A): save_reorder_basis ${DENIED} — 자기 학교 시약의 기준 그대로`, async () => {
  const st = await signIn("student");
  expect(st.profileRole, "전제: 학생 계정").toBe("student");
  const { target, safe } = await guarded(st.client, st.schoolId, "학교 A");
  expect((await readReagent(st.client, target.id)).id, "전제(양성 대조군): 학생도 자기 학교 시약은 읽는다").toBe(target.id);

  await expectDeniedUntouched(st.client, [safe], "학생 save_reorder_basis(자기 학교 시약)", DENIED, st.client, target);
  // 입력이 틀려도 학생에게는 역할 거부가 먼저다 (입력 검증 결과로 함수 안쪽을 알려 주지 않는다)
  await expectDeniedUntouched(st.client, [], "학생 save_reorder_basis(빈 배열)", DENIED, st.client, target);
  await expectDeniedUntouched(
    st.client,
    [{ reagent_id: randomUUID(), per_group: 1, groups: GROUPS_MIN }],
    "학생 save_reorder_basis(없는 id)",
    DENIED,
    st.client,
    target,
  );
});

test(`[R-db][S5] anon: save_reorder_basis 호출 불가(${DENIED}) — 학교 A·데모 시약 그대로`, async () => {
  const anon = anonClient();
  const t = await signIn("teacher");
  const a = await guarded(t.client, t.schoolId, "학교 A");
  const demo = await guarded(anon, DEMO_SCHOOL_ID, "데모 학교");

  await expectDeniedUntouched(anon, [a.safe], "anon save_reorder_basis(학교 A 시약)", DENIED, t.client, a.target);
  await expectDeniedUntouched(anon, [demo.safe], "anon save_reorder_basis(데모 시약)", DENIED, anon, demo.target);
  await expectDeniedUntouched(anon, [], "anon save_reorder_basis(빈 배열)", DENIED, t.client, a.target);
});

for (const role of ["teacher", "admin"] as Role[]) {
  test(`[R-db][S5] ${ROLE_LABEL[role]}: 잘못된 입력(배열 아님·0개·${ITEMS_MAX + 1}개·reagent_id 형식·per_group 0·음수·${PER_GROUP_MAX + 1}·문자열·groups ${GROUPS_MIN - 1}·${GROUPS_MAX + 1}·2.5·문자열·중복) ${INVALID} — 기준 그대로`, async () => {
    test.setTimeout(180_000);
    const s = await signIn(role);
    expect(s.profileRole, `전제: ${role} 계정`).toBe(role);
    const { target } = await guarded(s.client, s.schoolId, "학교 A");
    for (const [what, items] of invalidInputs(target.id, 0.001)) {
      await expectDeniedUntouched(s.client, items, `${ROLE_LABEL[role]} save_reorder_basis(${what})`, INVALID, s.client, target);
    }
  });
}

test(`[N1-db][S5] 학교 A 교사·admin → 학교 B 시약 id: ${NOT_FOUND} (없는 id 와 같은 응답), 학교 B 교사 → 학교 A 시약 id 도 같음 — 두 학교 기준 그대로`, async () => {
  const b = await signIn("schoolB");
  const t = await signIn("teacher");
  expect(b.schoolId, "전제: 학교 B 는 다른 학교").not.toBe(t.schoolId);
  const inB = await guarded(b.client, b.schoolId, "학교 B");
  const inA = await guarded(t.client, t.schoolId, "학교 A");
  const ghost = (): Item[] => [{ reagent_id: randomUUID(), per_group: 0.001, groups: GROUPS_MIN }];

  for (const role of ["teacher", "admin"] as Role[]) {
    const s = await signIn(role);
    const seen = await s.client.from("reagents").select("id").eq("id", inB.target.id);
    expect(seen.error ? [] : seen.data ?? [], `전제: ${ROLE_LABEL[role]} 에게 학교 B 시약은 0행`).toHaveLength(0);

    const cross = await expectDeniedUntouched(s.client, [inB.safe], `${ROLE_LABEL[role]} save_reorder_basis(학교 B 시약)`, NOT_FOUND, b.client, inB.target);
    const none = await save(s.client, ghost());
    expectRejected(none, `${ROLE_LABEL[role]} save_reorder_basis(없는 id)`, NOT_FOUND);
    expect(shape(cross), "다른 학교 시약과 없는 id 의 응답이 같음 (존재 여부 비노출)").toEqual(shape(none));
    expect(JSON.stringify(cross.error), "오류에 학교 B 시약 이름이 없음").not.toContain(inB.target.name);
  }

  // 반대 방향
  const cross = await expectDeniedUntouched(b.client, [inA.safe], "학교 B 교사 save_reorder_basis(학교 A 시약)", NOT_FOUND, t.client, inA.target);
  const none = await save(b.client, ghost());
  expectRejected(none, "학교 B 교사 save_reorder_basis(없는 id)", NOT_FOUND);
  expect(shape(cross), "다른 학교 시약과 없는 id 의 응답이 같음").toEqual(shape(none));
});

test(`[GM-db][S*] 데모 학교 시약 id 로 save_reorder_basis: 학교 A 학생·교사·admin, 학교 B 교사, anon 모두 거부 — 데모 시약 그대로`, async () => {
  const anon = anonClient();
  const before = await anon.from("reagents").select(REAGENT_COLS).eq("school_id", DEMO_SCHOOL_ID).order("id");
  expect(before.error, `데모 시약 조회: ${before.error?.message}`).toBeNull();
  const demo = await guarded(anon, DEMO_SCHOOL_ID, "데모 학교");

  const callers: [string, SupabaseClient, string][] = [
    ["anon", anon, DENIED],
    [ROLE_LABEL.student, (await signIn("student")).client, DENIED],
    [ROLE_LABEL.teacher, (await signIn("teacher")).client, NOT_FOUND],
    [ROLE_LABEL.admin, (await signIn("admin")).client, NOT_FOUND],
    [ROLE_LABEL.schoolB, (await signIn("schoolB")).client, NOT_FOUND],
  ];
  for (const [who, c, code] of callers) {
    await expectDeniedUntouched(c, [demo.safe], `${who} save_reorder_basis(데모 시약)`, code, anon, demo.target);
  }
  const after = await anon.from("reagents").select(REAGENT_COLS).eq("school_id", DEMO_SCHOOL_ID).order("id");
  expect(after.data, "데모 학교 시약(재주문 열)").toEqual(before.data);
});

// ======================================================================
// 성공 경로·학교 분리 — 일회용 학교 (service role 로 준비·정리). 키가 없으면 skip.
// ======================================================================

test.describe("일회용 학교", () => {
  test.describe.configure({ mode: "default" });
  test.skip(!HAS_SERVICE, NO_SERVICE_REASON);

  // ---------- 역할 ----------

  test(`[R-db][S5] 교사·admin 저장 성공(필요량 = 1조 사용량 × 조 수 → min_stock·reorder_per_group·reorder_groups), 학생 ${DENIED}·값 그대로`, async ({}, info) => {
    const f = await fresh(info);
    const r1 = await newReagent(f.teacher, 100);
    const r2 = await newReagent(f.admin, 100);

    // 학생: 같은 학교 시약을 읽지만 저장은 거부
    expect((await readReagent(f.student, r1.id)).id, "전제(양성 대조군): 학생에게 시약이 보임").toBe(r1.id);
    expectRejected(await save(f.student, [{ reagent_id: r1.id, per_group: 3, groups: 6 }]), "학생 save_reorder_basis", DENIED);
    expectRejected(await save(f.student, [{ reagent_id: r1.id, per_group: 3, groups: 6 }, { reagent_id: r2.id, per_group: 1, groups: 1 }]), "학생 save_reorder_basis(2개)", DENIED);
    expect(await readMany(f.teacher, [r1.id, r2.id]), "학생 시도 뒤").toEqual([r1, r2].sort((a, b) => a.id.localeCompare(b.id)));

    // 교사
    const byTeacher = expectSaved(await save(f.teacher, [{ reagent_id: r1.id, per_group: 3, groups: 6 }]), "교사 save_reorder_basis", 1);
    expect(byTeacher.get(r1.id)).toEqual({ reagent_id: r1.id, required: 18, previous_min_stock: 0, outcome: "changed" });
    expect(await readReagent(f.teacher, r1.id), "교사 저장 뒤").toEqual({ ...r1, min_stock: 18, reorder_per_group: 3, reorder_groups: 6 });

    // admin
    const byAdmin = expectSaved(await save(f.admin, [{ reagent_id: r2.id, per_group: 2.5, groups: 4 }]), "admin save_reorder_basis", 1);
    expect(byAdmin.get(r2.id)).toEqual({ reagent_id: r2.id, required: 10, previous_min_stock: 0, outcome: "changed" });
    expect(await readReagent(f.admin, r2.id), "admin 저장 뒤").toEqual({ ...r2, min_stock: 10, reorder_per_group: 2.5, reorder_groups: 4 });

    // 학생에게도 저장된 기준이 그대로 읽힌다 (같은 학교), 다시 시도해도 거부
    expectRejected(await save(f.student, [{ reagent_id: r1.id, per_group: 100, groups: GROUPS_MAX }]), "학생 save_reorder_basis(더 큰 값)", DENIED);
    expect(await readReagent(f.student, r1.id), "학생 시도 뒤").toMatchObject({ min_stock: 18, reorder_per_group: 3, reorder_groups: 6 });
  });

  // ---------- 더 큰 값 유지 (d7 §13 "저장") ----------

  test(`[R-db][S5] 더 큰 값 유지: 소수(0.1 × 3 = 0.3) 정확히 저장 → 더 작은 필요량 'kept'·세 열 그대로 → 같은 필요량 'kept' → 더 큰 필요량 'changed'`, async ({}, info) => {
    const f = await fresh(info);
    const made = await newReagent(f.teacher, 100);
    const id = made.id;

    let res = expectSaved(await save(f.teacher, [{ reagent_id: id, per_group: 0.1, groups: 3 }]), "0.1 × 3", 1);
    expect(res.get(id), "0.1 × 3 = 0.3 (부동소수 오차 없이)").toEqual({ reagent_id: id, required: 0.3, previous_min_stock: 0, outcome: "changed" });
    const first = await readReagent(f.teacher, id);
    expect(first, "0.1 × 3 저장 뒤").toEqual({ ...made, min_stock: 0.3, reorder_per_group: 0.1, reorder_groups: 3 });

    // 더 작은 필요량 → 유지
    res = expectSaved(await save(f.teacher, [{ reagent_id: id, per_group: 0.1, groups: 2 }]), "0.1 × 2", 1);
    expect(res.get(id)).toEqual({ reagent_id: id, required: 0.2, previous_min_stock: 0.3, outcome: "kept" });
    expect(await readReagent(f.teacher, id), "더 작은 필요량 뒤 그대로").toEqual(first);

    // 같은 필요량(같은 값 그대로 · 다른 조합) → 유지, 근거 열도 그대로
    res = expectSaved(await save(f.admin, [{ reagent_id: id, per_group: 0.1, groups: 3 }]), "0.1 × 3 다시", 1);
    expect(res.get(id)).toEqual({ reagent_id: id, required: 0.3, previous_min_stock: 0.3, outcome: "kept" });
    res = expectSaved(await save(f.teacher, [{ reagent_id: id, per_group: 0.15, groups: 2 }]), "0.15 × 2", 1);
    expect(res.get(id)).toEqual({ reagent_id: id, required: 0.3, previous_min_stock: 0.3, outcome: "kept" });
    res = expectSaved(await save(f.teacher, [{ reagent_id: id, per_group: 0.3, groups: 1 }]), "0.3 × 1", 1);
    expect(res.get(id)).toEqual({ reagent_id: id, required: 0.3, previous_min_stock: 0.3, outcome: "kept" });
    expect(await readReagent(f.teacher, id), "같은 필요량 뒤 그대로").toEqual(first);

    // 더 큰 필요량 → 바뀜 (1조 사용량은 작아도 조 수가 많아 필요량이 큼)
    res = expectSaved(await save(f.admin, [{ reagent_id: id, per_group: 0.05, groups: 7 }]), "0.05 × 7", 1);
    expect(res.get(id)).toEqual({ reagent_id: id, required: 0.35, previous_min_stock: 0.3, outcome: "changed" });
    expect(await readReagent(f.teacher, id), "더 큰 필요량 뒤").toEqual({ ...made, min_stock: 0.35, reorder_per_group: 0.05, reorder_groups: 7 });

    // 1조 사용량이 더 커도 필요량이 작으면 유지
    res = expectSaved(await save(f.teacher, [{ reagent_id: id, per_group: 0.3, groups: 1 }]), "0.3 × 1 (필요량은 더 작음)", 1);
    expect(res.get(id)).toEqual({ reagent_id: id, required: 0.3, previous_min_stock: 0.35, outcome: "kept" });
    expect(await readReagent(f.teacher, id)).toMatchObject({ min_stock: 0.35, reorder_per_group: 0.05, reorder_groups: 7 });
  });

  test(`[R-db][S5] 근거 없이 기준만 있는 시약(min_stock 직접 지정): 필요량이 작거나 같으면 'kept'·근거 열 null 그대로, 크면 'changed'`, async ({}, info) => {
    const f = await fresh(info);
    const made = await newReagent(f.teacher, 100);
    const id = made.id;
    const up = await f.teacher.from("reagents").update({ min_stock: 10 }).eq("id", id).select("id");
    expect(up.error, `준비: min_stock 직접 지정 (${up.error?.message})`).toBeNull();
    const base = await readReagent(f.teacher, id);
    expect(base, "전제").toMatchObject({ min_stock: 10, reorder_per_group: null, reorder_groups: null });

    let res = expectSaved(await save(f.teacher, [{ reagent_id: id, per_group: 3, groups: 3 }]), "3 × 3 = 9 < 10", 1);
    expect(res.get(id)).toEqual({ reagent_id: id, required: 9, previous_min_stock: 10, outcome: "kept" });
    res = expectSaved(await save(f.teacher, [{ reagent_id: id, per_group: 5, groups: 2 }]), "5 × 2 = 10 = 10", 1);
    expect(res.get(id)).toEqual({ reagent_id: id, required: 10, previous_min_stock: 10, outcome: "kept" });
    expect(await readReagent(f.teacher, id), "유지 뒤 그대로 (근거 열 null)").toEqual(base);

    res = expectSaved(await save(f.teacher, [{ reagent_id: id, per_group: 5.5, groups: 2 }]), "5.5 × 2 = 11 > 10", 1);
    expect(res.get(id)).toEqual({ reagent_id: id, required: 11, previous_min_stock: 10, outcome: "changed" });
    expect(await readReagent(f.teacher, id)).toEqual({ ...base, min_stock: 11, reorder_per_group: 5.5, reorder_groups: 2 });
  });

  // ---------- 여러 시약 ----------

  test(`[R-db][S5] 여러 시약을 한 번에: 일부 'changed'·일부 'kept', 목록에 없는 시약은 그대로`, async ({}, info) => {
    const f = await fresh(info);
    const a = await newReagent(f.teacher, 100);
    const b = await newReagent(f.teacher, 100);
    const c = await newReagent(f.teacher, 100);
    const untouched = await newReagent(f.teacher, 100);
    expectSaved(await save(f.teacher, [{ reagent_id: b.id, per_group: 5, groups: 4 }]), "준비: b 기준 20", 1);
    const bBefore = await readReagent(f.teacher, b.id);

    const res = expectSaved(
      await save(f.teacher, [
        { reagent_id: a.id, per_group: 2, groups: 6 },
        { reagent_id: b.id, per_group: 3, groups: 6 },
        { reagent_id: c.id, per_group: 0.5, groups: GROUPS_MIN },
      ]),
      "3개 한 번에",
      3,
    );
    expect(res.get(a.id)).toEqual({ reagent_id: a.id, required: 12, previous_min_stock: 0, outcome: "changed" });
    expect(res.get(b.id)).toEqual({ reagent_id: b.id, required: 18, previous_min_stock: 20, outcome: "kept" });
    expect(res.get(c.id)).toEqual({ reagent_id: c.id, required: 0.5, previous_min_stock: 0, outcome: "changed" });

    expect(await readReagent(f.teacher, a.id)).toEqual({ ...a, min_stock: 12, reorder_per_group: 2, reorder_groups: 6 });
    expect(await readReagent(f.teacher, b.id), "kept 는 그대로").toEqual(bBefore);
    expect(await readReagent(f.teacher, c.id)).toEqual({ ...c, min_stock: 0.5, reorder_per_group: 0.5, reorder_groups: GROUPS_MIN });
    expect(await readReagent(f.teacher, untouched.id), "목록에 없는 시약").toEqual(untouched);
  });

  test(`[R-db][S5] 한 번에 ${ITEMS_MAX}개 허용, ${ITEMS_MAX + 1}개는 ${INVALID}·전부 그대로`, async ({}, info) => {
    const f = await fresh(info);
    const made: Reagent[] = [];
    for (let i = 0; i < ITEMS_MAX + 1; i++) made.push(await newReagent(f.teacher, 100));
    const ids = made.map((r) => r.id);
    const byId = (rows: Reagent[]) => [...rows].sort((x, y) => x.id.localeCompare(y.id));
    const itemOf = (r: Reagent, i: number): Item => ({ reagent_id: r.id, per_group: i + 1, groups: 2 });

    expectRejected(await save(f.teacher, made.map(itemOf)), `${ITEMS_MAX + 1}개`, INVALID);
    expect(await readMany(f.teacher, ids), `${ITEMS_MAX + 1}개 거부 뒤 전부 그대로`).toEqual(byId(made));

    const res = expectSaved(await save(f.teacher, made.slice(0, ITEMS_MAX).map(itemOf)), `${ITEMS_MAX}개`, ITEMS_MAX);
    const after = new Map((await readMany(f.teacher, ids)).map((r) => [r.id, r]));
    made.slice(0, ITEMS_MAX).forEach((r, i) => {
      expect(res.get(r.id), `${i + 1}번째 결과`).toEqual({ reagent_id: r.id, required: (i + 1) * 2, previous_min_stock: 0, outcome: "changed" });
      expect(after.get(r.id), `${i + 1}번째 시약`).toEqual({ ...r, min_stock: (i + 1) * 2, reorder_per_group: i + 1, reorder_groups: 2 });
    });
    expect(after.get(made[ITEMS_MAX].id), "목록에 넣지 않은 시약").toEqual(made[ITEMS_MAX]);
  });

  // ---------- 알림 날짜 (d7 §11 · §13 "low_stock_since 는 §11 트리거가 맞춘다") ----------

  test(`[R-db][S5] 저장 뒤 stock < min_stock 이면 low_stock_since 가 생기고 화면 6 알림 대상이 됨, stock ≥ min_stock 이면 null, 'kept' 는 알림 시각을 바꾸지 않음`, async ({}, info) => {
    const f = await fresh(info);
    const low = await newReagent(f.teacher, 5);
    const equal = await newReagent(f.teacher, 6);
    const plenty = await newReagent(f.teacher, 100);
    expect(await alertIds(f.teacher), "전제: 알림 대상 0").toEqual([]);

    const res = expectSaved(
      await save(f.teacher, [
        { reagent_id: low.id, per_group: 1, groups: 6 },
        { reagent_id: equal.id, per_group: 1, groups: 6 },
        { reagent_id: plenty.id, per_group: 1, groups: 6 },
      ]),
      "1 × 6 저장",
      3,
    );
    for (const r of [low, equal, plenty]) expect(res.get(r.id)?.outcome, r.name).toBe("changed");

    const lowAfter = await readReagent(f.teacher, low.id);
    expect(lowAfter, "stock 5 < 필요량 6").toMatchObject({ stock: 5, min_stock: 6, reorder_per_group: 1, reorder_groups: 6 });
    expectNearNow(lowAfter.low_stock_since, "stock 5 < 필요량 6");
    expect(await readReagent(f.teacher, equal.id), "stock 6 = 필요량 6 은 부족이 아님").toMatchObject({ stock: 6, min_stock: 6, low_stock_since: null });
    expect(await readReagent(f.teacher, plenty.id), "stock 100 ≥ 필요량 6").toMatchObject({ stock: 100, min_stock: 6, low_stock_since: null });

    // 화면 6 조회 대상 (교사·admin 모두 같은 목록)
    expect(await alertIds(f.teacher), "교사의 알림 대상").toEqual([low.id]);
    expect(await alertIds(f.admin), "admin 의 알림 대상").toEqual([low.id]);
    const since = await f.admin.from("reagents").select("id").not("low_stock_since", "is", null);
    expect((since.data ?? []).map((x) => x.id), "low_stock_since 가 있는 시약").toEqual([low.id]);

    // 유지('kept')는 알림 시각을 건드리지 않는다
    await sleep(1_200);
    const kept = expectSaved(await save(f.admin, [{ reagent_id: low.id, per_group: 1, groups: 5 }]), "1 × 5 (더 작음)", 1);
    expect(kept.get(low.id)?.outcome).toBe("kept");
    expect(await readReagent(f.teacher, low.id), "kept 뒤 그대로").toEqual(lowAfter);

    // 이미 부족한 시약의 기준이 더 커져도 알림 시각은 유지 (d7 §11 "이미 부족한 상태가 이어지면 유지")
    const more = expectSaved(await save(f.admin, [{ reagent_id: low.id, per_group: 2, groups: 6 }]), "2 × 6 (더 큼)", 1);
    expect(more.get(low.id)).toEqual({ reagent_id: low.id, required: 12, previous_min_stock: 6, outcome: "changed" });
    expect(await readReagent(f.teacher, low.id)).toEqual({ ...lowAfter, min_stock: 12, reorder_per_group: 2, reorder_groups: 6 });

    // 넉넉하던 시약도 기준이 재고를 넘으면 알림 대상이 된다
    const now = expectSaved(await save(f.teacher, [{ reagent_id: plenty.id, per_group: 50.5, groups: 2 }]), "50.5 × 2 = 101 > 100", 1);
    expect(now.get(plenty.id)).toEqual({ reagent_id: plenty.id, required: 101, previous_min_stock: 6, outcome: "changed" });
    expectNearNow((await readReagent(f.teacher, plenty.id)).low_stock_since, "stock 100 < 필요량 101");
    expect((await alertIds(f.teacher)).sort(), "알림 대상 2건").toEqual([low.id, plenty.id].sort());
    // 학생에게 저장 권한은 없지만 같은 학교 시약의 부족 표시는 같은 값으로 읽힌다 (홈의 재고 부족과 같은 기준)
    expect((await alertIds(f.student)).sort()).toEqual([low.id, plenty.id].sort());
  });

  // ---------- 경계값 ----------

  test(`[R-db][S5] 경계값 허용: per_group ${PER_GROUP_MAX}·groups ${GROUPS_MAX}·groups ${GROUPS_MIN}·아주 작은 per_group, 바로 밖은 ${INVALID}`, async ({}, info) => {
    const f = await fresh(info);
    const a = await newReagent(f.teacher, 1);
    const b = await newReagent(f.teacher, 1);
    const c = await newReagent(f.teacher, 1);

    let res = expectSaved(await save(f.teacher, [{ reagent_id: a.id, per_group: 0.001, groups: GROUPS_MIN }]), "per_group 0.001", 1);
    expect(res.get(a.id)).toEqual({ reagent_id: a.id, required: 0.001 * GROUPS_MIN, previous_min_stock: 0, outcome: "changed" });
    expect(await readReagent(f.teacher, a.id)).toMatchObject({ min_stock: 0.001 * GROUPS_MIN, reorder_per_group: 0.001, reorder_groups: GROUPS_MIN });

    res = expectSaved(await save(f.teacher, [{ reagent_id: b.id, per_group: PER_GROUP_MAX, groups: GROUPS_MAX }]), "최대 × 최대", 1);
    expect(res.get(b.id)).toEqual({ reagent_id: b.id, required: PER_GROUP_MAX * GROUPS_MAX, previous_min_stock: 0, outcome: "changed" });
    expect(await readReagent(f.teacher, b.id)).toMatchObject({
      min_stock: PER_GROUP_MAX * GROUPS_MAX,
      reorder_per_group: PER_GROUP_MAX,
      reorder_groups: GROUPS_MAX,
    });

    // admin 도 같은 규칙
    res = expectSaved(await save(f.admin, [{ reagent_id: c.id, per_group: 1.5, groups: 6 }]), "admin 1.5 × 6", 1);
    expect(res.get(c.id)).toEqual({ reagent_id: c.id, required: 9, previous_min_stock: 0, outcome: "changed" });
    const cAfter = await readReagent(f.teacher, c.id);
    expect(cAfter).toMatchObject({ min_stock: 9, reorder_per_group: 1.5, reorder_groups: 6 });

    // 바로 밖
    for (const [what, item] of [
      [`per_group ${PER_GROUP_MAX + 1}`, { reagent_id: c.id, per_group: PER_GROUP_MAX + 1, groups: GROUPS_MIN }],
      [`groups ${GROUPS_MAX + 1}`, { reagent_id: c.id, per_group: 100, groups: GROUPS_MAX + 1 }],
      [`groups ${GROUPS_MIN - 1}`, { reagent_id: c.id, per_group: 100, groups: GROUPS_MIN - 1 }],
    ] as [string, Item][]) {
      expectRejected(await save(f.teacher, [item]), what, INVALID);
    }
    expect(await readReagent(f.teacher, c.id), "거부 뒤 그대로").toEqual(cAfter);
  });

  // ---------- 잘못된 입력 (자기 학교 시약 id 로) ----------

  test(`[R-db][S5] 일회용 교사·admin: 잘못된 입력 전부 ${INVALID}·값 그대로, 올바른 항목과 섞여 있어도 전체 거부(아무것도 바뀌지 않음)`, async ({}, info) => {
    const f = await fresh(info);
    const target = await newReagent(f.teacher, 100);
    const mate = await newReagent(f.teacher, 100);
    const both = () => readMany(f.teacher, [target.id, mate.id]);
    const before = await both();

    for (const [who, c] of [["교사", f.teacher], ["admin", f.admin]] as [string, SupabaseClient][]) {
      for (const [what, items] of invalidInputs(target.id, 3)) {
        expectRejected(await save(c, items), `${who} save_reorder_basis(${what})`, INVALID);
      }
      expect(await both(), `${who} 의 잘못된 입력 뒤`).toEqual(before);
    }

    // 올바른 항목(바뀌었을 값) + 잘못된 항목 → 전체 거부. 순서를 바꿔도 같다
    const good: Item = { reagent_id: mate.id, per_group: 7, groups: 7 };
    const bads: [string, Item][] = [
      ["per_group 0", { reagent_id: target.id, per_group: 0, groups: 6 }],
      [`groups ${GROUPS_MAX + 1}`, { reagent_id: target.id, per_group: 1, groups: GROUPS_MAX + 1 }],
      ["groups 2.5", { reagent_id: target.id, per_group: 1, groups: 2.5 }],
      ["reagent_id 형식", { reagent_id: "not-a-uuid", per_group: 1, groups: 6 }],
      ["같은 시약 두 번", { reagent_id: mate.id, per_group: 9, groups: 9 }],
    ];
    for (const [what, bad] of bads) {
      expectRejected(await save(f.teacher, [good, bad]), `올바른 항목 + ${what}`, INVALID);
      expectRejected(await save(f.teacher, [bad, good]), `${what} + 올바른 항목`, INVALID);
    }
    expect(await both(), "섞인 입력 뒤 전부 그대로").toEqual(before);
  });

  // ---------- 학교 분리 ----------

  test(`[N1-db][S5] 일회용 학교 A' ↔ B': 다른 학교 시약 id 가 섞이면 ${NOT_FOUND} (없는 id 와 같은 응답)·자기 학교 항목까지 전체 미변경 — 양방향·순서 무관`, async ({}, info) => {
    const f = await fresh(info);
    const mineA = await newReagent(f.teacher, 100);
    const mineB = await newReagent(f.otherTeacher, 100);
    expect(mineA.school_id).toBe(f.school.id);
    expect(mineB.school_id).toBe(f.other.id);
    const stateA = () => readReagent(f.admin, mineA.id);
    const stateB = () => readReagent(f.otherAdmin, mineB.id);

    const dirs: [string, SupabaseClient, Reagent, Reagent][] = [
      ["A' 교사", f.teacher, mineA, mineB],
      ["A' admin", f.admin, mineA, mineB],
      ["B' 교사", f.otherTeacher, mineB, mineA],
      ["B' admin", f.otherAdmin, mineB, mineA],
    ];
    for (const [who, c, own, foreign] of dirs) {
      const seen = await c.from("reagents").select("id").eq("id", foreign.id);
      expect(seen.error ? [] : seen.data ?? [], `전제: ${who} 에게 다른 학교 시약은 0행`).toHaveLength(0);

      const ownItem: Item = { reagent_id: own.id, per_group: 4, groups: 5 };
      const foreignItem: Item = { reagent_id: foreign.id, per_group: 4, groups: 5 };
      const ghostItem = (): Item => ({ reagent_id: randomUUID(), per_group: 4, groups: 5 });

      const only = await save(c, [foreignItem]);
      expectRejected(only, `${who}: 다른 학교 시약만`, NOT_FOUND);
      const none = await save(c, [ghostItem()]);
      expectRejected(none, `${who}: 없는 id 만`, NOT_FOUND);
      expect(shape(only), `${who}: 다른 학교 시약과 없는 id 의 응답이 같음 (존재 여부 비노출)`).toEqual(shape(none));
      expect(JSON.stringify(only.error), `${who}: 오류에 다른 학교 시약 이름·id 가 없음`).not.toContain(foreign.name);
      expect(JSON.stringify(only.error)).not.toContain(foreign.id);

      const first = await save(c, [foreignItem, ownItem]);
      expectRejected(first, `${who}: 다른 학교 시약 + 자기 학교 시약`, NOT_FOUND);
      const last = await save(c, [ownItem, foreignItem]);
      expectRejected(last, `${who}: 자기 학교 시약 + 다른 학교 시약`, NOT_FOUND);
      const mixedGhost = await save(c, [ownItem, ghostItem()]);
      expectRejected(mixedGhost, `${who}: 자기 학교 시약 + 없는 id`, NOT_FOUND);
      expect(shape(last), `${who}: 섞인 경우도 응답이 같음`).toEqual(shape(mixedGhost));

      expect(await stateA(), `${who} 시도 뒤 A' 시약`).toEqual(mineA);
      expect(await stateB(), `${who} 시도 뒤 B' 시약`).toEqual(mineB);
    }

    // 양성 대조군: 같은 항목이 자기 학교에서는 저장된다 — 그리고 그 저장은 다른 학교 시약에 닿지 않는다
    const ok = expectSaved(await save(f.teacher, [{ reagent_id: mineA.id, per_group: 4, groups: 5 }]), "A' 교사: 자기 학교 시약", 1);
    expect(ok.get(mineA.id)?.outcome).toBe("changed");
    expect(await stateA()).toEqual({ ...mineA, min_stock: 20, reorder_per_group: 4, reorder_groups: 5 });
    expect(await stateB(), "A' 저장 뒤 B' 시약").toEqual(mineB);
  });

  test(`[N1-db][S5] 일회용 학교 ↔ 공용 학교 A·B: 서로의 시약 id 는 ${NOT_FOUND}·전체 미변경 (공용 시약 id 는 첫 항목·필요량은 지금 기준 이하)`, async ({}, info) => {
    const f = await fresh(info);
    const mine = await newReagent(f.teacher, 100);
    const t = await signIn("teacher");
    const b = await signIn("schoolB");
    const inA = await guarded(t.client, t.schoolId, "학교 A");
    const inB = await guarded(b.client, b.schoolId, "학교 B");
    const ownItem: Item = { reagent_id: mine.id, per_group: 4, groups: 5 };

    // 일회용 교사·admin → 공용 학교 시약 (+ 자기 학교 항목)
    for (const [who, c] of [["일회용 교사", f.teacher], ["일회용 admin", f.admin]] as [string, SupabaseClient][]) {
      for (const [school, g, reader] of [["학교 A", inA, t.client], ["학교 B", inB, b.client]] as [string, typeof inA, SupabaseClient][]) {
        await expectDeniedUntouched(c, [g.safe], `${who} save_reorder_basis(${school} 시약)`, NOT_FOUND, reader, g.target);
        await expectDeniedUntouched(c, [g.safe, ownItem], `${who} save_reorder_basis(${school} 시약 + 자기 학교 시약)`, NOT_FOUND, reader, g.target);
      }
      expect(await readReagent(f.teacher, mine.id), `${who} 시도 뒤 자기 학교 시약`).toEqual(mine);
    }

    // 공용 학교 교사·admin → 일회용 학교 시약 (없는 id 와 같은 응답)
    for (const role of ["teacher", "admin", "schoolB"] as Role[]) {
      const s = await signIn(role);
      const cross = await save(s.client, [ownItem]);
      expectRejected(cross, `${ROLE_LABEL[role]} save_reorder_basis(일회용 학교 시약)`, NOT_FOUND);
      const none = await save(s.client, [{ reagent_id: randomUUID(), per_group: 4, groups: 5 }]);
      expect(shape(cross), `${ROLE_LABEL[role]}: 다른 학교 시약과 없는 id 의 응답이 같음`).toEqual(shape(none));
    }
    expectRejected(await save((await signIn("student")).client, [ownItem]), "학교 A 학생 save_reorder_basis(일회용 학교 시약)", DENIED);
    expectRejected(await save(anonClient(), [ownItem]), "anon save_reorder_basis(일회용 학교 시약)", DENIED);
    expect(await readReagent(f.teacher, mine.id), "다른 학교·anon 시도 뒤").toEqual(mine);
  });

  // ---------- 데모 학교 ----------

  test(`[GM-db][S*] 데모 학교 시약 id 로 save_reorder_basis: 일회용 admin·교사·학생 모두 거부(자기 학교 항목과 섞어도 전체 미변경) — 데모 시약 그대로`, async ({}, info) => {
    const f = await fresh(info);
    const anon = anonClient();
    const mine = await newReagent(f.teacher, 100);
    const before = await anon.from("reagents").select(REAGENT_COLS).eq("school_id", DEMO_SCHOOL_ID).order("id");
    expect(before.error, `데모 시약 조회: ${before.error?.message}`).toBeNull();
    const demo = await guarded(anon, DEMO_SCHOOL_ID, "데모 학교");
    const ownItem: Item = { reagent_id: mine.id, per_group: 4, groups: 5 };

    for (const [who, c, code] of [["일회용 admin", f.admin, NOT_FOUND], ["일회용 교사", f.teacher, NOT_FOUND], ["일회용 학생", f.student, DENIED]] as [string, SupabaseClient, string][]) {
      await expectDeniedUntouched(c, [demo.safe], `${who} save_reorder_basis(데모 시약)`, code, anon, demo.target);
      await expectDeniedUntouched(c, [demo.safe, ownItem], `${who} save_reorder_basis(데모 시약 + 자기 학교 시약)`, code, anon, demo.target);
    }
    expect(await readReagent(f.teacher, mine.id), "자기 학교 시약").toEqual(mine);
    const after = await anon.from("reagents").select(REAGENT_COLS).eq("school_id", DEMO_SCHOOL_ID).order("id");
    expect(after.data, "데모 학교 시약(재주문 열)").toEqual(before.data);
  });
});
