// [R-db][S2] · [R-db][S10] · [N1-db][S2] · [N1-db][S10] · [GM-db][S2] · [GM-db][S10] · [R-db][S3] (보관 회귀)
// 시약 전체 삭제 · 기록 삭제 DB (harness/d7-data.md §29 "시약 전체 삭제" · "기록 삭제" · "기록 삭제 DB" · "테스트", §24 "삭제 DB = 보관")
// — 실제 RLS · 함수 (publishable 키 + 각 계정 로그인 세션). service role 은 일회용 학교 준비 · 정리 · 대조 조회에만.
// 기준:
//   wipe_reagents(p_school_name) → int: admin · 자기 학교 · 데모 거부 · 학교명 일치(앞뒤 공백 정리 후 같음, 아니면 22023) →
//     보관 안 된 우리 학교 시약 전부 보관(archive_reagent 와 같은 처리 — deleted_at · deleted_by · 칸 배치 해제), 한 트랜잭션, 반환 = 보관한 수.
//     사용 · 입고 기록은 남는다.
//   count_wipe_records(p_before) → {usage_count, intake_count}: null = 전체, admin · 자기 학교.
//   wipe_records(p_before, p_school_name) → {usage_count, intake_count}: admin · 자기 학교 · 데모 거부 · 학교명 일치 · p_before 미래 거부(22023) →
//     usage_logs(used_on < p_before) · intake_logs(intake_date < p_before) 와 수업 정보를 실제로 지운다(그날 미포함).
//     재고 · intake_date · 재주문 기준 · low_stock_since 는 바꾸지 않는다.
//   오류 코드 계약(42501 · 22023 · 'school name mismatch' · 'before date in the future' · 'admin only')은 builder 마이그레이션
//   supabase/migrations/20261013210000_wipe_reagents_records.sql 머리말과 같다.
//
// 절대 규칙 (d7 §29 "테스트"): 공용 학교 A · B · 데모 데이터는 절대 지우지 않는다.
// - 성공 경로(전체 삭제 · 기록 삭제)는 일회용 학교 A'(admin · 교사 · 학생) · B'(admin) 에서만.
// - 공용 학교로는 거부 경로(교사 · 학생 · 학교명 틀림 · 다른 학교)만. 그것도 같은 거부를 일회용 학교에서 먼저 확인한 뒤에만 부른다
//   (WIPE_GUARD — 거부가 확인되지 않았으면 공용 학교로 부르지 않고 실패). 실행 전후 공용 데이터(오래된 행) 불변 확인.
// - 데모 학교 프로필은 없다(둘러보기는 비회원) → 데모 거부는 anon 호출 거부 + 일회용 admin 이 데모 학교명을 넣어도 거부 + 데모 행 불변.
// - 정리 순서: usage_logs → intake_logs → 시약 → 시약장 → 프로필 → 계정 → 학교. 끝에 잔여물 0.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { test, expect, type TestInfo } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anonClient, signIn, type Role } from "./db-helpers";
import { HAS_SERVICE, NO_RESIDUE, addMember, clientFor, profileByService, service, sweep, tempSchool, tempSchoolLike, type TempSchool, type TempUser } from "./screen-8-helpers";

// 순서대로 한 worker 에서 (실패해도 다음 테스트는 돈다 — 대신 worker 가 바뀌면 WIPE_GUARD 가 초기화되어 공용 학교 호출을 막는다)
test.describe.configure({ mode: "default" });

const GROUP = "wipe29";
const TIMEOUT = 300_000;
const NO_SERVICE_REASON = "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)";
const MIGRATION = "20261013210000_wipe_reagents_records.sql";

// ---------- 기대값 원본 ----------
const ROOT = process.cwd();
const D7 = readFileSync(join(ROOT, "harness", "d7-data.md"), "utf8");
const section = (head: string) => {
  const s = D7.indexOf(head);
  if (s < 0) throw new Error(`d7 에 ${head} 없음`);
  const e = D7.indexOf("\n## ", s + 1);
  return D7.slice(s, e < 0 ? undefined : e);
};
const D7_29 = section("## 29.");
const D7_24 = section("## 24.");
const RULES = JSON.parse(readFileSync(join(ROOT, "design", "rules.json"), "utf8")) as {
  wipe: { roles: string[] };
  cabinet: { storage_classes: string[]; shelves: number[] };
};
const WIPE_ROLES = RULES.wipe.roles;
const STORAGE = RULES.cabinet.storage_classes;
const MAX_SHELVES = Math.max(...RULES.cabinet.shelves);

const DEMO_SCHOOL_ID = (() => {
  const src = readFileSync(join(ROOT, "lib", "supabase", "demo-data.ts"), "utf8");
  const m = src.match(/export const DEMO_SCHOOL_ID\s*=\s*"([0-9a-f-]{36})"/);
  if (!m) throw new Error("lib/supabase/demo-data.ts 에서 DEMO_SCHOOL_ID 를 찾지 못했습니다");
  return m[1];
})();

// ---------- 오류 코드 (d7 §29 · builder 계약) ----------
const E = { denied: "42501", invalid: "22023", notFound: "P0002" } as const;
const MSG = { mismatch: /school name mismatch/, future: /before date in the future/, adminOnly: /admin only/ } as const;

type Row = Record<string, unknown>;
type DbError = { code?: string; message: string; details?: string | null };
type Res = { data: unknown; error: DbError | null };
type RoleKey = "student" | "teacher" | "admin";
const ROLE_TEXT: Record<RoleKey, string> = { student: "학생", teacher: "교사", admin: "admin" };

// ---------- 한국 날짜 ----------
const KST = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
const daysAgo = (days: number) => KST.format(new Date(Date.now() - days * 86_400_000));
const kstMidnight = (ymd: string) => new Date(`${ymd}T00:00:00+09:00`);
async function awayFromMidnight(): Promise<void> {
  for (;;) {
    const now = Date.now();
    if (kstMidnight(daysAgo(-1)).getTime() - now > 120_000 && now - kstMidnight(daysAgo(0)).getTime() > 120_000) return;
    await new Promise((r) => setTimeout(r, 30_000));
  }
}

const firstRow = (data: unknown): Row | null => (Array.isArray(data) ? ((data[0] as Row | undefined) ?? null) : ((data as Row | null) ?? null));

/** 함수가 DB 에 없으면(PostgREST PGRST202) 원인을 분명히 — 마이그레이션 적용 전 */
function expectFunctionExists(res: Res, what: string): void {
  if (res.error?.code === "PGRST202") {
    throw new Error(`${what}: 마이그레이션 ${MIGRATION} 적용 전 (PGRST202 — ${res.error.message})`);
  }
}
/** 거부: 오류가 있고(PGRST… 아님), 반환 값이 없고, 코드 · 메시지가 맞다 */
function expectRejected(res: Res, what: string, code?: string, msg?: RegExp): void {
  expectFunctionExists(res, what);
  expect(res.error, `${what}: 거부되어야 함 (반환: ${JSON.stringify(res.data)})`).not.toBeNull();
  expect(String(res.error?.code ?? ""), `${what}: ${res.error?.message}`).not.toMatch(/^PGRST/);
  if (code) expect(res.error?.code, `${what}: 오류 코드 (${res.error?.message})`).toBe(code);
  if (msg) expect(res.error?.message ?? "", `${what}: 오류 메시지`).toMatch(msg);
  expect(res.data ?? null, `${what}: 반환 값 없음`).toBeNull();
}
function expectOk(res: Res, what: string): unknown {
  expectFunctionExists(res, what);
  expect(res.error, `${what}: ${res.error?.code} ${res.error?.message} ${res.error?.details ?? ""}`).toBeNull();
  return res.data;
}

const wipeReagents = (c: SupabaseClient, name: unknown) => c.rpc("wipe_reagents", { p_school_name: name }) as unknown as Promise<Res>;
const countRecords = (c: SupabaseClient, before: string | null) => c.rpc("count_wipe_records", { p_before: before }) as unknown as Promise<Res>;
const wipeRecords = (c: SupabaseClient, before: string | null, name: unknown) =>
  c.rpc("wipe_records", { p_before: before, p_school_name: name }) as unknown as Promise<Res>;

type Counts = { usage_count: number; intake_count: number };
const asCounts = (data: unknown): Counts => {
  const o = firstRow(data) ?? {};
  return { usage_count: Number(o.usage_count), intake_count: Number(o.intake_count) };
};

// ---------- 일회용 학교 ----------
interface Fixture {
  a: TempSchool;
  b: TempSchool;
  users: Record<RoleKey, TempUser>;
  c: Record<RoleKey, SupabaseClient>;
  bAdmin: SupabaseClient;
  bUser: TempUser;
}

/** 대소문자 비교용으로 A' 학교명에 영문을 넣는다 (rules N1 학교명 패턴 [가-힣A-Za-z0-9]+(고등학교) 안) — 준비 단계 service role */
const latinName = (old: string) => old.replace(/^임시/, "임시Lab");

let fixtureCache: Promise<Fixture> | null = null;
function fixture(info: TestInfo): Promise<Fixture> {
  fixtureCache ??= (async () => {
    const a = await tempSchool(info, GROUP);
    const renamed = latinName(a.name);
    const up = await service().from("schools").update({ name: renamed }).eq("id", a.id);
    expect(up.error, `준비: A' 학교명 ${renamed}`).toBeNull();
    a.name = renamed;
    const admin = await clientFor(a.admin);
    const teacher = await addMember(a, info, GROUP, "교사");
    const r = await admin.rpc("change_member_role", { p_user_id: teacher.id, p_role: "teacher" });
    expect(r.error, `준비: 일회용 교사 역할 (${r.error?.message})`).toBeNull();
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
      bUser: b.admin,
    };
  })();
  fixtureCache.catch(() => {
    fixtureCache = null;
  });
  return fixtureCache;
}

let seq = 0;
const uniq = () => `${++seq}-${randomUUID().slice(0, 6)}`;

/** 임시 시약 (register_reagent — 입고 기록 1행이 같이 생긴다) */
async function newReagent(c: SupabaseClient, stock = 100, intakeDate = daysAgo(30)): Promise<{ id: string; name: string }> {
  const n = `임시전체삭제-${uniq()}`;
  const res = await c.rpc("register_reagent", {
    p_name: n,
    p_storage_class: STORAGE[0],
    p_stock: stock,
    p_unit: "g",
    p_intake_date: intakeDate,
    p_msds_url: null,
  });
  expect(res.error, `준비: register_reagent (${res.error?.message})`).toBeNull();
  return { id: firstRow(res.data)!.id as string, name: n };
}
async function intake(c: SupabaseClient, id: string, amount: number, date: string): Promise<void> {
  const r = await c.rpc("record_intake", { p_reagent_id: id, p_amount: amount, p_intake_date: date });
  expect(r.error, `준비: record_intake ${date} (${r.error?.message})`).toBeNull();
}
async function use(c: SupabaseClient, id: string, amount: number, usedOn: string, cls?: { grade: number; no: number; subject: string }): Promise<void> {
  const r = await c.rpc("record_usage_batch", {
    p_items: [{ reagent_id: id, amount }],
    p_used_on: usedOn,
    p_memo: null,
    p_class_grade: cls?.grade ?? null,
    p_class_no: cls?.no ?? null,
    p_class_subject: cls?.subject ?? null,
  });
  expect(r.error, `준비: record_usage_batch ${usedOn} (${r.error?.message})`).toBeNull();
}
/** 시약장 1개 + 칸 → 칸 id (add_cabinet → save_cabinet_layout) */
async function newSlot(c: SupabaseClient): Promise<string> {
  const cab = await c.rpc("add_cabinet");
  expect(cab.error, `준비: add_cabinet (${cab.error?.message})`).toBeNull();
  const cabId = firstRow(cab.data)!.id as string;
  const lay = await c.rpc("save_cabinet_layout", { p_cabinet_id: cabId, p_door_type: "양문형", p_shelves: MAX_SHELVES, p_slots: [{ side: "L", shelf: 1, classes: [STORAGE[0]] }] });
  expect(lay.error, `준비: save_cabinet_layout (${lay.error?.message})`).toBeNull();
  const slots = await service().from("cabinet_slots").select("id").eq("cabinet_id", cabId).order("id");
  expect((slots.data ?? []).length, "준비: 칸 ≥1").toBeGreaterThan(0);
  return slots.data![0].id as string;
}
async function placeIn(c: SupabaseClient, reagentId: string, slotId: string): Promise<void> {
  const r = await c.rpc("place_reagent", { p_reagent_id: reagentId, p_slot_id: slotId });
  expect(r.error, `준비: place_reagent (${r.error?.message})`).toBeNull();
}

// ---------- 대조 조회 (service role — 판정 대상 아님) ----------
async function rowsOf(table: "reagents" | "usage_logs" | "intake_logs" | "cabinets" | "cabinet_slots", schoolId: string): Promise<Row[]> {
  const r = await service().from(table).select("*").eq("school_id", schoolId).order("id");
  if (r.error) throw new Error(`대조 조회 실패 ${table}: ${r.error.message}`);
  return (r.data ?? []) as Row[];
}
type SchoolState = { reagents: Row[]; usage: Row[]; intake: Row[]; cabinets: Row[]; slots: Row[] };
async function schoolState(schoolId: string): Promise<SchoolState> {
  return {
    reagents: await rowsOf("reagents", schoolId),
    usage: await rowsOf("usage_logs", schoolId),
    intake: await rowsOf("intake_logs", schoolId),
    cabinets: await rowsOf("cabinets", schoolId),
    slots: await rowsOf("cabinet_slots", schoolId),
  };
}
/** d7 §29 "바꾸지 않는다": 재고 · intake_date · 재주문 기준 · low_stock_since (+ 나머지 열도 그대로여야 한다 — 행 전체 비교) */
const STOCK_COLS = ["stock", "intake_date", "min_stock", "min_stock_source", "min_stock_auto_basis", "reorder_per_group", "reorder_groups", "low_stock_since"] as const;

// ---------- 공용 학교(A · B · 데모) 불변 확인 ----------
/** 이 스펙이 공용 학교에 부르기 전, 같은 거부가 일회용 학교에서 확인되었는지 (같은 worker 안에서만 참) */
const WIPE_GUARD = { reagents: false, records: false };

/** 공용 학교의 "오래된" 행 (1시간 전 이전 — 다른 스펙이 잠깐 넣고 지우는 임시 행 제외): 살아 있는 시약 id · 사용 · 입고 기록 id */
type SharedSnap = { live: string[]; usage: string[]; intake: string[] };
async function sharedSnapshot(): Promise<SharedSnap> {
  const sb = service();
  const s = await sb.from("schools").select("id").or("neis_code.like.TEST-SCHOOL-%,is_demo.eq.true");
  const ids = (s.data ?? []).map((x) => x.id as string);
  expect(ids.length, "공용 학교 A · B · 데모 (대조)").toBeGreaterThanOrEqual(3);
  const cutoff = new Date(Date.now() - 3_600_000).toISOString();
  const live = await sb.from("reagents").select("id").in("school_id", ids).is("deleted_at", null).lt("created_at", cutoff).order("id");
  const usage = await sb.from("usage_logs").select("id").in("school_id", ids).lt("used_at", cutoff).order("id");
  const intakeRows = await sb.from("intake_logs").select("id").in("school_id", ids).lt("created_at", cutoff).order("id");
  for (const r of [live, usage, intakeRows]) if (r.error) throw new Error(`공용 대조 조회 실패: ${r.error.message}`);
  const out = {
    live: (live.data ?? []).map((x) => x.id as string),
    usage: (usage.data ?? []).map((x) => x.id as string),
    intake: (intakeRows.data ?? []).map((x) => x.id as string),
  };
  expect(out.live.length, "공용 학교 살아 있는 시약 ≥1 (양성 대조군)").toBeGreaterThan(0);
  return out;
}
async function expectSharedIntact(before: SharedSnap, what: string): Promise<void> {
  const sb = service();
  const still = async (table: string, ids: string[], live = false) => {
    if (ids.length === 0) return [] as string[];
    const found = new Set<string>();
    for (let i = 0; i < ids.length; i += 200) {
      let q = sb.from(table).select("id").in("id", ids.slice(i, i + 200));
      if (live) q = q.is("deleted_at", null);
      const r = await q;
      if (r.error) throw new Error(`공용 대조 조회 실패: ${r.error.message}`);
      for (const x of r.data ?? []) found.add(x.id as string);
    }
    return ids.filter((id) => !found.has(id));
  };
  expect(await still("reagents", before.live, true), `${what}: 공용 학교 시약 보관 · 삭제 0`).toEqual([]);
  expect(await still("usage_logs", before.usage), `${what}: 공용 학교 사용 기록 삭제 0`).toEqual([]);
  expect(await still("intake_logs", before.intake), `${what}: 공용 학교 입고 기록 삭제 0`).toEqual([]);
}

/** 데모 학교 (anon 읽기 — 전체 열) */
async function demoSnapshot(): Promise<{ reagents: Row[]; usage: Row[] }> {
  const anon = anonClient();
  const reagents = await anon.from("reagents").select("*").eq("school_id", DEMO_SCHOOL_ID).order("id");
  const usage = await anon.from("usage_logs").select("*").eq("school_id", DEMO_SCHOOL_ID).order("id");
  expect(reagents.error, `anon 데모 reagents: ${reagents.error?.message}`).toBeNull();
  expect(usage.error, `anon 데모 usage_logs: ${usage.error?.message}`).toBeNull();
  expect((reagents.data ?? []).length, "데모 시약 ≥1 (양성 대조군)").toBeGreaterThan(0);
  return { reagents: (reagents.data ?? []) as Row[], usage: (usage.data ?? []) as Row[] };
}
let demoBefore: Awaited<ReturnType<typeof demoSnapshot>> | null = null;
let sharedBefore: SharedSnap | null = null;

test.beforeAll(async ({}, info) => {
  info.setTimeout(120_000);
  demoBefore = await demoSnapshot();
  if (HAS_SERVICE) sharedBefore = await sharedSnapshot();
});

test.afterAll(async ({}, info) => {
  info.setTimeout(TIMEOUT);
  let left: Awaited<ReturnType<typeof sweep>> | null = null;
  const rest: Record<string, number> = {};
  if (HAS_SERVICE) {
    const sb = service();
    const schools = await sb.from("schools").select("id").like("neis_code", tempSchoolLike(GROUP, info.project.name));
    const ids = (schools.data ?? []).map((s) => s.id as string);
    if (ids.length) {
      await sb.from("usage_logs").delete().in("school_id", ids);
      await sb.from("intake_logs").delete().in("school_id", ids);
      await sb.from("reagents").delete().in("school_id", ids);
      await sb.from("cabinets").delete().in("school_id", ids);
    }
    for (const table of ["reagents", "intake_logs", "usage_logs", "cabinets", "cabinet_slots"]) {
      const r = ids.length ? await sb.from(table).select("id").in("school_id", ids) : { data: [] as unknown[] };
      rest[table] = (r.data ?? []).length;
    }
    left = await sweep(GROUP, info.project.name);
    fixtureCache = null;
  }
  if (left) {
    expect(rest, "일회용 학교의 시약 · 기록 · 시약장 잔여물").toEqual({ reagents: 0, intake_logs: 0, usage_logs: 0, cabinets: 0, cabinet_slots: 0 });
    expect(left, "일회용 계정 · 학교 · 프로필 잔여물").toEqual(NO_RESIDUE);
  }
  if (sharedBefore) await expectSharedIntact(sharedBefore, "스펙 전후");
  if (demoBefore) {
    const after = await demoSnapshot();
    expect(after.reagents, "데모 reagents (전체 열) 불변").toEqual(demoBefore.reagents);
    expect(after.usage, "데모 usage_logs (전체 열) 불변").toEqual(demoBefore.usage);
  }
});

test("[R-db][S2] [R-db][S10] 기대값 원본: rules wipe.roles = admin 만 · d7 §29 wipe_reagents · count_wipe_records · wipe_records 계약 · 테스트 규칙", () => {
  expect(WIPE_ROLES, "rules wipe.roles").toEqual(["admin"]);
  expect(D7_29).toMatch(/wipe_reagents\(p_school_name text\)/);
  expect(D7_29).toMatch(/학교명 일치\(앞뒤 공백 정리 후 같음, 아니면 22023\)/);
  expect(D7_29).toMatch(/반환 = 보관한 수/);
  expect(D7_29).toMatch(/사용·입고 기록은 남는다/);
  expect(D7_29).toMatch(/count_wipe_records\(p_before date\)`\(null = 전체, admin·자기 학교\)/);
  expect(D7_29).toMatch(/wipe_records\(p_before date, p_school_name text\)/);
  expect(D7_29).toMatch(/p_before 미래 거부\(22023\)/);
  expect(D7_29).toMatch(/그날 미포함/);
  expect(D7_29).toMatch(/시약 재고\(stock\)·intake_date·재주문 기준·low_stock_since 는 바꾸지 않는다/);
  expect(D7_29).toMatch(/반환 = \{usage_count, intake_count\}/);
  expect(D7_29).toMatch(/공용 학교 A·B·데모 데이터는 절대 지우지 않는다/);
  expect(D7_24).toMatch(/칸 배치는 비움\(slot_id null\)/);
});

test.describe("일회용 학교", () => {
  test.skip(!HAS_SERVICE, NO_SERVICE_REASON);

  // =====================================================================
  // wipe_reagents 거부 (먼저 — 성공하면 A' 시약이 모두 보관된다)
  // =====================================================================
  test(`[R-db][S2] 일회용 A' wipe_reagents 거부: 교사 · 학생 = ${E.denied} · admin 학교명 틀림 · null · 빈 칸 · 대소문자 · 비슷한 이름 · 가운데 공백 · 다른 학교(B') 이름 · 데모 학교 이름 = ${E.invalid} 'school name mismatch' · anon 거부 · A' · B' 아무것도 안 바뀜`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const slot = await newSlot(f.c.admin);
    const r1 = await newReagent(f.c.admin, 50);
    await placeIn(f.c.admin, r1.id, slot);
    await newReagent(f.c.admin, 10);
    await newReagent(f.bAdmin, 10);
    const beforeA = await schoolState(f.a.id);
    const beforeB = await schoolState(f.b.id);
    expect(beforeA.reagents.filter((r) => r.deleted_at === null).length, "전제: A' 살아 있는 시약 ≥2").toBeGreaterThanOrEqual(2);

    for (const role of ["teacher", "student"] as const) {
      expectRejected(await wipeReagents(f.c[role], f.a.name), `${ROLE_TEXT[role]} (학교명 맞음)`, E.denied);
      expectRejected(await wipeReagents(f.c[role], `  ${f.a.name}  `), `${ROLE_TEXT[role]} (학교명 앞뒤 공백)`, E.denied);
    }
    const demoName = ((await anonClient().from("schools").select("name").eq("id", DEMO_SCHOOL_ID).single()).data?.name ?? "") as string;
    expect(demoName, "데모 학교명 (anon 읽기)").not.toBe("");
    expect(f.a.name, "전제: A' 학교명에 영문 (대소문자 비교)").toMatch(/Lab/);
    const wrong: [string, unknown][] = [
      ["null", null],
      ["빈 칸", ""],
      ["공백만", "   "],
      ["대문자", f.a.name.replace("Lab", "LAB")],
      ["소문자", f.a.name.replace("Lab", "lab")],
      ["접미사 없음", f.a.name.replace(/고등학교$/, "")],
      ["학교급 다름", f.a.name.replace(/고등학교$/, "중학교")],
      ["한 글자 더", `${f.a.name}x`],
      ["한 글자 빠짐", f.a.name.slice(1)],
      ["가운데 공백", f.a.name.replace("Lab", "Lab ")],
      ["전각 영문", f.a.name.replace("L", "Ｌ")],
      ["다른 학교(B') 이름", f.b.name],
      ["데모 학교 이름", demoName],
    ];
    for (const [what, name] of wrong) {
      expectRejected(await wipeReagents(f.c.admin, name), `admin 학교명 ${what} (${JSON.stringify(name)})`, E.invalid, MSG.mismatch);
    }
    expectRejected(await wipeReagents(anonClient(), f.a.name), "anon");
    expectRejected(await wipeReagents(anonClient(), demoName), "anon (데모 학교명)");
    expect(await schoolState(f.a.id), "거부 뒤 A' 시약 · 기록 · 칸 그대로").toEqual(beforeA);
    expect(await schoolState(f.b.id), "거부 뒤 B' 그대로").toEqual(beforeB);
    WIPE_GUARD.reagents = true;
  });

  // =====================================================================
  // wipe_reagents 성공
  // =====================================================================
  test(`[R-db][S2] [N1-db][S2] 일회용 A' admin wipe_reagents(앞뒤 공백 학교명): 반환 = 보관한 수(이미 보관된 시약 제외) · deleted_at · deleted_by = admin · 칸 배치 해제 · 재고 · 사용 · 입고 기록 · 시약장 그대로 · 세션 select 0 · 다시 부르면 0 · B' 영향 0`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    await awayFromMidnight();
    const slot = await newSlot(f.c.admin);
    const placed = await newReagent(f.c.admin, 40);
    await placeIn(f.c.admin, placed.id, slot);
    const used = await newReagent(f.c.admin, 30);
    await use(f.c.student, used.id, 2, daysAgo(1), { grade: 1, no: 3, subject: "과학" });
    await intake(f.c.teacher, used.id, 5, daysAgo(2));
    const gone = await newReagent(f.c.admin, 10);
    expectOk((await f.c.teacher.rpc("archive_reagent", { p_reagent_id: gone.id })) as unknown as Res, "준비: 교사 archive_reagent");
    const bR = await newReagent(f.bAdmin, 10);
    await use(f.bAdmin, bR.id, 1, daysAgo(1));

    const beforeA = await schoolState(f.a.id);
    const beforeB = await schoolState(f.b.id);
    const liveBefore = beforeA.reagents.filter((r) => r.deleted_at === null);
    expect(liveBefore.length, "전제: A' 살아 있는 시약 ≥2 (배치 · 기록 있는 시약)").toBeGreaterThanOrEqual(2);
    expect(beforeA.reagents.find((r) => r.id === placed.id)?.slot_id, "전제: 칸 배치됨").toBe(slot);
    const t0 = Date.now();

    const res = await wipeReagents(f.c.admin, `   ${f.a.name}  `);
    const n = expectOk(res, "admin wipe_reagents");
    expect(Number(n), "반환 = 보관한 수 (보관 안 된 우리 학교 시약 전부)").toBe(liveBefore.length);

    const afterA = await schoolState(f.a.id);
    expect(afterA.reagents.map((r) => r.id), "A' 시약 행은 지우지 않음 (보관)").toEqual(beforeA.reagents.map((r) => r.id));
    for (const r of afterA.reagents) {
      const b = beforeA.reagents.find((x) => x.id === r.id)!;
      if (b.deleted_at !== null) {
        expect(r, `이미 보관된 시약 ${r.name} 은 건드리지 않음 (deleted_at · deleted_by 그대로)`).toEqual(b);
        continue;
      }
      expect(r.deleted_at, `${r.name} deleted_at`).not.toBeNull();
      expect(Math.abs(new Date(r.deleted_at as string).getTime() - t0), `${r.name} deleted_at = 지금`).toBeLessThan(120_000);
      expect(r.deleted_by, `${r.name} deleted_by = 부른 admin`).toBe(f.users.admin.id);
      expect(r.slot_id, `${r.name} 칸 배치 해제`).toBeNull();
      for (const col of [...STOCK_COLS, "name", "unit", "school_id", "storage_class", "msds_url"]) {
        expect(r[col], `${r.name} ${col} 그대로`).toEqual(b[col]);
      }
    }
    expect(afterA.usage, "사용 기록 남음 (수업 정보 포함)").toEqual(beforeA.usage);
    expect(afterA.intake, "입고 기록 남음").toEqual(beforeA.intake);
    expect(afterA.cabinets, "시약장 그대로").toEqual(beforeA.cabinets);
    expect(afterA.slots, "칸 그대로").toEqual(beforeA.slots);
    expect(await schoolState(f.b.id), "B' 영향 0").toEqual(beforeB);

    for (const role of ["admin", "teacher", "student"] as const) {
      const sel = await f.c[role].from("reagents").select("id");
      expect(sel.error).toBeNull();
      expect(sel.data ?? [], `${ROLE_TEXT[role]} 세션 시약 select = 0 (보관 = 목록 제외)`).toEqual([]);
    }
    const again = expectOk(await wipeReagents(f.c.admin, f.a.name), "다시 부름");
    expect(Number(again), "지울 시약 0 → 반환 0").toBe(0);
    expect(await schoolState(f.a.id), "두 번째 호출 뒤 그대로").toEqual(afterA);
    // 보관 뒤 같은 이름 새 시약 등록 허용 (d7 §24) — 전체 삭제 뒤 다시 시작할 수 있다
    const again2 = await f.c.admin.rpc("register_reagent", { p_name: placed.name, p_storage_class: STORAGE[0], p_stock: 1, p_unit: "g", p_intake_date: daysAgo(1), p_msds_url: null });
    expect(again2.error, `보관된 이름으로 새 시약 등록 (${again2.error?.message})`).toBeNull();
  });

  // =====================================================================
  // count_wipe_records · wipe_records 거부
  // =====================================================================
  test(`[R-db][S10] 일회용 A' count_wipe_records · wipe_records 거부: 교사 · 학생 = ${E.denied} · admin 학교명 틀림(null · 빈 칸 · 대소문자 · 다른 학교) = ${E.invalid} · 내일 날짜 = ${E.invalid} 'before date in the future'(학교명 맞아도) · anon 거부 · 기록 그대로`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    await awayFromMidnight();
    const r = await newReagent(f.c.admin, 50, daysAgo(20));
    await use(f.c.student, r.id, 1, daysAgo(10), { grade: 2, no: 1, subject: "화학" });
    await use(f.c.teacher, r.id, 1, daysAgo(1));
    const bR = await newReagent(f.bAdmin, 10, daysAgo(20));
    await use(f.bAdmin, bR.id, 1, daysAgo(10));
    const beforeA = await schoolState(f.a.id);
    const beforeB = await schoolState(f.b.id);
    expect(beforeA.usage.length, "전제: A' 사용 기록 ≥2").toBeGreaterThanOrEqual(2);
    const tomorrow = daysAgo(-1);

    for (const role of ["teacher", "student"] as const) {
      for (const before of [null, daysAgo(0)]) {
        expectRejected(await countRecords(f.c[role], before), `${ROLE_TEXT[role]} count_wipe_records(${before})`, E.denied);
        expectRejected(await wipeRecords(f.c[role], before, f.a.name), `${ROLE_TEXT[role]} wipe_records(${before}, 학교명 맞음)`, E.denied);
      }
    }
    for (const [what, name] of [["null", null], ["빈 칸", ""], ["공백만", "  "], ["대문자", f.a.name.replace("Lab", "LAB")], ["비슷한 이름", `${f.a.name}x`], ["다른 학교(B')", f.b.name]] as [string, unknown][]) {
      for (const before of [null, daysAgo(0)]) {
        expectRejected(await wipeRecords(f.c.admin, before, name), `admin wipe_records(${before}) 학교명 ${what}`, E.invalid, MSG.mismatch);
      }
    }
    expectRejected(await countRecords(f.c.admin, tomorrow), "admin count_wipe_records(내일)", E.invalid, MSG.future);
    expectRejected(await countRecords(f.c.admin, daysAgo(-400)), "admin count_wipe_records(먼 미래)", E.invalid, MSG.future);
    expectRejected(await wipeRecords(f.c.admin, tomorrow, f.a.name), "admin wipe_records(내일, 학교명 맞음)", E.invalid, MSG.future);
    expectRejected(await wipeRecords(f.c.admin, tomorrow, ` ${f.a.name} `), "admin wipe_records(내일, 앞뒤 공백 학교명)", E.invalid, MSG.future);
    expectRejected(await countRecords(anonClient(), null), "anon count_wipe_records");
    expectRejected(await wipeRecords(anonClient(), null, f.a.name), "anon wipe_records");
    expect(await schoolState(f.a.id), "거부 뒤 A' 기록 · 시약 그대로").toEqual(beforeA);
    expect(await schoolState(f.b.id), "거부 뒤 B' 그대로").toEqual(beforeB);
    WIPE_GUARD.records = true;
  });

  // =====================================================================
  // count_wipe_records · wipe_records '이 날짜 이전'
  // =====================================================================
  test(`[R-db][S10] [N1-db][S10] 일회용 A' admin '이 날짜 이전': count = 사용일 · 입고일 < 기준(그날 미포함) · 오늘 허용 · wipe_records 반환 = 미리보기 수 · 그 행만 실제 삭제(수업 정보 함께) · 기준일 이후 행 · 재고 · intake_date · 재주문 기준 · low_stock_since 그대로 · B' 기록 0 영향 · 다시 = 0건`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    await awayFromMidnight();
    const cutoff = daysAgo(5);
    const r1 = await newReagent(f.c.admin, 100, daysAgo(10)); // 입고 D-10
    const r2 = await newReagent(f.c.admin, 40, daysAgo(5)); // 입고 D-5 (그날 = 남음)
    await intake(f.c.teacher, r1.id, 3, daysAgo(6)); // D-6 (지움)
    await intake(f.c.admin, r2.id, 2, daysAgo(4)); // D-4 (남음)
    await use(f.c.student, r1.id, 2, daysAgo(10), { grade: 3, no: 2, subject: "지구과학" }); // 지움 (수업 정보)
    await use(f.c.teacher, r1.id, 1, daysAgo(6)); // 지움
    await use(f.c.student, r2.id, 1, daysAgo(5), { grade: 1, no: 1, subject: "물리" }); // 그날 = 남음
    await use(f.c.admin, r2.id, 1, daysAgo(0)); // 오늘 = 남음
    // 재고 부족(low_stock_since 있음) 시약 하나
    const th = await f.c.admin.rpc("set_reorder_threshold", { p_reagent_id: r2.id, p_min_stock: 1000 });
    expect(th.error, `준비: set_reorder_threshold (${th.error?.message})`).toBeNull();
    const bR = await newReagent(f.bAdmin, 10, daysAgo(10));
    await use(f.bAdmin, bR.id, 1, daysAgo(10), { grade: 1, no: 1, subject: "B" });

    const beforeA = await schoolState(f.a.id);
    const beforeB = await schoolState(f.b.id);
    expect(beforeA.reagents.find((r) => r.id === r2.id)?.low_stock_since, "전제: 재고 부족 시약 low_stock_since 있음").not.toBeNull();
    const expectCount = (before: string | null): Counts => ({
      usage_count: beforeA.usage.filter((u) => before === null || (u.used_on as string) < before).length,
      intake_count: beforeA.intake.filter((i) => before === null || (i.intake_date as string) < before).length,
    });
    expect(expectCount(cutoff).usage_count, "전제: 지울 사용 기록 ≥2").toBeGreaterThanOrEqual(2);
    expect(expectCount(cutoff).intake_count, "전제: 지울 입고 기록 ≥2").toBeGreaterThanOrEqual(2);
    expect(beforeA.usage.filter((u) => u.used_on === cutoff).length, "전제: 기준일 당일 사용 기록 ≥1").toBeGreaterThanOrEqual(1);
    expect(beforeA.intake.filter((i) => i.intake_date === cutoff).length, "전제: 기준일 당일 입고 기록 ≥1").toBeGreaterThanOrEqual(1);

    for (const before of [cutoff, daysAgo(0), daysAgo(9), "2000-01-01", null]) {
      const c = asCounts(expectOk(await countRecords(f.c.admin, before), `count_wipe_records(${before})`));
      expect(c, `count_wipe_records(${before}) = 그날 미포함 이전 (null = 전체)`).toEqual(expectCount(before));
    }
    const bCount = asCounts(expectOk(await countRecords(f.bAdmin, null), "B' count_wipe_records(null)"));
    expect(bCount, "B' 미리보기 = B' 기록만").toEqual({ usage_count: beforeB.usage.length, intake_count: beforeB.intake.length });
    expect(await schoolState(f.a.id), "count 는 읽기만").toEqual(beforeA);

    const res = asCounts(expectOk(await wipeRecords(f.c.admin, cutoff, f.a.name), `wipe_records(${cutoff})`));
    expect(res, "반환 = 미리보기 수").toEqual(expectCount(cutoff));

    const afterA = await schoolState(f.a.id);
    const keptUsage = beforeA.usage.filter((u) => (u.used_on as string) >= cutoff);
    const keptIntake = beforeA.intake.filter((i) => (i.intake_date as string) >= cutoff);
    expect(afterA.usage, "남은 사용 기록 = 기준일 이후(당일 포함) 행 그대로").toEqual(keptUsage);
    expect(afterA.intake, "남은 입고 기록 = 기준일 이후(당일 포함) 행 그대로").toEqual(keptIntake);
    const goneIds = beforeA.usage.filter((u) => (u.used_on as string) < cutoff).map((u) => u.id as string);
    const stillThere = await service().from("usage_logs").select("id, class_grade, class_no, class_subject").in("id", goneIds);
    expect(stillThere.data ?? [], "지운 사용 기록(수업 정보 포함) 어디에도 없음").toEqual([]);
    expect(afterA.reagents, "시약 행 전체(재고 · intake_date · 재주문 기준 · low_stock_since · 칸) 그대로").toEqual(beforeA.reagents);
    expect(afterA.cabinets).toEqual(beforeA.cabinets);
    expect(await schoolState(f.b.id), "B' 기록 · 시약 0 영향").toEqual(beforeB);
    // 세션 쪽에서도 (RLS select) 같은 결과
    const seen = await f.c.admin.from("usage_logs").select("id").order("id");
    expect((seen.data ?? []).map((x) => x.id), "admin 세션 usage_logs = 남은 행").toEqual(keptUsage.map((u) => u.id));

    expect(asCounts(expectOk(await countRecords(f.c.admin, cutoff), "지운 뒤 count")), "지운 뒤 미리보기 0건").toEqual({ usage_count: 0, intake_count: 0 });
    const zero = asCounts(expectOk(await wipeRecords(f.c.admin, cutoff, f.a.name), "다시 wipe_records"));
    expect(zero, "0건이어도 거부 아님 · 반환 0").toEqual({ usage_count: 0, intake_count: 0 });
    expect(await schoolState(f.a.id), "0건 실행 뒤 그대로").toEqual(afterA);
  });

  // =====================================================================
  // wipe_records 전체 · N1 (B' 가 지워도 A' 그대로)
  // =====================================================================
  test(`[R-db][S10] [N1-db][S10] 일회용 B' admin wipe_records(null = 전체, 자기 학교명): B' 사용 · 입고 기록 0 · 반환 = 전체 수 · B' 재고 그대로 · A' 기록 · 시약 0 영향 / 일회용 A' admin 전체 → A' 기록 0 · 재고 그대로 · B' 0 영향 / B' wipe_reagents 도 A' 0 영향`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    await awayFromMidnight();
    const aR = await newReagent(f.c.admin, 60, daysAgo(3));
    await use(f.c.teacher, aR.id, 2, daysAgo(2), { grade: 2, no: 4, subject: "생명" });
    await use(f.c.student, aR.id, 1, daysAgo(0));
    const bR = await newReagent(f.bAdmin, 30, daysAgo(3));
    await intake(f.bAdmin, bR.id, 4, daysAgo(1));
    await use(f.bAdmin, bR.id, 1, daysAgo(0), { grade: 1, no: 2, subject: "B과학" });
    const beforeA = await schoolState(f.a.id);
    const beforeB = await schoolState(f.b.id);
    expect(beforeA.usage.length + beforeA.intake.length, "전제: A' 기록 있음").toBeGreaterThan(0);

    // B' 전체 → B' 만
    const bRes = asCounts(expectOk(await wipeRecords(f.bAdmin, null, f.b.name), "B' wipe_records(null)"));
    expect(bRes, "B' 반환 = B' 전체 기록 수").toEqual({ usage_count: beforeB.usage.length, intake_count: beforeB.intake.length });
    const afterB = await schoolState(f.b.id);
    expect([afterB.usage, afterB.intake], "B' 기록 0").toEqual([[], []]);
    expect(afterB.reagents, "B' 시약(재고 등) 그대로").toEqual(beforeB.reagents);
    expect(await schoolState(f.a.id), "A' 0 영향").toEqual(beforeA);
    // B' wipe_reagents → A' 0 영향
    expectOk(await wipeReagents(f.bAdmin, f.b.name), "B' wipe_reagents");
    expect(await schoolState(f.a.id), "B' 전체 삭제 뒤 A' 0 영향").toEqual(beforeA);
    expect((await schoolState(f.b.id)).reagents.every((r) => r.deleted_at !== null), "B' 시약 모두 보관").toBe(true);

    // A' 전체 → A' 만
    const bState = await schoolState(f.b.id);
    const aRes = asCounts(expectOk(await wipeRecords(f.c.admin, null, f.a.name), "A' wipe_records(null)"));
    expect(aRes, "A' 반환 = A' 전체 기록 수").toEqual({ usage_count: beforeA.usage.length, intake_count: beforeA.intake.length });
    const afterA = await schoolState(f.a.id);
    expect([afterA.usage, afterA.intake], "A' 기록 0").toEqual([[], []]);
    expect(afterA.reagents, "A' 시약 행 전체 그대로 (재고 · intake_date · 재주문 기준 · low_stock_since)").toEqual(beforeA.reagents);
    expect(await schoolState(f.b.id), "B' 0 영향").toEqual(bState);
    expect(asCounts(expectOk(await countRecords(f.c.admin, null), "A' count(null) 뒤")), "지울 기록 0").toEqual({ usage_count: 0, intake_count: 0 });
  });

  // =====================================================================
  // 보관 함수 회귀 (archive_reagent_rows 공유로 재정의)
  // =====================================================================
  test(`[R-db][S3] [R-db][S2] archive_reagent · archive_reagents 회귀(같은 보관 본문으로 재정의): 교사 archive_reagent 반환 {reagent_id, name} · deleted_by · 칸 해제 · 재고 · 기록 그대로 · 다시 = ${E.notFound} · 학생 ${E.denied} · archive_reagents 2개 = 2 · 보관된 id 섞임 = ${E.notFound} 전부 취소 · null = ${E.invalid} · B' admin 이 A' 시약 = ${E.notFound} · anon 거부`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    await awayFromMidnight();
    const slot = await newSlot(f.c.admin);
    const x = await newReagent(f.c.admin, 20);
    await placeIn(f.c.teacher, x.id, slot);
    await use(f.c.student, x.id, 1, daysAgo(1));
    const [y, z, w] = [await newReagent(f.c.admin, 5), await newReagent(f.c.admin, 5), await newReagent(f.c.admin, 5)];
    const before = await schoolState(f.a.id);

    expectRejected((await f.c.student.rpc("archive_reagent", { p_reagent_id: x.id })) as unknown as Res, "학생 archive_reagent", E.denied);
    expectRejected((await f.bAdmin.rpc("archive_reagent", { p_reagent_id: x.id })) as unknown as Res, "B' admin → A' 시약", E.notFound);
    expectRejected((await anonClient().rpc("archive_reagent", { p_reagent_id: x.id })) as unknown as Res, "anon archive_reagent");
    expect(await schoolState(f.a.id), "거부 뒤 그대로").toEqual(before);

    const out = firstRow(expectOk((await f.c.teacher.rpc("archive_reagent", { p_reagent_id: x.id })) as unknown as Res, "교사 archive_reagent"));
    expect(out, "반환 {reagent_id, name}").toEqual({ reagent_id: x.id, name: x.name });
    const xb = before.reagents.find((r) => r.id === x.id)!;
    const xa = (await rowsOf("reagents", f.a.id)).find((r) => r.id === x.id)!;
    expect([xa.deleted_by, xa.slot_id, xa.deleted_at === null], "deleted_by = 교사 · 칸 해제 · deleted_at").toEqual([f.users.teacher.id, null, false]);
    for (const col of STOCK_COLS) expect(xa[col], `archive_reagent ${col} 그대로`).toEqual(xb[col]);
    expect(await rowsOf("usage_logs", f.a.id), "사용 기록 그대로").toEqual(before.usage);
    expectRejected((await f.c.teacher.rpc("archive_reagent", { p_reagent_id: x.id })) as unknown as Res, "다시 archive_reagent", E.notFound);

    const mid = await schoolState(f.a.id);
    expectRejected((await f.c.teacher.rpc("archive_reagents", { p_reagent_ids: [y.id, x.id] })) as unknown as Res, "archive_reagents 보관된 id 섞임", E.notFound);
    expectRejected((await f.c.teacher.rpc("archive_reagents", { p_reagent_ids: null })) as unknown as Res, "archive_reagents null", E.invalid);
    expectRejected((await f.c.student.rpc("archive_reagents", { p_reagent_ids: [y.id] })) as unknown as Res, "학생 archive_reagents", E.denied);
    expectRejected((await f.bAdmin.rpc("archive_reagents", { p_reagent_ids: [y.id] })) as unknown as Res, "B' admin archive_reagents → A' 시약", E.notFound);
    expect(await schoolState(f.a.id), "전부 취소 — 그대로").toEqual(mid);
    const two = expectOk((await f.c.admin.rpc("archive_reagents", { p_reagent_ids: [y.id, z.id, y.id] })) as unknown as Res, "admin archive_reagents 2개(중복 1)");
    expect(Number(two), "반환 = 서로 다른 시약 수").toBe(2);
    const rows = await rowsOf("reagents", f.a.id);
    for (const id of [y.id, z.id]) expect(rows.find((r) => r.id === id)?.deleted_by, "deleted_by = admin").toBe(f.users.admin.id);
    expect(rows.find((r) => r.id === w.id)?.deleted_at, "고르지 않은 시약 그대로").toBeNull();
  });

  // =====================================================================
  // 데모 · anon
  // =====================================================================
  test(`[GM-db][S2] [GM-db][S10] 데모: anon wipe_reagents · count_wipe_records · wipe_records 거부(데모 학교명 · null) · 일회용 admin 이 데모 학교명 = ${E.invalid} · 데모 시약 · 사용 기록 (전체 열) 그대로`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const demoName = ((await anonClient().from("schools").select("name").eq("id", DEMO_SCHOOL_ID).single()).data?.name ?? "") as string;
    expect(demoName, "데모 학교명").not.toBe("");
    const before = await demoSnapshot();
    const anon = anonClient();
    expectRejected(await wipeReagents(anon, demoName), "anon wipe_reagents(데모 학교명)");
    expectRejected(await countRecords(anon, null), "anon count_wipe_records(null)");
    expectRejected(await wipeRecords(anon, null, demoName), "anon wipe_records(null, 데모 학교명)");
    expectRejected(await wipeRecords(anon, daysAgo(0), demoName), "anon wipe_records(오늘, 데모 학교명)");
    expectRejected(await wipeReagents(f.c.admin, demoName), "일회용 admin wipe_reagents(데모 학교명)", E.invalid, MSG.mismatch);
    expectRejected(await wipeRecords(f.c.admin, null, demoName), "일회용 admin wipe_records(데모 학교명)", E.invalid, MSG.mismatch);
    expect(await demoSnapshot(), "데모 행 그대로").toEqual(before);
  });
});

// =====================================================================
// 공용 학교 A · B — 거부 경로만 (같은 거부를 일회용 학교에서 먼저 확인한 뒤)
// =====================================================================
test.describe("공용 학교 A · B (거부만)", () => {
  test.skip(!HAS_SERVICE, NO_SERVICE_REASON);

  const guard = () => {
    expect(WIPE_GUARD, "공용 학교로 부르기 전: 같은 worker 에서 일회용 학교 거부(교사 · 학생 · 학교명) 확인이 먼저 통과해야 한다 — 아니면 부르지 않는다").toEqual({ reagents: true, records: true });
  };

  test(`[R-db][S2] [R-db][S10] 공용 학교 A 교사 · 학생: wipe_reagents · wipe_records(학교명 맞음) · count_wipe_records = ${E.denied} · 공용 데이터 불변`, async () => {
    test.setTimeout(TIMEOUT);
    guard();
    const snap = await sharedSnapshot();
    const admin = await signIn("admin");
    const nameA = ((await admin.client.from("schools").select("name").eq("id", admin.schoolId).single()).data?.name ?? "") as string;
    expect(nameA, "학교 A 이름 (admin 세션 읽기)").not.toBe("");
    for (const role of ["teacher", "student"] as Role[]) {
      const s = await signIn(role);
      expect(s.schoolId, `${role} = 학교 A`).toBe(admin.schoolId);
      expectRejected(await wipeReagents(s.client, nameA), `학교 A ${role} wipe_reagents`, E.denied);
      expectRejected(await wipeRecords(s.client, null, nameA), `학교 A ${role} wipe_records(null)`, E.denied);
      expectRejected(await countRecords(s.client, null), `학교 A ${role} count_wipe_records`, E.denied);
    }
    await expectSharedIntact(snap, "교사 · 학생 거부 뒤");
  });

  test(`[R-db][S2] [R-db][S10] [N1-db][S2] [N1-db][S10] 공용 학교 A admin 학교명 틀림(다른 학교 B 이름 · 빈 칸 · 대소문자 · 비슷한 이름) · 학교 B 교사 = ${E.invalid}/${E.denied} · A admin 미래 날짜 미리보기 = ${E.invalid} · 공용 데이터 불변`, async () => {
    test.setTimeout(TIMEOUT);
    guard();
    const snap = await sharedSnapshot();
    const admin = await signIn("admin");
    const b = await signIn("schoolB");
    expect(b.schoolId, "학교 B ≠ 학교 A").not.toBe(admin.schoolId);
    const nameA = ((await admin.client.from("schools").select("name").eq("id", admin.schoolId).single()).data?.name ?? "") as string;
    const nameB = ((await b.client.from("schools").select("name").eq("id", b.schoolId).single()).data?.name ?? "") as string;
    expect([nameA, nameB].every(Boolean), "학교 A · B 이름").toBe(true);
    expect(nameA, "학교 A · B 이름 다름").not.toBe(nameB);
    const wrongForA = [nameB, "", "   ", `${nameA}x`, nameA.slice(1), nameA.toUpperCase() === nameA ? `${nameA} 1` : nameA.toUpperCase()];
    for (const name of wrongForA) {
      expectRejected(await wipeReagents(admin.client, name), `학교 A admin wipe_reagents(${JSON.stringify(name)})`, E.invalid, MSG.mismatch);
      expectRejected(await wipeRecords(admin.client, null, name), `학교 A admin wipe_records(null, ${JSON.stringify(name)})`, E.invalid, MSG.mismatch);
    }
    expectRejected(await countRecords(admin.client, daysAgo(-1)), "학교 A admin count_wipe_records(내일)", E.invalid, MSG.future);
    // 학교 B 계정(교사) 이 학교 A 이름으로 — 역할 또는 학교명에서 거부 (어느 쪽이든 학교 A 는 안 바뀐다)
    expect(b.profileRole, "학교 B 공용 계정 역할").not.toBe("admin");
    expectRejected(await wipeReagents(b.client, nameA), "학교 B → 학교 A 이름 wipe_reagents", E.denied);
    expectRejected(await wipeRecords(b.client, null, nameA), "학교 B → 학교 A 이름 wipe_records", E.denied);
    await expectSharedIntact(snap, "학교명 틀림 · 다른 학교 거부 뒤");
  });
});
