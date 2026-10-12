// [N1-db][S12] · [R-db][S12] 화면 12 QR 찾기 데이터 읽기 — 기존 RLS(같은 학교 select) 로 다른 학교 시약장 0행.
// [GM-db][S16g] 데모 시약 MSDS 주소 마이그레이션 (supabase/migrations/20261011230000_demo_msds_kosha_urls.sql) — 정적 검사 + 적용 후 상태.
// 기준: harness/d7-data.md §26 "화면 12 데이터"(새 표·함수 없음 · cabinets·slots·reagents 기존 RLS · 다른 학교 id 는 0행)
//       · "화면 12 경로·권한"(모든 역할 읽기) · QA 개선 (8)(데모 시약 MSDS 주소 = KOSHA 실제 상세 주소, 마이그레이션으로 seed 갱신),
//       §22 "요약 대상"(공단 상세 주소 꼴 msds.kosha.or.kr/MSDSInfo/kcic/msdsdetail.do?chem_id=…), harness/d5-gates.md N1-db·R-db·GM-db.
// 판정은 publishable 키 + 각 계정 로그인 세션(실제 RLS). service role 미사용. 공용 데이터는 읽기만 한다.
// lookupScanCabinet(lib/supabase/scan.ts) 과 같은 꼴의 조회(cabinets → cabinet_slots → reagents)를 세션별로 그대로 해 본다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ROLE_LABEL, SCHOOL_A_ROLES, anonClient, signIn, type Session } from "./db-helpers";

test.describe.configure({ mode: "default" });

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8").replace(/\r\n/g, "\n");

/** 데모 학교 고정 id — lib/supabase/demo-data.ts (server-only 라 소스 텍스트에서 읽는다) */
const DEMO_SCHOOL_ID = (() => {
  const m = read("lib", "supabase", "demo-data.ts").match(/export const DEMO_SCHOOL_ID\s*=\s*"([0-9a-f-]{36})"/);
  if (!m) throw new Error("lib/supabase/demo-data.ts 에서 DEMO_SCHOOL_ID 를 찾지 못함");
  return m[1];
})();

/** d7 §22 공단 상세 주소 (chem_id 앞까지) */
const KOSHA_DETAIL = (() => {
  const d7 = read("harness", "d7-data.md");
  const s = d7.indexOf("## 22.");
  const sec = d7.slice(s, d7.indexOf("\n## ", s + 5));
  const m = /`(msds\.kosha\.or\.kr\/[^`?]+)\?chem_id=/.exec(sec);
  if (!m) throw new Error("d7 §22 요약 대상에서 공단 상세 주소를 읽지 못함");
  return `https://${m[1]}`;
})();

// ---------- 화면 12 읽기 ----------

type Cab = { id: string; school_id: string; number: number | null; label: string };

/** lookupScanCabinet 과 같은 꼴: (학교 조건) + id 또는 번호 → 칸 → 보관 안 된 시약 */
async function scanRead(client: SupabaseClient, by: { id: string } | { number: number }, schoolId?: string) {
  let q = client.from("cabinets").select("id, school_id, number, label, door_type, shelves");
  if (schoolId) q = q.eq("school_id", schoolId);
  const cab = "id" in by ? await q.eq("id", by.id) : await q.eq("number", by.number);
  expect(cab.error, "cabinets 조회 오류 없음").toBeNull();
  const cabs = (cab.data ?? []) as Cab[];
  const ids = cabs.map((c) => c.id);
  const slots = ids.length ? await client.from("cabinet_slots").select("id, cabinet_id, side, shelf").in("cabinet_id", ids) : { data: [], error: null };
  expect(slots.error, "cabinet_slots 조회 오류 없음").toBeNull();
  const slotIds = (slots.data ?? []).map((s) => s.id as string);
  const reagents = slotIds.length
    ? await client.from("reagents").select("id, school_id, name, slot_id").in("slot_id", slotIds).is("deleted_at", null)
    : { data: [], error: null };
  expect(reagents.error, "reagents 조회 오류 없음").toBeNull();
  return { cabs, slots: slots.data ?? [], reagents: (reagents.data ?? []) as { id: string; school_id: string; name: string; slot_id: string }[] };
}

/** 학교 A 의 시약이 들어 있는 시약장 (양성 대조 — 칸·시약까지 0행이 "원래 비어서"가 되지 않게) */
async function schoolACabinetWithReagents(a: Session): Promise<{ cab: Cab; slotIds: string[]; reagentIds: string[] }> {
  const placed = await a.client.from("reagents").select("id, slot_id").not("slot_id", "is", null).is("deleted_at", null).limit(50);
  expect(placed.error).toBeNull();
  expect((placed.data ?? []).length, "학교 A 에 칸에 놓인 시약이 있다 (seed)").toBeGreaterThan(0);
  const slot = await a.client.from("cabinet_slots").select("id, cabinet_id").eq("id", placed.data![0].slot_id as string).single();
  expect(slot.error).toBeNull();
  const r = await scanRead(a.client, { id: slot.data!.cabinet_id as string }, a.schoolId);
  expect(r.cabs, "학교 A 시약장 1행").toHaveLength(1);
  expect(r.reagents.length, "학교 A 시약장 안 시약 ≥ 1 (양성 대조)").toBeGreaterThan(0);
  return { cab: r.cabs[0], slotIds: r.slots.map((s) => s.id as string), reagentIds: r.reagents.map((x) => x.id) };
}

for (const role of SCHOOL_A_ROLES) {
  test(`[R-db][S12] ${ROLE_LABEL[role]}: 자기 학교 시약장 QR(id)·번호로 시약장·칸·보관 안 된 시약 읽기 (모든 역할 읽기 — d7 §26)`, async () => {
    test.setTimeout(120_000);
    const s = await signIn(role);
    const teacher = await signIn("teacher");
    const { cab, reagentIds } = await schoolACabinetWithReagents(teacher);
    const byId = await scanRead(s.client, { id: cab.id }, s.schoolId);
    expect(byId.cabs.map((c) => c.id), "id 로 1행").toEqual([cab.id]);
    expect(byId.cabs.every((c) => c.school_id === s.schoolId)).toBe(true);
    expect(byId.reagents.map((r) => r.id).sort(), "교사가 보는 것과 같은 시약").toEqual([...reagentIds].sort());
    expect(byId.reagents.every((r) => r.school_id === s.schoolId), "시약은 모두 자기 학교").toBe(true);
    expect(typeof cab.number, "시약장 번호 있음").toBe("number");
    const byNum = await scanRead(s.client, { number: cab.number! }, s.schoolId);
    expect(byNum.cabs.map((c) => c.id), "번호로 1행").toEqual([cab.id]);
  });
}

test(`[N1-db][S12] 학교B 사용자: 학교 A 시약장 id(QR) → cabinets·cabinet_slots·reagents 0행 (학교 조건 있음·없음 둘 다 — RLS)`, async () => {
  test.setTimeout(120_000);
  const a = await signIn("teacher");
  const b = await signIn("schoolB");
  expect(b.schoolId).not.toBe(a.schoolId);
  const { cab, slotIds, reagentIds } = await schoolACabinetWithReagents(a);

  // lookupScanCabinet 그대로 (학교 조건 = 로그인 사용자 학교) → 0행 = "not-ours"
  const withSchool = await scanRead(b.client, { id: cab.id }, b.schoolId);
  expect(withSchool.cabs, "학교 조건 + 학교 A id → 0행").toHaveLength(0);
  // 학교 조건을 빼도 RLS 가 거른다
  const noFilter = await scanRead(b.client, { id: cab.id });
  expect(noFilter.cabs, "학교 조건 없이 학교 A id → 0행 (RLS)").toHaveLength(0);
  const slotsDirect = await b.client.from("cabinet_slots").select("id").in("id", slotIds);
  expect(slotsDirect.error).toBeNull();
  expect(slotsDirect.data ?? [], "학교 A 칸 id 직접 → 0행").toHaveLength(0);
  const slotsByCab = await b.client.from("cabinet_slots").select("id").eq("cabinet_id", cab.id);
  expect(slotsByCab.data ?? [], "학교 A 시약장의 칸 → 0행").toHaveLength(0);
  const reagentsBySlot = await b.client.from("reagents").select("id").in("slot_id", slotIds);
  expect(reagentsBySlot.error).toBeNull();
  expect(reagentsBySlot.data ?? [], "학교 A 칸의 시약 → 0행").toHaveLength(0);
  const reagentsById = await b.client.from("reagents").select("id").in("id", reagentIds);
  expect(reagentsById.data ?? [], "학교 A 시약 id 직접 → 0행").toHaveLength(0);
});

test(`[N1-db][S12] 학교B 사용자: 번호로 찾기는 자기 학교 시약장만 (학교 A 와 같은 번호여도 학교 A 행 0)`, async () => {
  test.setTimeout(120_000);
  const a = await signIn("teacher");
  const b = await signIn("schoolB");
  const { cab } = await schoolACabinetWithReagents(a);
  const r = await scanRead(b.client, { number: cab.number! });
  expect(r.cabs.filter((c) => c.school_id !== b.schoolId), "학교 B 세션이 받은 다른 학교 시약장 0").toHaveLength(0);
  expect(r.cabs.map((c) => c.id), "학교 A 시약장 id 없음").not.toContain(cab.id);
  expect(r.reagents.filter((x) => x.school_id !== b.schoolId), "다른 학교 시약 0").toHaveLength(0);
  // 학교 B 전체 시약장 목록에도 다른 학교 행 0 (양성 대조: 목록 조회 자체는 된다)
  const all = await b.client.from("cabinets").select("id, school_id");
  expect(all.error).toBeNull();
  expect((all.data ?? []).filter((c) => c.school_id !== b.schoolId), "학교 B cabinets 에 다른 학교 0행").toHaveLength(0);
});

test(`[N1-db][S12] 학교A 학생: 학교 B 시약장 id → 0행 (반대 방향)`, async () => {
  test.setTimeout(120_000);
  const b = await signIn("schoolB");
  const bCabs = await b.client.from("cabinets").select("id").limit(1);
  expect(bCabs.error).toBeNull();
  expect(bCabs.data ?? [], "학교 B 시약장 (양성 대조)").toHaveLength(1);
  const student = await signIn("student");
  const r = await scanRead(student.client, { id: bCabs.data![0].id as string });
  expect(r.cabs, "학교 B 시약장 0행").toHaveLength(0);
});

test(`[N1-db][S12] 비로그인 anon: 학교 A 시약장 id → 0행 (화면 12 는 로그인 후만)`, async () => {
  test.setTimeout(120_000);
  const a = await signIn("teacher");
  const { cab, slotIds } = await schoolACabinetWithReagents(a);
  const anon = anonClient();
  const r = await scanRead(anon, { id: cab.id });
  expect(r.cabs, "anon 학교 A 시약장 0행").toHaveLength(0);
  const slots = await anon.from("cabinet_slots").select("id").in("id", slotIds);
  expect(slots.data ?? [], "anon 학교 A 칸 0행").toHaveLength(0);
});

// ---------- 데모 MSDS 주소 마이그레이션 (정적) ----------

const MIGRATION = "20261011230000_demo_msds_kosha_urls.sql";
const DEMO_SEED = "20261003140000_demo_school.sql";
const strip = (sql: string) => sql.replace(/--[^\n]*/g, "");

type MigRow = { id: string; cas: string; chemId: string };
function migrationRows(): { sql: string; rows: MigRow[] } {
  const sql = strip(read("supabase", "migrations", MIGRATION));
  const rows = [...sql.matchAll(/\(\s*'([0-9a-f-]{36})'::uuid\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g)].map((m) => ({ id: m[1], cas: m[2], chemId: m[3] }));
  return { sql, rows };
}
/** 데모 seed 의 reagents 행: id → {school_id, cas_no, msds_url} */
function demoSeedReagents(): Map<string, { school: string; cas: string; url: string }> {
  const sql = strip(read("supabase", "migrations", DEMO_SEED));
  const out = new Map<string, { school: string; cas: string; url: string }>();
  for (const m of sql.matchAll(/\(\s*'([0-9a-f-]{36})',\s*'([0-9a-f-]{36})',\s*'[^']*',\s*'([^']*)',\s*'[^']*',\s*[\d.]+,\s*[\d.]+,\s*'([^']*)'/g)) {
    out.set(m[1], { school: m[2], cas: m[3], url: m[4] });
  }
  return out;
}

test(`[GM-db][S16g] 마이그레이션 ${MIGRATION}: 데모 학교 행만 바꾼다 (update 1개 · school_id = 데모 · id·CAS 가 데모 seed 와 같음 · 첫 화면 주소인 행만 · msds_url 만)`, () => {
  const { sql, rows } = migrationRows();
  const seed = demoSeedReagents();
  expect(seed.size, "데모 seed reagents 파싱").toBeGreaterThan(0);

  // 문장: update public.reagents 1개, insert·delete·다른 테이블·DDL 없음
  const statements = sql.split(";").map((s) => s.trim()).filter(Boolean);
  expect(statements, "SQL 문장 1개").toHaveLength(1);
  const st = statements[0];
  expect(st).toMatch(/^update\s+public\.reagents\s+r\s+set\s+msds_url\s*=/i);
  expect(st, "insert·delete·drop·alter·truncate·grant 없음").not.toMatch(/\b(insert|delete|drop|alter|truncate|grant|revoke|create)\b/i);
  const setClause = /\bset\s+([\s\S]*?)\s+from\s*\(/i.exec(st)![1];
  expect(setClause.split(/,(?![^(]*\))/).length, "set 은 msds_url 하나").toBe(1);

  // where: id 일치 + 데모 학교 + CAS 일치 + 아직 첫 화면 주소(또는 null)
  const where = st.slice(st.search(/\bwhere\b/i));
  expect(where).toMatch(/r\.id\s*=\s*m\.id/i);
  expect(where).toContain(`r.school_id = '${DEMO_SCHOOL_ID}'`);
  expect(where).toMatch(/r\.cas_no\s*=\s*m\.cas_no/i);
  expect(where).toMatch(/r\.msds_url is null or r\.msds_url = 'https:\/\/msds\.kosha\.or\.kr\/'/i);
  expect(where, "where 에 or 는 msds_url 조건 괄호 안만").not.toMatch(/\)\s*or\b|\bor\s+r\.(id|school_id|cas_no)/i);

  // 값 행: 데모 seed 의 행과 id·CAS 가 같고 학교 = 데모, 지금 주소 = 첫 화면
  expect(rows.length, "값 행 ≥ 1").toBeGreaterThan(0);
  expect(new Set(rows.map((r) => r.id)).size, "id 중복 없음").toBe(rows.length);
  for (const r of rows) {
    const s = seed.get(r.id);
    expect(s, `${r.id} 는 데모 seed 시약`).toBeTruthy();
    expect(s!.school, `${r.id} 학교 = 데모`).toBe(DEMO_SCHOOL_ID);
    expect(s!.cas, `${r.id} CAS`).toBe(r.cas);
    expect(s!.url, `${r.id} seed 주소 = 공단 첫 화면`).toBe("https://msds.kosha.or.kr/");
    expect(r.chemId, `${r.id} chem_id 6자리`).toMatch(/^\d{6}$/);
  }
  // 첫 화면 주소인 데모 seed 시약은 빠짐없이 바꾼다 (요약 체험 — d7 §26 (8))
  const firstPage = [...seed].filter(([, v]) => v.school === DEMO_SCHOOL_ID && v.url === "https://msds.kosha.or.kr/").map(([id]) => id).sort();
  expect(rows.map((r) => r.id).sort(), "첫 화면 주소인 데모 시약 전부").toEqual(firstPage);

  // 새 주소 꼴 = d7 §22 공단 상세 주소 + chem_id (+ viewType=msds)
  const urlExpr = /set\s+msds_url\s*=\s*'([^']+)'\s*\|\|\s*m\.chem_id\s*\|\|\s*'([^']*)'/i.exec(st);
  expect(urlExpr, "msds_url = '…chem_id=' || m.chem_id || '…'").not.toBeNull();
  expect(urlExpr![1]).toBe(`${KOSHA_DETAIL}?chem_id=`);
  expect(urlExpr![2]).toBe("&viewType=msds");
});

test(`[GM-db][S16g] 마이그레이션 ${MIGRATION} 순서: 데모 seed 마이그레이션보다 뒤 · 파일 이름 꼴`, () => {
  expect(MIGRATION > DEMO_SEED).toBe(true);
  expect(MIGRATION).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
});

// ---------- 데모 MSDS 주소 (적용 후 상태 — anon RLS) ----------

test(`[GM-db][S16g] 적용 후: anon 이 읽는 데모 시약 msds_url = 마이그레이션의 공단 상세 주소 (chem_id 일치) · 데모 학교 행만`, async () => {
  test.setTimeout(60_000);
  const { rows } = migrationRows();
  const anon = anonClient();
  const { data, error } = await anon.from("reagents").select("id, school_id, msds_url").in("id", rows.map((r) => r.id));
  expect(error).toBeNull();
  const got = new Map((data ?? []).map((r) => [r.id as string, r]));
  expect((data ?? []).every((r) => r.school_id === DEMO_SCHOOL_ID), "anon = 데모 학교 행만").toBe(true);
  const notApplied: string[] = [];
  for (const r of rows) {
    const want = `${KOSHA_DETAIL}?chem_id=${r.chemId}&viewType=msds`;
    const row = got.get(r.id);
    expect(row, `${r.id} 데모 시약 보임`).toBeTruthy();
    if (row!.msds_url !== want) notApplied.push(`${r.id}: ${row!.msds_url}`);
  }
  expect(notApplied, `마이그레이션 ${MIGRATION} 적용 후 데모 시약 msds_url = 공단 상세 주소`).toEqual([]);
});
