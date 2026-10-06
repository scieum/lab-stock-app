// 화면 6 (재주문 알림) 판매처 연결 — 검색어 자동 입력: C1
// 기준: harness/d7-data.md §11 "검색어 자동 입력"(2026-10-07 사용자 결정)·"판매처 연결", §12, harness/d2-purpose.md §5.
//   - 공통 목록 4곳: "확인" → 웹사이트 대신 그 판매처의 검색 결과 주소 (d7 §11 의 주소, `{q}` = 카드 시약 이름(앞뒤 공백 정리, URL 인코딩)).
//   - 우리 학교 판매처(search_url 없음): 지금처럼 웹사이트.
//   - "직접 열기" href 도 새 창과 같은 주소. 아무것도 저장하지 않는다.
// 일회용 학교(일회용 admin·교사)에서만 상태를 만든다. service role 은 준비·정리·대조 조회에만.
// 새 창은 외부 판매처 사이트를 실제로 불러오지 않는다 (stubExternal: 앱 밖 주소 요청을 빈 문서로 대신 응답) — popup 주소만 본다.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type TestInfo } from "@playwright/test";
import { browserClient } from "./screen-helpers";
import { HAS_SERVICE, openTemp } from "./screen-8-helpers";
import {
  COMMON_SEARCH,
  DIRECT_OPEN,
  NO_RESIDUE_69,
  REORDER,
  REORDER_HREF,
  cardOf,
  cleanup,
  confirmButton,
  directLink,
  exact,
  fakeSite,
  hrefOf,
  linkDialog,
  makeSchool,
  openLinkModal,
  optionNames,
  ownReagentsOf,
  pickVendor,
  prepVendor,
  purge,
  searchHref,
  sharedSnapshot,
  stubExternal,
  vendorsBySchool,
  waitReorder,
  watchWrites,
  type Fx,
} from "./screen-6-9-helpers";

test.describe.configure({ mode: "default" });
test.skip(!HAS_SERVICE, "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)");

const SCREEN = REORDER;
const GROUP = "s6sq";
const TIMEOUT = 420_000;

const storageClasses = (JSON.parse(readFileSync(join(process.cwd(), "design", "rules.json"), "utf8")) as { cabinet: { storage_classes: string[] } }).cabinet
  .storage_classes;

let before: string[] | null = null;
let fixtureCache: Promise<Fx> | null = null;

function fixture(info: TestInfo): Promise<Fx> {
  fixtureCache ??= makeSchool(info, GROUP);
  fixtureCache.catch(() => {
    fixtureCache = null;
  });
  return fixtureCache;
}

async function fresh(info: TestInfo): Promise<Fx> {
  test.setTimeout(TIMEOUT);
  const f = await fixture(info);
  await purge([f.school.id]);
  return f;
}

/** 준비: 이름을 정한 재고 부족 시약 (admin 세션 register_reagent → min_stock 지정; low_stock_since 는 DB 가 맞춘다) */
async function lowReagent(f: Fx, name: string): Promise<{ id: string; name: string }> {
  const made = await f.prep.rpc("register_reagent", {
    p_name: name,
    p_storage_class: storageClasses[0],
    p_stock: 2,
    p_unit: "mL",
    p_intake_date: "2026-09-15",
    p_msds_url: null,
  });
  expect(made.error, `준비: register_reagent (${made.error?.message})`).toBeNull();
  const row = (Array.isArray(made.data) ? made.data[0] : made.data) as { id: string } | null;
  if (!row) throw new Error("준비: register_reagent 가 행을 돌려주지 않음");
  const up = await f.prep.from("reagents").update({ min_stock: 50 }).eq("id", row.id).select("id, name, stock, min_stock, low_stock_since");
  expect(up.error, `준비: min_stock (${up.error?.message})`).toBeNull();
  const r = (up.data ?? [])[0] as { id: string; name: string; stock: number; min_stock: number; low_stock_since: string | null };
  expect(Number(r.stock) < Number(r.min_stock), "준비: 재고 부족").toBe(true);
  expect(r.low_stock_since, "준비: low_stock_since").not.toBeNull();
  return { id: r.id, name: r.name };
}

test.beforeAll(async () => {
  if (HAS_SERVICE) before = await sharedSnapshot();
});

test.afterAll(async ({}, info) => {
  info.setTimeout(300_000);
  if (!HAS_SERVICE) return;
  fixtureCache = null;
  const left = await cleanup(GROUP, info.project.name);
  expect(left, "일회용 계정·학교·시약·판매처·기록 잔여물").toEqual(NO_RESIDUE_69);
  if (before) expect(await sharedSnapshot(), "공통 판매처 목록 · 학교 A·B·데모의 판매처·시약 기준 열이 그대로").toEqual(before);
});

test(`[C1][S${SCREEN}] 일회용 학교 교사: 시약명에 공백·괄호·% 가 든 카드 → 공통 ${COMMON_SEARCH.length}곳 각각 "확인" → 새 창 = d7 §11 검색 주소({q} = 인코딩한 시약 이름) · "${DIRECT_OPEN}" href 같음 / 우리 학교 판매처 → website · 외부 요청은 고른 주소뿐 · 쓰기 요청 0건 · DB 불변`, async ({ browser }, info) => {
  const f = await fresh(info);
  const reagent = await lowReagent(f, `염산 (35%) ${randomBytes(2).toString("hex")}`);
  expect(reagent.name, "준비: 시약명에 공백·괄호·% 그대로 저장").toMatch(/^염산 \(35%\) [0-9a-f]{4}$/);
  const own = await prepVendor(f, { contact: "043-000-3333", website: fakeSite("own") }, "검색");
  const vendorsBefore = await vendorsBySchool(f.school.id);

  const { context, page } = await openTemp(browser, info, f.teacher, REORDER_HREF);
  const stub = await stubExternal(context, info);
  const writes = watchWrites(page);
  try {
    await waitReorder(page);
    const reagentsBefore = await ownReagentsOf((await browserClient(page)).client);
    const card = cardOf(page, reagent.name);
    await expect(card, `카드 "${reagent.name}"`).toHaveCount(1);

    const picks = [
      ...COMMON_SEARCH.map((s) => ({ name: s.name, url: searchHref(s.searchUrl, reagent.name), what: "d7 §11 검색 주소" })),
      { name: own.name, url: hrefOf(own.website!), what: "우리 학교 판매처 website" },
    ];
    // 기대 주소의 검색어 = 시약 이름 그대로 (인코딩을 풀면 원래 이름)
    for (const p of picks.slice(0, COMMON_SEARCH.length)) {
      expect([...new URL(p.url).searchParams.values()], `${p.name}: 기대 주소의 검색어`).toContain(reagent.name);
    }

    for (const pick of picks) {
      const dlg = await openLinkModal(page, card);
      await expect(dlg.getByText(exact(`판매처 · ${reagent.name}`)), `"판매처 · ${reagent.name}"`).toHaveCount(1);
      expect(await optionNames(page), "모달 판매처 행").toContain(pick.name);
      await pickVendor(page, pick.name);
      await expect(confirmButton(page), `${pick.name}: 확인 활성`).toBeEnabled();
      const [popup] = await Promise.all([context.waitForEvent("page", { timeout: 20_000 }), confirmButton(page).click()]);
      await popup.waitForURL((u) => u.href !== "about:blank", { timeout: 20_000 });
      expect(popup.url(), `${pick.name}: 새 창 주소 = ${pick.what}`).toBe(pick.url);
      expect(await popup.evaluate(() => window.opener), `${pick.name}: 새 창 opener 없음`).toBeNull();
      await popup.close();
      await expect(linkDialog(page), "확인 뒤 모달 닫힘").toHaveCount(0);
      expect(new URL(page.url()).pathname, "화면은 그대로").toBe(REORDER_HREF);
      const direct = directLink(page);
      await expect(direct, `"${DIRECT_OPEN}" 링크`).toHaveCount(1);
      expect(new URL((await direct.getAttribute("href"))!).href, `${pick.name}: "${DIRECT_OPEN}" href = 새 창 주소`).toBe(pick.url);
      await expect(direct).toHaveAttribute("target", "_blank");
      expect(((await direct.getAttribute("rel")) ?? "").split(/\s+/), `"${DIRECT_OPEN}" rel`).toContain("noopener");
      await expect(page.getByRole("status").filter({ has: direct }), "안내 줄에 판매처명").toContainText(pick.name);
    }

    // 문서 요청 = 고른 주소 그대로, 그 밖(파비콘 등)도 고른 주소의 호스트뿐
    const hits = stub.hits();
    for (const p of picks) expect(hits, `${p.name}: 새 창 문서 요청`).toContain(p.url);
    const hosts = new Set(picks.map((p) => new URL(p.url).host));
    expect(hits.filter((u) => !hosts.has(new URL(u).host)), `앱 밖 요청은 고른 주소의 호스트뿐 (${hits.join(", ")})`).toEqual([]);
    expect(writes.list(), "쓰기 요청 0건 (아무것도 저장하지 않는다)").toEqual([]);
    expect(await vendorsBySchool(f.school.id), "판매처 불변").toEqual(vendorsBefore);
    expect(await ownReagentsOf((await browserClient(page)).client), "시약 불변").toEqual(reagentsBefore);
  } finally {
    await context.close();
  }
});
