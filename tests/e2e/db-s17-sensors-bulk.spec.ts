// [R-db][S17] · [N1-db][S17] · [GM-db][S17] · [R-db][S2] · [N1-db][S2] · [GM-db][S2] · [R-db][S7]
// 무선 센서 · 여러 개 삭제 · 입고일 QA (harness/d7-data.md §25 "센서 DB" · "여러 개 삭제 DB" · "QA 수정" (2)(3)) — 실제 RLS · 함수
// (publishable 키 + 각 계정 로그인 세션). service role 은 준비(계정 · 학교 · 대량 행) · 정리 · 대조 조회에만.
// 기준:
//   d7 §25 센서 DB: sensors(id, school_id, name 1~40, type = rules sensor.types, maker 1~30, model null, quantity ≥0, location_text null,
//     slot_id null, status ok|check|broken, memo null, created_at · created_by · deleted_at · deleted_by).
//     RLS: 같은 학교 select(보관 제외), 쓰기는 함수만(교사·admin · 자기 학교 · 데모 거부): upsert_sensor · archive_sensor · archive_sensors.
//   d7 §25 여러 개 삭제 DB: archive_reagents(p_reagent_ids uuid[]) · archive_sensors(p_sensor_ids uuid[]) — 1~100개, 한 트랜잭션,
//     각 항목 archive_reagent 와 같은 검사(교사·admin · 자기 학교 · 보관 안 됨 · 데모 거부), 하나라도 틀리면 전부 취소, 반환 = 보관한 수.
//   d7 §25 QA (2) 입고일 미래 금지(record_intake · register_reagent · 서류 입고) · (3) 최근 입고일 = 가장 늦은 입고일 유지.
//   오류 코드(42501 권한 · 22023 값 · P0002 없음/다른 학교/보관)는 builder 계약
//   (supabase/migrations/20261011160000_sensors_bulk_archive_intake_date.sql 머리말).
// 절대 규칙 (운영 DB): 성공하는 쓰기는 일회용 학교 A'(admin · 교사 · 학생) · B'(admin) 에만. 공용 학교 A·B·데모는 거부되어야 하는 호출만
//   (앞뒤 스냅숏 같음). afterAll 잔여물 0.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { test, expect, type TestInfo } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anonClient, signIn } from "./db-helpers";
import { HAS_SERVICE, addMember, clientFor, profileByService, service, tempSchool, type TempSchool } from "./screen-8-helpers";
import { NO_SENSOR_RESIDUE, SENSOR, STATUS, BULK, cleanupSensors, d7Row, daysAgoKst, sharedSensorSnapshot, ymdKst } from "./sensor-helpers";

test.describe.configure({ mode: "default" });

const GROUP = "s17db";
const TIMEOUT = 300_000;
const NO_SERVICE_REASON = "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)";
const E = { denied: "42501", invalid: "22023", notFound: "P0002" } as const;

const DEMO_SCHOOL_ID = (() => {
  const m = readFileSync(join(process.cwd(), "lib", "supabase", "demo-data.ts"), "utf8").match(/export const DEMO_SCHOOL_ID\s*=\s*"([0-9a-f-]{36})"/);
  if (!m) throw new Error("lib/supabase/demo-data.ts 에서 DEMO_SCHOOL_ID 를 찾지 못했습니다");
  return m[1];
})();
const STORAGE = (JSON.parse(readFileSync(join(process.cwd(), "design", "rules.json"), "utf8")) as { cabinet: { storage_classes: string[] } }).cabinet.storage_classes;
/** d7 §25 "1~100개" */
const RANGE = (() => {
  const m = /— (\d+)~(\d+)개, 한 트랜잭션/.exec(d7Row("여러 개 삭제 DB"));
  if (!m) throw new Error("d7 §25 여러 개 삭제 DB 범위를 읽지 못함");
  return [Number(m[1]), Number(m[2])] as const;
})();
const [OK, CHECK, BROKEN] = STATUS.map((s) => s.db);

type Row = Record<string, unknown>;
type DbError = { code?: string; message: string; details?: string | null };
type Res = { data: unknown; error: DbError | null };

function expectRejected(res: Res, what: string, code?: string): void {
  expect(res.error, `${what}: 거부되어야 함 (반환: ${JSON.stringify(res.data)})`).not.toBeNull();
  expect(String(res.error?.code ?? ""), `${what}: 함수가 있어야 함 (${res.error?.message})`).not.toMatch(/^PGRST2/);
  if (code) expect(res.error?.code, `${what}: 오류 코드 (${res.error?.message})`).toBe(code);
}
function expectOk(res: Res, what: string): unknown {
  expect(res.error, `${what}: ${res.error?.code} ${res.error?.message}`).toBeNull();
  return res.data;
}

// ---------- 일회용 학교 ----------
interface Fixture {
  a: TempSchool;
  b: TempSchool;
  c: { admin: SupabaseClient; teacher: SupabaseClient; student: SupabaseClient };
  teacherId: string;
  bAdmin: SupabaseClient;
}
let cache: Promise<Fixture> | null = null;
function fixture(info: TestInfo): Promise<Fixture> {
  cache ??= (async () => {
    const a = await tempSchool(info, GROUP);
    const admin = await clientFor(a.admin);
    const teacher = await addMember(a, info, GROUP, "교사");
    const up = await admin.rpc("change_member_role", { p_user_id: teacher.id, p_role: "teacher" });
    expect(up.error, `준비: 교사 역할 (${up.error?.message})`).toBeNull();
    const student = await addMember(a, info, GROUP, "학생");
    expect((await profileByService(student.id))?.role).toBe("student");
    const b = await tempSchool(info, GROUP);
    return { a, b, c: { admin, teacher: await clientFor(teacher), student: await clientFor(student) }, teacherId: teacher.id, bAdmin: await clientFor(b.admin) };
  })();
  cache.catch(() => (cache = null));
  return cache;
}

let seq = 0;
const uniq = () => `${++seq}-${randomUUID().slice(0, 6)}`;

async function newSensor(c: SupabaseClient, status = OK, extra: Row = {}): Promise<string> {
  const res = (await c.rpc("upsert_sensor", { p_name: `임시센서-${uniq()}`, p_type: SENSOR.types[0], p_maker: (SENSOR.makers["센서"] as string[])[0], p_quantity: 1, p_status: status, ...extra })) as unknown as Res;
  const data = expectOk(res, "준비: upsert_sensor") as { sensor_id?: string };
  expect(typeof data?.sensor_id, "반환 sensor_id").toBe("string");
  return data.sensor_id as string;
}
async function newReagent(c: SupabaseClient, intakeDate = "2026-09-15"): Promise<string> {
  const res = (await c.rpc("register_reagent", { p_name: `임시보관-${uniq()}`, p_storage_class: STORAGE[0], p_stock: 10, p_unit: "g", p_intake_date: intakeDate, p_msds_url: null })) as unknown as Res;
  const row = (Array.isArray(res.data) ? res.data[0] : res.data) as Row | null;
  expect(res.error, `준비: register_reagent (${res.error?.message})`).toBeNull();
  return row!.id as string;
}
async function sensorById(id: string): Promise<Row | null> {
  const r = await service().from("sensors").select("*").eq("id", id).maybeSingle();
  if (r.error) throw new Error(`대조 조회 실패: ${r.error.message}`);
  return (r.data as Row | null) ?? null;
}
async function reagentById(id: string): Promise<Row | null> {
  const r = await service().from("reagents").select("id, school_id, stock, intake_date, deleted_at, deleted_by, slot_id").eq("id", id).maybeSingle();
  if (r.error) throw new Error(`대조 조회 실패: ${r.error.message}`);
  return (r.data as Row | null) ?? null;
}
async function intakeCount(id: string): Promise<number> {
  const r = await service().from("intake_logs").select("id").eq("reagent_id", id);
  return (r.data ?? []).length;
}
/** 대량 준비(service role — 판정 대상 아님): 일회용 학교에 행 n 개 */
async function bulkSensorsByService(schoolId: string, n: number): Promise<string[]> {
  const rows = Array.from({ length: n }, (_, i) => ({ school_id: schoolId, name: `대량센서-${i}-${uniq()}`.slice(0, 40), type: SENSOR.types[0], maker: (SENSOR.makers["센서"] as string[])[0], quantity: 1, status: OK }));
  const r = await service().from("sensors").insert(rows).select("id");
  expect(r.error, `준비: 대량 센서 (${r.error?.message})`).toBeNull();
  return (r.data ?? []).map((x) => x.id as string);
}
async function bulkReagentsByService(schoolId: string, n: number): Promise<string[]> {
  const rows = Array.from({ length: n }, (_, i) => ({ school_id: schoolId, name: `대량시약-${i}-${uniq()}`, unit: "g", stock: 1, min_stock: 0 }));
  const r = await service().from("reagents").insert(rows).select("id");
  expect(r.error, `준비: 대량 시약 (${r.error?.message})`).toBeNull();
  return (r.data ?? []).map((x) => x.id as string);
}

// ---------- 공용 학교 스냅숏 ----------
async function sharedReagentsSnapshot(): Promise<string[]> {
  const sb = service();
  const schools = await sb.from("schools").select("id").or("neis_code.like.TEST-SCHOOL-%,is_demo.eq.true");
  const ids = (schools.data ?? []).map((s) => s.id as string);
  const r = await sb.from("reagents").select("id, stock, intake_date, deleted_at").in("school_id", ids).order("id");
  return (r.data ?? []).map((x) => JSON.stringify(x));
}
let before: { sensors: string[]; reagents: string[] } | null = null;
test.beforeAll(async ({}, info) => {
  info.setTimeout(120_000);
  if (HAS_SERVICE) before = { sensors: await sharedSensorSnapshot(), reagents: await sharedReagentsSnapshot() };
});
test.afterAll(async ({}, info) => {
  info.setTimeout(TIMEOUT);
  if (!HAS_SERVICE) return;
  cache = null;
  const left = await cleanupSensors(GROUP, info.project.name);
  expect(left, "일회용 계정·학교·센서·시약·기록 잔여물").toEqual(NO_SENSOR_RESIDUE);
  if (before) {
    expect(await sharedSensorSnapshot(), "학교 A·B·데모 센서 그대로").toEqual(before.sensors);
    expect(await sharedReagentsSnapshot(), "학교 A·B·데모 시약 그대로").toEqual(before.reagents);
  }
});

test(`[R-db][S17] 기대값 원본: d7 §25 센서 DB(쓰기 = 함수만 · 상태 ${STATUS.map((s) => `${s.label}=${s.db}`).join(" · ")}) · 여러 개 삭제 DB ${RANGE.join("~")}개 · 전부 취소 · rules bulk_delete.max`, () => {
  const db = d7Row("센서 DB");
  expect(db).toMatch(/쓰기는 함수만\(교사·admin·자기 학교·데모 거부\): `upsert_sensor`·`archive_sensor`·`archive_sensors`/);
  expect(db).toMatch(/같은 학교 select\(보관 제외\)/);
  expect(STATUS.map((s) => s.db)).toEqual(["ok", "check", "broken"]);
  expect(d7Row("여러 개 삭제 DB")).toMatch(/하나라도 틀리면 전부 취소/);
  expect(RANGE[1], "d7 최대 = rules bulk_delete.max").toBe(BULK.max);
  expect(d7Row("QA 수정")).toMatch(/입고일 미래 금지\(record_intake·register_reagent·서류 입고/);
  expect(d7Row("QA 수정")).toMatch(/최근 입고일 = 가장 늦은 입고일 유지/);
});

test.describe("일회용 학교", () => {
  test.skip(!HAS_SERVICE, NO_SERVICE_REASON);

  // =========================== 센서 RLS · 함수 ===========================
  test("[R-db][S17] upsert_sensor: 교사 · admin 등록/수정 성공(자기 학교 · created_by) · 학생 42501 · anon 거부 · 값 검사 22023(종류 목록 밖 · 이름 0/41자 · 회사 0/31자 · 수량 -1 · 상태 목록 밖)", async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    for (const who of ["teacher", "admin"] as const) {
      const id = await newSensor(f.c[who], CHECK, { p_model: "M-1", p_location_text: "선반", p_memo: "메모" });
      const row = await sensorById(id);
      expect({ school_id: row?.school_id, status: row?.status, model: row?.model, location_text: row?.location_text, memo: row?.memo, deleted_at: row?.deleted_at }, `${who} 등록 = 자기 학교`).toEqual({
        school_id: f.a.id,
        status: CHECK,
        model: "M-1",
        location_text: "선반",
        memo: "메모",
        deleted_at: null,
      });
      const upd = (await f.c[who].rpc("upsert_sensor", { p_id: id, p_name: "고친 이름", p_type: SENSOR.types[1], p_maker: "직접 입력한 회사", p_quantity: 0, p_status: BROKEN })) as unknown as Res;
      expectOk(upd, `${who} 수정`);
      const after = await sensorById(id);
      expect({ name: after?.name, type: after?.type, maker: after?.maker, quantity: after?.quantity, status: after?.status }, `${who} 수정 반영 (회사 직접 입력 · 수량 0)`).toEqual({
        name: "고친 이름",
        type: SENSOR.types[1],
        maker: "직접 입력한 회사",
        quantity: 0,
        status: BROKEN,
      });
    }
    const base = { p_name: "학생 시도", p_type: SENSOR.types[0], p_maker: "버니어", p_quantity: 1, p_status: OK };
    const countBefore = ((await service().from("sensors").select("id").eq("school_id", f.a.id)).data ?? []).length;
    expectRejected((await f.c.student.rpc("upsert_sensor", base)) as unknown as Res, "학생 upsert_sensor", E.denied);
    const anon = (await anonClient().rpc("upsert_sensor", base)) as unknown as Res;
    expect(anon.error, "anon upsert_sensor 거부").not.toBeNull();
    const bad: [string, Row][] = [
      ["종류 목록 밖", { p_type: "무게" }],
      ["이름 0자", { p_name: "   " }],
      ["이름 41자", { p_name: "가".repeat(41) }],
      ["회사 0자", { p_maker: "" }],
      ["회사 31자", { p_maker: "나".repeat(31) }],
      ["수량 -1", { p_quantity: -1 }],
      ["상태 목록 밖", { p_status: "lost" }],
    ];
    for (const [what, patch] of bad) expectRejected((await f.c.teacher.rpc("upsert_sensor", { ...base, p_name: "값 검사", ...patch })) as unknown as Res, `교사 ${what}`, E.invalid);
    const countAfter = ((await service().from("sensors").select("id").eq("school_id", f.a.id)).data ?? []).length;
    expect(countAfter, "거부된 호출은 행을 만들지 않음").toBe(countBefore);
  });

  test("[R-db][S17] 직접 쓰기 막힘: 교사 · admin · 학생 세션의 sensors insert · update · delete 거부(행 그대로) · 같은 학교 select = 보관 제외 · 학생도 select 가능", async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const id = await newSensor(f.c.teacher);
    const archived = await newSensor(f.c.teacher);
    expectOk((await f.c.teacher.rpc("archive_sensor", { p_sensor_id: archived })) as unknown as Res, "준비: archive_sensor");
    const snap = await sensorById(id);
    for (const who of ["student", "teacher", "admin"] as const) {
      const c = f.c[who];
      const ins = await c.from("sensors").insert({ school_id: f.a.id, name: `직접-${who}`, type: SENSOR.types[0], maker: "버니어", quantity: 1, status: OK }).select("id");
      expect(ins.error, `${who} 직접 insert 거부`).not.toBeNull();
      const upd = await c.from("sensors").update({ name: `직접수정-${who}` }).eq("id", id).select("id");
      expect(upd.error !== null || (upd.data ?? []).length === 0, `${who} 직접 update 0행/거부`).toBe(true);
      const del = await c.from("sensors").delete().eq("id", id).select("id");
      expect(del.error !== null || (del.data ?? []).length === 0, `${who} 직접 delete 0행/거부`).toBe(true);
      const sel = await c.from("sensors").select("id, school_id").in("id", [id, archived]);
      expect(sel.error, `${who} select`).toBeNull();
      expect((sel.data ?? []).map((r) => r.id), `${who} 같은 학교 select (보관 제외)`).toEqual([id]);
    }
    expect(await sensorById(id), "직접 쓰기 뒤 행 그대로").toEqual(snap);
    expect(((await service().from("sensors").select("id").like("name", "직접-%").eq("school_id", f.a.id)).data ?? []).length, "직접 insert 0행").toBe(0);
  });

  test("[N1-db][S17] 다른 학교: B' admin 이 A' 센서 select 0행 · upsert_sensor(p_id = A' 센서) P0002 · archive_sensor P0002 · archive_sensors([B' 자기 것, A' 것]) P0002 전부 취소 · A' 행 그대로", async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const aId = await newSensor(f.c.teacher);
    const bId = await newSensor(f.bAdmin);
    const aSnap = await sensorById(aId);
    const seen = await f.bAdmin.from("sensors").select("id").eq("id", aId);
    expect(seen.error).toBeNull();
    expect(seen.data ?? [], "B' → A' 센서 0행").toHaveLength(0);
    const ownSeen = await f.bAdmin.from("sensors").select("id").eq("id", bId);
    expect((ownSeen.data ?? []).length, "양성 대조: B' 자기 센서 1행").toBe(1);
    expectRejected((await f.bAdmin.rpc("upsert_sensor", { p_id: aId, p_name: "침범", p_type: SENSOR.types[0], p_maker: "버니어", p_quantity: 1, p_status: OK })) as unknown as Res, "B' → A' 수정", E.notFound);
    expectRejected((await f.bAdmin.rpc("archive_sensor", { p_sensor_id: aId })) as unknown as Res, "B' → A' 보관", E.notFound);
    expectRejected((await f.bAdmin.rpc("archive_sensors", { p_sensor_ids: [bId, aId] })) as unknown as Res, "B' → [자기, A']", E.notFound);
    expect((await sensorById(bId))?.deleted_at, "전부 취소: B' 자기 센서도 그대로").toBeNull();
    expect(await sensorById(aId), "A' 센서 그대로").toEqual(aSnap);
    // 학교 B 공용 계정도 일회용 A' 센서를 못 본다
    const sB = await signIn("schoolB");
    const shared = await sB.client.from("sensors").select("id").eq("id", aId);
    expect(shared.data ?? [], "공용 학교 B 계정 → A' 센서 0행").toHaveLength(0);
  });

  test(`[R-db][S17] archive_sensors: ${RANGE[1]}개 성공(반환 = 보관 수 · deleted_by · slot 비움) · 중복은 하나 · 0개 · ${RANGE[1] + 1}개 · null 원소 22023 · 이미 보관/없는 id 섞이면 P0002 전부 취소 · 학생 42501 · anon 거부 · archive_sensor 학생 42501`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    // 범위 밖 · 형식 (행을 바꾸지 않는다)
    const over = await bulkSensorsByService(f.a.id, RANGE[1] + 1);
    expectRejected((await f.c.teacher.rpc("archive_sensors", { p_sensor_ids: [] })) as unknown as Res, "0개", E.invalid);
    expectRejected((await f.c.teacher.rpc("archive_sensors", { p_sensor_ids: over })) as unknown as Res, `${RANGE[1] + 1}개`, E.invalid);
    expectRejected((await f.c.teacher.rpc("archive_sensors", { p_sensor_ids: [over[0], null] })) as unknown as Res, "null 원소", E.invalid);
    const stillLive = await service().from("sensors").select("id").in("id", over).is("deleted_at", null);
    expect((stillLive.data ?? []).length, "거부 → 하나도 보관 안 됨").toBe(over.length);
    // 전부 취소: 살아 있는 2 + 이미 보관 1 / 없는 id 1
    const live2 = over.slice(0, 2);
    const gone = await newSensor(f.c.teacher);
    expectOk((await f.c.teacher.rpc("archive_sensor", { p_sensor_id: gone })) as unknown as Res, "준비: 하나 보관");
    expectRejected((await f.c.teacher.rpc("archive_sensors", { p_sensor_ids: [...live2, gone] })) as unknown as Res, "이미 보관 섞임", E.notFound);
    expectRejected((await f.c.teacher.rpc("archive_sensors", { p_sensor_ids: [...live2, randomUUID()] })) as unknown as Res, "없는 id 섞임", E.notFound);
    for (const id of live2) expect((await sensorById(id))?.deleted_at, "전부 취소 → 그대로").toBeNull();
    // 권한
    expectRejected((await f.c.student.rpc("archive_sensors", { p_sensor_ids: live2 })) as unknown as Res, "학생 archive_sensors", E.denied);
    expectRejected((await f.c.student.rpc("archive_sensor", { p_sensor_id: live2[0] })) as unknown as Res, "학생 archive_sensor", E.denied);
    const anon = (await anonClient().rpc("archive_sensors", { p_sensor_ids: live2 })) as unknown as Res;
    expect(anon.error, "anon archive_sensors 거부").not.toBeNull();
    for (const id of live2) expect((await sensorById(id))?.deleted_at, "권한 거부 → 그대로").toBeNull();
    // 중복은 하나로: [a, a, b] → 2
    const dup = (await f.c.teacher.rpc("archive_sensors", { p_sensor_ids: [live2[0], live2[0], live2[1]] })) as unknown as Res;
    expect(expectOk(dup, "중복 포함"), "반환 = 보관 수 (중복 하나로)").toBe(2);
    // 최대 100개 (나머지 99 + 새 1 = 100)
    const rest = over.slice(2);
    const hundred = [...rest, ...(await bulkSensorsByService(f.a.id, RANGE[1] - rest.length))];
    expect(hundred.length).toBe(RANGE[1]);
    const res = (await f.c.admin.rpc("archive_sensors", { p_sensor_ids: hundred })) as unknown as Res;
    expect(expectOk(res, `admin ${RANGE[1]}개`), `반환 = ${RANGE[1]}`).toBe(RANGE[1]);
    const done = await service().from("sensors").select("deleted_at, deleted_by, slot_id").in("id", hundred);
    expect((done.data ?? []).every((r) => r.deleted_at && r.deleted_by === f.a.admin.id && r.slot_id === null), `${RANGE[1]}개 모두 보관 · deleted_by · slot 비움`).toBe(true);
    // 보관된 센서는 같은 학교 select 에서 빠짐
    const seen = await f.c.teacher.from("sensors").select("id").in("id", hundred.slice(0, 5));
    expect(seen.data ?? [], "보관 → select 제외").toHaveLength(0);
  });

  test(`[GM-db][S17] 데모 센서: anon select = 데모 학교 행만(보관 제외) · anon/로그인 사용자 직접 쓰기 거부 · 일회용 교사 archive_sensors · archive_sensor · upsert_sensor(p_id = 데모) P0002 · 데모 행 그대로`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const anon = anonClient();
    const demo = await anon.from("sensors").select("*").order("id");
    expect(demo.error, `anon sensors (${demo.error?.message})`).toBeNull();
    const rows = (demo.data ?? []) as Row[];
    expect(rows.length, "데모 센서 ≥1 (seed)").toBeGreaterThan(0);
    expect(rows.every((r) => r.school_id === DEMO_SCHOOL_ID && r.deleted_at === null), "anon = 데모 학교 · 보관 제외").toBe(true);
    const ownA = await newSensor(f.c.teacher);
    expect((await anon.from("sensors").select("id").eq("id", ownA)).data ?? [], "anon → 실제 학교 센서 0행").toHaveLength(0);
    const demoId = rows[0].id as string;
    const ins = await anon.from("sensors").insert({ school_id: DEMO_SCHOOL_ID, name: "anon 침범", type: SENSOR.types[0], maker: "버니어", quantity: 1, status: OK }).select("id");
    expect(ins.error, "anon insert 거부").not.toBeNull();
    const upd = await anon.from("sensors").update({ name: "anon 침범" }).eq("id", demoId).select("id");
    expect(upd.error !== null || (upd.data ?? []).length === 0, "anon update 0행/거부").toBe(true);
    const del = await anon.from("sensors").delete().eq("id", demoId).select("id");
    expect(del.error !== null || (del.data ?? []).length === 0, "anon delete 0행/거부").toBe(true);
    expectRejected((await f.c.teacher.rpc("archive_sensors", { p_sensor_ids: [demoId] })) as unknown as Res, "교사 → 데모 archive_sensors", E.notFound);
    expectRejected((await f.c.teacher.rpc("archive_sensor", { p_sensor_id: demoId })) as unknown as Res, "교사 → 데모 archive_sensor", E.notFound);
    expectRejected((await f.c.teacher.rpc("upsert_sensor", { p_id: demoId, p_name: "침범", p_type: SENSOR.types[0], p_maker: "버니어", p_quantity: 1, p_status: OK })) as unknown as Res, "교사 → 데모 수정", E.notFound);
    expect(((await f.c.teacher.from("sensors").select("id").eq("id", demoId)).data ?? []), "로그인 사용자 → 데모 센서 0행").toHaveLength(0);
    const again = await anon.from("sensors").select("*").order("id");
    expect(again.data, "데모 센서 그대로").toEqual(demo.data);
  });

  // =========================== archive_reagents ===========================
  test(`[R-db][S2] archive_reagents: 교사 3개 성공(반환 3 · deleted_by · slot 비움 · select 제외) · ${RANGE[1]}개 성공 · 0개 · ${RANGE[1] + 1}개 · null 22023 · 보관/없는 id 섞임 P0002 전부 취소 · 학생 42501 · anon 거부`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const three = [await newReagent(f.c.teacher), await newReagent(f.c.teacher), await newReagent(f.c.teacher)];
    expectRejected((await f.c.student.rpc("archive_reagents", { p_reagent_ids: three })) as unknown as Res, "학생", E.denied);
    const anon = (await anonClient().rpc("archive_reagents", { p_reagent_ids: three })) as unknown as Res;
    expect(anon.error, "anon 거부").not.toBeNull();
    expectRejected((await f.c.teacher.rpc("archive_reagents", { p_reagent_ids: [] })) as unknown as Res, "0개", E.invalid);
    expectRejected((await f.c.teacher.rpc("archive_reagents", { p_reagent_ids: [three[0], null] })) as unknown as Res, "null 원소", E.invalid);
    expectRejected((await f.c.teacher.rpc("archive_reagents", { p_reagent_ids: [...three, randomUUID()] })) as unknown as Res, "없는 id 섞임", E.notFound);
    for (const id of three) expect((await reagentById(id))?.deleted_at, "거부 → 그대로").toBeNull();
    const res = (await f.c.teacher.rpc("archive_reagents", { p_reagent_ids: three })) as unknown as Res;
    expect(expectOk(res, "교사 3개"), "반환 = 3").toBe(3);
    for (const id of three) {
      const r = await reagentById(id);
      expect({ deleted: Boolean(r?.deleted_at), by: r?.deleted_by, slot: r?.slot_id }, "보관").toEqual({ deleted: true, by: f.teacherId, slot: null });
    }
    expect((await f.c.teacher.from("reagents").select("id").in("id", three)).data ?? [], "보관 → select 제외").toHaveLength(0);
    const fresh = await newReagent(f.c.teacher);
    expectRejected((await f.c.teacher.rpc("archive_reagents", { p_reagent_ids: [fresh, three[0]] })) as unknown as Res, "이미 보관 섞임", E.notFound);
    expect((await reagentById(fresh))?.deleted_at, "전부 취소 → 새 시약 그대로").toBeNull();
    // 범위
    const over = await bulkReagentsByService(f.a.id, RANGE[1] + 1);
    expectRejected((await f.c.admin.rpc("archive_reagents", { p_reagent_ids: over })) as unknown as Res, `${RANGE[1] + 1}개`, E.invalid);
    expect(((await service().from("reagents").select("id").in("id", over).is("deleted_at", null)).data ?? []).length, "101개 거부 → 그대로").toBe(over.length);
    const ok = (await f.c.admin.rpc("archive_reagents", { p_reagent_ids: over.slice(0, RANGE[1]) })) as unknown as Res;
    expect(expectOk(ok, `${RANGE[1]}개`), `반환 = ${RANGE[1]}`).toBe(RANGE[1]);
  });

  test("[N1-db][S2] [GM-db][S2] archive_reagents: B' admin → A' 시약 P0002 (자기 것 섞여도 전부 취소) · 공용 학교 B 계정 → A' 시약 P0002 · 교사 → 데모 시약 P0002 · 데모 그대로", async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const aId = await newReagent(f.c.teacher);
    const bId = await newReagent(f.bAdmin);
    expectRejected((await f.bAdmin.rpc("archive_reagents", { p_reagent_ids: [bId, aId] })) as unknown as Res, "B' → [자기, A']", E.notFound);
    expect((await reagentById(bId))?.deleted_at, "B' 자기 시약 그대로").toBeNull();
    expect((await reagentById(aId))?.deleted_at, "A' 시약 그대로").toBeNull();
    const sB = await signIn("schoolB");
    expectRejected((await sB.client.rpc("archive_reagents", { p_reagent_ids: [aId] })) as unknown as Res, "학교 B → A'", E.notFound);
    const demo = await anonClient().from("reagents").select("id, deleted_at").order("id").limit(1);
    const demoId = (demo.data ?? [])[0]?.id as string;
    expect(demoId, "데모 시약 (anon)").toBeTruthy();
    expectRejected((await f.c.teacher.rpc("archive_reagents", { p_reagent_ids: [demoId] })) as unknown as Res, "교사 → 데모", E.notFound);
    expect(((await anonClient().from("reagents").select("id").eq("id", demoId)).data ?? []).length, "데모 시약 그대로 보임").toBe(1);
  });

  // =========================== 입고일 QA ===========================
  test("[R-db][S7] 입고일 미래 금지(d7 §25 QA 2): 내일 날짜 record_intake · register_reagent · record_document_intake 거부 → 재고 · 입고 기록 · 시약 수 그대로 / 오늘 날짜는 세 경로 모두 성공", async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const tomorrow = daysAgoKst(-1);
    const today = ymdKst();
    const rid = await newReagent(f.c.teacher);
    const before = { r: await reagentById(rid), logs: await intakeCount(rid) };
    const countAll = async () => ((await service().from("reagents").select("id").eq("school_id", f.a.id)).data ?? []).length;
    const n0 = await countAll();
    expectRejected((await f.c.teacher.rpc("record_intake", { p_reagent_id: rid, p_amount: 5, p_intake_date: tomorrow })) as unknown as Res, "record_intake 내일");
    const name = `미래입고-${uniq()}`;
    expectRejected((await f.c.teacher.rpc("register_reagent", { p_name: name, p_storage_class: STORAGE[0], p_stock: 3, p_unit: "g", p_intake_date: tomorrow, p_msds_url: null })) as unknown as Res, "register_reagent 내일");
    expectRejected(
      (await f.c.teacher.rpc("record_document_intake", { p_intake_date: tomorrow, p_items: [{ reagent_id: rid, amount: 2 }, { name: `${name}-서류`, storage_class: STORAGE[0], unit: "g", stock: 1, msds_url: null }] })) as unknown as Res,
      "record_document_intake 내일",
    );
    expect(await reagentById(rid), "거부 → 시약 행 그대로").toEqual(before.r);
    expect(await intakeCount(rid), "거부 → 입고 기록 그대로").toBe(before.logs);
    expect(await countAll(), "거부 → 새 시약 0").toBe(n0);
    // 양성 대조: 오늘
    expectOk((await f.c.teacher.rpc("record_intake", { p_reagent_id: rid, p_amount: 5, p_intake_date: today })) as unknown as Res, "record_intake 오늘");
    expectOk((await f.c.teacher.rpc("register_reagent", { p_name: `${name}-오늘`, p_storage_class: STORAGE[0], p_stock: 3, p_unit: "g", p_intake_date: today, p_msds_url: null })) as unknown as Res, "register_reagent 오늘");
    expectOk((await f.c.teacher.rpc("record_document_intake", { p_intake_date: today, p_items: [{ reagent_id: rid, amount: 1 }] })) as unknown as Res, "record_document_intake 오늘");
    const r = await reagentById(rid);
    expect(Number(r?.stock), "오늘 입고 2번 → 재고 +6").toBe(Number(before.r?.stock) + 6);
    expect(r?.intake_date, "최근 입고일 = 오늘").toBe(today);
  });

  test("[R-db][S7] 최근 입고일 = 가장 늦은 입고일 유지(d7 §25 QA 3): 더 이른 날짜 입고(record_intake · 서류 입고)는 재고만 늘고 intake_date 그대로 · 더 늦은 날짜 입고는 intake_date 갱신", async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const latest = daysAgoKst(3);
    const rid = await newReagent(f.c.teacher, latest);
    const r0 = await reagentById(rid);
    expect(r0?.intake_date, "준비: 첫 입고일").toBe(latest);
    expectOk((await f.c.teacher.rpc("record_intake", { p_reagent_id: rid, p_amount: 4, p_intake_date: daysAgoKst(10) })) as unknown as Res, "더 이른 날짜 record_intake");
    let r = await reagentById(rid);
    expect({ stock: Number(r?.stock), date: r?.intake_date }, "이른 입고 → 재고 +4 · 입고일 그대로").toEqual({ stock: Number(r0?.stock) + 4, date: latest });
    expectOk((await f.c.teacher.rpc("record_document_intake", { p_intake_date: daysAgoKst(20), p_items: [{ reagent_id: rid, amount: 1 }] })) as unknown as Res, "더 이른 날짜 서류 입고");
    r = await reagentById(rid);
    expect({ stock: Number(r?.stock), date: r?.intake_date }, "이른 서류 입고 → 재고 +1 · 입고일 그대로").toEqual({ stock: Number(r0?.stock) + 5, date: latest });
    const later = daysAgoKst(1);
    expectOk((await f.c.teacher.rpc("record_intake", { p_reagent_id: rid, p_amount: 1, p_intake_date: later })) as unknown as Res, "더 늦은 날짜 record_intake");
    r = await reagentById(rid);
    expect(r?.intake_date, "늦은 입고 → 입고일 갱신").toBe(later);
    expect(await intakeCount(rid), "입고 기록 = 첫 재고 + 3").toBe(4);
  });
});
