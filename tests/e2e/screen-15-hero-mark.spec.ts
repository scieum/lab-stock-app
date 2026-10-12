// 화면 15 랜딩 히어로 워드마크 (d7 §28 "랜딩" · design/rules.json 1.28 landing_hero_mark · 시안 15-mobile · 15-desktop) — 로그인 전 `/`.
// - landing-hero 안에 'Lab_Stock' 워드마크 0 — 상단 바(390 nav-pill · 1440 web-header)에만 1번.
// - 390 히어로 첫 줄 = caption text-muted '과학실 시약·센서 관리' → 제목(h1).
import { test, expect } from "@playwright/test";
import { newFrame } from "./desk-helpers";
import { routeOf, sel, useProjectViewport } from "./screen-helpers";
import { waitLanding } from "./screen-15-helpers";
import { HERO, exact } from "./d7-28-helpers";

const SCREEN = 15;

test(`[C1][S15] 기대값 원본: rules landing_hero_mark '${HERO.wordmark}' · 꼬리표 '${HERO.tag}' = 시안 15-mobile hero-lead · 15-mobile 히어로 안 워드마크 0`, () => {
  const nodes = newFrame("15-mobile");
  const hero = nodes.filter((n) => n.path.includes("landing-hero") && n.text);
  expect(hero[0]?.text?.characters, "시안 15-mobile 히어로 첫 글자 = 꼬리표").toBe(HERO.tag);
  expect(hero.filter((n) => n.text!.characters === HERO.wordmark), "시안 히어로 안 워드마크 0").toHaveLength(0);
  expect(nodes.filter((n) => n.path.includes("nav-pill") && n.text?.characters === HERO.wordmark), "시안 상단 바 워드마크 1").toHaveLength(1);
});

test(`[C1][S15] 랜딩: landing-hero 안 '${HERO.wordmark}' 워드마크 0 · 상단 바(390 nav-pill / 1440 web-header) '${HERO.wordmark}' 1 · 390 히어로 첫 줄 = '${HERO.tag}'(muted) → h1`, async ({ page }, info) => {
  const vp = await useProjectViewport(page, info);
  await page.goto(routeOf(SCREEN));
  await waitLanding(page);
  const hero = page.locator(sel("landing-hero"));
  await expect(hero, "landing-hero 1").toHaveCount(1);
  // 히어로 안 워드마크: 글자가 정확히 'Lab_Stock' 인 요소 0 (+ 390 은 글자 자체 0).
  // 1440 오른쪽 product-shot(시안 15-desktop: 앱 화면 그림 — 주소창 "샘플고등학교 · Lab_Stock" 과 그림 속 앱 사이드바)은 앱 화면 예시라 셈에서 뺀다
  const marks = await hero.evaluate(
    (el, [w, shot]) =>
      Array.from(el.querySelectorAll("*")).filter((e) => !e.closest(shot) && ((e as HTMLElement).innerText?.trim() === w || (e as HTMLImageElement).alt === w)).length,
    [HERO.wordmark, sel("product-shot")] as const,
  );
  expect(marks, `히어로 안 '${HERO.wordmark}' 워드마크 0`).toBe(0);
  if (vp === "mobile") expect(await hero.innerText(), `390 히어로 글자에 '${HERO.wordmark}' 없음`).not.toContain(HERO.wordmark);
  const bar = page.locator(sel(vp === "desktop" ? "web-header" : "nav-pill"));
  await expect(bar, "상단 바 1").toHaveCount(1);
  await expect(bar.getByText(HERO.wordmark, { exact: true }), `상단 바 '${HERO.wordmark}' 1`).toHaveCount(1);
  if (vp === "mobile") {
    const lines = await hero.evaluate((el) =>
      Array.from(el.querySelectorAll("*"))
        .filter((e) => e.children.length === 0 && (e as HTMLElement).innerText?.trim() && (e as HTMLElement).offsetParent !== null)
        .map((e) => ({ text: (e as HTMLElement).innerText.trim(), tag: e.tagName.toLowerCase(), top: e.getBoundingClientRect().top, color: getComputedStyle(e).color })),
    );
    expect(lines[0]?.text, "히어로 첫 줄 = 꼬리표").toBe(HERO.tag);
    const h1 = hero.locator("h1");
    await expect(h1, "제목 h1 1").toHaveCount(1);
    const tag = hero.getByText(HERO.tag, { exact: true });
    await expect(tag, "꼬리표 1").toHaveCount(1);
    const tb = (await tag.boundingBox())!;
    const hb = (await h1.boundingBox())!;
    expect(tb.y + tb.height, "꼬리표 → 제목 (위)").toBeLessThanOrEqual(hb.y + 1);
    const [tagColor, h1Color] = await Promise.all([tag.evaluate((e) => getComputedStyle(e).color), h1.evaluate((e) => getComputedStyle(e).color)]);
    expect(tagColor, "꼬리표 = text-muted (제목 ink 와 다름)").not.toBe(h1Color);
    await expect(tag).toHaveText(exact(HERO.tag));
  }
  await page.screenshot({ path: `test-results/v1-15-hero-${vp}.png` });
});
