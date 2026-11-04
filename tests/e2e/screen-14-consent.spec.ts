// 화면 14 (/signup) 동의 펼침 (design/rules.json 1.32 privacy_consent · variants[14].consent · d7 §30)
// 기대값: rules.json privacy_consent(detail·link·copy·age_confirm) · privacy_page.path · variants[14].consent
//         · design/frames/14-consent-{mobile|desktop}.json (펼친 모습: 노드 개수·consent-detail-wrap 여백·상자 모양)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { framePath } from "../frames";
import { countComponent, routeOf, rules, sel, useProjectViewport } from "./screen-helpers";
import { SCREEN, waitSignupScreen } from "./screen-14-helpers";

type PC = {
  detail: string;
  copy: Record<string, string>;
  age_confirm: { component: string; label: string; detail: string };
};
const R = rules as unknown as {
  privacy_consent: PC;
  privacy_page: { path: string };
  variants: Record<string, Record<string, string[]>>;
};
const PC_RULES = R.privacy_consent;
const CONSENT: string[] = R.variants[String(SCREEN)].consent ?? [];
const AGE = PC_RULES.age_confirm;
// rules age_confirm.detail "… 한 줄: '문구' (body-sm ink)" 의 문구
const AGE_LINE = AGE.detail.match(/한 줄: '([^']+)'/)?.[1] ?? "";
const DETAIL = "privacy-consent-detail";
const LINK = "privacy-link";
// rules privacy_consent.detail "순서 = A → B → … . 표 아님" 에서 항목 제목 순서
const ORDER: string[] = (PC_RULES.detail.match(/순서 = ([^.]+)\./)?.[1] ?? "").split("→").map((t) => t.trim()).filter(Boolean);
// 같은 순서의 copy 키 (officer 는 '{운영자 이름}' 자리표시 — 개발 쪽 실제 값이라 비어 있지 않음·자리표시 없음만 본다)
const COPY_KEYS = ["purpose", "items", "period", "processors", "refuse", "officer"];

type Node = { name: string; path: string[]; padding: number[] | null; gap: number | null; fills: string[]; cornerRadius: number | null; text: { characters: string } | null };
function consentNodes(vp: string): Node[] {
  const name = `${SCREEN}-consent-${vp}`;
  const file = JSON.parse(readFileSync(framePath(name), "utf8")) as { frames: { name: string; nodes: Node[] }[] };
  const f = file.frames.find((x) => x.name === name);
  if (!f) throw new Error(`design/frames/${name}.json 에 프레임 ${name} 없음`);
  return f.nodes;
}
const one = (nodes: Node[], name: string): Node => {
  const hit = nodes.filter((n) => n.name === name);
  expect(hit.length, `시안 노드 ${name} 1개`).toBe(1);
  return hit[0];
};
const hex = (rgb: string) =>
  "#" + (rgb.match(/\d+/g) ?? []).slice(0, 3).map((v) => Number(v).toString(16).padStart(2, "0")).join("");

// rules privacy_consent.detail "'개인정보 수집·이용 동의' › 를 누르면" 의 행 이름
const PRIVACY_ROW = PC_RULES.detail.match(/'([^']+)' ›/)?.[1] ?? "";
const privacyToggle = (page: Page) =>
  page.locator(sel("terms-agree")).getByRole("button", { name: PRIVACY_ROW });
const ageToggle = (page: Page) => page.locator(`${sel(AGE.component)} button[aria-expanded]`);
const openBoxes = (page: Page) => page.locator(`${sel("terms-agree")} button[aria-expanded="true"]`);

async function openSignup(page: Page): Promise<void> {
  await page.goto(routeOf(SCREEN));
  await waitSignupScreen(page);
}

async function expandPrivacy(page: Page): Promise<Locator> {
  await expect(privacyToggle(page), "개인정보 수집·이용 동의 › 버튼 1개").toHaveCount(1);
  await privacyToggle(page).click();
  await expect(page.locator(sel(DETAIL))).toHaveCount(1);
  return page.locator(sel(DETAIL));
}

test(`[C1][S${SCREEN}] 개인정보 동의 › 누르면 variants[${SCREEN}].consent 컴포넌트가 14-consent 프레임 개수대로 열림`, async ({ page }, info) => {
  const vp = await useProjectViewport(page, info);
  await openSignup(page);
  const nodes = consentNodes(vp);
  expect(CONSENT, "rules variants[14].consent").toEqual(expect.arrayContaining([DETAIL, LINK]));
  await expect(privacyToggle(page)).toHaveAttribute("aria-expanded", "false");
  await expandPrivacy(page);
  await expect(privacyToggle(page), "펼친 행의 › 는 ⌄ (aria-expanded)").toHaveAttribute("aria-expanded", "true");
  for (const name of CONSENT) {
    const want = nodes.filter((n) => n.name === name).length;
    expect(want, `${name} 가 14-consent-${vp} 프레임에 있음`).toBeGreaterThan(0);
    expect(await countComponent(page, name), `${name} (시안 14-consent-${vp} 노드 수)`).toBe(want);
  }
  // privacy-link 는 상자 안 (시안 consent-detail-wrap/privacy-consent-detail/privacy-link)
  await expect(page.locator(`${sel(DETAIL)} ${sel(LINK)}`)).toHaveCount(1);
  // 다시 누르면 접힘
  await privacyToggle(page).click();
  await expect(page.locator(sel(DETAIL)), "다시 누르면 접힘").toHaveCount(0);
  await expect(page.locator(sel(LINK))).toHaveCount(0);
});

test(`[C1][S${SCREEN}] privacy-consent-detail 항목 순서·문구 = rules privacy_consent.detail·copy`, async ({ page }, info) => {
  await useProjectViewport(page, info);
  await openSignup(page);
  const box = await expandPrivacy(page);
  expect(ORDER.length, "rules detail 순서").toBe(COPY_KEYS.length);
  const items = box.locator("dt");
  await expect(items, "항목 수 = rules 순서 수").toHaveCount(ORDER.length);
  expect((await items.allTextContents()).map((t) => t.trim())).toEqual(ORDER);
  const bodies = (await box.locator("dd").allTextContents()).map((t) => t.trim());
  expect(bodies.length).toBe(ORDER.length);
  COPY_KEYS.forEach((k, i) => {
    const want = PC_RULES.copy[k];
    expect(want, `rules copy.${k}`).toBeTruthy();
    if (k === "officer") {
      expect(bodies[i], "보호책임자 실제 값").not.toBe("");
      expect(bodies[i], "보호책임자 자리표시 없음").not.toMatch(/[{}]/);
    } else {
      expect(bodies[i], `${ORDER[i]} = copy.${k}`).toBe(want);
    }
  });
  // 표 아님 (rules detail "표 아님")
  await expect(box.locator("table")).toHaveCount(0);
});

test(`[C1][S${SCREEN}] privacy-link = '/privacy' 새 탭, 누른 뒤에도 가입 입력 유지`, async ({ page, context }, info) => {
  const vp = await useProjectViewport(page, info);
  await openSignup(page);
  const email = "consent-keep@example.com";
  await page.locator('input[name="email"]').fill(email);
  await expandPrivacy(page);
  const link = page.locator(sel(LINK));
  one(consentNodes(vp), LINK);
  const labelText = consentNodes(vp).find((n) => n.path.includes(LINK) && n.text)?.text?.characters;
  expect(labelText, "시안 privacy-link 문구").toBeTruthy();
  await expect(link).toContainText(labelText!);
  await expect(link).toHaveAttribute("target", "_blank");
  expect(new URL((await link.getAttribute("href"))!, "http://x").pathname).toBe(R.privacy_page.path);
  // rules link: colors.highlight 아님 — ink 밑줄
  const st = await link.evaluate((el) => {
    const c = getComputedStyle(el);
    return { color: c.color, deco: c.textDecorationLine };
  });
  const ink = consentNodes(vp).find((n) => n.path.includes(LINK) && n.text)!.fills[0];
  expect(hex(st.color), "privacy-link 글자색 = 시안 ink").toBe(ink.toLowerCase());
  expect(st.deco, "privacy-link 밑줄").toContain("underline");
  const [popup] = await Promise.all([context.waitForEvent("page"), link.click()]);
  await popup.waitForLoadState("domcontentloaded");
  expect(new URL(popup.url()).pathname, "새 탭 = /privacy").toBe(R.privacy_page.path);
  expect(new URL(page.url()).pathname, "가입 화면은 그대로").toBe(routeOf(SCREEN));
  await expect(page.locator('input[name="email"]'), "가입 입력 유지").toHaveValue(email);
  await popup.close();
});

test(`[C1][S${SCREEN}] age-confirm › 펼침 = rules privacy_consent.age_confirm.detail 한 줄`, async ({ page }, info) => {
  await useProjectViewport(page, info);
  await openSignup(page);
  expect(AGE_LINE, "rules age_confirm.detail 한 줄 문구").not.toBe("");
  const age = page.locator(sel(AGE.component));
  await expect(age).toHaveCount(1);
  await expect(age).toContainText(AGE.label);
  await expect(age.getByText(AGE_LINE), "펼치기 전 안내 없음").toHaveCount(0);
  await expect(ageToggle(page)).toHaveCount(1);
  await expect(ageToggle(page)).toHaveAttribute("aria-expanded", "false");
  await ageToggle(page).click();
  await expect(ageToggle(page), "펼친 행의 › 는 ⌄").toHaveAttribute("aria-expanded", "true");
  await expect(age.getByText(AGE_LINE, { exact: true })).toBeVisible();
  // canvas-soft 상자 (rules: canvas-soft · rounded.md)
  const bg = await age.getByText(AGE_LINE, { exact: true }).evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(hex(bg), "age-confirm 펼침 상자 = 시안 privacy-consent-detail 채움(canvas-soft)").toBe(
    one(consentNodes(info.project.name), DETAIL).fills[0].toLowerCase(),
  );
  await ageToggle(page).click();
  await expect(age.getByText(AGE_LINE), "다시 누르면 접힘").toHaveCount(0);
});

test(`[C1][S${SCREEN}] 펼침은 한 번에 하나 (14-consent: 개인정보 펼침 · age-confirm 접힘)`, async ({ page }, info) => {
  await useProjectViewport(page, info);
  await openSignup(page);
  expect(PRIVACY_ROW, "rules privacy_consent.detail 행 이름").not.toBe("");
  await expect(openBoxes(page), "기본 상태 펼침 0").toHaveCount(0);
  await expandPrivacy(page);
  await expect(openBoxes(page), "개인정보 펼침 1개").toHaveCount(1);
  await expect(ageToggle(page), "14-consent: age-confirm 은 접힌 › ").toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(sel(AGE.component)).getByText(AGE_LINE)).toHaveCount(0);
  await ageToggle(page).click();
  await expect(ageToggle(page)).toHaveAttribute("aria-expanded", "true");
  await expect(openBoxes(page), "age 펼치면 개인정보 접힘 — 펼침 1개").toHaveCount(1);
  await expect(page.locator(sel(DETAIL))).toHaveCount(0);
  await privacyToggle(page).click();
  await expect(openBoxes(page)).toHaveCount(1);
  await expect(page.locator(sel(DETAIL))).toHaveCount(1);
  await expect(page.locator(sel(AGE.component)).getByText(AGE_LINE)).toHaveCount(0);
});

test(`[C1][S${SCREEN}] 펼침 여백·상자 모양 = 14-consent 프레임 consent-detail-wrap · privacy-consent-detail`, async ({ page }, info) => {
  const vp = await useProjectViewport(page, info);
  await openSignup(page);
  const box = await expandPrivacy(page);
  const nodes = consentNodes(vp);
  const wrap = one(nodes, "consent-detail-wrap");
  const detail = one(nodes, DETAIL);
  const items = one(nodes, "consent-items");
  expect(wrap.padding && detail.padding, "시안 padding").toBeTruthy();
  const got = await box.evaluate((el) => {
    const w = getComputedStyle(el.parentElement!);
    const b = getComputedStyle(el);
    const dl = el.querySelector("dl");
    const px = (v: string) => Math.round(parseFloat(v));
    return {
      wrap: [w.paddingTop, w.paddingRight, w.paddingBottom, w.paddingLeft].map(px),
      box: [b.paddingTop, b.paddingRight, b.paddingBottom, b.paddingLeft].map(px),
      radius: px(b.borderTopLeftRadius),
      bg: b.backgroundColor,
      itemsGap: dl ? px(getComputedStyle(dl).rowGap) : -1,
    };
  });
  // padding 순서 = [위, 오른쪽, 아래, 왼쪽] (데스크톱 아래 0 · 모바일 아래 8)
  expect(got.wrap, `consent-detail-wrap padding (14-consent-${vp})`).toEqual(wrap.padding);
  expect(got.box, `privacy-consent-detail padding (14-consent-${vp})`).toEqual(detail.padding);
  expect(got.radius, "privacy-consent-detail radius").toBe(detail.cornerRadius);
  expect(hex(got.bg), "privacy-consent-detail 채움").toBe(detail.fills[0].toLowerCase());
  expect(got.itemsGap, "항목 사이 (consent-items gap)").toBe(items.gap);
});

// ---------- V1 (보고용 스크린샷, 실패 조건 아님) ----------
test(`[V1][S${SCREEN}] 화면 ${SCREEN}-consent 스크린샷 저장`, async ({ page }, info) => {
  const vp = await useProjectViewport(page, info);
  await openSignup(page).catch(() => undefined);
  await privacyToggle(page).click().catch(() => undefined);
  await page.screenshot({ path: join(process.cwd(), "test-results", `v1-${SCREEN}-consent-${vp}.png`), fullPage: true });
});
