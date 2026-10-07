// [R-db][S3] · [N1-db][S3] · [GM-db][S*] — MSDS 넣기 DB 함수 set_reagent_msds (harness/d7-data.md §20 화면 3·2 저장).
// 실제 RLS·함수 (publishable/anon 키 + 각 계정 로그인 세션)로 판정한다. service role 은 준비·정리·대조 조회에만.
// 기준 (d7 §20 화면 3 줄): set_reagent_msds(p_reagent_id, p_msds_url, p_cas_no null 허용) — 교사·admin, 자기 학교, 데모 거부,
//   msds_url 은 http(s):// 300자 이하, cas_no 는 시약의 cas_no 가 비어 있을 때만 채움.
//   오류 형태(42501 · P0002 · 22023)는 supabase/migrations/20261007230000_set_reagent_msds.sql 머리말.
//
// 절대 규칙 (운영 DB):
// - 성공 경로·잘못된 인자는 일회용 학교(admin·교사·학생, service role 로 생성 · 세션은 generateLink/verifyOtp)에서만.
// - 공용 계정(학교 A·B)·anon 은 "거부되어야 하는 호출"만, 그것도 혹시 통과해도 값이 바뀌지 않는 인자(지금 값 그대로)로만 겨눈다.
// - afterAll: 일회용 계정·학교·시약 잔여 0, 학교 A·B·데모 학교 시약의 msds_url·cas_no 스냅숏 그대로.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type TestInfo } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anonClient, signIn } from "./db-helpers";
import { HAS_SERVICE, clientFor, service, type TempUser } from "./screen-8-helpers";
import { NO_S11_RESIDUE, cleanup, makeFixture, prepReagent, type S11Fixture } from "./screen-11-helpers";

test.describe.configure({ mode: "default" });

const GROUP = "msdsdb";
const FN = "set_reagent_msds";

// ---- d7 §20 문장에서 주소 길이 한도 ----
const D7 = readFileSync(join(process.cwd(), "harness", "d7-data.md"), "utf8");
const S20 = D7.slice(D7.indexOf("## 20."), D7.indexOf("\n## ", D7.indexOf("## 20.") + 5));
const URL_MAX = Number((/http\(s\):\/\/ (\d+)자 이하/.exec(S20) ?? [])[1]);

const DEMO_SCHOOL_ID = (() => {
  const src = readFileSync(join(process.cwd(), "lib", "supabase", "demo-data.ts"), "utf8");
  const m = src.match(/export const DEMO_SCHOOL_ID\s*=\s*"([0-9a-f-]{36})"/);
  if (!m) throw new Error("lib/supabase/demo-data.ts 에서 DEMO_SCHOOL_ID 를 찾지 못했습니다");
  return m[1];
})();

const URL1 = "https://msds.kosha.or.kr/MSDSInfo/kcic/msdsdetail.do?chem_id=000699&viewType=msds";
const URL2 = "https://msds.kosha.or.kr/MSDSInfo/kcic/msdsdetail.do?chem_id=012345&viewType=msds";
const CAS1 = "7761-88-8";
const CAS_OLD = "64-17-5";

type Row = Record<string, unknown>;
const COLS = "id, school_id, name, cas_no, unit, stock, min_stock, msds_url, slot_id, storage_class, intake_date, min_stock_source";

async function rowOf(id: string): Promise<Row> {
  const r = await service().from("reagents").select(COLS).eq("id", id).single();
  if (r.error || !r.data) throw new Error(`대조 조회 실패: ${r.error?.message}`);
  return r.data as Row;
}

/**
 * 공용 학교 A·B·데모 학교 시약의 MSDS·CAS 스냅숏 (service role 읽기).
 * 다른 스펙이 동시에 공용 학교에 임시 시약을 넣었다 지울 수 있어, 비교는 처음 스냅숏의 시약(id)만 본다 (sameAsBefore).
 */
async function sharedMsdsSnapshot(): Promise<string[]> {
  const sb = service();
  const s = await sb.from("schools").select("id").or("neis_code.like.TEST-SCHOOL-%,is_demo.eq.true");
  if (s.error) throw new Error(s.error.message);
  const ids = (s.data ?? []).map((x) => x.id as string);
  expect(ids.length, "대조: 학교 A·B·데모").toBeGreaterThanOrEqual(3);
  const r = await sb.from("reagents").select("id, school_id, msds_url, cas_no").in("school_id", ids);
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []).map((x) => `${x.school_id}|${x.id}|${x.msds_url ?? ""}|${x.cas_no ?? ""}`).sort();
}

let before: string[] | null = null;
/** 처음 스냅숏의 시약이 지금도 같은 값인지 (사라진 시약은 다른 스펙의 임시 시약 — 비교에서 뺀다) */
function sameAsBefore(prev: string[], now: string[]): string[] {
  const key = (line: string) => line.split("|").slice(0, 2).join("|");
  const nowByKey = new Map(now.map((l) => [key(l), l]));
  return prev.filter((l) => nowByKey.has(key(l)) && nowByKey.get(key(l)) !== l);
}
const fixtures = new Map<string, Promise<S11Fixture>>();
function fixture(info: TestInfo, key: "a" | "b"): Promise<S11Fixture> {
  let p = fixtures.get(key);
  if (!p) {
    p = makeFixture(info, GROUP);
    fixtures.set(key, p);
    p.catch(() => fixtures.delete(key));
  }
  return p;
}
const clients = new Map<string, Promise<SupabaseClient>>();
const as = (u: TempUser) => {
  let c = clients.get(u.id);
  if (!c) {
    c = clientFor(u);
    clients.set(u.id, c);
  }
  return c;
};

test.beforeAll(async () => {
  if (HAS_SERVICE) before = await sharedMsdsSnapshot();
});
test.afterAll(async ({}, info) => {
  info.setTimeout(300_000);
  if (!HAS_SERVICE) return;
  fixtures.clear();
  clients.clear();
  const left = await cleanup(GROUP, info.project.name);
  expect(left, "일회용 계정·학교·시약 잔여물").toEqual(NO_S11_RESIDUE);
  if (before) {
    const now = await sharedMsdsSnapshot();
    expect(sameAsBefore(before, now), "학교 A·B·데모 학교 시약의 msds_url·cas_no 그대로 (바뀐 줄 0)").toEqual([]);
    const kept = before.filter((l) => now.some((n) => n.split("|").slice(0, 2).join("|") === l.split("|").slice(0, 2).join("|")));
    expect(kept.length, "대조할 공용 시약이 남아 있음").toBeGreaterThan(0);
  }
});

/** MSDS 없음 · CAS 없음 시약 (register_reagent — admin 세션) */
async function bare(f: S11Fixture, tag: string) {
  const r = await prepReagent(f, tag, 3, "병");
  const row = await rowOf(r.id);
  expect([row.msds_url, row.cas_no], "준비: MSDS·CAS 없음").toEqual([null, null]);
  return r;
}
/** CAS 를 넣어 둔 시약 (준비만 service role — register_reagent 에 CAS 인자가 없다) */
async function withCas(f: S11Fixture, tag: string, cas: string) {
  const r = await bare(f, tag);
  const u = await service().from("reagents").update({ cas_no: cas }).eq("id", r.id).eq("school_id", f.school.id).select("id");
  expect(u.error, `준비: CAS (${u.error?.message})`).toBeNull();
  expect(u.data ?? []).toHaveLength(1);
  return r;
}

const strip = (r: Row) => {
  const { msds_url: _m, cas_no: _c, ...rest } = r;
  void _m;
  void _c;
  return rest;
};

test.describe("일회용 학교", () => {
  test.skip(!HAS_SERVICE, "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음");
  test.beforeEach(() => test.setTimeout(300_000));

  for (const who of ["teacher", "admin"] as const) {
    test(`[R-db][S3] 일회용 ${who === "teacher" ? "교사" : "admin"} ${FN}: 성공 → jsonb {reagent_id·msds_url·cas_no·cas_filled} · DB msds_url 저장(앞뒤 공백 정리) · CAS 비어 있으면 채움 · 다른 열 그대로`, async ({}, info) => {
      const f = await fixture(info, "a");
      const r = await bare(f, `ok-${who}`);
      const prev = await rowOf(r.id);
      const c = await as(who === "teacher" ? f.teacher : f.admin);
      const res = await c.rpc(FN, { p_reagent_id: r.id, p_msds_url: `  ${URL1} `, p_cas_no: ` ${CAS1} ` });
      expect(res.error, `${FN} (${res.error?.code} ${res.error?.message})`).toBeNull();
      expect(res.data).toEqual({ reagent_id: r.id, msds_url: URL1, cas_no: CAS1, cas_filled: true });
      const now = await rowOf(r.id);
      expect([now.msds_url, now.cas_no], "DB msds_url · cas_no").toEqual([URL1, CAS1]);
      expect(strip(now), "다른 열(재고·기준·위치·분류·이름 …) 그대로").toEqual(strip(prev));
      // 자기 세션(RLS)으로도 같은 값이 읽힌다
      const read = await c.from("reagents").select("msds_url, cas_no").eq("id", r.id).single();
      expect(read.data).toEqual({ msds_url: URL1, cas_no: CAS1 });
    });
  }

  test(`[R-db][S3] 일회용 교사 ${FN}: CAS 가 이미 있으면 그대로(cas_filled false) · p_cas_no 생략/null/빈 값이면 CAS 그대로 · MSDS 다시 넣기는 새 주소로`, async ({}, info) => {
    const f = await fixture(info, "a");
    const c = await as(f.teacher);
    const has = await withCas(f, "has-cas", CAS_OLD);
    const r1 = await c.rpc(FN, { p_reagent_id: has.id, p_msds_url: URL1, p_cas_no: CAS1 });
    expect(r1.error, r1.error?.message).toBeNull();
    expect(r1.data).toEqual({ reagent_id: has.id, msds_url: URL1, cas_no: CAS_OLD, cas_filled: false });
    expect([(await rowOf(has.id)).msds_url, (await rowOf(has.id)).cas_no], "CAS 는 원래 값").toEqual([URL1, CAS_OLD]);

    const none = await bare(f, "no-cas");
    for (const [label, args] of [
      ["생략", {}],
      ["null", { p_cas_no: null }],
      ["빈 값", { p_cas_no: "   " }],
    ] as const) {
      const r = await c.rpc(FN, { p_reagent_id: none.id, p_msds_url: label === "생략" ? URL1 : URL2, ...args });
      expect(r.error, `${label}: ${r.error?.message}`).toBeNull();
      expect((r.data as Row).cas_filled, `${label}: cas_filled`).toBe(false);
      expect((await rowOf(none.id)).cas_no, `${label}: CAS 그대로 비어 있음`).toBeNull();
    }
    expect((await rowOf(none.id)).msds_url, "마지막에 넣은 주소").toBe(URL2);
  });

  test(`[R-db][S3] 일회용 교사 ${FN}: 주소 검증(http(s)://, 공백 없음, ${URL_MAX}자 이하) · CAS 형식 검증 → 22023, 값 그대로 / ${URL_MAX}자 정확히 = 성공`, async ({}, info) => {
    expect(URL_MAX, "d7 §20 주소 길이").toBeGreaterThan(20);
    const f = await fixture(info, "a");
    const c = await as(f.teacher);
    const r = await bare(f, "bad");
    const prev = await rowOf(r.id);
    const base = "https://msds.example.test/";
    const badUrls: [string, unknown][] = [
      ["javascript:", "javascript:alert(1)"],
      ["ftp:", "ftp://x.test/msds.pdf"],
      ["스킴 없음", "x.test/msds.pdf"],
      ["빈 값", ""],
      ["null", null],
      ["공백 포함", "https://x.test/a b"],
      ["https:// 뿐", "https://"],
      [`${URL_MAX + 1}자`, base + "a".repeat(URL_MAX + 1 - base.length)],
    ];
    for (const [label, url] of badUrls) {
      const res = await c.rpc(FN, { p_reagent_id: r.id, p_msds_url: url });
      expect(res.error?.code, `주소 ${label} → 22023`).toBe("22023");
    }
    for (const cas of ["abc", "1-17-5", "64-1-5", "64-17-55", "12345678-12-3", "7761 88 8"]) {
      const res = await c.rpc(FN, { p_reagent_id: r.id, p_msds_url: URL1, p_cas_no: cas });
      expect(res.error?.code, `CAS "${cas}" → 22023`).toBe("22023");
    }
    expect(await rowOf(r.id), "거부된 호출 뒤 값 그대로").toEqual(prev);
    const exactMax = base + "a".repeat(URL_MAX - base.length);
    expect(exactMax).toHaveLength(URL_MAX);
    const ok = await c.rpc(FN, { p_reagent_id: r.id, p_msds_url: exactMax });
    expect(ok.error, `${URL_MAX}자 주소 성공 (${ok.error?.message})`).toBeNull();
    expect((await rowOf(r.id)).msds_url).toBe(exactMax);
  });

  test(`[R-db][S3] ${FN}: 일회용 학생 → 42501 · anon → 거부 · 없는 시약 id → P0002 · 값 그대로`, async ({}, info) => {
    const f = await fixture(info, "a");
    const r = await bare(f, "deny");
    const prev = await rowOf(r.id);
    const st = await (await as(f.student)).rpc(FN, { p_reagent_id: r.id, p_msds_url: URL1, p_cas_no: CAS1 });
    expect(st.error?.code, `학생 → 42501 (${st.error?.message})`).toBe("42501");
    const an = await anonClient().rpc(FN, { p_reagent_id: r.id, p_msds_url: URL1, p_cas_no: CAS1 });
    expect(an.error, "anon → 오류").not.toBeNull();
    expect(an.data ?? null, "anon → 결과 없음").toBeNull();
    expect(["42501", "PGRST202"], `anon 오류 코드 (${an.error?.code} ${an.error?.message})`).toContain(an.error?.code);
    const miss = await (await as(f.teacher)).rpc(FN, { p_reagent_id: randomUUID(), p_msds_url: URL1 });
    expect(miss.error?.code, "없는 시약 → P0002").toBe("P0002");
    expect(await rowOf(r.id), "값 그대로").toEqual(prev);
  });

  test(`[N1-db][S3] ${FN}: 다른 학교(일회용 학교 B'·공용 학교 B·공용 학교 A 교사)는 이 학교 시약에 → P0002, 값 그대로 · 학교 B' 교사는 자기 학교 시약에 성공(양성 대조)`, async ({}, info) => {
    const a = await fixture(info, "a");
    const b = await fixture(info, "b");
    expect(b.school.id).not.toBe(a.school.id);
    const r = await bare(a, "n1");
    const prev = await rowOf(r.id);
    for (const [label, u] of [
      ["학교 B' 교사", b.teacher],
      ["학교 B' admin", b.admin],
    ] as const) {
      const res = await (await as(u)).rpc(FN, { p_reagent_id: r.id, p_msds_url: URL1, p_cas_no: CAS1 });
      expect(res.error?.code, `${label} → P0002 (${res.error?.message})`).toBe("P0002");
    }
    for (const role of ["schoolB", "teacher", "admin"] as const) {
      const s = await signIn(role);
      expect(s.schoolId).not.toBe(a.school.id);
      const res = await s.client.rpc(FN, { p_reagent_id: r.id, p_msds_url: URL1, p_cas_no: CAS1 });
      expect(res.error?.code, `공용 ${role} → P0002 (${res.error?.message})`).toBe("P0002");
    }
    expect(await rowOf(r.id), "다른 학교 시도 뒤 값 그대로").toEqual(prev);
    // 양성 대조: B' 교사는 자기 학교 시약에 성공
    const own = await bare(b, "n1-own");
    const ok = await (await as(b.teacher)).rpc(FN, { p_reagent_id: own.id, p_msds_url: URL2 });
    expect(ok.error, ok.error?.message).toBeNull();
    expect((await rowOf(own.id)).msds_url).toBe(URL2);
  });

  test(`[GM-db][S*] ${FN}: 데모 학교 시약 — anon·일회용 교사·공용 교사 모두 거부, 데모 값 그대로 (지금 값 그대로를 겨눈다)`, async ({}, info) => {
    const f = await fixture(info, "a");
    const demo = await anonClient().from("reagents").select("id, school_id, msds_url, cas_no").eq("school_id", DEMO_SCHOOL_ID).order("id").limit(3);
    expect(demo.error).toBeNull();
    expect((demo.data ?? []).length, "anon 이 보는 데모 시약 ≥ 1").toBeGreaterThan(0);
    for (const d of demo.data ?? []) {
      // 혹시 통과해도 바뀌지 않게 지금 주소(없으면 고정 주소) · CAS 생략
      const url = (d.msds_url as string | null) ?? URL1;
      const an = await anonClient().rpc(FN, { p_reagent_id: d.id, p_msds_url: url });
      expect(an.error, "anon → 거부").not.toBeNull();
      const t = await (await as(f.teacher)).rpc(FN, { p_reagent_id: d.id, p_msds_url: url });
      expect(t.error?.code, `일회용 교사 → P0002 (${t.error?.message})`).toBe("P0002");
      const s = await (await signIn("teacher")).client.rpc(FN, { p_reagent_id: d.id, p_msds_url: url });
      expect(s.error?.code, `공용 교사 → P0002 (${s.error?.message})`).toBe("P0002");
      const again = await anonClient().from("reagents").select("msds_url, cas_no").eq("id", d.id).single();
      expect(again.data, "데모 값 그대로").toEqual({ msds_url: d.msds_url, cas_no: d.cas_no });
    }
  });
});

test(`[R-db][S3] 공용 학교 A 학생 ${FN}: 자기 학교 시약에도 42501 (지금 값 그대로를 겨눈다) · 값 그대로`, async () => {
  const s = await signIn("student");
  const list = await s.client.from("reagents").select("id, msds_url, cas_no").order("id");
  expect(list.error).toBeNull();
  const target = (list.data ?? []).find((r) => r.msds_url) ?? (list.data ?? [])[0];
  expect(target, "학교 A 시약").toBeTruthy();
  const res = await s.client.rpc(FN, { p_reagent_id: target!.id, p_msds_url: (target!.msds_url as string | null) ?? URL1 });
  expect(res.error?.code, `학생 → 42501 (${res.error?.message})`).toBe("42501");
  const again = await s.client.from("reagents").select("msds_url, cas_no").eq("id", target!.id).single();
  expect(again.data).toEqual({ msds_url: target!.msds_url, cas_no: target!.cas_no });
});
