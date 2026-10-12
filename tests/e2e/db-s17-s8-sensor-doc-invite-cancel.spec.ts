// [R-db][S17] · [N1-db][S17] · [GM-db][S17] · [R-db][S8] · [N1-db][S8]
// d7 §28 "센서 종류 DB" · "센서 서류 저장 DB" · "초대 취소 (화면 8)" + §8 초대 수락 규칙 — 실제 RLS · 함수
// (publishable 키 + 각 계정 로그인 세션). service role 은 준비(계정 · 학교 · 가입) · 정리 · 대조 조회에만.
// 오류 코드(42501 권한 · 22023 값 · P0002 없음/다른 학교/가입한 초대)는 builder 계약
// (supabase/migrations/20261012200000_sensor_types_doc_invite_cancel.sql 머리말).
// 마이그레이션이 DB 에 없으면 함수 호출이 PGRST202 로 실패한다 — 메시지에 "함수가 있어야 함" 으로 드러난다(적용 전).
// 절대 규칙 (운영 DB): 성공하는 쓰기는 일회용 학교 A'(admin · 교사 · 학생) · B'(admin) 에만. 공용 학교 A·B·데모는 거부되어야 하는 호출만
//   (앞뒤 스냅숏 같음). afterAll 잔여물 0.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { test, expect, type TestInfo } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anonClient, signIn } from "./db-helpers";
import {
  HAS_SERVICE,
  addMember,
  clientFor,
  profileByService,
  service,
  sharedSnapshot,
  tempEmail,
  tempName,
  tempSchool,
  type TempSchool,
  type TempUser,
} from "./screen-8-helpers";
import { NO_SENSOR_RESIDUE, SENSOR, STATUS, cleanupSensors, sharedSensorSnapshot } from "./sensor-helpers";
import { PASCO_CATALOG, PASCO_MAKER } from "../../lib/pasco-catalog";

test.describe.configure({ mode: "default" });

const GROUP = "s28db";
const TIMEOUT = 300_000;
const NO_SERVICE_REASON = "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)";
const E = { denied: "42501", invalid: "22023", notFound: "P0002" } as const;

const D7 = readFileSync(join(process.cwd(), "harness", "d7-data.md"), "utf8").replace(/\r\n/g, "\n");
const D7_28 = D7.slice(D7.indexOf("## 28."), D7.indexOf("\n## ", D7.indexOf("## 28.") + 5));
const row28 = (item: string): string => {
  const line = D7_28.split("\n").find((l) => l.startsWith(`| ${item} |`));
  if (!line) throw new Error(`d7 §28 '${item}' 줄을 찾지 못함`);
  return line;
};
const DOC_ROW = row28("센서 서류 저장 DB");
/** d7 §28 "1~50" */
const RANGE = (() => {
  const m = /(\d+)~(\d+), 하나라도 틀리면 전부 취소/.exec(DOC_ROW);
  if (!m) throw new Error("d7 §28 센서 서류 저장 DB 범위를 읽지 못함");
  return [Number(m[1]), Number(m[2])] as const;
})();
/** d7 §28 "(9999 상한)" */
const QTY_CAP = (() => {
  const m = /\((\d+) 상한\)/.exec(DOC_ROW);
  if (!m) throw new Error("d7 §28 수량 상한을 읽지 못함");
  return Number(m[1]);
})();
/** d7 §28 "데모 센서 시드 … (4~6개 유지, …)" */
const DEMO_RANGE = (() => {
  const m = /\((\d+)~(\d+)개 유지/.exec(row28("센서 종류 DB"));
  if (!m) throw new Error("d7 §28 데모 센서 개수를 읽지 못함");
  return [Number(m[1]), Number(m[2])] as const;
})();
const DEMO_MUST_TYPES = (() => {
  const m = /종류 다양하게 — ([^)]+) 포함/.exec(row28("센서 종류 DB"));
  if (!m) throw new Error("d7 §28 데모 센서 포함 종류를 읽지 못함");
  return m[1].split("·").map((s) => s.trim());
})();
const LEGACY_HEART = "심박";
const HEART = SENSOR.types.find((t) => t.startsWith(`${LEGACY_HEART}·`))!;

const DEMO_SCHOOL_ID = (() => {
  const m = readFileSync(join(process.cwd(), "lib", "supabase", "demo-data.ts"), "utf8").match(/export const DEMO_SCHOOL_ID\s*=\s*"([0-9a-f-]{36})"/);
  if (!m) throw new Error("lib/supabase/demo-data.ts 에서 DEMO_SCHOOL_ID 를 찾지 못했습니다");
  return m[1];
})();
const [OK, CHECK, BROKEN] = STATUS.map((s) => s.db);
const MAKER = (SENSOR.makers["센서"] as string[])[0];

type Row = Record<string, unknown>;
type DbError = { code?: string; message: string; details?: string | null };
type Res = { data: unknown; error: DbError | null };

function expectRejected(res: Res, what: string, code?: string): void {
  expect(res.error, `${what}: 거부되어야 함 (반환: ${JSON.stringify(res.data)})`).not.toBeNull();
  expect(String(res.error?.code ?? ""), `${what}: 함수가 있어야 함 — 마이그레이션 적용 전? (${res.error?.message})`).not.toMatch(/^PGRST2/);
  if (code) expect(res.error?.code, `${what}: 오류 코드 (${res.error?.message})`).toBe(code);
}
function expectOk(res: Res, what: string): unknown {
  expect(res.error, `${what}: ${res.error?.code} ${res.error?.message}`).toBeNull();
  return res.data;
}
const rpc = async (c: SupabaseClient, fn: string, args: Row): Promise<Res> => (await c.rpc(fn, args)) as unknown as Res;
const doc = (c: SupabaseClient, items: unknown) => rpc(c, "record_sensor_document", { p_items: items });
const cancel = (c: SupabaseClient, id: string) => rpc(c, "cancel_invite", { p_invite_id: id });

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

async function newSensor(c: SupabaseClient, quantity = 1, extra: Row = {}): Promise<string> {
  const res = await rpc(c, "upsert_sensor", { p_name: `임시센서-${uniq()}`, p_type: SENSOR.types[0], p_maker: MAKER, p_quantity: quantity, p_status: OK, ...extra });
  const data = expectOk(res, "준비: upsert_sensor") as { sensor_id?: string };
  expect(typeof data?.sensor_id, "반환 sensor_id").toBe("string");
  return data.sensor_id as string;
}
async function sensorById(id: string): Promise<Row | null> {
  const r = await service().from("sensors").select("*").eq("id", id).maybeSingle();
  if (r.error) throw new Error(`대조 조회 실패: ${r.error.message}`);
  return (r.data as Row | null) ?? null;
}
async function sensorsNamed(schoolId: string, like: string): Promise<Row[]> {
  const r = await service().from("sensors").select("*").eq("school_id", schoolId).like("name", like);
  if (r.error) throw new Error(`대조 조회 실패: ${r.error.message}`);
  return (r.data ?? []) as Row[];
}
async function schoolSensorCount(schoolId: string): Promise<number> {
  return ((await service().from("sensors").select("id").eq("school_id", schoolId)).data ?? []).length;
}
const newItem = (name: string, patch: Row = {}): Row => ({
  name,
  type: SENSOR.types[0],
  maker: PASCO_MAKER,
  model: "PS-3201",
  quantity: 2,
  location_text: "준비실 선반",
  slot_id: null,
  status: OK,
  memo: null,
  ...patch,
});

// ---------- 초대 · 가입 ----------
async function createUserWith(email: string, tag: string): Promise<TempUser> {
  const password = randomBytes(18).toString("base64url");
  const made = await service().auth.admin.createUser({ email, password, email_confirm: true });
  if (made.error || !made.data.user) throw new Error(`일회용 계정 생성 실패: ${made.error?.message}`);
  return { id: made.data.user.id, email, password, name: tempName(tag) };
}
/** 가입의 학교 연결 단계와 같은 호출 (lib/server/onboard → register_profile, service_role 전용 — 판정 대상 아님) */
async function register(user: TempUser, school: TempSchool): Promise<{ school_id: string; role: string }> {
  const res = await service().rpc("register_profile", {
    p_user_id: user.id,
    p_neis_code: school.neis,
    p_office_code: "S8T",
    p_school_name: school.name,
    p_sido: "임시",
    p_region: "임시",
    p_display_name: user.name,
  });
  if (res.error) throw new Error(`register_profile 실패: ${res.error.message}`);
  return (Array.isArray(res.data) ? res.data[0] : res.data) as { school_id: string; role: string };
}
/** admin 이 invite_members 로 초대 → 그 초대 행 (admin 세션으로 읽기 — RLS 같은 학교 admin) */
async function invite(admin: SupabaseClient, email: string, role: "student" | "teacher"): Promise<Row> {
  expectOk(await rpc(admin, "invite_members", { p_emails: [email], p_role: role }), "준비: invite_members");
  const r = await admin.from("invites").select("*").eq("email", email.toLowerCase());
  expect(r.error, `준비: 초대 행 읽기 (${r.error?.message})`).toBeNull();
  expect(r.data ?? [], "준비: 초대 행 1개").toHaveLength(1);
  return (r.data as Row[])[0];
}
async function inviteById(id: string): Promise<Row | null> {
  const r = await service().from("invites").select("*").eq("id", id).maybeSingle();
  if (r.error) throw new Error(`대조 조회 실패: ${r.error.message}`);
  return (r.data as Row | null) ?? null;
}

// ---------- 공용 학교 스냅숏 ----------
let before: { sensors: string[]; shared: Awaited<ReturnType<typeof sharedSnapshot>> } | null = null;
test.beforeAll(async ({}, info) => {
  info.setTimeout(120_000);
  if (HAS_SERVICE) before = { sensors: await sharedSensorSnapshot(), shared: await sharedSnapshot() };
});
test.afterAll(async ({}, info) => {
  info.setTimeout(TIMEOUT);
  if (!HAS_SERVICE) return;
  cache = null;
  const left = await cleanupSensors(GROUP, info.project.name);
  expect(left, "일회용 계정·학교·센서·초대 잔여물").toEqual(NO_SENSOR_RESIDUE);
  if (before) {
    expect(await sharedSensorSnapshot(), "학교 A·B·데모 센서 그대로").toEqual(before.sensors);
    expect(await sharedSnapshot(), "학교 A·B 프로필·초대 그대로").toEqual(before.shared);
  }
});

test(`[R-db][S17] 기대값 원본: d7 §28 센서 서류 저장 DB(항목 ${RANGE.join("~")} · ${QTY_CAP} 상한 · 전부 취소) · 센서 종류 DB(데모 ${DEMO_RANGE.join("~")}개 · ${DEMO_MUST_TYPES.join("·")} 포함) · 초대 취소 · rules sensor.types`, () => {
  expect(DOC_ROW).toMatch(/record_sensor_document\(p_items jsonb\)/);
  expect(DOC_ROW).toMatch(/교사·admin·자기 학교·데모 거부/);
  expect(DOC_ROW).toMatch(/added_count, new_sensor_ids\[\]/);
  expect(row28("초대 취소 (화면 8)")).toMatch(/cancel_invite\(p_invite_id uuid\)/);
  expect(row28("초대 취소 (화면 8)")).toMatch(/admin·자기 학교·아직 가입 안 한 초대만·데모 거부/);
  expect(row28("초대 취소 (화면 8)")).toMatch(/초대 역할 없이 student/);
  expect(row28("센서 종류")).toMatch(/27종/);
  expect(SENSOR.types, "rules sensor.types = 27종").toHaveLength(27);
  expect(SENSOR.types).not.toContain(LEGACY_HEART);
  expect(HEART, "rules 에 '심박·생체'").toBeTruthy();
});

// =========================== 데모 · 종류 (공용 데이터 읽기만) ===========================
test(`[GM-db][S17] 데모 센서: anon 읽기 ${DEMO_RANGE.join("~")}개 · 모두 파스코 카탈로그 모델(종류 = 카탈로그) · ${DEMO_MUST_TYPES.join("·")} 포함 · 고장 1 · 점검 필요 1`, async () => {
  const r = await anonClient().from("sensors").select("id, school_id, name, type, maker, model, status, deleted_at").order("id");
  expect(r.error, `anon sensors (${r.error?.message})`).toBeNull();
  const rows = (r.data ?? []) as Row[];
  expect(rows.every((x) => x.school_id === DEMO_SCHOOL_ID && x.deleted_at === null), "anon = 데모 학교 · 보관 제외").toBe(true);
  expect(rows.length, "데모 센서 수").toBeGreaterThanOrEqual(DEMO_RANGE[0]);
  expect(rows.length, "데모 센서 수").toBeLessThanOrEqual(DEMO_RANGE[1]);
  for (const x of rows) {
    const hit = PASCO_CATALOG.find((m) => m.model === x.model);
    expect({ id: x.id, maker: x.maker, catalog: Boolean(hit) }, `데모 센서 ${x.name} = 파스코 카탈로그 모델 (${x.model})`).toEqual({ id: x.id, maker: PASCO_MAKER, catalog: true });
    expect(x.type, `${x.model} 종류 = 카탈로그 종류`).toBe(hit?.type);
  }
  const types = rows.map((x) => x.type);
  for (const t of DEMO_MUST_TYPES) expect(types, `데모 센서 종류에 ${t}`).toContain(t);
  expect(new Set(types).size, "종류 다양 (모두 다름)").toBe(rows.length);
  expect(rows.filter((x) => x.status === BROKEN), "고장 1개").toHaveLength(1);
  expect(rows.filter((x) => x.status === CHECK), "점검 필요 1개").toHaveLength(1);
});

test(`[R-db][S17] 옛 종류 '${LEGACY_HEART}' 행 0 (보관 포함 — 대조 조회) · 모든 센서 type ∈ rules 27종`, async () => {
  test.skip(!HAS_SERVICE, NO_SERVICE_REASON);
  const legacy = await service().from("sensors").select("id").eq("type", LEGACY_HEART);
  expect(legacy.error).toBeNull();
  expect(legacy.data ?? [], `type '${LEGACY_HEART}' 남은 행`).toHaveLength(0);
  const all = await service().from("sensors").select("type");
  const outside = [...new Set((all.data ?? []).map((x) => x.type as string))].filter((t) => !SENSOR.types.includes(t));
  expect(outside, "27종 밖 type").toEqual([]);
});

test.describe("일회용 학교", () => {
  test.skip(!HAS_SERVICE, NO_SERVICE_REASON);

  // =========================== 센서 종류 27종 ===========================
  test(`[R-db][S17] upsert_sensor: rules 27종 모두 저장 성공 · '${LEGACY_HEART}' 22023 · 직접 insert 로도 우회 불가`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    for (const t of SENSOR.types) {
      const id = await newSensor(f.c.teacher, 1, { p_type: t, p_name: `종류-${uniq()}` });
      expect((await sensorById(id))?.type, `종류 ${t} 저장`).toBe(t);
    }
    expectRejected(await rpc(f.c.teacher, "upsert_sensor", { p_name: "옛 종류", p_type: LEGACY_HEART, p_maker: MAKER, p_quantity: 1, p_status: OK }), `upsert_sensor '${LEGACY_HEART}'`, E.invalid);
    // 체크 제약: service 로 넣어도 거부 (대조 — 제약 자체를 본다)
    const raw = await service().from("sensors").insert({ school_id: f.a.id, name: `제약-${uniq()}`, type: LEGACY_HEART, maker: MAKER, quantity: 1, status: OK }).select("id");
    expect(raw.error, `sensors_type_check 가 '${LEGACY_HEART}' 를 거부`).not.toBeNull();
    const rawOk = await service().from("sensors").insert({ school_id: f.a.id, name: `제약-${uniq()}`, type: HEART, maker: MAKER, quantity: 1, status: OK }).select("id");
    expect(rawOk.error, `sensors_type_check 가 '${HEART}' 허용 (${rawOk.error?.message})`).toBeNull();
  });

  // =========================== record_sensor_document ===========================
  test("[R-db][S17] record_sensor_document: 교사 · admin 성공 — 기존 센서 수량 더하기 + 새 센서(자기 학교 · created_by · 상태 없으면 ok) · 반환 { added_count, new_sensor_ids(항목 순서) }", async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const ids = { teacher: f.teacherId, admin: f.a.admin.id };
    for (const who of ["teacher", "admin"] as const) {
      const existing = await newSensor(f.c[who], 3);
      const n1 = `서류새1-${uniq()}`;
      const n2 = `서류새2-${uniq()}`;
      const noStatus = newItem(n2, { type: HEART, model: null, location_text: null });
      delete noStatus.status;
      const res = await doc(f.c[who], [{ sensor_id: existing, add_quantity: 2 }, newItem(n1, { status: CHECK, memo: "메모" }), noStatus]);
      const data = expectOk(res, `${who} record_sensor_document`) as { added_count: number; new_sensor_ids: string[] };
      expect(data.added_count, "added_count = 처리한 항목 수").toBe(3);
      expect(data.new_sensor_ids, "new_sensor_ids 2개").toHaveLength(2);
      expect((await sensorById(existing))?.quantity, "기존 3 + 2").toBe(5);
      const r1 = await sensorById(data.new_sensor_ids[0]);
      const r2 = await sensorById(data.new_sensor_ids[1]);
      expect({ name: r1?.name, school: r1?.school_id, by: r1?.created_by, status: r1?.status, memo: r1?.memo, maker: r1?.maker, model: r1?.model, qty: r1?.quantity, loc: r1?.location_text }, `${who} 새 센서 1`).toEqual({
        name: n1,
        school: f.a.id,
        by: ids[who],
        status: CHECK,
        memo: "메모",
        maker: PASCO_MAKER,
        model: "PS-3201",
        qty: 2,
        loc: "준비실 선반",
      });
      expect({ name: r2?.name, type: r2?.type, status: r2?.status, model: r2?.model }, `${who} 새 센서 2 (상태 없음 → ok · ${HEART})`).toEqual({ name: n2, type: HEART, status: OK, model: null });
      // 같은 학교 학생도 결과를 select 로 본다
      const seen = await f.c.student.from("sensors").select("id").in("id", data.new_sensor_ids);
      expect((seen.data ?? []).length, "같은 학교 학생 select").toBe(2);
    }
    // 반환: 더하기만 = 새 id []
    const only = await newSensor(f.c.teacher, 1);
    const d = expectOk(await doc(f.c.teacher, [{ sensor_id: only, add_quantity: 1 }]), "더하기만") as { added_count: number; new_sensor_ids: string[] };
    expect(d).toEqual({ added_count: 1, new_sensor_ids: [] });
  });

  test("[R-db][S17] record_sensor_document: 학생 42501 · anon 거부 — 행 그대로 · 새 센서 0", async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const id = await newSensor(f.c.teacher, 4);
    const snap = await sensorById(id);
    const name = `학생시도-${uniq()}`;
    expectRejected(await doc(f.c.student, [{ sensor_id: id, add_quantity: 1 }, newItem(name)]), "학생 record_sensor_document", E.denied);
    const anon = await doc(anonClient(), [{ sensor_id: id, add_quantity: 1 }]);
    expect(anon.error, "anon record_sensor_document 거부").not.toBeNull();
    expect(await sensorById(id), "학생 · anon 뒤 행 그대로").toEqual(snap);
    expect(await sensorsNamed(f.a.id, name), "학생 새 센서 0").toHaveLength(0);
  });

  test("[N1-db][S17] record_sensor_document 다른 학교 · 데모: B' admin → A' 센서 더하기 P0002 · [B' 자기 것, A' 것] 전부 취소 · 교사 → 데모 센서 P0002 · A'·B'·데모 그대로 · A' 칸(slot) 으로 새 센서 P0002 · 공용 학교 B 계정 → A' 센서 P0002", async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const aId = await newSensor(f.c.teacher, 2);
    const bId = await newSensor(f.bAdmin, 2);
    const aSnap = await sensorById(aId);
    const bSnap = await sensorById(bId);
    expectRejected(await doc(f.bAdmin, [{ sensor_id: aId, add_quantity: 1 }]), "B' → A' 더하기", E.notFound);
    expectRejected(await doc(f.bAdmin, [{ sensor_id: bId, add_quantity: 1 }, { sensor_id: aId, add_quantity: 1 }]), "B' → [자기, A']", E.notFound);
    expect(await sensorById(bId), "전부 취소: B' 자기 센서 그대로").toEqual(bSnap);
    expect(await sensorById(aId), "A' 센서 그대로").toEqual(aSnap);

    const demo = await anonClient().from("sensors").select("*").order("id");
    const demoId = ((demo.data ?? []) as Row[])[0]?.id as string;
    expect(demoId, "데모 센서 (anon)").toBeTruthy();
    expectRejected(await doc(f.c.teacher, [{ sensor_id: demoId, add_quantity: 1 }]), "교사 → 데모 센서 더하기", E.notFound);
    expect((await anonClient().from("sensors").select("*").order("id")).data, "데모 센서 그대로").toEqual(demo.data);

    // A' 의 시약장 칸을 B' 가 새 센서 칸으로 쓰면 not found (칸이 없으면 이 줄은 건너뛰지 않고 가짜 id 로 본다)
    const slot = await service().from("cabinet_slots").select("id").eq("school_id", f.a.id).limit(1);
    const slotId = ((slot.data ?? [])[0]?.id as string | undefined) ?? randomUUID();
    const sName = `칸침범-${uniq()}`;
    expectRejected(await doc(f.bAdmin, [newItem(sName, { slot_id: slotId, location_text: null })]), "B' → A'/없는 칸", E.notFound);
    expect(await sensorsNamed(f.b.id, sName), "B' 새 센서 0").toHaveLength(0);

    const sB = await signIn("schoolB");
    expectRejected(await doc(sB.client, [{ sensor_id: aId, add_quantity: 1 }]), "공용 학교 B → A' 더하기", E.notFound);
    expect(await sensorById(aId), "A' 센서 그대로").toEqual(aSnap);
  });

  test(`[R-db][S17] record_sensor_document 항목 ${RANGE.join("~")}: 0개 · ${RANGE[1] + 1}개 · 배열 아님 22023 (행 없음) · ${RANGE[1]}개 성공 (new_sensor_ids ${RANGE[1]}개)`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const tag = `범위-${uniq()}`;
    const count0 = await schoolSensorCount(f.a.id);
    expectRejected(await doc(f.c.teacher, []), "0개", E.invalid);
    expectRejected(await doc(f.c.teacher, Array.from({ length: RANGE[1] + 1 }, (_, i) => newItem(`${tag}-x${i}`))), `${RANGE[1] + 1}개`, E.invalid);
    expectRejected(await doc(f.c.teacher, { name: "객체" }), "배열 아님", E.invalid);
    expectRejected(await doc(f.c.teacher, null), "null", E.invalid);
    expect(await schoolSensorCount(f.a.id), "거부 뒤 행 수 그대로").toBe(count0);
    const max = expectOk(await doc(f.c.teacher, Array.from({ length: RANGE[1] }, (_, i) => newItem(`${tag}-${i}`))), `${RANGE[1]}개`) as { added_count: number; new_sensor_ids: string[] };
    expect(max.added_count).toBe(RANGE[1]);
    expect(new Set(max.new_sensor_ids).size).toBe(RANGE[1]);
    expect(await sensorsNamed(f.a.id, `${tag}-%`), `${RANGE[1]}개 저장`).toHaveLength(RANGE[1]);
  });

  test("[R-db][S17] record_sensor_document 하나라도 틀리면 전부 취소: [더하기 OK, 새 센서 OK, 틀린 항목] → 오류 · 더하기 안 됨 · 새 센서 0 (틀린 항목: 27종 밖 · 옛 '심박' · 이름 빈 값 · 회사 없음 · 상태 밖 · 수량 -1 · sensor_id·name 둘 다 · 둘 다 없음 · uuid 아님 · 없는 센서)", async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const id = await newSensor(f.c.teacher, 5);
    const bad: [string, Row, string][] = [
      ["27종 밖", newItem("x", { type: "무게" }), E.invalid],
      [`옛 '${LEGACY_HEART}'`, newItem("x", { type: LEGACY_HEART }), E.invalid],
      ["이름 빈 값", newItem("   "), E.invalid],
      ["이름 41자", newItem("가".repeat(41)), E.invalid],
      ["회사 없음", newItem("x", { maker: "" }), E.invalid],
      ["상태 밖", newItem("x", { status: "lost" }), E.invalid],
      ["수량 -1", newItem("x", { quantity: -1 }), E.invalid],
      ["수량 글자", newItem("x", { quantity: "2" }), E.invalid],
      ["sensor_id·name 둘 다", { sensor_id: id, add_quantity: 1, name: "x" }, E.invalid],
      ["둘 다 없음", { add_quantity: 1 }, E.invalid],
      ["uuid 아님", { sensor_id: "abc", add_quantity: 1 }, E.invalid],
      ["없는 센서", { sensor_id: randomUUID(), add_quantity: 1 }, E.notFound],
    ];
    for (const [what, item, code] of bad) {
      const name = `취소-${uniq()}`;
      expectRejected(await doc(f.c.teacher, [{ sensor_id: id, add_quantity: 1 }, newItem(name), item]), what, code);
      expect((await sensorById(id))?.quantity, `${what}: 더하기 취소`).toBe(5);
      expect(await sensorsNamed(f.a.id, name), `${what}: 새 센서 취소`).toHaveLength(0);
    }
    // 보관한 센서에 더하기 = not found
    const archived = await newSensor(f.c.teacher, 1);
    expectOk(await rpc(f.c.teacher, "archive_sensor", { p_sensor_id: archived }), "준비: archive_sensor");
    expectRejected(await doc(f.c.teacher, [{ sensor_id: archived, add_quantity: 1 }]), "보관한 센서", E.notFound);
    expect((await sensorById(archived))?.quantity, "보관 센서 수량 그대로").toBe(1);
  });

  test(`[R-db][S17] record_sensor_document 수량 ${QTY_CAP} 상한: ${QTY_CAP - 9} + 9 = ${QTY_CAP} 성공 · 그 위 +1 22023 · 같은 센서 두 줄 합산 초과 → 전부 취소 · add_quantity 0 · 소수 · ${QTY_CAP + 1} · 글자 22023`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const id = await newSensor(f.c.admin, QTY_CAP - 9);
    expectOk(await doc(f.c.admin, [{ sensor_id: id, add_quantity: 9 }]), `+9 → ${QTY_CAP}`);
    expect((await sensorById(id))?.quantity).toBe(QTY_CAP);
    expectRejected(await doc(f.c.admin, [{ sensor_id: id, add_quantity: 1 }]), `${QTY_CAP} + 1`, E.invalid);
    expect((await sensorById(id))?.quantity, "상한 위 거부 뒤 그대로").toBe(QTY_CAP);

    const id2 = await newSensor(f.c.admin, QTY_CAP - 10);
    expectRejected(await doc(f.c.admin, [{ sensor_id: id2, add_quantity: 6 }, { sensor_id: id2, add_quantity: 6 }]), "두 줄 합산 초과", E.invalid);
    expect((await sensorById(id2))?.quantity, "두 줄 합산 초과: 첫 줄도 취소").toBe(QTY_CAP - 10);

    for (const [what, q] of [["0", 0], ["소수", 1.5], [`${QTY_CAP + 1}`, QTY_CAP + 1], ["글자", "2"], ["null", null]] as const) {
      expectRejected(await doc(f.c.admin, [{ sensor_id: id2, add_quantity: q }]), `add_quantity ${what}`, E.invalid);
    }
    expect((await sensorById(id2))?.quantity).toBe(QTY_CAP - 10);
    const nName = `상한새-${uniq()}`;
    expectRejected(await doc(f.c.admin, [newItem(nName, { quantity: QTY_CAP + 1 })]), `새 센서 수량 ${QTY_CAP + 1}`, E.invalid);
    expect(await sensorsNamed(f.a.id, nName)).toHaveLength(0);
  });

  // =========================== cancel_invite ===========================
  test("[R-db][S8] cancel_invite: admin 대기 초대 취소 성공(반환 invite_id·email · 행 삭제) · 교사 · 학생 42501 · anon 거부 (행 그대로) · 없는 id P0002", async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const inv = await invite(f.c.admin, tempEmail(info, GROUP, "inv-"), "teacher");
    const id = inv.id as string;
    for (const who of ["teacher", "student"] as const) {
      expectRejected(await cancel(f.c[who], id), `${who} cancel_invite`, E.denied);
    }
    const anon = await cancel(anonClient(), id);
    expect(anon.error, "anon cancel_invite 거부").not.toBeNull();
    expect(await inviteById(id), "거부 뒤 초대 그대로").toEqual(inv);
    const data = expectOk(await cancel(f.c.admin, id), "admin cancel_invite") as { invite_id: string; email: string };
    expect(data).toEqual({ invite_id: id, email: inv.email });
    expect(await inviteById(id), "취소한 초대 행 없음").toBeNull();
    const list = await f.c.admin.from("invites").select("id").eq("id", id);
    expect(list.data ?? [], "admin 목록에서 빠짐").toHaveLength(0);
    expectRejected(await cancel(f.c.admin, id), "이미 취소한 초대", E.notFound);
    expectRejected(await cancel(f.c.admin, randomUUID()), "없는 id", E.notFound);
  });

  test("[N1-db][S8] cancel_invite 다른 학교: B' admin → A' 초대 P0002 · select 0행 · 공용 학교 A·B admin/교사 → A' 초대 거부 · 초대 그대로", async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const inv = await invite(f.c.admin, tempEmail(info, GROUP, "inv-"), "student");
    const id = inv.id as string;
    const seen = await f.bAdmin.from("invites").select("id").eq("id", id);
    expect(seen.data ?? [], "B' → A' 초대 0행").toHaveLength(0);
    expectRejected(await cancel(f.bAdmin, id), "B' admin → A' 초대", E.notFound);
    const sA = await signIn("admin");
    expectRejected(await cancel(sA.client, id), "공용 학교 A admin → A' 초대", E.notFound);
    const sB = await signIn("schoolB");
    expectRejected(await cancel(sB.client, id), "공용 학교 B → A' 초대");
    expect(await inviteById(id), "A' 초대 그대로").toEqual(inv);
  });

  test("[R-db][S8] cancel_invite 가입한 초대 거부: 교사로 초대 → 가입(teacher · accepted_at) → cancel P0002 · 초대 행 그대로", async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const email = tempEmail(info, GROUP, "acc-");
    const inv = await invite(f.c.admin, email, "teacher");
    const u = await createUserWith(email, "가입");
    const prof = await register(u, f.a);
    expect(prof, "초대 수락 = 초대 역할").toMatchObject({ school_id: f.a.id, role: "teacher" });
    const accepted = await inviteById(inv.id as string);
    expect(accepted?.accepted_at, "accepted_at 채움").toBeTruthy();
    expectRejected(await cancel(f.c.admin, inv.id as string), "가입한 초대 취소", E.notFound);
    expect(await inviteById(inv.id as string), "가입한 초대 행 그대로").toEqual(accepted);
    expect((await profileByService(u.id))?.role, "가입자 역할 그대로").toBe("teacher");
  });

  test("[R-db][S8] cancel_invite 뒤 그 이메일로 가입 = student (초대 역할 teacher 없음, d7 §8)", async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const email = tempEmail(info, GROUP, "cxl-");
    const inv = await invite(f.c.admin, email, "teacher");
    expectOk(await cancel(f.c.admin, inv.id as string), "admin cancel_invite");
    const u = await createUserWith(email, "취소후");
    const prof = await register(u, f.a);
    expect(prof, "취소 뒤 가입 = student").toMatchObject({ school_id: f.a.id, role: "student" });
    const left = await service().from("invites").select("id").eq("email", email.toLowerCase());
    expect(left.data ?? [], "취소한 초대가 다시 생기지 않음").toHaveLength(0);
  });
});
