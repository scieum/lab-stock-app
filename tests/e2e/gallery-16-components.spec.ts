// 화면 16 MSDS 요약 컴포넌트 — 갤러리(/gallery) 판 (D1).
// 이 환경은 공단 키가 없어 실제 /msds 화면에서 요약 성공 상태를 볼 수 없다 → 성공·더 보기·내용 없음·불러오는 중은 갤러리 예시로 본다.
// 기준: design/rules.json 1.21 msds_summary · screens_required 16 · variants 16 · colors.allowed_rgba(#ff0000 은 ghs-pictogram 안에서만),
//       design/frames/16-mobile.json(문구·색·크기), harness/d7-data.md §22(그림문자 9종 이름).
import { test, expect, type Locator, type Page } from "@playwright/test";
import { sel } from "./screen-helpers";
import {
  EMPTY_TEXT,
  FRAME,
  GHS,
  GHS_NAMES,
  GHS_RED_HEX,
  INK,
  MIN_H,
  ORIGINAL,
  OUTLINE,
  PREVIEW_LINES,
  REQUIRED,
  SKELETON,
  SUMMARY,
  VARIANTS,
  boxOf,
  exact,
  expectPictogram,
  redPaint,
  rgbOf,
} from "./screen-16-helpers";

const GALLERY = "/gallery";

async function open(page: Page): Promise<void> {
  const res = await page.goto(GALLERY, { waitUntil: "networkidle" });
  expect(res?.status(), "갤러리 응답").toBe(200);
}

const rgbParts = (s: string) => (s.match(/\d+(\.\d+)?/g) ?? []).map(Number);
const achromatic = (s: string) => {
  const [r, g, b] = rgbParts(s);
  return r === g && g === b;
};

/** 시안 16 예시 요약 (첫 항목 첫 줄을 품은 msds-summary) */
const frameSummary = (page: Page) => page.locator(sel(SUMMARY)).filter({ hasText: FRAME.sectionLines[0][0] });
/** 항목 카드 (제목 heading 을 품은 section) */
const sectionOf = (summary: Locator, title: string) =>
  summary.locator("section").filter({ has: summary.page().getByRole("heading", { name: title, exact: true }) });

test(`[C1][S*] 갤러리: rules.json screens_required 16(${REQUIRED.join("·")}) · variants 16 의 컴포넌트가 각각 1개 이상`, async ({ page }) => {
  expect(REQUIRED.length, "screens_required 16").toBeGreaterThan(0);
  expect(Object.keys(VARIANTS).sort(), "variants 16 상태").toEqual(["fail", "loading", "no-summary"]);
  await open(page);
  const names = [...new Set([...REQUIRED, ...Object.values(VARIANTS).flat()])];
  for (const n of names) expect(await page.locator(sel(n)).count(), `갤러리 ${n}`).toBeGreaterThanOrEqual(1);
});

test(`[C1][S*] ghs-pictogram 9종 (d7 §22 · 시안 16): 이름 ${GHS_NAMES.join("·")} · 흰 마름모 + ${GHS_RED_HEX} 테두리 · 검정 그림 · 크기`, async ({ page }) => {
  await open(page);
  const loose = page.locator(`${sel(GHS)}:not(${sel(SUMMARY)} ${sel(GHS)})`);
  await expect(loose, "요약 밖 9종 줄").toHaveCount(GHS_NAMES.length);
  for (let i = 0; i < GHS_NAMES.length; i++) await expectPictogram(loose.nth(i), GHS_NAMES[i], `그림문자 ${i + 1}`);
  const svgs = await loose.evaluateAll((els) => els.map((e) => e.querySelector("svg")?.innerHTML ?? ""));
  expect(new Set(svgs).size, "9종 그림이 서로 다르다").toBe(GHS_NAMES.length);
  for (let i = 0; i < GHS_NAMES.length; i++) {
    const label = await loose.nth(i).locator("svg").getAttribute("aria-label");
    expect(label ?? "", `그림문자 ${i + 1}: 그림에 이름이 붙음(보조기기)`).toContain(GHS_NAMES[i]);
  }
});

test(`[T2][C1][S*] 색 규칙: ${GHS_RED_HEX}(rules.json colors.allowed_rgba only_in ${GHS}) 는 ${GHS} 안에서만 칠해진다 (갤러리 전체)`, async ({ page }) => {
  await open(page);
  const r = await redPaint(page);
  expect(r.inside, `${GHS} 안 ${GHS_RED_HEX} (양성 대조)`).toBeGreaterThan(0);
  expect(r.outside, `${GHS} 밖 ${GHS_RED_HEX}`).toEqual([]);
});

test(`[C1][S*] msds-summary 시안 16 예시: 신호어 캡션 "${FRAME.signalCaption}" + pill "${FRAME.signal}"(${FRAME.signalFill} 채움 · ${FRAME.signalText} 글자) · 그림문자 ${FRAME.ghsCaptions.join("·")} · 항목 ${FRAME.sectionTitles.join(" / ")} · 각 ${PREVIEW_LINES}줄`, async ({ page }) => {
  await open(page);
  const summary = frameSummary(page);
  await expect(summary, "시안 예시 요약 1").toHaveCount(1);
  await expect(summary.getByText(FRAME.signalCaption, { exact: true }), "신호어 캡션").toHaveCount(1);
  const pill = summary.getByText(FRAME.signal, { exact: true });
  await expect(pill, `신호어 "${FRAME.signal}"`).toHaveCount(1);
  expect(await pill.evaluate((e) => getComputedStyle(e).backgroundColor), "위험 = ink 채움").toBe(rgbOf(FRAME.signalFill));
  expect(await pill.evaluate((e) => getComputedStyle(e).color), "흰 글자").toBe(rgbOf(FRAME.signalText));
  // 순서: 신호어 → 그림문자 → 항목
  const pics = summary.locator(sel(GHS));
  await expect(pics).toHaveCount(FRAME.ghsCaptions.length);
  for (let i = 0; i < FRAME.ghsCaptions.length; i++) await expectPictogram(pics.nth(i), FRAME.ghsCaptions[i], `요약 그림문자 ${i + 1}`);
  const pillBox = await boxOf(pill);
  const picBox = await boxOf(pics.first());
  expect(picBox.y, "그림문자는 신호어 아래").toBeGreaterThanOrEqual(pillBox.y + pillBox.height - 1);
  let prevBottom = picBox.y + picBox.height - 1;
  for (const [i, title] of FRAME.sectionTitles.entries()) {
    const sec = sectionOf(summary, title);
    await expect(sec, `항목 "${title}"`).toHaveCount(1);
    const b = await boxOf(sec);
    expect(b.y, `"${title}" 은 앞 요소 아래`).toBeGreaterThanOrEqual(prevBottom);
    prevBottom = b.y + b.height - 1;
    const items = sec.getByRole("listitem");
    const shown = (await items.allInnerTexts()).map((t) => t.replace(/^[\s·]+/, "").replace(/\s+/g, " ").trim());
    expect(shown.length, `"${title}": 접힌 상태 ≤ ${PREVIEW_LINES}줄`).toBeLessThanOrEqual(PREVIEW_LINES);
    expect(shown, `"${title}": 시안 줄`).toEqual(FRAME.sectionLines[i].slice(0, PREVIEW_LINES));
  }
});

test(`[C1][S*] 항목 "${FRAME.more}"(펼침): ${PREVIEW_LINES}줄 넘는 항목만 버튼 · aria-expanded · 누르면 전부 · 다시 누르면 ${PREVIEW_LINES}줄 · 누름 높이 ≥ ${MIN_H}`, async ({ page }) => {
  await open(page);
  const summary = frameSummary(page);
  const toggles = summary.getByRole("button", { expanded: false });
  const n = await toggles.count();
  expect(n, `갤러리 예시에 "${FRAME.more}" 항목 ≥ 1`).toBeGreaterThan(0);
  for (const title of FRAME.sectionTitles) {
    const sec = sectionOf(summary, title);
    const btn = sec.getByRole("button");
    const items = sec.getByRole("listitem");
    if ((await btn.count()) === 0) {
      expect(await items.count(), `"${title}": 버튼 없으면 ≤ ${PREVIEW_LINES}줄`).toBeLessThanOrEqual(PREVIEW_LINES);
      continue;
    }
    await expect(btn).toHaveCount(1);
    await expect(btn, `"${title}": "${FRAME.more}"`).toContainText(FRAME.more);
    await expect(btn).toHaveAttribute("aria-expanded", "false");
    expect((await boxOf(btn)).height, `"${title}": 누름 높이`).toBeGreaterThanOrEqual(MIN_H);
    await expect(items).toHaveCount(PREVIEW_LINES);
    await expect(async () => {
      if ((await btn.getAttribute("aria-expanded")) === "false") await btn.click({ timeout: 3_000 });
      await expect(btn).toHaveAttribute("aria-expanded", "true", { timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    expect(await items.count(), `"${title}": 펼치면 ${PREVIEW_LINES}줄보다 많다`).toBeGreaterThan(PREVIEW_LINES);
    await expect(btn, "펼친 뒤 버튼 문구가 바뀐다").not.toContainText(FRAME.more);
    await btn.click();
    await expect(btn).toHaveAttribute("aria-expanded", "false");
    await expect(items, `"${title}": 접으면 ${PREVIEW_LINES}줄`).toHaveCount(PREVIEW_LINES);
    await expect(btn).toContainText(FRAME.more);
  }
});

test(`[C1][S*] 신호어 "경고" = 회색 pill · ink 글자 · 항목 내용 없음 = 무채색 "${EMPTY_TEXT}" (줄·더 보기 없음)`, async ({ page }) => {
  await open(page);
  const summary = page.locator(sel(SUMMARY)).filter({ hasText: EMPTY_TEXT });
  await expect(summary, `"${EMPTY_TEXT}" 예시 요약`).toHaveCount(1);
  // 그림문자 GHS07 이름도 "경고" — 그림문자 밖의 "경고" 가 신호어 pill
  const pill = summary.getByText("경고", { exact: true }).and(page.locator(`:not(${sel(GHS)} *)`));
  await expect(pill, '신호어 "경고"').toHaveCount(1);
  const bg = await pill.evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(achromatic(bg), `경고 pill 바탕 ${bg} = 회색`).toBe(true);
  expect(rgbParts(bg)[0], "옅은 회색 (canvas-soft)").toBeGreaterThanOrEqual(0xe0);
  expect(rgbParts(bg)[0]).toBeLessThan(255);
  expect(await pill.evaluate((e) => getComputedStyle(e).color), "경고 글자 = ink").toBe(rgbOf(INK));
  const empties = summary.getByText(EMPTY_TEXT, { exact: true });
  expect(await empties.count(), `"${EMPTY_TEXT}" 항목 ≥ 1`).toBeGreaterThan(0);
  for (let i = 0; i < (await empties.count()); i++) {
    const c = await empties.nth(i).evaluate((e) => getComputedStyle(e).color);
    expect(achromatic(c), `"${EMPTY_TEXT}" 글자 ${c} 무채색`).toBe(true);
  }
  for (const title of FRAME.sectionTitles) {
    const sec = sectionOf(summary, title);
    await expect(sec).toHaveCount(1);
    if ((await sec.getByText(EMPTY_TEXT, { exact: true }).count()) === 0) continue;
    await expect(sec.getByRole("listitem"), `"${title}" 비면 줄 0`).toHaveCount(0);
    await expect(sec.getByRole("button"), `"${title}" 비면 더 보기 0`).toHaveCount(0);
  }
});

test(`[C1][S*] 16-loading: ${SUMMARY} 안 ${SKELETON}(variants.loading) · aria-busy · 글자 없음 · 회색 줄만`, async ({ page }) => {
  expect(VARIANTS.loading, "variants 16 loading").toEqual(expect.arrayContaining([SUMMARY, SKELETON]));
  await open(page);
  const loading = page.locator(sel(SUMMARY)).filter({ has: page.locator(sel(SKELETON)) });
  expect(await loading.count(), `${SKELETON} 를 품은 ${SUMMARY}`).toBeGreaterThan(0);
  await expect(loading.first()).toHaveAttribute("aria-busy", "true");
  const sk = page.locator(sel(SKELETON));
  for (let i = 0; i < (await sk.count()); i++) {
    expect(((await sk.nth(i).innerText()) ?? "").trim(), "스켈레톤 글자 없음").toBe("");
    const bgs = await sk.nth(i).evaluate((root) =>
      [root, ...Array.from(root.querySelectorAll("*"))]
        .map((e) => getComputedStyle(e).backgroundColor)
        .filter((c) => c !== "rgba(0, 0, 0, 0)" && c !== "transparent"),
    );
    expect(bgs.length, "회색 줄이 칠해져 있다").toBeGreaterThan(0);
    for (const c of bgs) expect(achromatic(c), `스켈레톤 색 ${c} 무채색`).toBe(true);
  }
});

test(`[C1][S*] ${ORIGINAL}: ${OUTLINE} "${FRAME.original}" · 새 창(noopener) · 누름 높이 ≥ ${MIN_H}`, async ({ page }) => {
  await open(page);
  const links = page.locator(`${sel(ORIGINAL)} a`);
  const n = await links.count();
  expect(n, `${ORIGINAL} 링크`).toBeGreaterThan(0);
  expect(n, `${ORIGINAL} 마다 링크 1`).toBe(await page.locator(sel(ORIGINAL)).count());
  for (let i = 0; i < n; i++) {
    const a = links.nth(i);
    await expect(a).toHaveAttribute("data-component", OUTLINE);
    await expect(a).toContainText(FRAME.original);
    await expect(a).toHaveAttribute("target", "_blank");
    expect((await a.getAttribute("rel")) ?? "").toContain("noopener");
    expect((await a.getAttribute("href")) ?? "").toMatch(/^https?:\/\//);
    expect((await boxOf(a)).height).toBeGreaterThanOrEqual(MIN_H);
  }
  await expect(page.getByText(exact(FRAME.original)).first()).toBeVisible();
});
