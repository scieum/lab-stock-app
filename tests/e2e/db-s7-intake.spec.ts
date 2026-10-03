// [R-db][S7] · [N1-db][S7] · [GM-db][S*] 입고·시약 등록 (화면 7) DB 권한 — 실제 RLS·함수 (anon 키 + 각 계정 로그인).
// service role 미사용.
// 기준: harness/d7-data.md §1(intake_logs)·§2·§5·§6, harness/d5-gates.md R-db·N1-db·GM-db,
//       design/rules.json cabinet.storage_classes ("종류" 8종).
//
// 운영 DB 이므로 테스트 학교(A·B)에서만 쓴다:
// - record_intake 는 seed 시약이 아니라 이 스펙이 만든 임시 시약(이름 `R-db-S7-test-{project}-…`)에만 호출한다
//   → 다른 스펙이 보는 seed 시약의 stock 을 건드리지 않고, 임시 시약을 지우면 intake_logs 도 cascade 로 지워진다.
// - register_reagent 로 만든 시약도 같은 접두사 이름이고 테스트 끝에 지운다.
// - afterAll 에서 이 프로젝트(mobile/desktop) 접두사의 임시 시약을 한 번 더 쓸어 낸다 (테스트가 중간에 실패한 경우 대비).
// - 데모 학교·실사용 학교에는 "거부되어야 하는 시도"만 한다 (성공했다면 테스트가 실패한다).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type TestInfo } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ROLE_LABEL, anonClient, signIn, uniqueTag, type Role, type Session } from "./db-helpers";

test.describe.configure({ mode: "default" });

const rules = JSON.parse(readFileSync(join(process.cwd(), "design", "rules.json"), "utf8")) as {
  cabinet: { storage_classes: string[] };
};
/** 화면 7 "종류" = rules.json cabinet.storage_classes (d7 §6) */
const STORAGE_CLASSES = rules.cabinet.storage_classes;
/** d7 §6 단위: 병·mL·g */
const UNITS = ["병", "mL", "g"] as const;

const TEMP_PREFIX = "R-db-S7-";
const REAGENT_COLS = "id, school_id, name, cas_no, unit, stock, min_stock, msds_url, slot_id, intake_date, storage_class";
const LOG_COLS = "id, school_id, reagent_id, user_id, amount, intake_date, created_at";

type Row = Record<string, unknown>;
type RpcResult = { data: unknown; error: { code?: string; message: string } | null };

function tempName(info: TestInfo): string {
  return `${TEMP_PREFIX}${uniqueTag(info)}`;
}

function firstRow(data: unknown): Row | null {
  if (Array.isArray(data)) return (data[0] as Row | undefined) ?? null;
  return (data as Row | null) ?? null;
}

/**
 * DB 가 거부했는지: 오류가 있고, 그 오류가 PostgREST 의 "함수·인자 못 찾음"(PGRST…)이 아니다.
 * (인자 이름이 틀려서 나는 오류로 "거부" 테스트가 통과하는 일을 막는다. 인자 형태는 성공 테스트가 대조군.)
 */
function expectRejected(res: RpcResult, what: string): void {
  expect(res.error, `${what} 는 오류여야 함`).not.toBeNull();
  expect(String(res.error?.code ?? ""), `${what}: ${res.error?.message}`).not.toMatch(/^PGRST/);
  expect(firstRow(res.data), `${what} 반환 행`).toBeNull();
}

/** 바뀐 행 수: RLS 로 안 보이면 error 없이 0행, 권한이 없으면 오류 — 어느 쪽이든 0 이어야 한다 */
function changed(res: { error: unknown; data: unknown[] | null }): number {
  return res.error ? 0 : (res.data ?? []).length;
}

/** staff 계정이 자기 학교에 임시 시약을 직접 만든다 (입고 대상). stock 10, intake_date 없음. */
async function tempReagent(staff: Session, info: TestInfo): Promise<Row> {
  const r = await staff.client
    .from("reagents")
    .insert({ school_id: staff.schoolId, name: tempName(info), unit: "g", stock: 10, min_stock: 0 })
    .select(REAGENT_COLS)
    .single();
  expect(r.error, `${ROLE_LABEL[staff.role]} 임시 시약 생성: ${r.error?.message}`).toBeNull();
  return r.data as Row;
}

async function dropReagent(staff: Session, id: string): Promise<void> {
  const r = await staff.client.from("reagents").delete().eq("id", id).select("id");
  expect(r.error, `임시 시약 삭제: ${r.error?.message}`).toBeNull();
  expect(r.data ?? [], "임시 시약 삭제 행 수").toHaveLength(1);
}

async function readReagent(s: Session, id: string): Promise<Row | null> {
  const r = await s.client.from("reagents").select(REAGENT_COLS).eq("id", id).maybeSingle();
  expect(r.error, `시약 재조회: ${r.error?.message}`).toBeNull();
  return (r.data as Row | null) ?? null;
}

async function logsOf(s: Session, reagentId: string): Promise<Row[]> {
  const r = await s.client.from("intake_logs").select(LOG_COLS).eq("reagent_id", reagentId).order("created_at");
  expect(r.error, `intake_logs 조회(${ROLE_LABEL[s.role]}): ${r.error?.message}`).toBeNull();
  return (r.data ?? []) as Row[];
}

async function reagentsByName(s: Session, name: string): Promise<Row[]> {
  const r = await s.client.from("reagents").select(REAGENT_COLS).eq("name", name);
  expect(r.error, `시약 이름 조회: ${r.error?.message}`).toBeNull();
  return (r.data ?? []) as Row[];
}

/** 거부되어야 할 register_reagent 가 혹시 성공했으면 만든 행을 지운다 (운영 DB 에 남기지 않는다) */
async function dropIfCreated(staff: Session, res: RpcResult): Promise<void> {
  const row = firstRow(res.data);
  if (row?.id) await staff.client.from("reagents").delete().eq("id", row.id as string);
}

function intakeArgs(reagentId: string, amount: unknown, date: unknown = "2026-09-15"): Row {
  return { p_reagent_id: reagentId, p_amount: amount, p_intake_date: date };
}

function registerArgs(name: unknown, over: Row = {}): Row {
  return {
    p_name: name,
    p_storage_class: STORAGE_CLASSES[0],
    p_stock: 5,
    p_unit: UNITS[0],
    p_intake_date: "2026-09-15",
    p_msds_url: null,
    ...over,
  };
}

async function rpc(client: SupabaseClient, fn: string, args: Row): Promise<RpcResult> {
  const res = await client.rpc(fn, args);
  return { data: res.data, error: res.error };
}

test.afterAll(async ({}, info) => {
  // 이 프로젝트가 만든 임시 시약 잔여물 정리 (intake_logs 는 cascade). 다른 프로젝트 것은 건드리지 않는다.
  for (const role of ["teacher", "schoolB"] as Role[]) {
    try {
      const s = await signIn(role);
      await s.client.from("reagents").delete().like("name", `${TEMP_PREFIX}test-${info.project.name}-%`);
    } catch {
      // 정리 실패는 보고용 잔여물 점검에서 드러난다
    }
  }
});

// ======================================================================
// R-db: 학생 거부
// ======================================================================

test(`[R-db][S7] 학생 record_intake 거부 (stock·intake_date·intake_logs 그대로)`, async ({}, info) => {
  const st = await signIn("student");
  const t = await signIn("teacher");
  expect(st.profileRole).toBe("student");
  expect(st.schoolId).toBe(t.schoolId);
  const r = await tempReagent(t, info);
  try {
    // 학생은 같은 학교 시약을 볼 수 있다 (거부 사유가 "안 보여서"가 아니라 역할)
    expect(await readReagent(st, r.id as string)).not.toBeNull();
    const res = await rpc(st.client, "record_intake", intakeArgs(r.id as string, 3));
    expectRejected(res, "학생 record_intake");
    expect(await readReagent(t, r.id as string)).toEqual(r);
    expect(await logsOf(t, r.id as string)).toHaveLength(0);
  } finally {
    await dropReagent(t, r.id as string);
  }
});

test(`[R-db][S7] 학생 register_reagent 거부 (reagents·intake_logs 행 없음)`, async ({}, info) => {
  const st = await signIn("student");
  const t = await signIn("teacher");
  const name = tempName(info);
  const res = await rpc(st.client, "register_reagent", registerArgs(name));
  const leaked = await reagentsByName(t, name);
  for (const row of leaked) await t.client.from("reagents").delete().eq("id", row.id as string);
  expectRejected(res, "학생 register_reagent");
  expect(leaked, "학생 register_reagent 로 생긴 시약").toHaveLength(0);
});

// ======================================================================
// R-db: 교사·admin 성공 (임시 시약, 끝나면 삭제)
// ======================================================================

for (const role of ["teacher", "admin"] as Role[]) {
  test(`[R-db][S7] ${ROLE_LABEL[role]} record_intake 성공: stock +amount·intake_date 갱신·intake_logs 1행`, async ({}, info) => {
    const s = await signIn(role);
    expect(s.profileRole).toBe(role);
    const r = await tempReagent(s, info);
    const id = r.id as string;
    const amount = 3;
    const date = "2026-09-21";
    try {
      const before = Number(r.stock);
      const res = await rpc(s.client, "record_intake", intakeArgs(id, amount, date));
      expect(res.error, `record_intake: ${res.error?.message}`).toBeNull();

      const after = await readReagent(s, id);
      expect(Number(after?.stock), "stock 은 정확히 amount 만큼 증가").toBe(before + amount);
      expect(after?.intake_date).toBe(date);
      // 입고가 바꾸는 것은 stock·intake_date 뿐
      expect({ ...after, stock: r.stock, intake_date: r.intake_date }).toEqual(r);

      const logs = await logsOf(s, id);
      expect(logs).toHaveLength(1);
      expect(logs[0].user_id).toBe(s.userId);
      expect(logs[0].school_id).toBe(s.schoolId);
      expect(logs[0].reagent_id).toBe(id);
      expect(Number(logs[0].amount)).toBe(amount);
      expect(logs[0].intake_date).toBe(date);

      // 함수 반환값 = 만든 intake_logs 행
      const returned = firstRow(res.data);
      expect(returned?.id).toBe(logs[0].id);

      // 두 번째 입고: 누적 증가, 로그 2행
      const date2 = "2026-09-25";
      const res2 = await rpc(s.client, "record_intake", intakeArgs(id, 1, date2));
      expect(res2.error, `record_intake 2회차: ${res2.error?.message}`).toBeNull();
      const after2 = await readReagent(s, id);
      expect(Number(after2?.stock)).toBe(before + amount + 1);
      expect(after2?.intake_date).toBe(date2);
      expect(await logsOf(s, id)).toHaveLength(2);
    } finally {
      await dropReagent(s, id);
    }
    // 원복 확인: 시약·입고 기록 모두 없음 (cascade)
    expect(await readReagent(s, id)).toBeNull();
    expect(await logsOf(s, id)).toHaveLength(0);
  });

  test(`[R-db][S7] ${ROLE_LABEL[role]} register_reagent 성공: reagents 1행(자기 학교·min_stock 0·slot_id null) + intake_logs 1행`, async ({}, info) => {
    const s = await signIn(role);
    const name = tempName(info);
    const storageClass = STORAGE_CLASSES[role === "teacher" ? 1 : STORAGE_CLASSES.length - 1];
    const unit = UNITS[role === "teacher" ? 1 : 2];
    const stock = role === "teacher" ? 7 : 1; // 1 = 허용 최솟값
    const date = "2026-09-18";
    const url = role === "teacher" ? "https://example.com/msds/r-db-s7.pdf" : null;
    const res = await rpc(s.client, "register_reagent", registerArgs(name, {
      p_storage_class: storageClass,
      p_stock: stock,
      p_unit: unit,
      p_intake_date: date,
      p_msds_url: url,
    }));
    const rows = await reagentsByName(s, name);
    try {
      expect(res.error, `register_reagent: ${res.error?.message}`).toBeNull();
      expect(rows, "등록된 시약 행 수").toHaveLength(1);
      const row = rows[0];
      expect(row.school_id).toBe(s.schoolId);
      expect(row.name).toBe(name);
      expect(row.storage_class).toBe(storageClass);
      expect(row.unit).toBe(unit);
      expect(Number(row.stock)).toBe(stock);
      expect(Number(row.min_stock)).toBe(0);
      expect(row.slot_id).toBeNull();
      expect(row.cas_no).toBeNull();
      expect(row.intake_date).toBe(date);
      expect(row.msds_url).toBe(url);
      expect(firstRow(res.data)?.id, "함수 반환값 = 만든 reagents 행").toBe(row.id);

      const logs = await logsOf(s, row.id as string);
      expect(logs).toHaveLength(1);
      expect(logs[0].user_id).toBe(s.userId);
      expect(logs[0].school_id).toBe(s.schoolId);
      expect(Number(logs[0].amount), "첫 재고 = intake_logs.amount").toBe(stock);
      expect(logs[0].intake_date).toBe(date);
    } finally {
      for (const row of rows) await dropReagent(s, row.id as string);
    }
    expect(await reagentsByName(s, name)).toHaveLength(0);
  });
}

test(`[R-db][S7] register_reagent 는 종류 ${STORAGE_CLASSES.length}종·단위 ${UNITS.length}종을 모두 그대로 저장`, async ({}, info) => {
  const t = await signIn("teacher");
  const created: string[] = [];
  try {
    const n = Math.max(STORAGE_CLASSES.length, UNITS.length);
    for (let i = 0; i < n; i++) {
      const sc = STORAGE_CLASSES[i % STORAGE_CLASSES.length];
      const unit = UNITS[i % UNITS.length];
      const res = await rpc(t.client, "register_reagent", registerArgs(tempName(info), { p_storage_class: sc, p_unit: unit }));
      const row = firstRow(res.data);
      if (row?.id) created.push(row.id as string);
      expect(res.error, `종류 ${sc}·단위 ${unit}: ${res.error?.message}`).toBeNull();
      const saved = await readReagent(t, row!.id as string);
      expect(saved?.storage_class).toBe(sc);
      expect(saved?.unit).toBe(unit);
    }
  } finally {
    for (const id of created) await dropReagent(t, id);
  }
});

// ======================================================================
// R-db: 입력 검증 (교사 계정 — 역할이 아니라 값 때문에 거부)
// ======================================================================

const BAD_AMOUNTS: [string, unknown][] = [
  ["0", 0],
  ["음수 -1", -1],
  ["1 미만 0.5", 0.5],
  ["null", null],
];

for (const [label, amount] of BAD_AMOUNTS) {
  test(`[R-db][S7] 교사 record_intake amount ${label} 거부 (stock·intake_logs 그대로)`, async ({}, info) => {
    const t = await signIn("teacher");
    const r = await tempReagent(t, info);
    try {
      const res = await rpc(t.client, "record_intake", intakeArgs(r.id as string, amount));
      expectRejected(res, `record_intake amount ${label}`);
      expect(await readReagent(t, r.id as string)).toEqual(r);
      expect(await logsOf(t, r.id as string)).toHaveLength(0);
    } finally {
      await dropReagent(t, r.id as string);
    }
  });
}

const BAD_REGISTER: [string, Row][] = [
  ["storage_class 8종 밖", { p_storage_class: "R-db-없는분류" }],
  ["storage_class 빈 값", { p_storage_class: "" }],
  ["storage_class null (필수)", { p_storage_class: null }],
  ["unit kg (병·mL·g 밖)", { p_unit: "kg" }],
  ["unit L (병·mL·g 밖)", { p_unit: "L" }],
  ["unit 빈 값", { p_unit: "" }],
  ["unit null", { p_unit: null }],
  ["stock 0", { p_stock: 0 }],
  ["stock 음수", { p_stock: -1 }],
  ["stock 1 미만 0.5", { p_stock: 0.5 }],
  ["stock null", { p_stock: null }],
  ["msds_url javascript:", { p_msds_url: "javascript:alert(1)" }],
  ["msds_url JaVaScRiPt: (대소문자 섞음)", { p_msds_url: "JaVaScRiPt:alert(1)" }],
  ["msds_url data:", { p_msds_url: "data:text/html,<script>alert(1)</script>" }],
  ["msds_url ftp:", { p_msds_url: "ftp://example.com/msds.pdf" }],
  ["msds_url 스킴 없음", { p_msds_url: "example.com/msds.pdf" }],
  ["msds_url 안에 http 가 있지만 javascript: 로 시작", { p_msds_url: "javascript:location='https://example.com'" }],
];

for (const [label, over] of BAD_REGISTER) {
  test(`[R-db][S7] 교사 register_reagent ${label} 거부 (행 없음)`, async ({}, info) => {
    const t = await signIn("teacher");
    const name = tempName(info);
    const res = await rpc(t.client, "register_reagent", registerArgs(name, over));
    const leaked = await reagentsByName(t, name);
    for (const row of leaked) await t.client.from("reagents").delete().eq("id", row.id as string);
    expectRejected(res, `register_reagent ${label}`);
    expect(leaked, "거부된 등록으로 생긴 시약").toHaveLength(0);
  });
}

const BAD_NAMES: [string, unknown][] = [
  ["빈 문자열", ""],
  ["공백만", "   "],
  ["null", null],
];

for (const [label, name] of BAD_NAMES) {
  test(`[R-db][S7] 교사 register_reagent 이름 ${label} 거부 (행 없음)`, async () => {
    const t = await signIn("teacher");
    const blank = async (): Promise<number> => {
      const all = await t.client.from("reagents").select("id, name");
      expect(all.error).toBeNull();
      return (all.data ?? []).filter((r) => String(r.name ?? "").trim() === "").length;
    };
    const before = await blank();
    const res = await rpc(t.client, "register_reagent", registerArgs(name));
    await dropIfCreated(t, res);
    expectRejected(res, `register_reagent 이름 ${label}`);
    expect(await blank(), "이름이 빈 시약 수").toBe(before);
  });
}

// ======================================================================
// N1-db: 학교 분리
// ======================================================================

test(`[N1-db][S7] register_reagent 에 school_id 를 넘길 방법이 없다 (p_school_id·school_id 인자 거부, 어느 학교에도 행 없음)`, async ({}, info) => {
  const t = await signIn("teacher");
  const b = await signIn("schoolB");
  expect(t.schoolId).not.toBe(b.schoolId);
  for (const key of ["p_school_id", "school_id"]) {
    const name = tempName(info);
    const res = await rpc(t.client, "register_reagent", { ...registerArgs(name), [key]: b.schoolId });
    const inA = await reagentsByName(t, name);
    const inB = await reagentsByName(b, name);
    for (const row of inA) await t.client.from("reagents").delete().eq("id", row.id as string);
    for (const row of inB) await b.client.from("reagents").delete().eq("id", row.id as string);
    expect(res.error, `${key} 인자를 받는 register_reagent 는 없어야 함`).not.toBeNull();
    expect(inA, `${key}: 학교 A 에 생긴 행`).toHaveLength(0);
    expect(inB, `${key}: 학교 B 에 생긴 행`).toHaveLength(0);
  }
});

test(`[N1-db][S7] 학교B 교사 register_reagent 는 학교 B 에만 생긴다 (학교 A 에서 reagents·intake_logs 0행)`, async ({}, info) => {
  const b = await signIn("schoolB");
  const name = tempName(info);
  const res = await rpc(b.client, "register_reagent", registerArgs(name));
  const rows = await reagentsByName(b, name);
  try {
    expect(res.error, `register_reagent: ${res.error?.message}`).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows[0].school_id).toBe(b.schoolId);
    const id = rows[0].id as string;
    expect(await logsOf(b, id), "학교 B 자기 intake_logs (양성 대조군)").toHaveLength(1);
    for (const role of ["student", "teacher", "admin"] as Role[]) {
      const a = await signIn(role);
      expect(await reagentsByName(a, name), `${ROLE_LABEL[role]} 이름 조회`).toHaveLength(0);
      expect(await readReagent(a, id), `${ROLE_LABEL[role]} id 조회`).toBeNull();
      expect(await logsOf(a, id), `${ROLE_LABEL[role]} intake_logs`).toHaveLength(0);
    }
  } finally {
    for (const row of rows) await dropReagent(b, row.id as string);
  }
});

const CROSS: { attacker: Role; owner: Role; ownerSchool: string }[] = [
  { attacker: "schoolB", owner: "teacher", ownerSchool: "학교 A" },
  { attacker: "teacher", owner: "schoolB", ownerSchool: "학교 B" },
  { attacker: "admin", owner: "schoolB", ownerSchool: "학교 B" },
];

for (const { attacker, owner, ownerSchool } of CROSS) {
  test(`[N1-db][S7] ${ROLE_LABEL[attacker]}로 ${ownerSchool} 시약 record_intake 거부 (stock·intake_logs 그대로)`, async ({}, info) => {
    const a = await signIn(attacker);
    const o = await signIn(owner);
    expect(a.schoolId).not.toBe(o.schoolId);
    expect(["teacher", "admin"], "공격자는 staff (거부 사유가 역할이 아니라 학교)").toContain(a.profileRole);
    const r = await tempReagent(o, info);
    try {
      const res = await rpc(a.client, "record_intake", intakeArgs(r.id as string, 4));
      expectRejected(res, `${ROLE_LABEL[attacker]} → ${ownerSchool} record_intake`);
      expect(await readReagent(o, r.id as string)).toEqual(r);
      expect(await logsOf(o, r.id as string)).toHaveLength(0);
      expect(await logsOf(a, r.id as string)).toHaveLength(0);
    } finally {
      await dropReagent(o, r.id as string);
    }
  });
}

test(`[N1-db][S7] intake_logs select 는 같은 학교만: 학교A 학생·교사·admin 1행, 학교B 교사 0행, anon 0행`, async ({}, info) => {
  const t = await signIn("teacher");
  const b = await signIn("schoolB");
  const r = await tempReagent(t, info);
  const id = r.id as string;
  try {
    const made = await rpc(t.client, "record_intake", intakeArgs(id, 2));
    expect(made.error, `대조군 record_intake: ${made.error?.message}`).toBeNull();
    const own = await logsOf(t, id);
    expect(own, "학교 A 교사 (양성 대조군)").toHaveLength(1);
    for (const role of ["student", "admin"] as Role[]) {
      expect(await logsOf(await signIn(role), id), ROLE_LABEL[role]).toHaveLength(1);
    }

    // 학교 B 교사: reagent_id·school_id·id 필터 모두 0행, 전체 조회에도 다른 학교 행 없음
    expect(await logsOf(b, id)).toHaveLength(0);
    const bySchool = await b.client.from("intake_logs").select("id").eq("school_id", t.schoolId);
    expect(bySchool.error).toBeNull();
    expect(bySchool.data ?? []).toHaveLength(0);
    const byId = await b.client.from("intake_logs").select("id").eq("id", own[0].id as string);
    expect(byId.error).toBeNull();
    expect(byId.data ?? []).toHaveLength(0);
    const all = await b.client.from("intake_logs").select("id, school_id");
    expect(all.error).toBeNull();
    expect((all.data ?? []).filter((x) => x.school_id !== b.schoolId)).toHaveLength(0);

    // anon: 권한 오류든 0행이든 읽은 행은 0
    const anon = anonClient();
    for (const q of [
      anon.from("intake_logs").select("id"),
      anon.from("intake_logs").select("id").eq("reagent_id", id),
      anon.from("intake_logs").select("id").eq("school_id", t.schoolId),
    ]) {
      const res = await q;
      expect(res.error ? [] : res.data ?? [], "anon intake_logs").toHaveLength(0);
    }
  } finally {
    await dropReagent(t, id);
  }
});

test(`[N1-db][S7] anon 은 record_intake·register_reagent 호출 불가 (학교 A 시약·행 그대로)`, async ({}, info) => {
  const t = await signIn("teacher");
  const anon = anonClient();
  const r = await tempReagent(t, info);
  try {
    const intake = await rpc(anon, "record_intake", intakeArgs(r.id as string, 2));
    expectRejected(intake, "anon record_intake");
    expect(await readReagent(t, r.id as string)).toEqual(r);
    expect(await logsOf(t, r.id as string)).toHaveLength(0);
  } finally {
    await dropReagent(t, r.id as string);
  }
  const name = tempName(info);
  const reg = await rpc(anon, "register_reagent", registerArgs(name));
  expectRejected(reg, "anon register_reagent");
  expect(await reagentsByName(t, name)).toHaveLength(0);
  const seen = await anon.from("reagents").select("id").eq("name", name);
  expect(seen.error ? [] : seen.data ?? [], "anon 이 보는(데모 학교) 시약에도 없음").toHaveLength(0);
});

// intake_logs 는 함수로만 쓴다 — 직접 insert·update·delete 는 모든 역할 거부 (d7 §6)
const DIRECT_WRITERS: (Role | "anon")[] = ["student", "teacher", "admin", "schoolB", "anon"];

for (const who of DIRECT_WRITERS) {
  const label = who === "anon" ? "anon" : ROLE_LABEL[who];
  const rule = who === "schoolB" || who === "anon" ? "N1-db" : "R-db";
  test(`[${rule}][S7] ${label} intake_logs 직접 insert·update·delete 거부 (행 그대로)`, async ({}, info) => {
    const t = await signIn("teacher");
    const actor = who === "anon" ? null : await signIn(who);
    const client = actor ? actor.client : anonClient();
    const r = await tempReagent(t, info);
    const id = r.id as string;
    try {
      const made = await rpc(t.client, "record_intake", intakeArgs(id, 2));
      expect(made.error, `대조군 record_intake: ${made.error?.message}`).toBeNull();
      const before = await logsOf(t, id);
      expect(before).toHaveLength(1);
      const logId = before[0].id as string;

      // insert: 학교 A 시약에 대해 (자기 user_id / 교사 user_id 두 가지)
      for (const userId of [actor?.userId ?? t.userId, t.userId]) {
        const ins = await client
          .from("intake_logs")
          .insert({ school_id: t.schoolId, reagent_id: id, user_id: userId, amount: 1, intake_date: "2026-09-15" })
          .select("id");
        expect(ins.error, `${label} intake_logs insert 는 오류여야 함`).not.toBeNull();
      }
      // 자기 학교 school_id 로도 (학교 B 교사가 자기 학교 id 를 붙여 학교 A 시약에 넣는 경우 포함)
      if (actor) {
        const ins = await client
          .from("intake_logs")
          .insert({ school_id: actor.schoolId, reagent_id: id, user_id: actor.userId, amount: 1, intake_date: "2026-09-15" })
          .select("id");
        expect(ins.error, `${label} 자기 school_id intake_logs insert 는 오류여야 함`).not.toBeNull();
      }

      const upd = await client.from("intake_logs").update({ amount: 999999 }).eq("id", logId).select("id");
      expect(changed(upd), `${label} update 로 바뀐 행`).toBe(0);
      const updAll = await client.from("intake_logs").update({ amount: 999999 }).eq("reagent_id", id).select("id");
      expect(changed(updAll), `${label} reagent_id 필터 update 로 바뀐 행`).toBe(0);
      const del = await client.from("intake_logs").delete().eq("id", logId).select("id");
      expect(changed(del), `${label} delete 로 지워진 행`).toBe(0);

      expect(await logsOf(t, id), "intake_logs 는 그대로").toEqual(before);
      // 직접 쓰기 시도로 stock 이 바뀌지도 않았다
      expect(Number((await readReagent(t, id))?.stock)).toBe(Number(r.stock) + 2);
    } finally {
      await dropReagent(t, id);
    }
  });
}

// ======================================================================
// GM-db: 데모 학교는 입고·등록 불가 (d7 §5·§6)
// ======================================================================

/** anon 이 보는 데모 학교와 그 시약 (양성 대조군: 학교 1행·시약 ≥1행) */
async function demo(): Promise<{ schoolId: string; reagents: Row[] }> {
  const anon = anonClient();
  const schools = await anon.from("schools").select("id, is_demo");
  expect(schools.error).toBeNull();
  expect(schools.data ?? [], "anon 이 보는 학교 = 데모 학교 1행").toHaveLength(1);
  expect(schools.data![0].is_demo).toBe(true);
  const reagents = await anon.from("reagents").select("*").order("id");
  expect(reagents.error).toBeNull();
  expect((reagents.data ?? []).length, "데모 시약 ≥1 (seed)").toBeGreaterThan(0);
  return { schoolId: schools.data![0].id as string, reagents: (reagents.data ?? []) as Row[] };
}

for (const who of DIRECT_WRITERS) {
  const label = who === "anon" ? "anon" : ROLE_LABEL[who];
  test(`[GM-db][S*] ${label}로 데모 시약 record_intake 거부 (데모 reagents 전체 불변)`, async () => {
    const before = await demo();
    const actor = who === "anon" ? null : await signIn(who);
    const client = actor ? actor.client : anonClient();
    if (actor) expect(actor.schoolId).not.toBe(before.schoolId);
    const res = await rpc(client, "record_intake", intakeArgs(before.reagents[0].id as string, 1));
    expectRejected(res, `${label} 데모 시약 record_intake`);
    expect((await demo()).reagents).toEqual(before.reagents);
  });

  test(`[GM-db][S*] ${label}로 데모 학교 intake_logs 직접 insert 거부 (데모 reagents 불변)`, async () => {
    const before = await demo();
    const actor = who === "anon" ? null : await signIn(who);
    const client = actor ? actor.client : anonClient();
    const t = await signIn("teacher");
    const ins = await client
      .from("intake_logs")
      .insert({
        school_id: before.schoolId,
        reagent_id: before.reagents[0].id,
        user_id: actor?.userId ?? t.userId,
        amount: 1,
        intake_date: "2026-09-15",
      })
      .select("id");
    expect(ins.error, `${label} 데모 intake_logs insert 는 오류여야 함`).not.toBeNull();
    expect((await demo()).reagents).toEqual(before.reagents);
  });
}

test(`[GM-db][S*] register_reagent 로 데모 학교에 시약을 만들 수 없다 (anon 거부, 로그인 사용자는 인자로 데모 학교 지정 불가)`, async ({}, info) => {
  const before = await demo();
  const t = await signIn("teacher");

  const anonName = tempName(info);
  const anonRes = await rpc(anonClient(), "register_reagent", registerArgs(anonName));
  expectRejected(anonRes, "anon register_reagent");

  const name = tempName(info);
  const res = await rpc(t.client, "register_reagent", { ...registerArgs(name), p_school_id: before.schoolId });
  const leaked = await reagentsByName(t, name);
  for (const row of leaked) await t.client.from("reagents").delete().eq("id", row.id as string);
  expect(res.error, "p_school_id 인자를 받는 register_reagent 는 없어야 함").not.toBeNull();
  expect(leaked).toHaveLength(0);

  expect((await demo()).reagents, "데모 시약 목록 불변").toEqual(before.reagents);
});
