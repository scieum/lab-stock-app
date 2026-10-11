// d7 §26 QA 개선 (3)(4·rules 우선)(5)(6)(7)(13) — 화면 2 · 4 · 15. C1 · C3 (390 · 1440).
// 기준(구현이 아니라 여기서 도출): harness/d7-data.md §26 "QA 개선 (3)(5)(6)(7)(13)" 줄,
//   design/rules.json usage_batch(picker · errors) · usage_date · landing_rhythm.motion · colors · typography,
//   새 프레임 3-desktop(드로어가 열린 시약 data-table 머리 칸).
// - QA (4) "고르면 검색칸 비우고 드롭다운 닫기" 는 rules usage_batch.picker("행 누르면 바로 추가, 체크 여러 개")와 충돌 →
//   design/rules.json 우선(오케스트레이터 run 20261011-2303): 행을 눌러도 드롭다운은 열린 채 여러 개 담긴다를 본다.
// 데이터: 화면 2(드로어 폭 · MSDS 일괄)는 일회용 학교(service role 로 생성 — 세션은 그 계정, 판정은 화면 + 그 계정 RLS).
//   화면 4 는 공용 학교 A 학생의 seed 시약을 담기만 한다(저장 요청 0). 화면 15 는 비로그인.
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { openAs } from "./auth-state";
import { routeOf, rules, sel } from "./screen-helpers";
import { deskTable, drawer, headLabels, isDeskPage, newFrame, waitDrawer, waitWidthSettled } from "./desk-helpers";
import { HAS_SERVICE, clientFor, openTemp, service, type TempUser } from "./screen-8-helpers";
import { NO_S11_RESIDUE, cleanup, makeFixture, prepReagent, purgeSchool, sharedCabinetSnapshot, watchActions, type S11Fixture } from "./screen-11-helpers";
import { BULK_START, MSDS_BULK_BANNER, SKIP, confirmButton, doneText, exact as exactText, interceptSearch, progressText, sheet } from "./msds-helpers";
import {
  ADD,
  EMPTY_AMOUNT,
  amountOf,
  dateInput,
  itemNamed,
  items,
  openPicker,
  picker,
  pickerRow,
  removeOf,
  saveButton,
  seedOwnReagents,
  usagePath,
  waitUsage,
} from "./screen-4-helpers";

test.describe.configure({ mode: "default" });

// ---------- 기대값 원본 ----------
const D7 = readFileSync(join(process.cwd(), "harness", "d7-data.md"), "utf8");
const S26 = (() => {
  const s = D7.indexOf("## 26.");
  if (s < 0) throw new Error("d7 에 §26 없음");
  const e = D7.indexOf("\n## ", s + 1);
  return D7.slice(s, e < 0 ? undefined : e);
})();
/** d7 §26 표의 한 줄 (항목 이름으로) */
function row26(item: string): string {
  const line = S26.split(/\r?\n/).find((l) => l.startsWith(`| ${item}`));
  if (!line) throw new Error(`d7 §26 에 '${item}' 줄 없음`);
  return line;
}
const QA3 = row26("QA 개선 (3)");
const QA4 = row26("QA 개선 (4)");
const QA5 = row26("QA 개선 (5)");
const QA6 = row26("QA 개선 (6)");
const QA7 = row26("QA 개선 (7)");
const QA13 = row26("QA 개선 (13)");
const dq = (s: string) => [...s.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
/** (5) 버튼 위 helper "사용량을 적어 주세요" */
const AMOUNT_HINT = dq(QA5)[0];
/** (7) 모두 건너뛰면 ex-toast "MSDS를 연결하지 않았어요" */
const BULK_NONE = dq(QA7)[0];
/**
 * (6) "저장 때와 같은 문구" — 저장 거절 때의 사용일 오류 문구.
 * 화면에서 저장 버튼이 비활성이 되어 저장 때 문구를 화면으로는 다시 얻을 수 없으므로, run 20261011-2303 오케스트레이터 지시 문구를 기대값으로 둔다.
 */
const FUTURE_DATE_ERROR = "오늘 이후 날짜는 고를 수 없어요";
/** rules colors: 본문 회색(text-muted) = 시안 머리 칸 글자색 #707070, typography 12 = caption */
const TEXT_MUTED = newFrame("3-desktop").find((n) => n.name === "label" && n.path.includes("table-head"))!.fills![0];
const CAPTION_SIZE = Math.min(...(rules as unknown as { typography: { sizes: number[] } }).typography.sizes);
const UB_PICKER = (rules as unknown as { usage_batch: { picker: string } }).usage_batch.picker;
const MOTION = (rules as unknown as { landing_rhythm: { motion: string } }).landing_rhythm.motion;
const REVEAL_PX = Number(/(\d+)\s*px/.exec(MOTION)?.[1]);

/** 시안 3-desktop(드로어가 열린 시약 목록) data-table 머리 칸 글자 · 폭 */
const F3_HEAD = newFrame("3-desktop").filter((n) => n.name === "head-cell" && n.path.includes("table-head"));
const F3_LABELS = newFrame("3-desktop")
  .filter((n) => n.name === "label" && n.path.includes("table-head") && n.text)
  .map((n) => n.text!.characters);
const NAME_LABEL = F3_LABELS[0];
/**
 * 드로어가 열려도 지킬 시약명 칸 최소 폭 = 시안 3-desktop 머리 칸 중 가장 넓은 칸 폭(보관 위치 148).
 * "다른 칸을 줄임"(QA 3) → 시약명 칸은 시안의 어느 칸보다 좁아지지 않고, 실제 표에서도 가장 넓은 칸이어야 한다 (옛 구현 ≈ 95px 은 실패).
 */
const NAME_MIN_W = Math.max(...F3_HEAD.map((n) => n.width!));

const rgb = (hex: string) => {
  const h = hex.replace("#", "");
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
};
const KST = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
const daysAgo = (n: number) => KST.format(new Date(Date.now() - n * 86_400_000));

test(`[C1][S*] 기대값 원본: d7 §26 QA (3) 시약명 칸 최소 폭 · title / (5) "${AMOUNT_HINT}" / (6) 미래 사용일 즉시 오류 + 저장 비활성 / (7) "${BULK_NONE}" / (13) @media print · 시안 3-desktop 머리 ${F3_LABELS.join("·")} · 최소 폭 ${NAME_MIN_W}px`, () => {
  expect(QA3).toMatch(/시약명 칸 최소 폭 유지/);
  expect(QA3).toMatch(/title 속성으로 전체 이름/);
  expect(QA4).toMatch(/드롭다운 닫기/);
  expect(UB_PICKER, "rules usage_batch.picker: 데스크톱 드롭다운은 행을 눌러 바로 추가 · 여러 개").toMatch(/행 누르면 바로 추가, 체크 여러 개/);
  expect(AMOUNT_HINT, "(5) 문구 = rules usage_batch.errors 빈 값 문구").toBe(EMPTY_AMOUNT);
  expect(QA5).toMatch(/버튼 위 helper/);
  expect(QA5).toMatch(/두 폭/);
  expect(QA6).toMatch(/입력 즉시 칸 아래 오류\(저장 때와 같은 문구\) \+ 저장 비활성/);
  expect(BULK_NONE).toBe("MSDS를 연결하지 않았어요");
  expect(QA7).toMatch(/일부만 연결하면 지금 결과 토스트/);
  expect(QA13).toMatch(/@media print/);
  expect(F3_LABELS[0]).toBe("시약명");
  expect(TEXT_MUTED.toLowerCase()).toBe("#707070");
  expect(CAPTION_SIZE).toBe(12);
  expect(REVEAL_PX).toBeGreaterThan(0);
  expect(NAME_MIN_W, "최소 폭 = 시안 3-desktop 시약명 칸(116)보다 넓은 칸 기준").toBeGreaterThan(F3_HEAD[0].width!);
});

// =====================================================================
// 화면 2 — 일회용 학교
// =====================================================================
const GROUP = "qa26";
const SAVE_TIMEOUT = 20_000;
const LONG_NAME_HEAD = "2,4-다이나이트로페닐하이드라진 브래디 시약 분석용 고순도";

test.describe("화면 2 (일회용 학교)", () => {
  test.skip(!HAS_SERVICE, "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음");

  let before: string[] | null = null;
  let fixtureCache: Promise<S11Fixture> | null = null;
  const fixture = (info: TestInfo): Promise<S11Fixture> => {
    fixtureCache ??= makeFixture(info, GROUP);
    fixtureCache.catch(() => (fixtureCache = null));
    return fixtureCache;
  };
  const fresh = async (info: TestInfo): Promise<S11Fixture> => {
    test.setTimeout(420_000);
    const f = await fixture(info);
    await purgeSchool(f.school.id);
    return f;
  };
  const nameOf = (tail: string) => `임시${randomBytes(3).toString("hex")}${tail}`;
  const msdsOf = async (u: TempUser, id: string) => {
    const r = await (await clientFor(u)).from("reagents").select("msds_url").eq("id", id).single();
    if (r.error) throw new Error(`대조 조회 실패: ${r.error.message}`);
    return (r.data as { msds_url: string | null }).msds_url;
  };
  const toast = (page: Page, text: string) => page.locator(sel("ex-toast")).filter({ hasText: exactText(text) });
  const banner = (page: Page) => page.locator(sel(MSDS_BULK_BANNER));

  async function waitList(page: Page): Promise<void> {
    await expect(page.locator(sel("segmented-control")).first()).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState("load");
    await waitWidthSettled(page);
  }
  async function startBulk(page: Page): Promise<void> {
    const start = banner(page).getByRole("button", { name: exactText(BULK_START) });
    await expect(start).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(() => start.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps"))), { message: "하이드레이션", timeout: 30_000 })
      .toBe(true);
    await start.click();
    await expect(sheet(page)).toBeVisible();
  }

  test.beforeAll(async () => {
    before = await sharedCabinetSnapshot();
  });
  test.afterAll(async ({}, info) => {
    info.setTimeout(300_000);
    fixtureCache = null;
    expect(await cleanup(GROUP, info.project.name), "일회용 계정·학교·시약 잔여물").toEqual(NO_S11_RESIDUE);
    if (before) expect(await sharedCabinetSnapshot(), "학교 A·B·데모 학교의 시약장·칸·시약 배치가 그대로").toEqual(before);
  });

  test(`[C3][S2] 1440 드로어 열린 시약 data-table: 머리 칸 = 시안 3-desktop(${F3_LABELS.join("·")}) · '${NAME_LABEL}' 칸 폭 ≥ ${NAME_MIN_W}px(d7 §26 QA 3, 옛 ≈95px 회귀 방지) · 긴 이름 = 말줄임 + title 전체 이름 · 모든 행 title = 시약명 / 390 = data-table 0`, async ({ browser }, info) => {
    const f = await fresh(info);
    const long = await prepReagent(f, "long", 3, "병", undefined, `${LONG_NAME_HEAD}-${randomBytes(3).toString("hex")}`);
    const short = await prepReagent(f, "short", 5, "g", undefined, nameOf("황산"));
    await prepReagent(f, "third", 2, "g", undefined, nameOf("질산은"));
    const { context, page, viewport } = await openTemp(browser, info, f.teacher, `${routeOf(2)}/${short.id}`);
    try {
      if (!isDeskPage(page)) {
        await expect(page.locator(sel("reagent-detail-card")).first(), "390 화면 3 그대로").toBeVisible({ timeout: 45_000 });
        await waitWidthSettled(page);
        await expect(page.locator(sel("data-table")), "390 data-table 0 (데스크톱 전용)").toHaveCount(0);
        return;
      }
      await waitDrawer(page);
      const table = deskTable(page);
      await expect(table).toBeVisible();
      expect(await headLabels(table), `머리 칸 = 시안 3-desktop`).toEqual(F3_LABELS);
      const nameTh = table.locator("thead th").filter({ hasText: NAME_LABEL });
      await expect(nameTh).toHaveCount(1);
      const nameW = (await nameTh.boundingBox())!.width;
      const drawerX = (await drawer(page).boundingBox())!.x;
      const tableBox = (await table.boundingBox())!;
      expect(tableBox.x + tableBox.width, "표는 드로어 왼쪽 안").toBeLessThanOrEqual(drawerX + 1);
      expect(nameW, `'${NAME_LABEL}' 칸 폭 ${Math.round(nameW)}px ≥ ${NAME_MIN_W}px`).toBeGreaterThanOrEqual(NAME_MIN_W);
      const widths = await table.locator("thead th").evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.getBoundingClientRect().width));
      expect(Math.max(...widths), `'${NAME_LABEL}' 칸이 가장 넓은 칸 (다른 칸을 줄임) — ${widths.map(Math.round).join("·")}`).toBeLessThanOrEqual(nameW + 0.5);
      // 행: 대표 칸 링크 title = 시약명 (모든 행)
      const links = table.locator("tbody a[data-row-link]");
      const pairs = await links.evaluateAll((els) => els.map((e) => ({ title: e.getAttribute("title"), text: (e.querySelector("span") as HTMLElement | null)?.innerText.trim() ?? "" })));
      expect(pairs.length, "행 3").toBe(3);
      for (const p of pairs) expect(p.title, `title = 시약명 (${p.text})`).toBe(p.text);
      // 긴 이름: 칸 안에서 잘리면 말줄임 + title 전체 이름
      const longLink = links.filter({ hasText: LONG_NAME_HEAD });
      await expect(longLink, "긴 이름 행").toHaveCount(1);
      await expect(longLink, "title = 전체 이름").toHaveAttribute("title", long.name);
      const st = await longLink.locator("span").first().evaluate((e) => {
        const s = getComputedStyle(e);
        return { overflow: e.scrollWidth > e.clientWidth, ellipsis: s.textOverflow, ws: s.whiteSpace, w: e.getBoundingClientRect().width };
      });
      expect(st.overflow, "긴 이름은 칸에서 잘림 (말줄임 확인용 전제)").toBe(true);
      expect(st.ellipsis, "말줄임").toBe("ellipsis");
      expect(st.ws, "한 줄").toBe("nowrap");
      await page.screenshot({ path: join(process.cwd(), "test-results", `v1-3-drawer-name-${viewport}.png`) });
    } finally {
      await context.close();
    }
  });

  {
    test(`[C1][S2] 일회용 교사 ?nomsds=1 MSDS 일괄 찾기 모두 "${SKIP}" → 토스트 "${BULK_NONE}"(d7 §26 QA 7) · 시트 닫힘 · 쓰기 0 · DB 그대로`, async ({ browser }, info) => {
      const f = await fresh(info);
      const list = [await prepReagent(f, "a", 3, "병", undefined, nameOf("황산")), await prepReagent(f, "b", 3, "병", undefined, nameOf("아세톤"))];
      const { context, page } = await openTemp(browser, info, f.teacher, `${routeOf(2)}?nomsds=1`);
      const actions = watchActions(page);
      try {
        const calls = await interceptSearch(page);
        await waitList(page);
        await startBulk(page);
        const s = sheet(page);
        for (let i = 1; i <= list.length; i++) {
          await expect(s.getByText(progressText(i, list.length), { exact: true }), `${i} / ${list.length}`).toBeVisible({ timeout: SAVE_TIMEOUT });
          await expect(s.getByRole("radio").first(), "후보 받음").toBeVisible({ timeout: SAVE_TIMEOUT });
          await s.getByRole("button", { name: exactText(SKIP) }).click();
        }
        await expect(s, "끝 → 시트 닫힘").toHaveCount(0);
        await expect(toast(page, BULK_NONE), `토스트 "${BULK_NONE}"`).toBeVisible({ timeout: SAVE_TIMEOUT });
        await expect(page.locator(sel("ex-toast")).filter({ hasText: /MSDS를 넣었어요/ }), "넣었어요 토스트 없음").toHaveCount(0);
        expect(calls.queries.length, "시약마다 한 번 검색").toBe(list.length);
        await page.waitForTimeout(500);
        expect(actions.count(), "쓰기 0").toBe(0);
        for (const r of list) expect(await msdsOf(f.teacher, r.id), `${r.name} 그대로`).toBeNull();
      } finally {
        await context.close();
      }
    });
  }

  test(`[C1][S2] 일회용 admin ?nomsds=1 일괄: 하나 고르고 하나 "${SKIP}" → 기존 결과 토스트 "${doneText(1)}" (QA 7 "일부만 연결하면 지금 결과 토스트") · "${BULK_NONE}" 0`, async ({ browser }, info) => {
    const f = await fresh(info);
    const list = [await prepReagent(f, "a", 3, "병", undefined, nameOf("질산")), await prepReagent(f, "b", 3, "병", undefined, nameOf("에탄올"))];
    const { context, page } = await openTemp(browser, info, f.admin, `${routeOf(2)}?nomsds=1`);
    try {
      await interceptSearch(page);
      await waitList(page);
      await startBulk(page);
      const s = sheet(page);
      await expect(s.getByText(progressText(1, 2), { exact: true })).toBeVisible({ timeout: SAVE_TIMEOUT });
      await expect(s.getByRole("radio").first()).toBeVisible({ timeout: SAVE_TIMEOUT });
      await confirmButton(s).click();
      await expect(s.getByText(progressText(2, 2), { exact: true })).toBeVisible({ timeout: SAVE_TIMEOUT });
      await expect(s.getByRole("radio").first()).toBeVisible({ timeout: SAVE_TIMEOUT });
      await s.getByRole("button", { name: exactText(SKIP) }).click();
      await expect(s).toHaveCount(0);
      await expect(toast(page, doneText(1)), `토스트 "${doneText(1)}"`).toBeVisible({ timeout: SAVE_TIMEOUT });
      await expect(toast(page, BULK_NONE), `"${BULK_NONE}" 없음`).toHaveCount(0);
      const urls = await Promise.all(list.map((r) => msdsOf(f.admin, r.id)));
      expect(urls.filter((u) => u !== null).length, "DB 1종만 연결").toBe(1);
    } finally {
      await context.close();
    }
  });

  test(`[C1][S2] 일회용 교사 ?nomsds=1 일괄: 하나 "${SKIP}" 뒤 × 로 닫기 → 토스트 없음("${BULK_NONE}" 도 0, QA 7 × 는 토스트 없음) · 쓰기 0`, async ({ browser }, info) => {
    const f = await fresh(info);
    const list = [await prepReagent(f, "a", 3, "병", undefined, nameOf("염산")), await prepReagent(f, "b", 3, "병", undefined, nameOf("메탄올"))];
    const { context, page } = await openTemp(browser, info, f.teacher, `${routeOf(2)}?nomsds=1`);
    const actions = watchActions(page);
    try {
      await interceptSearch(page);
      await waitList(page);
      await startBulk(page);
      const s = sheet(page);
      await expect(s.getByRole("radio").first()).toBeVisible({ timeout: SAVE_TIMEOUT });
      await s.getByRole("button", { name: exactText(SKIP) }).click();
      await expect(s.getByText(progressText(2, 2), { exact: true })).toBeVisible({ timeout: SAVE_TIMEOUT });
      await s.getByRole("button", { name: exactText("닫기") }).click();
      await expect(s).toHaveCount(0);
      await page.waitForTimeout(800);
      await expect(page.locator(sel("ex-toast")), "× → 토스트 없음").toHaveCount(0);
      expect(actions.count(), "쓰기 0").toBe(0);
      for (const r of list) expect(await msdsOf(f.teacher, r.id)).toBeNull();
    } finally {
      await context.close();
    }
  });
});

// =====================================================================
// 화면 4 — 공용 학교 A 학생 (담기만, 저장 요청 0)
// =====================================================================
const saveBox = async (page: Page) => (await saveButton(page).boundingBox())!;
const hint = (page: Page) => page.locator('main [data-name="bottom-bar"]').getByText(AMOUNT_HINT, { exact: true });

test(`[C1][S4] 빈 사용량 행이 있으면 저장 버튼 위 helper "${AMOUNT_HINT}"(text-muted ${TEXT_MUTED} · ${CAPTION_SIZE}px, d7 §26 QA 5 두 폭) · 채우면 사라짐 · 빈 행을 더 담으면 다시 · 빼면 사라짐 · 저장 요청 0`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const { own } = seedOwnReagents("student");
  expect(own.length, "전제: 학교 A seed 시약 2개 이상").toBeGreaterThanOrEqual(2);
  const [a, b] = own;
  const { page, context, viewport } = await openAs(browser, info, "student", 4, usagePath(a.id));
  try {
    await waitUsage(page);
    const actions = watchActions(page);
    await expect(itemNamed(page, a.name)).toHaveCount(1);
    await expect(amountOf(page, a.name), "처음 사용량 빈 칸").toHaveValue("");
    await expect(saveButton(page), "빈 값 → 비활성").toBeDisabled();
    // helper 보임 · 저장 버튼 위 · 회색 caption
    await expect(hint(page), `helper "${AMOUNT_HINT}" 1`).toHaveCount(1);
    await expect(hint(page)).toBeVisible();
    const hb = (await hint(page).boundingBox())!;
    const bb = await saveBox(page);
    expect(hb.y + hb.height, `helper 는 저장 버튼 위 (helper 아래 ${Math.round(hb.y + hb.height)} ≤ 버튼 위 ${Math.round(bb.y)})`).toBeLessThanOrEqual(bb.y + 1);
    const style = await hint(page).evaluate((e) => ({ c: getComputedStyle(e).color, fs: getComputedStyle(e).fontSize }));
    expect(style.c, `글자색 text-muted ${TEXT_MUTED}`).toBe(rgb(TEXT_MUTED));
    expect(style.fs, `caption ${CAPTION_SIZE}px`).toBe(`${CAPTION_SIZE}px`);
    await page.screenshot({ path: join(process.cwd(), "test-results", `v1-4-amount-hint-${viewport}.png`) });
    // 채우면 사라짐
    await amountOf(page, a.name).fill("1");
    await expect(hint(page), "모두 채움 → helper 0").toHaveCount(0);
    await expect(saveButton(page), "모두 유효 → 활성").toBeEnabled();
    // 빈 행 하나 더 담으면 다시 보임
    await openPicker(page);
    await pickerRow(page, b.name).first().click();
    if (isDeskPage(page)) await page.keyboard.press("Escape");
    else await picker(page).getByRole("button", { name: /개 담기$/ }).click();
    await expect(picker(page)).toHaveCount(0);
    await expect(items(page), "담은 시약 2").toHaveCount(2);
    await expect(hint(page), "빈 행 추가 → helper 다시 보임").toBeVisible();
    await expect(saveButton(page)).toBeDisabled();
    // 빈 행을 빼면 사라짐
    await removeOf(page, b.name).click();
    await expect(items(page)).toHaveCount(1);
    await expect(hint(page), "빈 행 빼기 → helper 0").toHaveCount(0);
    await expect(saveButton(page)).toBeEnabled();
    // 다시 비우면 보임
    await amountOf(page, a.name).fill("");
    await expect(hint(page), "다시 비움 → helper").toBeVisible();
    expect(actions.count(), "저장 요청 0").toBe(0);
  } finally {
    await context.close();
  }
});

test(`[C1][S4] 사용일에 미래 날짜 → 저장 누르기 전 즉시 칸 아래 오류 "${FUTURE_DATE_ERROR}"(d7 §26 QA 6) · aria-invalid · 저장 비활성(사용량 유효해도) · 오늘로 고치면 오류 사라지고 저장 활성 · 저장 요청 0`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const { own } = seedOwnReagents("student");
  const a = own[0];
  const { page, context, viewport } = await openAs(browser, info, "student", 4, usagePath(a.id));
  try {
    await waitUsage(page);
    const actions = watchActions(page);
    await amountOf(page, a.name).fill("1");
    await expect(saveButton(page), "전제: 오늘 · 사용량 유효 → 활성").toBeEnabled();
    const today = daysAgo(0);
    await expect(dateInput(page)).toHaveValue(today);
    const err = page.locator(`main ${sel("usage-date")} [role="alert"]`);
    await expect(err, "오늘 → 오류 없음").toHaveCount(0);
    // 미래 날짜 (max 를 넘겨 입력) — 저장을 누르지 않는다
    await dateInput(page).fill(daysAgo(-1));
    await expect(err, "미래 → 즉시 오류 1").toHaveCount(1);
    await expect(err, `"${FUTURE_DATE_ERROR}"`).toHaveText(exactText(FUTURE_DATE_ERROR));
    const ib = (await dateInput(page).boundingBox())!;
    const eb = (await err.boundingBox())!;
    expect(eb.y, "오류는 칸 아래").toBeGreaterThanOrEqual(ib.y + ib.height - 1);
    await expect(dateInput(page), "aria-invalid").toHaveAttribute("aria-invalid", "true");
    await expect(saveButton(page), "미래 → 저장 비활성").toBeDisabled();
    await expect(page.locator(sel("ex-toast")), "토스트 없음 (저장 안 누름)").toHaveCount(0);
    await page.screenshot({ path: join(process.cwd(), "test-results", `v1-4-future-date-${viewport}.png`) });
    // 더 먼 미래도 같음
    await dateInput(page).fill(daysAgo(-30));
    await expect(err).toHaveText(exactText(FUTURE_DATE_ERROR));
    await expect(saveButton(page)).toBeDisabled();
    // 오늘로 고치면 해제
    await dateInput(page).fill(today);
    await expect(err, "오늘로 → 오류 0").toHaveCount(0);
    await expect(dateInput(page)).not.toHaveAttribute("aria-invalid", "true");
    await expect(saveButton(page), "오늘로 → 저장 활성").toBeEnabled();
    // 지난 날짜는 오류 아님
    await dateInput(page).fill(daysAgo(3));
    await expect(err, "지난 날짜 → 오류 0").toHaveCount(0);
    await expect(saveButton(page)).toBeEnabled();
    expect(actions.count(), "저장 요청 0").toBe(0);
  } finally {
    await context.close();
  }
});

test(`[C1][S4] 시약 고르기는 행을 눌러도 열린 채 여러 개 담기(rules usage_batch.picker 우선 — d7 §26 QA 4 는 넣지 않음): 1440 드롭다운 행 누름 → 담김 · 드롭다운 그대로 · 이어서 다른 행 / 390 바텀시트 체크 여러 개 → "N개 담기" · 저장 요청 0`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const { own } = seedOwnReagents("student");
  expect(own.length, "전제: 학교 A seed 시약 3개 이상").toBeGreaterThanOrEqual(3);
  const [a, b, c] = own;
  const { page, context } = await openAs(browser, info, "student", 4, usagePath(a.id));
  try {
    await waitUsage(page);
    const actions = watchActions(page);
    await openPicker(page);
    if (isDeskPage(page)) {
      const input = page.locator(`main ${sel(ADD)} input`);
      await input.fill(b.name.slice(0, 2));
      await pickerRow(page, b.name).first().click();
      await expect(itemNamed(page, b.name), "누르면 바로 담김").toHaveCount(1);
      await page.waitForTimeout(400);
      await expect(picker(page), "담은 뒤에도 드롭다운 열림").toBeVisible();
      await input.fill("");
      await pickerRow(page, c.name).first().click();
      await expect(itemNamed(page, c.name), "이어서 다른 행도 담김").toHaveCount(1);
      await expect(picker(page), "여전히 열림").toBeVisible();
      await expect(items(page), "담은 시약 3").toHaveCount(3);
      await page.keyboard.press("Escape");
      await expect(picker(page), "Esc → 닫힘").toHaveCount(0);
    } else {
      await pickerRow(page, b.name).first().click();
      await expect(picker(page), "체크해도 시트 열림").toBeVisible();
      await pickerRow(page, c.name).first().click();
      const pick = picker(page).getByRole("button", { name: /개 담기$/ });
      await expect(pick).toHaveText(/2개 담기/);
      await pick.click();
      await expect(picker(page)).toHaveCount(0);
      await expect(items(page), "담은 시약 3").toHaveCount(3);
    }
    expect(actions.count(), "저장 요청 0").toBe(0);
  } finally {
    await context.close();
  }
});

// =====================================================================
// 화면 15 — 비로그인 랜딩 인쇄
// =====================================================================
test(`[C3][S15] @media print (d7 §26 QA 13): 스크롤 없이 모든 랜딩 [data-reveal] opacity 1 · transform none · screen 에서는 1440 화면 밖 대상이 투명 · ${REVEAL_PX}px 아래(전제, 화면 모양 그대로)`, async ({ page }) => {
  test.setTimeout(90_000);
  const res = await page.goto(routeOf(15));
  expect(res?.status()).toBe(200);
  await page.waitForLoadState("load");
  await expect(page.locator(sel("landing-hero")).first()).toBeVisible({ timeout: 30_000 });
  const all = page.locator("main [data-reveal]");
  const read = () =>
    all.evaluateAll((els) =>
      els.map((e) => {
        const s = getComputedStyle(e);
        return { o: Number(s.opacity), t: s.transform };
      }),
    );
  if (isDeskPage(page)) {
    expect(await all.count(), "떠오름 대상").toBeGreaterThan(0);
    // 전제: 화면(screen)에서는 JS 가 켠 뒤 화면 밖 대상이 숨어 있다 (빈 판정 방지)
    await expect.poll(async () => (await read()).filter((s) => s.o < 1).length, { message: "screen: 화면 밖 대상 투명 (전제)", timeout: 10_000 }).toBeGreaterThan(0);
    for (const s of (await read()).filter((x) => x.o === 0)) expect(s.t, `screen: 화면 밖 대상 ${REVEAL_PX}px 아래 (모양 그대로)`).toMatch(new RegExp(`^matrix\\(1, 0, 0, 1, 0, ${REVEAL_PX}\\)$`));
  }
  await page.emulateMedia({ media: "print" });
  const printed = await read();
  expect(printed.filter((s) => s.o !== 1), "print: opacity 1 아닌 대상 0").toEqual([]);
  expect(printed.filter((s) => s.t !== "none"), "print: transform none 아닌 대상 0").toEqual([]);
  for (const n of rules.screens_required["15"] as string[]) {
    const vis = await page.locator(sel(n)).evaluateAll((els) => els.filter((e) => Number(getComputedStyle(e).opacity) === 1 && (e as HTMLElement).offsetParent !== null).length);
    expect(vis, `print: ${n} 보임`).toBeGreaterThan(0);
  }
});
