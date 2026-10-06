// [R-db][S11] · [R-db][S3] · [N1-db][S11] · [N1-db][S3] · [GM-db][S*]
// 시약장 번호 · 시약 칸 배치(place_reagent) · reagents.slot_id 직접 쓰기 차단 · 재주문 기준 직접 입력(set_reorder_threshold).
// 실제 RLS·함수 (publishable/anon 키 + 각 계정 로그인)로 판정한다.
// 기준: harness/d7-data.md §14 (2026-10-06) · §9 · §11 · §5, harness/d5-gates.md R-db·N1-db·GM-db,
//       design/rules.json 1.15 cabinet(number·class_mismatch·slot_assign_roles·incompatible·default_name)·reorder.threshold_edit·roles R5·R7.
//       오류 형태(errcode·message)는 supabase/migrations/20261006150000_cabinet_number_placement.sql 머리말 표.
//
// 절대 규칙 (운영 DB):
// - 공용 학교 A·B·데모 학교의 시약장(number 포함)·칸·시약(slot_id·min_stock 포함)을 바꾸지 않는다.
//   공용 계정으로는 읽기와 "거부되어야 하는 호출"만 한다 — 그것도 "혹시 통과해도 아무것도 안 바뀌는" 인자
//   (없는 id · 지금 칸 그대로 · 지금 기준 그대로)로만 겨눈다.
// - 성공 경로·잘못된 인자 검사는 일회용 학교의 일회용 계정으로만 한다 (screen-8-helpers: service role 로 계정·학교 생성).
//   service role 은 준비·정리·대조 조회에만 쓴다. 판정 대상 호출은 항상 로그인 세션(publishable 키) 또는 anon 이다.
//   예외 하나: 번호 고정 트리거·unique 제약(DB 무결성)은 API 역할로는 닿지 않으므로(직접 쓰기 정책 = 거부)
//   일회용 학교에서 service role 로 확인한다 — RLS 판정이 아니라 "어느 경로로 써도 번호가 바뀌지 않는다" 판정.
// - 정리 순서: 시약 → 시약장(칸 cascade) → 프로필 → 계정 → 학교. 끝에 잔여물 0 을 단언한다.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type TestInfo } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { placementWarnings } from "../../lib/cabinet-rules";
import { ROLE_LABEL, anonClient, signIn, type Role, type Session } from "./db-helpers";
import { autoFromIntake, withoutAutoDrift } from "./reorder-auto-helpers";
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

// ---------- 규칙 (design/rules.json · d7 §14) ----------

const rules = JSON.parse(readFileSync(join(process.cwd(), "design", "rules.json"), "utf8")) as {
  cabinet: {
    door_types: string[];
    shelves: number[];
    storage_classes: string[];
    incompatible: string[][];
    default_name: string;
    manage_roles: string[];
    slot_assign_roles: string[];
    number: string;
    class_mismatch: string;
  };
  reorder: { threshold_edit: string };
  roles: Record<string, { role?: string; components?: string[]; max?: number }>;
};
const CAB = rules.cabinet;
const CLASSES = CAB.storage_classes;
const DOUBLE = "양문형";
const SINGLE = "단문형";
const MAX_SHELVES = Math.max(...CAB.shelves);
const MIN_SHELVES = Math.min(...CAB.shelves);
/** d7 §9 "추가": 학교당 최대 20개 */
const CABINET_MAX = 20;
/** d7 §14 set_reorder_threshold: 0 이상(0 = 알림 없음). 상한 1,000,000 (마이그레이션 머리말 · 작업 지시) */
const THRESHOLD_MAX = 1_000_000;

const defaultName = (n: number) => CAB.default_name.replace("{n}", String(n));
/** 규칙의 분류 이름 (rules.json 에 없으면 즉시 실패 — 테스트가 규칙과 어긋나지 않게) */
const K = (name: string): string => {
  if (!CLASSES.includes(name)) throw new Error(`rules.json cabinet.storage_classes 에 '${name}' 없음`);
  return name;
};
const isIncompatible = (a: string, b: string) => CAB.incompatible.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

const GROUP = "s3s11pl";
const SUCCESS_TIMEOUT = 420_000;
const NO_SERVICE_REASON =
  "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)";

/** 데모 학교 고정 id — lib/supabase/demo-data.ts (server-only 모듈이라 소스 텍스트에서 읽는다) */
const DEMO_SCHOOL_ID = (() => {
  const src = readFileSync(join(process.cwd(), "lib", "supabase", "demo-data.ts"), "utf8");
  const m = src.match(/export const DEMO_SCHOOL_ID\s*=\s*"([0-9a-f-]{36})"/);
  if (!m) throw new Error("lib/supabase/demo-data.ts 에서 DEMO_SCHOOL_ID 를 찾지 못했습니다");
  return m[1];
})();

type Row = Record<string, unknown>;
type RpcError = { code?: string; message: string; details?: string | null; hint?: string | null };
type RpcResult = { data: unknown; error: RpcError | null };
type Warning = "none" | "mismatch" | "incompatible";

async function rpc(client: SupabaseClient, fn: string, args: Row = {}): Promise<RpcResult> {
  const res = await client.rpc(fn, args);
  return { data: res.data, error: res.error };
}

const place = (c: SupabaseClient, reagentId: unknown, slotId: unknown) =>
  rpc(c, "place_reagent", { p_reagent_id: reagentId, p_slot_id: slotId });
const setThreshold = (c: SupabaseClient, reagentId: unknown, value: unknown) =>
  rpc(c, "set_reorder_threshold", { p_reagent_id: reagentId, p_min_stock: value });
const addCabinet = (c: SupabaseClient) => rpc(c, "add_cabinet");
const renameCabinet = (c: SupabaseClient, id: unknown, label: unknown) => rpc(c, "rename_cabinet", { p_cabinet_id: id, p_label: label });
const deleteCabinet = (c: SupabaseClient, id: unknown) => rpc(c, "delete_cabinet", { p_cabinet_id: id });
const saveLayout = (c: SupabaseClient, id: unknown, door: unknown, shelves: unknown, slots: unknown) =>
  rpc(c, "save_cabinet_layout", { p_cabinet_id: id, p_door_type: door, p_shelves: shelves, p_slots: slots });

function firstRow(data: unknown): Row | null {
  if (Array.isArray(data)) return (data[0] as Row | undefined) ?? null;
  return (data as Row | null) ?? null;
}

function rowsOf(data: unknown): Row[] {
  if (Array.isArray(data)) return data as Row[];
  return data ? [data as Row] : [];
}

/** DB 가 거부했는지: 오류가 있고, PostgREST 의 "함수·인자 못 찾음"(PGRST…)이 아니며, 반환 값이 없다. code·message 는 정확히. */
function expectRejected(res: RpcResult, what: string, code?: string, message?: string): void {
  expect(res.error, `${what} 는 오류여야 함 (반환: ${JSON.stringify(res.data)})`).not.toBeNull();
  expect(String(res.error?.code ?? ""), `${what}: ${res.error?.message}`).not.toMatch(/^PGRST/);
  expect(rowsOf(res.data), `${what} 반환 값`).toHaveLength(0);
  if (code) expect(res.error?.code, `${what} errcode (${res.error?.message})`).toBe(code);
  if (message) expect(res.error?.message, `${what} message`).toBe(message);
}

function expectOk(res: RpcResult, what: string): Row {
  expect(res.error, `${what}: ${res.error?.code} ${res.error?.message} ${res.error?.details ?? ""}`).toBeNull();
  const row = firstRow(res.data);
  expect(row, `${what} 반환 값`).not.toBeNull();
  return row!;
}

/** 존재 여부 비노출 비교용: 오류의 겉모습 */
function errorShape(res: RpcResult): Row {
  return { code: res.error?.code ?? null, message: res.error?.message ?? null, details: res.error?.details ?? null, hint: res.error?.hint ?? null };
}

/** 바뀐 행 수: RLS 로 안 보이면 error 없이 0행, 권한이 없으면 오류 — 어느 쪽이든 0 이어야 한다 */
function changed(res: { error: unknown; data: unknown[] | null }): number {
  return res.error ? 0 : (res.data ?? []).length;
}

const num = (v: unknown) => (v === null || v === undefined ? v : Number(v));
const omit = (row: Row, keys: string[]): Row => Object.fromEntries(Object.entries(row).filter(([k]) => !keys.includes(k)));

// ======================================================================
// 공용 학교 A·B·데모 학교 상태 (읽기만)
// ======================================================================

type SharedState = { cabinets: Row[]; slots: Row[]; placed: Row[]; thresholds: Row[] };

/**
 * 한 학교의 시약장(number 포함 전체 열)·칸·배치된 시약(id, slot_id)·시약 기준(min_stock·근거 열).
 * 시약 기준은 "앞뒤 모두 있는 시약"끼리 비교한다 — 다른 스펙이 학교 A 에 잠깐 만드는 임시 시약에 흔들리지 않게.
 */
async function sharedOf(client: SupabaseClient, schoolId: string): Promise<SharedState> {
  const [cabinets, slots, placed, thresholds] = await Promise.all([
    client.from("cabinets").select("*").eq("school_id", schoolId).order("id"),
    client.from("cabinet_slots").select("*").eq("school_id", schoolId).order("id"),
    client.from("reagents").select("id, slot_id").eq("school_id", schoolId).not("slot_id", "is", null).order("id"),
    client.from("reagents").select("id, slot_id, min_stock, reorder_per_group, reorder_groups, min_stock_source").eq("school_id", schoolId).order("id"),
  ]);
  for (const q of [cabinets, slots, placed, thresholds]) expect(q.error, `공용 학교 조회: ${q.error?.message}`).toBeNull();
  return {
    cabinets: (cabinets.data ?? []) as Row[],
    slots: (slots.data ?? []) as Row[],
    placed: (placed.data ?? []) as Row[],
    thresholds: (thresholds.data ?? []) as Row[],
  };
}

function expectSharedSame(now: SharedState, before: SharedState, what: string): void {
  expect(now.cabinets, `${what}: 시약장(number 포함)`).toEqual(before.cabinets);
  expect(now.slots, `${what}: 칸`).toEqual(before.slots);
  expect(now.placed, `${what}: 배치(slot_id)`).toEqual(before.placed);
  const prev = new Map(before.thresholds.map((r) => [r.id, r]));
  const common = now.thresholds.filter((r) => prev.has(r.id));
  expect(common.length, `${what}: 앞뒤 모두 있는 시약 ≥ 1`).toBeGreaterThan(0);
  // 출처가 'auto' 인 시약의 min_stock 은 다른 스펙의 사용·입고 기록으로 DB 가 다시 계산한다(d7 §11-1) — 그 값만 빼고 견준다(출처는 견준다)
  expect(common.map(withoutAutoDrift), `${what}: 시약 slot_id·min_stock·근거 열·출처`).toEqual(common.map((r) => withoutAutoDrift(prev.get(r.id)!)));
}

const stateA = async () => {
  const t = await signIn("teacher");
  return sharedOf(t.client, t.schoolId);
};
const stateB = async () => {
  const b = await signIn("schoolB");
  return sharedOf(b.client, b.schoolId);
};
const stateDemo = () => sharedOf(anonClient(), DEMO_SCHOOL_ID);

/** 공용 학교의 "배치된 시약 하나 + 그 칸" (통과해도 안 바뀌는 인자 = 지금 칸 그대로) */
function placedTarget(st: SharedState, what: string): { reagentId: string; slotId: string; minStock: unknown } {
  const p = st.placed[0];
  expect(p, `${what}: 배치된 시약 ≥1 (seed)`).toBeTruthy();
  const t = st.thresholds.find((r) => r.id === p.id)!;
  return { reagentId: p.id as string, slotId: p.slot_id as string, minStock: t.min_stock };
}

// ======================================================================
// 일회용 학교
// ======================================================================

interface Fixture {
  school: TempSchool;
  other: TempSchool;
  teacherUser: TempUser;
  studentUser: TempUser;
  admin: SupabaseClient;
  teacher: SupabaseClient;
  student: SupabaseClient;
  otherAdmin: SupabaseClient;
}

let fixtureCache: Promise<Fixture> | null = null;

/** 워커당 한 번: 일회용 학교(admin·교사·학생) + 다른 일회용 학교(admin) */
function fixture(info: TestInfo): Promise<Fixture> {
  fixtureCache ??= (async () => {
    const school = await tempSchool(info, GROUP);
    const teacherUser = await addMember(school, info, GROUP, "교사");
    const studentUser = await addMember(school, info, GROUP, "학생");
    const admin = await clientFor(school.admin);
    const up = await rpc(admin, "change_member_role", { p_user_id: teacherUser.id, p_role: "teacher" });
    expect(up.error, `일회용 교사 역할 지정: ${up.error?.message}`).toBeNull();
    expect((await profileByService(teacherUser.id))?.role).toBe("teacher");
    expect((await profileByService(studentUser.id))?.role).toBe("student");
    const other = await tempSchool(info, GROUP);
    return {
      school,
      other,
      teacherUser,
      studentUser,
      admin,
      teacher: await clientFor(teacherUser),
      student: await clientFor(studentUser),
      otherAdmin: await clientFor(other.admin),
    };
  })();
  fixtureCache.catch(() => {
    fixtureCache = null;
  });
  return fixtureCache;
}

/**
 * 일회용 학교의 시약·시약장을 비우고(service role — 준비), 이 일회용 학교의 cabinet_seq 만 0 으로 되돌린다
 * (테스트마다 "새 학교"에서 시작 — 번호를 다시 쓰지 않는지는 각 테스트 안에서, 되돌리지 않은 상태로 본다).
 */
async function purge(schoolIds: string[]): Promise<void> {
  const sb = service();
  const r = await sb.from("reagents").delete().in("school_id", schoolIds);
  expect(r.error, `일회용 학교 시약 정리: ${r.error?.message}`).toBeNull();
  const c = await sb.from("cabinets").delete().in("school_id", schoolIds);
  expect(c.error, `일회용 학교 시약장 정리: ${c.error?.message}`).toBeNull();
  const s = await sb.from("schools").update({ cabinet_seq: 0 }).in("id", schoolIds).like("neis_code", "S8UI-%").select("id");
  expect(s.error, `일회용 학교 cabinet_seq 되돌리기: ${s.error?.message}`).toBeNull();
  expect((s.data ?? []).length, "되돌린 학교 = 일회용 학교만").toBe(schoolIds.length);
}

async function fresh(info: TestInfo): Promise<Fixture> {
  test.setTimeout(SUCCESS_TIMEOUT);
  const f = await fixture(info);
  await purge([f.school.id, f.other.id]);
  return f;
}

type TempState = { cabinets: Row[]; slots: Row[]; reagents: Row[]; seq: number };

/** 대조 조회 (service role): 일회용 학교의 시약장·칸·시약 전체 열 + cabinet_seq */
async function tempState(schoolId: string): Promise<TempState> {
  const sb = service();
  const [cabinets, slots, reagents, school] = await Promise.all([
    sb.from("cabinets").select("*").eq("school_id", schoolId).order("number"),
    sb.from("cabinet_slots").select("*").eq("school_id", schoolId).order("id"),
    sb.from("reagents").select("*").eq("school_id", schoolId).order("id"),
    sb.from("schools").select("cabinet_seq").eq("id", schoolId).single(),
  ]);
  for (const q of [cabinets, slots, reagents, school]) expect(q.error, `대조 조회: ${q.error?.message}`).toBeNull();
  return {
    cabinets: (cabinets.data ?? []) as Row[],
    slots: (slots.data ?? []) as Row[],
    reagents: (reagents.data ?? []) as Row[],
    seq: Number(school.data?.cabinet_seq),
  };
}

const slotKey = (s: Row) => `${s.side}${s.shelf}`;
function slotAt(st: TempState, cabinetId: string, key: string): Row {
  const s = st.slots.find((x) => x.cabinet_id === cabinetId && slotKey(x) === key);
  if (!s) throw new Error(`칸 ${key} 행이 없음`);
  return s;
}
function reagentOf(st: TempState, id: string): Row {
  const r = st.reagents.find((x) => x.id === id);
  if (!r) throw new Error(`시약 ${id} 행이 없음`);
  return r;
}

/** 임시 시약 (register_reagent — 교사·admin 세션). 새 시약은 "칸 없음"(d7 §6)·자동 기준 = 첫 재고 × 입고 비율 (d7 §11-1). */
async function newReagent(client: SupabaseClient, cls: string, tag: string, stock = 7): Promise<string> {
  const res = await rpc(client, "register_reagent", {
    p_name: `S3S11-${tag}-${randomUUID().slice(0, 8)}`,
    p_storage_class: cls,
    p_stock: stock,
    p_unit: "g",
    p_intake_date: "2026-09-15",
    p_msds_url: null,
  });
  const row = expectOk(res, `register_reagent (준비 ${tag})`);
  expect(row.slot_id, "새로 등록한 시약은 칸 없음").toBeNull();
  return row.id as string;
}

/** 분류가 없는 임시 시약: 등록 뒤 교사 세션의 직접 update 로 storage_class 를 비운다 (reagents_update_staff 경로 — 준비) */
async function newUnclassified(client: SupabaseClient, tag: string): Promise<string> {
  const id = await newReagent(client, CLASSES[0], tag);
  const up = await client.from("reagents").update({ storage_class: null }).eq("id", id).select("id, storage_class");
  expect(up.error, `준비: 분류 비우기 (${up.error?.message})`).toBeNull();
  expect(up.data ?? []).toEqual([{ id, storage_class: null }]);
  return id;
}

/** 시약장 + 칸 분류 (add_cabinet → save_cabinet_layout) */
async function newCabinet(client: SupabaseClient, layout: Record<string, string[]> = {}, door = DOUBLE, shelves = MAX_SHELVES): Promise<Row> {
  const cab = expectOk(await addCabinet(client), "add_cabinet (준비)");
  const cells = Object.entries(layout).map(([k, classes]) => ({ side: k[0], shelf: Number(k.slice(1)), classes }));
  expectOk(await saveLayout(client, cab.id, door, shelves, cells), "save_cabinet_layout (준비)");
  return cab;
}

/**
 * place_reagent 성공 1건 + 대조: 반환 = {reagent_id, slot_id, previous_slot_id, warning},
 * warning = 같은 입력의 lib/cabinet-rules placementWarnings(...).kind, DB 에 반영, 다른 시약·이 시약의 다른 열은 그대로.
 */
async function placeOk(client: SupabaseClient, who: string, schoolId: string, reagentId: string, slotId: string | null): Promise<Row> {
  const before = await tempState(schoolId);
  const r = reagentOf(before, reagentId);
  let want: Warning = "none";
  if (slotId !== null) {
    const slot = before.slots.find((s) => s.id === slotId);
    expect(slot, "칸은 이 학교 칸").toBeTruthy();
    const others = before.reagents.filter((x) => x.slot_id === slotId && x.id !== reagentId).map((x) => x.storage_class as string | null);
    want = placementWarnings(r.storage_class as string | null, slot!.storage_classes as string[], others).kind;
  }
  const out = expectOk(await place(client, reagentId, slotId), `${who} place_reagent`);
  expect(out, `${who} place_reagent 반환 (warning = lib placementWarnings)`).toEqual({
    reagent_id: reagentId,
    slot_id: slotId,
    previous_slot_id: r.slot_id,
    warning: want,
  });
  const after = await tempState(schoolId);
  expect(reagentOf(after, reagentId), "이 시약: slot_id 만 바뀜").toEqual({ ...r, slot_id: slotId });
  expect(after.reagents.filter((x) => x.id !== reagentId), "다른 시약 그대로").toEqual(before.reagents.filter((x) => x.id !== reagentId));
  expect(after.cabinets, "시약장 그대로").toEqual(before.cabinets);
  expect(after.slots, "칸 그대로").toEqual(before.slots);
  return out;
}

// ---------- 앞뒤 불변 확인·정리 ----------

let sharedBefore: { a: SharedState; b: SharedState; demo: SharedState } | null = null;

test.beforeAll(async () => {
  sharedBefore = { a: await stateA(), b: await stateB(), demo: await stateDemo() };
});

test.afterAll(async ({}, info) => {
  info.setTimeout(300_000);
  // 정리가 먼저다 (아래 단언이 실패해도 일회용 계정·학교가 남지 않게)
  let left: Awaited<ReturnType<typeof sweep>> | null = null;
  const rest: Record<string, number> = {};
  if (HAS_SERVICE) {
    const sb = service();
    const schools = await sb.from("schools").select("id").like("neis_code", `S8UI-${GROUP}-${info.project.name}-%`);
    const ids = (schools.data ?? []).map((s) => s.id as string);
    if (ids.length) {
      await sb.from("reagents").delete().in("school_id", ids);
      await sb.from("cabinets").delete().in("school_id", ids);
    }
    left = await sweep(GROUP, info.project.name);
    for (const table of ["cabinets", "cabinet_slots", "reagents", "intake_logs", "usage_logs"]) {
      const r = ids.length ? await sb.from(table).select("id").in("school_id", ids) : { data: [] as unknown[] };
      rest[table] = (r.data ?? []).length;
    }
    fixtureCache = null;
  }
  if (left) {
    expect(left, "일회용 계정·학교·프로필 잔여물").toEqual(NO_RESIDUE);
    expect(rest, "일회용 학교의 시약장·칸·시약·기록 잔여물").toEqual({ cabinets: 0, cabinet_slots: 0, reagents: 0, intake_logs: 0, usage_logs: 0 });
  }
  if (sharedBefore) {
    expectSharedSame(await stateA(), sharedBefore.a, "학교 A");
    expectSharedSame(await stateB(), sharedBefore.b, "학교 B");
    expectSharedSame(await stateDemo(), sharedBefore.demo, "데모 학교");
  }
});

// ======================================================================
// 규칙 전제
// ======================================================================

test(`[R-db][S11] 규칙 전제: slot_assign_roles = 교사·admin, R5 에 threshold-edit · R7 에 slot-assign·location-edit (학생 0), incompatible 쌍은 분류 8종 안`, async () => {
  expect([...CAB.slot_assign_roles].sort()).toEqual(["admin", "교사"].sort());
  expect(rules.roles.R5.role).toBe("학생");
  expect(rules.roles.R5.components).toContain("threshold-edit");
  expect(rules.roles.R5.max).toBe(0);
  expect(rules.roles.R7.role).toBe("학생");
  expect(rules.roles.R7.components).toEqual(expect.arrayContaining(["slot-assign", "location-edit"]));
  expect(rules.roles.R7.max).toBe(0);
  expect(CAB.incompatible.length).toBeGreaterThanOrEqual(2);
  for (const pair of CAB.incompatible) for (const c of pair) expect(CLASSES).toContain(c);
  expect(CAB.default_name).toContain("{n}");
  expect(CAB.number, "rules cabinet.number: 삭제된 번호는 다시 쓰지 않음").toContain("다시 쓰지 않음");
  expect(CAB.class_mismatch, "rules cabinet.class_mismatch: 경고만, 저장 허용").toContain("저장 허용");
  expect(rules.reorder.threshold_edit).toContain("덮어씀");
});

// ======================================================================
// 공용 학교: 시약장 번호 (읽기만)
// ======================================================================

test(`[R-db][S11] 공용 학교 A·B·데모 학교 시약장 번호 = 만든 순서(created_at·id)로 1부터 빈틈·중복 없이 (읽기만, 학생에게도 같은 번호)`, async () => {
  const cases: [string, SupabaseClient, string][] = [];
  const t = await signIn("teacher");
  const st = await signIn("student");
  const b = await signIn("schoolB");
  cases.push(["학교 A (교사)", t.client, t.schoolId], ["학교 A (학생)", st.client, st.schoolId], ["학교 B", b.client, b.schoolId], ["데모 학교 (anon)", anonClient(), DEMO_SCHOOL_ID]);
  for (const [what, client, schoolId] of cases) {
    const res = await client.from("cabinets").select("id, number, created_at").eq("school_id", schoolId).order("created_at").order("id");
    expect(res.error, `${what} cabinets 조회: ${res.error?.message}`).toBeNull();
    const rows = (res.data ?? []) as Row[];
    expect(rows.length, `${what} 시약장 ≥1 (seed)`).toBeGreaterThan(0);
    expect(rows.map((r) => r.number), `${what}: 만든 순서로 1, 2, …`).toEqual(rows.map((_, i) => i + 1));
  }
});

// ======================================================================
// 공용 학교: 거부 호출만 (통과해도 안 바뀌는 인자)
// ======================================================================

test(`[R-db][S3] 학교A 학생 place_reagent·set_reorder_threshold 거부 42501 staff only (지금 칸·지금 기준 그대로를 줘도, 잘못된 값이어도 — 학교 A 그대로)`, async () => {
  const s = await signIn("student");
  expect(s.profileRole).toBe("student");
  const before = await stateA();
  const target = placedTarget(before, "학교 A");
  // 없는 id 먼저 — 역할 검사가 대상 조회보다 먼저(42501, P0002 아님)여야 실제 대상을 겨눈다
  expectRejected(await place(s.client, randomUUID(), null), "학생 place_reagent(없는 id)", "42501", "staff only");
  expectRejected(await setThreshold(s.client, randomUUID(), 1), "학생 set_reorder_threshold(없는 id)", "42501", "staff only");
  expectRejected(await place(s.client, target.reagentId, target.slotId), "학생 place_reagent(지금 칸 그대로)", "42501", "staff only");
  expectRejected(await setThreshold(s.client, target.reagentId, target.minStock), "학생 set_reorder_threshold(지금 기준 그대로)", "42501", "staff only");
  expectRejected(await setThreshold(s.client, target.reagentId, -1), "학생 set_reorder_threshold(음수)", "42501", "staff only");
  expectSharedSame(await stateA(), before, "학교 A");
});

const CROSS: [Role, Role, string][] = [
  ["teacher", "schoolB", "학교 B"],
  ["admin", "schoolB", "학교 B"],
  ["schoolB", "teacher", "학교 A"],
];

for (const [attacker, owner, ownerSchool] of CROSS) {
  test(`[N1-db][S3] ${ROLE_LABEL[attacker]}가 ${ownerSchool} 시약으로 place_reagent·set_reorder_threshold → P0002 reagent not found (없는 id 와 같은 응답, ${ownerSchool}·자기 학교 그대로)`, async () => {
    const a = await signIn(attacker);
    const o = await signIn(owner);
    expect(a.schoolId).not.toBe(o.schoolId);
    expect(["teacher", "admin"], "공격자는 자기 학교에서는 권한이 있는 역할").toContain(a.profileRole);
    const before = await sharedOf(o.client, o.schoolId);
    const mine = await sharedOf(a.client, a.schoolId);
    const target = placedTarget(before, ownerSchool);

    // 다른 학교 시약은 보이지 않는다
    const seen = await a.client.from("reagents").select("id").eq("id", target.reagentId);
    expect(seen.data ?? [], `${ROLE_LABEL[attacker]}가 보는 ${ownerSchool} 시약`).toHaveLength(0);

    const ghostPlace = await place(a.client, randomUUID(), target.slotId);
    expectRejected(ghostPlace, "place_reagent(없는 시약 id)", "P0002", "reagent not found");
    const cross = await place(a.client, target.reagentId, target.slotId);
    expectRejected(cross, `place_reagent(${ownerSchool} 시약, 지금 칸 그대로)`, "P0002", "reagent not found");
    expect(errorShape(cross), "없는 id 와 같은 응답").toEqual(errorShape(ghostPlace));

    const ghostSet = await setThreshold(a.client, randomUUID(), 1);
    expectRejected(ghostSet, "set_reorder_threshold(없는 시약 id)", "P0002", "reagent not found");
    const crossSet = await setThreshold(a.client, target.reagentId, target.minStock);
    expectRejected(crossSet, `set_reorder_threshold(${ownerSchool} 시약, 지금 기준 그대로)`, "P0002", "reagent not found");
    expect(errorShape(crossSet), "없는 id 와 같은 응답").toEqual(errorShape(ghostSet));

    expectSharedSame(await sharedOf(o.client, o.schoolId), before, ownerSchool);
    expectSharedSame(await sharedOf(a.client, a.schoolId), mine, "공격자 자기 학교");
  });
}

test(`[N1-db][S11] anon 은 place_reagent·set_reorder_threshold 호출 불가 42501 (없는 id·학교 A·데모 학교 시약, 모두 그대로)`, async () => {
  const anon = anonClient();
  const before = { a: await stateA(), demo: await stateDemo() };
  const ta = placedTarget(before.a, "학교 A");
  const td = placedTarget(before.demo, "데모 학교");
  for (const [what, t] of [["없는 id", { reagentId: randomUUID(), slotId: randomUUID(), minStock: 1 }], ["학교 A", ta], ["데모 학교", td]] as const) {
    expectRejected(await place(anon, t.reagentId, t.slotId), `anon place_reagent(${what})`, "42501");
    expectRejected(await place(anon, t.reagentId, null), `anon place_reagent(${what}, 빼기)`, "42501");
    expectRejected(await setThreshold(anon, t.reagentId, t.minStock), `anon set_reorder_threshold(${what})`, "42501");
  }
  expectSharedSame(await stateA(), before.a, "학교 A");
  expectSharedSame(await stateDemo(), before.demo, "데모 학교");
});

test(`[N1-db][S11] place_reagent·set_reorder_threshold 에 학교를 넘길 방법이 없다 (p_school_id·school_id 인자 거부)`, async () => {
  const t = await signIn("teacher");
  const b = await signIn("schoolB");
  const before = { a: await stateA(), b: await stateB() };
  for (const key of ["p_school_id", "school_id"]) {
    const p = await rpc(t.client, "place_reagent", { p_reagent_id: randomUUID(), p_slot_id: null, [key]: b.schoolId });
    expect(p.error, `${key} 인자를 받는 place_reagent 는 없어야 함`).not.toBeNull();
    const s = await rpc(t.client, "set_reorder_threshold", { p_reagent_id: randomUUID(), p_min_stock: 1, [key]: b.schoolId });
    expect(s.error, `${key} 인자를 받는 set_reorder_threshold 는 없어야 함`).not.toBeNull();
  }
  expectSharedSame(await stateA(), before.a, "학교 A");
  expectSharedSame(await stateB(), before.b, "학교 B");
});

for (const who of ["student", "teacher", "admin", "schoolB"] as Role[]) {
  test(`[GM-db][S*] ${ROLE_LABEL[who]}로 데모 학교 시약 place_reagent·set_reorder_threshold 거부 (데모 학교·자기 학교 그대로)`, async () => {
    const s: Session = await signIn(who);
    expect(s.schoolId).not.toBe(DEMO_SCHOOL_ID);
    const before = await stateDemo();
    const mine = await sharedOf(s.client, s.schoolId);
    const target = placedTarget(before, "데모 학교");
    // 학생은 역할에서(42501), 교사·admin 은 "자기 학교 시약이 아님"에서(P0002) 걸린다
    const [code, message] = s.profileRole === "student" ? ["42501", "staff only"] : ["P0002", "reagent not found"];
    const ghost = await place(s.client, randomUUID(), target.slotId);
    expectRejected(ghost, "place_reagent(없는 id)", code, message);
    const p = await place(s.client, target.reagentId, target.slotId);
    expectRejected(p, "place_reagent(데모 시약, 지금 칸 그대로)", code, message);
    expect(errorShape(p), "없는 id 와 같은 응답").toEqual(errorShape(ghost));
    const ghostSet = await setThreshold(s.client, randomUUID(), 1);
    const t = await setThreshold(s.client, target.reagentId, target.minStock);
    expectRejected(t, "set_reorder_threshold(데모 시약, 지금 기준 그대로)", code, message);
    expect(errorShape(t), "없는 id 와 같은 응답").toEqual(errorShape(ghostSet));
    expectSharedSame(await stateDemo(), before, "데모 학교");
    expectSharedSame(await sharedOf(s.client, s.schoolId), mine, "자기 학교");
  });
}

// ======================================================================
// 일회용 학교 (성공 경로·잘못된 인자). 키가 없으면 skip.
// ======================================================================

test.describe("일회용 학교", () => {
  test.describe.configure({ mode: "default" });
  test.skip(!HAS_SERVICE, NO_SERVICE_REASON);

  // ---------- 시약장 번호 ----------

  test(`[R-db][S11] 시약장 번호: 첫 add_cabinet → 1·"${defaultName(1)}", 다음 2, 2번 삭제 후 추가 → 3 (재사용 안 함), 이름을 바꿔도 번호 그대로, 모두 지운 뒤 추가 → 4`, async ({}, info) => {
    const f = await fresh(info);
    expect((await tempState(f.school.id)).seq, "빈 학교: 마지막 번호 0").toBe(0);

    const c1 = expectOk(await addCabinet(f.teacher), "add 1");
    expect(c1).toMatchObject({ school_id: f.school.id, number: 1, label: defaultName(1) });
    const c2 = expectOk(await addCabinet(f.admin), "add 2");
    expect(c2).toMatchObject({ number: 2, label: defaultName(2) });

    expectOk(await deleteCabinet(f.teacher, c2.id), "delete 2");
    const c3 = expectOk(await addCabinet(f.teacher), "add (2번 삭제 뒤)");
    expect(c3.number, "삭제된 번호 2 를 다시 쓰지 않는다").toBe(3);
    expect(c3.label).toBe(defaultName(3));

    // 이름을 바꿔도 번호는 그대로 (rules cabinet.number: 이름과 별개)
    const renamed = expectOk(await renameCabinet(f.admin, c1.id, "화학 준비실"), "rename 1");
    expect(renamed).toEqual({ ...c1, label: "화학 준비실" });
    expectOk(await renameCabinet(f.teacher, c3.id, defaultName(9)), "rename 3 → 9번 이름");
    let st = await tempState(f.school.id);
    expect(st.cabinets.map((c) => [c.id, c.number]), "번호 = 1·3").toEqual([[c1.id, 1], [c3.id, 3]]);

    // 전부 지운 뒤 추가해도 번호는 이어진다
    expectOk(await deleteCabinet(f.admin, c1.id), "delete 1");
    expectOk(await deleteCabinet(f.admin, c3.id), "delete 3");
    expect((await tempState(f.school.id)).cabinets).toHaveLength(0);
    const c4 = expectOk(await addCabinet(f.teacher), "add (모두 지운 뒤)");
    expect(c4).toMatchObject({ number: 4, label: defaultName(4) });
    st = await tempState(f.school.id);
    expect(st.seq, "학교의 마지막 번호").toBe(4);
    // 학생·교사·admin 모두 같은 번호를 본다
    for (const [who, client] of [["학생", f.student], ["교사", f.teacher], ["admin", f.admin]] as const) {
      const seen = await client.from("cabinets").select("id, number");
      expect(seen.error).toBeNull();
      expect(seen.data, `${who}가 보는 번호`).toEqual([{ id: c4.id, number: 4 }]);
    }
  });

  test(`[R-db][S11] 시약장 번호는 학교마다 따로 1부터 (다른 일회용 학교), 기본 이름이 이미 있으면 이름만 피하고 번호는 그대로, 동시 추가 2건도 번호 겹침 없음`, async ({}, info) => {
    const f = await fresh(info);
    const a1 = expectOk(await addCabinet(f.teacher), "이 학교 add 1");
    const a2 = expectOk(await addCabinet(f.teacher), "이 학교 add 2");
    const o1 = expectOk(await addCabinet(f.otherAdmin), "다른 학교 add 1");
    expect([a1.number, a2.number]).toEqual([1, 2]);
    expect(o1).toMatchObject({ school_id: f.other.id, number: 1, label: defaultName(1) });

    // "3번 시약장" 이름이 이미 있으면 새 시약장의 번호는 3, 이름은 겹치지 않게 숫자만 올린다
    expectOk(await renameCabinet(f.teacher, a1.id, defaultName(3)), "rename 1 → 3번 이름");
    const a3 = expectOk(await addCabinet(f.admin), "add (3번 이름이 이미 있음)");
    expect(a3.number, "번호는 그대로 3").toBe(3);
    expect(a3.label, "이름은 겹치지 않게").not.toBe(defaultName(3));
    expect(String(a3.label)).toBe(defaultName(4));

    // 동시 2건
    const [x, y] = await Promise.all([addCabinet(f.teacher), addCabinet(f.admin)]);
    const rx = expectOk(x, "동시 add (교사)");
    const ry = expectOk(y, "동시 add (admin)");
    expect([rx.number, ry.number].map(Number).sort((p, q) => p - q), "동시 추가 번호 = 4·5").toEqual([4, 5]);
    const st = await tempState(f.school.id);
    const numbers = st.cabinets.map((c) => c.number);
    expect(new Set(numbers).size, "같은 학교 번호 중복 없음").toBe(numbers.length);
    expect((await tempState(f.other.id)).cabinets.map((c) => c.number), "다른 학교는 영향 없음").toEqual([1]);
  });

  test(`[R-db][S11] 교사·admin·학생의 cabinets 직접 update(number·school_id)·insert(number 지정) 거부 — 번호·마지막 번호 그대로`, async ({}, info) => {
    const f = await fresh(info);
    const c1 = expectOk(await addCabinet(f.teacher), "add 1");
    const c2 = expectOk(await addCabinet(f.teacher), "add 2");
    const before = await tempState(f.school.id);
    for (const [who, client] of [["교사", f.teacher], ["admin", f.admin], ["학생", f.student]] as const) {
      for (const patch of [{ number: 7 }, { number: c2.number }, { number: 1 }, { school_id: f.other.id }]) {
        const up = await client.from("cabinets").update(patch).eq("id", c1.id as string).select("id");
        expect(changed(up), `${who} cabinets update ${JSON.stringify(patch)}`).toBe(0);
      }
      const all = await client.from("cabinets").update({ number: 99 }).eq("school_id", f.school.id).select("id");
      expect(changed(all), `${who} 학교 전체 number update`).toBe(0);
      const ins = await client
        .from("cabinets")
        .insert({ school_id: f.school.id, label: `직접-${randomUUID().slice(0, 6)}`, door_type: DOUBLE, shelves: MAX_SHELVES, number: 50 })
        .select("id");
      expect(ins.error, `${who} cabinets insert 는 오류여야 함`).not.toBeNull();
      expect(ins.error?.code, ins.error?.message).toBe("42501");
      expect(await tempState(f.school.id), `${who} 직접 쓰기 뒤 그대로`).toEqual(before);
    }
    expect(before.cabinets.map((c) => c.number)).toEqual([1, 2]);
    expect(before.seq).toBe(2);
  });

  test(`[R-db][S11] 번호 고정 트리거·unique·check (DB 무결성 — service role 경로): number·school_id 변경 55000, 같은 학교 같은 번호 23505, 0 은 23514, 큰 번호를 직접 넣으면 다음 add_cabinet 은 그 다음`, async ({}, info) => {
    const f = await fresh(info);
    const sb = service();
    const c1 = expectOk(await addCabinet(f.teacher), "add 1");
    const before = await tempState(f.school.id);

    const n = await sb.from("cabinets").update({ number: 5 }).eq("id", c1.id as string).select("id");
    expect(n.error?.code, `number 변경: ${n.error?.message}`).toBe("55000");
    expect(n.error?.message).toBe("cabinet number is fixed");
    const s = await sb.from("cabinets").update({ school_id: f.other.id }).eq("id", c1.id as string).select("id");
    expect(s.error?.code, `school_id 변경: ${s.error?.message}`).toBe("55000");
    // 이름만 바꾸는 update 는 번호를 건드리지 않으므로 통과 (대조군)
    const l = await sb.from("cabinets").update({ label: "이름만" }).eq("id", c1.id as string).select("id, number, label");
    expect(l.error, l.error?.message).toBeNull();
    expect(l.data).toEqual([{ id: c1.id, number: 1, label: "이름만" }]);
    expect((await tempState(f.school.id)).cabinets.map((c) => c.number)).toEqual([1]);

    const dup = await sb.from("cabinets").insert({ school_id: f.school.id, label: "중복 번호", door_type: DOUBLE, shelves: MAX_SHELVES, number: 1 }).select("id");
    expect(dup.error?.code, `같은 학교 같은 번호: ${dup.error?.message}`).toBe("23505");
    const zero = await sb.from("cabinets").insert({ school_id: f.school.id, label: "0번", door_type: DOUBLE, shelves: MAX_SHELVES, number: 0 }).select("id");
    expect(zero.error?.code, `번호 0: ${zero.error?.message}`).toBe("23514");
    const after = await tempState(f.school.id);
    expect(after.cabinets.map((c) => c.id), "실패한 insert 는 행을 남기지 않음").toEqual(before.cabinets.map((c) => c.id));
    expect(after.seq, "실패한 insert 뒤 마지막 번호").toBe(1);

    // 다른 학교는 같은 번호 가능
    const other = await sb.from("cabinets").insert({ school_id: f.other.id, label: "다른 학교 1", door_type: DOUBLE, shelves: MAX_SHELVES, number: 1 }).select("number");
    expect(other.error, other.error?.message).toBeNull();
    // 번호를 비우고 넣으면 마지막 번호 + 1
    const auto = await sb.from("cabinets").insert({ school_id: f.school.id, label: "자동 번호", door_type: DOUBLE, shelves: MAX_SHELVES }).select("number");
    expect(auto.error, auto.error?.message).toBeNull();
    expect(auto.data).toEqual([{ number: 2 }]);
    // 큰 번호를 직접 넣으면 마지막 번호가 그 이상으로 → 다음 add_cabinet 은 11
    const big = await sb.from("cabinets").insert({ school_id: f.school.id, label: "10번 직접", door_type: DOUBLE, shelves: MAX_SHELVES, number: 10 }).select("number");
    expect(big.error, big.error?.message).toBeNull();
    const next = expectOk(await addCabinet(f.admin), "add (10번을 직접 넣은 뒤)");
    expect(next.number).toBe(11);
    expect(next.label).toBe(defaultName(11));
    expect((await tempState(f.school.id)).seq).toBe(11);
  });

  test(`[R-db][S11] 학교당 ${CABINET_MAX}개 한도는 개수 기준: ${CABINET_MAX}개면 23514, 지우면 다시 추가 가능하고 번호는 계속 증가`, async ({}, info) => {
    const f = await fresh(info);
    const made: Row[] = [];
    for (let i = 0; i < CABINET_MAX; i++) made.push(expectOk(await addCabinet(i % 2 ? f.admin : f.teacher), `add ${i + 1}`));
    expect(made.map((c) => c.number)).toEqual(Array.from({ length: CABINET_MAX }, (_, i) => i + 1));
    const full = await tempState(f.school.id);
    const over = await addCabinet(f.teacher);
    expectRejected(over, `${CABINET_MAX + 1}번째 add_cabinet`, "23514", "cabinet limit");
    expect(String(over.error?.details ?? "")).toBe(String(CABINET_MAX));
    expect(await tempState(f.school.id), "한도 초과 뒤 그대로 (마지막 번호 포함)").toEqual(full);

    expectOk(await deleteCabinet(f.teacher, made[0].id), "1번 삭제");
    expectOk(await deleteCabinet(f.admin, made[9].id), "10번 삭제");
    const a = expectOk(await addCabinet(f.teacher), "삭제 뒤 add 1");
    const b = expectOk(await addCabinet(f.admin), "삭제 뒤 add 2");
    expect([a.number, b.number], "번호는 계속 증가 (빈 번호 1·10 을 쓰지 않음)").toEqual([CABINET_MAX + 1, CABINET_MAX + 2]);
    expectRejected(await addCabinet(f.teacher), "다시 가득 찬 뒤 add_cabinet", "23514", "cabinet limit");
    const st = await tempState(f.school.id);
    expect(st.cabinets).toHaveLength(CABINET_MAX);
    expect(st.seq).toBe(CABINET_MAX + 2);
  });

  // ---------- place_reagent: 성공 ----------

  test(`[R-db][S3] place_reagent 교사·admin 성공: 넣기(previous null)·옮기기(다른 시약장 칸, previous = 이전 칸)·빼기(null → 칸 없음), 반환 {reagent_id, slot_id, previous_slot_id, warning}`, async ({}, info) => {
    const f = await fresh(info);
    const c1 = await newCabinet(f.teacher, { L1: [K("산")] });
    const c2 = await newCabinet(f.admin, {}, SINGLE, MIN_SHELVES);
    const st = await tempState(f.school.id);
    const L1 = slotAt(st, c1.id as string, "L1").id as string;
    const R2 = slotAt(st, c1.id as string, "R2").id as string;
    const other = slotAt(st, c2.id as string, `L${MIN_SHELVES}`).id as string;
    const r1 = await newReagent(f.teacher, K("산"), "r1");
    const r2 = await newReagent(f.admin, K("유기"), "r2");

    const put = await placeOk(f.teacher, "교사 넣기", f.school.id, r1, L1);
    expect(put).toMatchObject({ previous_slot_id: null, warning: "none" });
    await placeOk(f.admin, "admin 넣기(같은 칸 두 번째)", f.school.id, r2, L1);
    const move = await placeOk(f.admin, "admin 옮기기(같은 시약장)", f.school.id, r1, R2);
    expect(move.previous_slot_id).toBe(L1);
    const moveCab = await placeOk(f.teacher, "교사 옮기기(다른 시약장)", f.school.id, r1, other);
    expect(moveCab.previous_slot_id).toBe(R2);
    const same = await placeOk(f.teacher, "교사 같은 칸 다시", f.school.id, r1, other);
    expect(same.previous_slot_id).toBe(other);
    const out = await placeOk(f.admin, "admin 빼기", f.school.id, r1, null);
    expect(out).toMatchObject({ previous_slot_id: other, warning: "none" });
    const out2 = await placeOk(f.teacher, "교사 빼기", f.school.id, r2, null);
    expect(out2.previous_slot_id).toBe(L1);
    const none = await placeOk(f.teacher, "칸 없음을 다시 빼기", f.school.id, r2, null);
    expect(none.previous_slot_id).toBeNull();
    // 시약장 행·칸 행은 처음 그대로
    const end = await tempState(f.school.id);
    expect(end.cabinets).toEqual(st.cabinets);
    expect(end.slots).toEqual(st.slots);
    expect(end.reagents.every((r) => r.slot_id === null)).toBe(true);
  });

  // ---------- place_reagent: 경고 (d7 §14 분류 불일치 — 경고만, 저장은 됨) ----------

  test(`[R-db][S11] place_reagent 경고: 분류 일치·미지정 칸·분류 없는 시약 = none, 칸 분류에 없으면 mismatch, 칸 분류·같은 칸 다른 시약과 incompatible 조합(양방향) = incompatible — 경고가 있어도 저장되고, 값은 lib placementWarnings 와 같다`, async ({}, info) => {
    const f = await fresh(info);
    const layout: Record<string, string[]> = {
      L1: [K("산")],
      L2: [],
      L3: [K("유기")],
      L4: [K("산화제"), K("기타")],
      R1: [K("염기")],
      R2: [K("기타")],
      R3: [K("산"), K("염기")],
      R4: [K("인화성")],
    };
    const cab = await newCabinet(f.teacher, layout);
    const cabId = cab.id as string;
    type Case = { tag: string; cls: string | null; slot: string; others: (string | null)[]; want: Warning; pair?: [string, string] };
    const cases: Case[] = [
      { tag: "분류 일치", cls: K("산"), slot: "L1", others: [], want: "none" },
      { tag: "칸 분류에 없음", cls: K("유기"), slot: "L1", others: [], want: "mismatch" },
      { tag: "칸(산)에 염기", cls: K("염기"), slot: "L1", others: [], want: "incompatible", pair: ["산", "염기"] },
      { tag: "칸(염기)에 산 — 반대 방향", cls: K("산"), slot: "R1", others: [], want: "incompatible", pair: ["산", "염기"] },
      { tag: "칸(산화제·기타)에 인화성", cls: K("인화성"), slot: "L4", others: [], want: "incompatible", pair: ["산화제", "인화성"] },
      { tag: "칸(인화성)에 산", cls: K("산"), slot: "R4", others: [], want: "incompatible", pair: ["산", "인화성"] },
      { tag: "칸(유기)에 산화제", cls: K("산화제"), slot: "L3", others: [], want: "incompatible", pair: ["산화제", "유기"] },
      { tag: "칸(유기)에 유기", cls: K("유기"), slot: "L3", others: [], want: "none" },
      { tag: "칸(산·염기)에 산 — 칸 분류끼리 위험해도 시약과의 조합으로 판정", cls: K("산"), slot: "R3", others: [], want: "incompatible", pair: ["산", "염기"] },
      { tag: "칸(기타)에 무기염", cls: K("무기염"), slot: "R2", others: [], want: "mismatch" },
      { tag: "칸(인화성)에 기타", cls: K("기타"), slot: "R4", others: [], want: "mismatch" },
      { tag: "분류 없는 시약 → 분류 칸", cls: null, slot: "L1", others: [], want: "none" },
      { tag: "분류 없는 시약 → 위험 조합 칸", cls: null, slot: "R3", others: [], want: "none" },
      { tag: "미지정 칸", cls: K("무기염"), slot: "L2", others: [], want: "none" },
      { tag: "미지정 칸, 같은 칸 다른 시약(산)에 독성", cls: K("독성"), slot: "L2", others: [K("산")], want: "incompatible", pair: ["독성", "산"] },
      { tag: "미지정 칸, 같은 칸 다른 시약(독성)에 산 — 반대 방향", cls: K("산"), slot: "L2", others: [K("독성")], want: "incompatible", pair: ["독성", "산"] },
      { tag: "미지정 칸, 같은 칸 다른 시약(산)에 인화성", cls: K("인화성"), slot: "L2", others: [K("산")], want: "incompatible", pair: ["산", "인화성"] },
      { tag: "미지정 칸, 같은 칸 다른 시약(유기)에 산화제", cls: K("산화제"), slot: "L2", others: [K("유기")], want: "incompatible", pair: ["산화제", "유기"] },
      { tag: "같은 칸 다른 시약이 분류 없음", cls: K("유기"), slot: "L2", others: [null], want: "none" },
      { tag: "칸(기타)·같은 칸 다른 시약(유기)에 기타 — 위험 아님", cls: K("기타"), slot: "R2", others: [K("유기")], want: "none" },
      { tag: "칸(기타)에 맞지만 같은 칸 다른 시약(염기)과 위험: 산", cls: K("산"), slot: "R2", others: [K("염기")], want: "incompatible", pair: ["산", "염기"] },
    ];
    // 대표 쌍 커버리지: rules incompatible 5쌍 중 2쌍 이상, 양방향 1쌍 이상
    const covered = new Set(cases.filter((c) => c.pair).map((c) => [...c.pair!].sort().join("+")));
    expect(covered.size, "다룬 incompatible 쌍 수").toBeGreaterThanOrEqual(2);
    for (const c of cases) if (c.pair) expect(isIncompatible(c.pair[0], c.pair[1]), `${c.tag}: 쌍이 rules.json incompatible 에 있음`).toBe(true);

    let i = 0;
    for (const c of cases) {
      const [who, client] = i++ % 2 ? (["admin", f.admin] as const) : (["교사", f.teacher] as const);
      const slotId = slotAt(await tempState(f.school.id), cabId, c.slot).id as string;
      // 칸 비우기 (place_reagent 빼기)
      for (const r of (await tempState(f.school.id)).reagents.filter((x) => x.slot_id === slotId)) {
        expectOk(await place(f.teacher, r.id, null), "준비: 칸 비우기");
      }
      // 같은 칸의 다른 시약 (이 배치도 placementWarnings 와 대조된다)
      for (const oc of c.others) {
        const oid = oc === null ? await newUnclassified(f.teacher, "other") : await newReagent(f.teacher, oc, "other");
        await placeOk(f.teacher, `${c.tag}: 준비 배치`, f.school.id, oid, slotId);
      }
      const rid = c.cls === null ? await newUnclassified(client, "subject") : await newReagent(client, c.cls, "subject");
      const out = await placeOk(client, `${who} ${c.tag}`, f.school.id, rid, slotId);
      expect(out.warning, `${c.tag}: 규칙(d7 §14)에서 기대한 경고`).toBe(c.want);
      // 같은 입력으로 lib placementWarnings 직접 호출 — 같은 값
      expect(placementWarnings(c.cls, layout[c.slot], c.others).kind, `${c.tag}: lib placementWarnings`).toBe(c.want);
      // 경고가 있어도 저장됨
      expect(reagentOf(await tempState(f.school.id), rid).slot_id, `${c.tag}: 저장됨`).toBe(slotId);
    }
    // 빼기는 언제나 none
    const anyPlaced = (await tempState(f.school.id)).reagents.find((r) => r.slot_id !== null)!;
    expect((await placeOk(f.admin, "빼기", f.school.id, anyPlaced.id as string, null)).warning).toBe("none");
  });

  // ---------- place_reagent: 거부 ----------

  test(`[R-db][S3] place_reagent 일회용 학생 42501 staff only (넣기·옮기기·빼기·없는 id, 배치 그대로)`, async ({}, info) => {
    const f = await fresh(info);
    const cab = await newCabinet(f.teacher);
    let st = await tempState(f.school.id);
    const L1 = slotAt(st, cab.id as string, "L1").id as string;
    const R1 = slotAt(st, cab.id as string, "R1").id as string;
    const placed = await newReagent(f.teacher, K("산"), "placed");
    const loose = await newReagent(f.teacher, K("염기"), "loose");
    await placeOk(f.teacher, "준비", f.school.id, placed, L1);
    st = await tempState(f.school.id);
    for (const [what, rid, sid] of [
      ["넣기", loose, L1],
      ["옮기기", placed, R1],
      ["빼기", placed, null],
      ["지금 칸 그대로", placed, L1],
      ["없는 시약", randomUUID(), L1],
      ["없는 칸", loose, randomUUID()],
    ] as const) {
      expectRejected(await place(f.student, rid, sid), `학생 place_reagent ${what}`, "42501", "staff only");
    }
    expect(await tempState(f.school.id), "학생 호출 뒤 그대로").toEqual(st);
  });

  test(`[N1-db][S3] place_reagent 일회용 학교 ↔ 다른 일회용 학교 (양방향): 다른 학교 시약·칸·없는 id → P0002 (없는 id 와 같은 응답), 두 학교 그대로; 공용 계정·anon 도 거부`, async ({}, info) => {
    const f = await fresh(info);
    const xc = await newCabinet(f.teacher, { L1: [K("산")] });
    const yc = await newCabinet(f.otherAdmin, { L1: [K("염기")] });
    let xs = await tempState(f.school.id);
    let ys = await tempState(f.other.id);
    const xL1 = slotAt(xs, xc.id as string, "L1").id as string;
    const xR1 = slotAt(xs, xc.id as string, "R1").id as string;
    const yL1 = slotAt(ys, yc.id as string, "L1").id as string;
    const yR1 = slotAt(ys, yc.id as string, "R1").id as string;
    const xPlaced = await newReagent(f.teacher, K("산"), "x-placed");
    const xLoose = await newReagent(f.teacher, K("산"), "x-loose");
    const yPlaced = await newReagent(f.otherAdmin, K("염기"), "y-placed");
    const yLoose = await newReagent(f.otherAdmin, K("염기"), "y-loose");
    await placeOk(f.teacher, "준비 X", f.school.id, xPlaced, xL1);
    await placeOk(f.otherAdmin, "준비 Y", f.other.id, yPlaced, yL1);
    xs = await tempState(f.school.id);
    ys = await tempState(f.other.id);

    type Attack = [string, SupabaseClient, { reagent: [string, string | null][]; slot: [string, string][] }, string, string];
    const attacks: Attack[] = [
      // [누가, 클라이언트, {다른 학교 시약 + 칸 조합, 자기 학교 시약 + 다른 학교 칸}, 자기 학교 칸, 자기 학교 시약]
      ["X 교사", f.teacher, { reagent: [[yPlaced, yL1], [yPlaced, yR1], [yPlaced, null], [yLoose, xL1], [yLoose, yR1]], slot: [[xLoose, yR1], [xPlaced, yL1]] }, xR1, xLoose],
      ["X admin", f.admin, { reagent: [[yPlaced, null], [yLoose, xR1]], slot: [[xLoose, yL1]] }, xR1, xLoose],
      ["Y admin", f.otherAdmin, { reagent: [[xPlaced, xL1], [xPlaced, null], [xLoose, yR1], [xLoose, xR1]], slot: [[yLoose, xR1], [yPlaced, xL1]] }, yR1, yLoose],
    ];
    for (const [who, client, t, ownSlot, ownReagent] of attacks) {
      const ghostReagent = await place(client, randomUUID(), ownSlot);
      expectRejected(ghostReagent, `${who} place_reagent(없는 시약)`, "P0002", "reagent not found");
      const ghostSlot = await place(client, ownReagent, randomUUID());
      expectRejected(ghostSlot, `${who} place_reagent(자기 시약 + 없는 칸)`, "P0002", "slot not found");
      for (const [rid, sid] of t.reagent) {
        const res = await place(client, rid, sid);
        expectRejected(res, `${who} place_reagent(다른 학교 시약 ${rid.slice(0, 8)}, 칸 ${sid?.slice(0, 8) ?? "null"})`, "P0002", "reagent not found");
        expect(errorShape(res), "없는 시약 id 와 같은 응답").toEqual(errorShape(ghostReagent));
      }
      for (const [rid, sid] of t.slot) {
        const res = await place(client, rid, sid);
        expectRejected(res, `${who} place_reagent(자기 시약 + 다른 학교 칸)`, "P0002", "slot not found");
        expect(errorShape(res), "없는 칸 id 와 같은 응답").toEqual(errorShape(ghostSlot));
      }
      expect(await tempState(f.school.id), `${who} 호출 뒤 X 그대로`).toEqual(xs);
      expect(await tempState(f.other.id), `${who} 호출 뒤 Y 그대로`).toEqual(ys);
    }
    // 다른 학교 시약·칸은 보이지 않는다
    for (const [rid, sid] of [[yPlaced, yL1]]) {
      expect((await f.teacher.from("reagents").select("id").eq("id", rid)).data ?? []).toHaveLength(0);
      expect((await f.teacher.from("cabinet_slots").select("id").eq("id", sid)).data ?? []).toHaveLength(0);
    }

    // 공용 계정(학교 A·B)·anon 이 일회용 학교 시약을 겨눔
    const outsiders: [string, SupabaseClient, string, string | undefined][] = [
      [ROLE_LABEL.teacher, (await signIn("teacher")).client, "P0002", "reagent not found"],
      [ROLE_LABEL.admin, (await signIn("admin")).client, "P0002", "reagent not found"],
      [ROLE_LABEL.schoolB, (await signIn("schoolB")).client, "P0002", "reagent not found"],
      [ROLE_LABEL.student, (await signIn("student")).client, "42501", "staff only"],
      ["anon", anonClient(), "42501", undefined],
    ];
    for (const [who, client, code, message] of outsiders) {
      const ghost = await place(client, randomUUID(), xR1);
      expectRejected(ghost, `${who} place_reagent(없는 id)`, code, message);
      for (const [rid, sid] of [[xPlaced, xR1], [xPlaced, null], [xLoose, xL1]] as const) {
        const res = await place(client, rid, sid);
        expectRejected(res, `${who} place_reagent(일회용 학교 시약)`, code, message);
        expect(errorShape(res), "없는 id 와 같은 응답").toEqual(errorShape(ghost));
      }
    }
    expect(await tempState(f.school.id), "X 그대로").toEqual(xs);
    expect(await tempState(f.other.id), "Y 그대로").toEqual(ys);
  });

  test(`[GM-db][S*] 일회용 학교 교사·admin·학생: 데모 학교 시약·칸으로 place_reagent·set_reorder_threshold 거부 (데모·자기 학교 그대로)`, async ({}, info) => {
    const f = await fresh(info);
    const cab = await newCabinet(f.teacher);
    const own = await newReagent(f.teacher, K("유기"), "own");
    const ownSlot = slotAt(await tempState(f.school.id), cab.id as string, "L1").id as string;
    const st = await tempState(f.school.id);
    const demoBefore = await stateDemo();
    const demo = placedTarget(demoBefore, "데모 학교");
    for (const [who, client, code, msg] of [
      ["교사", f.teacher, "P0002", "reagent not found"],
      ["admin", f.admin, "P0002", "reagent not found"],
      ["학생", f.student, "42501", "staff only"],
    ] as const) {
      expectRejected(await place(client, demo.reagentId, demo.slotId), `${who} place_reagent(데모 시약, 지금 칸)`, code, msg);
      expectRejected(await place(client, demo.reagentId, ownSlot), `${who} place_reagent(데모 시약 → 자기 칸)`, code, msg);
      expectRejected(await place(client, demo.reagentId, null), `${who} place_reagent(데모 시약 빼기)`, code, msg);
      expectRejected(
        await place(client, own, demo.slotId),
        `${who} place_reagent(자기 시약 → 데모 칸)`,
        code,
        code === "P0002" ? "slot not found" : msg,
      );
      expectRejected(await setThreshold(client, demo.reagentId, demo.minStock), `${who} set_reorder_threshold(데모 시약)`, code, msg);
      expectRejected(await setThreshold(client, demo.reagentId, 5), `${who} set_reorder_threshold(데모 시약, 다른 값)`, code, msg);
    }
    expectSharedSame(await stateDemo(), demoBefore, "데모 학교");
    expect(await tempState(f.school.id), "자기 학교 그대로").toEqual(st);
  });

  // ---------- reagents.slot_id 직접 쓰기 차단 ----------

  test(`[R-db][S3] reagents.slot_id 직접 쓰기 차단: 교사·admin 의 update(넣기·옮기기·빼기)·slot_id 를 넣은 insert → 42501, 학생도 거부 — 값 그대로; 교사·admin 의 stock·이름 직접 update·slot_id 없는 insert 는 그대로 가능`, async ({}, info) => {
    const f = await fresh(info);
    const cab = await newCabinet(f.teacher);
    let st = await tempState(f.school.id);
    const L1 = slotAt(st, cab.id as string, "L1").id as string;
    const L2 = slotAt(st, cab.id as string, "L2").id as string;
    const placed = await newReagent(f.teacher, K("산"), "placed");
    const loose = await newReagent(f.teacher, K("산"), "loose");
    await placeOk(f.teacher, "준비", f.school.id, placed, L1);
    st = await tempState(f.school.id);
    const sb = service();

    for (const [who, client] of [["교사", f.teacher], ["admin", f.admin]] as const) {
      const updates: [string, string, string | null][] = [
        ["넣기", loose, L2],
        ["옮기기", placed, L2],
        ["빼기", placed, null],
      ];
      for (const [what, id, slot] of updates) {
        const up = await client.from("reagents").update({ slot_id: slot }).eq("id", id).select("id, slot_id");
        expect(up.error, `${who} slot_id 직접 update(${what}) 는 오류여야 함 (반환 ${JSON.stringify(up.data)})`).not.toBeNull();
        expect(up.error?.code, up.error?.message).toBe("42501");
        expect(up.error?.message).toBe("reagent placement only through place_reagent");
      }
      // 다른 열과 함께 바꿔도 거부 (다른 열도 바뀌지 않는다)
      const mixed = await client.from("reagents").update({ stock: 99, slot_id: L2 }).eq("id", loose).select("id");
      expect(mixed.error?.code, `${who} stock + slot_id update`).toBe("42501");
      // 학교 전체
      const all = await client.from("reagents").update({ slot_id: L2 }).eq("school_id", f.school.id).select("id");
      expect(all.error?.code, `${who} 학교 전체 slot_id update`).toBe("42501");
      // insert 에 slot_id
      const name = `S3S11-직접-${randomUUID().slice(0, 8)}`;
      const ins = await client.from("reagents").insert({ school_id: f.school.id, name, unit: "g", stock: 1, storage_class: K("산"), slot_id: L1 }).select("id");
      expect(ins.error, `${who} slot_id 를 넣은 insert 는 오류여야 함`).not.toBeNull();
      expect(ins.error?.code, ins.error?.message).toBe("42501");
      expect((await sb.from("reagents").select("id").eq("name", name)).data ?? [], "행이 생기지 않음").toHaveLength(0);
      expect(await tempState(f.school.id), `${who} 직접 쓰기 뒤 그대로`).toEqual(st);
    }

    // 학생: update 는 0행(또는 오류), insert 는 42501
    for (const [what, id, slot] of [["넣기", loose, L2], ["옮기기", placed, L2], ["빼기", placed, null]] as const) {
      const up = await f.student.from("reagents").update({ slot_id: slot }).eq("id", id).select("id");
      expect(changed(up), `학생 slot_id 직접 update(${what})`).toBe(0);
    }
    const sname = `S3S11-학생-${randomUUID().slice(0, 8)}`;
    const sins = await f.student.from("reagents").insert({ school_id: f.school.id, name: sname, unit: "g", stock: 1, slot_id: L1 }).select("id");
    expect(sins.error?.code, `학생 slot_id insert: ${sins.error?.message}`).toBe("42501");
    expect(await tempState(f.school.id), "학생 직접 쓰기 뒤 그대로").toEqual(st);

    // 대조군: 다른 열 직접 update·slot_id 없는 insert 는 기존대로 된다 (거부 사유가 slot_id 임을 보인다)
    const up1 = await f.teacher.from("reagents").update({ stock: 11, name: `S3S11-이름바꿈-${randomUUID().slice(0, 6)}` }).eq("id", placed).select("id, stock, slot_id");
    expect(up1.error, `교사 stock·이름 직접 update: ${up1.error?.message}`).toBeNull();
    expect(up1.data).toEqual([{ id: placed, stock: 11, slot_id: L1 }]);
    const up2 = await f.admin.from("reagents").update({ stock: 3 }).eq("id", loose).select("id, stock, slot_id");
    expect(up2.error, `admin stock 직접 update: ${up2.error?.message}`).toBeNull();
    expect(up2.data).toEqual([{ id: loose, stock: 3, slot_id: null }]);
    const iname = `S3S11-직접등록-${randomUUID().slice(0, 8)}`;
    const ins2 = await f.teacher.from("reagents").insert({ school_id: f.school.id, name: iname, unit: "g", stock: 1, storage_class: K("기타") }).select("id, slot_id");
    expect(ins2.error, `교사 slot_id 없는 insert: ${ins2.error?.message}`).toBeNull();
    expect(firstRow(ins2.data)?.slot_id).toBeNull();
    const end = await tempState(f.school.id);
    expect(reagentOf(end, placed).slot_id, "다른 열을 바꿔도 배치 그대로").toBe(L1);
  });

  test(`[R-db][S11] 칸 없음 처리는 함수 안에서 그대로 동작: save_cabinet_layout 칸 줄이기·delete_cabinet 이 배치를 풀고(unplaced_count 일치) 시약 행은 남긴다`, async ({}, info) => {
    const f = await fresh(info);
    const cab = await newCabinet(f.teacher, { L1: [K("산")] });
    const id = cab.id as string;
    let st = await tempState(f.school.id);
    const keep = await newReagent(f.teacher, K("산"), "keep");
    const gone = await newReagent(f.teacher, K("유기"), "gone");
    await placeOk(f.teacher, "준비 L1", f.school.id, keep, slotAt(st, id, "L1").id as string);
    await placeOk(f.admin, `준비 R${MAX_SHELVES}`, f.school.id, gone, slotAt(st, id, `R${MAX_SHELVES}`).id as string);
    st = await tempState(f.school.id);

    const shrink = expectOk(await saveLayout(f.admin, id, SINGLE, MIN_SHELVES, [{ side: "L", shelf: 1, classes: [K("산")] }]), "칸 줄이기");
    expect(shrink.unplaced_count).toBe(1);
    let now = await tempState(f.school.id);
    expect(now.reagents, "사라진 칸의 시약만 칸 없음").toEqual(st.reagents.map((r) => (r.id === gone ? { ...r, slot_id: null } : r)));

    st = now;
    const del = expectOk(await deleteCabinet(f.teacher, id), "delete_cabinet");
    expect(del.unplaced_count).toBe(1);
    now = await tempState(f.school.id);
    expect(now.reagents, "시약 행은 남고 전부 칸 없음").toEqual(st.reagents.map((r) => ({ ...r, slot_id: null })));
    expect(now.cabinets).toHaveLength(0);
  });

  // ---------- set_reorder_threshold ----------

  test(`[R-db][S3] set_reorder_threshold 교사·admin 성공: 그대로 덮어씀(더 작은 값도), 0·소수·${THRESHOLD_MAX.toLocaleString("en-US")}, 반환 {reagent_id, min_stock, previous_min_stock}, 근거 열 null, 출처 'manual'(자동 근거 null), 다른 시약 그대로`, async ({}, info) => {
    const f = await fresh(info);
    const r = await newReagent(f.teacher, K("산"), "thr", 7);
    const other = await newReagent(f.admin, K("염기"), "thr-other", 7);
    const start = await tempState(f.school.id);
    // d7 §11-1: 새 시약은 자동 기준(첫 입고량 × 20%)으로 시작
    expect(
      [num(reagentOf(start, r).min_stock), reagentOf(start, r).min_stock_source, reagentOf(start, r).min_stock_auto_basis],
      "새 시약 = 자동 기준 (d7 §6 · §11-1)",
    ).toEqual([autoFromIntake(7), "auto", "intake"]);

    const steps: [string, SupabaseClient, number][] = [
      ["교사 10", f.teacher, 10],
      ["admin 3 (더 작은 값도 그대로)", f.admin, 3],
      ["교사 0 (알림 없음)", f.teacher, 0],
      ["admin 2.5 (소수)", f.admin, 2.5],
      ["교사 0.125 (소수)", f.teacher, 0.125],
      [`admin ${THRESHOLD_MAX} (경계)`, f.admin, THRESHOLD_MAX],
      ["교사 1 (큰 값에서 작은 값으로)", f.teacher, 1],
    ];
    let prev = autoFromIntake(7);
    for (const [what, client, value] of steps) {
      const before = await tempState(f.school.id);
      const out = expectOk(await setThreshold(client, r, value), `set_reorder_threshold ${what}`);
      expect(Object.keys(out).sort(), "반환 키").toEqual(["min_stock", "previous_min_stock", "reagent_id"]);
      expect({ ...out, min_stock: num(out.min_stock), previous_min_stock: num(out.previous_min_stock) }).toEqual({
        reagent_id: r,
        min_stock: value,
        previous_min_stock: prev,
      });
      const after = await tempState(f.school.id);
      const row = reagentOf(after, r);
      expect(num(row.min_stock), `${what}: DB min_stock`).toBe(value);
      expect([row.reorder_per_group, row.reorder_groups], `${what}: 근거 열 null`).toEqual([null, null]);
      expect([row.min_stock_source, row.min_stock_auto_basis], `${what}: 출처 'manual' · 자동 근거 null (d7 §11-1)`).toEqual(["manual", null]);
      expect(omit(row, ["min_stock", "low_stock_since"]), `${what}: 다른 열 그대로`).toEqual({
        ...omit(reagentOf(before, r), ["min_stock", "low_stock_since"]),
        reorder_per_group: null,
        reorder_groups: null,
        min_stock_source: "manual",
        min_stock_auto_basis: null,
      });
      expect(reagentOf(after, other), `${what}: 다른 시약 그대로`).toEqual(reagentOf(before, other));
      prev = value;
    }
  });

  test(`[R-db][S3] set_reorder_threshold 잘못된 값 22023 invalid min_stock (음수·null·${THRESHOLD_MAX.toLocaleString("en-US")} 초과·NaN) — 교사·admin 모두, 값 그대로`, async ({}, info) => {
    const f = await fresh(info);
    const r = await newReagent(f.teacher, K("산"), "bad", 7);
    expectOk(await setThreshold(f.teacher, r, 4), "준비: 기준 4");
    const before = await tempState(f.school.id);
    const bad: [string, unknown][] = [
      ["-1", -1],
      ["-0.001", -0.001],
      ["null", null],
      [`${THRESHOLD_MAX}.001`, THRESHOLD_MAX + 0.001],
      [`${THRESHOLD_MAX + 1}`, THRESHOLD_MAX + 1],
      ["1e12", 1e12],
      ["NaN", "NaN"],
    ];
    for (const [label, value] of bad) {
      for (const [who, client] of [["교사", f.teacher], ["admin", f.admin]] as const) {
        expectRejected(await setThreshold(client, r, value), `${who} set_reorder_threshold(${label})`, "22023", "invalid min_stock");
      }
      expect(await tempState(f.school.id), `${label} 뒤 그대로`).toEqual(before);
    }
    expect(num(reagentOf(before, r).min_stock)).toBe(4);
  });

  test(`[R-db][S3] set_reorder_threshold 일회용 학생 42501 staff only (맞는 값·잘못된 값·없는 id 모두, 그대로)`, async ({}, info) => {
    const f = await fresh(info);
    const r = await newReagent(f.teacher, K("산"), "stu", 7);
    expectOk(await setThreshold(f.admin, r, 4), "준비: 기준 4");
    const before = await tempState(f.school.id);
    for (const [what, id, value] of [["맞는 값", r, 10], ["0", r, 0], ["음수", r, -1], ["null", r, null], ["없는 id", randomUUID(), 1]] as const) {
      expectRejected(await setThreshold(f.student, id, value), `학생 set_reorder_threshold(${what})`, "42501", "staff only");
    }
    expect(await tempState(f.school.id), "학생 호출 뒤 그대로").toEqual(before);
  });

  test(`[N1-db][S3] set_reorder_threshold 일회용 학교 ↔ 다른 일회용 학교 (양방향)·공용 계정: 다른 학교 시약 → P0002 (없는 id 와 같은 응답), anon 42501 — 두 학교 그대로`, async ({}, info) => {
    const f = await fresh(info);
    const x = await newReagent(f.teacher, K("산"), "x", 7);
    const y = await newReagent(f.otherAdmin, K("산"), "y", 7);
    expectOk(await setThreshold(f.teacher, x, 4), "준비 X");
    expectOk(await setThreshold(f.otherAdmin, y, 6), "준비 Y");
    const xs = await tempState(f.school.id);
    const ys = await tempState(f.other.id);
    const attacks: [string, SupabaseClient, string, string, string | undefined][] = [
      ["X 교사", f.teacher, y, "P0002", "reagent not found"],
      ["X admin", f.admin, y, "P0002", "reagent not found"],
      ["Y admin", f.otherAdmin, x, "P0002", "reagent not found"],
      [ROLE_LABEL.teacher, (await signIn("teacher")).client, x, "P0002", "reagent not found"],
      [ROLE_LABEL.schoolB, (await signIn("schoolB")).client, y, "P0002", "reagent not found"],
      [ROLE_LABEL.student, (await signIn("student")).client, x, "42501", "staff only"],
      ["anon", anonClient(), x, "42501", undefined],
    ];
    for (const [who, client, target, code, message] of attacks) {
      const ghost = await setThreshold(client, randomUUID(), 9);
      expectRejected(ghost, `${who} set_reorder_threshold(없는 id)`, code, message);
      for (const value of [9, 0, THRESHOLD_MAX]) {
        const res = await setThreshold(client, target, value);
        expectRejected(res, `${who} set_reorder_threshold(다른 학교 시약, ${value})`, code, message);
        expect(errorShape(res), "없는 id 와 같은 응답").toEqual(errorShape(ghost));
      }
      expect(await tempState(f.school.id), `${who} 뒤 X 그대로`).toEqual(xs);
      expect(await tempState(f.other.id), `${who} 뒤 Y 그대로`).toEqual(ys);
    }
  });

  test(`[R-db][S3] save_reorder_basis(화면 5) 로 정한 기준을 직접 입력하면 덮어쓰고 근거 열(reorder_per_group·reorder_groups)은 null — 더 큰 값·더 작은 값 모두`, async ({}, info) => {
    const f = await fresh(info);
    const r1 = await newReagent(f.teacher, K("산"), "basis1", 100);
    const r2 = await newReagent(f.teacher, K("유기"), "basis2", 100);
    const saved = await rpc(f.teacher, "save_reorder_basis", {
      p_items: [
        { reagent_id: r1, per_group: 3, groups: 4 },
        { reagent_id: r2, per_group: 2.5, groups: 6 },
      ],
    });
    expect(saved.error, `save_reorder_basis: ${saved.error?.message}`).toBeNull();
    let st = await tempState(f.school.id);
    expect([num(reagentOf(st, r1).min_stock), num(reagentOf(st, r1).reorder_per_group), reagentOf(st, r1).reorder_groups]).toEqual([12, 3, 4]);
    expect([num(reagentOf(st, r2).min_stock), num(reagentOf(st, r2).reorder_per_group), reagentOf(st, r2).reorder_groups]).toEqual([15, 2.5, 6]);

    const big = expectOk(await setThreshold(f.admin, r1, 20), "직접 입력 20 (더 큰 값)");
    expect(num(big.previous_min_stock)).toBe(12);
    const small = expectOk(await setThreshold(f.teacher, r2, 5), "직접 입력 5 (더 작은 값 — 화면 5 와 달리 그대로)");
    expect(num(small.previous_min_stock)).toBe(15);
    st = await tempState(f.school.id);
    expect([num(reagentOf(st, r1).min_stock), reagentOf(st, r1).reorder_per_group, reagentOf(st, r1).reorder_groups]).toEqual([20, null, null]);
    expect([num(reagentOf(st, r2).min_stock), reagentOf(st, r2).reorder_per_group, reagentOf(st, r2).reorder_groups]).toEqual([5, null, null]);
  });

  test(`[R-db][S3] set_reorder_threshold 와 low_stock_since (d7 §11 트리거): stock < 새 기준 → 생김, 계속 부족하면 유지, stock ≥ 기준 → null, 0 → null`, async ({}, info) => {
    const f = await fresh(info);
    const r = await newReagent(f.teacher, K("산"), "low", 7);
    const since = async () => reagentOf(await tempState(f.school.id), r).low_stock_since as string | null;
    expect(await since(), "처음 (기준 0)").toBeNull();

    const t0 = Date.now();
    expectOk(await setThreshold(f.teacher, r, 8), "기준 8 (> 재고 7)");
    const first = await since();
    expect(first, "재고 < 기준 → 알림 시각").not.toBeNull();
    expect(Math.abs(new Date(first!).getTime() - t0), "알림 시각 = 지금 (±2분)").toBeLessThan(120_000);

    expectOk(await setThreshold(f.admin, r, 9), "기준 9 (계속 부족)");
    expect(await since(), "계속 부족하면 처음 시각 유지").toBe(first);

    expectOk(await setThreshold(f.teacher, r, 7), "기준 7 (= 재고)");
    expect(await since(), "재고 ≥ 기준 → null").toBeNull();

    expectOk(await setThreshold(f.admin, r, 7.5), "기준 7.5 (소수, > 재고)");
    expect(await since(), "다시 부족 → 새 시각").not.toBeNull();

    expectOk(await setThreshold(f.teacher, r, 0), "기준 0 (알림 없음)");
    expect(await since(), "0 → null").toBeNull();
  });
});
