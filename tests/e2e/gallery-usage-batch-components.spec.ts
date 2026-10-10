// 디자인 1.25 새 컴포넌트 (D1) — /gallery/usage-batch (비로그인 공개). 화면 3·4·10 (d7 §24).
// 기준: design/rules.json 1.25 usage_batch · class_info · reagent_delete 문장에 나오는 컴포넌트 이름(dev-rules components 안),
//   색 = rules colors(accent · accent_soft · highlight) · 새 프레임 4-mobile(recent-class-chip) · 4-error-mobile(usage-over-stock) ·
//   10-mobile(deleted-reagent-tag · 시약명 회색) · 3-delete-mobile(삭제 = 검정 button-primary) 노드 fills.
// 태그: [K1] 은 dev-rules test_rules 밖 (judge 규칙 집계에 섞이지 않음).
import { test, expect, type Locator, type Page } from "@playwright/test";
import { newFrame } from "./desk-helpers";
import { devRules, rules, sel } from "./screen-helpers";

const PAGE = "/gallery/usage-batch";
type R = { usage_batch: Record<string, string>; class_info: Record<string, unknown>; reagent_delete: Record<string, unknown>; colors: { accent: { value: string }; accent_soft: { value: string }; highlight: { values: string[] } } };
const RR = rules as unknown as R;
/** 1.25 에 새로 생긴 컴포넌트 (builder 보고 12종) — 아래 기대값 원본 테스트가 rules 1.25 문장 · dev-rules components 에 모두 있는지 확인한다 */
const NEW_COMPONENTS = ["reagent-picker", "reagent-add", "usage-batch-list", "usage-item-row", "usage-over-stock", "class-select", "recent-class-chip", "class-label", "class-filter", "deleted-reagent-tag", "reagent-more-menu", "reagent-delete"];
const RULES_TEXT = JSON.stringify([RR.usage_batch, RR.class_info, RR.reagent_delete, (rules as unknown as { variants: unknown }).variants, rules.screens_required]);
const rgb = (hex: string) => {
  const h = hex.replace("#", "");
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
};
type FN = ReturnType<typeof newFrame>[number] & { fills?: string[]; strokes?: string[] };
const node = (f: string, pred: (n: FN) => boolean, what: string): FN => {
  const n = (newFrame(f) as FN[]).find(pred);
  if (!n) throw new Error(`프레임 ${f} 에 ${what} 없음`);
  return n;
};
const CHIP_ON = node("4-mobile", (n) => n.name === "recent-class-chip" && (n.strokes ?? []).length > 0, "고른 칩");
const CHIP_OFF = node("4-mobile", (n) => n.name === "recent-class-chip" && (n.strokes ?? []).length === 0, "안 고른 칩");
const OVER = node("4-error-mobile", (n) => n.name === "usage-over-stock", "usage-over-stock");
const OVER_MSG = node("4-error-mobile", (n) => n.name === "message" && n.path.includes("usage-over-stock"), "초과 글자");
const TAG = node("10-mobile", (n) => n.name === "deleted-reagent-tag", "deleted-reagent-tag");
const TAG_LABEL = node("10-mobile", (n) => n.name === "label" && n.path.includes("deleted-reagent-tag"), "태그 글자");
const DEL_BTN = node("3-delete-mobile", (n) => n.name === "button-primary" && n.path.includes("modal-actions"), "삭제 버튼");
const css = (l: Locator, prop: string) => l.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
const section = (page: Page, id: string) => page.locator(`section[aria-labelledby="g-${id}"]`);

async function open(page: Page): Promise<void> {
  const res = await page.goto(PAGE);
  expect(res?.status(), `${PAGE} 응답`).toBe(200);
  await page.waitForLoadState("load");
}

/** 요소와 그 안의 모든 글자·바탕·테두리·SVG 색 */
const paints = (l: Locator) =>
  l.evaluateAll((els) => {
    const out: string[] = [];
    for (const root of els) {
      for (const n of [root, ...Array.from(root.querySelectorAll("*"))]) {
        const cs = getComputedStyle(n);
        out.push(cs.color, cs.backgroundColor, cs.borderTopColor);
        if (n instanceof SVGElement) out.push(cs.stroke, cs.fill);
      }
    }
    return out;
  });

test(`[K1][S4] 기대값 원본: rules 1.25 새 컴포넌트 ${NEW_COMPONENTS.length}개 = ${NEW_COMPONENTS.join(" · ")}`, () => {
  for (const n of NEW_COMPONENTS) {
    expect(RULES_TEXT, `rules 1.25 문장에 ${n}`).toContain(n);
    expect(devRules.components[n] ?? [], `dev-rules components ${n}`).not.toHaveLength(0);
  }
  expect((RR.colors.accent as unknown as { only_within: string[] }).only_within, "핑크 허용 = usage-over-stock 포함").toContain("usage-over-stock");
});

test(`[K1][S4] [K1][S3] [K1][S10] ${PAGE}: 새 컴포넌트마다 data-component ≥ 1 · 보임`, async ({ page }) => {
  await open(page);
  for (const n of NEW_COMPONENTS) {
    expect(await page.locator(sel(n)).count(), `${n} ≥ 1`).toBeGreaterThanOrEqual(1);
    await expect(page.locator(sel(n)).filter({ visible: true }).first(), `${n} 보임`).toBeVisible();
  }
});

test(`[K1][S4] usage-over-stock (rules errors · 4-error): 바탕 ${OVER.fills?.[0]}(accent_soft) · 아이콘 accent · 글자 ${OVER_MSG.fills?.[0]} — 핑크는 이 안에서만`, async ({ page }) => {
  await open(page);
  const o = section(page, "over").locator(sel("usage-over-stock"));
  await expect(o).toHaveCount(1);
  expect(OVER.fills?.[0]?.toLowerCase(), "시안 바탕 = rules accent_soft").toBe(RR.colors.accent_soft.value.toLowerCase());
  expect(await css(o, "background-color"), "바탕").toBe(rgb(OVER.fills![0]));
  const all = await paints(o);
  expect(all, "아이콘 = accent").toContain(rgb(RR.colors.accent.value));
  expect(await css(o.getByText(/보다 많아요$/), "color"), "글자 = ink").toBe(rgb(OVER_MSG.fills![0]));
});

test(`[K1][S4] recent-class-chip: 기본 바탕 ${CHIP_OFF.fills?.[0]} · 고름 = 바탕 ${CHIP_ON.fills?.[0]}(highlight-soft) + 테두리 ${CHIP_ON.strokes?.[0]}(highlight) · 글자 ink · aria-pressed`, async ({ page }) => {
  await open(page);
  const chips = section(page, "recent-chip").locator(sel("recent-class-chip"));
  await expect(chips).toHaveCount(3);
  const on = section(page, "recent-chip").locator(`${sel("recent-class-chip")}[aria-pressed="true"]`).first();
  const off = section(page, "recent-chip").locator(`${sel("recent-class-chip")}[aria-pressed="false"]`).first();
  expect(RR.colors.highlight.values.map((v) => v.toLowerCase()), "시안 고른 칩 색 = rules highlight").toEqual(expect.arrayContaining([CHIP_ON.fills![0].toLowerCase(), CHIP_ON.strokes![0].toLowerCase()]));
  expect(await css(on, "background-color"), "고른 칩 바탕").toBe(rgb(CHIP_ON.fills![0]));
  expect(await css(on, "border-top-color"), "고른 칩 테두리").toBe(rgb(CHIP_ON.strokes![0]));
  expect(await css(off, "background-color"), "기본 칩 바탕").toBe(rgb(CHIP_OFF.fills![0]));
  for (const c of [on, off]) expect(await css(c, "color"), "칩 글자 = ink (하늘색 글자 금지)").toBe(rgb("#141414"));
});

test(`[K1][S10] deleted-reagent-tag "삭제된 시약": 바탕 ${TAG.fills?.[0]} · 글자 ${TAG_LABEL.fills?.[0]} (10-mobile) · 핑크·하늘색 없음`, async ({ page }) => {
  await open(page);
  const tag = section(page, "deleted").locator(sel("deleted-reagent-tag")).first();
  await expect(tag).toHaveText(/^\s*삭제된 시약\s*$/);
  expect(await css(tag, "background-color")).toBe(rgb(TAG.fills![0]));
  expect(await css(tag, "color")).toBe(rgb(TAG_LABEL.fills![0]));
  const colorful = [RR.colors.accent.value, RR.colors.accent_soft.value, ...RR.colors.highlight.values].map(rgb);
  expect((await paints(tag)).filter((c) => colorful.includes(c)), "태그 무채색").toEqual([]);
});

test(`[K1][S3] reagent-more-menu · reagent-delete "시약 삭제" (ink 글자) · 확인 모달 "삭제" = 검정 button-primary(${DEL_BTN.fills?.[0]}) · 핑크 없음`, async ({ page }) => {
  await open(page);
  const item = section(page, "more-menu").locator(sel("reagent-delete")).first();
  await expect(item).toHaveText(/^\s*시약 삭제\s*$/);
  expect(await css(item, "color"), "메뉴 항목 글자 = ink").toBe(rgb("#141414"));
  const confirm = section(page, "delete-confirm");
  const del = confirm.locator(sel("button-primary"));
  await expect(del).toHaveText(/^\s*삭제\s*$/);
  expect(await css(del, "background-color"), "삭제 = 검정").toBe(rgb(DEL_BTN.fills![0]));
  const pink = [RR.colors.accent.value, RR.colors.accent_soft.value].map(rgb);
  expect((await paints(confirm.locator(sel("ex-modal-card")))).filter((c) => pink.includes(c)), "확인 모달 핑크 없음").toEqual([]);
});
