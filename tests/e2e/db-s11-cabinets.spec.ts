// [R-db][S11] · [N1-db][S11] · [GM-db][S*] 시약장 설정 (화면 11) — DB 권한·함수.
// 실제 RLS·함수 (publishable/anon 키 + 각 계정 로그인)로 판정한다.
// 기준: harness/d7-data.md §1·§2·§5·§9, harness/d5-gates.md R-db·N1-db·GM-db,
//       design/rules.json cabinet(door_types·shelves·storage_classes·incompatible·default_name·manage_roles·on_delete),
//       오류 형태 = supabase/migrations/20261005130000_cabinet_settings.sql 머리말 표.
//
// 절대 규칙 (운영 DB):
// - 공용 학교 A·B·데모 학교의 시약장·칸·시약 배치를 바꾸지 않는다. 공용 계정으로는 읽기와 "거부되어야 하는 호출"만 한다.
//   거부 호출은 먼저 "혹시 통과해도 아무것도 안 바뀌는" 호출(없는 id · 지금 이름 그대로)로 확인한 뒤에 실제 대상을 겨눈다.
// - 성공 경로(추가·이름 바꾸기·저장·삭제)와 잘못된 인자 검사는 일회용 학교의 일회용 계정으로만 한다
//   (잘못된 인자 검사가 구현 결함으로 통과하면 대상 시약장이 실제로 바뀌므로 공용 학교 시약장에는 하지 않는다).
//   일회용 학교·계정은 service role 로 만든다 (screen-8-helpers: createUser + register_profile, 세션은 generateLink → verifyOtp).
//   service role 은 준비·정리·대조 조회에만 쓰고, 판정 대상 호출은 항상 로그인 세션(publishable 키)으로 한다.
// - 일회용 계정은 usage_logs 를 만들지 않는다. register_reagent 가 남기는 intake_logs 는 시약을 지우면 cascade 로 지워진다 —
//   정리 순서: 시약 → 시약장(칸 cascade) → 프로필 → 계정 → 학교. 끝에 잔여물 0 을 단언한다.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type TestInfo } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ROLE_LABEL, anonClient, signIn, type Role, type Session } from "./db-helpers";
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

// ---------- 규칙 (design/rules.json cabinet · d7 §9) ----------

const rules = JSON.parse(readFileSync(join(process.cwd(), "design", "rules.json"), "utf8")) as {
  cabinet: {
    door_types: string[];
    shelves: number[];
    storage_classes: string[];
    incompatible: string[][];
    default_name: string;
    manage_roles: string[];
  };
};
const CAB = rules.cabinet;
const CLASSES = CAB.storage_classes;
/** d7 §9: 양문형 = 좌·우 두 쪽, 단문형 = 한쪽만(L) */
const DOUBLE = "양문형";
const SINGLE = "단문형";
const MAX_SHELVES = Math.max(...CAB.shelves);
const MIN_SHELVES = Math.min(...CAB.shelves);
/** d7 §9 "추가": 기본 양문형·4단 */
const DEFAULT_DOOR = DOUBLE;
const DEFAULT_SHELVES = 4;
/** d7 §9 "추가": 학교당 최대 20개 */
const CABINET_MAX = 20;
/** d7 §9 "이름 바꾸기": trim 후 1~20자 */
const LABEL_MAX = 20;

const defaultName = (n: number) => CAB.default_name.replace("{n}", String(n));
/** 같은 이름 판정 (d7 §9 같은 학교에 같은 이름 불가 — 대소문자·공백 차이는 같은 이름) */
const normLabel = (s: string) => s.replace(/\s+/g, "").toLowerCase();
const sortClasses = (list: string[]) => CLASSES.filter((c) => list.includes(c));
const sidesOf = (door: string) => (door === SINGLE ? ["L"] : ["L", "R"]);
const gridKeys = (door: string, shelves: number) =>
  sidesOf(door).flatMap((side) => Array.from({ length: shelves }, (_, i) => `${side}${i + 1}`)).sort();

const GROUP = "s11db";
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
type RpcError = { code?: string; message: string; details?: string | null };
type RpcResult = { data: unknown; error: RpcError | null };
type Cell = { side: unknown; shelf: unknown; classes: unknown };
type Actor = Role | "anon";

const labelOf = (who: Actor) => (who === "anon" ? "anon" : ROLE_LABEL[who]);

async function clientOf(who: Actor): Promise<{ client: SupabaseClient; session: Session | null }> {
  if (who === "anon") return { client: anonClient(), session: null };
  const session = await signIn(who);
  return { client: session.client, session };
}

async function rpc(client: SupabaseClient, fn: string, args: Row = {}): Promise<RpcResult> {
  const res = await client.rpc(fn, args);
  return { data: res.data, error: res.error };
}

const addCabinet = (c: SupabaseClient) => rpc(c, "add_cabinet");
const renameCabinet = (c: SupabaseClient, id: unknown, label: unknown) =>
  rpc(c, "rename_cabinet", { p_cabinet_id: id, p_label: label });
const saveLayout = (c: SupabaseClient, id: unknown, door: unknown, shelves: unknown, slots: unknown) =>
  rpc(c, "save_cabinet_layout", { p_cabinet_id: id, p_door_type: door, p_shelves: shelves, p_slots: slots });
const deleteCabinet = (c: SupabaseClient, id: unknown) => rpc(c, "delete_cabinet", { p_cabinet_id: id });

function firstRow(data: unknown): Row | null {
  if (Array.isArray(data)) return (data[0] as Row | undefined) ?? null;
  return (data as Row | null) ?? null;
}

function rowsOf(data: unknown): Row[] {
  if (Array.isArray(data)) return data as Row[];
  return data ? [data as Row] : [];
}

/**
 * DB 가 거부했는지: 오류가 있고, PostgREST 의 "함수·인자 못 찾음"(PGRST…)이 아니며, 반환 값이 없다.
 * code·message 를 주면 그 값과 정확히 같아야 한다 (마이그레이션 머리말 표).
 */
function expectRejected(res: RpcResult, what: string, code?: string, message?: string): void {
  expect(res.error, `${what} 는 오류여야 함`).not.toBeNull();
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
  return { code: res.error?.code ?? null, message: res.error?.message ?? null, details: res.error?.details ?? null };
}

/** 바뀐 행 수: RLS 로 안 보이면 error 없이 0행, 권한이 없으면 오류 — 어느 쪽이든 0 이어야 한다 */
function changed(res: { error: unknown; data: unknown[] | null }): number {
  return res.error ? 0 : (res.data ?? []).length;
}

// ---------- 공용 학교·데모 학교 상태 (읽기만) ----------

type State = { cabinets: Row[]; slots: Row[]; placed: Row[] };

/**
 * 한 학교의 시약장·칸·시약 배치. 시약은 "칸에 배치된 것"의 (id, slot_id)만 본다 —
 * 다른 스펙이 학교 A 에 잠깐 만드는 임시 시약(slot 없음)·stock 변화에 흔들리지 않는다.
 */
async function stateOf(client: SupabaseClient, schoolId: string): Promise<State> {
  const cabinets = await client.from("cabinets").select("*").eq("school_id", schoolId).order("id");
  const slots = await client.from("cabinet_slots").select("*").eq("school_id", schoolId).order("id");
  const placed = await client.from("reagents").select("id, slot_id").eq("school_id", schoolId).not("slot_id", "is", null).order("id");
  expect(cabinets.error, `cabinets 조회: ${cabinets.error?.message}`).toBeNull();
  expect(slots.error, `cabinet_slots 조회: ${slots.error?.message}`).toBeNull();
  expect(placed.error, `reagents 조회: ${placed.error?.message}`).toBeNull();
  return { cabinets: (cabinets.data ?? []) as Row[], slots: (slots.data ?? []) as Row[], placed: (placed.data ?? []) as Row[] };
}

const sharedState = (s: Session) => stateOf(s.client, s.schoolId);
const demoState = () => stateOf(anonClient(), DEMO_SCHOOL_ID);

/** 지금 칸 구성 그대로의 p_slots (혹시 저장이 통과해도 분류가 바뀌지 않게) */
function currentCells(state: State, cabinetId: string): Cell[] {
  return state.slots
    .filter((s) => s.cabinet_id === cabinetId)
    .map((s) => ({ side: s.side, shelf: s.shelf, classes: s.storage_classes }));
}

/**
 * 거부되어야 하는 rename·save·delete 를 순서대로 겨눈다 (덜 위험한 호출 먼저 — 앞 단언이 실패하면 뒤 호출은 하지 않는다).
 * ghost 를 주면 "없는 id" 응답과 겉모습이 같아야 한다 (존재 여부 비노출).
 */
async function expectAllRejected(
  client: SupabaseClient,
  who: string,
  cab: Row,
  cells: Cell[],
  code: string,
  message?: string,
  ghost?: { rename: RpcResult; save: RpcResult; del: RpcResult },
): Promise<void> {
  const id = cab.id as string;
  const same = await renameCabinet(client, id, cab.label);
  expectRejected(same, `${who} rename_cabinet(지금 이름 그대로)`, code, message);
  if (ghost) expect(errorShape(same), "없는 id 와 같은 응답").toEqual(errorShape(ghost.rename));
  const other = await renameCabinet(client, id, "S11-침범");
  expectRejected(other, `${who} rename_cabinet`, code, message);
  if (ghost) expect(errorShape(other), "없는 id 와 같은 응답").toEqual(errorShape(ghost.rename));

  const keep = await saveLayout(client, id, cab.door_type, cab.shelves, cells);
  expectRejected(keep, `${who} save_cabinet_layout(지금 구성 그대로)`, code, message);
  if (ghost) expect(errorShape(keep), "없는 id 와 같은 응답").toEqual(errorShape(ghost.save));
  const shrink = await saveLayout(client, id, SINGLE, MIN_SHELVES, []);
  expectRejected(shrink, `${who} save_cabinet_layout`, code, message);
  if (ghost) expect(errorShape(shrink), "없는 id 와 같은 응답").toEqual(errorShape(ghost.save));

  const del = await deleteCabinet(client, id);
  expectRejected(del, `${who} delete_cabinet`, code, message);
  if (ghost) expect(errorShape(del), "없는 id 와 같은 응답").toEqual(errorShape(ghost.del));
}

async function ghostCalls(client: SupabaseClient, who: string, code: string, message?: string) {
  const id = randomUUID();
  const rename = await renameCabinet(client, id, "S11-없는 시약장");
  expectRejected(rename, `${who} rename_cabinet(없는 id)`, code, message);
  const save = await saveLayout(client, id, DEFAULT_DOOR, DEFAULT_SHELVES, []);
  expectRejected(save, `${who} save_cabinet_layout(없는 id)`, code, message);
  const del = await deleteCabinet(client, id);
  expectRejected(del, `${who} delete_cabinet(없는 id)`, code, message);
  return { rename, save, del };
}

/** 비상 정리: 거부되어야 할 추가·직접 insert 가 구현 결함으로 성공했을 때만 지운다 (정상이라면 호출 없음) */
async function dropLeaked(staff: Session, ids: string[]): Promise<void> {
  for (const id of ids) await deleteCabinet(staff.client, id);
}

// ---------- 일회용 학교 (성공 경로) ----------

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
 * 일회용 학교의 시약·시약장·칸을 비운다 (service role — 준비). 시약 → 시약장(칸 cascade) 순서.
 * d7 §14: 시약장 번호는 학교의 마지막 번호(schools.cabinet_seq)를 이어 쓴다(삭제된 번호를 다시 쓰지 않음 — 정상 동작).
 * 테스트마다 "새 학교" 에서 시작하도록 **이 일회용 학교의** cabinet_seq 만 0 으로 되돌린다 (실행 순서와 무관하게).
 * 번호를 다시 쓰지 않는지는 각 테스트 안에서(되돌리지 않은 상태로) 본다.
 */
async function purge(schoolIds: string[]): Promise<void> {
  if (!schoolIds.length) return;
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

type TempState = { cabinets: Row[]; slots: Row[]; reagents: Row[]; intakeLogs: number };

/** 대조 조회 (service role): 일회용 학교의 시약장·칸·시약 전체 열 + 입고 기록 수 */
async function tempState(schoolId: string): Promise<TempState> {
  const sb = service();
  const cabinets = await sb.from("cabinets").select("*").eq("school_id", schoolId).order("created_at").order("id");
  const slots = await sb.from("cabinet_slots").select("*").eq("school_id", schoolId).order("id");
  const reagents = await sb.from("reagents").select("*").eq("school_id", schoolId).order("id");
  const logs = await sb.from("intake_logs").select("id").eq("school_id", schoolId);
  for (const q of [cabinets, slots, reagents, logs]) expect(q.error, `대조 조회: ${q.error?.message}`).toBeNull();
  return {
    cabinets: (cabinets.data ?? []) as Row[],
    slots: (slots.data ?? []) as Row[],
    reagents: (reagents.data ?? []) as Row[],
    intakeLogs: (logs.data ?? []).length,
  };
}

const slotsOf = (st: TempState, cabinetId: string) => st.slots.filter((s) => s.cabinet_id === cabinetId);
const slotKey = (s: Row) => `${s.side}${s.shelf}`;
const slotAt = (st: TempState, cabinetId: string, key: string): Row => {
  const s = slotsOf(st, cabinetId).find((x) => slotKey(x) === key);
  if (!s) throw new Error(`칸 ${key} 행이 없음`);
  return s;
};
const reagentOf = (st: TempState, id: string): Row => {
  const r = st.reagents.find((x) => x.id === id);
  if (!r) throw new Error(`시약 ${id} 행이 없음`);
  return r;
};

/** 시약장의 칸 행이 격자(문 형태 × 단 수)와 정확히 같고, 분류가 기대와 같은지 (없는 키 = 미지정) */
function expectSlots(st: TempState, cab: Row, door: string, shelves: number, want: Record<string, string[]>, what: string): void {
  const rows = slotsOf(st, cab.id as string);
  expect(rows.map(slotKey).sort(), `${what}: 칸 행 = ${door} ${shelves}단 격자`).toEqual(gridKeys(door, shelves));
  for (const s of rows) {
    const classes = sortClasses(want[slotKey(s)] ?? []);
    expect(s.school_id, `${what}: 칸 ${slotKey(s)} school_id`).toBe(cab.school_id);
    expect(s.storage_classes, `${what}: 칸 ${slotKey(s)} storage_classes (규칙 순서)`).toEqual(classes);
    expect(s.storage_class, `${what}: 칸 ${slotKey(s)} 예전 열 storage_class = 첫 분류 또는 null`).toBe(classes[0] ?? null);
  }
}

let placedByService = 0;

/** 일회용 학교에 임시 시약 (register_reagent — 교사·admin 세션). 새 시약은 "칸 없음" (d7 §6·§9). */
async function newReagent(client: SupabaseClient, tag: string): Promise<string> {
  const res = await rpc(client, "register_reagent", {
    p_name: `S11-${tag}-${randomUUID().slice(0, 8)}`,
    p_storage_class: CLASSES[0],
    p_stock: 7,
    p_unit: "g",
    p_intake_date: "2026-09-15",
    p_msds_url: null,
  });
  const row = expectOk(res, "register_reagent (준비)");
  expect(row.slot_id, "새로 등록한 시약은 칸 없음").toBeNull();
  return row.id as string;
}

/**
 * 시약을 칸에 배치: 교사 세션의 DB 함수 place_reagent (d7 §14 — 배치는 함수 경유, 교사의 slot_id 직접 update 는 닫힘).
 * 함수가 실패하거나 다른 칸을 돌려주면 service role 로 하고 표시를 남긴다 (맨 끝 테스트가 0건을 단언).
 */
async function place(f: Fixture, info: TestInfo, reagentId: string, slotId: string): Promise<void> {
  const res = await rpc(f.teacher, "place_reagent", { p_reagent_id: reagentId, p_slot_id: slotId });
  const out = res.error ? null : firstRow(res.data);
  if (out && out.reagent_id === reagentId && out.slot_id === slotId) {
    const now = await service().from("reagents").select("slot_id").eq("id", reagentId).single();
    if (!now.error && now.data?.slot_id === slotId) return;
  }
  placedByService += 1;
  info.annotations.push({
    type: "placement-by-service-role",
    description: `교사 place_reagent 로 배치 실패 (${res.error?.code ?? "반환값 불일치"} ${res.error?.message ?? JSON.stringify(res.data)}) → service role 로 배치`,
  });
  const forced = await service().from("reagents").update({ slot_id: slotId }).eq("id", reagentId).select("id");
  expect(forced.error, `service role 배치: ${forced.error?.message}`).toBeNull();
  expect(forced.data ?? []).toHaveLength(1);
}

// ---------- 앞뒤 불변 확인·정리 ----------

let sharedBefore: { a: State; b: State; demo: State } | null = null;

test.beforeAll(async () => {
  sharedBefore = {
    a: await sharedState(await signIn("teacher")),
    b: await sharedState(await signIn("schoolB")),
    demo: await demoState(),
  };
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
  // 공용 학교 A·B·데모 학교의 시약장·칸·시약 배치는 그대로
  if (sharedBefore) {
    expect(await sharedState(await signIn("teacher")), "학교 A 시약장·칸·배치").toEqual(sharedBefore.a);
    expect(await sharedState(await signIn("schoolB")), "학교 B 시약장·칸·배치").toEqual(sharedBefore.b);
    expect(await demoState(), "데모 학교 시약장·칸·배치").toEqual(sharedBefore.demo);
  }
});

// ======================================================================
// 규칙 전제
// ======================================================================

test(`[R-db][S11] 규칙 전제: rules.json cabinet 의 문 형태 2종·단 수·분류·기본 이름이 d7 §9 와 맞는다`, async () => {
  expect([...CAB.door_types].sort()).toEqual([DOUBLE, SINGLE].sort());
  expect(CAB.shelves).toContain(DEFAULT_SHELVES);
  expect(CAB.default_name).toContain("{n}");
  expect(new Set(CLASSES).size).toBe(CLASSES.length);
  expect(CAB.manage_roles.sort()).toEqual(["admin", "교사"].sort());
  for (const pair of CAB.incompatible) for (const c of pair) expect(CLASSES).toContain(c);
});

// ======================================================================
// R-db: 학생은 네 함수 모두 거부 (d7 §9 권한 — 추가·이름·저장·삭제는 교사·admin 만)
// ======================================================================

test(`[R-db][S11] 학교A 학생 add_cabinet·rename_cabinet·save_cabinet_layout·delete_cabinet 거부 42501 (학교 A 시약장·칸·배치 그대로)`, async () => {
  const st = await signIn("student");
  const t = await signIn("teacher");
  expect(st.profileRole).toBe("student");
  expect(st.schoolId).toBe(t.schoolId);
  const before = await sharedState(t);
  expect(before.cabinets.length, "학교 A 시약장 ≥1 (seed)").toBeGreaterThan(0);

  // 1) 없는 id — 역할 검사가 대상 조회보다 먼저여야 한다 (42501, P0002 아님). 통과해야 실제 대상을 겨눈다.
  await ghostCalls(st.client, "학생", "42501", "staff only");

  // 2) 학교 A 의 실제 시약장 전부
  for (const cab of before.cabinets) {
    await expectAllRejected(st.client, "학생", cab, currentCells(before, cab.id as string), "42501", "staff only");
  }

  // 3) add_cabinet (통과하면 시약장이 생기므로 마지막에 — 생겼다면 지우고 실패로 알린다)
  const add = await addCabinet(st.client);
  const after = await sharedState(t);
  const known = new Set(before.cabinets.map((c) => c.id));
  await dropLeaked(t, after.cabinets.filter((c) => !known.has(c.id)).map((c) => c.id as string));
  expectRejected(add, "학생 add_cabinet", "42501", "staff only");
  expect(after, "학교 A 시약장·칸·배치 그대로").toEqual(before);

  // 학생은 보기는 된다 (d7 §9 보기: 학생·교사·admin 모두)
  expect(await sharedState(st), "학생이 보는 학교 A 시약장·칸·배치 = 교사가 보는 것").toEqual(before);
});

// ======================================================================
// R-db · N1-db: cabinets·cabinet_slots 직접 쓰기는 모든 역할 거부 (d7 §9 "직접 쓰기")
// ======================================================================

for (const who of ["student", "teacher", "admin", "schoolB", "anon"] as Actor[]) {
  const rule = who === "schoolB" || who === "anon" ? "N1-db" : "R-db";
  test(`[${rule}][S11] ${labelOf(who)} 학교 A cabinets·cabinet_slots 직접 insert·update·delete 거부 (값 그대로)`, async () => {
    const { client, session } = await clientOf(who);
    const t = await signIn("teacher");
    const before = await sharedState(t);
    const cab = before.cabinets[0];
    const slot = before.slots.find((s) => s.cabinet_id === cab.id) ?? before.slots[0];
    expect(slot, "학교 A 칸 ≥1 (seed)").toBeTruthy();
    const taken = new Set(before.slots.filter((s) => s.cabinet_id === cab.id).map(slotKey));
    const free = gridKeys(String(cab.door_type), Number(cab.shelves)).find((k) => !taken.has(k)) ?? "L1";
    const label = `S11-직접-${randomUUID().slice(0, 8)}`;

    // insert: 학교 A · (로그인 사용자는) 자기 학교
    const schoolIds = Array.from(new Set([t.schoolId, session?.schoolId ?? t.schoolId]));
    for (const schoolId of schoolIds) {
      const ins = await client
        .from("cabinets")
        .insert({ school_id: schoolId, label, door_type: DEFAULT_DOOR, shelves: DEFAULT_SHELVES })
        .select("id");
      // 혹시 생겼다면 그 학교의 교사 계정으로 지운다 (비상 정리)
      for (const owner of [t, await signIn("schoolB")]) {
        const leaked = await owner.client.from("cabinets").select("id").eq("label", label);
        await dropLeaked(owner, (leaked.data ?? []).map((r) => r.id as string));
        expect(leaked.data ?? [], `${labelOf(who)} 직접 insert 로 생긴 시약장`).toHaveLength(0);
      }
      expect(ins.error, `${labelOf(who)} cabinets insert 는 오류여야 함`).not.toBeNull();
      expect(ins.error?.code, `권한 오류여야 함 (${ins.error?.message})`).toBe("42501");
    }
    for (const patch of [{ storage_class: CLASSES[1] }, { storage_classes: [CLASSES[1]] }, { storage_classes: [] as string[] }]) {
      const ins = await client
        .from("cabinet_slots")
        .insert({ school_id: t.schoolId, cabinet_id: cab.id as string, side: free[0], shelf: Number(free.slice(1)), ...patch })
        .select("id");
      expect(ins.error, `${labelOf(who)} cabinet_slots insert 는 오류여야 함`).not.toBeNull();
      expect(ins.error?.code, `권한 오류여야 함 (${ins.error?.message})`).toBe("42501");
    }

    // update: 0행 (직접 되돌릴 길이 없으므로 값 비교는 맨 끝의 전체 상태 비교가 한다)
    const otherClass = CLASSES.find((c) => !(slot.storage_classes as string[]).includes(c))!;
    const updates: [string, Row, string][] = [
      ["cabinets", { label }, cab.id as string],
      ["cabinets", { door_type: cab.door_type === SINGLE ? DOUBLE : SINGLE }, cab.id as string],
      ["cabinets", { shelves: cab.shelves === MAX_SHELVES ? MIN_SHELVES : MAX_SHELVES }, cab.id as string],
      ["cabinet_slots", { storage_class: otherClass }, slot.id as string],
      ["cabinet_slots", { storage_classes: [otherClass] }, slot.id as string],
      ["cabinet_slots", { storage_classes: [] }, slot.id as string],
    ];
    for (const [table, patch, id] of updates) {
      const upd = await client.from(table).update(patch).eq("id", id).select("id");
      expect(changed(upd), `${labelOf(who)} ${table} update ${JSON.stringify(patch)} 로 바뀐 행`).toBe(0);
      const all = await client.from(table).update(patch).eq("school_id", t.schoolId).select("id");
      expect(changed(all), `${labelOf(who)} ${table} 학교 전체 update 로 바뀐 행`).toBe(0);
    }
    expect(await sharedState(t), "update 뒤 학교 A 그대로").toEqual(before);

    // delete: 없는 id 로 먼저 (delete 권한이 없으면 여기서도 오류), 그 다음 칸 → 시약장
    for (const table of ["cabinet_slots", "cabinets"]) {
      const ghost = await client.from(table).delete().eq("id", randomUUID()).select("id");
      expect(ghost.error, `${labelOf(who)} ${table} delete 는 오류여야 함 (delete 권한 없음)`).not.toBeNull();
      expect(ghost.error?.code, ghost.error?.message).toBe("42501");
    }
    const sd = await client.from("cabinet_slots").delete().eq("id", slot.id as string).select("id");
    expect(changed(sd), `${labelOf(who)} cabinet_slots delete 로 지워진 행`).toBe(0);
    const cd = await client.from("cabinets").delete().eq("id", cab.id as string).select("id");
    expect(changed(cd), `${labelOf(who)} cabinets delete 로 지워진 행`).toBe(0);

    expect(await sharedState(t), "학교 A 시약장·칸·배치 그대로").toEqual(before);
  });
}

// ======================================================================
// R-db: 교사·admin 이어도 없는 시약장은 not found
// ======================================================================

for (const role of ["teacher", "admin", "schoolB"] as Role[]) {
  test(`[R-db][S11] ${ROLE_LABEL[role]} rename·save·delete 없는 시약장 id → cabinet not found (P0002, 자기 학교 그대로)`, async () => {
    const s = await signIn(role);
    const before = await sharedState(s);
    await ghostCalls(s.client, ROLE_LABEL[role], "P0002", "cabinet not found");
    // 잘못된 값과 함께여도 없는 id 는 not found (대상이 없으므로 아무것도 바뀌지 않는다)
    expectRejected(await renameCabinet(s.client, randomUUID(), ""), "없는 id + 빈 이름", "P0002", "cabinet not found");
    expectRejected(await saveLayout(s.client, randomUUID(), "삼문형", 9, {}), "없는 id + 잘못된 값", "P0002", "cabinet not found");
    for (const fn of [() => renameCabinet(s.client, null, "S11-null"), () => saveLayout(s.client, null, DEFAULT_DOOR, DEFAULT_SHELVES, []), () => deleteCabinet(s.client, null)]) {
      expectRejected(await fn(), "null id");
    }
    expect(await sharedState(s), "자기 학교 시약장·칸·배치 그대로").toEqual(before);
  });
}

// ======================================================================
// N1-db: 다른 학교 시약장은 "없는 시약장"과 똑같이 거부 (존재 여부 비노출)
// ======================================================================

const CROSS: [Role, Role, string][] = [
  ["teacher", "schoolB", "학교 B"],
  ["admin", "schoolB", "학교 B"],
  ["schoolB", "teacher", "학교 A"],
];

for (const [attacker, owner, ownerSchool] of CROSS) {
  test(`[N1-db][S11] ${ROLE_LABEL[attacker]}가 ${ownerSchool} 시약장 rename·save·delete → cabinet not found (없는 id 와 같은 응답, ${ownerSchool} 시약장·칸·배치 그대로)`, async () => {
    const a = await signIn(attacker);
    const o = await signIn(owner);
    expect(a.schoolId).not.toBe(o.schoolId);
    expect(["teacher", "admin"], "공격자는 자기 학교에서는 권한이 있는 역할").toContain(a.profileRole);
    const before = await sharedState(o);
    const mine = await sharedState(a);
    expect(before.cabinets.length, `${ownerSchool} 시약장 ≥1 (seed)`).toBeGreaterThan(0);

    // 다른 학교 시약장·칸은 보이지 않는다
    for (const table of ["cabinets", "cabinet_slots"]) {
      const seen = await a.client.from(table).select("id").eq("school_id", o.schoolId);
      expect(seen.error).toBeNull();
      expect(seen.data ?? [], `${ROLE_LABEL[attacker]}가 보는 ${ownerSchool} ${table}`).toHaveLength(0);
    }
    const byId = await a.client.from("cabinets").select("id").in("id", before.cabinets.map((c) => c.id as string));
    expect(byId.data ?? []).toHaveLength(0);

    const ghost = await ghostCalls(a.client, ROLE_LABEL[attacker], "P0002", "cabinet not found");
    for (const cab of before.cabinets) {
      await expectAllRejected(a.client, ROLE_LABEL[attacker], cab, currentCells(before, cab.id as string), "P0002", "cabinet not found", ghost);
    }
    expect(await sharedState(o), `${ownerSchool} 시약장·칸·배치 그대로`).toEqual(before);
    expect(await sharedState(a), "공격자 자기 학교도 그대로").toEqual(mine);
  });
}

test(`[N1-db][S11] anon 은 add·rename·save·delete 호출 불가 42501 (없는 id·학교 A·데모 학교 시약장, 모두 그대로)`, async () => {
  const anon = anonClient();
  const t = await signIn("teacher");
  const before = { a: await sharedState(t), demo: await demoState() };
  await ghostCalls(anon, "anon", "42501");
  for (const [state, name] of [[before.a, "학교 A"], [before.demo, "데모 학교"]] as const) {
    for (const cab of state.cabinets) {
      await expectAllRejected(anon, `anon → ${name}`, cab, currentCells(state, cab.id as string), "42501");
    }
  }
  expectRejected(await addCabinet(anon), "anon add_cabinet", "42501");
  expect(await sharedState(t), "학교 A 그대로").toEqual(before.a);
  expect(await demoState(), "데모 학교 그대로").toEqual(before.demo);
});

test(`[N1-db][S11] 네 함수에 학교를 넘길 방법이 없다 (p_school_id·school_id 인자 거부, 어느 학교에도 변화 없음)`, async () => {
  const t = await signIn("teacher");
  const b = await signIn("schoolB");
  const before = { a: await sharedState(t), b: await sharedState(b) };
  const bCab = before.b.cabinets[0];
  for (const key of ["p_school_id", "school_id"]) {
    const add = await rpc(t.client, "add_cabinet", { [key]: b.schoolId });
    expect(add.error, `${key} 인자를 받는 add_cabinet 은 없어야 함`).not.toBeNull();
    const ren = await rpc(t.client, "rename_cabinet", { p_cabinet_id: bCab.id, p_label: bCab.label, [key]: b.schoolId });
    expect(ren.error, `${key} 인자를 받는 rename_cabinet 은 없어야 함`).not.toBeNull();
    const save = await rpc(t.client, "save_cabinet_layout", {
      p_cabinet_id: bCab.id,
      p_door_type: bCab.door_type,
      p_shelves: bCab.shelves,
      p_slots: currentCells(before.b, bCab.id as string),
      [key]: b.schoolId,
    });
    expect(save.error, `${key} 인자를 받는 save_cabinet_layout 은 없어야 함`).not.toBeNull();
    const del = await rpc(t.client, "delete_cabinet", { p_cabinet_id: randomUUID(), [key]: b.schoolId });
    expect(del.error, `${key} 인자를 받는 delete_cabinet 은 없어야 함`).not.toBeNull();
  }
  const afterA = await sharedState(t);
  const known = new Set(before.a.cabinets.map((c) => c.id));
  await dropLeaked(t, afterA.cabinets.filter((c) => !known.has(c.id)).map((c) => c.id as string));
  expect(afterA, "학교 A 그대로").toEqual(before.a);
  expect(await sharedState(b), "학교 B 그대로").toEqual(before.b);
});

// ======================================================================
// GM-db: 데모 학교 시약장은 누구도 바꿀 수 없고, anon 은 계속 읽을 수 있다 (d7 §5·§9)
// ======================================================================

for (const who of ["student", "teacher", "admin", "schoolB"] as Role[]) {
  test(`[GM-db][S*] ${ROLE_LABEL[who]}로 데모 학교 시약장 rename·save·delete 거부 (데모 학교 시약장·칸·배치 그대로)`, async () => {
    const s = await signIn(who);
    expect(s.schoolId).not.toBe(DEMO_SCHOOL_ID);
    const before = await demoState();
    expect(before.cabinets.length, "데모 학교 시약장 ≥1 (seed)").toBeGreaterThan(0);
    const mine = await sharedState(s);
    // 학생은 역할에서(42501), 교사·admin 은 "자기 학교 시약장이 아님"에서(P0002) 걸린다
    const [code, message] = s.profileRole === "student" ? ["42501", "staff only"] : ["P0002", "cabinet not found"];
    const ghost = await ghostCalls(s.client, ROLE_LABEL[who], code, message);
    for (const cab of before.cabinets) {
      await expectAllRejected(s.client, `${ROLE_LABEL[who]} → 데모 학교`, cab, currentCells(before, cab.id as string), code, message, ghost);
    }
    // 로그인 사용자에게 데모 학교 시약장·칸은 보이지 않는다
    for (const table of ["cabinets", "cabinet_slots"]) {
      const seen = await s.client.from(table).select("id").eq("school_id", DEMO_SCHOOL_ID);
      expect(seen.error ? [] : seen.data ?? [], `${ROLE_LABEL[who]}가 보는 데모 ${table}`).toHaveLength(0);
    }
    expect(await demoState(), "데모 학교 시약장·칸·배치 그대로").toEqual(before);
    expect(await sharedState(s), "자기 학교도 그대로").toEqual(mine);
  });
}

test(`[GM-db][S*] anon 은 데모 학교 시약장·칸(storage_classes 포함)을 읽고, 실제 학교 시약장·칸은 0행`, async () => {
  const anon = anonClient();
  const demo = await demoState();
  expect(demo.cabinets.length, "데모 학교 시약장 ≥1").toBeGreaterThan(0);
  expect(demo.slots.length, "데모 학교 칸 ≥1").toBeGreaterThan(0);

  // 필터 없이 읽어도 전부 데모 학교
  for (const table of ["cabinets", "cabinet_slots"]) {
    const all = await anon.from(table).select("id, school_id");
    expect(all.error, `anon ${table} select: ${all.error?.message}`).toBeNull();
    expect((all.data ?? []).filter((r) => r.school_id !== DEMO_SCHOOL_ID), `anon ${table} 중 데모 학교가 아닌 행`).toHaveLength(0);
    expect((all.data ?? []).length).toBe(table === "cabinets" ? demo.cabinets.length : demo.slots.length);
  }

  // 시약장: 규칙의 문 형태·단 수. d7 §5: 데모 시약장은 양문형 4단·칸 분류 지정
  for (const cab of demo.cabinets) {
    expect(CAB.door_types).toContain(cab.door_type);
    expect(CAB.shelves).toContain(cab.shelves);
  }
  expect(demo.cabinets.some((c) => c.door_type === DOUBLE && c.shelves === 4), "데모 시약장 양문형 4단 (d7 §5)").toBe(true);

  // 칸: storage_classes 는 규칙 8종 안·규칙 순서·중복 없음, 예전 열은 첫 분류 또는 null
  for (const s of demo.slots) {
    const classes = s.storage_classes as string[];
    expect(Array.isArray(classes), `칸 ${slotKey(s)} storage_classes 는 배열`).toBe(true);
    expect(classes, `칸 ${slotKey(s)} 분류 = 규칙 순서·8종 안`).toEqual(sortClasses(classes));
    expect(new Set(classes).size).toBe(classes.length);
    expect(s.storage_class, `칸 ${slotKey(s)} 예전 열`).toBe(classes[0] ?? null);
    const cab = demo.cabinets.find((c) => c.id === s.cabinet_id);
    expect(cab, "칸의 시약장도 데모 학교").toBeTruthy();
    expect(gridKeys(String(cab!.door_type), Number(cab!.shelves)), `칸 ${slotKey(s)} 는 격자 안`).toContain(slotKey(s));
  }
  expect(demo.slots.some((s) => (s.storage_classes as string[]).length > 0), "분류가 지정된 데모 칸 ≥1 (d7 §5)").toBe(true);
  // 데모 시약의 배치는 데모 칸을 가리킨다
  const slotIds = new Set(demo.slots.map((s) => s.id));
  expect(demo.placed.length, "배치된 데모 시약 ≥1").toBeGreaterThan(0);
  for (const r of demo.placed) expect(slotIds.has(r.slot_id), `데모 시약 ${r.id} 의 칸`).toBe(true);

  // 실제 학교(A·B) 시약장·칸은 0행
  for (const role of ["teacher", "schoolB"] as Role[]) {
    const real = await signIn(role);
    const own = await sharedState(real);
    expect(own.cabinets.length, `${ROLE_LABEL[role]} 자기 학교 시약장 (양성 대조군)`).toBeGreaterThan(0);
    for (const [table, ids] of [["cabinets", own.cabinets], ["cabinet_slots", own.slots]] as const) {
      const bySchool = await anon.from(table).select("id").eq("school_id", real.schoolId);
      expect(bySchool.error ? [] : bySchool.data ?? [], `anon → ${ROLE_LABEL[role]} 학교 ${table}`).toHaveLength(0);
      const byId = await anon.from(table).select("id").in("id", ids.map((r) => r.id as string));
      expect(byId.error ? [] : byId.data ?? [], `anon → ${ROLE_LABEL[role]} 학교 ${table} id 직접 조회`).toHaveLength(0);
    }
  }
});

// ======================================================================
// 성공 경로·잘못된 인자 — 일회용 학교 (service role 로 준비·정리). 키가 없으면 skip.
// ======================================================================

test.describe("일회용 학교", () => {
  test.describe.configure({ mode: "default" });
  test.skip(!HAS_SERVICE, NO_SERVICE_REASON);

  // ---------- add_cabinet ----------

  test(`[R-db][S11] 교사·admin add_cabinet 성공: 첫 시약장 "${defaultName(1)}"·양문형·4단·칸 8행 모두 미지정, 학생은 거부·보기만`, async ({}, info) => {
    const f = await fresh(info);
    expect(await tempState(f.school.id), "빈 학교에서 시작").toMatchObject({ cabinets: [], slots: [] });

    const first = expectOk(await addCabinet(f.teacher), "교사 add_cabinet");
    expect(first).toMatchObject({ school_id: f.school.id, label: defaultName(1), door_type: DEFAULT_DOOR, shelves: DEFAULT_SHELVES });
    let st = await tempState(f.school.id);
    expect(st.cabinets, "cabinets 행 = 반환 행").toEqual([first]);
    expect(slotsOf(st, first.id as string), "칸 = 좌·우 × 단 수").toHaveLength(2 * DEFAULT_SHELVES);
    expectSlots(st, first, DEFAULT_DOOR, DEFAULT_SHELVES, {}, "첫 시약장");

    const second = expectOk(await addCabinet(f.admin), "admin add_cabinet");
    expect(second).toMatchObject({ school_id: f.school.id, label: defaultName(2), door_type: DEFAULT_DOOR, shelves: DEFAULT_SHELVES });
    const third = expectOk(await addCabinet(f.teacher), "교사 add_cabinet (세 번째)");
    expect(third.label).toBe(defaultName(3));
    st = await tempState(f.school.id);
    expect(st.cabinets.map((c) => c.id)).toEqual([first.id, second.id, third.id]);
    for (const cab of [second, third]) expectSlots(st, cab, DEFAULT_DOOR, DEFAULT_SHELVES, {}, String(cab.label));
    expect(st.slots).toHaveLength(3 * 2 * DEFAULT_SHELVES);

    // 학생: 네 함수 모두 42501, 아무것도 바뀌지 않는다
    expectRejected(await addCabinet(f.student), "일회용 학생 add_cabinet", "42501", "staff only");
    await expectAllRejected(
      f.student,
      "일회용 학생",
      first,
      slotsOf(st, first.id as string).map((s) => ({ side: s.side, shelf: s.shelf, classes: s.storage_classes })),
      "42501",
      "staff only",
    );
    expect(await tempState(f.school.id), "학생 호출 뒤 그대로").toEqual(st);

    // 학생·교사·admin 모두 같은 학교 시약장·칸을 본다 (보기 전용 — d7 §9)
    for (const [who, client] of [["학생", f.student], ["교사", f.teacher], ["admin", f.admin]] as const) {
      const cabs = await client.from("cabinets").select("*").order("created_at").order("id");
      expect(cabs.error, `${who} cabinets select`).toBeNull();
      expect(cabs.data, `${who}가 보는 시약장`).toEqual(st.cabinets);
      const slots = await client.from("cabinet_slots").select("*").order("id");
      expect(slots.error, `${who} cabinet_slots select`).toBeNull();
      expect(slots.data, `${who}가 보는 칸`).toEqual(st.slots);
    }
    // 다른 일회용 학교에는 아무것도 생기지 않았다
    expect((await tempState(f.other.id)).cabinets).toHaveLength(0);
  });

  test(`[R-db][S11] add_cabinet 번호: 가운데를 지워도 최대 번호 + 1, 이름을 "${defaultName(5)}" 로 바꾸면 다음은 "${defaultName(6)}", 겹치는 이름은 만들지 않는다`, async ({}, info) => {
    const f = await fresh(info);
    const c1 = expectOk(await addCabinet(f.teacher), "add 1");
    const c2 = expectOk(await addCabinet(f.teacher), "add 2");
    const c3 = expectOk(await addCabinet(f.teacher), "add 3");
    expect([c1.label, c2.label, c3.label]).toEqual([1, 2, 3].map(defaultName));

    // 2번을 지우고 추가: 빈 번호(2)가 아니라 최대 번호 + 1 (d7 §9)
    expectOk(await deleteCabinet(f.teacher, c2.id), "delete 2");
    const c4 = expectOk(await addCabinet(f.admin), "add (2번 삭제 뒤)");
    expect(c4.label, "쓰지 않은 가장 작은 번호가 아니라 최대 번호 + 1").toBe(defaultName(4));

    // 이름을 "5번 시약장" 으로 바꾸면 다음 추가는 6번
    expectOk(await renameCabinet(f.teacher, c4.id, defaultName(5)), `rename → ${defaultName(5)}`);
    const c6 = expectOk(await addCabinet(f.teacher), "add (5번으로 바꾼 뒤)");
    expect(c6.label).toBe(defaultName(6));

    // 번호 이름이 아닌 시약장이 섞여 있어도, 공백만 다른 같은 이름이 있어도 겹치는 이름을 만들지 않는다
    const next = defaultName(7);
    expectOk(await renameCabinet(f.teacher, c1.id, "화학 준비실"), "rename → 화학 준비실");
    expectOk(await renameCabinet(f.teacher, c3.id, next.replace(/\s+/g, "")), "rename → 공백 없는 7번 이름");
    const before = await tempState(f.school.id);
    const c7 = expectOk(await addCabinet(f.admin), "add (공백 없는 7번 이름이 있을 때)");
    const taken = before.cabinets.map((c) => normLabel(String(c.label)));
    expect(taken, `새 이름 "${c7.label}" 은 기존 이름과 겹치지 않는다`).not.toContain(normLabel(String(c7.label)));
    const pattern = new RegExp(`^${CAB.default_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace("\\{n\\}", "(\\d+)")}$`);
    expect(String(c7.label), "기본 이름 형식").toMatch(pattern);
    expect(Number(String(c7.label).match(pattern)![1]), "번호는 6 보다 크다 (최대 번호 + 1 이상)").toBeGreaterThan(6);

    const labels = (await tempState(f.school.id)).cabinets.map((c) => normLabel(String(c.label)));
    expect(new Set(labels).size, "같은 학교에 같은 이름 없음").toBe(labels.length);
  });

  test(`[R-db][S11] add_cabinet 은 학교당 ${CABINET_MAX}개까지: ${CABINET_MAX + 1}번째는 23514 cabinet limit, 하나 지우면 다시 가능`, async ({}, info) => {
    const f = await fresh(info);
    const made: Row[] = [];
    for (let i = 0; i < CABINET_MAX; i++) {
      made.push(expectOk(await addCabinet(i % 2 ? f.admin : f.teacher), `add_cabinet ${i + 1}번째`));
    }
    expect(made.map((c) => c.label)).toEqual(Array.from({ length: CABINET_MAX }, (_, i) => defaultName(i + 1)));
    const full = await tempState(f.school.id);
    expect(full.cabinets).toHaveLength(CABINET_MAX);
    expect(full.slots).toHaveLength(CABINET_MAX * 2 * DEFAULT_SHELVES);

    for (const [who, client] of [["교사", f.teacher], ["admin", f.admin]] as const) {
      const over = await addCabinet(client);
      expectRejected(over, `${who} ${CABINET_MAX + 1}번째 add_cabinet`, "23514", "cabinet limit");
      expect(String(over.error?.details ?? ""), "detail = 한도").toBe(String(CABINET_MAX));
    }
    expect(await tempState(f.school.id), "한도 초과 호출 뒤 그대로").toEqual(full);

    // 다른 학교는 영향 없음 (학교별 한도)
    expectOk(await addCabinet(f.otherAdmin), "다른 일회용 학교 add_cabinet");

    expectOk(await deleteCabinet(f.teacher, made[0].id), "하나 삭제");
    const again = expectOk(await addCabinet(f.teacher), "삭제 뒤 add_cabinet");
    const after = await tempState(f.school.id);
    expect(after.cabinets).toHaveLength(CABINET_MAX);
    const labels = after.cabinets.map((c) => normLabel(String(c.label)));
    expect(new Set(labels).size, "이름 겹침 없음").toBe(labels.length);
    expect(again.label).toBe(defaultName(CABINET_MAX + 1));
  });

  test(`[R-db][S11] add_cabinet 동시 2건: 둘 다 성공하고 이름이 겹치지 않는다`, async ({}, info) => {
    const f = await fresh(info);
    const [a, b] = await Promise.all([addCabinet(f.teacher), addCabinet(f.admin)]);
    const ra = expectOk(a, "동시 add_cabinet (교사)");
    const rb = expectOk(b, "동시 add_cabinet (admin)");
    expect(ra.id).not.toBe(rb.id);
    expect([ra.label, rb.label].sort()).toEqual([defaultName(1), defaultName(2)].sort());
    const st = await tempState(f.school.id);
    expect(st.cabinets).toHaveLength(2);
    expect(st.slots).toHaveLength(2 * 2 * DEFAULT_SHELVES);
  });

  // ---------- rename_cabinet ----------

  test(`[R-db][S11] rename_cabinet 성공: trim·1자·${LABEL_MAX}자, 자기 이름 그대로 허용, 다른 학교와는 같은 이름 가능 (이름만 바뀐다)`, async ({}, info) => {
    const f = await fresh(info);
    const c1 = expectOk(await addCabinet(f.teacher), "add 1");
    const c2 = expectOk(await addCabinet(f.teacher), "add 2");
    const o1 = expectOk(await addCabinet(f.otherAdmin), "다른 학교 add");
    const before = await tempState(f.school.id);

    const cases: [string, SupabaseClient, string, string][] = [
      ["앞뒤 공백 trim", f.teacher, "  화학 준비실 A \t", "화학 준비실 A"],
      ["1자", f.admin, "가", "가"],
      [`${LABEL_MAX}자`, f.teacher, "가".repeat(LABEL_MAX), "가".repeat(LABEL_MAX)],
      [`공백 포함 ${LABEL_MAX + 4}자 → trim 후 ${LABEL_MAX}자`, f.admin, `  ${"나".repeat(LABEL_MAX)}  `, "나".repeat(LABEL_MAX)],
      ["가운데 공백은 그대로", f.teacher, "Lab  Room 1", "Lab  Room 1"],
    ];
    for (const [label, client, input, want] of cases) {
      const row = expectOk(await renameCabinet(client, c1.id, input), `rename ${label}`);
      expect(row, `rename ${label}: 반환 행 (이름만 바뀜)`).toEqual({ ...c1, label: want });
      const now = await tempState(f.school.id);
      expect(now.cabinets, `rename ${label}: DB`).toEqual([{ ...c1, label: want }, c2]);
      expect(now.slots, `rename ${label}: 칸은 그대로`).toEqual(before.slots);
    }

    // 자기 자신과 같은 이름 (그대로 · 대소문자만 다르게 · 공백만 다르게)
    for (const input of ["Lab  Room 1", "lab  room 1", "LabRoom1", " Lab Room 1 "]) {
      const row = expectOk(await renameCabinet(f.teacher, c1.id, input), `자기 이름과 같은 이름 "${input}"`);
      expect(row.label).toBe(input.trim());
    }

    // 다른 학교와는 같은 이름 가능
    expectOk(await renameCabinet(f.teacher, c1.id, "공통 이름"), "rename → 공통 이름");
    const other = expectOk(await renameCabinet(f.otherAdmin, o1.id, "공통 이름"), "다른 학교 rename → 공통 이름");
    expect(other).toEqual({ ...o1, label: "공통 이름" });
    // 다른 학교의 기본 이름과도 겹칠 수 있다 (둘 다 1번 시약장으로 시작했다)
    expect(o1.label).toBe(defaultName(1));
    expect(c1.label).toBe(defaultName(1));
    expect((await tempState(f.school.id)).cabinets).toEqual([{ ...c1, label: "공통 이름" }, c2]);
  });

  test(`[R-db][S11] rename_cabinet 같은 학교 중복 거부 23505 duplicate label (대소문자·공백 차이 포함, 이름 그대로)`, async ({}, info) => {
    const f = await fresh(info);
    const c1 = expectOk(await addCabinet(f.teacher), "add 1");
    const c2 = expectOk(await addCabinet(f.teacher), "add 2");
    expectOk(await renameCabinet(f.teacher, c1.id, "Chem Lab 준비실"), "rename c1");
    const before = await tempState(f.school.id);

    const dups = ["Chem Lab 준비실", "chem lab 준비실", "CHEM LAB 준비실", "ChemLab준비실", "  Chem   Lab  준비실 ", "Chem\tLab 준비실"];
    for (const input of dups) {
      for (const [who, client] of [["교사", f.teacher], ["admin", f.admin]] as const) {
        expectRejected(await renameCabinet(client, c2.id, input), `${who} rename 중복 "${input}"`, "23505", "duplicate label");
      }
      expect(await tempState(f.school.id), `중복 "${input}" 뒤 그대로`).toEqual(before);
    }
    // 반대 방향: c1 을 c2 의 기본 이름으로
    for (const input of [String(c2.label), String(c2.label).replace(/\s+/g, ""), ` ${c2.label} `]) {
      expectRejected(await renameCabinet(f.admin, c1.id, input), `rename 중복 "${input}"`, "23505", "duplicate label");
    }
    expect(await tempState(f.school.id)).toEqual(before);
  });

  test(`[R-db][S11] rename_cabinet 이름 빈 값·공백만·${LABEL_MAX + 1}자·null 거부 22023 label length (이름 그대로)`, async ({}, info) => {
    const f = await fresh(info);
    const c1 = expectOk(await addCabinet(f.teacher), "add 1");
    const before = await tempState(f.school.id);
    const bad: [string, unknown][] = [
      ["빈 값", ""],
      ["공백만", "   "],
      ["탭·줄바꿈만", "\t\n "],
      [`${LABEL_MAX + 1}자`, "가".repeat(LABEL_MAX + 1)],
      [`공백을 빼도 ${LABEL_MAX + 1}자`, ` ${"가".repeat(LABEL_MAX + 1)} `],
      ["100자", "x".repeat(100)],
      ["null", null],
    ];
    for (const [label, input] of bad) {
      for (const [who, client] of [["교사", f.teacher], ["admin", f.admin]] as const) {
        expectRejected(await renameCabinet(client, c1.id, input), `${who} rename 이름 ${label}`, "22023", "label length");
      }
      expect(await tempState(f.school.id), `이름 ${label} 뒤 그대로`).toEqual(before);
    }
  });

  // ---------- save_cabinet_layout ----------

  test(`[R-db][S11] save_cabinet_layout 성공: 한 칸에 분류 여러 개(규칙 순서로 저장·반환), 목록에 없는 칸은 미지정, 예전 열 = 첫 분류, 반환 {cabinet, slots[], unplaced_count}`, async ({}, info) => {
    const f = await fresh(info);
    const cab = expectOk(await addCabinet(f.teacher), "add");
    const id = cab.id as string;
    const start = await tempState(f.school.id);
    const idOf = (st: TempState) => Object.fromEntries(slotsOf(st, id).map((s) => [slotKey(s), s.id]));

    /** 저장 한 번: 반환값과 DB 를 기대와 대조 */
    const save = async (who: string, client: SupabaseClient, door: string, shelves: number, cells: { side: string; shelf: number; classes: string[] }[]) => {
      const out = expectOk(await saveLayout(client, id, door, shelves, cells), `${who} save_cabinet_layout`);
      const want = Object.fromEntries(cells.map((c) => [`${c.side}${c.shelf}`, c.classes]));
      const st = await tempState(f.school.id);
      const row = st.cabinets.find((c) => c.id === id)!;
      expect(row, "cabinets 행: 문 형태·단 수만 바뀜").toEqual({ ...cab, door_type: door, shelves });
      expectSlots(st, row, door, shelves, want, `${who} 저장`);
      // 반환 jsonb
      expect(Object.keys(out).sort(), "반환 키").toEqual(["cabinet", "slots", "unplaced_count"]);
      expect(out.cabinet, "반환 cabinet = cabinets 행").toEqual(row);
      expect(out.unplaced_count, "배치된 시약이 없으므로 0").toBe(0);
      const got = out.slots as Row[];
      expect(got.map((s) => `${s.side}${s.shelf}`).sort(), "반환 slots = 격자 전체").toEqual(gridKeys(door, shelves));
      for (const s of got) {
        const dbRow = slotAt(st, id, `${s.side}${s.shelf}`);
        expect(Object.keys(s).sort(), "반환 slot 키").toEqual(["classes", "id", "shelf", "side"]);
        expect(s.id, "반환 slot id = 칸 행 id").toBe(dbRow.id);
        expect(s.classes, "반환 classes = 저장된 분류 (규칙 순서)").toEqual(dbRow.storage_classes);
      }
      return st;
    };

    // 1) 입력 순서와 무관하게 규칙 순서로, 여러 개
    const reversed = [...CLASSES].reverse();
    const s1 = await save("교사", f.teacher, DOUBLE, DEFAULT_SHELVES, [
      { side: "R", shelf: 2, classes: [CLASSES[6]] },
      { side: "L", shelf: 1, classes: [CLASSES[7], CLASSES[1], CLASSES[0]] },
      { side: "L", shelf: 3, classes: [] },
      { side: "R", shelf: DEFAULT_SHELVES, classes: reversed },
    ]);
    expect(slotAt(s1, id, "L1").storage_classes).toEqual([CLASSES[0], CLASSES[1], CLASSES[7]]);
    expect(slotAt(s1, id, "L1").storage_class).toBe(CLASSES[0]);
    expect(slotAt(s1, id, `R${DEFAULT_SHELVES}`).storage_classes, "8종 전부를 한 칸에").toEqual(CLASSES);
    expect(slotAt(s1, id, "L2").storage_classes, "목록에 없는 칸은 미지정").toEqual([]);
    expect(slotAt(s1, id, "L2").storage_class).toBeNull();
    expect(idOf(s1), "칸 행 id 는 저장해도 그대로 (시약 배치가 유지되게)").toEqual(idOf(start));

    // 2) 다시 저장: 이번 목록에 없는 칸은 미지정으로 돌아간다. 섞이면 위험한 조합도 저장은 된다 (d7 §9 혼재 경고 — 경고만)
    const risky = CAB.incompatible[0];
    const s2 = await save("admin", f.admin, DOUBLE, DEFAULT_SHELVES, [{ side: "L", shelf: 2, classes: [risky[1], risky[0]] }]);
    expect(slotAt(s2, id, "L2").storage_classes).toEqual(sortClasses(risky));
    expect(slotAt(s2, id, "L1").storage_classes, "이번 목록에 없으면 미지정").toEqual([]);
    expect(idOf(s2)).toEqual(idOf(start));

    // 3) 빈 목록 = 전부 미지정
    const s3 = await save("교사", f.teacher, DOUBLE, DEFAULT_SHELVES, []);
    expect(s3.slots.every((s) => (s.storage_classes as string[]).length === 0)).toBe(true);

    // 4) 문 형태·단 수의 모든 조합이 저장된다 (단문형은 L 만)
    for (const door of CAB.door_types) {
      for (const shelves of CAB.shelves) {
        const cells = sidesOf(door).map((side) => ({ side, shelf: shelves, classes: [CLASSES[2]] }));
        const st = await save("admin", f.admin, door, shelves, cells);
        if (door === SINGLE) expect(slotsOf(st, id).every((s) => s.side === "L"), "단문형은 side L 만").toBe(true);
        expect(slotsOf(st, id)).toHaveLength(sidesOf(door).length * shelves);
      }
    }
    expect((await tempState(f.school.id)).cabinets, "다른 시약장은 생기지 않았다").toHaveLength(1);
  });

  test(`[R-db][S11] save_cabinet_layout 칸 줄이기: 양문형 ${MAX_SHELVES}단 → 단문형 ${MIN_SHELVES}단 이면 사라진 칸의 시약만 "칸 없음"(unplaced_count 일치), 시약 행·stock·남은 칸 배치는 그대로, 다시 늘리면 새 칸은 미지정`, async ({}, info) => {
    const f = await fresh(info);
    const cab = expectOk(await addCabinet(f.teacher), "add");
    const keepCab = expectOk(await addCabinet(f.teacher), "add (건드리지 않는 시약장)");
    const id = cab.id as string;
    expectOk(
      await saveLayout(f.teacher, id, DOUBLE, MAX_SHELVES, [
        { side: "L", shelf: 1, classes: [CLASSES[1]] },
        { side: "L", shelf: MAX_SHELVES, classes: [CLASSES[2]] },
        { side: "R", shelf: 1, classes: [CLASSES[3], CLASSES[4]] },
      ]),
      "준비 저장",
    );
    let st = await tempState(f.school.id);

    // 시약 6종: 남는 칸 L1 에 2, 사라지는 칸 L{max}·R1·R{max} 에 1씩, 다른 시약장 L1 에 1, 칸 없음 1
    const r = {
      keepA: await newReagent(f.teacher, "keepA"),
      keepB: await newReagent(f.admin, "keepB"),
      goneShelf: await newReagent(f.teacher, "goneShelf"),
      goneSide1: await newReagent(f.teacher, "goneSide1"),
      goneSide2: await newReagent(f.teacher, "goneSide2"),
      otherCab: await newReagent(f.teacher, "otherCab"),
      none: await newReagent(f.teacher, "none"),
    };
    await place(f, info, r.keepA, slotAt(st, id, "L1").id as string);
    await place(f, info, r.keepB, slotAt(st, id, "L1").id as string);
    await place(f, info, r.goneShelf, slotAt(st, id, `L${MAX_SHELVES}`).id as string);
    await place(f, info, r.goneSide1, slotAt(st, id, "R1").id as string);
    await place(f, info, r.goneSide2, slotAt(st, id, `R${MAX_SHELVES}`).id as string);
    await place(f, info, r.otherCab, slotAt(st, keepCab.id as string, "L1").id as string);
    st = await tempState(f.school.id);
    expect(st.reagents.filter((x) => x.slot_id !== null), "준비: 배치된 시약 6종").toHaveLength(6);
    const gone = [r.goneShelf, r.goneSide1, r.goneSide2];

    // 줄이기 (admin): L1 의 분류는 새로 지정
    const out = expectOk(
      await saveLayout(f.admin, id, SINGLE, MIN_SHELVES, [{ side: "L", shelf: 1, classes: [CLASSES[5]] }]),
      "줄이기 저장",
    );
    expect(out.unplaced_count, "칸 없음이 된 시약 수").toBe(gone.length);
    const after = await tempState(f.school.id);
    const row = after.cabinets.find((c) => c.id === id)!;
    expect(row).toEqual({ ...cab, door_type: SINGLE, shelves: MIN_SHELVES });
    expectSlots(after, row, SINGLE, MIN_SHELVES, { L1: [CLASSES[5]] }, "줄인 뒤");
    expect(slotsOf(after, id), `칸 ${2 * MAX_SHELVES} → ${MIN_SHELVES}`).toHaveLength(MIN_SHELVES);
    // 남은 칸은 같은 행 (id 유지)
    for (const key of gridKeys(SINGLE, MIN_SHELVES)) expect(slotAt(after, id, key).id, `남은 칸 ${key} id`).toBe(slotAt(st, id, key).id);
    // 시약: 사라진 칸의 것만 slot_id null, 그 밖의 모든 열·다른 시약은 그대로
    expect(after.reagents, "시약 행: 사라진 칸의 slot_id 만 null").toEqual(
      st.reagents.map((x) => (gone.includes(x.id as string) ? { ...x, slot_id: null } : x)),
    );
    expect(after.reagents).toHaveLength(st.reagents.length);
    expect(reagentOf(after, r.keepA).slot_id, "남은 칸의 배치는 유지").toBe(slotAt(after, id, "L1").id);
    expect(reagentOf(after, r.keepB).slot_id).toBe(slotAt(after, id, "L1").id);
    expect(reagentOf(after, r.otherCab).slot_id, "다른 시약장의 배치는 그대로").toBe(slotAt(st, keepCab.id as string, "L1").id);
    for (const x of after.reagents) expect(Number(x.stock), `시약 ${x.name} stock`).toBe(Number(reagentOf(st, x.id as string).stock));
    expect(after.intakeLogs, "입고 기록 그대로").toBe(st.intakeLogs);
    // 다른 시약장과 그 칸은 그대로
    expect(after.cabinets.find((c) => c.id === keepCab.id)).toEqual(keepCab);
    expect(slotsOf(after, keepCab.id as string)).toEqual(slotsOf(st, keepCab.id as string));
    // 반환 slots 도 줄어든 격자
    expect((out.slots as Row[]).map((s) => `${s.side}${s.shelf}`).sort()).toEqual(gridKeys(SINGLE, MIN_SHELVES));

    // 같은 구성으로 다시 저장: 더 사라질 칸이 없으므로 0
    const again = expectOk(await saveLayout(f.teacher, id, SINGLE, MIN_SHELVES, [{ side: "L", shelf: 1, classes: [CLASSES[5]] }]), "같은 구성 다시 저장");
    expect(again.unplaced_count).toBe(0);
    expect(await tempState(f.school.id)).toEqual(after);

    // 다시 늘리기 (교사): 새 칸은 미지정, 예전에 사라진 칸의 시약은 돌아오지 않는다, 남아 있던 배치는 유지
    const grown = expectOk(
      await saveLayout(f.teacher, id, DOUBLE, MAX_SHELVES, [{ side: "L", shelf: 1, classes: [CLASSES[5]] }]),
      "다시 늘리기 저장",
    );
    expect(grown.unplaced_count).toBe(0);
    const big = await tempState(f.school.id);
    const bigRow = big.cabinets.find((c) => c.id === id)!;
    expectSlots(big, bigRow, DOUBLE, MAX_SHELVES, { L1: [CLASSES[5]] }, "다시 늘린 뒤 (새 칸은 미지정 — 예전 분류가 되살아나지 않는다)");
    expect(slotsOf(big, id)).toHaveLength(2 * MAX_SHELVES);
    expect(big.reagents, "늘려도 시약 배치는 그대로").toEqual(after.reagents);
    for (const key of gridKeys(SINGLE, MIN_SHELVES)) expect(slotAt(big, id, key).id).toBe(slotAt(after, id, key).id);

    // 단 수만 줄이기 (양문형 유지): 맨 아래 단의 두 칸만 사라진다
    await place(f, info, r.none, slotAt(big, id, `R${MAX_SHELVES}`).id as string);
    const shelfOnly = expectOk(await saveLayout(f.admin, id, DOUBLE, MIN_SHELVES, []), "단 수만 줄이기");
    expect(shelfOnly.unplaced_count, `R${MAX_SHELVES} 의 1종`).toBe(MAX_SHELVES > MIN_SHELVES ? 1 : 0);
    const last = await tempState(f.school.id);
    expect(slotsOf(last, id).map(slotKey).sort()).toEqual(gridKeys(DOUBLE, MIN_SHELVES));
    expect(reagentOf(last, r.none).slot_id).toBeNull();
    expect(reagentOf(last, r.keepA).slot_id).toBe(slotAt(last, id, "L1").id);
    expect(last.reagents).toHaveLength(st.reagents.length);
  });

  /** 잘못된 인자 검사용 준비: 분류가 지정되고 시약이 배치된 양문형 시약장 */
  async function prepared(info: TestInfo): Promise<{ f: Fixture; id: string; before: TempState }> {
    const f = await fresh(info);
    const cab = expectOk(await addCabinet(f.teacher), "add");
    const id = cab.id as string;
    expectOk(
      await saveLayout(f.teacher, id, DOUBLE, MAX_SHELVES, [
        { side: "L", shelf: 1, classes: [CLASSES[1]] },
        { side: "R", shelf: MAX_SHELVES, classes: [CLASSES[7], CLASSES[0]] },
      ]),
      "준비 저장",
    );
    const st = await tempState(f.school.id);
    await place(f, info, await newReagent(f.teacher, "bad-args"), slotAt(st, id, `R${MAX_SHELVES}`).id as string);
    return { f, id, before: await tempState(f.school.id) };
  }

  test(`[R-db][S11] save_cabinet_layout 잘못된 문 형태·단 수 거부 22023 (시약장·칸·배치 그대로)`, async ({}, info) => {
    const { f, id, before } = await prepared(info);
    const okCells = [{ side: "L", shelf: 1, classes: [CLASSES[2]] }];
    const doors: [string, unknown][] = [["삼문형", "삼문형"], ["빈 문자열", ""], ["null", null], ["공백 붙은 '단문형 '", `${SINGLE} `], ["영문 single", "single"]];
    for (const [label, door] of doors) {
      for (const client of [f.teacher, f.admin]) {
        expectRejected(await saveLayout(client, id, door, MIN_SHELVES, okCells), `문 형태 ${label}`, "22023", "invalid door type");
      }
      expect(await tempState(f.school.id), `문 형태 ${label} 뒤 그대로`).toEqual(before);
    }
    const outside = [MAX_SHELVES + 1, 0, MIN_SHELVES - 1, -1, 100].filter((n) => !CAB.shelves.includes(n));
    const shelves: [string, unknown][] = [...outside.map((n) => [String(n), n] as [string, unknown]), ["null", null]];
    for (const [label, n] of shelves) {
      for (const door of CAB.door_types) {
        expectRejected(await saveLayout(f.teacher, id, door, n, []), `단 수 ${label} (${door})`, "22023", "invalid shelves");
      }
      expect(await tempState(f.school.id), `단 수 ${label} 뒤 그대로`).toEqual(before);
    }
  });

  test(`[R-db][S11] save_cabinet_layout 잘못된 slots 모양 거부 22023 invalid slots (배열 아님·9개·원소 모양, 그대로)`, async ({}, info) => {
    const { f, id, before } = await prepared(info);
    const nine = [
      ...gridKeys(DOUBLE, MAX_SHELVES).map((k) => ({ side: k[0], shelf: Number(k.slice(1)), classes: [] as string[] })),
      { side: "L", shelf: 1, classes: [] as string[] },
    ].slice(0, 2 * MAX_SHELVES + 1);
    expect(nine.length, "격자 최대 칸 수 + 1").toBe(2 * MAX_SHELVES + 1);
    const bad: [string, unknown][] = [
      ["객체", { side: "L", shelf: 1, classes: [] }],
      ["문자열", "L1"],
      ["숫자", 5],
      ["true", true],
      [`${nine.length}개`, nine],
      ["원소가 문자열", ["L1"]],
      ["원소가 배열", [["L", 1, []]]],
      ["원소가 null", [null]],
      ["side 없음", [{ shelf: 1, classes: [] }]],
      ["shelf 없음", [{ side: "L", classes: [] }]],
      ["classes 없음", [{ side: "L", shelf: 1 }]],
      ["side 가 숫자", [{ side: 1, shelf: 1, classes: [] }]],
      ["shelf 가 문자열", [{ side: "L", shelf: "1", classes: [] }]],
      ["classes 가 문자열", [{ side: "L", shelf: 1, classes: CLASSES[1] }]],
      ["classes 원소가 숫자", [{ side: "L", shelf: 1, classes: [1] }]],
      ["classes 원소가 null", [{ side: "L", shelf: 1, classes: [null] }]],
      ["맞는 칸 + 틀린 칸", [{ side: "L", shelf: 1, classes: [CLASSES[2]] }, { side: "R" }]],
    ];
    for (const [label, slots] of bad) {
      expectRejected(await saveLayout(f.teacher, id, DOUBLE, MAX_SHELVES, slots), `slots ${label}`, "22023", "invalid slots");
      expect(await tempState(f.school.id), `slots ${label} 뒤 그대로`).toEqual(before);
    }
  });

  test(`[R-db][S11] save_cabinet_layout 격자 밖 칸·중복 칸·8종 밖 분류·같은 분류 두 번 거부 22023 (detail 에 문제 칸·분류, 그대로)`, async ({}, info) => {
    const { f, id, before } = await prepared(info);
    const cell = (side: unknown, shelf: unknown, classes: unknown[] = []) => ({ side, shelf, classes });
    type Case = [string, string, number, unknown[], string, string | null];
    const cases: Case[] = [
      // 격자 밖
      ["단문형에 R 칸", SINGLE, MAX_SHELVES, [cell("L", 1), cell("R", 1)], "invalid slot", "R1"],
      [`${MIN_SHELVES}단에 ${MIN_SHELVES + 1}단 칸`, DOUBLE, MIN_SHELVES, [cell("L", MIN_SHELVES + 1)], "invalid slot", `L${MIN_SHELVES + 1}`],
      [`${MAX_SHELVES}단에 ${MAX_SHELVES + 1}단 칸`, DOUBLE, MAX_SHELVES, [cell("R", MAX_SHELVES + 1)], "invalid slot", `R${MAX_SHELVES + 1}`],
      ["0단 칸", DOUBLE, MAX_SHELVES, [cell("L", 0)], "invalid slot", "L0"],
      ["음수 단", DOUBLE, MAX_SHELVES, [cell("L", -1)], "invalid slot", "L-1"],
      ["소수 단", DOUBLE, MAX_SHELVES, [cell("L", 1.5)], "invalid slot", "L1.5"],
      ["없는 쪽 X", DOUBLE, MAX_SHELVES, [cell("X", 1)], "invalid slot", "X1"],
      ["소문자 l", DOUBLE, MAX_SHELVES, [cell("l", 1)], "invalid slot", "l1"],
      // 같은 칸 두 번
      ["같은 칸 두 번", DOUBLE, MAX_SHELVES, [cell("L", 1, [CLASSES[1]]), cell("L", 1, [CLASSES[2]])], "duplicate slot", "L1"],
      ["같은 칸 두 번 (분류도 같음)", DOUBLE, MAX_SHELVES, [cell("R", 2), cell("L", 1), cell("R", 2)], "duplicate slot", "R2"],
      // 8종 밖 분류
      ["8종 밖 분류", DOUBLE, MAX_SHELVES, [cell("L", 1, ["폭발물"])], "invalid class", "폭발물"],
      ["맞는 분류 + 8종 밖 분류", DOUBLE, MAX_SHELVES, [cell("L", 1, [CLASSES[0], "방사성"])], "invalid class", "방사성"],
      ["빈 문자열 분류", DOUBLE, MAX_SHELVES, [cell("L", 1, [""])], "invalid class", null],
      ["공백 붙은 분류", DOUBLE, MAX_SHELVES, [cell("L", 1, [`${CLASSES[1]} `])], "invalid class", `${CLASSES[1]} `],
      // 한 칸에 같은 분류 두 번
      ["한 칸에 같은 분류 두 번", DOUBLE, MAX_SHELVES, [cell("L", 1, [CLASSES[1], CLASSES[1]])], "duplicate class", null],
      ["한 칸에 같은 분류 두 번 (다른 분류 사이)", DOUBLE, MAX_SHELVES, [cell("R", 1, [CLASSES[3], CLASSES[0], CLASSES[3]])], "duplicate class", null],
    ];
    for (const [label, door, shelves, slots, message, detail] of cases) {
      for (const [who, client] of [["교사", f.teacher], ["admin", f.admin]] as const) {
        const res = await saveLayout(client, id, door, shelves, slots);
        expectRejected(res, `${who} ${label}`, "22023", message);
        if (detail !== null) expect(String(res.error?.details ?? ""), `${label}: detail 에 문제 값`).toContain(detail);
      }
      expect(await tempState(f.school.id), `${label} 뒤 그대로`).toEqual(before);
    }
    // 서로 다른 칸에 같은 분류는 괜찮다 (거부 사유가 "분류가 여러 칸에 있어서"가 아님 — 대조군)
    const ok = expectOk(
      await saveLayout(f.teacher, id, DOUBLE, MAX_SHELVES, [cell("L", 1, [CLASSES[1]]), cell("R", 1, [CLASSES[1]])]),
      "서로 다른 칸에 같은 분류",
    );
    expect(ok.unplaced_count).toBe(0);
  });

  // ---------- delete_cabinet ----------

  test(`[R-db][S11] delete_cabinet 성공: 칸·시약장 행 삭제, 배치 시약은 "칸 없음"(unplaced_count 일치)·시약 행 유지, 다른 시약장·배치·다른 학교는 그대로`, async ({}, info) => {
    const f = await fresh(info);
    const c1 = expectOk(await addCabinet(f.teacher), "add 1");
    const c2 = expectOk(await addCabinet(f.teacher), "add 2");
    const c3 = expectOk(await addCabinet(f.teacher), "add 3 (빈 시약장)");
    const o1 = expectOk(await addCabinet(f.otherAdmin), "다른 학교 add");
    expectOk(await saveLayout(f.teacher, c1.id, DOUBLE, MAX_SHELVES, [{ side: "L", shelf: 1, classes: [CLASSES[1], CLASSES[2]] }]), "c1 저장");
    expectOk(await saveLayout(f.teacher, c2.id, SINGLE, MIN_SHELVES, [{ side: "L", shelf: 2, classes: [CLASSES[4]] }]), "c2 저장");
    let st = await tempState(f.school.id);
    const r = {
      a: await newReagent(f.teacher, "a"),
      b: await newReagent(f.teacher, "b"),
      c: await newReagent(f.admin, "c"),
      d: await newReagent(f.teacher, "d"),
    };
    await place(f, info, r.a, slotAt(st, c1.id as string, "L1").id as string);
    await place(f, info, r.b, slotAt(st, c1.id as string, `R${MAX_SHELVES}`).id as string);
    await place(f, info, r.c, slotAt(st, c2.id as string, "L2").id as string);
    st = await tempState(f.school.id);
    const otherBefore = await tempState(f.other.id);
    const c1Row = st.cabinets.find((c) => c.id === c1.id)!;

    // 교사가 c1 삭제
    const out = expectOk(await deleteCabinet(f.teacher, c1.id), "교사 delete_cabinet");
    expect(Object.keys(out).sort(), "반환 키").toEqual(["cabinet", "unplaced_count"]);
    expect(out.cabinet, "반환 cabinet = 지워진 시약장 행").toEqual(c1Row);
    expect(out.unplaced_count, "칸 없음이 된 시약 수").toBe(2);
    const after = await tempState(f.school.id);
    expect(after.cabinets, "c1 만 사라짐").toEqual(st.cabinets.filter((c) => c.id !== c1.id));
    expect(after.slots, "c1 의 칸만 사라짐").toEqual(st.slots.filter((s) => s.cabinet_id !== c1.id));
    expect(after.reagents, "시약 행: c1 에 있던 것의 slot_id 만 null").toEqual(
      st.reagents.map((x) => ([r.a, r.b].includes(x.id as string) ? { ...x, slot_id: null } : x)),
    );
    expect(after.intakeLogs, "입고 기록 그대로").toBe(st.intakeLogs);
    expect(reagentOf(after, r.c).slot_id, "다른 시약장의 배치는 그대로").toBe(slotAt(st, c2.id as string, "L2").id);
    expect(await tempState(f.other.id), "다른 학교는 그대로").toEqual(otherBefore);
    // 같은 학교 세션에서도 보이지 않는다
    for (const client of [f.teacher, f.student]) {
      const seen = await client.from("cabinets").select("id").eq("id", c1.id as string);
      expect(seen.data ?? []).toHaveLength(0);
      const slots = await client.from("cabinet_slots").select("id").eq("cabinet_id", c1.id as string);
      expect(slots.data ?? []).toHaveLength(0);
    }

    // 지운 시약장은 이제 없는 시약장
    expectRejected(await deleteCabinet(f.teacher, c1.id), "지운 시약장 다시 delete", "P0002", "cabinet not found");
    expectRejected(await renameCabinet(f.teacher, c1.id, "되살리기"), "지운 시약장 rename", "P0002", "cabinet not found");
    expectRejected(await saveLayout(f.teacher, c1.id, DOUBLE, MAX_SHELVES, []), "지운 시약장 save", "P0002", "cabinet not found");
    expect(await tempState(f.school.id)).toEqual(after);

    // admin 이 빈 시약장·배치 1종 시약장 삭제
    const empty = expectOk(await deleteCabinet(f.admin, c3.id), "admin delete_cabinet (빈 시약장)");
    expect(empty.unplaced_count).toBe(0);
    const one = expectOk(await deleteCabinet(f.admin, c2.id), "admin delete_cabinet (배치 1종)");
    expect(one.unplaced_count).toBe(1);
    const end = await tempState(f.school.id);
    expect(end.cabinets, "시약장 0개 (빈 상태)").toHaveLength(0);
    expect(end.slots).toHaveLength(0);
    expect(end.reagents, "시약 4종은 모두 남고 전부 칸 없음").toEqual(st.reagents.map((x) => ({ ...x, slot_id: null })));
    expect(end.reagents).toHaveLength(4);
    expect(reagentOf(end, r.d).slot_id).toBeNull();
    expect((await tempState(f.other.id)).cabinets, "다른 학교 시약장은 그대로").toEqual([o1]);
    // 다 지운 뒤에도 다시 추가할 수 있다
    const re = expectOk(await addCabinet(f.teacher), "전부 지운 뒤 add_cabinet");
    expect(String(re.label)).toMatch(/\d+/);
  });

  // ---------- N1-db: 일회용 학교 ↔ 다른 학교 ----------

  test(`[N1-db][S11] 일회용 학교 시약장은 다른 학교 사용자·anon 에게 select 0행, rename·save·delete 는 cabinet not found (없는 id 와 같은 응답, 그대로)`, async ({}, info) => {
    const f = await fresh(info);
    const cab = expectOk(await addCabinet(f.teacher), "add");
    const id = cab.id as string;
    expectOk(await saveLayout(f.teacher, id, DOUBLE, MAX_SHELVES, [{ side: "L", shelf: 1, classes: [CLASSES[1]] }]), "저장");
    let st = await tempState(f.school.id);
    await place(f, info, await newReagent(f.teacher, "n1"), slotAt(st, id, "L1").id as string);
    st = await tempState(f.school.id);
    const cells = slotsOf(st, id).map((s) => ({ side: s.side, shelf: s.shelf, classes: s.storage_classes }));
    const row = st.cabinets[0];
    const slotIds = slotsOf(st, id).map((s) => s.id as string);

    // 양성 대조군: 같은 학교 학생에게는 보인다
    const own = await f.student.from("cabinets").select("id").eq("id", id);
    expect(own.data ?? [], "같은 학교 학생이 보는 시약장").toHaveLength(1);

    const outsiders: [string, SupabaseClient, string, string | undefined][] = [
      ["다른 일회용 학교 admin", f.otherAdmin, "P0002", "cabinet not found"],
      [ROLE_LABEL.teacher, (await signIn("teacher")).client, "P0002", "cabinet not found"],
      [ROLE_LABEL.admin, (await signIn("admin")).client, "P0002", "cabinet not found"],
      [ROLE_LABEL.schoolB, (await signIn("schoolB")).client, "P0002", "cabinet not found"],
      [ROLE_LABEL.student, (await signIn("student")).client, "42501", "staff only"],
      ["anon", anonClient(), "42501", undefined],
    ];
    for (const [who, client, code, message] of outsiders) {
      for (const q of [
        client.from("cabinets").select("id").eq("id", id),
        client.from("cabinets").select("id").eq("school_id", f.school.id),
        client.from("cabinet_slots").select("id").eq("cabinet_id", id),
        client.from("cabinet_slots").select("id").in("id", slotIds),
      ]) {
        const res = await q;
        expect(res.error ? [] : res.data ?? [], `${who} 가 보는 일회용 학교 시약장·칸`).toHaveLength(0);
      }
      const ghost = await ghostCalls(client, who, code, message);
      await expectAllRejected(client, who, row, cells, code, message, ghost);
      // 직접 쓰기도 0행
      const upd = await client.from("cabinets").update({ label: "N1-침범" }).eq("id", id).select("id");
      expect(changed(upd), `${who} 직접 update`).toBe(0);
      const del = await client.from("cabinet_slots").delete().eq("cabinet_id", id).select("id");
      expect(changed(del), `${who} 직접 delete`).toBe(0);
      expect(await tempState(f.school.id), `${who} 호출 뒤 그대로`).toEqual(st);
    }
    // 다른 일회용 학교에 아무것도 생기지 않았다
    expect((await tempState(f.other.id)).cabinets).toHaveLength(0);
    // 다른 학교 admin 의 add_cabinet 은 자기 학교에만 생긴다
    const mine = expectOk(await addCabinet(f.otherAdmin), "다른 일회용 학교 add_cabinet");
    expect(mine.school_id).toBe(f.other.id);
    expect(await tempState(f.school.id), "이 학교는 그대로").toEqual(st);
    const cross = await f.teacher.from("cabinets").select("id").eq("id", mine.id as string);
    expect(cross.data ?? [], "이 학교 교사에게 다른 학교 시약장은 0행").toHaveLength(0);
  });

  test(`[R-db][S11] 준비 방식 기록: 시약 배치는 교사 세션의 place_reagent 로 했다 (service role 대체 0건)`, async () => {
    // 위 테스트들이 배치를 service role 로 대신했다면 d7 §14 "배치 = 교사·admin 의 place_reagent" 경로가 깨진 것이다.
    expect(placedByService, "service role 로 대신 배치한 횟수").toBe(0);
  });
});
