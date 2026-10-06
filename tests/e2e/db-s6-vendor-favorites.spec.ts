// [R-db][S6] · [N1-db][S6] · [GM-db][S*]
// 판매처 즐겨찾기 vendor_favorites (d7 §12-1, 2026-10-07 사용자 결정) — 실제 RLS (publishable 키 + 각 계정 로그인 세션).
//   - 학교 단위 공유. (school_id, vendor_id) 하나만. 대상 = 자기 학교 판매처 + 공통 목록. 판매처가 지워지면 즐겨찾기도 사라진다.
//   - 교사·admin 이 추가·해제(자기 학교 행만, 데모 학교 쓰기 금지). 읽기는 교사·admin. 학생·anon 0행.
//   - created_by = 본인 (d7 §12-1 테이블 열; 위조 거부는 builder 마이그레이션 정책), 수정(update) 경로 없음.
// 기준: harness/d7-data.md §12-1·§12·§5, harness/d5-gates.md R-db·N1-db·GM-db.
//
// 절대 규칙 (운영 DB):
// - 판정 대상 호출은 로그인 세션(publishable 키)·anon. service role 은 준비·정리·대조 조회와 데모 학교 check 제약 확인에만 쓴다
//   (데모 학교 프로필이 없어 로그인 세션으로는 "데모 학교 사용자의 쓰기" 를 만들 수 없다 — 제약을 직접 확인한다).
// - 성공하는 쓰기는 일회용 학교(S8UI-s6fav-…)에만 한다. 공용 계정(학교 A 학생·교사·admin, 학교 B 교사)·anon 은 읽기와 거부 호출만.
// - 앞뒤로 공통 목록 · 학교 A·B·데모의 판매처·시약 기준 열·즐겨찾기가 같아야 하고(sharedSnapshot), 일회용 학교·계정·즐겨찾기 잔여 0.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type TestInfo } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ROLE_LABEL, anonClient, signIn, type Role } from "./db-helpers";
import { HAS_SERVICE, addMember, clientFor, service, tempSchool, type TempSchool, type TempUser } from "./screen-8-helpers";
import { COMMON_SEED, NO_RESIDUE_69, cleanup, hex, makeSchool, purge, sharedSnapshot, type Fx } from "./screen-6-9-helpers";

test.describe.configure({ mode: "default" });

const GROUP = "s6fav";
const TIMEOUT = 300_000;
const NO_SERVICE_REASON = "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)";

const RLS_DENIED = "42501";
const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const FAV = "vendor_favorites";

/** 데모 학교 고정 id — lib/supabase/demo-data.ts (server-only 모듈이라 소스 텍스트에서 읽는다) */
const DEMO_SCHOOL_ID = (() => {
  const src = readFileSync(join(process.cwd(), "lib", "supabase", "demo-data.ts"), "utf8");
  const m = src.match(/export const DEMO_SCHOOL_ID\s*=\s*"([0-9a-f-]{36})"/);
  if (!m) throw new Error("lib/supabase/demo-data.ts 에서 DEMO_SCHOOL_ID 를 찾지 못했습니다");
  return m[1];
})();

type Row = Record<string, unknown>;
type DbError = { code?: string; message: string; details?: string | null };
type Res = { data: unknown; error: DbError | null };

const rowsOf = (data: unknown): Row[] => (Array.isArray(data) ? (data as Row[]) : data ? [data as Row] : []);
const changed = (res: Res) => (res.error ? 0 : rowsOf(res.data).length);
const visible = (res: Res) => (res.error ? [] : rowsOf(res.data));

function expectError(res: Res, what: string, code: string): void {
  expect(res.error, `${what} 는 오류여야 함`).not.toBeNull();
  expect(rowsOf(res.data), `${what} 반환 행`).toHaveLength(0);
  expect(res.error?.code, `${what} errcode (${res.error?.message})`).toBe(code);
}

function expectOne(res: Res, what: string): Row {
  expect(res.error, `${what}: ${res.error?.code} ${res.error?.message} ${res.error?.details ?? ""}`).toBeNull();
  const rows = rowsOf(res.data);
  expect(rows, `${what} 반환 행`).toHaveLength(1);
  return rows[0];
}

const favInsert = async (c: SupabaseClient, row: Row): Promise<Res> => c.from(FAV).insert(row).select("*");
const favDelete = async (c: SupabaseClient, schoolId: string, vendorId: string): Promise<Res> =>
  c.from(FAV).delete().eq("school_id", schoolId).eq("vendor_id", vendorId).select("*");
const favSelect = async (c: SupabaseClient, filter: Row = {}): Promise<Res> => {
  let q = c.from(FAV).select("*");
  for (const [k, v] of Object.entries(filter)) q = q.eq(k, v as string);
  return q;
};

/** 대조 조회 (service role) */
async function favsOf(schoolIds: string[]): Promise<Row[]> {
  const r = await service().from(FAV).select("*").in("school_id", schoolIds).order("school_id").order("vendor_id");
  expect(r.error, `vendor_favorites 대조 조회: ${r.error?.message}`).toBeNull();
  return (r.data ?? []) as Row[];
}
const pairs = (rows: Row[]) => rows.map((r) => `${String(r.school_id)}|${String(r.vendor_id)}|${String(r.created_by)}`).sort();

/** 공통 목록 (로그인 세션 — 읽기만) */
async function commonIds(c: SupabaseClient): Promise<{ id: string; name: string }[]> {
  const r = await c.from("vendors").select("id, name").is("school_id", null).order("name");
  expect(r.error, `공통 목록 조회: ${r.error?.message}`).toBeNull();
  return (r.data ?? []) as { id: string; name: string }[];
}

// ---------- 앞뒤 불변 · 정리 ----------

let sharedBefore: string[] | null = null;

test.beforeAll(async ({}, info) => {
  info.setTimeout(120_000);
  if (HAS_SERVICE) sharedBefore = await sharedSnapshot();
});

test.afterAll(async ({}, info) => {
  info.setTimeout(300_000);
  if (!HAS_SERVICE) return;
  fixtureCache = null;
  const left = await cleanup(GROUP, info.project.name);
  expect(left, "일회용 계정·학교·판매처·즐겨찾기·시약 잔여물").toEqual(NO_RESIDUE_69);
  if (sharedBefore) expect(await sharedSnapshot(), "공통 판매처 목록 · 학교 A·B·데모의 판매처·즐겨찾기·시약 기준 열이 그대로").toEqual(sharedBefore);
});

// ======================================================================
// 공용 계정 — 읽기와 거부 호출만 (공용 학교에는 즐겨찾기를 만들지 않는다)
// ======================================================================

test(`[R-db][S6] 공용 학생(학교 A): vendor_favorites select 0행 · 자기 학교 + 공통 판매처 insert 거부 ${RLS_DENIED}`, async () => {
  const st = await signIn("student");
  expect(st.profileRole, "전제: 학생").toBe("student");
  const admin = await signIn("admin");
  const common = await commonIds(admin.client);
  expect(common.length, "전제(양성 대조군): admin 에게 공통 목록이 보임").toBe(COMMON_SEED.length);
  expect(visible(await favSelect(st.client)), "학생에게 보이는 vendor_favorites").toHaveLength(0);
  const res = await favInsert(st.client, { school_id: st.schoolId, vendor_id: common[0].id, created_by: st.userId });
  if (!res.error && HAS_SERVICE) await service().from(FAV).delete().eq("school_id", st.schoolId).eq("vendor_id", common[0].id);
  expectError(res, "학교 A 학생 vendor_favorites insert", RLS_DENIED);
});

test(`[GM-db][S*] anon: vendor_favorites select 0행(또는 권한 없음) · insert·delete 불가`, async () => {
  const anon = anonClient();
  const admin = await signIn("admin");
  const common = await commonIds(admin.client);
  expect(common.length, "전제: 공통 목록").toBe(COMMON_SEED.length);
  expect(visible(await favSelect(anon)), "anon 에게 보이는 vendor_favorites").toHaveLength(0);
  for (const schoolId of [admin.schoolId, DEMO_SCHOOL_ID]) {
    const res = await favInsert(anon, { school_id: schoolId, vendor_id: common[0].id });
    if (!res.error && HAS_SERVICE) await service().from(FAV).delete().eq("school_id", schoolId).eq("vendor_id", common[0].id);
    expect(res.error, `anon insert(school_id = ${schoolId === DEMO_SCHOOL_ID ? "데모" : "학교 A"}) 는 오류`).not.toBeNull();
    expect(rowsOf(res.data)).toHaveLength(0);
    expect(changed(await favDelete(anon, schoolId, common[0].id)), "anon delete").toBe(0);
  }
});

for (const role of ["teacher", "admin", "schoolB"] as Role[]) {
  test(`[N1-db][S6] 공용 ${ROLE_LABEL[role]}: 다른 학교(학교 B·A·데모) school_id 로 insert 거부 ${RLS_DENIED} · 자기 학교 즐겨찾기 행은 자기 학교 것만`, async () => {
    const s = await signIn(role);
    const other = await signIn(role === "schoolB" ? "admin" : "schoolB");
    expect(other.schoolId, "전제: 다른 학교").not.toBe(s.schoolId);
    const common = await commonIds(s.client);
    expect(common.length, `전제: ${ROLE_LABEL[role]} 에게 공통 목록`).toBe(COMMON_SEED.length);
    for (const [label, schoolId] of [["다른 공용 학교", other.schoolId], ["데모 학교", DEMO_SCHOOL_ID]] as [string, string][]) {
      const res = await favInsert(s.client, { school_id: schoolId, vendor_id: common[0].id, created_by: s.userId });
      if (!res.error && HAS_SERVICE) await service().from(FAV).delete().eq("school_id", schoolId).eq("vendor_id", common[0].id);
      expectError(res, `${ROLE_LABEL[role]} insert(${label})`, RLS_DENIED);
    }
    const seen = visible(await favSelect(s.client));
    expect(seen.filter((r) => r.school_id !== s.schoolId), `${ROLE_LABEL[role]} 에게 보이는 다른 학교 즐겨찾기`).toHaveLength(0);
  });
}

// ======================================================================
// 일회용 학교 (service role 로 준비·정리) — 판정 대상은 로그인 세션
// ======================================================================

type Fixture = Fx & {
  other: TempSchool;
  otherTeacher: TempUser;
  teacherC: SupabaseClient;
  studentC: SupabaseClient;
  otherAdminC: SupabaseClient;
  otherTeacherC: SupabaseClient;
};
let fixtureCache: Promise<Fixture> | null = null;

function fixture(info: TestInfo): Promise<Fixture> {
  fixtureCache ??= (async () => {
    const f = await makeSchool(info, GROUP);
    const other = await tempSchool(info, GROUP);
    const otherTeacher = await addMember(other, info, GROUP, "교사");
    const otherAdminC = await clientFor(other.admin);
    const up = await otherAdminC.rpc("change_member_role", { p_user_id: otherTeacher.id, p_role: "teacher" });
    expect(up.error, `준비: 다른 일회용 학교 교사 역할 (${up.error?.message})`).toBeNull();
    return {
      ...f,
      other,
      otherTeacher,
      teacherC: await clientFor(f.teacher),
      studentC: await clientFor(f.student),
      otherAdminC,
      otherTeacherC: await clientFor(otherTeacher),
    };
  })();
  fixtureCache.catch(() => {
    fixtureCache = null;
  });
  return fixtureCache;
}

async function fresh(info: TestInfo): Promise<Fixture> {
  test.setTimeout(TIMEOUT);
  const f = await fixture(info);
  await purge([f.school.id, f.other.id]);
  expect(await favsOf([f.school.id, f.other.id]), "준비: 일회용 학교 즐겨찾기 0").toEqual([]);
  return f;
}

/** 준비: 학교 판매처 (그 학교 admin 세션의 insert — d7 §12) */
async function newVendor(c: SupabaseClient, schoolId: string, tag: string): Promise<Row> {
  return expectOne(await c.from("vendors").insert({ school_id: schoolId, name: `S6FAV-${tag}-${hex()}`, website: `https://fav-${hex()}.example.test/` }).select("*"), `준비: ${tag} 판매처`);
}

test.describe("일회용 학교", () => {
  test.describe.configure({ mode: "default" });
  test.skip(!HAS_SERVICE, NO_SERVICE_REASON);

  test(`[R-db][S6] 일회용 교사·admin: 공통 판매처·자기 학교 판매처 즐겨찾기 추가 → 1행(created_by = 본인) · 같은 학교 교사·admin 이 함께 봄 · 해제 → 0행`, async ({}, info) => {
    const f = await fresh(info);
    const own = await newVendor(f.prep, f.school.id, "우리");
    const common = await commonIds(f.teacherC);
    expect(common.length, "교사에게 공통 목록").toBe(COMMON_SEED.length);
    const targets: [string, string][] = [
      ["공통 첫째", common[0].id],
      ["공통 마지막", common[common.length - 1].id],
      ["자기 학교 판매처", own.id as string],
    ];
    for (const [who, c, user] of [["교사", f.teacherC, f.teacher], ["admin", f.prep, f.admin]] as [string, SupabaseClient, TempUser][]) {
      for (const [what, vendorId] of targets) {
        const made = expectOne(await favInsert(c, { school_id: f.school.id, vendor_id: vendorId, created_by: user.id }), `${who} 추가(${what})`);
        expect(made, `${who} 추가(${what}) 행`).toMatchObject({ school_id: f.school.id, vendor_id: vendorId, created_by: user.id });
        expect(typeof made.created_at, "created_at").toBe("string");
      }
      const db = await favsOf([f.school.id]);
      expect(pairs(db), `${who}: DB = 추가한 ${targets.length}행`).toEqual(targets.map(([, v]) => `${f.school.id}|${v}|${user.id}`).sort());
      // 학교 단위 공유: 같은 학교 교사·admin 둘 다 같은 행을 본다
      for (const [reader, rc] of [["교사", f.teacherC], ["admin", f.prep]] as [string, SupabaseClient][]) {
        expect(pairs(visible(await favSelect(rc))), `${who} 가 추가한 즐겨찾기를 ${reader} 가 봄`).toEqual(pairs(db));
      }
      for (const [what, vendorId] of targets) {
        const del = expectOne(await favDelete(c, f.school.id, vendorId), `${who} 해제(${what})`);
        expect(del.vendor_id).toBe(vendorId);
      }
      expect(await favsOf([f.school.id]), `${who}: 해제 뒤 0행`).toEqual([]);
    }
  });

  test(`[R-db][S6] 학교 단위 공유: admin 이 추가한 즐겨찾기를 같은 학교 교사가 해제할 수 있다 (반대도)`, async ({}, info) => {
    const f = await fresh(info);
    const common = await commonIds(f.prep);
    expectOne(await favInsert(f.prep, { school_id: f.school.id, vendor_id: common[1].id, created_by: f.admin.id }), "admin 추가");
    expectOne(await favDelete(f.teacherC, f.school.id, common[1].id), "교사가 admin 의 즐겨찾기 해제");
    expect(await favsOf([f.school.id])).toEqual([]);
    expectOne(await favInsert(f.teacherC, { school_id: f.school.id, vendor_id: common[2].id, created_by: f.teacher.id }), "교사 추가");
    expectOne(await favDelete(f.prep, f.school.id, common[2].id), "admin 이 교사의 즐겨찾기 해제");
    expect(await favsOf([f.school.id])).toEqual([]);
  });

  test(`[R-db][S6] 중복 추가: 같은 (학교, 판매처) 두 번째 insert → ${UNIQUE_VIOLATION} · DB 1행 (다른 사람이 눌러도) · 없는 행 해제 → 0행 오류 없음`, async ({}, info) => {
    const f = await fresh(info);
    const common = await commonIds(f.prep);
    const first = expectOne(await favInsert(f.prep, { school_id: f.school.id, vendor_id: common[0].id, created_by: f.admin.id }), "admin 첫 추가");
    for (const [who, c, user] of [["admin", f.prep, f.admin], ["교사", f.teacherC, f.teacher]] as [string, SupabaseClient, TempUser][]) {
      expectError(await favInsert(c, { school_id: f.school.id, vendor_id: common[0].id, created_by: user.id }), `${who} 중복 추가`, UNIQUE_VIOLATION);
    }
    const db = await favsOf([f.school.id]);
    expect(db, "DB 1행 (처음 행 그대로)").toEqual([first]);
    const none = await favDelete(f.teacherC, f.school.id, common[1].id);
    expect(none.error, `없는 행 해제: ${none.error?.message}`).toBeNull();
    expect(rowsOf(none.data), "없는 행 해제 → 0행").toHaveLength(0);
    expect(await favsOf([f.school.id]), "그대로").toEqual([first]);
  });

  test(`[R-db][S6] 일회용 학생: 같은 학교 즐겨찾기가 있어도 select 0행 · insert(공통·자기 학교 판매처) 거부 ${RLS_DENIED} · delete 0행 · 행 그대로`, async ({}, info) => {
    const f = await fresh(info);
    const own = await newVendor(f.prep, f.school.id, "우리");
    const common = await commonIds(f.prep);
    const made = expectOne(await favInsert(f.prep, { school_id: f.school.id, vendor_id: common[0].id, created_by: f.admin.id }), "준비: admin 추가");
    expect(visible(await favSelect(f.teacherC)), "전제(양성 대조군): 같은 학교 교사에게는 보임").toHaveLength(1);
    expect(visible(await favSelect(f.studentC)), "학생에게 보이는 vendor_favorites").toHaveLength(0);
    expect(visible(await favSelect(f.studentC, { school_id: f.school.id })), "학생 school_id 조회").toHaveLength(0);
    for (const vendorId of [common[1].id, own.id as string]) {
      expectError(await favInsert(f.studentC, { school_id: f.school.id, vendor_id: vendorId, created_by: f.student.id }), "학생 insert", RLS_DENIED);
    }
    expect(changed(await favDelete(f.studentC, f.school.id, common[0].id)), "학생 delete").toBe(0);
    expect(await favsOf([f.school.id]), "학생 시도 뒤").toEqual([made]);
  });

  test(`[N1-db][S6] 다른 학교 판매처는 즐겨찾기 불가 · 다른 학교 school_id 로 insert 거부 · 다른 학교 즐겨찾기 select 0 · delete 0 (일회용 A'↔B', 공용 학교 A·B 계정)`, async ({}, info) => {
    const f = await fresh(info);
    const theirs = await newVendor(f.otherAdminC, f.other.id, "B");
    const own = await newVendor(f.prep, f.school.id, "A");
    const common = await commonIds(f.prep);

    // A' 교사·admin: B' 판매처를 자기 학교 즐겨찾기로 → 거부 / B' school_id 로 → 거부
    for (const [who, c, user] of [["A' admin", f.prep, f.admin], ["A' 교사", f.teacherC, f.teacher]] as [string, SupabaseClient, TempUser][]) {
      expectError(await favInsert(c, { school_id: f.school.id, vendor_id: theirs.id, created_by: user.id }), `${who}: 다른 학교 판매처 즐겨찾기`, RLS_DENIED);
      expectError(await favInsert(c, { school_id: f.other.id, vendor_id: common[0].id, created_by: user.id }), `${who}: 다른 학교 school_id (공통 판매처)`, RLS_DENIED);
      expectError(await favInsert(c, { school_id: f.other.id, vendor_id: theirs.id, created_by: user.id }), `${who}: 다른 학교 school_id (그 학교 판매처)`, RLS_DENIED);
    }
    expect(await favsOf([f.school.id, f.other.id]), "거부 뒤 두 학교 즐겨찾기 0").toEqual([]);

    // A' 즐겨찾기를 만들어 두고, B'·공용 계정이 읽기·해제 시도
    const mine = [
      expectOne(await favInsert(f.prep, { school_id: f.school.id, vendor_id: common[0].id, created_by: f.admin.id }), "A' admin 공통 추가"),
      expectOne(await favInsert(f.teacherC, { school_id: f.school.id, vendor_id: own.id, created_by: f.teacher.id }), "A' 교사 자기 학교 판매처 추가"),
    ];
    const theirsFav = expectOne(await favInsert(f.otherTeacherC, { school_id: f.other.id, vendor_id: common[0].id, created_by: f.otherTeacher.id }), "B' 교사 공통 추가");
    expect(pairs(visible(await favSelect(f.otherAdminC))), "B' admin 에게는 B' 즐겨찾기만").toEqual(pairs([theirsFav]));

    const others: [string, SupabaseClient][] = [
      ["B' admin", f.otherAdminC],
      ["B' 교사", f.otherTeacherC],
      ["학교 A 교사", (await signIn("teacher")).client],
      ["학교 A admin", (await signIn("admin")).client],
      ["학교 A 학생", (await signIn("student")).client],
      ["학교 B 교사", (await signIn("schoolB")).client],
      ["anon", anonClient()],
    ];
    for (const [who, c] of others) {
      expect(visible(await favSelect(c, { school_id: f.school.id })), `${who} → A' school_id 조회`).toHaveLength(0);
      expect(visible(await favSelect(c, { vendor_id: own.id as string })), `${who} → A' 판매처 즐겨찾기 조회`).toHaveLength(0);
      expect(visible(await favSelect(c)).filter((r) => r.school_id === f.school.id), `${who} 에게 보이는 A' 즐겨찾기`).toHaveLength(0);
      for (const m of mine) expect(changed(await favDelete(c, f.school.id, m.vendor_id as string)), `${who} → A' 즐겨찾기 delete`).toBe(0);
      expect(pairs(await favsOf([f.school.id])), `${who} 시도 뒤 A' 즐겨찾기 그대로`).toEqual(pairs(mine));
    }
    // 반대 방향
    expect(visible(await favSelect(f.prep)).filter((r) => r.school_id === f.other.id), "A' admin 에게 보이는 B' 즐겨찾기").toHaveLength(0);
    expect(changed(await favDelete(f.prep, f.other.id, common[0].id)), "A' admin → B' 즐겨찾기 delete").toBe(0);
    expect(await favsOf([f.other.id]), "B' 즐겨찾기 그대로").toEqual([theirsFav]);
  });

  test(`[R-db][S6] created_by 위조(같은 학교 다른 사람 · 다른 학교 사람 · null) → 거부 ${RLS_DENIED} · 행 0`, async ({}, info) => {
    const f = await fresh(info);
    const common = await commonIds(f.prep);
    const cases: [string, SupabaseClient, string | null][] = [
      ["교사가 admin 이름으로", f.teacherC, f.admin.id],
      ["admin 이 교사 이름으로", f.prep, f.teacher.id],
      ["교사가 학생 이름으로", f.teacherC, f.student.id],
      ["교사가 다른 학교 admin 이름으로", f.teacherC, f.other.admin.id],
      ["교사가 null 로", f.teacherC, null],
      ["admin 이 null 로", f.prep, null],
    ];
    for (const [what, c, by] of cases) {
      expectError(await favInsert(c, { school_id: f.school.id, vendor_id: common[0].id, created_by: by }), what, RLS_DENIED);
    }
    expect(await favsOf([f.school.id]), "위조 시도 뒤 0행").toEqual([]);
  });

  test(`[R-db][S6] update 불가: 교사·admin 이 자기 학교 즐겨찾기의 vendor_id·created_by·school_id·created_at 를 바꾸면 ${RLS_DENIED} · 행 그대로`, async ({}, info) => {
    const f = await fresh(info);
    const common = await commonIds(f.prep);
    const made = expectOne(await favInsert(f.teacherC, { school_id: f.school.id, vendor_id: common[0].id, created_by: f.teacher.id }), "교사 추가");
    const patches: Row[] = [
      { vendor_id: common[1].id },
      { created_by: f.admin.id },
      { school_id: f.other.id },
      { created_at: "2020-01-01T00:00:00Z" },
    ];
    for (const [who, c] of [["교사", f.teacherC], ["admin", f.prep], ["학생", f.studentC]] as [string, SupabaseClient][]) {
      for (const patch of patches) {
        const res = (await c.from(FAV).update(patch).eq("school_id", f.school.id).eq("vendor_id", common[0].id).select("*")) as Res;
        expect(changed(res), `${who} update(${JSON.stringify(patch)}) 바뀐 행`).toBe(0);
        expect(res.error?.code, `${who} update(${JSON.stringify(patch)}) → 권한 없음 (${res.error?.message})`).toBe(RLS_DENIED);
      }
    }
    expect(await favsOf([f.school.id, f.other.id]), "update 시도 뒤 행 그대로").toEqual([made]);
  });

  test(`[R-db][S6] 자기 학교 판매처를 admin 이 삭제하면 그 즐겨찾기도 사라진다 (cascade) · 공통 판매처 즐겨찾기는 남음`, async ({}, info) => {
    const f = await fresh(info);
    const own = await newVendor(f.prep, f.school.id, "삭제");
    const common = await commonIds(f.prep);
    expectOne(await favInsert(f.teacherC, { school_id: f.school.id, vendor_id: own.id, created_by: f.teacher.id }), "교사: 학교 판매처 즐겨찾기");
    const keep = expectOne(await favInsert(f.teacherC, { school_id: f.school.id, vendor_id: common[0].id, created_by: f.teacher.id }), "교사: 공통 즐겨찾기");
    expect(await favsOf([f.school.id]), "전제: 2행").toHaveLength(2);
    expectOne((await f.prep.from("vendors").delete().eq("id", own.id as string).select("*")) as Res, "admin 판매처 삭제");
    expect(await favsOf([f.school.id]), "삭제한 판매처의 즐겨찾기만 사라짐").toEqual([keep]);
    expect(visible(await favSelect(f.teacherC, { vendor_id: own.id as string })), "교사에게도 0행").toHaveLength(0);
  });

  test(`[GM-db][S*] 데모 학교 즐겨찾기 금지 (d7 §12-1·§5): 로그인 세션의 데모 school_id insert → ${RLS_DENIED} · 테이블 check 제약(service role 확인) → ${CHECK_VIOLATION} · 데모 학교 즐겨찾기 0`, async ({}, info) => {
    const f = await fresh(info);
    const common = await commonIds(f.prep);
    for (const [who, c, user] of [["admin", f.prep, f.admin], ["교사", f.teacherC, f.teacher]] as [string, SupabaseClient, TempUser][]) {
      const res = await favInsert(c, { school_id: DEMO_SCHOOL_ID, vendor_id: common[0].id, created_by: user.id });
      if (!res.error) await service().from(FAV).delete().eq("school_id", DEMO_SCHOOL_ID).eq("vendor_id", common[0].id);
      expectError(res, `일회용 ${who} insert(데모 school_id)`, RLS_DENIED);
    }
    // 데모 학교 프로필이 없어(둘러보기는 비회원) "데모 학교 사용자" 세션을 만들 수 없다 → 테이블 제약을 직접 확인한다
    const sb = service();
    const res = (await sb.from(FAV).insert({ school_id: DEMO_SCHOOL_ID, vendor_id: common[0].id, created_by: null }).select("*")) as Res;
    if (!res.error) await sb.from(FAV).delete().eq("school_id", DEMO_SCHOOL_ID).eq("vendor_id", common[0].id);
    expectError(res, "service role insert(데모 school_id)", CHECK_VIOLATION);
    expect(await favsOf([DEMO_SCHOOL_ID]), "데모 학교 즐겨찾기 0").toEqual([]);
    // anon(둘러보기)도 데모 학교 즐겨찾기를 볼 수 없다
    expect(visible(await favSelect(anonClient(), { school_id: DEMO_SCHOOL_ID })), "anon → 데모 학교 즐겨찾기").toHaveLength(0);
  });
});
