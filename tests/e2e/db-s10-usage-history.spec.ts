// [R-db][S4] · [R-db][S10] · [N1-db][S10] · [N1-db][S4] · [GM-db][S*]
// 사용 기록 내역(화면 10) 조회 함수 usage_history + 화면 4 메모(record_usage memo) DB 권한 —
// 실제 RLS·함수 (anon 키 + 각 계정 로그인). service role 미사용.
// 기준: harness/d7-data.md §1(usage_logs.memo)·§2·§5·§7, harness/d5-gates.md R-db·N1-db·GM-db.
//
// 운영 DB 이므로 테스트 학교(A·B)에서만 쓴다:
// - usage_logs 는 update·delete 정책이 없고 reagents FK 가 cascade 가 아니라, 사용 기록이 달린 시약은 지울 수 없다.
//   seed 시약 5종은 다른 스펙(db-r-roles·db-n1·화면 4)이 stock·기록 수를 "정확히 같은지" 비교하므로
//   거기에 record_usage 를 하면 병렬 실행에서 서로 깨진다.
//   → 이 스펙 전용 고정 시약(학교 A, 프로젝트별 1개, 이름 `R-db-S10-fixture_100%-{project}`)을 한 번 만들어 계속 재사용한다.
//     (이름 접두사 R-db- 는 db-helpers pickReagent 가 건너뛴다. 이름의 `_`·`%` 는 검색 와일드카드 검사용.)
// - 실행마다(프로젝트별) 이 고정 시약에 usage_logs 7행(합계 0.10 mL)이 남는다. stock 은 끝에 100 으로 되돌린다.
// - 학교 B·데모 학교에는 쓰지 않는다 ("거부되어야 하는 시도"만 — 성공했다면 테스트가 실패한다).
import { test, expect, type TestInfo } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ROLE_LABEL,
  SCHOOL_A_ROLES,
  anonClient,
  ensureUsageLog,
  signIn,
  uniqueTag,
  type Role,
  type Session,
} from "./db-helpers";

test.describe.configure({ mode: "default" });

type Row = Record<string, unknown>;
type RpcResult = { data: unknown; error: { code?: string; message: string } | null };

const FIX_UNIT = "mL";
const FIX_MSDS = "https://example.com/msds/r-db-s10.pdf";
const FIX_STOCK = 100;
/** d7 §1·§7: 메모 200자 이하 */
const MEMO_MAX = 200;
/** d7 §7 목록·상세에 필요한 값 */
const HISTORY_KEYS = ["id", "used_at", "amount", "memo", "reagent_id", "reagent_name", "unit", "msds_url", "user_name", "is_mine"];
const LOG_COLS = "id, school_id, reagent_id, user_id, amount, used_at, memo";

const fixtureName = (info: TestInfo) => `R-db-S10-fixture_100%-${info.project.name}`;

function firstRow(data: unknown): Row | null {
  if (Array.isArray(data)) return (data[0] as Row | undefined) ?? null;
  return (data as Row | null) ?? null;
}

/** DB 가 거부했는지: 오류가 있고, PostgREST 의 "함수·인자 못 찾음"(PGRST…)이 아니다 (인자 이름 오타로 통과하는 일 방지) */
function expectRejected(res: RpcResult, what: string): void {
  expect(res.error, `${what} 는 오류여야 함`).not.toBeNull();
  expect(String(res.error?.code ?? ""), `${what}: ${res.error?.message}`).not.toMatch(/^PGRST/);
  expect(firstRow(res.data), `${what} 반환 행`).toBeNull();
}

function changed(res: { error: unknown; data: unknown[] | null }): number {
  return res.error ? 0 : (res.data ?? []).length;
}

/** timestamptz 문자열 → 마이크로초 (PostgREST 는 소수 자릿수가 가변) */
function micros(v: unknown): bigint {
  const m = /^(.+?)(?:\.(\d+))?(Z|[+-]\d\d(?::?\d\d)?)$/.exec(String(v));
  if (!m) throw new Error(`시각 형식 아님: ${String(v)}`);
  const ms = Date.parse(`${m[1]}${m[3]}`);
  if (Number.isNaN(ms)) throw new Error(`시각 해석 실패: ${String(v)}`);
  return BigInt(ms) * 1000n + BigInt((m[2] ?? "").padEnd(6, "0").slice(0, 6));
}

async function rpc(client: SupabaseClient, fn: string, args: Row): Promise<RpcResult> {
  const res = await client.rpc(fn, args);
  return { data: res.data, error: res.error };
}

interface HistoryArgs {
  p_only_mine?: boolean | null;
  p_since?: string | null;
  p_query?: string | null;
  p_limit?: number | null;
}

async function historyRaw(client: SupabaseClient, args: HistoryArgs = {}): Promise<RpcResult> {
  return rpc(client, "usage_history", args as Row);
}

/** usage_history 성공 호출 → 행 */
async function history(s: Session, args: HistoryArgs = {}): Promise<Row[]> {
  const res = await historyRaw(s.client, args);
  expect(res.error, `usage_history(${JSON.stringify(args)}) ${ROLE_LABEL[s.role]}: ${res.error?.message}`).toBeNull();
  expect(Array.isArray(res.data), "usage_history 는 행 목록").toBe(true);
  return res.data as Row[];
}

const idsOf = (rows: Row[]) => rows.map((r) => r.id as string);

/** 자기 세션(RLS)으로 보이는 테이블 전체 행 (1000행 넘어도 전부) */
async function allRows(s: Session, table: string, cols: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const r = await s.client.from(table).select(cols).order("id").range(from, from + 999);
    expect(r.error, `${table} 조회(${ROLE_LABEL[s.role]}): ${r.error?.message}`).toBeNull();
    const page = (r.data ?? []) as unknown as Row[];
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

/** usage_logs 를 id 로 직접 읽기 (RLS) */
async function logsById(s: Session, ids: string[]): Promise<Map<string, Row>> {
  const map = new Map<string, Row>();
  for (let i = 0; i < ids.length; i += 80) {
    const r = await s.client.from("usage_logs").select(LOG_COLS).in("id", ids.slice(i, i + 80));
    expect(r.error, `usage_logs id 조회: ${r.error?.message}`).toBeNull();
    for (const row of (r.data ?? []) as Row[]) map.set(row.id as string, row);
  }
  return map;
}

async function displayName(s: Session): Promise<string> {
  const r = await s.client.from("profiles").select("display_name").eq("user_id", s.userId).single();
  expect(r.error, `${ROLE_LABEL[s.role]} 자기 profiles: ${r.error?.message}`).toBeNull();
  const name = String(r.data?.display_name ?? "");
  expect(name.length, `${ROLE_LABEL[s.role]} display_name`).toBeGreaterThan(0);
  return name;
}

async function stockOf(s: Session, id: string): Promise<number> {
  const r = await s.client.from("reagents").select("stock").eq("id", id).single();
  if (r.error || !r.data) throw new Error(`stock 조회 실패: ${r.error?.message}`);
  return Number(r.data.stock);
}

async function fixtureLogCount(s: Session, reagentId: string): Promise<number> {
  const r = await s.client.from("usage_logs").select("id", { count: "exact", head: true }).eq("reagent_id", reagentId);
  expect(r.error, `usage_logs 수 조회: ${r.error?.message}`).toBeNull();
  return r.count ?? 0;
}

// ======================================================================
// 고정 시약 + 이번 실행의 사용 기록 7행 (워커당 1회)
// ======================================================================

type CallKey = "studentTrim" | "teacher200" | "adminMemo" | "emptyMemo" | "blankMemo" | "wsOnlyMemo" | "noMemoArg";

interface Call {
  key: CallKey;
  role: Role;
  amount: number;
  /** memo 인자 (undefined = 인자 자체를 안 보냄) */
  memoArg: string | undefined;
  expectedMemo: string | null;
  res: RpcResult;
  /** 교사 세션으로 다시 읽은 usage_logs 행 */
  row: Row | null;
  stockBefore: number;
  stockAfter: number;
  logsBefore: number;
  logsAfter: number;
}

interface Fixture {
  reagent: Row;
  tag: string;
  calls: Record<CallKey, Call>;
  order: CallKey[];
  /** 첫 기록보다 1초 앞 (이 시각 이후 + 고정 시약 이름 = 이번 실행의 행만) */
  since: string;
}

let fixturePromise: Promise<Fixture> | null = null;

async function getOrCreateReagent(t: Session, name: string): Promise<Row> {
  const cols = "id, school_id, name, unit, stock, min_stock, msds_url";
  const found = await t.client.from("reagents").select(cols).eq("name", name).order("id").limit(1);
  if (found.error) throw new Error(`고정 시약 조회 실패: ${found.error.message}`);
  if ((found.data ?? []).length > 0) return found.data![0] as Row;
  const made = await t.client
    .from("reagents")
    .insert({ school_id: t.schoolId, name, unit: FIX_UNIT, stock: FIX_STOCK, min_stock: 0, msds_url: FIX_MSDS })
    .select(cols)
    .single();
  if (made.error || !made.data) throw new Error(`고정 시약 생성 실패: ${made.error?.message}`);
  return made.data as Row;
}

async function resetStock(t: Session, id: string): Promise<void> {
  const r = await t.client.from("reagents").update({ stock: FIX_STOCK }).eq("id", id).select("stock");
  if (r.error || (r.data ?? []).length !== 1) throw new Error(`고정 시약 stock 되돌리기 실패: ${r.error?.message}`);
}

function fixture(info: TestInfo): Promise<Fixture> {
  if (!fixturePromise) {
    fixturePromise = (async () => {
      const t = await signIn("teacher");
      const reagent = await getOrCreateReagent(t, fixtureName(info));
      const id = reagent.id as string;
      await resetStock(t, id);
      const tag = uniqueTag(info);
      const memo200 = `${tag}|`.padEnd(MEMO_MAX, "가");
      const plan: { key: CallKey; role: Role; amount: number; memoArg: string | undefined; expectedMemo: string | null }[] = [
        { key: "studentTrim", role: "student", amount: 0.01, memoArg: `  ${tag} 학생 메모   `, expectedMemo: `${tag} 학생 메모` },
        { key: "teacher200", role: "teacher", amount: 0.02, memoArg: memo200, expectedMemo: memo200 },
        { key: "adminMemo", role: "admin", amount: 0.03, memoArg: `${tag} admin 메모`, expectedMemo: `${tag} admin 메모` },
        { key: "emptyMemo", role: "teacher", amount: 0.01, memoArg: "", expectedMemo: null },
        { key: "blankMemo", role: "admin", amount: 0.01, memoArg: "   ", expectedMemo: null },
        { key: "wsOnlyMemo", role: "teacher", amount: 0.01, memoArg: " \t\n ", expectedMemo: null },
        { key: "noMemoArg", role: "student", amount: 0.01, memoArg: undefined, expectedMemo: null },
      ];
      const calls = {} as Record<CallKey, Call>;
      for (const p of plan) {
        const s = await signIn(p.role);
        const stockBefore = await stockOf(t, id);
        const logsBefore = await fixtureLogCount(t, id);
        const args: Row = { reagent_id: id, amount: p.amount };
        if (p.memoArg !== undefined) args.memo = p.memoArg;
        const res = await rpc(s.client, "record_usage", args);
        const logId = firstRow(res.data)?.id as string | undefined;
        const row = logId ? ((await logsById(t, [logId])).get(logId) ?? null) : null;
        calls[p.key] = {
          ...p,
          res,
          row,
          stockBefore,
          stockAfter: await stockOf(t, id),
          logsBefore,
          logsAfter: await fixtureLogCount(t, id),
        };
      }
      const firstAt = plan.map((p) => calls[p.key].row?.used_at).find((v) => v !== undefined);
      const base = firstAt ? Number(micros(firstAt) / 1000n) : Date.now() - 60_000;
      return { reagent, tag, calls, order: plan.map((p) => p.key), since: new Date(base - 1000).toISOString() };
    })();
  }
  return fixturePromise;
}

/** 이번 실행의 고정 시약 기록만: 이름 검색 + since */
async function scoped(s: Session, fx: Fixture, extra: HistoryArgs = {}): Promise<Row[]> {
  return history(s, { p_query: fx.reagent.name as string, p_since: fx.since, p_limit: 500, ...extra });
}

/** 계획한 행이 모두 만들어졌는지 (usage_history 테스트의 전제) */
function fixtureIds(fx: Fixture): string[] {
  const ids = fx.order.map((k) => fx.calls[k].row?.id as string | undefined);
  expect(ids.filter((x) => !x), "전제: 성공해야 하는 record_usage 호출이 모두 usage_logs 행을 남김").toHaveLength(0);
  return ids as string[];
}

test.beforeAll(async ({}, info) => {
  // 학교 B 에 usage_logs ≥1행 (교차 학교 0행의 양성 대조군). 이미 있으면 아무것도 하지 않는다.
  await ensureUsageLog(await signIn("schoolB"), info);
});

test.afterAll(async ({}, info) => {
  try {
    const t = await signIn("teacher");
    const r = await t.client.from("reagents").select("id").eq("name", fixtureName(info));
    for (const row of r.data ?? []) await resetStock(t, row.id as string);
  } catch {
    // 되돌리기 실패는 다음 실행 시작 때 다시 맞춘다
  }
});

// ======================================================================
// R-db · 화면 4: record_usage 메모
// ======================================================================

function expectSaved(c: Call, s: Session, fx: Fixture): void {
  expect(c.res.error, `record_usage: ${c.res.error?.message}`).toBeNull();
  const returned = firstRow(c.res.data);
  expect(returned, "함수 반환 = 만든 usage_logs 행").not.toBeNull();
  expect(c.row, "usage_logs 에 행이 실제로 있음").not.toBeNull();
  expect(returned?.memo ?? null, "반환 행 memo").toBe(c.expectedMemo);
  expect(c.row?.memo ?? null, "저장된 usage_logs.memo").toBe(c.expectedMemo);
  expect(c.row?.user_id, "자기 user_id").toBe(s.userId);
  expect(c.row?.school_id, "자기 학교").toBe(s.schoolId);
  expect(c.row?.reagent_id).toBe(fx.reagent.id);
  expect(Number(c.row?.amount)).toBe(c.amount);
  expect(c.logsAfter - c.logsBefore, "usage_logs +1행").toBe(1);
  expect(c.stockBefore - c.stockAfter, "stock 은 amount 만큼 차감").toBeCloseTo(c.amount, 6);
}

test(`[R-db][S4] 학교A 학생 record_usage 메모 저장: 앞뒤 공백을 뗀 값이 usage_logs.memo 에`, async ({}, info) => {
  const fx = await fixture(info);
  const s = await signIn("student");
  expect(s.profileRole).toBe("student");
  const c = fx.calls.studentTrim;
  expect(c.memoArg, "입력에는 앞뒤 공백이 있음").not.toBe(c.expectedMemo);
  expect(c.memoArg?.trim()).toBe(c.expectedMemo);
  expectSaved(c, s, fx);
});

test(`[R-db][S4] 학교A 교사 record_usage 메모 정확히 ${MEMO_MAX}자 → 그대로 저장`, async ({}, info) => {
  const fx = await fixture(info);
  const s = await signIn("teacher");
  expect(s.profileRole).toBe("teacher");
  const c = fx.calls.teacher200;
  expect([...(c.memoArg ?? "")].length, "입력 글자 수").toBe(MEMO_MAX);
  expectSaved(c, s, fx);
  expect([...String(c.row?.memo ?? "")].length, "저장된 글자 수").toBe(MEMO_MAX);
});

test(`[R-db][S4] 학교A admin record_usage 메모 저장`, async ({}, info) => {
  const fx = await fixture(info);
  const s = await signIn("admin");
  expect(s.profileRole).toBe("admin");
  expectSaved(fx.calls.adminMemo, s, fx);
});

test(`[R-db][S4] record_usage 메모 빈 문자열 → memo null (기록·차감은 정상)`, async ({}, info) => {
  const fx = await fixture(info);
  const c = fx.calls.emptyMemo;
  expect(c.memoArg).toBe("");
  expectSaved(c, await signIn(c.role), fx);
  expect(c.row?.memo).toBeNull();
});

test(`[R-db][S4] record_usage 메모 공백만 → memo null (기록·차감은 정상)`, async ({}, info) => {
  const fx = await fixture(info);
  const c = fx.calls.blankMemo;
  expect(c.memoArg?.length).toBeGreaterThan(0);
  expect(c.memoArg?.trim()).toBe("");
  expectSaved(c, await signIn(c.role), fx);
  expect(c.row?.memo).toBeNull();
});

test(`[R-db][S4] record_usage 메모 없는 호출(reagent_id·amount 만) → 그대로 동작, memo null`, async ({}, info) => {
  const fx = await fixture(info);
  const c = fx.calls.noMemoArg;
  expect(c.memoArg).toBeUndefined();
  expectSaved(c, await signIn(c.role), fx);
  expect(c.row?.memo).toBeNull();
});

for (const role of SCHOOL_A_ROLES) {
  test(`[R-db][S4] ${ROLE_LABEL[role]} record_usage 메모 ${MEMO_MAX + 1}자 거부 (stock·usage_logs 행 수 그대로)`, async ({}, info) => {
    const fx = await fixture(info);
    const t = await signIn("teacher");
    const s = await signIn(role);
    const id = fx.reagent.id as string;
    const stock = await stockOf(t, id);
    const logs = await fixtureLogCount(t, id);
    const memo = "가".repeat(MEMO_MAX + 1);
    const res = await rpc(s.client, "record_usage", { reagent_id: id, amount: 0.01, memo });
    expectRejected(res, `${ROLE_LABEL[role]} 메모 ${MEMO_MAX + 1}자 record_usage`);
    expect(await stockOf(t, id), "stock 그대로").toBe(stock);
    expect(await fixtureLogCount(t, id), "usage_logs 행 수 그대로").toBe(logs);
  });
}

test(`[R-db][S4] usage_logs 직접 insert 로도 메모 ${MEMO_MAX + 1}자는 저장되지 않는다 (행 수 그대로)`, async ({}, info) => {
  const fx = await fixture(info);
  const t = await signIn("teacher");
  const s = await signIn("student");
  const id = fx.reagent.id as string;
  const logs = await fixtureLogCount(t, id);
  const ins = await s.client
    .from("usage_logs")
    .insert({ school_id: s.schoolId, reagent_id: id, user_id: s.userId, amount: 0.01, memo: "가".repeat(MEMO_MAX + 1) })
    .select("id");
  expect(ins.error, `메모 ${MEMO_MAX + 1}자 직접 insert 는 오류여야 함`).not.toBeNull();
  expect(await fixtureLogCount(t, id)).toBe(logs);
});

// d7 §7 "수정·삭제 없음": 메모는 record_usage 로 한 번 저장되면 직접 update·delete 로 바꿀 수 없다
const DIRECT_WRITERS: (Role | "anon")[] = ["student", "teacher", "admin", "schoolB", "anon"];

for (const who of DIRECT_WRITERS) {
  const label = who === "anon" ? "anon" : ROLE_LABEL[who];
  const rule = who === "schoolB" || who === "anon" ? "N1-db" : "R-db";
  test(`[${rule}][S10] ${label} usage_logs 직접 update(memo·amount)·delete 0행 — 남의 기록·자기 기록 모두 그대로`, async ({}, info) => {
    const fx = await fixture(info);
    const ids = fixtureIds(fx);
    const t = await signIn("teacher");
    const actor = who === "anon" ? null : await signIn(who);
    const client = actor ? actor.client : anonClient();
    const before = await logsById(t, ids);
    expect(before.size, "대조군: 교사는 이번 실행 행을 모두 읽음").toBe(ids.length);
    // 학생·교사·admin 이 쓴 행이 모두 대상 (호출자에게는 남의 기록 + 자기 기록)
    const authors = new Set([...before.values()].map((r) => r.user_id));
    expect(authors.size, "대상 행의 작성자 3명").toBe(SCHOOL_A_ROLES.length);

    for (const id of ids) {
      const memo = await client.from("usage_logs").update({ memo: "R-db-S10-침범" }).eq("id", id).select("id");
      expect(changed(memo), `${label} memo update 로 바뀐 행`).toBe(0);
      const amount = await client.from("usage_logs").update({ amount: 999999 }).eq("id", id).select("id");
      expect(changed(amount), `${label} amount update 로 바뀐 행`).toBe(0);
      const del = await client.from("usage_logs").delete().eq("id", id).select("id");
      expect(changed(del), `${label} delete 로 지워진 행`).toBe(0);
    }
    const byReagent = await client
      .from("usage_logs")
      .update({ memo: "R-db-S10-침범" })
      .eq("reagent_id", fx.reagent.id as string)
      .select("id");
    expect(changed(byReagent), `${label} reagent_id 필터 update 로 바뀐 행`).toBe(0);

    const after = await logsById(t, ids);
    expect([...after.entries()].sort(), "usage_logs 행 그대로").toEqual([...before.entries()].sort());
  });
}

// ======================================================================
// N1-db: 학교 분리
// ======================================================================

for (const role of SCHOOL_A_ROLES) {
  test(`[N1-db][S10] ${ROLE_LABEL[role]} usage_history 는 학교 A 기록만 (학교 B 기록·시약·사용자 이름 0)`, async ({}, info) => {
    const fx = await fixture(info);
    const mine = fixtureIds(fx);
    const s = await signIn(role);
    const b = await signIn("schoolB");
    expect(s.schoolId).not.toBe(b.schoolId);

    const ownReagentIds = new Set((await allRows(s, "reagents", "id, school_id")).map((r) => r.id as string));
    const bLogs = await allRows(b, "usage_logs", "id, school_id");
    const bReagents = await allRows(b, "reagents", "id, name");
    expect(bLogs.length, "학교 B usage_logs 양성 대조군 ≥1행").toBeGreaterThan(0);
    const bLogIds = new Set(bLogs.map((r) => r.id as string));
    const bReagentIds = new Set(bReagents.map((r) => r.id as string));
    const bName = await displayName(b);
    const aNames = await Promise.all(SCHOOL_A_ROLES.map(async (r) => displayName(await signIn(r))));
    expect(aNames, "전제: 학교 B 교사 이름은 학교 A 테스트 계정 이름과 다름").not.toContain(bName);

    const variants: HistoryArgs[] = [{}, { p_limit: 500 }, { p_only_mine: true, p_limit: 500 }];
    for (const b2 of bReagents) variants.push({ p_query: b2.name as string, p_limit: 500 });
    let sawOwn = false;
    for (const args of variants) {
      const rows = await history(s, args);
      const what = `usage_history(${JSON.stringify(args)})`;
      const direct = await logsById(s, idsOf(rows));
      for (const row of rows) {
        expect(bLogIds.has(row.id as string), `${what}: 학교 B 기록`).toBe(false);
        expect(bReagentIds.has(row.reagent_id as string), `${what}: 학교 B 시약`).toBe(false);
        expect(ownReagentIds.has(row.reagent_id as string), `${what}: 시약은 학교 A 것`).toBe(true);
        expect(direct.get(row.id as string)?.school_id, `${what}: 기록은 학교 A 것`).toBe(s.schoolId);
        expect(row.user_name, `${what}: 학교 B 사용자 이름`).not.toBe(bName);
      }
      if (rows.some((r) => mine.includes(r.id as string))) sawOwn = true;
    }
    expect(sawOwn, "양성 대조군: 자기 학교 기록(이번 실행 행)은 보임").toBe(true);
  });
}

test(`[N1-db][S10] 학교B 교사 usage_history 는 학교 B 기록만 (학교 A 기록·시약·사용자 이름·메모 0)`, async ({}, info) => {
  const fx = await fixture(info);
  const aIds = new Set(fixtureIds(fx));
  const b = await signIn("schoolB");
  const t = await signIn("teacher");
  const bReagentIds = new Set((await allRows(b, "reagents", "id")).map((r) => r.id as string));
  const aNames = await Promise.all(SCHOOL_A_ROLES.map(async (r) => displayName(await signIn(r))));
  expect(aNames, "전제: 이름이 서로 다름").not.toContain(await displayName(b));

  const all = await history(b, { p_limit: 500 });
  expect(all.length, "양성 대조군: 학교 B 자기 기록 ≥1행").toBeGreaterThan(0);
  const variants: HistoryArgs[] = [
    {},
    { p_only_mine: true },
    { p_query: fx.reagent.name as string, p_limit: 500 },
    { p_query: "R-db-S10", p_since: fx.since, p_limit: 500 },
    { p_since: fx.since, p_limit: 500 },
  ];
  for (const args of [{ p_limit: 500 } as HistoryArgs, ...variants]) {
    const rows = await history(b, args);
    const what = `학교B usage_history(${JSON.stringify(args)})`;
    const direct = await logsById(b, idsOf(rows));
    for (const row of rows) {
      expect(aIds.has(row.id as string), `${what}: 학교 A 기록`).toBe(false);
      expect(row.reagent_id, `${what}: 학교 A 고정 시약`).not.toBe(fx.reagent.id);
      expect(bReagentIds.has(row.reagent_id as string), `${what}: 시약은 학교 B 것`).toBe(true);
      expect(direct.get(row.id as string)?.school_id, `${what}: 기록은 학교 B 것`).toBe(b.schoolId);
      expect(aNames, `${what}: 학교 A 사용자 이름`).not.toContain(row.user_name);
      expect(String(row.memo ?? ""), `${what}: 학교 A 메모`).not.toContain(fx.tag);
    }
  }
  // 학교 A 시약 이름으로 찾아도 0행 (같은 검색이 학교 A 교사에게는 이번 실행 행 전부 — 대조군)
  expect(await history(b, { p_query: fx.reagent.name as string, p_limit: 500 })).toHaveLength(0);
  expect((await scoped(t, fx)).length).toBe(aIds.size);
  // 직접 조회로도 학교 A 메모는 0행
  const direct = await b.client.from("usage_logs").select("id").in("id", [...aIds]);
  expect(direct.error ? [] : direct.data ?? []).toHaveLength(0);
});

test(`[N1-db][S10] anon 은 usage_history 호출 불가 (인자 조합 모두 오류·0행)`, async ({}, info) => {
  const fx = await fixture(info);
  const t = await signIn("teacher");
  // 대조군: 같은 인자로 로그인 사용자는 성공
  expect((await history(t, { p_limit: 5 })).length).toBeGreaterThan(0);
  const anon = anonClient();
  const variants: HistoryArgs[] = [
    {},
    { p_limit: 5 },
    { p_only_mine: false, p_since: null, p_query: null, p_limit: 5 },
    { p_only_mine: true },
    { p_query: fx.reagent.name as string },
  ];
  for (const args of variants) {
    const res = await historyRaw(anon, args);
    expect(res.error, `anon usage_history(${JSON.stringify(args)}) 는 오류여야 함`).not.toBeNull();
    expect(String(res.error?.code ?? ""), res.error?.message).not.toMatch(/^PGRST/);
    expect(Array.isArray(res.data) ? res.data : [], "anon 이 받은 행").toHaveLength(0);
  }
});

test(`[N1-db][S4] 학교B 교사가 학교 A 시약에 메모 있는 record_usage → 거부 (stock·usage_logs 그대로)`, async ({}, info) => {
  const fx = await fixture(info);
  const t = await signIn("teacher");
  const b = await signIn("schoolB");
  const id = fx.reagent.id as string;
  const stock = await stockOf(t, id);
  const logs = await fixtureLogCount(t, id);
  const memo = `${fx.tag} 학교B 침범`;
  const res = await rpc(b.client, "record_usage", { reagent_id: id, amount: 0.01, memo });
  expectRejected(res, "학교B → 학교 A 시약 record_usage(메모)");
  expect(await stockOf(t, id)).toBe(stock);
  expect(await fixtureLogCount(t, id)).toBe(logs);
  for (const s of [t, b]) {
    const leaked = await s.client.from("usage_logs").select("id").eq("memo", memo);
    expect(leaked.error ? [] : leaked.data ?? [], `${ROLE_LABEL[s.role]}에게 보이는 침범 메모 행`).toHaveLength(0);
  }
});

test(`[N1-db][S4] 학교A 교사·admin·학생이 학교 B 시약에 메모 있는 record_usage → 거부 (학교 B 에 그 메모 0행)`, async ({}, info) => {
  const fx = await fixture(info);
  const b = await signIn("schoolB");
  const target = (await allRows(b, "reagents", "id, stock"))[0];
  expect(target, "학교 B 시약 ≥1 (seed)").toBeTruthy();
  for (const role of SCHOOL_A_ROLES) {
    const s = await signIn(role);
    const memo = `${fx.tag} 학교A ${role} 침범`;
    const res = await rpc(s.client, "record_usage", { reagent_id: target.id, amount: 0.01, memo });
    expectRejected(res, `${ROLE_LABEL[role]} → 학교 B 시약 record_usage(메모)`);
    for (const viewer of [s, b]) {
      const leaked = await viewer.client.from("usage_logs").select("id").eq("memo", memo);
      expect(leaked.error ? [] : leaked.data ?? [], `${ROLE_LABEL[viewer.role]}에게 보이는 침범 메모 행`).toHaveLength(0);
    }
  }
});

// ======================================================================
// GM-db: 데모 학교 (d7 §5·§7 — 둘러보기에서 "기록" 은 잠금)
// ======================================================================

async function demoSnapshot(): Promise<{ logs: Row[]; reagents: Row[] }> {
  const anon = anonClient();
  const logs = await anon.from("usage_logs").select("*").order("id");
  expect(logs.error, `anon 데모 usage_logs: ${logs.error?.message}`).toBeNull();
  expect((logs.data ?? []).length, "anon 이 읽는 데모 usage_logs ≥1 (양성 대조군)").toBeGreaterThan(0);
  const reagents = await anon.from("reagents").select("*").order("id");
  expect(reagents.error, `anon 데모 reagents: ${reagents.error?.message}`).toBeNull();
  expect((reagents.data ?? []).length, "anon 이 읽는 데모 reagents ≥1").toBeGreaterThan(0);
  return { logs: (logs.data ?? []) as Row[], reagents: (reagents.data ?? []) as Row[] };
}

test(`[GM-db][S*] anon 은 usage_history 로 데모 학교 기록을 받지 못한다 (오류·0행)`, async () => {
  const demo = await demoSnapshot();
  const names = [...new Set(demo.reagents.map((r) => r.name as string))];
  const anon = anonClient();
  for (const args of [{}, { p_limit: 500 }, { p_query: names[0] }] as HistoryArgs[]) {
    const res = await historyRaw(anon, args);
    expect(res.error, `anon usage_history(${JSON.stringify(args)}) 는 오류여야 함`).not.toBeNull();
    expect(String(res.error?.code ?? ""), res.error?.message).not.toMatch(/^PGRST/);
    expect(Array.isArray(res.data) ? res.data : []).toHaveLength(0);
  }
});

for (const role of [...SCHOOL_A_ROLES, "schoolB"] as Role[]) {
  test(`[GM-db][S*] ${ROLE_LABEL[role]} usage_history 에 데모 학교 기록·시약 0행`, async () => {
    const demo = await demoSnapshot();
    const s = await signIn(role);
    const demoLogIds = new Set(demo.logs.map((r) => r.id as string));
    const demoReagentIds = new Set(demo.reagents.map((r) => r.id as string));
    expect(demoReagentIds.has(s.schoolId)).toBe(false);
    const logged = new Set(demo.logs.map((l) => l.reagent_id as string));
    const names = [...new Set(demo.reagents.filter((r) => logged.has(r.id as string)).map((r) => r.name as string))];
    expect(names.length, "기록이 있는 데모 시약 이름 ≥1").toBeGreaterThan(0);
    const variants: HistoryArgs[] = [{}, { p_limit: 500 }, { p_only_mine: true, p_limit: 500 }];
    for (const n of names) variants.push({ p_query: n, p_limit: 500 });
    for (const args of variants) {
      const rows = await history(s, args);
      const hit = rows.filter((r) => demoLogIds.has(r.id as string) || demoReagentIds.has(r.reagent_id as string));
      expect(hit, `usage_history(${JSON.stringify(args)}) 의 데모 학교 행`).toHaveLength(0);
    }
  });
}

for (const who of DIRECT_WRITERS) {
  const label = who === "anon" ? "anon" : ROLE_LABEL[who];
  test(`[GM-db][S*] ${label}로 데모 시약에 메모 있는 record_usage 거부 (데모 usage_logs·reagents 불변)`, async ({}, info) => {
    const before = await demoSnapshot();
    const client = who === "anon" ? anonClient() : (await signIn(who)).client;
    const memo = `GM-db-S10 ${uniqueTag(info)}`;
    const res = await rpc(client, "record_usage", { reagent_id: before.reagents[0].id, amount: 0.01, memo });
    expectRejected(res, `${label} 데모 시약 record_usage(메모)`);
    const after = await demoSnapshot();
    expect(after.logs, "데모 usage_logs 불변").toEqual(before.logs);
    expect(after.reagents, "데모 reagents 불변").toEqual(before.reagents);
    expect(after.logs.filter((l) => l.memo === memo)).toHaveLength(0);
  });
}

// ======================================================================
// R-db · 화면 10: usage_history 동작
// ======================================================================

for (const role of SCHOOL_A_ROLES) {
  test(`[R-db][S10] ${ROLE_LABEL[role]} usage_history: 자기 학교 전체 기록(다른 사용자 것 포함)을 본다, is_mine 은 호출자 기준`, async ({}, info) => {
    const fx = await fixture(info);
    const ids = fixtureIds(fx);
    const s = await signIn(role);
    expect(s.profileRole).toBe(role);

    const rows = await scoped(s, fx, { p_only_mine: false });
    expect(idsOf(rows).sort(), "이번 실행의 행(학생·교사·admin 이 쓴 것) 전부").toEqual([...ids].sort());
    for (const k of fx.order) {
      const c = fx.calls[k];
      const row = rows.find((r) => r.id === c.row?.id);
      expect(row?.is_mine, `${k}(${ROLE_LABEL[c.role]} 작성) is_mine`).toBe(c.role === role);
    }
    const mineCount = fx.order.filter((k) => fx.calls[k].role === role).length;
    expect(mineCount).toBeGreaterThanOrEqual(2);
    expect(rows.filter((r) => r.is_mine === true)).toHaveLength(mineCount);
    expect(rows.filter((r) => r.is_mine === false)).toHaveLength(ids.length - mineCount);

    // p_only_mine 을 안 준 기본 호출도 전체이고, is_mine 은 usage_logs.user_id = 호출자 와 일치
    const dflt = await history(s);
    expect(dflt.length).toBeGreaterThan(0);
    const direct = await logsById(s, idsOf(dflt));
    for (const row of dflt) {
      expect(typeof row.is_mine, "is_mine 은 boolean").toBe("boolean");
      expect(row.is_mine, `기본 호출 ${String(row.id)} is_mine`).toBe(direct.get(row.id as string)?.user_id === s.userId);
    }
    expect(dflt.some((r) => r.is_mine === false), "남의 기록도 보임").toBe(true);
  });

  test(`[R-db][S10] ${ROLE_LABEL[role]} usage_history p_only_mine=true: 자기 기록만 (모든 행 is_mine=true)`, async ({}, info) => {
    const fx = await fixture(info);
    fixtureIds(fx);
    const s = await signIn(role);
    const want = fx.order.filter((k) => fx.calls[k].role === role).map((k) => fx.calls[k].row?.id as string);
    expect(want.length).toBeGreaterThanOrEqual(2);
    expect(want.length).toBeLessThan(fx.order.length);

    const rows = await scoped(s, fx, { p_only_mine: true });
    expect(idsOf(rows).sort(), "이번 실행에서 내가 쓴 행만").toEqual([...want].sort());
    expect(rows.every((r) => r.is_mine === true)).toBe(true);

    const wide = await history(s, { p_only_mine: true, p_limit: 500 });
    expect(wide.length).toBeGreaterThanOrEqual(want.length);
    const direct = await logsById(s, idsOf(wide));
    for (const row of wide) {
      expect(row.is_mine, `${String(row.id)} is_mine`).toBe(true);
      expect(direct.get(row.id as string)?.user_id, `${String(row.id)} user_id = 호출자`).toBe(s.userId);
    }
  });
}

test(`[R-db][S10] usage_history 반환 값이 실제 값과 일치 (memo·amount·used_at·reagent_name·unit·msds_url·user_name)`, async ({}, info) => {
  const fx = await fixture(info);
  const ids = fixtureIds(fx);
  expect(fx.reagent.unit, "고정 시약 단위").toBe(FIX_UNIT);
  expect(fx.reagent.msds_url, "고정 시약 msds_url").toBe(FIX_MSDS);
  const names = new Map<Role, string>();
  for (const r of SCHOOL_A_ROLES) names.set(r, await displayName(await signIn(r)));
  expect(new Set(names.values()).size, "전제: 테스트 계정 이름이 서로 다름").toBe(SCHOOL_A_ROLES.length);

  for (const role of SCHOOL_A_ROLES) {
    const rows = await scoped(await signIn(role), fx);
    expect(rows).toHaveLength(ids.length);
    for (const k of fx.order) {
      const c = fx.calls[k];
      const row = rows.find((r) => r.id === c.row?.id) as Row;
      const what = `${ROLE_LABEL[role]}가 본 ${k}`;
      expect(row, what).toBeTruthy();
      for (const key of HISTORY_KEYS) expect(Object.keys(row), `${what} 열`).toContain(key);
      // 기대값은 usage_logs 에 실제로 저장된 값 (저장 규칙 자체는 [S4] 테스트가 본다)
      expect(row.memo ?? null, `${what} memo`).toBe(c.row?.memo ?? null);
      expect(Number(row.amount), `${what} amount`).toBe(c.amount);
      expect(micros(row.used_at), `${what} used_at`).toBe(micros(c.row?.used_at));
      expect(row.reagent_id, `${what} reagent_id`).toBe(fx.reagent.id);
      expect(row.reagent_name, `${what} reagent_name`).toBe(fx.reagent.name);
      expect(row.unit, `${what} unit`).toBe(FIX_UNIT);
      expect(row.msds_url, `${what} msds_url`).toBe(FIX_MSDS);
      expect(row.user_name, `${what} user_name = 작성자 display_name`).toBe(names.get(c.role));
    }
  }

  // 고정 시약이 아닌 행: 시약 값(name·unit·msds_url)·기록 값이 직접 읽은 값과 같다
  const t = await signIn("teacher");
  const reagents = new Map((await allRows(t, "reagents", "id, name, unit, msds_url")).map((r) => [r.id as string, r]));
  const dflt = await history(t);
  const direct = await logsById(t, idsOf(dflt));
  for (const row of dflt) {
    const r = reagents.get(row.reagent_id as string);
    const l = direct.get(row.id as string);
    expect(r, `시약 ${String(row.reagent_id)} 는 학교 A 것`).toBeTruthy();
    expect(row.reagent_name).toBe(r?.name);
    expect(row.unit).toBe(r?.unit);
    expect(row.msds_url ?? null).toBe(r?.msds_url ?? null);
    expect(l?.reagent_id).toBe(row.reagent_id);
    expect(Number(row.amount)).toBe(Number(l?.amount));
    expect(row.memo ?? null).toBe(l?.memo ?? null);
    expect(micros(row.used_at)).toBe(micros(l?.used_at));
  }
});

test(`[R-db][S10] usage_history 정렬: used_at 내림차순 (최신순)`, async ({}, info) => {
  const fx = await fixture(info);
  const ids = fixtureIds(fx);
  for (const role of ["student", "teacher"] as Role[]) {
    const s = await signIn(role);
    // 이번 실행 행: 기록한 순서의 역순
    expect(idsOf(await scoped(s, fx)), `${ROLE_LABEL[role]} 이번 실행 행 순서`).toEqual([...ids].reverse());
    for (const args of [{}, { p_limit: 500 }, { p_only_mine: true, p_limit: 500 }] as HistoryArgs[]) {
      const rows = await history(s, args);
      expect(rows.length).toBeGreaterThan(1);
      for (let i = 1; i < rows.length; i++) {
        expect(
          micros(rows[i - 1].used_at) >= micros(rows[i].used_at),
          `usage_history(${JSON.stringify(args)}) ${i - 1}→${i}: ${String(rows[i - 1].used_at)} ≥ ${String(rows[i].used_at)}`,
        ).toBe(true);
      }
    }
  }
});

test(`[R-db][S10] usage_history p_since: 그 시각 이후 기록만`, async ({}, info) => {
  const fx = await fixture(info);
  const ids = fixtureIds(fx);
  const s = await signIn("student");
  // 4번째 기록 시각을 기준으로: 5번째부터는 포함, 1~3번째는 제외 (경계인 4번째는 판정하지 않는다)
  const pivot = fx.calls[fx.order[3]].row?.used_at as string;
  const rows = await history(s, { p_query: fx.reagent.name as string, p_since: pivot, p_limit: 500 });
  const got = idsOf(rows);
  for (const id of ids.slice(4)) expect(got, "기준 시각 뒤 기록 포함").toContain(id);
  for (const id of ids.slice(0, 3)) expect(got, "기준 시각 앞 기록 제외").not.toContain(id);
  for (const row of rows) expect(micros(row.used_at) >= micros(pivot), `${String(row.used_at)} ≥ 기준`).toBe(true);

  // 시약 검색 없이도: 모든 행이 기준 시각 이후, 그 전 기록(학교 A 에 이미 많음)은 빠진다
  const wide = await history(s, { p_since: pivot, p_limit: 500 });
  for (const row of wide) expect(micros(row.used_at) >= micros(pivot), `${String(row.used_at)} ≥ 기준`).toBe(true);
  const noSince = await history(s, { p_limit: 500 });
  expect(noSince.some((r) => micros(r.used_at) < micros(pivot)), "대조군: p_since 없으면 더 오래된 기록도 있음").toBe(true);

  // 미래 시각 → 0행
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  expect(await history(s, { p_since: future, p_limit: 500 })).toHaveLength(0);
});

test(`[R-db][S10] usage_history p_query: 시약명 부분 일치, 대소문자 무시`, async ({}, info) => {
  const fx = await fixture(info);
  const ids = [...fixtureIds(fx)].sort();
  const s = await signIn("admin");
  const name = fx.reagent.name as string;
  const since = fx.since;

  // 앞·가운데·끝 조각, 대소문자를 바꾼 조각 → 모두 이번 실행 행 전부
  const pieces = [name, name.slice(0, 8), name.slice(3, 12), name.slice(-6), name.toLowerCase(), name.toUpperCase(), "s10-FIXTURE", `  ${name.slice(3, 12)}  `];
  for (const q of pieces) {
    const rows = await history(s, { p_query: q, p_since: since, p_limit: 500 });
    const mine = rows.filter((r) => r.reagent_id === fx.reagent.id);
    expect(idsOf(mine).sort(), `p_query=${JSON.stringify(q)}`).toEqual(ids);
    for (const row of rows) {
      expect(String(row.reagent_name).toLowerCase(), `p_query=${JSON.stringify(q)} 결과 시약명`).toContain(q.trim().toLowerCase());
    }
  }

  // 다른 시약의 이름 조각으로 찾으면: 결과는 그 조각을 가진 시약뿐, 고정 시약 행은 없음
  const other = (await history(s, { p_limit: 500 })).find((r) => r.reagent_id !== fx.reagent.id);
  expect(other, "대조군: 고정 시약이 아닌 기록(seed 시약)이 있음").toBeTruthy();
  const otherName = String(other?.reagent_name);
  const piece = otherName.length > 2 ? otherName.slice(1) : otherName;
  expect(name.toLowerCase()).not.toContain(piece.toLowerCase());
  const byOther = await history(s, { p_query: piece, p_limit: 500 });
  expect(idsOf(byOther), "그 기록이 결과에 있음").toContain(other?.id);
  for (const row of byOther) expect(String(row.reagent_name).toLowerCase()).toContain(piece.toLowerCase());
  expect(byOther.filter((r) => r.reagent_id === fx.reagent.id)).toHaveLength(0);

  // 어떤 시약명에도 없는 말 → 0행
  expect(await history(s, { p_query: `없는시약-${fx.tag}`, p_limit: 500 })).toHaveLength(0);
  // 빈 검색어는 걸러 내지 않는다 (부분 일치: 모든 이름이 해당)
  for (const q of ["", null]) {
    const rows = await history(s, { p_query: q, p_since: since, p_limit: 500 });
    for (const id of ids) expect(idsOf(rows), `p_query=${JSON.stringify(q)}`).toContain(id);
  }
});

test(`[R-db][S10] usage_history p_query 의 %·_·\\ 는 와일드카드가 아니라 글자 그대로`, async ({}, info) => {
  const fx = await fixture(info);
  const ids = [...fixtureIds(fx)].sort();
  const s = await signIn("teacher");
  const name = fx.reagent.name as string;
  expect(name).toContain("%");
  expect(name).toContain("_");
  const run = (q: string) => history(s, { p_query: q, p_since: fx.since, p_limit: 500 });

  // 글자 그대로 들어 있는 조각 → 이번 실행 행 전부 (다른 프로젝트의 고정 시약도 같은 조각을 가지므로 시약으로 거른다)
  for (const q of ["fixture_100%-", "_100%", "100%-", `_100%-${info.project.name}`]) {
    const rows = await run(q);
    expect(idsOf(rows.filter((r) => r.reagent_id === fx.reagent.id)).sort(), `p_query=${JSON.stringify(q)} (이름에 그대로 있음)`).toEqual(ids);
    for (const row of rows) expect(String(row.reagent_name), `p_query=${JSON.stringify(q)} 결과 시약명`).toContain(q);
  }
  // 와일드카드로 풀리면 맞지만 글자 그대로는 이름에 없는 조각 → 0행
  const wild = ["R_db", "S10_fixture", "R-db%fixture", "fixture%100", "S10%", "%-S10", "R-db-S10-fixture_100_", "_________", "%%"];
  for (const q of wild) {
    expect(name.toLowerCase().includes(q.toLowerCase()), `전제: ${q} 는 이름에 그대로는 없음`).toBe(false);
    const rows = (await run(q)).filter((r) => r.reagent_id === fx.reagent.id);
    expect(rows, `p_query=${JSON.stringify(q)} 가 와일드카드로 동작`).toHaveLength(0);
  }
  // % 하나·_ 하나: 그 글자가 이름에 있는 시약의 기록만 (전체가 나오면 와일드카드)
  for (const q of ["%", "_"]) {
    const rows = await history(s, { p_query: q, p_limit: 500 });
    expect(rows.length, `p_query=${JSON.stringify(q)}: 고정 시약 기록`).toBeGreaterThan(0);
    for (const row of rows) expect(String(row.reagent_name), `p_query=${JSON.stringify(q)} 결과 시약명`).toContain(q);
  }
  // 역슬래시: 오류 없이, 이름에 없으니 0행
  for (const q of ["\\", "\\%", "100\\%", "fixture\\_100"]) {
    const rows = (await run(q)).filter((r) => r.reagent_id === fx.reagent.id);
    expect(rows, `p_query=${JSON.stringify(q)}`).toHaveLength(0);
  }
});

test(`[R-db][S10] usage_history p_limit: 준 수만큼만(최신부터), 큰 값을 줘도 자기 학교 기록 수를 넘지 않는다`, async ({}, info) => {
  const fx = await fixture(info);
  const ids = fixtureIds(fx);
  const s = await signIn("student");
  const newestFirst = [...ids].reverse();

  for (const n of [1, 2, 3, 5]) {
    const rows = await scoped(s, fx, { p_limit: n });
    expect(idsOf(rows), `p_limit=${n}: 최신 ${n}행`).toEqual(newestFirst.slice(0, n));
  }
  // 남은 행보다 큰 값 → 있는 만큼만
  expect(idsOf(await scoped(s, fx, { p_limit: ids.length + 50 }))).toEqual(newestFirst);

  // 검색 없이: 학교 A 기록은 이번 실행 행보다 많다 → 정확히 n행
  for (const n of [1, 4, ids.length + 1]) {
    expect(await history(s, { p_limit: n }), `p_limit=${n}`).toHaveLength(n);
  }

  // 큰 값: 오류 없이, 자기 학교 기록 수 이하 · 기본 호출보다 적지 않다 · 중복 없음
  const total = (await allRows(s, "usage_logs", "id")).length;
  const dflt = await history(s);
  const huge = await history(s, { p_limit: 1_000_000 });
  expect(huge.length).toBeLessThanOrEqual((await allRows(s, "usage_logs", "id")).length);
  expect(huge.length).toBeGreaterThanOrEqual(Math.min(total, dflt.length));
  expect(new Set(idsOf(huge)).size, "행 중복 없음").toBe(huge.length);
  expect(dflt.length, "기본 호출도 자기 학교 기록 수 이하").toBeLessThanOrEqual((await allRows(s, "usage_logs", "id")).length);
});

// 파일 맨 끝에 둔다: 실패하면 워커가 새로 떠서 고정 기록(7행)을 다시 만드는데, 마지막 테스트면 다시 만들 일이 없다
// (usage_logs 는 지울 수 없으므로 실패 한 번이 잔여 행을 늘리지 않게).
test(`[R-db][S4] record_usage 메모 탭·줄바꿈·공백뿐(공백 문자만) → memo null (기록·차감은 정상)`, async ({}, info) => {
  const fx = await fixture(info);
  const c = fx.calls.wsOnlyMemo;
  expect(c.memoArg).toMatch(/[\t\n]/);
  expect(c.memoArg?.trim()).toBe("");
  expectSaved(c, await signIn(c.role), fx);
  expect(c.row?.memo).toBeNull();
});
