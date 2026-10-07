// 화면 2 시약 목록 필터·정렬 (d7 §16, 2026-10-07 — design/rules.json 1.17 list_filter · variants["2"].filter·filter-empty) C1 · V1.
// 기준(구현이 아니라 여기서 도출): design/rules.json list_filter(entry · sheet 순서·문구 · chips · empty · roles) · cabinet.storage_classes ·
//       button.min_height · tab_bar, harness/d7-data.md §16(정렬 기준 · AND · 칩 · 결과 0 · 주소창 · 모든 역할·둘러보기 같음),
//       design/frames/2-filter-*.json · 2-filter-empty-*.json(시안 상태).
// 기대 목록은 그 계정 세션(publishable 키 + RLS)으로 읽은 시약에 d7 §16 규칙을 이 파일 안에서 적용해 만든다.
//
// 데이터: 일회용 학교(admin·교사·학생, service role 로 생성 — screen-11-helpers makeFixture)에 이 파일 전용 시약 6종·시약장 2개를 둔다
//   (이름·재고·입고일·분류·칸·MSDS 를 정해 정렬 동률·분류 없음·칸 없음·MSDS 없음·결과 0 을 모두 만든다). 화면 동작은 쓰기를 하지 않는다.
// 둘러보기(/demo/reagents, [S2g])는 anon 데모 학교 데이터로 같은 동작을 본다. 공용 학교 A·B·데모 데이터는 바꾸지 않는다.
import { join } from "node:path";
import { test, expect, type Browser, type Locator, type Page, type TestInfo } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anonClient } from "./db-helpers";
import { guestRouteOf, openGuest, waitGuestShell } from "./guest-helpers";
import { routeOf, rules, sel } from "./screen-helpers";
import { HAS_SERVICE, clientFor, openTemp, service, type TempUser } from "./screen-8-helpers";
import { DOUBLE, SINGLE, cleanup, makeFixture, prepCabinet, prepLayout, prepPlace, sharedCabinetSnapshot, type S11Fixture, NO_S11_RESIDUE } from "./screen-11-helpers";

test.describe.configure({ mode: "default" });

const SCREEN = 2;
const GROUP = "s2f";
const TIMEOUT = 240_000;
const NO_SERVICE_REASON = "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)";

// ---------- 기대값: rules.json ----------
const LF = (rules as unknown as { list_filter: Record<string, string> }).list_filter;
const CLASSES = (rules as unknown as { cabinet: { storage_classes: string[] } }).cabinet.storage_classes;
const MIN_H = (rules as unknown as { button: { min_height: number } }).button.min_height;
const TAB = rules.tab_bar;
/** list_filter.sheet "정렬(이름순 기본·재고 적은 순·최근 입고순)" */
const SORT_LABELS = (/정렬\(([^)]+)\)/.exec(LF.sheet)?.[1] ?? "").split("·").map((s) => s.replace(/\s*기본$/, "").trim());
const SORT_KEYS = ["name", "stock", "intake"] as const;
type SortKey = (typeof SORT_KEYS)[number];
/** 주소창 정렬 값 (d7 §16 상태 = 주소창 — 쿼리 이름·값은 구현 계약: ?sort=stock|intake, 기본 이름순은 쿼리 없음) */
const SORT_PARAM: Record<SortKey, string | null> = { name: null, stock: "stock", intake: "intake" };
const QUOTED = [...LF.sheet.matchAll(/'([^']+)'/g)].map((m) => m[1]);
const NO_CLASS_TEXT = QUOTED.find((q) => q.startsWith("분류"))!;
const NO_SLOT_TEXT = QUOTED.find((q) => q.startsWith("칸 없음"))!;
const NO_MSDS_TEXT = QUOTED.find((q) => q.startsWith("MSDS"))!;
const RESET_TEXT = QUOTED.find((q) => q === "초기화")!;
const APPLY_RE = /^\s*(\d+)종 보기\s*$/;
const EMPTY_TITLE = (/'([^']+)'/.exec(LF.empty) ?? [])[1];
const CLEAR_FILTERS = [...LF.empty.matchAll(/'([^']+)'/g)].map((m) => m[1])[1];
const CLEAR_ALL = (/'([^']+)'/.exec(LF.chips) ?? [])[1];
const SECTION_ORDER = ["정렬", "보관 분류", "보관 위치"];

// ---------- 화면 locator ----------
const main = (page: Page) => page.locator("main");
const button = (page: Page) => main(page).locator(sel("list-filter-button"));
const sheet = (page: Page) => page.locator(sel("list-filter-sheet"));
const chipRow = (page: Page) => main(page).locator(sel("filter-chip-row"));
const emptyCard = (page: Page) => main(page).locator(sel("ex-empty-state-card"));
const rowsOf = (page: Page) => main(page).locator(sel("reagent-row"));
const exact = (s: string) => new RegExp(`^\\s*${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);

/** 목록 행의 시약명 (행의 첫 글자 조각) */
async function shownNames(page: Page): Promise<string[]> {
  return rowsOf(page).evaluateAll((els) =>
    els.map((el) => {
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const t = (n.textContent ?? "").replace(/\s+/g, " ").trim();
        if (t) return t;
      }
      return "";
    }),
  );
}

async function waitList(page: Page): Promise<void> {
  await expect(button(page), "list-filter-button").toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("load");
  await page.waitForFunction(
    (s) => {
      const b = document.querySelector(s);
      return !!b && Object.keys(b).some((k) => k.startsWith("__reactProps"));
    },
    `main ${sel("list-filter-button")}`,
    { timeout: 30_000 },
  );
}

async function openSheet(page: Page): Promise<Locator> {
  await expect(async () => {
    if ((await sheet(page).count()) === 0) await button(page).click();
    await expect(sheet(page)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  return sheet(page);
}

const sortOption = (s: Locator, label: string) => s.getByRole("radio", { name: exact(label) });
const classChip = (s: Locator, label: string) => s.locator(sel("storage-class-chip")).filter({ hasText: exact(label) });
const switchOf = (s: Locator, label: string) => s.getByRole("switch", { name: exact(label) });
const applyButton = (s: Locator) => s.locator(sel("button-primary")).filter({ hasText: APPLY_RE });
const resetButton = (s: Locator) => s.locator(sel("button-outline")).filter({ hasText: exact(RESET_TEXT) });
/** 보관 위치: 첫 드롭다운 = 시약장, 둘째 = 칸 (rules list_filter.sheet "시약장 번호·이름 → 칸") */
const locationSelects = (s: Locator) => s.locator("select");

async function applyCount(s: Locator): Promise<number> {
  return Number(APPLY_RE.exec(await applyButton(s).innerText())![1]);
}

async function apply(page: Page): Promise<void> {
  await applyButton(sheet(page)).click();
  await expect(sheet(page), "적용하면 시트가 닫힌다").toHaveCount(0);
}

/** 적용된 칩 = filter-chip-row 의 목록 항목 중 × 가 있는 것 (모두 지우기 제외) */
const appliedChips = (page: Page) => chipRow(page).getByRole("listitem").filter({ hasNot: page.getByText(exact(CLEAR_ALL)) });
async function chipLabels(page: Page): Promise<string[]> {
  if ((await chipRow(page).count()) === 0) return [];
  return (await appliedChips(page).allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
}

/** 쓰기 요청 (GET 이 아닌 요청) 수 */
function watchWrites(page: Page): () => string[] {
  const out: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET" && r.method() !== "HEAD" && r.method() !== "OPTIONS") out.push(`${r.method()} ${r.url()}`);
  });
  return () => out;
}

// ---------- 기대값: d7 §16 를 이 파일에서 따로 ----------
type DbItem = {
  id: string;
  name: string;
  stock: number;
  low: boolean;
  intake: string | null;
  cls: string | null;
  slot: { cabinetId: string; key: string } | null;
  msds: boolean;
};
type DbCab = { id: string; number: number; label: string; door: string; shelves: number };
type Cond = { classes?: (string | null)[]; cab?: string; slot?: string; noSlot?: boolean; noMsds?: boolean; low?: boolean; q?: string };

async function dbItems(c: SupabaseClient, schoolId: string | null): Promise<{ items: DbItem[]; cabs: DbCab[] }> {
  let rq = c.from("reagents").select("id, name, stock, min_stock, intake_date, storage_class, msds_url, slot:cabinet_slots(side, shelf, cabinet_id)");
  let cq = c.from("cabinets").select("id, number, label, door_type, shelves");
  if (schoolId) {
    rq = rq.eq("school_id", schoolId);
    cq = cq.eq("school_id", schoolId);
  }
  const [r, cb] = await Promise.all([rq, cq.order("number")]);
  expect(r.error, `reagents 읽기: ${r.error?.message}`).toBeNull();
  expect(cb.error, `cabinets 읽기: ${cb.error?.message}`).toBeNull();
  const items = ((r.data ?? []) as Record<string, unknown>[]).map((x) => {
    const s = (Array.isArray(x.slot) ? x.slot[0] : x.slot) as { side: string; shelf: number; cabinet_id: string } | null;
    return {
      id: x.id as string,
      name: x.name as string,
      stock: Number(x.stock),
      low: Number(x.stock) < Number(x.min_stock),
      intake: (x.intake_date as string | null) ?? null,
      cls: (x.storage_class as string | null) ?? null,
      slot: s ? { cabinetId: s.cabinet_id, key: `${s.side}${s.shelf}` } : null,
      msds: typeof x.msds_url === "string" && x.msds_url.trim() !== "",
    };
  });
  const cabs = ((cb.data ?? []) as Record<string, unknown>[]).map((x) => ({ id: x.id as string, number: Number(x.number), label: x.label as string, door: x.door_type as string, shelves: Number(x.shelves) }));
  return { items, cabs };
}

const ko = (a: string, b: string) => a.localeCompare(b, "ko");
function sortItems(items: DbItem[], sort: SortKey): DbItem[] {
  const byName = (a: DbItem, b: DbItem) => ko(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const out = [...items];
  if (sort === "name") return out.sort(byName);
  if (sort === "stock") return out.sort((a, b) => a.stock - b.stock || byName(a, b));
  return out.sort((a, b) => {
    if (a.intake === b.intake) return byName(a, b);
    if (a.intake === null) return 1;
    if (b.intake === null) return -1;
    return a.intake < b.intake ? 1 : -1;
  });
}
function filterItems(items: DbItem[], c: Cond): DbItem[] {
  return items.filter((r) => {
    if (c.low && !r.low) return false;
    if (c.q && !r.name.toLowerCase().includes(c.q.toLowerCase())) return false;
    if (c.classes?.length && !c.classes.includes(r.cls)) return false;
    if (c.noSlot) {
      if (r.slot) return false;
    } else if (c.cab) {
      if (!r.slot || r.slot.cabinetId !== c.cab) return false;
      if (c.slot && r.slot.key !== c.slot) return false;
    }
    if (c.noMsds && r.msds) return false;
    return true;
  });
}
const expected = (items: DbItem[], c: Cond, sort: SortKey = "name") => sortItems(filterItems(items, c), sort).map((r) => r.name);

async function expectList(page: Page, want: string[], what: string): Promise<void> {
  await expect.poll(() => shownNames(page), { message: `${what}: 목록 = DB(d7 §16)`, timeout: 15_000 }).toEqual(want);
  if (want.length === 0) await expect(emptyCard(page), `${what}: 결과 0 → ex-empty-state-card`).toHaveCount(1);
  else await expect(emptyCard(page), `${what}: 결과가 있으면 빈 상태 없음`).toHaveCount(0);
}

/** 칩 수 = 버튼 배지 숫자, 결과 수 "N종" */
async function expectChips(page: Page, n: number, results: number, what: string): Promise<void> {
  if (n === 0) {
    await expect(chipRow(page), `${what}: 적용 필터 0 → filter-chip-row 없음`).toHaveCount(0);
    await expect(button(page), `${what}: 배지 없음`).toHaveText(exact("필터"));
    return;
  }
  await expect(chipRow(page), `${what}: filter-chip-row`).toHaveCount(1);
  await expect(appliedChips(page), `${what}: 칩 ${n}개`).toHaveCount(n);
  await expect(chipRow(page).getByRole("button", { name: exact(CLEAR_ALL) }), `${what}: "${CLEAR_ALL}"`).toHaveCount(1);
  await expect(chipRow(page), `${what}: 결과 수 "${results}종"`).toContainText(`${results}종`);
  await expect(button(page), `${what}: 버튼 배지 = 칩 수 ${n}`).toHaveText(new RegExp(`^\\s*필터\\s*${n}\\s*$`));
}

const box = async (l: Locator) => (await l.boundingBox())!;
async function expectTall(l: Locator, what: string): Promise<void> {
  const n = await l.count();
  expect(n, `${what} 있음`).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) expect((await box(l.nth(i))).height, `${what}[${i}] 누름 높이 ≥ ${MIN_H}`).toBeGreaterThanOrEqual(MIN_H - 0.5);
}

// ---------- 일회용 학교 데이터 ----------
type Prepared = { f: S11Fixture; c1: DbCab; c2: DbCab };
let prepCache: Promise<Prepared> | null = null;

/** 시약 6종 — 재고 동률(3)·입고일 동률(2026-09-10 · 2026-03-02)·분류 없음·칸 없음·MSDS 없음·재고 부족 1 (intake_date 는 not null 이라 "입고일 없음"은 만들 수 없다) */
const SEED: { name: string; stock: number; intake: string | null; cls: string | null; cab: 1 | 2 | null; key?: string; msds: boolean; min?: number }[] = [
  { name: "가성칼륨", stock: 5, intake: "2026-03-02", cls: "염기", cab: 1, key: "L1", msds: true },
  { name: "나트륨", stock: 1, intake: "2026-09-10", cls: "산", cab: 1, key: "R1", msds: false, min: 2 },
  { name: "다이크롬산", stock: 3, intake: "2026-03-02", cls: "독성", cab: 2, key: "L2", msds: true },
  { name: "마그네슘", stock: 3, intake: "2026-09-10", cls: "산", cab: null, msds: false },
  { name: "바륨염", stock: 10, intake: "2026-01-15", cls: null, cab: null, msds: true },
  { name: "사과산", stock: 2, intake: "2026-05-05", cls: "유기", cab: 1, key: "L1", msds: false },
];

function prepared(info: TestInfo): Promise<Prepared> {
  prepCache ??= (async () => {
    const f = await makeFixture(info, GROUP);
    const a = await prepCabinet(f);
    await prepLayout(f, a.id, DOUBLE, 3, {});
    const b = await prepCabinet(f);
    await prepLayout(f, b.id, SINGLE, 3, {});
    const teacher = await clientFor(f.teacher);
    for (const s of SEED) {
      const res = await f.prep.rpc("register_reagent", {
        p_name: s.name,
        p_storage_class: s.cls ?? CLASSES[CLASSES.length - 1],
        p_stock: s.stock,
        p_unit: "g",
        p_intake_date: s.intake ?? "2026-01-01",
        p_msds_url: s.msds ? "https://example.com/msds/s2f.pdf" : null,
      });
      expect(res.error, `준비: register_reagent ${s.name} (${res.error?.message})`).toBeNull();
      const id = ((Array.isArray(res.data) ? res.data[0] : res.data) as { id: string }).id;
      // 준비(service role): 분류 없음은 등록 함수(종류 필수)로 만들 수 없어 열만 비운다 (판정은 화면과 세션 조회)
      if (s.cls === null || s.intake === null) {
        const up = await service().from("reagents").update({ ...(s.cls === null ? { storage_class: null } : {}), ...(s.intake === null ? { intake_date: null } : {}) }).eq("id", id).select("id");
        expect(up.error, `준비: ${s.name} 분류·입고일 비우기 (${up.error?.message})`).toBeNull();
      }
      if (s.cab) await prepPlace(f, id, (s.cab === 1 ? a : b).id, s.key!);
      if (s.min !== undefined) {
        const t = await teacher.rpc("set_reorder_threshold", { p_reagent_id: id, p_min_stock: s.min });
        expect(t.error, `준비: ${s.name} 재주문 기준 ${s.min} (${t.error?.message})`).toBeNull();
      }
    }
    const { cabs } = await dbItems(teacher, f.school.id);
    return { f, c1: cabs.find((c) => c.id === a.id)!, c2: cabs.find((c) => c.id === b.id)! };
  })();
  prepCache.catch(() => {
    prepCache = null;
  });
  return prepCache;
}

let sharedBefore: string[] | null = null;
test.beforeAll(async ({}, info) => {
  info.setTimeout(120_000);
  if (HAS_SERVICE) sharedBefore = await sharedCabinetSnapshot();
});
test.afterAll(async ({}, info) => {
  info.setTimeout(TIMEOUT);
  if (!HAS_SERVICE) return;
  prepCache = null;
  const left = await cleanup(GROUP, info.project.name);
  expect(left, "일회용 계정·학교·시약장·칸·시약 잔여물").toEqual(NO_S11_RESIDUE);
  if (sharedBefore) expect(await sharedCabinetSnapshot(), "학교 A·B·데모 학교의 시약장·칸·시약 배치가 그대로").toEqual(sharedBefore);
});

async function openList(browser: Browser, info: TestInfo, u: TempUser, query = ""): Promise<{ page: Page; close: () => Promise<void>; viewport: string; writes: () => string[] }> {
  const t = await openTemp(browser, info, u, `${routeOf(SCREEN)}${query}`);
  const writes = watchWrites(t.page);
  await waitList(t.page);
  return { page: t.page, close: () => t.context.close(), viewport: t.viewport, writes };
}

test.describe("일회용 학교", () => {
  test.skip(!HAS_SERVICE, NO_SERVICE_REASON);

  test(`[C1][S${SCREEN}] 기대값 원본: rules list_filter 정렬 ${SORT_LABELS.join("·")} · "${NO_CLASS_TEXT}" · "${NO_SLOT_TEXT}" · "${NO_MSDS_TEXT}" · 빈 상태 "${EMPTY_TITLE}" + "${CLEAR_FILTERS}" · "${CLEAR_ALL}"`, () => {
    expect(SORT_LABELS).toEqual(["이름순", "재고 적은 순", "최근 입고순"]);
    expect([NO_CLASS_TEXT, NO_SLOT_TEXT, NO_MSDS_TEXT, RESET_TEXT]).toEqual(["분류 없음", "칸 없음만", "MSDS 없는 시약만", "초기화"]);
    expect(EMPTY_TITLE).toBe("조건에 맞는 시약이 없어요");
    expect(CLEAR_FILTERS).toBe("필터 지우기");
    expect(CLEAR_ALL).toBe("모두 지우기");
    expect(LF.roles).toMatch(/모든 역할·둘러보기 동일/);
    expect(LF.roles).toMatch(/주소창/);
  });

  test(`[C1][S${SCREEN}] 일회용 교사 list-filter-button → list-filter-sheet: 모바일 = tab-bar 위 전폭 바텀시트 · 데스크톱 = 버튼 아래 드롭다운 · 순서 ${SECTION_ORDER.join(" → ")} → "${NO_MSDS_TEXT}" · 항목(정렬 3 · 분류 칩 ${CLASSES.length}+1 · "${NO_SLOT_TEXT}") · "${RESET_TEXT}" + "{N}종 보기"(N = 지금 결과) · 누름 높이 ≥ ${MIN_H} · Esc = 적용 없이 닫힘 · 쓰기 요청 0`, async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const { f } = await prepared(info);
    const { page, close, viewport, writes } = await openList(browser, info, f.teacher);
    try {
      const { items } = await dbItems(await clientFor(f.teacher), null);
      await expectList(page, expected(items, {}), "처음(이름순)");
      await expectChips(page, 0, items.length, "처음");
      await expectTall(button(page), "list-filter-button");
      await expect(sheet(page), "누르기 전 시트 없음").toHaveCount(0);
      // 검색 text-input 오른쪽에 필터 버튼 (rules list_filter.entry)
      const search = main(page).getByPlaceholder("시약명 검색");
      const sb = await box(search);
      const bb = await box(button(page));
      expect(bb.x, "필터 버튼은 검색 오른쪽").toBeGreaterThanOrEqual(sb.x + sb.width - 1);
      expect(Math.abs(bb.y + bb.height / 2 - (sb.y + sb.height / 2)), "같은 줄").toBeLessThan(sb.height / 2);

      const s = await openSheet(page);
      await expect(button(page), "열림 표시").toHaveAttribute("aria-expanded", "true");
      // 위치
      const vw = page.viewportSize()!.width;
      const sx = await box(s);
      if (viewport === "mobile") {
        const tab = await box(page.locator(sel(TAB.component)));
        expect(Math.round(sx.x), "바텀시트 왼쪽 끝").toBe(0);
        expect(Math.round(sx.x + sx.width), "바텀시트 전폭").toBe(vw);
        expect(Math.abs(sx.y + sx.height - tab.y), `바텀시트 아래 끝 = tab-bar 위 (틈 ${tab.y - sx.y - sx.height})`).toBeLessThanOrEqual(1);
      } else {
        await expect(page.locator(sel(TAB.component)), "1440 tab-bar 없음").toHaveCount(0);
        const b2 = await box(button(page));
        expect(sx.y, "드롭다운은 버튼 아래").toBeGreaterThanOrEqual(b2.y + b2.height - 1);
        expect(sx.x < b2.x + b2.width && b2.x < sx.x + sx.width, "드롭다운이 버튼과 세로로 겹치는 자리(버튼 밑)").toBe(true);
        expect(sx.width, "드롭다운은 전폭이 아니다").toBeLessThan(vw / 2);
      }
      // 순서: 정렬 → 보관 분류 → 보관 위치 → MSDS 없는 시약만 → 초기화 · {N}종 보기
      const order: Locator[] = [
        ...SECTION_ORDER.map((t) => s.getByRole("heading", { name: exact(t) })),
        switchOf(s, NO_MSDS_TEXT),
        resetButton(s),
      ];
      // 순서는 문서 순서로 본다 (데스크톱 드롭다운은 몸통이 따로 스크롤되고 아래 버튼 줄은 고정이라 화면 y 로는 비교할 수 없다)
      const handles = [];
      for (const [i, l] of order.entries()) {
        await expect(l, `시트 항목 ${i}`).toHaveCount(1);
        handles.push(await l.elementHandle());
      }
      for (let i = 0; i + 1 < handles.length; i++) {
        const follows = await page.evaluate(([x, y]) => Boolean(x!.compareDocumentPosition(y!) & Node.DOCUMENT_POSITION_FOLLOWING), [handles[i], handles[i + 1]]);
        expect(follows, `시트 순서 ${i} → ${i + 1}`).toBe(true);
      }
      // 각 묶음은 위에서 아래로 (스크롤 없이 보이는 범위에서): 정렬 제목이 보관 분류 제목보다 위
      expect((await box(order[0])).y, "정렬이 보관 분류보다 위").toBeLessThan((await box(order[1])).y);
      const ab = await box(applyButton(s));
      const rb = await box(resetButton(s));
      expect(Math.abs(ab.y - rb.y), `"${RESET_TEXT}" 와 "{N}종 보기" 는 같은 줄`).toBeLessThan(4);
      expect(rb.x, `"${RESET_TEXT}" 가 왼쪽`).toBeLessThan(ab.x);
      // 항목
      await expect(s.getByRole("radio"), "정렬 3종").toHaveText(SORT_LABELS.map(exact));
      await expect(sortOption(s, SORT_LABELS[0]), "기본 = 이름순").toHaveAttribute("aria-checked", "true");
      await expect(s.locator(sel("storage-class-chip")), `분류 칩 = rules 8종 + "${NO_CLASS_TEXT}"`).toHaveText([...CLASSES, NO_CLASS_TEXT].map(exact));
      await expect(switchOf(s, NO_SLOT_TEXT)).toHaveCount(1);
      await expect(locationSelects(s), "보관 위치 = 시약장 → 칸").toHaveCount(2);
      expect(await applyCount(s), `"{N}종 보기" N = 지금 결과 수`).toBe(items.length);
      // 누름 높이
      await expectTall(s.getByRole("radio"), "정렬 선택지");
      await expectTall(s.locator(sel("storage-class-chip")), "storage-class-chip");
      await expectTall(applyButton(s), "{N}종 보기");
      await expectTall(resetButton(s), RESET_TEXT);

      // 고르는 동안 N 이 바뀌고, Esc 는 적용하지 않고 닫는다
      await sortOption(s, SORT_LABELS[1]).click();
      await classChip(s, "산").click();
      await expect(classChip(s, "산"), "칩 눌림").toHaveAttribute("aria-pressed", "true");
      await expect.poll(() => applyCount(s), { message: "분류 산 → N" }).toBe(filterItems(items, { classes: ["산"] }).length);
      const url = page.url();
      await page.keyboard.press("Escape");
      await expect(sheet(page), "Esc → 닫힘").toHaveCount(0);
      expect(page.url(), "Esc → 주소창 그대로").toBe(url);
      await expectList(page, expected(items, {}), "Esc 뒤 (적용 안 됨)");
      await expectChips(page, 0, items.length, "Esc 뒤");
      // 다시 열면 적용된 값(기본)부터
      const s2 = await openSheet(page);
      await expect(sortOption(s2, SORT_LABELS[0])).toHaveAttribute("aria-checked", "true");
      await expect(classChip(s2, "산")).toHaveAttribute("aria-pressed", "false");
      // 초기화 = 고르는 값만 기본으로 (적용 전)
      await classChip(s2, "유기").click();
      await resetButton(s2).click();
      await expect(classChip(s2, "유기")).toHaveAttribute("aria-pressed", "false");
      expect(await applyCount(s2)).toBe(items.length);
      await page.keyboard.press("Escape");
      if (process.env.V1 !== "0") {
        await page.goto(`${routeOf(SCREEN)}?class=${encodeURIComponent("산")}`);
        await waitList(page);
        await openSheet(page);
        await page.screenshot({ path: join(process.cwd(), "test-results", `v1-2-filter-${viewport}.png`), fullPage: false });
      }
      expect(writes(), "쓰기 요청 0").toEqual([]);
    } finally {
      await close();
    }
  });

  test(`[C1][S${SCREEN}] 일회용 교사 정렬 3종(${SORT_LABELS.join("·")}): "{N}종 보기" → 목록 순서 = DB(d7 §16: 가나다·같으면 id / 재고 오름·같으면 이름 / 입고일 내림·없으면 뒤·같으면 이름) · 기본 아니면 칩 1 · 배지 · 주소창`, async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const { f } = await prepared(info);
    const { page, close, writes } = await openList(browser, info, f.teacher);
    try {
      const { items } = await dbItems(await clientFor(f.teacher), null);
      for (const [i, key] of SORT_KEYS.entries()) {
        const s = await openSheet(page);
        await sortOption(s, SORT_LABELS[i]).click();
        await expect(sortOption(s, SORT_LABELS[i])).toHaveAttribute("aria-checked", "true");
        expect(await applyCount(s), "정렬만 바꾸면 N 그대로").toBe(items.length);
        await apply(page);
        await expectList(page, expected(items, {}, key), `정렬 ${SORT_LABELS[i]}`);
        expect(new URL(page.url()).searchParams.get("sort"), `주소창 sort (${SORT_LABELS[i]})`).toBe(SORT_PARAM[key]);
        if (key === "name") await expectChips(page, 0, items.length, "이름순");
        else {
          await expectChips(page, 1, items.length, SORT_LABELS[i]);
          expect(await chipLabels(page)).toEqual([SORT_LABELS[i]]);
        }
      }
      expect(writes(), "쓰기 요청 0").toEqual([]);
    } finally {
      await close();
    }
  });

  test(`[C1][S${SCREEN}] 일회용 교사 분류 여러 개 + "${NO_CLASS_TEXT}" · 시약장 → 칸 · "${NO_SLOT_TEXT}" · "${NO_MSDS_TEXT}" (AND): "{N}종 보기" N = 결과 · 목록 = DB · 칩 × 로 하나씩 · "${CLEAR_ALL}" · 결과 0 → "${EMPTY_TITLE}" + "${CLEAR_FILTERS}"`, async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const { f, c1, c2 } = await prepared(info);
    const { page, close, viewport, writes } = await openList(browser, info, f.teacher);
    try {
      const { items } = await dbItems(await clientFor(f.teacher), null);
      // 분류 여러 개 + 분류 없음
      let s = await openSheet(page);
      for (const c of ["산", "유기", NO_CLASS_TEXT]) await classChip(s, c).click();
      const condA: Cond = { classes: ["산", "유기", null] };
      expect(await applyCount(s), "분류 산·유기·분류 없음 → N").toBe(filterItems(items, condA).length);
      await apply(page);
      await expectList(page, expected(items, condA), "분류 산·유기·분류 없음");
      await expectChips(page, 3, filterItems(items, condA).length, "분류 3");
      expect(await chipLabels(page), "칩 = 분류 (rules cabinet.storage_classes 순서 + 분류 없음)").toEqual([...CLASSES.filter((c) => ["산", "유기"].includes(c)), NO_CLASS_TEXT]);
      // + MSDS 없음 (AND)
      s = await openSheet(page);
      await switchOf(s, NO_MSDS_TEXT).click();
      await expect(switchOf(s, NO_MSDS_TEXT)).toHaveAttribute("aria-checked", "true");
      const condB: Cond = { ...condA, noMsds: true };
      expect(await applyCount(s)).toBe(filterItems(items, condB).length);
      await apply(page);
      await expectList(page, expected(items, condB), "분류 + MSDS 없음");
      await expectChips(page, 4, filterItems(items, condB).length, "분류 + MSDS 없음");
      // 칩 × 로 하나씩 (유기 → 결과가 다시 계산된다)
      await expectTall(appliedChips(page).getByRole("button"), "칩 ×");
      await expectTall(chipRow(page).getByRole("button", { name: exact(CLEAR_ALL) }), CLEAR_ALL);
      await appliedChips(page).filter({ hasText: exact("유기") }).getByRole("button").click();
      const condC: Cond = { classes: ["산", null], noMsds: true };
      await expectList(page, expected(items, condC), "유기 칩 뺌");
      await expectChips(page, 3, filterItems(items, condC).length, "유기 칩 뺌");
      expect(new URL(page.url()).searchParams.get("class")?.split(",").includes("유기"), "주소창에서도 유기 빠짐").toBe(false);
      // 모두 지우기
      await chipRow(page).getByRole("button", { name: exact(CLEAR_ALL) }).click();
      await expectList(page, expected(items, {}), "모두 지우기");
      await expectChips(page, 0, items.length, "모두 지우기");
      expect([...new URL(page.url()).searchParams.keys()], "주소창 필터 쿼리 없음").toEqual([]);

      // 시약장 → 칸
      s = await openSheet(page);
      await locationSelects(s).nth(0).selectOption({ label: c1.label });
      await locationSelects(s).nth(1).selectOption({ index: 1 });
      const firstSlot = "L1"; // 칸 드롭다운 첫 칸 = 위 단부터 좌 → 우 (단마다 좌·우)
      const condD: Cond = { cab: c1.id, slot: firstSlot };
      expect(await applyCount(s), `${c1.label} 첫 칸 → N`).toBe(filterItems(items, condD).length);
      await apply(page);
      await expectList(page, expected(items, condD), `${c1.label} ${firstSlot}`);
      await expectChips(page, 1, filterItems(items, condD).length, "시약장·칸");
      const loc = appliedChips(page).first();
      await expect(loc.locator(sel("cabinet-number")), "시약장 칩 번호 원 (시안 2-filter-empty)").toHaveText(exact(String(c1.number)));
      await expect(loc, "시약장 칩 = 시약장 이름").toContainText(c1.label);
      // 칸 칩 × → 시약장 조건 통째로 빠짐, 다른 시약장(단문형) 전체
      await loc.getByRole("button").click();
      s = await openSheet(page);
      await locationSelects(s).nth(0).selectOption({ label: c2.label });
      await apply(page);
      await expectList(page, expected(items, { cab: c2.id }), `${c2.label} 전체 칸`);
      // 칸 없음만 (시약장 고른 값보다 우선)
      s = await openSheet(page);
      await switchOf(s, NO_SLOT_TEXT).click();
      await expect(locationSelects(s).nth(0), "칸 없음만이면 시약장 고르기 막힘").toBeDisabled();
      await apply(page);
      await expectList(page, expected(items, { noSlot: true }), NO_SLOT_TEXT);
      await expectChips(page, 1, filterItems(items, { noSlot: true }).length, NO_SLOT_TEXT);
      expect(new URL(page.url()).searchParams.has("cab"), "칸 없음만이면 주소창에 시약장 없음").toBe(false);

      // 결과 0: 칸 없음만 + 분류 유기 (유기 시약은 칸에 있다)
      expect(filterItems(items, { noSlot: true, classes: ["유기"] }), "전제: 결과 0 조합").toEqual([]);
      s = await openSheet(page);
      await classChip(s, "유기").click();
      expect(await applyCount(s), '"0종 보기"').toBe(0);
      await apply(page);
      await expectList(page, [], "결과 0");
      await expect(emptyCard(page)).toContainText(EMPTY_TITLE);
      await expectChips(page, 2, 0, "결과 0");
      if (process.env.V1 !== "0") await page.screenshot({ path: join(process.cwd(), "test-results", `v1-2-filter-empty-${viewport}.png`), fullPage: false });
      const clear = emptyCard(page).locator(sel("button-outline")).filter({ hasText: exact(CLEAR_FILTERS) });
      await expect(clear, `"${CLEAR_FILTERS}" button-outline`).toHaveCount(1);
      await expectTall(clear, CLEAR_FILTERS);
      await clear.click();
      await expectList(page, expected(items, {}), "필터 지우기");
      await expectChips(page, 0, items.length, "필터 지우기");
      expect(writes(), "쓰기 요청 0").toEqual([]);
    } finally {
      await close();
    }
  });

  test(`[C1][S${SCREEN}] 일회용 교사 상태는 주소창에 (d7 §16): 새로고침·상세 갔다 뒤로가기에도 같은 목록·칩 · 잘못된 값(sort·class·cab·slot·noslot)은 무시 · 기존 "재고 부족"·검색과 AND`, async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const { f, c1 } = await prepared(info);
    const { page, close, writes } = await openList(browser, info, f.teacher);
    try {
      const { items } = await dbItems(await clientFor(f.teacher), null);
      const s = await openSheet(page);
      await sortOption(s, SORT_LABELS[2]).click();
      await classChip(s, "산").click();
      await classChip(s, "독성").click();
      await apply(page);
      const cond: Cond = { classes: ["산", "독성"] };
      const want = expected(items, cond, "intake");
      await expectList(page, want, "적용");
      const url = page.url();
      // 새로고침
      await page.reload();
      await waitList(page);
      expect(page.url(), "새로고침 뒤 주소 그대로").toBe(url);
      await expectList(page, want, "새로고침 뒤");
      await expectChips(page, 3, want.length, "새로고침 뒤");
      // 상세 → 뒤로
      await rowsOf(page).first().click();
      await page.waitForURL((u) => u.pathname !== routeOf(SCREEN), { timeout: 30_000 });
      await page.goBack();
      await waitList(page);
      expect(page.url(), "뒤로가기 뒤 주소 그대로").toBe(url);
      await expectList(page, want, "뒤로가기 뒤");
      await expectChips(page, 3, want.length, "뒤로가기 뒤");

      // 잘못된 값은 무시 (기본)
      await page.goto(`${routeOf(SCREEN)}?sort=price&class=${encodeURIComponent("모름,acid")}&cab=00000000-0000-4000-8000-000000000000&slot=Z9&noslot=yes&nomsds=0`);
      await waitList(page);
      await expectList(page, expected(items, {}), "잘못된 쿼리 → 기본");
      await expectChips(page, 0, items.length, "잘못된 쿼리");
      // 시약장은 맞고 칸만 틀림 → 시약장만
      await page.goto(`${routeOf(SCREEN)}?cab=${c1.id}&slot=R9`);
      await waitList(page);
      await expectList(page, expected(items, { cab: c1.id }), "칸만 틀림");
      await expectChips(page, 1, filterItems(items, { cab: c1.id }).length, "칸만 틀림");

      // 재고 부족(segmented-control) · 검색과 AND
      const low = filterItems(items, { low: true });
      expect(low.length, "전제: 재고 부족 시약 ≥ 1").toBeGreaterThan(0);
      await page.goto(`${routeOf(SCREEN)}?filter=low-stock&class=${encodeURIComponent("산")}`);
      await waitList(page);
      await expectList(page, expected(items, { low: true, classes: ["산"] }), "재고 부족 + 분류 산");
      await page.goto(`${routeOf(SCREEN)}?filter=low-stock&class=${encodeURIComponent("유기")}`);
      await waitList(page);
      await expectList(page, expected(items, { low: true, classes: ["유기"] }), "재고 부족 + 분류 유기 = 0");
      await page.goto(`${routeOf(SCREEN)}?q=${encodeURIComponent("산")}&sort=stock`);
      await waitList(page);
      await expectList(page, expected(items, { q: "산" }, "stock"), "검색 '산' + 재고 적은 순");
      // 화면에서 검색어를 바꿔도 필터는 남는다
      await main(page).getByPlaceholder("시약명 검색").fill("나트");
      await expectList(page, expected(items, { q: "나트" }, "stock"), "검색 '나트' + 재고 적은 순");
      await expect.poll(() => new URL(page.url()).searchParams.get("sort"), { message: "검색해도 정렬 쿼리 유지" }).toBe("stock");
      expect(writes(), "쓰기 요청 0").toEqual([]);
    } finally {
      await close();
    }
  });

  test(`[C1][S${SCREEN}] 일회용 학생·교사·admin 같은 주소 → 같은 목록·칩·배지 (rules list_filter.roles "모든 역할 동일") · 쓰기 요청 0`, async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const { f, c1 } = await prepared(info);
    const query = `?sort=stock&class=${encodeURIComponent(`산,염기,유기`)}&cab=${c1.id}`;
    let first: { names: string[]; chips: string[] } | null = null;
    for (const [who, u] of [
      ["학생", f.student],
      ["교사", f.teacher],
      ["admin", f.admin],
    ] as const) {
      const { page, close, writes } = await openList(browser, info, u, query);
      try {
        const { items } = await dbItems(await clientFor(u), null);
        const cond: Cond = { classes: ["산", "염기", "유기"], cab: c1.id };
        await expectList(page, expected(items, cond, "stock"), `${who}`);
        await expectChips(page, 1 + 3 + 1, filterItems(items, cond).length, who);
        const now = { names: await shownNames(page), chips: await chipLabels(page) };
        if (first) expect(now, `${who} = 학생과 같은 목록·칩`).toEqual(first);
        first ??= now;
        const s = await openSheet(page);
        await expect(sortOption(s, SORT_LABELS[1]), `${who} 시트에 적용 값`).toHaveAttribute("aria-checked", "true");
        await page.keyboard.press("Escape");
        expect(writes(), `${who} 쓰기 요청 0`).toEqual([]);
      } finally {
        await close();
      }
    }
  });
});

test(`[C1][S2g] 둘러보기 /demo/reagents: 필터 시트 · 정렬(재고 적은 순·최근 입고순) = anon 데모 DB · 분류 "${NO_CLASS_TEXT}"·"산" · 시약장 · 결과 0 빈 상태 · 새로고침 유지 · 쓰기 요청 0`, async ({ browser }, info) => {
  test.setTimeout(TIMEOUT);
  const path = guestRouteOf(SCREEN);
  const g = await openGuest(browser, info, path);
  const page = g.page;
  const writes = watchWrites(page);
  try {
    await waitGuestShell(page);
    await waitList(page);
    const demoId = ((await anonClient().from("schools").select("id").eq("is_demo", true).single()).data as { id: string }).id;
    const { items, cabs } = await dbItems(anonClient(), demoId);
    expect(items.length, "데모 시약 ≥ 1").toBeGreaterThan(0);
    await expectList(page, expected(items, {}), "둘러보기 처음");
    for (const [i, key] of SORT_KEYS.entries()) {
      if (key === "name") continue;
      const s = await openSheet(page);
      await sortOption(s, SORT_LABELS[i]).click();
      await apply(page);
      await expectList(page, expected(items, {}, key), `둘러보기 ${SORT_LABELS[i]}`);
    }
    // 분류 없음 / 산
    let s = await openSheet(page);
    await classChip(s, NO_CLASS_TEXT).click();
    expect(await applyCount(s)).toBe(filterItems(items, { classes: [null] }).length);
    await apply(page);
    await expectList(page, expected(items, { classes: [null] }, "intake"), "둘러보기 분류 없음");
    s = await openSheet(page);
    await classChip(s, NO_CLASS_TEXT).click();
    await classChip(s, "산").click();
    await apply(page);
    await expectList(page, expected(items, { classes: ["산"] }, "intake"), "둘러보기 분류 산");
    // 시약장 (데모 학교 시약장이 있으면)
    if (cabs.length > 0) {
      await page.goto(`${path}?cab=${cabs[0].id}`);
      await waitList(page);
      await expectList(page, expected(items, { cab: cabs[0].id }), `둘러보기 ${cabs[0].label}`);
      await expectChips(page, 1, filterItems(items, { cab: cabs[0].id }).length, "둘러보기 시약장");
    }
    // 결과 0 → 빈 상태 + 필터 지우기
    await page.goto(`${path}?nomsds=1&noslot=1&class=${encodeURIComponent("독성")}`);
    await waitList(page);
    const zero = filterItems(items, { noMsds: true, noSlot: true, classes: ["독성"] });
    await expectList(page, expected(items, { noMsds: true, noSlot: true, classes: ["독성"] }), "둘러보기 조합");
    if (zero.length === 0) {
      await expect(emptyCard(page)).toContainText(EMPTY_TITLE);
      await emptyCard(page).locator(sel("button-outline")).filter({ hasText: exact(CLEAR_FILTERS) }).click();
      await expectList(page, expected(items, {}), "둘러보기 필터 지우기");
    }
    // 새로고침 유지
    await page.goto(`${path}?sort=stock`);
    await waitList(page);
    await page.reload();
    await waitList(page);
    await expectList(page, expected(items, {}, "stock"), "둘러보기 새로고침");
    await expectChips(page, 1, items.length, "둘러보기 새로고침");
    expect(writes(), "쓰기 요청 0").toEqual([]);
  } finally {
    await g.context.close();
  }
});
