// [R-db][S7] · [N1-db][S7] · [GM-db][S*] — 서류로 입고 DB 함수 record_document_intake (harness/d7-data.md §21 저장 줄).
// 실제 RLS·함수 (publishable 키 + 각 계정 로그인 세션)로 판정한다. service role 은 준비·정리·대조 조회에만.
// 기준 (d7 §21): record_document_intake(p_intake_date date, p_items jsonb) 하나로 한 트랜잭션 —
//   연결 행 {reagent_id, amount} → record_intake 와 같은 처리(intake_logs·stock·intake_date, §11-1 자동 기준),
//   새 시약 행 {name, storage_class, unit, stock, msds_url} → register_reagent 와 같은 처리(§6: min_stock 0 → 자동, slot·cas null, 첫 재고 intake_logs 1행).
//   교사·admin·자기 학교·데모 거부, 항목 1~50, amount·stock > 0, 미래 날짜 거부, 하나라도 틀리면 전부 취소.
//   반환 = { intake_count, new_reagent_ids[] }.
//   오류 형태(42501 역할·데모 · 22023 값 · P0002 다른 학교·없는 시약 · 23505 이름 중복)는
//   supabase/migrations/20261008013300_record_document_intake.sql 머리말.
//
// 절대 규칙 (운영 DB):
// - 성공 경로·잘못된 인자는 일회용 학교(admin·교사·학생 — service role 로 생성 · 세션은 generateLink/verifyOtp)에서만.
// - 공용 계정(학교 A·B)·anon 은 "거부되어야 하는 호출"만 (일회용 학교·데모 학교 시약을 겨눈다 — 통과해도 공용 학교는 바뀌지 않는다).
// - afterAll: 일회용 계정·학교·시약·입고 기록 잔여 0, 데모 학교 시약 전체 그대로, 공용 학교 A·B 에 이 스펙의 이름·일회용 계정 입고 기록 0.
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type TestInfo } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anonClient, signIn, type Role } from "./db-helpers";
import { HAS_SERVICE, clientFor, service, type TempUser } from "./screen-8-helpers";
import { NO_S11_RESIDUE, cleanup, makeFixture, prepReagent, purgeSchool, type S11Fixture } from "./screen-11-helpers";
import { autoFromIntake } from "./reorder-auto-helpers";

test.describe.configure({ mode: "default" });

const GROUP = "docdb";
const FN = "record_document_intake";
const D7 = readFileSync(join(process.cwd(), "harness", "d7-data.md"), "utf8");
const S21 = D7.slice(D7.indexOf("## 21."), D7.indexOf("\n## ", D7.indexOf("## 21.") + 5));
const ITEMS_MAX = Number((/항목 1~(\d+)/.exec(S21) ?? [])[1]);
const CLASSES = (JSON.parse(readFileSync(join(process.cwd(), "design", "rules.json"), "utf8")) as { cabinet: { storage_classes: string[] } }).cabinet.storage_classes;
const DEMO_SCHOOL_ID = (() => {
  const m = readFileSync(join(process.cwd(), "lib", "supabase", "demo-data.ts"), "utf8").match(/export const DEMO_SCHOOL_ID\s*=\s*"([0-9a-f-]{36})"/);
  if (!m) throw new Error("lib/supabase/demo-data.ts 에서 DEMO_SCHOOL_ID 를 찾지 못했습니다");
  return m[1];
})();
/** 이 스펙이 새로 만드는 시약 이름 접두사 (공용 학교에 생기지 않았는지 대조) */
const NEW_PREFIX = "임시문서";
const URL1 = "https://msds.kosha.or.kr/MSDSInfo/kcic/msdsdetail.do?chem_id=000699&viewType=msds";

function kst(offset = 0): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + offset * 86_400_000));
}
const newName = (tag: string) => `${NEW_PREFIX}-${tag}-${randomBytes(3).toString("hex")}`;

type Row = Record<string, unknown>;
const RCOLS = "id, school_id, name, cas_no, unit, stock, min_stock, msds_url, slot_id, intake_date, storage_class, min_stock_source, min_stock_auto_basis";

async function reagentRow(id: string): Promise<Row | null> {
  const r = await service().from("reagents").select(RCOLS).eq("id", id).maybeSingle();
  if (r.error) throw new Error(`대조 조회 실패: ${r.error.message}`);
  return (r.data as Row | null) ?? null;
}
async function byName(schoolId: string, name: string): Promise<Row[]> {
  const r = await service().from("reagents").select(RCOLS).eq("school_id", schoolId).eq("name", name);
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []) as Row[];
}
async function logsOf(reagentId: string): Promise<Row[]> {
  const r = await service().from("intake_logs").select("id, school_id, reagent_id, user_id, amount, intake_date").eq("reagent_id", reagentId).order("created_at");
  if (r.error) throw new Error(r.error.message);
  return ((r.data ?? []) as Row[]).map((x) => ({ ...x, amount: Number(x.amount) }));
}
/** 학교 하나의 시약·입고 기록 전체 스냅숏 (전부 아니면 전부 확인) */
async function schoolState(schoolId: string): Promise<{ reagents: Row[]; logs: number }> {
  const r = await service().from("reagents").select(RCOLS).eq("school_id", schoolId).order("id");
  const l = await service().from("intake_logs").select("id").eq("school_id", schoolId);
  if (r.error || l.error) throw new Error(`대조 조회 실패: ${r.error?.message ?? l.error?.message}`);
  return { reagents: (r.data ?? []) as Row[], logs: (l.data ?? []).length };
}

// ---------- 일회용 학교 ----------
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
const tempUserIds = new Set<string>();

async function demoSnapshot(): Promise<Row[]> {
  const r = await service().from("reagents").select("*").eq("school_id", DEMO_SCHOOL_ID).order("id");
  if (r.error) throw new Error(r.error.message);
  const l = await service().from("intake_logs").select("id").eq("school_id", DEMO_SCHOOL_ID);
  return [...((r.data ?? []) as Row[]), { intake_logs: (l.data ?? []).length }];
}
let demoBefore: Row[] | null = null;

test.beforeAll(async () => {
  if (HAS_SERVICE) demoBefore = await demoSnapshot();
});
test.afterAll(async ({}, info) => {
  info.setTimeout(300_000);
  if (!HAS_SERVICE) return;
  fixtures.clear();
  clients.clear();
  const left = await cleanup(GROUP, info.project.name);
  expect(left, "일회용 계정·학교·시약·입고 기록 잔여물").toEqual(NO_S11_RESIDUE);
  if (demoBefore) expect(await demoSnapshot(), "데모 학교 시약·입고 기록 그대로").toEqual(demoBefore);
  // 공용 학교 A·B: 이 스펙 이름의 시약 0 · 일회용 계정의 입고 기록 0
  const shared = await service().from("schools").select("id").like("neis_code", "TEST-SCHOOL-%");
  const ids = (shared.data ?? []).map((s) => s.id as string);
  expect(ids.length, "대조: 공용 학교 A·B").toBeGreaterThanOrEqual(2);
  const leaked = await service().from("reagents").select("id").in("school_id", [...ids, DEMO_SCHOOL_ID]).like("name", `${NEW_PREFIX}-%`);
  expect(leaked.data ?? [], "공용·데모 학교에 이 스펙이 만든 이름의 시약 0").toHaveLength(0);
  if (tempUserIds.size) {
    const logs = await service().from("intake_logs").select("id").in("school_id", [...ids, DEMO_SCHOOL_ID]).in("user_id", [...tempUserIds]);
    expect(logs.data ?? [], "공용·데모 학교에 일회용 계정의 입고 기록 0").toHaveLength(0);
  }
});

const linked = (id: string, amount: unknown) => ({ reagent_id: id, amount });
const fresh = (name: string, o: Row = {}) => ({ name, storage_class: CLASSES[1], unit: "mL", stock: 500, msds_url: null, ...o });

test("[R-db][S7] 전제: d7 §21 항목 한도·rules 보관 분류를 읽었다", () => {
  expect(ITEMS_MAX, "d7 §21 항목 1~N").toBeGreaterThan(1);
  expect(CLASSES.length).toBeGreaterThan(1);
});

test.describe("일회용 학교", () => {
  test.skip(!HAS_SERVICE, "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)");
  test.beforeEach(() => test.setTimeout(300_000));

  for (const who of ["teacher", "admin"] as const) {
    test(`[R-db][S7] 일회용 ${who === "teacher" ? "교사" : "admin"} ${FN} 성공 (연결 2 + 새 시약 2, 소수 입고량): 반환 {intake_count, new_reagent_ids(항목 순서)} · 연결 시약 stock += amount · intake_date = 입고일 · 자동 기준 = 이번 입고량 × 20% · intake_logs 1행씩(자기 user·학교) · 새 시약 행(자기 학교·분류·단위·재고·MSDS·slot/cas null·자동 기준) + 첫 재고 intake_logs`, async ({}, info) => {
      const f = await fixture(info, "a");
      const u = who === "teacher" ? f.teacher : f.admin;
      tempUserIds.add(u.id);
      const c = await as(u);
      const x = await prepReagent(f, `x-${who}`, 10, "mL", CLASSES[1]);
      const y = await prepReagent(f, `y-${who}`, 3, "병", CLASSES[0]);
      const xBefore = (await reagentRow(x.id))!;
      expect(xBefore.min_stock_source, "전제: 등록 시약은 자동 기준").toBe("auto");
      const date = kst(-3);
      const n1 = newName("산");
      const n2 = newName("기타");
      const res = await c.rpc(FN, {
        p_intake_date: date,
        p_items: [linked(x.id, 2.5), fresh(n1, { storage_class: CLASSES[1], unit: "mL", stock: 1000, msds_url: URL1 }), linked(y.id, 4), fresh(n2, { storage_class: CLASSES[CLASSES.length - 1], unit: "병", stock: 2 })],
      });
      expect(res.error, `${FN} (${res.error?.code} ${res.error?.message})`).toBeNull();
      const out = res.data as { intake_count: number; new_reagent_ids: string[] };
      expect(out.intake_count, "intake_count = 항목 수").toBe(4);
      expect(out.new_reagent_ids, "new_reagent_ids 2개").toHaveLength(2);

      // 연결 행
      for (const [r, amount, start] of [[x, 2.5, 10], [y, 4, 3]] as const) {
        const now = (await reagentRow(r.id))!;
        expect(Number(now.stock), `${r.name} stock`).toBe(start + amount);
        expect(now.intake_date, `${r.name} intake_date`).toBe(date);
        expect([Number(now.min_stock), now.min_stock_source, now.min_stock_auto_basis], `${r.name} 자동 기준 (d7 §11-1)`).toEqual([autoFromIntake(amount), "auto", "intake"]);
        const logs = await logsOf(r.id);
        expect(logs, `${r.name} intake_logs = 등록 1 + 이번 1`).toHaveLength(2);
        expect(logs[1]).toMatchObject({ school_id: f.school.id, user_id: u.id, amount, intake_date: date });
      }
      const { stock: _s, intake_date: _d, min_stock: _m, min_stock_auto_basis: _b, ...rest } = (await reagentRow(x.id))!;
      const { stock: _s2, intake_date: _d2, min_stock: _m2, min_stock_auto_basis: _b2, ...restBefore } = xBefore;
      void [_s, _d, _m, _b, _s2, _d2, _m2, _b2];
      expect(rest, "연결 시약의 다른 열 그대로").toEqual(restBefore);

      // 새 시약 행 (항목 순서)
      for (const [i, name, cls, unit, stock, url] of [
        [0, n1, CLASSES[1], "mL", 1000, URL1],
        [1, n2, CLASSES[CLASSES.length - 1], "병", 2, null],
      ] as const) {
        const rows = await byName(f.school.id, name);
        expect(rows, `새 시약 ${name} 1행`).toHaveLength(1);
        const r = rows[0];
        expect(r.id, "new_reagent_ids 순서 = 항목 순서").toBe(out.new_reagent_ids[i]);
        expect({ school: r.school_id, cls: r.storage_class, unit: r.unit, stock: Number(r.stock), url: r.msds_url, slot: r.slot_id, cas: r.cas_no, date: r.intake_date }).toEqual({
          school: f.school.id,
          cls,
          unit,
          stock,
          url,
          slot: null,
          cas: null,
          date,
        });
        expect([Number(r.min_stock), r.min_stock_source, r.min_stock_auto_basis], "새 시약 자동 기준 = 첫 재고 × 20%").toEqual([autoFromIntake(stock), "auto", "intake"]);
        const logs = await logsOf(r.id as string);
        expect(logs, "첫 재고 intake_logs 1행").toHaveLength(1);
        expect(logs[0]).toMatchObject({ school_id: f.school.id, user_id: u.id, amount: stock, intake_date: date });
        // 자기 세션(RLS)으로도 보인다
        const mine = await c.from("reagents").select("id").eq("id", r.id as string);
        expect(mine.data ?? []).toHaveLength(1);
      }
    });
  }

  test(`[R-db][S7] 일회용 교사 ${FN}: 오늘 날짜 성공 · 항목 ${ITEMS_MAX}개(같은 시약 ${ITEMS_MAX}번) 성공 → stock += 합 · intake_logs ${ITEMS_MAX}행 / ${ITEMS_MAX + 1}개 · 0개 거부(22023)`, async ({}, info) => {
    const f = await fixture(info, "a");
    const c = await as(f.teacher);
    tempUserIds.add(f.teacher.id);
    const x = await prepReagent(f, "max", 1, "g", CLASSES[2]);
    const before = await schoolState(f.school.id);
    for (const [label, items] of [
      [`${ITEMS_MAX + 1}개`, Array.from({ length: ITEMS_MAX + 1 }, () => linked(x.id, 1))],
      ["0개", []],
    ] as const) {
      const r = await c.rpc(FN, { p_intake_date: kst(), p_items: items });
      expect(r.error?.code, `${label} → 22023 (${r.error?.message})`).toBe("22023");
    }
    expect(await schoolState(f.school.id), "거부 뒤 학교 그대로").toEqual(before);
    const ok = await c.rpc(FN, { p_intake_date: kst(), p_items: Array.from({ length: ITEMS_MAX }, () => linked(x.id, 1)) });
    expect(ok.error, `${ITEMS_MAX}개 (${ok.error?.message})`).toBeNull();
    expect(ok.data).toEqual({ intake_count: ITEMS_MAX, new_reagent_ids: [] });
    const now = (await reagentRow(x.id))!;
    expect([Number(now.stock), now.intake_date]).toEqual([1 + ITEMS_MAX, kst()]);
    expect(await logsOf(x.id), `intake_logs 등록 1 + ${ITEMS_MAX}`).toHaveLength(1 + ITEMS_MAX);
  });

  test(`[R-db][S7] 일회용 교사 ${FN} 전부 아니면 전부: 앞 항목이 맞아도 뒤 항목이 틀리면 (값 22023 · 없는 시약 P0002 · 있는 이름 23505 · 같은 서류 안 같은 이름 23505) 학교의 시약·입고 기록 하나도 안 바뀜`, async ({}, info) => {
    const f = await fixture(info, "a");
    await purgeSchool(f.school.id);
    const c = await as(f.teacher);
    const x = await prepReagent(f, "atomic", 10, "mL", CLASSES[1], "염산");
    const before = await schoolState(f.school.id);
    const n = newName("원자");
    const cases: [string, string, unknown[]][] = [
      ["뒤 항목 amount 0", "22023", [linked(x.id, 5), fresh(n), linked(x.id, 0)]],
      ["뒤 항목 새 시약 분류 밖", "22023", [linked(x.id, 5), fresh(n), fresh(newName("b"), { storage_class: "강산" })]],
      ["뒤 항목 없는 시약 id", "P0002", [linked(x.id, 5), fresh(n), linked(randomUUID(), 1)]],
      ["뒤 항목 이미 있는 이름(대소문자·앞뒤 공백 다름)", "23505", [linked(x.id, 5), fresh(n), fresh(" 염산 ")]],
      ["같은 서류 안 같은 이름 (대소문자만 다름)", "23505", [linked(x.id, 5), fresh(`${n}A`), fresh(`${n}a`)]],
    ];
    for (const [label, code, items] of cases) {
      const r = await c.rpc(FN, { p_intake_date: kst(-1), p_items: items });
      expect(r.error?.code, `${label} → ${code} (${r.error?.message})`).toBe(code);
      expect(r.data ?? null, `${label}: 반환 없음`).toBeNull();
      expect(await schoolState(f.school.id), `${label}: 시약·입고 기록 그대로`).toEqual(before);
    }
  });

  test(`[R-db][S7] 일회용 교사 ${FN} 값 검증 (22023, 아무것도 안 바뀜): 미래 날짜·날짜 없음 · amount 0/음수/문자/null/없음/100만 초과 · stock 0/음수/문자 · 이름 빔/81자 · 단위 kg · MSDS javascript: · reagent_id 와 name 둘 다 · 둘 다 없음 · 배열 아님 / 오늘 이전 0.001 은 성공`, async ({}, info) => {
    const f = await fixture(info, "a");
    const c = await as(f.teacher);
    const x = await prepReagent(f, "val", 5, "g", CLASSES[3]);
    const before = await schoolState(f.school.id);
    const bad: [string, unknown, unknown][] = [
      ["내일", kst(1), [linked(x.id, 1)]],
      ["날짜 null", null, [linked(x.id, 1)]],
      ["amount 0", kst(), [linked(x.id, 0)]],
      ["amount -1", kst(), [linked(x.id, -1)]],
      ['amount "5"(문자)', kst(), [linked(x.id, "5")]],
      ["amount null", kst(), [linked(x.id, null)]],
      ["amount 없음", kst(), [{ reagent_id: x.id }]],
      ["amount 1000001", kst(), [linked(x.id, 1_000_001)]],
      ["stock 0", kst(), [fresh(newName("s0"), { stock: 0 })]],
      ["stock -3", kst(), [fresh(newName("s1"), { stock: -3 })]],
      ['stock "5"', kst(), [fresh(newName("s2"), { stock: "5" })]],
      ["이름 공백", kst(), [fresh("   ")]],
      ["이름 81자", kst(), [fresh("가".repeat(81))]],
      ["단위 kg", kst(), [fresh(newName("u"), { unit: "kg" })]],
      ["분류 null", kst(), [fresh(newName("c"), { storage_class: null })]],
      ["MSDS javascript:", kst(), [fresh(newName("m"), { msds_url: "javascript:alert(1)" })]],
      ["reagent_id 와 name 둘 다", kst(), [{ ...fresh(newName("both")), reagent_id: x.id, amount: 1 }]],
      ["둘 다 없음", kst(), [{ amount: 1 }]],
      ["reagent_id uuid 아님", kst(), [linked("not-a-uuid", 1)]],
      ["항목이 객체 아님", kst(), [3]],
      ["p_items 객체", kst(), { reagent_id: x.id, amount: 1 }],
    ];
    for (const [label, date, items] of bad) {
      const r = await c.rpc(FN, { p_intake_date: date, p_items: items });
      expect(r.error?.code, `${label} → 22023 (${r.error?.message})`).toBe("22023");
    }
    expect(await schoolState(f.school.id), "거부 뒤 시약·입고 기록 그대로").toEqual(before);
    const ok = await c.rpc(FN, { p_intake_date: kst(-30), p_items: [linked(x.id, 0.001)] });
    expect(ok.error, `0.001 · 30일 전 (${ok.error?.message})`).toBeNull();
    expect(Number((await reagentRow(x.id))!.stock)).toBe(5.001);
  });

  test(`[R-db][S7] ${FN} 거부: 일회용 학생 42501 · anon 거부 · 공용 학교 A 학생 42501 — 이 학교 시약·입고 기록 그대로`, async ({}, info) => {
    const f = await fixture(info, "a");
    tempUserIds.add(f.student.id);
    const x = await prepReagent(f, "deny", 5, "mL", CLASSES[1]);
    const before = await schoolState(f.school.id);
    const items = [linked(x.id, 1), fresh(newName("deny"))];
    const st = await (await as(f.student)).rpc(FN, { p_intake_date: kst(), p_items: items });
    expect(st.error?.code, `일회용 학생 → 42501 (${st.error?.message})`).toBe("42501");
    const an = await anonClient().rpc(FN, { p_intake_date: kst(), p_items: items });
    expect(an.error, "anon → 오류").not.toBeNull();
    expect(["42501", "PGRST202"], `anon 오류 코드 (${an.error?.code} ${an.error?.message})`).toContain(an.error?.code);
    const pub = await (await signIn("student")).client.rpc(FN, { p_intake_date: kst(), p_items: items });
    expect(pub.error?.code, `공용 학교 A 학생 → 42501 (${pub.error?.message})`).toBe("42501");
    expect(await schoolState(f.school.id), "거부 뒤 그대로").toEqual(before);
  });

  test(`[N1-db][S7] ${FN}: 다른 학교(일회용 학교 B'·공용 학교 B·공용 학교 A) 교사·admin 이 이 학교 시약을 넣으면 P0002 — 같은 호출의 새 시약도 생기지 않음 · 이 학교 그대로 / B' 교사 자기 학교 성공(양성 대조, school_id 인자를 붙여도 자기 학교)`, async ({}, info) => {
    const a = await fixture(info, "a");
    const b = await fixture(info, "b");
    expect(b.school.id).not.toBe(a.school.id);
    tempUserIds.add(b.teacher.id);
    tempUserIds.add(b.admin.id);
    const x = await prepReagent(a, "n1", 5, "mL", CLASSES[1]);
    const before = await schoolState(a.school.id);
    const bBefore = await schoolState(b.school.id);
    const attackers: [string, SupabaseClient][] = [
      ["학교 B' 교사", await as(b.teacher)],
      ["학교 B' admin", await as(b.admin)],
      ...(await Promise.all((["schoolB", "teacher", "admin"] as Role[]).map(async (r) => [`공용 ${r}`, (await signIn(r)).client] as [string, SupabaseClient]))),
    ];
    for (const [label, c] of attackers) {
      const nm = newName("n1");
      const r = await c.rpc(FN, { p_intake_date: kst(), p_items: [fresh(nm), linked(x.id, 3)] });
      expect(r.error?.code, `${label} → P0002 (${r.error?.message})`).toBe("P0002");
      const made = await service().from("reagents").select("id").eq("name", nm);
      expect(made.data ?? [], `${label}: 같은 호출의 새 시약도 어디에도 없음`).toHaveLength(0);
    }
    expect(await schoolState(a.school.id), "이 학교 시약·입고 기록 그대로").toEqual(before);
    expect(await schoolState(b.school.id), "학교 B' 도 그대로").toEqual(bBefore);

    // 양성 대조 + school_id 를 끼워 넣어도 호출자 학교
    const own = await prepReagent(b, "own", 2, "g", CLASSES[0]);
    const nm = newName("b-own");
    const ok = await (await as(b.teacher)).rpc(FN, { p_intake_date: kst(), p_items: [linked(own.id, 1), { ...fresh(nm), school_id: a.school.id }] });
    expect(ok.error, `B' 교사 자기 학교 (${ok.error?.message})`).toBeNull();
    expect(await byName(a.school.id, nm), "학교 A' 에 생기지 않음").toHaveLength(0);
    const inB = await byName(b.school.id, nm);
    expect(inB, "호출자 학교 B' 에 1행").toHaveLength(1);
    // 학교 A' 계정 세션(RLS)으로는 B' 의 새 시약·입고 기록이 0행
    const ac = await as(a.teacher);
    expect((await ac.from("reagents").select("id").eq("id", inB[0].id as string)).data ?? [], "A' 교사 → B' 새 시약 0행").toHaveLength(0);
    expect((await ac.from("intake_logs").select("id").eq("reagent_id", inB[0].id as string)).data ?? [], "A' 교사 → B' 입고 기록 0행").toHaveLength(0);
  });

  test(`[GM-db][S*] ${FN}: 데모 학교 시약 — anon·일회용 교사·공용 교사 모두 거부 (P0002 / anon 권한 오류), 데모 시약·입고 기록 그대로`, async ({}, info) => {
    const f = await fixture(info, "a");
    const demo = await anonClient().from("reagents").select("id").eq("school_id", DEMO_SCHOOL_ID).order("id").limit(2);
    expect(demo.error).toBeNull();
    expect((demo.data ?? []).length, "anon 이 보는 데모 시약 ≥ 1").toBeGreaterThan(0);
    const before = await demoSnapshot();
    for (const d of demo.data ?? []) {
      const items = [linked(d.id as string, 1)];
      const an = await anonClient().rpc(FN, { p_intake_date: kst(), p_items: items });
      expect(an.error, "anon → 거부").not.toBeNull();
      const t = await (await as(f.teacher)).rpc(FN, { p_intake_date: kst(), p_items: items });
      expect(t.error?.code, `일회용 교사 → P0002 (${t.error?.message})`).toBe("P0002");
      const s = await (await signIn("teacher")).client.rpc(FN, { p_intake_date: kst(), p_items: items });
      expect(s.error?.code, `공용 교사 → P0002 (${s.error?.message})`).toBe("P0002");
    }
    // anon 이 새 시약만 넣으려 해도 거부 (데모 학교에 생기지 않음)
    const nm = newName("demo");
    const an2 = await anonClient().rpc(FN, { p_intake_date: kst(), p_items: [fresh(nm)] });
    expect(an2.error, "anon 새 시약 → 거부").not.toBeNull();
    expect(await demoSnapshot(), "데모 시약·입고 기록 그대로").toEqual(before);
  });
});
