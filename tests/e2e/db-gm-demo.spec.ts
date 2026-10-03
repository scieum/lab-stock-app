// [GM-db] 둘러보기(비회원) 데모 학교 — 실제 RLS (publishable/anon 키 + 각 계정 로그인). service role 미사용.
// 기준: harness/d5-gates.md GM-db, harness/d7-data.md §5, design/rules.json guest(school_name),
//       lib/supabase/demo-data.ts DEMO_SCHOOL_ID (마이그레이션 private.demo_school_id() 와 같은 고정값).
// - anon: schools 는 데모 학교 1행, 업무 테이블은 데모 학교 행만. 실제 학교(seed A·B) 행 0.
// - anon·로그인 사용자 모두 데모 학교 행 insert·update·delete·record_usage 거부 (값 불변 재확인).
// - 로그인 사용자는 데모 학교 행을 읽지 못한다 (자기 학교만 — N1). profiles.school_id 를 데모로 바꾸기 거부.
// 바꾼 데이터는 없다 (전부 거부되어야 하는 시도만 하고, 성공했다면 테스트가 실패한다).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import {
  ROLE_LABEL,
  SCHOOL_A_ROLES,
  SCHOOL_TABLES,
  anonClient,
  ownReagents,
  signIn,
  uniqueTag,
  type Role,
  type SchoolTable,
} from "./db-helpers";
test.describe.configure({ mode: "default" });

const rules = JSON.parse(readFileSync(join(process.cwd(), "design", "rules.json"), "utf8")) as {
  guest: { school_name: string };
};
const DEMO_NAME = rules.guest.school_name;

/**
 * 데모 학교 고정 id — lib/supabase/demo-data.ts 의 DEMO_SCHOOL_ID 를 읽는다.
 * (그 모듈은 `import "server-only"` 라서 Node 테스트에서 import 할 수 없어 소스 텍스트에서 뽑는다.)
 */
const DEMO_SCHOOL_ID = (() => {
  const src = readFileSync(join(process.cwd(), "lib", "supabase", "demo-data.ts"), "utf8");
  const m = src.match(/export const DEMO_SCHOOL_ID\s*=\s*"([0-9a-f-]{36})"/);
  if (!m) throw new Error("lib/supabase/demo-data.ts 에서 DEMO_SCHOOL_ID 를 찾지 못했습니다");
  return m[1];
})();

/** d7 §5: 데모 사용 기록의 사용자 이름은 "학생 A"·"교사 B" 처럼 가짜 */
const FAKE_USER_NAME = /^(학생|교사) [A-Z]$/;

const ALL_ROLES: Role[] = [...SCHOOL_A_ROLES, "schoolB"];

type Row = Record<string, unknown>;

/** anon 이 보는 데모 학교 행 (양성 대조군: ≥1행) */
async function demoRows(table: SchoolTable): Promise<Row[]> {
  const { data, error } = await anonClient().from(table).select("*").order("id");
  expect(error, `anon ${table} select`).toBeNull();
  expect((data ?? []).length, `anon ${table} 데모 학교 행 ≥1 (seed)`).toBeGreaterThan(0);
  return (data ?? []) as Row[];
}

async function demoRowById(table: SchoolTable, id: string): Promise<Row | null> {
  const { data, error } = await anonClient().from(table).select("*").eq("id", id).maybeSingle();
  expect(error, `anon ${table} ${id} 재조회`).toBeNull();
  return (data as Row | null) ?? null;
}

/** 첫 데모 시약 (id 순 고정 seed) */
async function demoReagent(): Promise<Row> {
  return (await demoRows("reagents"))[0];
}

/** 데모 학교 쓰기 시도에 쓰는 무해한 패치 (성공하면 안 되므로 값은 아무것이나) */
function demoPatch(table: SchoolTable): Row {
  switch (table) {
    case "reagents":
      return { name: "GM-db-침범" };
    case "usage_logs":
      return { amount: 999999 };
    case "cabinets":
      return { label: "GM-db-침범" };
    case "cabinet_slots":
      return { storage_class: "기타" };
  }
}

/** 바뀐 행 수: RLS 로 대상이 안 보이면 error 없이 0행, 정책 위반이면 오류 — 어느 쪽이든 0 이어야 한다 */
function changed(res: { error: unknown; data: unknown[] | null }): number {
  return res.error ? 0 : (res.data ?? []).length;
}

// ---------- anon 읽기: 데모 학교만 ----------

test(`[GM-db][S*] anon schools select = 데모 학교 1행 (name = guest.school_name, is_demo, 고정 id)`, async () => {
  const { data, error } = await anonClient().from("schools").select("id, name, is_demo, neis_code");
  expect(error).toBeNull();
  expect(data ?? []).toHaveLength(1);
  const s = data![0];
  expect(s.id).toBe(DEMO_SCHOOL_ID);
  expect(s.name).toBe(DEMO_NAME);
  expect(s.is_demo).toBe(true);
  expect(s.neis_code, "데모 학교는 NEIS 코드 없음 (가입 목록 제외)").toBeNull();
});

for (const table of SCHOOL_TABLES) {
  test(`[GM-db][S*] anon ${table} select 는 전부 데모 학교 행 (실제 학교 A·B 행 0)`, async () => {
    const a = await signIn("teacher");
    const b = await signIn("schoolB");
    const rows = await demoRows(table);
    const foreign = rows.filter((r) => r.school_id !== DEMO_SCHOOL_ID);
    expect(foreign, "데모 학교가 아닌 행").toHaveLength(0);

    for (const real of [a, b]) {
      expect(real.schoolId).not.toBe(DEMO_SCHOOL_ID);
      const bySchool = await anonClient().from(table).select("id").eq("school_id", real.schoolId);
      expect(bySchool.error).toBeNull();
      expect(bySchool.data ?? [], `anon → ${ROLE_LABEL[real.role]} 학교 ${table} school_id 필터`).toHaveLength(0);

      // 실제 학교 계정이 보는 자기 행 id 로 직접 조회해도 0행
      const own = await real.client.from(table).select("id");
      expect(own.error).toBeNull();
      const ownIds = (own.data ?? []).map((r) => r.id as string);
      expect(ownIds.length, `${ROLE_LABEL[real.role]} 자기 학교 ${table} 양성 대조군`).toBeGreaterThan(0);
      // id 목록은 나눠서 보낸다 (usage_logs 는 지울 수 없어 계속 늘고, 한 번에 보내면 URL 이 서버 한도 16KB 를 넘는다)
      for (let i = 0; i < ownIds.length; i += 80) {
        const byId = await anonClient().from(table).select("id").in("id", ownIds.slice(i, i + 80));
        expect(byId.error).toBeNull();
        expect(byId.data ?? [], `anon → ${ROLE_LABEL[real.role]} 학교 ${table} id 직접 조회`).toHaveLength(0);
      }
    }
  });
}

test(`[GM-db][S*] anon 데모 usage_logs 는 user_id 없음·demo_user_name 가짜 이름 (d7 §5)`, async () => {
  const rows = await demoRows("usage_logs");
  for (const r of rows) {
    expect(r.user_id, `usage_logs ${r.id} user_id`).toBeNull();
    expect(String(r.demo_user_name ?? ""), `usage_logs ${r.id} demo_user_name`).toMatch(FAKE_USER_NAME);
  }
});

test(`[GM-db][S*] anon demo_recent_usage·demo_reagent_usage 성공, user_name 은 가짜 이름`, async () => {
  const anon = anonClient();
  const recent = await anon.rpc("demo_recent_usage", { p_limit: 3 });
  expect(recent.error, `demo_recent_usage: ${recent.error?.message}`).toBeNull();
  const recentRows = (recent.data ?? []) as Row[];
  expect(recentRows.length).toBeGreaterThan(0);
  for (const u of recentRows) expect(String(u.user_name ?? "")).toMatch(FAKE_USER_NAME);

  // 사용 기록이 있는 데모 시약 하나로 상세 사용 기록
  const logs = await demoRows("usage_logs");
  const reagentId = logs[0].reagent_id as string;
  const usage = await anon.rpc("demo_reagent_usage", { p_reagent_id: reagentId, p_limit: 5 });
  expect(usage.error, `demo_reagent_usage: ${usage.error?.message}`).toBeNull();
  const usageRows = (usage.data ?? []) as Row[];
  expect(usageRows.length).toBeGreaterThan(0);
  for (const u of usageRows) expect(String(u.user_name ?? "")).toMatch(FAKE_USER_NAME);
});

test(`[GM-db][S*] anon 은 로그인용 recent_usage 호출 거부 (42501)`, async () => {
  const { data, error } = await anonClient().rpc("recent_usage", { p_limit: 3 });
  expect(error, "anon recent_usage 는 오류여야 함").not.toBeNull();
  expect(error?.code, error?.message).toBe("42501");
  expect(data ?? null).toBeNull();
});

// ---------- anon 쓰기: 전부 거부 ----------

test(`[GM-db][S*] anon 데모 reagents insert 거부 (42501)`, async ({}, info) => {
  const name = `GM-${uniqueTag(info)}`;
  const res = await anonClient()
    .from("reagents")
    .insert({ school_id: DEMO_SCHOOL_ID, name, unit: "g", stock: 1, min_stock: 0 })
    .select("id");
  expect(res.error, "anon 데모 reagents insert 는 오류여야 함").not.toBeNull();
  expect(res.error?.code, res.error?.message).toBe("42501");
  const leaked = await anonClient().from("reagents").select("id").eq("name", name);
  expect(leaked.data ?? []).toHaveLength(0);
});

for (const table of SCHOOL_TABLES) {
  test(`[GM-db][S*] anon 데모 ${table} update·delete 0행 (값 불변)`, async () => {
    const target = (await demoRows(table))[0];
    const id = target.id as string;

    const upd = await anonClient().from(table).update(demoPatch(table)).eq("id", id).select("id");
    expect(changed(upd), "anon update 로 바뀐 행").toBe(0);
    const updBySchool = await anonClient().from(table).update(demoPatch(table)).eq("school_id", DEMO_SCHOOL_ID).select("id");
    expect(changed(updBySchool), "anon school_id 필터 update 로 바뀐 행").toBe(0);

    const del = await anonClient().from(table).delete().eq("id", id).select("id");
    expect(changed(del), "anon delete 로 지워진 행").toBe(0);

    const after = await demoRowById(table, id);
    expect(after, "행이 그대로 있어야 함").not.toBeNull();
    expect(after).toEqual(target);
  });
}

test(`[GM-db][S*] anon 데모 usage_logs insert 거부`, async () => {
  const r = await demoReagent();
  const before = (await demoRows("usage_logs")).length;
  const res = await anonClient()
    .from("usage_logs")
    .insert({ school_id: DEMO_SCHOOL_ID, reagent_id: r.id, user_id: null, demo_user_name: "학생 Z", amount: 1 })
    .select("id");
  expect(res.error, "anon 데모 usage_logs insert 는 오류여야 함").not.toBeNull();
  expect(res.error?.code, res.error?.message).toBe("42501");
  expect((await demoRows("usage_logs")).length).toBe(before);
});

test(`[GM-db][S*] anon 데모 시약 record_usage 거부 (stock·기록 불변)`, async () => {
  const r = await demoReagent();
  const logsBefore = (await demoRows("usage_logs")).length;
  const res = await anonClient().rpc("record_usage", { reagent_id: r.id, amount: 1 });
  expect(res.error, "anon record_usage 는 오류여야 함").not.toBeNull();
  expect(res.error?.code, res.error?.message).toBe("42501");
  const after = await demoRowById("reagents", r.id as string);
  expect(Number(after?.stock)).toBe(Number(r.stock));
  expect((await demoRows("usage_logs")).length).toBe(logsBefore);
});

// ---------- 로그인 사용자: 데모 학교 읽기 0행·쓰기 거부, 자기 학교는 그대로 ----------

for (const role of ALL_ROLES) {
  for (const table of SCHOOL_TABLES) {
    test(`[N1-db][S*] ${ROLE_LABEL[role]}로 데모 학교 ${table} 조회 0행`, async () => {
      const s = await signIn(role);
      expect(s.schoolId).not.toBe(DEMO_SCHOOL_ID);
      const demoIds = (await demoRows(table)).map((r) => r.id as string);

      const bySchool = await s.client.from(table).select("id").eq("school_id", DEMO_SCHOOL_ID);
      expect(bySchool.error).toBeNull();
      expect(bySchool.data ?? []).toHaveLength(0);

      const byId = await s.client.from(table).select("id").in("id", demoIds);
      expect(byId.error).toBeNull();
      expect(byId.data ?? []).toHaveLength(0);

      const all = await s.client.from(table).select("id, school_id");
      expect(all.error).toBeNull();
      expect((all.data ?? []).filter((r) => r.school_id !== s.schoolId)).toHaveLength(0);
    });

    test(`[GM-db][S*] ${ROLE_LABEL[role]}로 데모 학교 ${table} update·delete 0행 (값 불변)`, async () => {
      const s = await signIn(role);
      const target = (await demoRows(table))[0];
      const id = target.id as string;

      const upd = await s.client.from(table).update(demoPatch(table)).eq("id", id).select("id");
      expect(changed(upd), "update 로 바뀐 행").toBe(0);
      const updBySchool = await s.client.from(table).update(demoPatch(table)).eq("school_id", DEMO_SCHOOL_ID).select("id");
      expect(changed(updBySchool), "school_id 필터 update 로 바뀐 행").toBe(0);
      const del = await s.client.from(table).delete().eq("id", id).select("id");
      expect(changed(del), "delete 로 지워진 행").toBe(0);

      const after = await demoRowById(table, id);
      expect(after).not.toBeNull();
      expect(after).toEqual(target);
    });
  }

  test(`[GM-db][S*] ${ROLE_LABEL[role]}로 데모 학교 school_id 로 reagents insert 거부`, async ({}, info) => {
    const s = await signIn(role);
    const name = `GM-${uniqueTag(info)}`;
    const res = await s.client
      .from("reagents")
      .insert({ school_id: DEMO_SCHOOL_ID, name, unit: "g", stock: 1, min_stock: 0 })
      .select("id");
    expect(res.error, "데모 school_id insert 는 오류여야 함").not.toBeNull();
    expect(res.error?.code, res.error?.message).toBe("42501");
    const leaked = await anonClient().from("reagents").select("id").eq("name", name);
    expect(leaked.data ?? []).toHaveLength(0);
  });

  test(`[GM-db][S*] ${ROLE_LABEL[role]}로 데모 학교 usage_logs insert 거부`, async () => {
    const s = await signIn(role);
    const r = await demoReagent();
    const before = (await demoRows("usage_logs")).length;
    const withUser = await s.client
      .from("usage_logs")
      .insert({ school_id: DEMO_SCHOOL_ID, reagent_id: r.id, user_id: s.userId, amount: 1 })
      .select("id");
    expect(withUser.error, "자기 user_id 로 데모 usage_logs insert 는 오류여야 함").not.toBeNull();
    const asDemo = await s.client
      .from("usage_logs")
      .insert({ school_id: DEMO_SCHOOL_ID, reagent_id: r.id, user_id: null, demo_user_name: "학생 Z", amount: 1 })
      .select("id");
    expect(asDemo.error, "가짜 이름으로 데모 usage_logs insert 는 오류여야 함").not.toBeNull();
    expect((await demoRows("usage_logs")).length).toBe(before);
  });

  test(`[GM-db][S*] ${ROLE_LABEL[role]}로 데모 시약 record_usage 거부 (stock·기록 불변)`, async () => {
    const s = await signIn(role);
    const r = await demoReagent();
    const logsBefore = (await demoRows("usage_logs")).length;
    const res = await s.client.rpc("record_usage", { reagent_id: r.id, amount: 1 });
    expect(res.error, "데모 시약 record_usage 는 오류여야 함").not.toBeNull();
    const after = await demoRowById("reagents", r.id as string);
    expect(Number(after?.stock)).toBe(Number(r.stock));
    expect((await demoRows("usage_logs")).length).toBe(logsBefore);
  });

  test(`[GM-db][S*] ${ROLE_LABEL[role]} profiles.school_id 를 데모 학교로 바꾸기 거부`, async () => {
    const s = await signIn(role);
    const res = await s.client
      .from("profiles")
      .update({ school_id: DEMO_SCHOOL_ID })
      .eq("user_id", s.userId)
      .select("user_id");
    expect(changed(res), "school_id 변경으로 바뀐 행").toBe(0);
    const after = await s.client.from("profiles").select("school_id").eq("user_id", s.userId).single();
    expect(after.error).toBeNull();
    expect(after.data?.school_id).toBe(s.schoolId);
  });

  test(`[GM-db][S*] ${ROLE_LABEL[role]} 자기 학교 읽기는 그대로 (schools 1행·reagents ≥1, 데모 학교 아님)`, async () => {
    const s = await signIn(role);
    const schools = await s.client.from("schools").select("id, name, is_demo");
    expect(schools.error).toBeNull();
    expect(schools.data ?? []).toHaveLength(1);
    expect(schools.data![0].id).toBe(s.schoolId);
    expect(schools.data![0].is_demo).toBe(false);
    expect(schools.data![0].name).not.toBe(DEMO_NAME);
    const reagents = await ownReagents(s);
    expect(reagents.length).toBeGreaterThan(0);
    expect(reagents.filter((r) => r.school_id !== s.schoolId)).toHaveLength(0);
  });
}

test(`[GM-db][S*] admin 이 같은 학교 다른 사용자의 profiles.school_id 를 데모 학교로 바꾸기 거부`, async () => {
  const admin = await signIn("admin");
  const st = await signIn("student");
  expect(admin.schoolId).toBe(st.schoolId);
  const res = await admin.client
    .from("profiles")
    .update({ school_id: DEMO_SCHOOL_ID })
    .eq("user_id", st.userId)
    .select("user_id");
  expect(changed(res), "admin 의 school_id 변경으로 바뀐 행").toBe(0);
  const after = await st.client.from("profiles").select("school_id").eq("user_id", st.userId).single();
  expect(after.error).toBeNull();
  expect(after.data?.school_id).toBe(st.schoolId);
});

test(`[GM-db][S*] anon·로그인 사용자 register_profile(데모 학교 연결 시도) 호출 거부 (42501)`, async () => {
  const st = await signIn("student");
  const args = {
    p_user_id: st.userId,
    p_neis_code: "DEMO",
    p_office_code: "DEMO",
    p_school_name: DEMO_NAME,
    p_sido: "데모",
    p_region: "데모",
    p_display_name: "GM-db",
  };
  for (const [label, client] of [["anon", anonClient()], [ROLE_LABEL.student, st.client]] as const) {
    const { data, error } = await client.rpc("register_profile", args);
    expect(error, `${label} register_profile 은 오류여야 함`).not.toBeNull();
    expect(error?.code, `${label}: ${error?.message}`).toBe("42501");
    expect(data ?? null).toBeNull();
  }
  // 데모 학교에 profiles 가 생기지 않았고, 학생 소속도 그대로
  const after = await st.client.from("profiles").select("school_id").eq("user_id", st.userId).single();
  expect(after.data?.school_id).toBe(st.schoolId);
});
