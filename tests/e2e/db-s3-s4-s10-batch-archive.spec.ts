// [R-db][S4] · [R-db][S3] · [R-db][S10] · [N1-db][S4] · [N1-db][S3] · [N1-db][S10] · [GM-db][S4] · [GM-db][S3]
// 여러 시약 사용 기록 · 시약 삭제(보관) · 수업 기록 (harness/d7-data.md §24, design/rules.json 1.25 usage_batch · reagent_delete · class_info)
// — 실제 RLS·함수 (publishable 키 + 각 계정 로그인 세션).
// 기준:
//   d7 §24 "저장 DB": record_usage_batch(p_items, p_used_on, p_memo, p_class_grade, p_class_no, p_class_subject) — 한 트랜잭션, 항목 1~30(같은 시약 중복 불가),
//     각 항목은 record_usage 와 같은 검사(자기 학교 · 보관 안 된 시약 · amount > 0 · 재고 이상 차감 금지 · 사용일 미래 금지 · 데모 거부),
//     하나라도 틀리면 전부 취소하고 문제 항목 번호를 오류에 담는다.
//   d7 §24 "수업 기록": class_grade · class_no · class_subject(20자) 모두 선택, 학년 = 학교급별(rules class_info.grades, 모르면 1~6), 반 1~20.
//   d7 §24 "삭제 DB = 보관": archive_reagent(p_reagent_id) — 교사·admin · 자기 학교 · 데모 거부, 보관 시약은 목록·상세 등에서 제외(RLS select),
//     칸 배치는 비움(slot_id null), 기록은 남고 화면 10 은 "삭제된 시약", 같은 이름 새 시약 등록 허용.
//   d7 §1 memo 200자 이하, §15 사용일(미래 거부 22008), §11-1 자동 재주문 기준(사용 기록이 쌓이면 다시 계산).
//   오류 코드 계약(42501 · 22023 · 22008 · P0002 · 22003, detail = 문제 항목 번호 1부터)은 오케스트레이터가 전달한 builder 계약
//   (supabase/migrations/20261010170000_usage_batch_archive_class.sql 머리말과 같음).
//
// 절대 규칙 (운영 DB):
// - 성공하는 쓰기는 일회용 학교 A'(admin·교사·학생) · B'(admin) · G'(학교급 확인용 admin)의 일회용 계정·임시 시약으로만 한다.
//   일회용 학교·계정은 service role 로 만든다(screen-8-helpers). G' 의 학교명 바꾸기(초·중·고·모름)도 service role 준비 단계.
// - 판정 대상 호출은 항상 로그인 세션(publishable 키). service role 은 준비·정리·대조 조회만.
// - 공용 학교 A·B·데모 에는 쓰지 않는다 (데모는 거부되어야 하는 호출만 — 앞뒤 전체 행 같음, 공용 학교에 일회용 계정의 기록·보관 0).
// - 정리 순서: usage_logs → intake_logs → 시약 → 시약장 → 프로필 → 계정 → 학교. 끝에 잔여물 0.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { test, expect, type TestInfo } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anonClient } from "./db-helpers";
import { autoFromUsage } from "./reorder-auto-helpers";
import { HAS_SERVICE, NO_RESIDUE, addMember, clientFor, profileByService, service, sweep, tempSchool, tempSchoolLike, type TempSchool, type TempUser } from "./screen-8-helpers";

test.describe.configure({ mode: "default" });

const GROUP = "batcharc";
const TIMEOUT = 300_000;
const NO_SERVICE_REASON = "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)";

// ---------- 기대값 원본 ----------
const ROOT = process.cwd();
const D7 = readFileSync(join(ROOT, "harness", "d7-data.md"), "utf8");
const section = (head: string) => {
  const s = D7.indexOf(head);
  if (s < 0) throw new Error(`d7 에 ${head} 없음`);
  const e = D7.indexOf("\n## ", s + 1);
  return D7.slice(s, e < 0 ? undefined : e);
};
const D7_24 = section("## 24.");
/** d7 §24 "항목 1~30" */
const ITEMS_RANGE = (() => {
  const m = /항목 (\d+)~(\d+)/.exec(D7_24);
  if (!m) throw new Error("d7 §24 에서 항목 범위를 읽지 못함");
  return [Number(m[1]), Number(m[2])] as const;
})();
/** d7 §1 usage_logs memo "200자 이하" */
const MEMO_MAX = Number((/memo\(null 허용, (\d+)자 이하\)/.exec(D7) ?? [])[1]);
type ClassInfoRules = { grades: Record<string, number[]>; classes: [number, number]; subject_max: number };
const RULES = JSON.parse(readFileSync(join(ROOT, "design", "rules.json"), "utf8")) as {
  class_info: ClassInfoRules;
  cabinet: { storage_classes: string[] };
};
const CLASS = RULES.class_info;
const [CLASS_MIN, CLASS_MAX] = CLASS.classes;
const SUBJECT_MAX = CLASS.subject_max;
/** d7 §24 "학교급을 모르면 1~6" */
const UNKNOWN_MAX_GRADE = Number((/학교급을 모르면 1~(\d+)/.exec(D7_24) ?? [])[1]);
const STORAGE = RULES.cabinet.storage_classes;

const DEMO_SCHOOL_ID = (() => {
  const src = readFileSync(join(ROOT, "lib", "supabase", "demo-data.ts"), "utf8");
  const m = src.match(/export const DEMO_SCHOOL_ID\s*=\s*"([0-9a-f-]{36})"/);
  if (!m) throw new Error("lib/supabase/demo-data.ts 에서 DEMO_SCHOOL_ID 를 찾지 못했습니다");
  return m[1];
})();

// ---------- 오류 코드 (builder 계약) ----------
const E = {
  denied: "42501",
  invalid: "22023",
  future: "22008",
  notFound: "P0002",
  stock: "22003",
} as const;

type Row = Record<string, unknown>;
type DbError = { code?: string; message: string; details?: string | null; hint?: string | null };
type Res = { data: unknown; error: DbError | null };
type RoleKey = "student" | "teacher" | "admin";
const ROLE_TEXT: Record<RoleKey, string> = { student: "학생", teacher: "교사", admin: "admin" };
const ROLES: RoleKey[] = ["student", "teacher", "admin"];
const STAFF: RoleKey[] = ["teacher", "admin"];

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

// ---------- 일회용 학교 ----------
interface Fixture {
  a: TempSchool;
  b: TempSchool;
  /** 학교급 확인용 (이름을 바꿔 가며 쓴다) */
  g: TempSchool;
  users: Record<RoleKey, TempUser>;
  c: Record<RoleKey, SupabaseClient>;
  bAdmin: SupabaseClient;
  gAdmin: SupabaseClient;
}

let fixtureCache: Promise<Fixture> | null = null;
function fixture(info: TestInfo): Promise<Fixture> {
  fixtureCache ??= (async () => {
    const a = await tempSchool(info, GROUP);
    const admin = await clientFor(a.admin);
    const teacher = await addMember(a, info, GROUP, "교사");
    const up = await admin.rpc("change_member_role", { p_user_id: teacher.id, p_role: "teacher" });
    expect(up.error, `준비: 일회용 교사 역할 (${up.error?.message})`).toBeNull();
    const student = await addMember(a, info, GROUP, "학생");
    expect((await profileByService(teacher.id))?.role).toBe("teacher");
    expect((await profileByService(student.id))?.role).toBe("student");
    const b = await tempSchool(info, GROUP);
    const g = await tempSchool(info, GROUP);
    return {
      a,
      b,
      g,
      users: { admin: a.admin, teacher, student },
      c: { admin, teacher: await clientFor(teacher), student: await clientFor(student) },
      bAdmin: await clientFor(b.admin),
      gAdmin: await clientFor(g.admin),
    };
  })();
  fixtureCache.catch(() => {
    fixtureCache = null;
  });
  return fixtureCache;
}

let seq = 0;
const uniq = () => `${++seq}-${randomUUID().slice(0, 6)}`;

/** 임시 시약 (register_reagent — 교사·admin 세션) */
async function newReagent(c: SupabaseClient, stock = 100, name?: string): Promise<{ id: string; name: string }> {
  const n = name ?? `임시묶음-${uniq()}`;
  const res = await c.rpc("register_reagent", {
    p_name: n,
    p_storage_class: STORAGE[0],
    p_stock: stock,
    p_unit: "g",
    p_intake_date: "2026-09-15",
    p_msds_url: null,
  });
  expect(res.error, `준비: register_reagent (${res.error?.message})`).toBeNull();
  return { id: firstRow(res.data)!.id as string, name: n };
}

type Item = { reagent_id: unknown; amount: unknown };
type BatchArgs = { items: unknown; usedOn?: string | null; memo?: string | null; grade?: number | null; classNo?: number | null; subject?: string | null };
function batch(c: SupabaseClient, a: BatchArgs): Promise<Res> {
  const args: Row = { p_items: a.items };
  if (a.usedOn !== undefined) args.p_used_on = a.usedOn;
  if (a.memo !== undefined) args.p_memo = a.memo;
  if (a.grade !== undefined) args.p_class_grade = a.grade;
  if (a.classNo !== undefined) args.p_class_no = a.classNo;
  if (a.subject !== undefined) args.p_class_subject = a.subject;
  return c.rpc("record_usage_batch", args) as unknown as Promise<Res>;
}
const item = (id: string, amount: unknown): Item => ({ reagent_id: id, amount });

const REAGENT_COLS = "id, school_id, name, stock, min_stock, min_stock_source, min_stock_auto_basis, low_stock_since, slot_id, msds_url, deleted_at, deleted_by";
async function reagentRow(id: string): Promise<Row> {
  const r = await service().from("reagents").select(REAGENT_COLS).eq("id", id).single();
  if (r.error) throw new Error(`대조 조회 실패: ${r.error.message}`);
  return r.data as Row;
}
async function logsOf(ids: string[]): Promise<Row[]> {
  const r = await service().from("usage_logs").select("id, school_id, reagent_id, user_id, amount, used_on, memo, class_grade, class_no, class_subject").in("reagent_id", ids).order("used_at");
  if (r.error) throw new Error(`대조 조회 실패: ${r.error.message}`);
  return (r.data ?? []) as Row[];
}
async function intakesOf(ids: string[]): Promise<Row[]> {
  const r = await service().from("intake_logs").select("*").in("reagent_id", ids).order("id");
  if (r.error) throw new Error(`대조 조회 실패: ${r.error.message}`);
  return (r.data ?? []) as Row[];
}
/** 대조: 시약들의 행 + 사용·입고 기록 */
async function state(ids: string[]): Promise<{ reagents: Row[]; logs: Row[]; intakes: Row[] }> {
  return { reagents: await Promise.all(ids.map(reagentRow)), logs: await logsOf(ids), intakes: await intakesOf(ids) };
}

/** 거부: 오류가 있고(PostgREST 의 "함수 못 찾음" PGRST… 가 아님), 반환 값이 없고, 코드가 맞다 */
function expectRejected(res: Res, what: string, code?: string, detail?: string): void {
  expect(res.error, `${what}: 거부되어야 함 (반환: ${JSON.stringify(res.data)})`).not.toBeNull();
  expect(String(res.error?.code ?? ""), `${what}: ${res.error?.message}`).not.toMatch(/^PGRST/);
  if (code) expect(res.error?.code, `${what}: 오류 코드 (${res.error?.message} / ${res.error?.details})`).toBe(code);
  if (detail !== undefined) expect(res.error?.details ?? "", `${what}: detail = 문제 항목 번호 (${res.error?.message})`).toBe(detail);
  expect(firstRow(res.data), `${what}: 반환 값 없음`).toBeNull();
}
function expectOk(res: Res, what: string): Row {
  expect(res.error, `${what}: ${res.error?.code} ${res.error?.message} ${res.error?.details ?? ""}`).toBeNull();
  const row = firstRow(res.data);
  expect(row, `${what}: 반환 값`).not.toBeNull();
  return row!;
}

// ---------- 공용 학교 스냅숏 ----------
async function demoSnapshot(): Promise<{ logs: Row[]; reagents: Row[] }> {
  const anon = anonClient();
  const logs = await anon.from("usage_logs").select("*").eq("school_id", DEMO_SCHOOL_ID).order("id");
  const reagents = await anon.from("reagents").select("*").eq("school_id", DEMO_SCHOOL_ID).order("id");
  expect(logs.error, `anon 데모 usage_logs: ${logs.error?.message}`).toBeNull();
  expect(reagents.error, `anon 데모 reagents: ${reagents.error?.message}`).toBeNull();
  expect((reagents.data ?? []).length, "데모 시약 ≥1 (양성 대조군)").toBeGreaterThan(0);
  return { logs: (logs.data ?? []) as Row[], reagents: (reagents.data ?? []) as Row[] };
}
let demoBefore: { logs: Row[]; reagents: Row[] } | null = null;

test.beforeAll(async ({}, info) => {
  info.setTimeout(120_000);
  demoBefore = await demoSnapshot();
});

test.afterAll(async ({}, info) => {
  info.setTimeout(TIMEOUT);
  let left: Awaited<ReturnType<typeof sweep>> | null = null;
  const rest: Record<string, number> = {};
  let sharedByTemp = { logs: -1, archived: -1 };
  if (HAS_SERVICE) {
    const sb = service();
    const schools = await sb.from("schools").select("id").like("neis_code", tempSchoolLike(GROUP, info.project.name));
    const ids = (schools.data ?? []).map((s) => s.id as string);
    const profs = ids.length ? await sb.from("profiles").select("user_id").in("school_id", ids) : { data: [] as Row[] };
    const tempUsers = ((profs.data ?? []) as Row[]).map((p) => p.user_id as string);
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
    // 공용 학교(A·B·데모)에 일회용 계정이 남긴 사용 기록 · 보관 = 0
    const shared = await sb.from("schools").select("id").or("neis_code.like.TEST-SCHOOL-%,is_demo.eq.true");
    const sharedIds = (shared.data ?? []).map((s) => s.id as string);
    if (tempUsers.length && sharedIds.length) {
      sharedByTemp = {
        logs: ((await sb.from("usage_logs").select("id").in("school_id", sharedIds).in("user_id", tempUsers)).data ?? []).length,
        archived: ((await sb.from("reagents").select("id").in("school_id", sharedIds).in("deleted_by", tempUsers)).data ?? []).length,
      };
    } else sharedByTemp = { logs: 0, archived: 0 };
    left = await sweep(GROUP, info.project.name);
    fixtureCache = null;
  }
  if (left) {
    expect(rest, "일회용 학교의 시약·기록·시약장 잔여물").toEqual({ reagents: 0, intake_logs: 0, usage_logs: 0, cabinets: 0, cabinet_slots: 0 });
    expect(left, "일회용 계정·학교·프로필 잔여물").toEqual(NO_RESIDUE);
    expect(sharedByTemp, "공용 학교 A·B·데모에 일회용 계정의 사용 기록 · 보관").toEqual({ logs: 0, archived: 0 });
  }
  if (demoBefore) {
    const after = await demoSnapshot();
    expect(after.logs, "데모 usage_logs (전체 열) 불변").toEqual(demoBefore.logs);
    expect(after.reagents, "데모 reagents (전체 열) 불변").toEqual(demoBefore.reagents);
  }
});

test("[R-db][S4] 기대값 원본: d7 §24 항목 1~30 · 전부 취소 · 보관 · 수업 / rules class_info 학년·반·수업명 / d7 §1 메모 200자", () => {
  expect(ITEMS_RANGE, "d7 §24 항목 범위").toEqual([1, 30]);
  expect(D7_24).toMatch(/하나라도 틀리면 전부 취소하고 문제 항목 번호를 오류에 담는다/);
  expect(D7_24).toMatch(/같은 시약 중복 불가/);
  expect(D7_24).toMatch(/칸 배치는 비움\(slot_id null\)/);
  expect(D7_24).toMatch(/같은 이름 새 시약 등록은 허용/);
  expect(MEMO_MAX, "d7 §1 memo 최대").toBe(200);
  expect([CLASS_MIN, CLASS_MAX], "rules class_info.classes").toEqual([1, 20]);
  expect(SUBJECT_MAX, "rules class_info.subject_max").toBe(20);
  expect(Object.keys(CLASS.grades).sort(), "rules class_info.grades 학교급").toEqual(["고등학교", "중학교", "초등학교"].sort());
  expect(UNKNOWN_MAX_GRADE, "d7 §24 학교급 모름 = 1~6").toBe(6);
});

test.describe("일회용 학교", () => {
  test.skip(!HAS_SERVICE, NO_SERVICE_REASON);

  // =====================================================================
  // record_usage_batch 성공
  // =====================================================================
  for (const role of ROLES) {
    test(`[R-db][S4] 일회용 ${ROLE_TEXT[role]} record_usage_batch 3항목: 반환 {count, items[{reagent_id, stock}]} · 재고 각각 차감 · usage_logs 3행(자기 user_id·학교 · 사용일 · 메모 · 수업 공통) · intake_logs 그대로 · 자동 재주문 기준 다시 계산`, async ({}, info) => {
      test.setTimeout(TIMEOUT);
      const f = await fixture(info);
      await awayFromMidnight();
      const rs = [await newReagent(f.c.admin, 100), await newReagent(f.c.admin, 50), await newReagent(f.c.admin, 7)];
      const ids = rs.map((r) => r.id);
      const amounts = [12.5, 3, 7];
      const before = await state(ids);
      for (const r of before.reagents) expect(r.min_stock_source, "전제: 새 시약 = 자동 기준").toBe("auto");
      const usedOn = daysAgo(2);
      const res = await batch(f.c[role], {
        items: rs.map((r, i) => item(r.id, amounts[i])),
        usedOn,
        memo: "  묶음 메모  ",
        grade: 2,
        classNo: 7,
        subject: "  통합   과학 ",
      });
      const out = expectOk(res, `${ROLE_TEXT[role]} record_usage_batch`);
      expect(out.count, "반환 count = 항목 수").toBe(3);
      expect(out.items, "반환 items = 항목 순서 · 차감 뒤 재고").toEqual(rs.map((r, i) => ({ reagent_id: r.id, stock: [100, 50, 7][i] - amounts[i] })));
      const after = await state(ids);
      after.reagents.forEach((r, i) => expect(Number(r.stock), `${rs[i].name} 재고`).toBe([100, 50, 7][i] - amounts[i]));
      expect(after.logs, "usage_logs 3행").toHaveLength(3);
      // 한 트랜잭션이라 기록 시각(used_at)이 같다 — 시약으로 짝짓는다
      expect(after.logs.map((l) => l.reagent_id).sort(), "항목마다 한 행").toEqual([...ids].sort());
      for (const l of after.logs) {
        const i = ids.indexOf(l.reagent_id as string);
        expect(Number(l.amount), "사용량").toBe(amounts[i]);
        expect(l.user_id, "사용자 = 로그인한 사람").toBe(f.users[role].id);
        expect(l.school_id, "자기 학교").toBe(f.a.id);
        expect(l.used_on, "공통 사용일").toBe(usedOn);
        expect(l.memo, "공통 메모(앞뒤 공백 정리)").toBe("묶음 메모");
        expect([l.class_grade, l.class_no, l.class_subject], "공통 수업 (수업명 공백 정리)").toEqual([2, 7, "통합 과학"]);
      }
      expect(after.intakes, "입고 기록 아님 (intake_logs 그대로)").toEqual(before.intakes);
      // §11-1 자동 기준: 최근 28일 사용 기록이 생겼으므로 = 사용량 합 ÷ 2
      after.reagents.forEach((r, i) => {
        expect(r.min_stock_source, "출처 그대로 auto").toBe("auto");
        expect(r.min_stock_auto_basis, "자동 근거 = 사용 기록").toBe("usage");
        expect(Number(r.min_stock), `${rs[i].name} 자동 기준 = 사용량 근거`).toBe(autoFromUsage([amounts[i]]));
      });
    });
  }

  test(`[R-db][S4] 일회용 학생 record_usage_batch 사용일·메모·수업 생략: 사용일 = 한국 오늘 · 메모·수업 null · 빈 문자열·공백 수업명·메모 = null · 과거 사용일 하한 없음`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    await awayFromMidnight();
    const r = await newReagent(f.c.admin, 100);
    expectOk(await batch(f.c.student, { items: [item(r.id, 1)] }), "인자 생략");
    expectOk(await batch(f.c.student, { items: [item(r.id, 1)], usedOn: null, memo: "", grade: null, classNo: null, subject: "   " }), "null · 빈 값");
    expectOk(await batch(f.c.student, { items: [item(r.id, 1)], usedOn: "2000-01-01", memo: "x".repeat(MEMO_MAX), subject: "가".repeat(SUBJECT_MAX) }), "오래된 사용일 · 메모·수업명 최대 길이");
    const logs = await logsOf([r.id]);
    expect(logs.map((l) => [l.used_on, l.memo, l.class_grade, l.class_no, l.class_subject])).toEqual([
      [daysAgo(0), null, null, null, null],
      [daysAgo(0), null, null, null, null],
      ["2000-01-01", "x".repeat(MEMO_MAX), null, null, "가".repeat(SUBJECT_MAX)],
    ]);
    expect(Number((await reagentRow(r.id)).stock)).toBe(97);
  });

  test(`[R-db][S4] 일회용 교사 record_usage_batch 항목 수 경계: ${ITEMS_RANGE[1]}개 성공(모두 차감) · 0개·${ITEMS_RANGE[1] + 1}개·배열 아님 = ${E.invalid} 'invalid items' · 아무것도 안 바뀜`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const rs: { id: string; name: string }[] = [];
    for (let i = 0; i < ITEMS_RANGE[1] + 1; i++) rs.push(await newReagent(f.c.admin, 10));
    const ids = rs.map((r) => r.id);
    const before = await state(ids);
    expectRejected(await batch(f.c.teacher, { items: [] }), "0개", E.invalid);
    expectRejected(await batch(f.c.teacher, { items: rs.map((r) => item(r.id, 1)) }), `${ITEMS_RANGE[1] + 1}개`, E.invalid);
    expectRejected(await batch(f.c.teacher, { items: { reagent_id: rs[0].id, amount: 1 } }), "객체(배열 아님)", E.invalid);
    expectRejected(await batch(f.c.teacher, { items: "[]" }), "문자열(배열 아님)", E.invalid);
    expectRejected(await batch(f.c.teacher, { items: null }), "null", E.invalid);
    for (const r of [await batch(f.c.teacher, { items: [] })]) expect(r.error?.message ?? "", "메시지 = invalid items").toMatch(/invalid items/);
    expect(await state(ids), "거부 뒤 재고·기록 그대로").toEqual(before);
    const ok = expectOk(await batch(f.c.teacher, { items: rs.slice(0, ITEMS_RANGE[1]).map((r) => item(r.id, 2)) }), `${ITEMS_RANGE[1]}개`);
    expect(ok.count).toBe(ITEMS_RANGE[1]);
    const after = await state(ids);
    expect(after.logs, `usage_logs ${ITEMS_RANGE[1]}행`).toHaveLength(ITEMS_RANGE[1]);
    after.reagents.forEach((r, i) => expect(Number(r.stock), `시약 ${i + 1}`).toBe(i < ITEMS_RANGE[1] ? 8 : 10));
  });

  // =====================================================================
  // 전부 취소 (한 트랜잭션) — 문제 항목 번호
  // =====================================================================
  test(`[R-db][S4] 일회용 admin 전부 취소: 중간 항목 재고 부족 → ${E.stock} detail "2" · 둘째·넷째 부족 → "2,4" · 같은 시약 중복 → ${E.invalid} 'duplicate reagent' detail = 두 번째 번호 · 앞 항목도 차감 안 됨`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const [x, y, z, w] = [await newReagent(f.c.admin, 10), await newReagent(f.c.admin, 5), await newReagent(f.c.admin, 10), await newReagent(f.c.admin, 1)];
    const ids = [x.id, y.id, z.id, w.id];
    const before = await state(ids);
    const r1 = await batch(f.c.admin, { items: [item(x.id, 3), item(y.id, 6), item(z.id, 3)] });
    expectRejected(r1, "중간 재고 부족", E.stock, "2");
    expect(r1.error?.message, "메시지").toMatch(/insufficient stock/);
    expectRejected(await batch(f.c.admin, { items: [item(x.id, 3), item(y.id, 6), item(z.id, 3), item(w.id, 2)] }), "둘째·넷째 부족", E.stock, "2,4");
    expectRejected(await batch(f.c.admin, { items: [item(x.id, 10.001)] }), "재고보다 아주 조금 많음", E.stock, "1");
    const dup = await batch(f.c.admin, { items: [item(x.id, 1), item(y.id, 1), item(x.id, 1)] });
    expectRejected(dup, "같은 시약 중복", E.invalid, "3");
    expect(dup.error?.message).toMatch(/duplicate reagent/);
    expectRejected(await batch(f.c.admin, { items: [item(x.id, 1), item(x.id, 1), item(y.id, 1), item(y.id, 1)] }), "중복 둘", E.invalid, "2,4");
    expect(await state(ids), "전부 취소 — 재고·사용·입고 기록 그대로").toEqual(before);
    // 대조군: 재고와 같은 양은 된다 (재고 0 까지)
    expectOk(await batch(f.c.admin, { items: [item(x.id, 10), item(y.id, 5)] }), "재고와 같은 양");
    expect([Number((await reagentRow(x.id)).stock), Number((await reagentRow(y.id)).stock)]).toEqual([0, 0]);
  });

  test(`[R-db][S4] [R-db][S3] 일회용 교사 전부 취소: 보관된 시약 · 없는 id 가 섞이면 ${E.notFound} detail = 그 번호 · 나머지 항목도 안 바뀜`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const [x, gone, z] = [await newReagent(f.c.admin, 10), await newReagent(f.c.admin, 10), await newReagent(f.c.admin, 10)];
    expectOk(await f.c.teacher.rpc("archive_reagent", { p_reagent_id: gone.id }) as unknown as Res, "준비: 보관");
    const ids = [x.id, gone.id, z.id];
    const before = await state(ids);
    const r = await batch(f.c.teacher, { items: [item(x.id, 1), item(gone.id, 1), item(z.id, 1)] });
    expectRejected(r, "보관 시약 둘째", E.notFound, "2");
    expect(r.error?.message).toMatch(/reagent not found/);
    expectRejected(await batch(f.c.teacher, { items: [item(x.id, 1), item(z.id, 1), item(randomUUID(), 1)] }), "없는 id 셋째", E.notFound, "3");
    expect(await state(ids), "전부 취소").toEqual(before);
  });

  // =====================================================================
  // 검증 오류 코드
  // =====================================================================
  test(`[R-db][S4] 일회용 학생 항목 검증: 객체 아님·reagent_id 가 uuid 아님·amount 가 숫자 아님 = ${E.invalid} 'invalid item' detail · amount 0·음수 = 'amount must be positive' detail · 사용일 미래 = ${E.future} · 아무것도 안 바뀜`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    await awayFromMidnight();
    const [x, y] = [await newReagent(f.c.admin, 10), await newReagent(f.c.admin, 10)];
    const ids = [x.id, y.id];
    const before = await state(ids);
    const cases: [string, unknown[], string, string, RegExp][] = [
      ["항목이 숫자", [item(x.id, 1), 5], E.invalid, "2", /invalid item/],
      ["항목이 배열", [[x.id, 1]], E.invalid, "1", /invalid item/],
      ["reagent_id 없음", [{ amount: 1 }], E.invalid, "1", /invalid item/],
      ["reagent_id 가 uuid 아님", [item(x.id, 1), item("not-a-uuid", 1)], E.invalid, "2", /invalid item/],
      ["reagent_id 가 숫자", [item(x.id, 1), { reagent_id: 12, amount: 1 }], E.invalid, "2", /invalid item/],
      ["amount 가 문자열", [item(x.id, "1")], E.invalid, "1", /invalid item/],
      ["amount 없음", [{ reagent_id: x.id }], E.invalid, "1", /invalid item/],
      ["amount null", [item(x.id, null)], E.invalid, "1", /invalid item/],
      ["amount 0", [item(x.id, 1), item(y.id, 0)], E.invalid, "2", /amount must be positive/],
      ["amount 음수", [item(x.id, -1)], E.invalid, "1", /amount must be positive/],
      ["amount 0 둘", [item(x.id, 0), item(y.id, 0)], E.invalid, "1,2", /amount must be positive/],
    ];
    for (const [what, items, code, detail, msg] of cases) {
      const r = await batch(f.c.student, { items });
      expectRejected(r, what, code, detail);
      expect(r.error?.message, `${what} 메시지`).toMatch(msg);
    }
    for (const d of [daysAgo(-1), daysAgo(-40)]) expectRejected(await batch(f.c.student, { items: [item(x.id, 1)], usedOn: d }), `사용일 ${d}(미래)`, E.future);
    expect(await state(ids), "거부 뒤 그대로").toEqual(before);
  });

  test(`[R-db][S4] 일회용 교사 공통 칸 검증: 메모 ${MEMO_MAX + 1}자 = ${E.invalid} 'memo too long' · 반 ${CLASS_MIN - 1}·${CLASS_MAX + 1} = 'invalid class_no' · 수업명 ${SUBJECT_MAX + 1}자 = 'invalid class_subject' · 학년 0 = 'invalid class_grade' · 아무것도 안 바뀜 / 반 ${CLASS_MIN}·${CLASS_MAX} 성공`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const x = await newReagent(f.c.admin, 10);
    const before = await state([x.id]);
    const one = [item(x.id, 1)];
    const cases: [string, BatchArgs, RegExp][] = [
      [`메모 ${MEMO_MAX + 1}자`, { items: one, memo: "x".repeat(MEMO_MAX + 1) }, /memo too long/],
      [`반 ${CLASS_MIN - 1}`, { items: one, classNo: CLASS_MIN - 1 }, /invalid class_no/],
      [`반 ${CLASS_MAX + 1}`, { items: one, classNo: CLASS_MAX + 1 }, /invalid class_no/],
      [`수업명 ${SUBJECT_MAX + 1}자`, { items: one, subject: "가".repeat(SUBJECT_MAX + 1) }, /invalid class_subject/],
      ["학년 0", { items: one, grade: 0 }, /invalid class_grade/],
      ["학년 -1", { items: one, grade: -1 }, /invalid class_grade/],
    ];
    for (const [what, a, msg] of cases) {
      const r = await batch(f.c.teacher, a);
      expectRejected(r, what, E.invalid);
      expect(r.error?.message, `${what} 메시지`).toMatch(msg);
    }
    expect(await state([x.id]), "거부 뒤 그대로").toEqual(before);
    // 대조군: 반 경계값
    expectOk(await batch(f.c.teacher, { items: one, classNo: CLASS_MIN }), `반 ${CLASS_MIN}`);
    expectOk(await batch(f.c.teacher, { items: one, classNo: CLASS_MAX, grade: 1, subject: "가".repeat(SUBJECT_MAX) }), `반 ${CLASS_MAX}`);
    expect((await logsOf([x.id])).map((l) => [l.class_grade, l.class_no])).toEqual([[null, CLASS_MIN], [1, CLASS_MAX]]);
  });

  test(`[R-db][S4] 학년 상한 = 학교급(rules class_info.grades — 학교명 기준): 초등학교 1~${Math.max(...(CLASS.grades["초등학교"] ?? [0]))} · 중학교 1~${Math.max(...(CLASS.grades["중학교"] ?? [0]))} · 고등학교 1~${Math.max(...(CLASS.grades["고등학교"] ?? [0]))} · 모름 1~${UNKNOWN_MAX_GRADE} — 넘으면 ${E.invalid} 'invalid class_grade' detail "1-N" · 아무것도 안 바뀜`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const x = await newReagent(f.gAdmin, 100);
    const original = (await service().from("schools").select("name").eq("id", f.g.id).single()).data!.name as string;
    const base = original.replace(/(초등학교|중학교|고등학교)$/, "");
    const kinds: [string, string, number][] = [
      ...Object.entries(CLASS.grades).map(([kind, gs]) => [kind, `${base}${kind}`, Math.max(...gs)] as [string, string, number]),
      ["학교급 모름", `${base}과학원`, UNKNOWN_MAX_GRADE],
    ];
    try {
      for (const [kind, name, max] of kinds) {
        const up = await service().from("schools").update({ name }).eq("id", f.g.id);
        expect(up.error, `준비: 학교명 ${name}`).toBeNull();
        const before = await state([x.id]);
        const r = await batch(f.gAdmin, { items: [item(x.id, 1)], grade: max + 1 });
        expectRejected(r, `${kind} 학년 ${max + 1}`, E.invalid, `1-${max}`);
        expect(r.error?.message).toMatch(/invalid class_grade/);
        expect(await state([x.id]), `${kind}: 거부 뒤 그대로`).toEqual(before);
        expectOk(await batch(f.gAdmin, { items: [item(x.id, 1)], grade: max, classNo: 1 }), `${kind} 학년 ${max}`);
        expectOk(await batch(f.gAdmin, { items: [item(x.id, 1)], grade: 1 }), `${kind} 학년 1`);
      }
    } finally {
      await service().from("schools").update({ name: original }).eq("id", f.g.id);
    }
    const grades = (await logsOf([x.id])).map((l) => l.class_grade);
    expect(grades, "저장된 학년").toEqual(kinds.flatMap(([, , max]) => [max, 1]));
  });

  // =====================================================================
  // N1 · 데모 · anon
  // =====================================================================
  test(`[N1-db][S4] 일회용 B' admin 이 A' 시약으로 record_usage_batch → ${E.notFound} (없는 id 와 같은 겉모습) · 자기 시약과 섞으면 전부 취소 detail = 그 번호 · A'·B' 재고·기록 그대로`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const aR = await newReagent(f.c.admin, 10);
    const bR = await newReagent(f.bAdmin, 10);
    const before = await state([aR.id, bR.id]);
    const other = await batch(f.bAdmin, { items: [item(aR.id, 1)] });
    const ghost = await batch(f.bAdmin, { items: [item(randomUUID(), 1)] });
    expectRejected(other, "다른 학교 시약", E.notFound, "1");
    expectRejected(ghost, "없는 id", E.notFound, "1");
    expect([other.error?.code, other.error?.message], "다른 학교 = 없는 id 와 같은 응답 (존재 비노출)").toEqual([ghost.error?.code, ghost.error?.message]);
    expectRejected(await batch(f.bAdmin, { items: [item(bR.id, 1), item(aR.id, 1)] }), "자기 + 다른 학교", E.notFound, "2");
    expectRejected(await batch(f.c.student, { items: [item(bR.id, 1)] }), "A' 학생 → B' 시약", E.notFound, "1");
    expect(await state([aR.id, bR.id]), "A'·B' 그대로").toEqual(before);
  });

  test(`[GM-db][S4] 데모 학교 시약으로 record_usage_batch (일회용 학생) → ${E.notFound} · anon 호출 거부 · 데모 행 그대로`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const demo = (await anonClient().from("reagents").select("id").eq("school_id", DEMO_SCHOOL_ID).limit(2)).data ?? [];
    expect(demo.length, "데모 시약 (anon 읽기)").toBeGreaterThan(0);
    const own = await newReagent(f.c.admin, 10);
    expectRejected(await batch(f.c.student, { items: [item(demo[0].id as string, 1)] }), "데모 시약", E.notFound, "1");
    expectRejected(await batch(f.c.student, { items: [item(own.id, 1), item(demo[0].id as string, 1)] }), "자기 + 데모", E.notFound, "2");
    const anon = await batch(anonClient(), { items: [item(demo[0].id as string, 1)] });
    expect(anon.error, "anon record_usage_batch 거부").not.toBeNull();
    expect(firstRow(anon.data)).toBeNull();
    expect(Number((await reagentRow(own.id)).stock), "자기 시약도 그대로 (전부 취소)").toBe(10);
  });

  // =====================================================================
  // archive_reagent
  // =====================================================================
  for (const role of STAFF) {
    test(`[R-db][S3] 일회용 ${ROLE_TEXT[role]} archive_reagent: 반환 {reagent_id, name} · deleted_at = 지금 · deleted_by = 자기 · 칸 배치 비움(slot_id null) · 재고·기록은 그대로 · 두 번째 호출 = ${E.notFound}`, async ({}, info) => {
      test.setTimeout(TIMEOUT);
      const f = await fixture(info);
      const r = await newReagent(f.c.admin, 20);
      // 칸에 넣어 둔다 (add_cabinet → save_cabinet_layout → place_reagent)
      const cab = expectOk((await f.c.admin.rpc("add_cabinet")) as unknown as Res, "준비: add_cabinet");
      const slots = (await service().from("cabinet_slots").select("id").eq("cabinet_id", cab.id as string).limit(1)).data ?? [];
      const slotId = slots[0]?.id as string | undefined;
      expect(slotId, "준비: 시약장 칸 (add_cabinet 이 칸을 만든다)").toBeTruthy();
      expectOk((await f.c.admin.rpc("place_reagent", { p_reagent_id: r.id, p_slot_id: slotId })) as unknown as Res, "준비: 칸 배치");
      expectOk(await batch(f.c.student, { items: [item(r.id, 2)], grade: 1 }), "준비: 사용 기록");
      expect((await reagentRow(r.id)).slot_id, "전제: 칸에 있음").toBe(slotId);
      const before = await state([r.id]);
      const t0 = Date.now();
      const res = (await f.c[role].rpc("archive_reagent", { p_reagent_id: r.id })) as unknown as Res;
      const out = expectOk(res, `${ROLE_TEXT[role]} archive_reagent`);
      expect(out, "반환").toEqual({ reagent_id: r.id, name: r.name });
      const row = await reagentRow(r.id);
      expect(row.deleted_by, "deleted_by = 자기").toBe(f.users[role].id);
      expect(Math.abs(Date.parse(String(row.deleted_at)) - t0), "deleted_at = 지금").toBeLessThan(60_000);
      expect(row.slot_id, "칸 배치 비움").toBeNull();
      expect({ ...row, deleted_at: null, deleted_by: null, slot_id: slotId }, "그 밖의 열 그대로").toEqual(before.reagents[0]);
      expect(await logsOf([r.id]), "사용 기록 남음").toEqual(before.logs);
      expect(await intakesOf([r.id]), "입고 기록 남음").toEqual(before.intakes);
      expectRejected((await f.c[role].rpc("archive_reagent", { p_reagent_id: r.id })) as unknown as Res, "이미 보관", E.notFound);
      expectRejected((await f.c[role].rpc("archive_reagent", { p_reagent_id: randomUUID() })) as unknown as Res, "없는 id", E.notFound);
    });
  }

  test(`[R-db][S3] 일회용 학생 archive_reagent → ${E.denied} · 시약 그대로 (보관 안 됨)`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const r = await newReagent(f.c.admin, 5);
    const before = await reagentRow(r.id);
    expectRejected((await f.c.student.rpc("archive_reagent", { p_reagent_id: r.id })) as unknown as Res, "학생 archive_reagent", E.denied);
    expect(await reagentRow(r.id), "그대로").toEqual(before);
    const seen = await f.c.student.from("reagents").select("id").eq("id", r.id);
    expect(seen.data ?? [], "학생도 여전히 보임 (보관 안 됨)").toHaveLength(1);
  });

  test(`[N1-db][S3] 일회용 B' admin 이 A' 시약 archive_reagent → ${E.notFound} (없는 id 와 같은 응답) · A' 시약 그대로 / [GM-db][S3] 데모 시약 → ${E.notFound} · anon 거부 · 데모 그대로`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const r = await newReagent(f.c.admin, 5);
    const before = await reagentRow(r.id);
    const other = (await f.bAdmin.rpc("archive_reagent", { p_reagent_id: r.id })) as unknown as Res;
    const ghost = (await f.bAdmin.rpc("archive_reagent", { p_reagent_id: randomUUID() })) as unknown as Res;
    expectRejected(other, "다른 학교 시약", E.notFound);
    expectRejected(ghost, "없는 id", E.notFound);
    expect([other.error?.code, other.error?.message], "존재 비노출").toEqual([ghost.error?.code, ghost.error?.message]);
    expect(await reagentRow(r.id), "A' 시약 그대로").toEqual(before);
    const demo = (await anonClient().from("reagents").select("id").eq("school_id", DEMO_SCHOOL_ID).limit(1)).data ?? [];
    expect(demo.length, "데모 시약").toBe(1);
    expectRejected((await f.c.teacher.rpc("archive_reagent", { p_reagent_id: demo[0].id })) as unknown as Res, "교사 → 데모 시약", E.notFound);
    const anon = (await anonClient().rpc("archive_reagent", { p_reagent_id: demo[0].id })) as unknown as Res;
    expect(anon.error, "anon archive_reagent 거부").not.toBeNull();
    expect(firstRow(anon.data)).toBeNull();
  });

  // =====================================================================
  // 보관 뒤
  // =====================================================================
  test(`[R-db][S3] 보관 뒤: 학생·교사·admin select 0 (RLS) · 사용(record_usage · batch) · 입고(record_intake · 서류 입고) · 칸 배치 · 재주문 기준(set · reset · 매뉴얼) · MSDS 저장 모두 ${E.notFound} · 행 그대로`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const r = await newReagent(f.c.admin, 30);
    const cab = expectOk((await f.c.admin.rpc("add_cabinet")) as unknown as Res, "준비: add_cabinet");
    expectOk((await f.c.admin.rpc("archive_reagent", { p_reagent_id: r.id })) as unknown as Res, "보관");
    for (const role of ROLES) {
      const seen = await f.c[role].from("reagents").select("id").eq("id", r.id);
      expect(seen.error).toBeNull();
      expect(seen.data ?? [], `${ROLE_TEXT[role]} select 0 (보관 = 목록·상세에서 제외)`).toHaveLength(0);
    }
    const allOwn = await f.c.teacher.from("reagents").select("id").eq("school_id", f.a.id);
    expect((allOwn.data ?? []).map((x) => x.id), "학교 전체 목록에도 없음").not.toContain(r.id);
    const before = await state([r.id]);
    const slot = ((await service().from("cabinet_slots").select("id").eq("cabinet_id", cab.id as string).limit(1)).data ?? [])[0]?.id ?? null;
    expect(slot, "준비: 시약장 칸").not.toBeNull();
    const calls: [string, () => PromiseLike<unknown>][] = [
      ["record_usage", () => f.c.student.rpc("record_usage", { reagent_id: r.id, amount: 1 })],
      ["record_usage_batch", () => batch(f.c.student, { items: [item(r.id, 1)] })],
      ["record_intake", () => f.c.teacher.rpc("record_intake", { p_reagent_id: r.id, p_amount: 5, p_intake_date: daysAgo(0) })],
      ["record_document_intake (기존 시약 연결)", () => f.c.teacher.rpc("record_document_intake", { p_intake_date: daysAgo(0), p_items: [{ reagent_id: r.id, amount: 5 }] })],
      ["set_reorder_threshold", () => f.c.teacher.rpc("set_reorder_threshold", { p_reagent_id: r.id, p_min_stock: 5 })],
      ["reset_reorder_threshold", () => f.c.teacher.rpc("reset_reorder_threshold", { p_reagent_id: r.id })],
      ["save_reorder_basis", () => f.c.teacher.rpc("save_reorder_basis", { p_items: [{ reagent_id: r.id, per_group: 2, groups: 3 }] })],
      ["set_reagent_msds", () => f.c.teacher.rpc("set_reagent_msds", { p_reagent_id: r.id, p_msds_url: "https://msds.kosha.or.kr/MSDSInfo/kcic/msdsdetail.do?chem_id=000699&viewType=msds", p_cas_no: null })],
      ["archive_reagent (다시)", () => f.c.teacher.rpc("archive_reagent", { p_reagent_id: r.id })],
    ];
    calls.push(["place_reagent", () => f.c.teacher.rpc("place_reagent", { p_reagent_id: r.id, p_slot_id: slot })]);
    for (const [what, call] of calls) expectRejected((await call()) as Res, `보관 시약 ${what}`, E.notFound);
    expect(await state([r.id]), "보관 시약 행·기록 그대로").toEqual(before);
  });

  test(`[R-db][S3] 보관 뒤 같은 이름 새 시약 등록 가능 (보관 전에는 같은 이름 23505) · 새 시약은 보이고 보관 시약은 안 보임`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const r = await newReagent(f.c.admin, 5);
    const dup = (await f.c.teacher.rpc("register_reagent", { p_name: r.name, p_storage_class: STORAGE[0], p_stock: 1, p_unit: "g", p_intake_date: "2026-09-15", p_msds_url: null })) as unknown as Res;
    expectRejected(dup, "보관 전 같은 이름", "23505");
    expectOk((await f.c.teacher.rpc("archive_reagent", { p_reagent_id: r.id })) as unknown as Res, "보관");
    const again = expectOk((await f.c.teacher.rpc("register_reagent", { p_name: r.name, p_storage_class: STORAGE[0], p_stock: 1, p_unit: "g", p_intake_date: "2026-09-15", p_msds_url: null })) as unknown as Res, "보관 뒤 같은 이름");
    expect(again.id, "새 행").not.toBe(r.id);
    const seen = await f.c.student.from("reagents").select("id").eq("name", r.name);
    expect((seen.data ?? []).map((x) => x.id), "같은 이름 = 새 시약만 보임").toEqual([again.id]);
    // 서류 입고의 새 시약 이름 중복 검사에서도 보관 시약은 빠진다
    expectOk((await f.c.teacher.rpc("archive_reagent", { p_reagent_id: again.id })) as unknown as Res, "새 시약도 보관");
    const doc = (await f.c.teacher.rpc("record_document_intake", {
      p_intake_date: daysAgo(0),
      p_items: [{ name: r.name, storage_class: STORAGE[0], unit: "g", stock: 3, msds_url: null }],
    })) as unknown as Res;
    expect(doc.error, `서류 입고 새 시약 = 보관된 이름 재사용 (${doc.error?.message})`).toBeNull();
  });

  test(`[R-db][S3] 보관 열 직접 설정 거부: 교사 세션 update deleted_at·deleted_by → ${E.denied} · insert 에 deleted_at → ${E.denied} · 보관 시약 되살리기(update deleted_at = null) 불가`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const r = await newReagent(f.c.admin, 5);
    const before = await reagentRow(r.id);
    for (const patch of [{ deleted_at: new Date().toISOString() }, { deleted_by: f.users.teacher.id }]) {
      const up = await f.c.teacher.from("reagents").update(patch).eq("id", r.id).select("id");
      expect(up.error?.code, `update ${Object.keys(patch)[0]} → ${E.denied} (${up.error?.message})`).toBe(E.denied);
    }
    expect(await reagentRow(r.id), "그대로").toEqual(before);
    const ins = await f.c.teacher
      .from("reagents")
      .insert({ school_id: f.a.id, name: `임시보관직접-${uniq()}`, storage_class: STORAGE[0], unit: "g", stock: 1, deleted_at: new Date().toISOString() })
      .select("id");
    expect(ins.error?.code, `insert deleted_at → ${E.denied} (${ins.error?.message})`).toBe(E.denied);
    // 되살리기
    expectOk((await f.c.teacher.rpc("archive_reagent", { p_reagent_id: r.id })) as unknown as Res, "보관");
    const archived = await reagentRow(r.id);
    const revive = await f.c.admin.from("reagents").update({ deleted_at: null, deleted_by: null }).eq("id", r.id).select("id");
    expect(revive.data ?? [], `되살리기 반영 0행 (${revive.error?.code ?? "-"})`).toHaveLength(0);
    expect(await reagentRow(r.id), "보관 그대로").toEqual(archived);
  });

  // =====================================================================
  // usage_records (화면 10)
  // =====================================================================
  test(`[R-db][S10] usage_records: 보관 시약 기록 = reagent_deleted true · 시약명 그대로 · msds_url null / 살아 있는 시약 = false · class_grade·class_no·class_subject 그대로 · p_class_grade·p_class_no 필터 (서버)`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const live = await newReagent(f.c.admin, 50);
    const gone = await newReagent(f.c.admin, 50);
    const msds = "https://msds.kosha.or.kr/MSDSInfo/kcic/msdsdetail.do?chem_id=000699&viewType=msds";
    expectOk((await f.c.teacher.rpc("set_reagent_msds", { p_reagent_id: gone.id, p_msds_url: msds, p_cas_no: null })) as unknown as Res, "준비: MSDS");
    expectOk(await batch(f.c.student, { items: [item(live.id, 1), item(gone.id, 1)], grade: 2, classNo: 3, subject: "화학" }), "2학년 3반");
    expectOk(await batch(f.c.student, { items: [item(live.id, 1)], grade: 2, classNo: 5 }), "2학년 5반");
    expectOk(await batch(f.c.student, { items: [item(live.id, 1)], grade: 1 }), "1학년");
    expectOk(await batch(f.c.student, { items: [item(live.id, 1)] }), "수업 없음");
    expectOk((await f.c.teacher.rpc("archive_reagent", { p_reagent_id: gone.id })) as unknown as Res, "보관");
    type Rec = { reagent_id: string; reagent_name: string; reagent_deleted: boolean; msds_url: string | null; class_grade: number | null; class_no: number | null; class_subject: string | null };
    const rec = async (c: SupabaseClient, args: Row = {}): Promise<Rec[]> => {
      const r = await c.rpc("usage_records", { p_only_mine: false, p_since: null, p_query: null, p_limit: 500, ...args });
      expect(r.error, `usage_records (${r.error?.message})`).toBeNull();
      return ((r.data ?? []) as Rec[]).filter((x) => x.reagent_id === live.id || x.reagent_id === gone.id);
    };
    for (const role of ROLES) {
      const all = await rec(f.c[role]);
      expect(all, `${ROLE_TEXT[role]}: 5행`).toHaveLength(5);
      const g = all.filter((x) => x.reagent_id === gone.id);
      expect(g, "보관 시약 기록 남음").toHaveLength(1);
      expect([g[0].reagent_name, g[0].reagent_deleted, g[0].msds_url], "보관 시약: 이름 그대로 · reagent_deleted · MSDS 없음").toEqual([gone.name, true, null]);
      expect(all.filter((x) => x.reagent_id === live.id).every((x) => x.reagent_deleted === false), "살아 있는 시약 = false").toBe(true);
      expect(all.map((x) => [x.class_grade, x.class_no, x.class_subject]).sort(), "수업 열").toEqual(
        [[2, 3, "화학"], [2, 3, "화학"], [2, 5, null], [1, null, null], [null, null, null]].sort(),
      );
    }
    expect((await rec(f.c.teacher, { p_class_grade: 2 })).length, "2학년").toBe(3);
    expect((await rec(f.c.teacher, { p_class_grade: 2, p_class_no: 3 })).map((x) => x.reagent_id).sort(), "2학년 3반").toEqual([live.id, gone.id].sort());
    expect((await rec(f.c.teacher, { p_class_grade: 1 })).length, "1학년").toBe(1);
    expect((await rec(f.c.teacher, { p_class_grade: 3 })).length, "3학년 0").toBe(0);
  });

  test(`[N1-db][S10] usage_records · usage_logs: 일회용 B' admin 에게 A' 기록 0행 (보관 시약 기록 포함) · anon usage_records 거부`, async ({}, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const r = await newReagent(f.c.admin, 10);
    expectOk(await batch(f.c.teacher, { items: [item(r.id, 1)], grade: 1, classNo: 1 }), "A' 기록");
    expectOk((await f.c.teacher.rpc("archive_reagent", { p_reagent_id: r.id })) as unknown as Res, "보관");
    const b = await f.bAdmin.rpc("usage_records", { p_only_mine: false, p_since: null, p_query: null, p_limit: 500 });
    expect(b.error).toBeNull();
    expect(((b.data ?? []) as Row[]).filter((x) => x.reagent_id === r.id), "B' 에게 A' 기록 0").toHaveLength(0);
    const bLogs = await f.bAdmin.from("usage_logs").select("id").eq("reagent_id", r.id);
    expect(bLogs.data ?? [], "B' usage_logs select 0").toHaveLength(0);
    const bByClass = await f.bAdmin.rpc("usage_records", { p_only_mine: false, p_since: null, p_query: null, p_limit: 500, p_class_grade: 1, p_class_no: 1 });
    expect(((bByClass.data ?? []) as Row[]).filter((x) => x.reagent_id === r.id), "B' 반 필터로도 0").toHaveLength(0);
    const anon = await anonClient().rpc("usage_records", { p_only_mine: false, p_since: null, p_query: null, p_limit: 10 });
    expect(anon.error, "anon usage_records 거부").not.toBeNull();
  });
});
