// [R-db][S6] · [R-db][S9] · [N1-db][S6]
// 판매처 검색어 자동 입력 (d7 §11 "검색어 자동 입력", 2026-10-07 사용자 결정) — vendors.search_url
//   - 공통 seed 4곳만 검색 주소를 가진다 (주소는 d7 §11 문장에서 읽는다). 우리 학교 판매처는 null (웹사이트를 연다).
//   - 화면·API 로는 search_url 을 쓸 수 없다 (마이그레이션으로만): 로그인 세션의 insert(값 있음)·update(값 바꿈) → 거부(42501).
//     같은 판매처의 다른 열(이름·연락처·웹사이트·note) 수정은 그대로 된다 (d7 §12 admin 쓰기).
//   - 열 형식: null 또는 https:// + {q} 정확히 1번 + 300자 이하 → 위반 23514 (builder 마이그레이션 제약. service role 로만 확인 —
//     로그인 세션은 트리거에서 먼저 거부되므로 제약까지 가지 않는다).
// 기준: harness/d7-data.md §11·§12, harness/d5-gates.md R-db·N1-db.
//
// 절대 규칙 (운영 DB):
// - 공용 계정(학교 A 학생·교사·admin, 학교 B 교사)·anon 은 읽기와 "거부되어야 하는 호출"만 한다.
//   공통 행(school_id null)은 service role 로도 쓰지 않는다 — 거부 호출이 구현 결함으로 통과했을 때만 스냅숏 그대로 되돌린다.
// - 성공하는 쓰기와 service role 제약 확인은 일회용 학교의 판매처에만 한다. 판정 대상 호출(제약 제외)은 로그인 세션(publishable 키).
// - 앞뒤로 공통 목록 · 학교 A·B·데모의 판매처·시약 기준 열이 같아야 하고(sharedSnapshot), 일회용 학교·계정 잔여 0.
import { randomBytes } from "node:crypto";
import { test, expect, type TestInfo } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ROLE_LABEL, anonClient, signIn, type Role } from "./db-helpers";
import { HAS_SERVICE, clientFor, service, tempSchool, type TempSchool } from "./screen-8-helpers";
import {
  COMMON_SEARCH,
  COMMON_SEED,
  NO_RESIDUE_69,
  SEARCH_Q,
  cleanup,
  makeSchool,
  purge,
  sharedSnapshot,
  type Fx,
} from "./screen-6-9-helpers";

test.describe.configure({ mode: "default" });

const GROUP = "s6surl";
const TIMEOUT = 300_000;
const NO_SERVICE_REASON = "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)";

const RLS_DENIED = "42501";
const CHECK_VIOLATION = "23514";
/** builder 마이그레이션 제약 vendors_search_url_format 의 길이 상한 (d7 §12 website 와 같은 300) */
const SEARCH_URL_MAX = 300;

type Row = Record<string, unknown>;
type DbError = { code?: string; message: string; details?: string | null };
type Res = { data: unknown; error: DbError | null };

const hex = (n = 3) => randomBytes(n).toString("hex");
const rowsOf = (data: unknown): Row[] => (Array.isArray(data) ? (data as Row[]) : data ? [data as Row] : []);
const changed = (res: Res) => (res.error ? 0 : rowsOf(res.data).length);
/** 일회용 학교 판매처에 써 보는 검색 주소 (.test = 풀리지 않는 도메인) */
const fakeSearch = () => `https://s6surl-${hex()}.example.test/search?kw=${SEARCH_Q}`;

function expectError(res: Res, what: string, code: string): void {
  expect(res.error, `${what} 는 오류여야 함`).not.toBeNull();
  expect(String(res.error?.code ?? ""), `${what}: ${res.error?.message}`).not.toMatch(/^PGRST/);
  expect(rowsOf(res.data), `${what} 반환 행`).toHaveLength(0);
  expect(res.error?.code, `${what} errcode (${res.error?.message})`).toBe(code);
}

function expectOne(res: Res, what: string): Row {
  expect(res.error, `${what}: ${res.error?.code} ${res.error?.message} ${res.error?.details ?? ""}`).toBeNull();
  const rows = rowsOf(res.data);
  expect(rows, `${what} 반환 행`).toHaveLength(1);
  return rows[0];
}

const vInsert = async (c: SupabaseClient, row: Row): Promise<Res> => c.from("vendors").insert(row).select("*");
const vUpdate = async (c: SupabaseClient, id: string, patch: Row): Promise<Res> => c.from("vendors").update(patch).eq("id", id).select("*");

/** 대조 조회 (service role) */
async function vendorById(id: string): Promise<Row | null> {
  const r = await service().from("vendors").select("*").eq("id", id).maybeSingle();
  expect(r.error, `vendors 대조 조회: ${r.error?.message}`).toBeNull();
  return (r.data as Row | null) ?? null;
}
async function vendorsOf(schoolId: string): Promise<Row[]> {
  const r = await service().from("vendors").select("*").eq("school_id", schoolId).order("id");
  expect(r.error, `vendors 대조 조회: ${r.error?.message}`).toBeNull();
  return (r.data ?? []) as Row[];
}

/** 공통 목록 (학교 A admin 세션 — 읽기만) */
async function commonRows(): Promise<Row[]> {
  const admin = await signIn("admin");
  const r = await admin.client.from("vendors").select("*").is("school_id", null).order("id");
  expect(r.error, `공통 목록 조회: ${r.error?.message}`).toBeNull();
  return (r.data ?? []) as Row[];
}

/** 비상 복원: 공통 행이 구현 결함으로 바뀌었을 때만 스냅숏 그대로 (정상이라면 호출 없음) */
async function restoreCommon(before: Row[]): Promise<void> {
  if (!HAS_SERVICE) return;
  const now = await service().from("vendors").select("*").is("school_id", null).order("id");
  if (JSON.stringify(now.data ?? []) === JSON.stringify(before)) return;
  await service().from("vendors").upsert(before, { onConflict: "id" });
}

const byName = <T extends { name: string }>(xs: T[]) => [...xs].sort((a, b) => a.name.localeCompare(b.name));

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
  expect(left, "일회용 계정·학교·판매처·시약 잔여물").toEqual(NO_RESIDUE_69);
  if (sharedBefore) expect(await sharedSnapshot(), "공통 판매처 목록(search_url 포함 전체 열) · 학교 A·B·데모의 판매처·시약 기준 열이 그대로").toEqual(sharedBefore);
});

// ======================================================================
// 공용 계정 — 읽기와 거부 호출만
// ======================================================================

test(`[R-db][S6] 공통 목록 ${COMMON_SEARCH.length}곳 search_url = d7 §11 검색 주소 (학교 A 교사·admin · 학교 B 교사 세션) · 공통 행 수 = d7 §12 seed 수`, async () => {
  expect(byName(COMMON_SEARCH).map((s) => s.name), "d7 §11 검색 주소 판매처 = d7 §12 공통 seed").toEqual(byName(COMMON_SEED).map((s) => s.name));
  for (const role of ["teacher", "admin", "schoolB"] as Role[]) {
    const s = await signIn(role);
    const r = await s.client.from("vendors").select("name, website, search_url").is("school_id", null);
    expect(r.error, `${ROLE_LABEL[role]} 공통 목록 조회: ${r.error?.message}`).toBeNull();
    const got = byName(((r.data ?? []) as Row[]).map((v) => ({ name: v.name as string, searchUrl: v.search_url as string | null })));
    expect(got, `${ROLE_LABEL[role]} 에게 보이는 공통 목록 search_url`).toEqual(byName(COMMON_SEARCH));
    // 웹사이트는 그대로 (search_url 은 웹사이트를 바꾸지 않는다)
    const sites = byName(((r.data ?? []) as Row[]).map((v) => ({ name: v.name as string, website: v.website as string })));
    expect(sites, `${ROLE_LABEL[role]} 공통 목록 website = d7 §12`).toEqual(byName(COMMON_SEED));
  }
});

test(`[N1-db][S6] 학생(학교 A)·anon: search_url 열 포함 vendors 0행 (공통 검색 주소도 못 읽음)`, async () => {
  const st = await signIn("student");
  expect(st.profileRole, "전제: 학생").toBe("student");
  expect(await commonRows(), "전제(양성 대조군): admin 에게 공통 목록이 보임").toHaveLength(COMMON_SEARCH.length);
  for (const [who, c] of [["학생", st.client], ["anon", anonClient()]] as [string, SupabaseClient][]) {
    const r = await c.from("vendors").select("id, search_url");
    expect(r.error ? [] : r.data ?? [], `${who} 에게 보이는 vendors(search_url)`).toHaveLength(0);
    const nn = await c.from("vendors").select("id").not("search_url", "is", null);
    expect(nn.error ? [] : nn.data ?? [], `${who} search_url not null 조회`).toHaveLength(0);
  }
});

test(`[R-db][S6] 학교 판매처(school_id 있음)는 모두 search_url null — 우리 학교 판매처는 웹사이트를 연다 (service role 대조 조회)`, async () => {
  test.skip(!HAS_SERVICE, NO_SERVICE_REASON);
  const r = await service().from("vendors").select("id, school_id, name, search_url").not("school_id", "is", null).not("search_url", "is", null);
  expect(r.error, `vendors 대조 조회: ${r.error?.message}`).toBeNull();
  // 이 스펙이 일회용 학교에 잠깐 service role 로 넣는 값(제약 확인용)은 S8UI- 학교에만 있다 — 그것을 빼고 센다
  const schools = await service().from("schools").select("id").like("neis_code", "S8UI-%");
  const temp = new Set((schools.data ?? []).map((s) => s.id as string));
  expect(((r.data ?? []) as Row[]).filter((v) => !temp.has(v.school_id as string)), "학교 판매처 중 search_url 값 있음").toEqual([]);
});

for (const role of ["student", "teacher", "admin", "schoolB"] as Role[]) {
  test(`[R-db][S6] ${ROLE_LABEL[role]}: 공통 행 search_url update(다른 주소·null) 0행 · 공통 목록 전체 열 그대로`, async () => {
    const s = await signIn(role);
    const before = await commonRows();
    expect(before.length, "전제: 공통 행").toBe(COMMON_SEARCH.length);
    try {
      for (const v of before) {
        for (const patch of [{ search_url: `https://evil.example.test/?q=${SEARCH_Q}` }, { search_url: null }, { search_url: v.search_url }] as Row[]) {
          expect(changed(await vUpdate(s.client, v.id as string, patch)), `${ROLE_LABEL[role]} 공통 "${String(v.name)}" update(${JSON.stringify(patch)})`).toBe(0);
        }
      }
      expect(await commonRows(), `${ROLE_LABEL[role]} 시도 뒤 공통 목록`).toEqual(before);
    } finally {
      await restoreCommon(before);
    }
  });
}

test(`[R-db][S6] anon: 공통 행 search_url update 0행 · 공통 목록 그대로`, async () => {
  const before = await commonRows();
  try {
    for (const v of before) {
      expect(changed(await vUpdate(anonClient(), v.id as string, { search_url: null })), `anon 공통 "${String(v.name)}" update`).toBe(0);
    }
    expect(await commonRows()).toEqual(before);
  } finally {
    await restoreCommon(before);
  }
});

test(`[R-db][S9] 공용 admin(학교 A): search_url 을 넣은 insert(자기 학교) 거부 42501 · 그 이름의 행 0`, async () => {
  const admin = await signIn("admin");
  expect(admin.profileRole, "전제: admin").toBe("admin");
  const name = `S6SURL-거부-${hex()}`;
  const res = await vInsert(admin.client, { school_id: admin.schoolId, name, search_url: fakeSearch() });
  // 비상 정리: 구현 결함으로 들어갔다면 방금 만든 행만 지운다 (정상이라면 호출 없음)
  if (!res.error) {
    const ids = rowsOf(res.data).map((r) => r.id as string);
    if (HAS_SERVICE) await service().from("vendors").delete().in("id", ids);
    else await admin.client.from("vendors").delete().in("id", ids);
  }
  expectError(res, "학교 A admin vendors insert(search_url 있음)", RLS_DENIED);
  const left = await admin.client.from("vendors").select("id").eq("name", name);
  expect(left.data ?? [], "그 이름의 행").toHaveLength(0);
});

// ======================================================================
// 일회용 학교 (service role 로 준비·정리)
// ======================================================================

type Fixture = Fx & { other: TempSchool; teacherC: SupabaseClient; studentC: SupabaseClient; otherAdmin: SupabaseClient };
let fixtureCache: Promise<Fixture> | null = null;

function fixture(info: TestInfo): Promise<Fixture> {
  fixtureCache ??= (async () => {
    const f = await makeSchool(info, GROUP);
    const other = await tempSchool(info, GROUP);
    return { ...f, other, teacherC: await clientFor(f.teacher), studentC: await clientFor(f.student), otherAdmin: await clientFor(other.admin) };
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
  return f;
}

/** 일회용 admin 세션의 판매처 등록 (search_url 없이 — 성공해야 함) */
async function newVendor(f: Fixture, patch: Row = {}): Promise<Row> {
  return expectOne(
    await vInsert(f.prep, { school_id: f.school.id, name: `S6SURL-${hex()}`, contact: "043-000-0000", website: `https://v-${hex()}.example.test/`, note: "원래", ...patch }),
    `admin vendors insert(${JSON.stringify(patch)})`,
  );
}

test.describe("일회용 학교", () => {
  test.describe.configure({ mode: "default" });
  test.skip(!HAS_SERVICE, NO_SERVICE_REASON);

  test(`[R-db][S9] 일회용 admin: insert 에 search_url 값(유효 형식 · 공통 주소 그대로) → 42501 · 행 0 / search_url 없음·null 명시 → 성공(search_url null)`, async ({}, info) => {
    const f = await fresh(info);
    for (const url of [fakeSearch(), COMMON_SEARCH[0].searchUrl]) {
      const name = `S6SURL-거부-${hex()}`;
      const res = await vInsert(f.prep, { school_id: f.school.id, name, website: "https://ok.example.test/", search_url: url });
      expectError(res, `admin insert(search_url = ${url})`, RLS_DENIED);
      expect((await vendorsOf(f.school.id)).filter((v) => v.name === name), "그 이름의 행").toHaveLength(0);
    }
    expect(await vendorsOf(f.school.id), "거부 뒤 학교 판매처").toEqual([]);

    const plain = await newVendor(f);
    expect(plain.search_url, "search_url 없이 등록 → null").toBeNull();
    const explicitNull = await newVendor(f, { search_url: null });
    expect(explicitNull.search_url, "search_url null 명시 → 성공·null").toBeNull();
    expect((await vendorsOf(f.school.id)).map((v) => v.id).sort(), "등록된 행 = 2").toEqual([plain.id, explicitNull.id].sort());
  });

  test(`[R-db][S9] 일회용 admin: 자기 학교 판매처 search_url update(null→값, 다른 열과 함께) → 42501 · 행 그대로 / 이름·연락처·웹사이트·note 수정은 성공 · search_url null 유지`, async ({}, info) => {
    const f = await fresh(info);
    const made = await newVendor(f);
    const id = made.id as string;

    for (const patch of [
      { search_url: fakeSearch() },
      { search_url: COMMON_SEARCH[0].searchUrl },
      { name: `S6SURL-섞음-${hex()}`, search_url: fakeSearch() },
      { note: "섞음", website: "https://mix.example.test/", search_url: fakeSearch() },
    ] as Row[]) {
      expectError(await vUpdate(f.prep, id, patch), `admin update(${JSON.stringify(patch)})`, RLS_DENIED);
      expect(await vendorById(id), `update(${JSON.stringify(patch)}) 뒤 행 그대로`).toEqual(made);
    }

    const patch = { name: `S6SURL-수정-${hex()}`, contact: "02-123-4567", website: "http://changed.example.test/p?q=1", note: "수정" };
    const up = expectOne(await vUpdate(f.prep, id, patch), "admin 일반 필드 update");
    expect(up, "일반 필드 update 결과").toMatchObject({ id, school_id: f.school.id, search_url: null, ...patch });
    // 클라이언트가 지금 값(null) 그대로 search_url 을 함께 보내는 수정도 된다 (값을 바꾸지 않으므로)
    const same = expectOne(await vUpdate(f.prep, id, { note: "같은 값", search_url: null }), "admin update(search_url null 그대로 + note)");
    expect(same, "search_url null 그대로 + note").toMatchObject({ id, note: "같은 값", search_url: null });
    const cleared = expectOne(await vUpdate(f.prep, id, { contact: null, website: null, note: null }), "admin update(null 로 비우기)");
    expect(cleared).toMatchObject({ id, contact: null, website: null, note: null, search_url: null });
    expect(await vendorById(id), "대조").toEqual(cleared);
  });

  test(`[R-db][S9] 일회용 admin: (service role 로 search_url 을 넣어 둔) 자기 학교 판매처 — search_url 을 다른 값·null 로 바꾸면 42501 · 다른 열 수정·삭제는 성공하고 search_url 유지`, async ({}, info) => {
    const f = await fresh(info);
    const made = await newVendor(f);
    const id = made.id as string;
    const url = fakeSearch();
    const prep = await service().from("vendors").update({ search_url: url }).eq("id", id).select("*");
    const seeded = expectOne(prep as Res, "준비(service role): search_url 넣기");
    expect(seeded.search_url, "준비 값").toBe(url);

    for (const patch of [{ search_url: null }, { search_url: fakeSearch() }, { note: "같이", search_url: null }] as Row[]) {
      expectError(await vUpdate(f.prep, id, patch), `admin update(${JSON.stringify(patch)})`, RLS_DENIED);
      expect(await vendorById(id), `update(${JSON.stringify(patch)}) 뒤 행 그대로`).toEqual(seeded);
    }
    const up = expectOne(await vUpdate(f.prep, id, { name: `S6SURL-유지-${hex()}`, note: "수정" }), "admin 일반 필드 update");
    expect(up.search_url, "일반 필드 수정 뒤 search_url 유지").toBe(url);
    const del = expectOne(await f.prep.from("vendors").delete().eq("id", id).select("*"), "admin delete");
    expect(del.id).toBe(id);
    expect(await vendorById(id), "삭제됨").toBeNull();
  });

  test(`[R-db][S9] 일회용 교사·학생: 같은 학교 판매처 search_url update 0행 · search_url 넣은 insert 거부 · 행 그대로`, async ({}, info) => {
    const f = await fresh(info);
    const made = await newVendor(f);
    const id = made.id as string;
    for (const [who, c] of [["교사", f.teacherC], ["학생", f.studentC]] as [string, SupabaseClient][]) {
      for (const patch of [{ search_url: fakeSearch() }, { search_url: null }] as Row[]) {
        expect(changed(await vUpdate(c, id, patch)), `${who} update(${JSON.stringify(patch)})`).toBe(0);
      }
      const ins = await vInsert(c, { school_id: f.school.id, name: `S6SURL-거부-${who}-${hex()}`, search_url: fakeSearch() });
      expectError(ins, `${who} insert(search_url 있음)`, RLS_DENIED);
      expect(await vendorsOf(f.school.id), `${who} 시도 뒤 판매처`).toEqual([made]);
    }
  });

  test(`[N1-db][S6] 일회용 admin: 다른 일회용 학교 판매처·공통 행 search_url update 0행 · 다른 학교 school_id 로 search_url insert 거부 · 다른 학교·공통 그대로`, async ({}, info) => {
    const f = await fresh(info);
    const theirs = expectOne(await vInsert(f.otherAdmin, { school_id: f.other.id, name: `S6SURL-B-${hex()}`, website: "https://b.example.test/" }), "다른 학교 admin 판매처 등록");
    const commonBefore = await commonRows();
    try {
      for (const patch of [{ search_url: fakeSearch() }, { search_url: null }, { note: "침범" }] as Row[]) {
        expect(changed(await vUpdate(f.prep, theirs.id as string, patch)), `다른 학교 판매처 update(${JSON.stringify(patch)})`).toBe(0);
        for (const v of commonBefore) {
          expect(changed(await vUpdate(f.prep, v.id as string, patch)), `공통 "${String(v.name)}" update(${JSON.stringify(patch)})`).toBe(0);
        }
      }
      for (const schoolId of [f.other.id, null]) {
        const res = await vInsert(f.prep, { school_id: schoolId, name: `S6SURL-거부-${hex()}`, search_url: fakeSearch() });
        if (!res.error) await service().from("vendors").delete().in("id", rowsOf(res.data).map((r) => r.id as string));
        expectError(res, `admin insert(school_id = ${String(schoolId)}, search_url 있음)`, RLS_DENIED);
      }
      expect(await vendorsOf(f.other.id), "다른 일회용 학교 판매처 그대로").toEqual([theirs]);
      expect(await commonRows(), "공통 목록 그대로").toEqual(commonBefore);
      expect(await vendorsOf(f.school.id), "자기 학교에도 새 행 없음").toEqual([]);
    } finally {
      await restoreCommon(commonBefore);
    }
  });

  test(`[R-db][S6] 제약(service role, 일회용 학교 판매처): search_url = http:// · {q} 없음 · {q} 2번 · ${SEARCH_URL_MAX + 1}자 → 23514 / null · ${SEARCH_URL_MAX}자 https+{q} 1번 → 통과`, async ({}, info) => {
    const f = await fresh(info);
    const made = await newVendor(f);
    const id = made.id as string;
    const pad = (n: number) => {
      const head = "https://s6surl.example.test/s?kw=" + SEARCH_Q + "&x=";
      return head + "a".repeat(n - head.length);
    };
    expect(pad(SEARCH_URL_MAX)).toHaveLength(SEARCH_URL_MAX);
    const bad: [string, string][] = [
      ["http://", "http://s6surl.example.test/s?kw={q}"],
      ["{q} 없음", "https://s6surl.example.test/s?kw="],
      ["{q} 2번", "https://s6surl.example.test/s?kw={q}&alt={q}"],
      [`${SEARCH_URL_MAX + 1}자`, pad(SEARCH_URL_MAX + 1)],
    ];
    const sb = service();
    for (const [what, url] of bad) {
      const up = (await sb.from("vendors").update({ search_url: url }).eq("id", id).select("*")) as Res;
      expectError(up, `service role update(search_url ${what})`, CHECK_VIOLATION);
      expect(await vendorById(id), `${what} update 뒤 행 그대로`).toEqual(made);
      const name = `S6SURL-제약-${hex()}`;
      const ins = (await sb.from("vendors").insert({ school_id: f.school.id, name, search_url: url }).select("*")) as Res;
      if (!ins.error) await sb.from("vendors").delete().in("id", rowsOf(ins.data).map((r) => r.id as string));
      expectError(ins, `service role insert(search_url ${what})`, CHECK_VIOLATION);
    }
    for (const [what, url] of [[`${SEARCH_URL_MAX}자`, pad(SEARCH_URL_MAX)], ["d7 공통 주소", COMMON_SEARCH[0].searchUrl], ["null", null]] as [string, string | null][]) {
      const up = expectOne((await sb.from("vendors").update({ search_url: url }).eq("id", id).select("*")) as Res, `service role update(search_url ${what})`);
      expect(up.search_url, what).toBe(url);
    }
    expect(await vendorsOf(f.school.id), "자기 학교 판매처 = 1행 (제약 위반 insert 0)").toHaveLength(1);
    expect(await vendorsOf(f.other.id), "다른 일회용 학교 판매처 0").toEqual([]);
  });
});
