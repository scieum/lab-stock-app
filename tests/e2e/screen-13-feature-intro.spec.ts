// 화면 13 신기능 소개 팝업 (variant 13-feature-intro, design/rules.json feature_intro · variants["13"]["feature-intro"] · harness/d7-data.md §30)
// 정답: rules feature_intro(문구·순서·역할·진입·동작·스타일) + 프레임 13-feature-intro-mobile·desktop(폭·여백·사이·높이).
// 지속 범위: 닫기·✕·Esc·배경 = 이번 접속(sessionStorage), '일주일 동안 보지 않기' = 7일(localStorage), 주 버튼 = 영구 + /intake?mode=doc.
// "다음 접속" = 같은 브라우저 저장(localStorage)만 이어받은 새 컨텍스트(context.storageState 는 sessionStorage 를 담지 않는다).
import { join } from "node:path";
import { test, expect, type Browser, type BrowserContext, type Locator, type Page, type TestInfo } from "@playwright/test";
import { openAs } from "./auth-state";
import { ROLE_LABEL, SCHOOL_A_ROLES, type Role } from "./db-helpers";
import { newFrame } from "./desk-helpers";
import { FI_CLOSED, FI_NEVER, FI_UNTIL } from "./feature-intro-helpers";
import { openGuest, waitGuestShell } from "./guest-helpers";
import { PROFILE_ROLE, ROLE_NAME, devRules, routeOf, rules, sel } from "./screen-helpers";

const SCREEN = 13;
const T = `[S${SCREEN}]`;
type FI = {
  component: string;
  roles: string[];
  entry: string;
  order: string;
  dismiss: string;
  behavior: string;
  style: string;
  mobile: string;
  desktop: string;
  copy: { tag: string; title: string; steps: string[]; cta: string };
};
const FI_RULES = (rules as unknown as { feature_intro: FI }).feature_intro;
const POPUP = FI_RULES.component;
const VARIANT = (rules as unknown as { variants: Record<string, Record<string, string[]>> }).variants[String(SCREEN)]["feature-intro"];
const DISMISS = VARIANT.find((n) => n !== POPUP)!;
/** rules dismiss: "왼쪽 '일주일 동안 보지 않기' · 오른쪽 '닫기'" */
const [WEEK_LABEL, CLOSE_LABEL] = [...FI_RULES.dismiss.matchAll(/'([^']+)'/g)].map((m) => m[1]);
const WEEK_MS = Number(/(\d+)일 숨김/.exec(FI_RULES.behavior)![1]) * 24 * 60 * 60 * 1000;
const CTA_PATH = `${routeOf(7)}?mode=doc`;
const PINK = (rules as unknown as { colors: Record<string, unknown> }).colors;
const PINK_HEX = "#d6246a";
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

type FNode = ReturnType<typeof newFrame>[number] & { padding?: number[] | null; gap?: number | null; cornerRadius?: number | null };
function frameNode(vp: "mobile" | "desktop", name: string, under: string = POPUP): FNode {
  const n = (newFrame(`${SCREEN}-feature-intro-${vp}`) as FNode[]).find((x) => x.name === name && (name === under || x.path.includes(under)));
  if (!n) throw new Error(`프레임 13-feature-intro-${vp} 에 ${name} 없음`);
  return n;
}

const vpOf = (info: TestInfo) => info.project.name as "mobile" | "desktop";
const popup = (page: Page) => page.locator(sel(POPUP));
const dismissRow = (page: Page) => popup(page).locator(sel(DISMISS));
const xButton = (page: Page) => popup(page).locator(`:scope > button[aria-label="${CLOSE_LABEL}"]`);

async function waitHome(page: Page): Promise<void> {
  await expect(page.locator(sel("home-summary")).first()).toBeVisible({ timeout: 45_000 });
  await page.waitForLoadState("load");
}

/** 팝업이 하이드레이션 뒤 마운트될 때까지 */
async function waitPopup(page: Page): Promise<Locator> {
  await expect(popup(page)).toHaveCount(1, { timeout: 15_000 });
  await expect(popup(page)).toBeVisible();
  return popup(page);
}

/** 팝업이 없음을 확인 (마운트 effect 뒤에도 0 — 하이드레이션 + 여유 1.5초) */
async function expectNoPopup(page: Page, why: string): Promise<void> {
  await page.waitForLoadState("load");
  await page.waitForTimeout(1_500);
  await expect(popup(page), why).toHaveCount(0);
}

async function openTeacherHome(browser: Browser, info: TestInfo, role: Role = "teacher") {
  const r = await openAs(browser, info, role, SCREEN, undefined, { featureIntro: true });
  await waitHome(r.page);
  return r;
}

/** 같은 브라우저의 다음 접속: localStorage 만 이어받은 새 컨텍스트로 홈 */
async function nextVisit(browser: Browser, info: TestInfo, from: BrowserContext): Promise<{ context: BrowserContext; page: Page }> {
  const storageState = await from.storageState();
  const [w, h] = devRules.viewports[vpOf(info)];
  const context = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: { width: w, height: h }, storageState });
  const page = await context.newPage();
  await page.goto(routeOf(SCREEN));
  await waitHome(page);
  return { context, page };
}

const storage = (page: Page) =>
  page.evaluate((k) => ({ closed: sessionStorage.getItem(k[0]), until: localStorage.getItem(k[1]), never: localStorage.getItem(k[2]) }), [FI_CLOSED, FI_UNTIL, FI_NEVER]);

// ---------- 기대값 원본 ----------
test(`[C1]${T} 기대값 원본: rules feature_intro · variants["13"]["feature-intro"] · 프레임 13-feature-intro-mobile·desktop`, () => {
  expect(VARIANT, "variants 13 feature-intro").toEqual(expect.arrayContaining([POPUP, DISMISS]));
  expect(FI_RULES.roles, "rules feature_intro.roles").toEqual(["교사", "admin"]);
  expect(FI_RULES.entry).toMatch(/학생·둘러보기 없음/);
  expect([WEEK_LABEL, CLOSE_LABEL]).toEqual(["일주일 동안 보지 않기", "닫기"]);
  expect(WEEK_MS, "일주일 = 7일").toBe(7 * 86_400_000);
  expect(JSON.stringify(PINK).toLowerCase(), "rules colors 에 핑크 #d6246a").toContain(PINK_HEX);
  for (const vp of ["mobile", "desktop"] as const) {
    expect(frameNode(vp, POPUP).width, `${vp} 프레임 팝업 폭`).toBe(vp === "mobile" ? 390 : 560);
    expect(frameNode(vp, DISMISS).height, `${vp} dismiss 줄 높이`).toBe(44);
  }
});

// ---------- 역할별 표시 (R-ui) ----------
for (const role of [...SCHOOL_A_ROLES, "schoolB"] as Role[]) {
  const shown = FI_RULES.roles.includes(ROLE_NAME[PROFILE_ROLE[role] as keyof typeof ROLE_NAME]);
  test(`[R-ui]${T} ${ROLE_LABEL[role]}: 홈(/) 진입 시 ${POPUP} ${shown ? "정확히 1개(한 번에 하나)" : "0개"} (rules feature_intro.roles)`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const { context, page } = await openTeacherHome(browser, info, role);
    try {
      if (shown) {
        await waitPopup(page);
        await page.waitForTimeout(1_000);
        await expect(popup(page), "한 번에 팝업 하나").toHaveCount(1);
        await expect(page.getByRole("dialog"), "dialog 하나").toHaveCount(1);
      } else {
        await expectNoPopup(page, `${ROLE_LABEL[role]} 홈에 ${POPUP} 0`);
        await expect(page.locator(sel(DISMISS)), `${DISMISS} 0`).toHaveCount(0);
      }
    } finally {
      await context.close();
    }
  });
}

test(`[R-ui]${T} 교사: 홈이 아닌 화면(시약 목록 ${routeOf(2)})에는 ${POPUP} 0 (rules entry: 홈 들어올 때만)`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page } = await openAs(browser, info, "teacher", 2, undefined, { featureIntro: true });
  try {
    await expectNoPopup(page, "시약 목록에 팝업 0");
  } finally {
    await context.close();
  }
});

test(`[GM-ui][S${SCREEN}g] 둘러보기(${devRules.routes["13-guest"]}): ${POPUP} 0 (rules entry: 둘러보기 없음)`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page } = await openGuest(browser, info, devRules.routes["13-guest"]);
  try {
    await waitGuestShell(page);
    await expect(page.locator(sel("home-summary")).first()).toBeVisible({ timeout: 45_000 });
    await expectNoPopup(page, "둘러보기 홈에 팝업 0");
    await expect(page.locator(sel(DISMISS))).toHaveCount(0);
  } finally {
    await context.close();
  }
});

// ---------- 문구·구성·순서 ----------
test(`[C1]${T} 교사: 문구 = rules feature_intro.copy (꼬리표·제목·단계 3줄·주 버튼) + dismiss 두 버튼 '${WEEK_LABEL}'·'${CLOSE_LABEL}'`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page } = await openTeacherHome(browser, info);
  try {
    const p = await waitPopup(page);
    const c = FI_RULES.copy;
    await expect(p.getByText(c.tag, { exact: true }), "꼬리표").toHaveCount(1);
    await expect(p.getByRole("heading"), "제목 heading 1개").toHaveCount(1);
    expect(norm(await p.getByRole("heading").innerText())).toBe(c.title);
    const steps = p.locator("ol > li");
    await expect(steps, "단계 수").toHaveCount(c.steps.length);
    for (let i = 0; i < c.steps.length; i++) {
      await expect(steps.nth(i), `단계 ${i + 1}`).toContainText(c.steps[i]);
      await expect(steps.nth(i), `단계 ${i + 1} 번호`).toContainText(String(i + 1));
    }
    await expect(p.locator(sel("button-primary")), "button-primary 1개").toHaveCount(1);
    expect(norm(await p.locator(sel("button-primary")).innerText())).toBe(c.cta);
    const btns = dismissRow(page).getByRole("button");
    await expect(btns).toHaveCount(2);
    expect([norm(await btns.nth(0).innerText()), norm(await btns.nth(1).innerText())], "왼쪽 일주일 · 오른쪽 닫기").toEqual([WEEK_LABEL, CLOSE_LABEL]);
  } finally {
    await context.close();
  }
});

test(`[C1]${T} 교사: 순서 = 꼬리표 → 제목 → 그림 → 단계 3줄 → 전폭 button-primary → ${DISMISS} (rules feature_intro.order)`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page } = await openTeacherHome(browser, info);
  try {
    const p = await waitPopup(page);
    const parts: [string, Locator][] = [
      ["꼬리표", p.getByText(FI_RULES.copy.tag, { exact: true })],
      ["제목", p.getByRole("heading")],
      ["그림", p.locator(':scope > [aria-hidden="true"]')],
      ["단계", p.locator("ol")],
      ["주 버튼", p.locator(sel("button-primary"))],
      [DISMISS, dismissRow(page)],
    ];
    let prevBottom = -Infinity;
    for (const [what, l] of parts) {
      await expect(l, what).toHaveCount(1);
      const b = (await l.boundingBox())!;
      expect(b.y, `${what} 이 앞 요소 아래`).toBeGreaterThanOrEqual(prevBottom - 0.5);
      prevBottom = b.y + b.height;
    }
  } finally {
    await context.close();
  }
});

// ---------- 여백·크기 (프레임 13-feature-intro-{vp}) ----------
test(`[C1]${T} 교사: 여백 = 프레임 13-feature-intro (팝업 안쪽 24·사이 24, 머리 사이 16, 본문 사이 16, 단계 사이 8, 버튼 줄 사이 8, 주 버튼 전폭·높이 ≥ button.min_height, dismiss 44)`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const vp = vpOf(info);
  const { context, page } = await openTeacherHome(browser, info);
  try {
    const p = await waitPopup(page);
    const fp = frameNode(vp, POPUP);
    const m = await p.evaluate((el) => {
      const cs = getComputedStyle(el);
      const kids = [...el.children].filter((k) => getComputedStyle(k).position !== "absolute").map((k) => k.getBoundingClientRect());
      const r = el.getBoundingClientRect();
      const gapOf = (box: Element | null) => {
        if (!box) return [];
        const ks = [...box.children].map((k) => k.getBoundingClientRect());
        return ks.slice(1).map((k, i) => Math.round(k.top - ks[i].bottom));
      };
      const head = el.querySelector("h2")!.parentElement!;
      const ol = el.querySelector("ol")!;
      const body = ol.parentElement!;
      const actions = el.querySelector('[data-component="button-primary"]')!.parentElement!;
      return {
        pad: [cs.paddingTop, cs.paddingRight, cs.paddingLeft].map(parseFloat),
        padBottom: parseFloat(cs.paddingBottom),
        firstTop: Math.round(kids[0].top - r.top - parseFloat(cs.borderTopWidth)),
        gaps: kids.slice(1).map((k, i) => Math.round(k.top - kids[i].bottom)),
        head: gapOf(head),
        body: gapOf(body),
        steps: gapOf(ol),
        actions: gapOf(actions),
      };
    });
    const [pt, pr, pb, pl] = fp.padding!;
    expect(m.pad, "팝업 안쪽 위·오른쪽·왼쪽").toEqual([pt, pr, pl]);
    expect(m.padBottom, "팝업 안쪽 아래 (모바일 = 24 + safe-area)").toBeGreaterThanOrEqual(pb);
    expect(m.firstTop, "첫 요소까지 위 여백").toBe(pt);
    expect(m.gaps, "머리·그림·본문 사이").toEqual([fp.gap, fp.gap]);
    expect(m.head, "꼬리표·제목 사이").toEqual([frameNode(vp, "intro-head").gap]);
    expect(m.body, "단계·버튼 묶음 사이").toEqual([frameNode(vp, "intro-body").gap]);
    expect(m.steps, "단계 줄 사이").toEqual([frameNode(vp, "intro-steps").gap, frameNode(vp, "intro-steps").gap]);
    expect(m.actions, "주 버튼·dismiss 사이").toEqual([frameNode(vp, "intro-actions").gap]);

    const btn = (await p.locator(sel("button-primary")).boundingBox())!;
    const fb = frameNode(vp, "button-primary");
    // 높이 = rules button.min_height 이상 (프레임 48 은 공용 button-primary 가 따르는 최소 44 규칙 안 — 시안마다 44·47·48 섞임)
    expect(btn.height, "주 버튼 높이 ≥ rules button.min_height").toBeGreaterThanOrEqual((rules as unknown as { button: { min_height: number } }).button.min_height);
    expect(Math.round(btn.width), "주 버튼 전폭 (프레임 폭)").toBe(fb.width);
    const row = (await dismissRow(page).boundingBox())!;
    expect(Math.round(row.height), "dismiss 줄 높이").toBe(frameNode(vp, DISMISS).height);
    expect(Math.round(row.width), "dismiss 줄 전폭").toBe(frameNode(vp, DISMISS).width);
  } finally {
    await context.close();
  }
});

test(`[C1]${T} 교사: dismiss = 왼쪽 '${WEEK_LABEL}' · 오른쪽 '${CLOSE_LABEL}', 둘 다 text-muted 13/400 텍스트 버튼(주 버튼보다 약함), 높이 44`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const vp = vpOf(info);
  const { context, page } = await openTeacherHome(browser, info);
  try {
    await waitPopup(page);
    const row = (await dismissRow(page).boundingBox())!;
    const week = dismissRow(page).getByRole("button", { name: WEEK_LABEL });
    const close = dismissRow(page).getByRole("button", { name: CLOSE_LABEL, exact: true });
    const wb = (await week.boundingBox())!;
    const cb = (await close.boundingBox())!;
    expect(Math.abs(wb.x - row.x), "일주일 = 왼쪽 끝").toBeLessThanOrEqual(1);
    expect(Math.abs(cb.x + cb.width - (row.x + row.width)), "닫기 = 오른쪽 끝").toBeLessThanOrEqual(1);
    for (const [what, b] of [["일주일", week], ["닫기", close]] as const) {
      const box = (await b.boundingBox())!;
      expect(Math.round(box.height), `${what} 누르는 높이`).toBe(frameNode(vp, what === "일주일" ? "dismiss-week" : "dismiss-close").height);
      const st = await b.evaluate((el) => {
        const s = getComputedStyle(el);
        return { color: s.color, size: s.fontSize, weight: s.fontWeight, bg: s.backgroundColor, border: s.borderTopWidth };
      });
      expect(st.color, `${what} 글자 = text-muted #707070`).toBe("rgb(112, 112, 112)");
      expect(st.size, `${what} 13`).toBe("13px");
      expect(st.weight, `${what} 400`).toBe("400");
      expect(st.bg, `${what} 바탕 없음(텍스트 버튼)`).toBe("rgba(0, 0, 0, 0)");
      expect(st.border, `${what} 테두리 없음`).toBe("0px");
    }
  } finally {
    await context.close();
  }
});

test(`[C1]${T} 교사: 스타일 = 흰 바탕 · border-strong 1줄 · 그림자 없음 · 핑크 없음 (rules feature_intro.style)`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page } = await openTeacherHome(browser, info);
  try {
    const p = await waitPopup(page);
    const st = await p.evaluate((el) => {
      const s = getComputedStyle(el);
      const all = [el, ...el.querySelectorAll("*")].map((e) => {
        const c = getComputedStyle(e);
        return [c.color, c.backgroundColor, c.borderTopColor, c.boxShadow, c.fill, c.stroke].join("|");
      });
      return { bg: s.backgroundColor, border: s.borderTopColor, bw: s.borderTopWidth, shadows: [el, ...el.querySelectorAll("*")].map((e) => getComputedStyle(e).boxShadow).filter((x) => x !== "none"), all };
    });
    expect(st.bg, "흰 바탕").toBe("rgb(255, 255, 255)");
    expect(st.border, "border-strong #e0e0e0").toBe("rgb(224, 224, 224)");
    expect(st.bw).toBe("1px");
    expect(st.shadows, "그림자 0 (effects.drop_shadow_max)").toEqual([]);
    expect(st.all.filter((x) => x.includes("214, 36, 106")), "핑크 #d6246a 0").toEqual([]);
  } finally {
    await context.close();
  }
});

// ---------- 모바일·데스크톱 모양 ----------
test(`[C1]${T} 교사: 390 = 바텀시트(전폭·화면 아래 붙음·위 모서리 24·아래 0·딤·✕ 없음·tab-bar 덮음) / 1440 = 가운데 모달 560(모서리 24·오른쪽 위 ✕)`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const vp = vpOf(info);
  const [W, H] = devRules.viewports[vp];
  const { context, page } = await openTeacherHome(browser, info);
  try {
    const p = await waitPopup(page);
    const b = (await p.boundingBox())!;
    const r = await p.evaluate((el) => {
      const s = getComputedStyle(el);
      return [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius].map(parseFloat);
    });
    // 딤: 팝업 밖 한 점을 누르면 팝업 밖 요소(딤)가 맞는다 — 홈이 아니라
    const hit = await page.evaluate((s) => {
      const e = document.elementFromPoint(4, 4);
      const ov = document.querySelector(s)!.parentElement!;
      return { inOverlay: !!e && ov.contains(e), op: e ? getComputedStyle(e).opacity : "" };
    }, sel(POPUP));
    expect(hit.inOverlay, "팝업 밖 = 딤(배경)").toBe(true);
    expect(Number(hit.op), "딤은 반투명").toBeLessThan(1);
    if (vp === "mobile") {
      expect(Math.round(b.width), "전폭").toBe(frameNode(vp, POPUP).width);
      expect(Math.round(b.x)).toBe(0);
      expect(Math.round(b.y + b.height), "화면 아래에 붙음").toBe(H);
      expect(r, "위 모서리 24 · 아래 0").toEqual([frameNode(vp, POPUP).cornerRadius, frameNode(vp, POPUP).cornerRadius, 0, 0]);
      await expect(xButton(page), "모바일 ✕ 없음").toBeHidden();
      const tab = page.locator(sel(rules.tab_bar.component));
      await expect(tab).toHaveCount(1);
      const tb = (await tab.boundingBox())!;
      const covered = await page.evaluate(([x, y, s]) => !!document.elementFromPoint(x, y)?.closest(s), [tb.x + tb.width / 2, tb.y + tb.height / 2, sel(POPUP)] as const);
      expect(covered, "바텀시트가 tab-bar 를 덮음").toBe(true);
    } else {
      expect(Math.round(b.width), "모달 폭").toBe(frameNode(vp, POPUP).width);
      expect(Math.abs(b.x + b.width / 2 - W / 2), "가로 가운데").toBeLessThanOrEqual(1);
      expect(Math.abs(b.y + b.height / 2 - H / 2), "세로 가운데").toBeLessThanOrEqual(1);
      expect(r, "모서리 모두 24").toEqual(Array(4).fill(frameNode(vp, POPUP).cornerRadius));
      const x = xButton(page);
      await expect(x, "데스크톱 ✕ 보임").toBeVisible();
      const xb = (await x.boundingBox())!;
      const fx = frameNode(vp, "button-close");
      expect([Math.round(xb.width), Math.round(xb.height)], "✕ 44×44").toEqual([fx.width, fx.height]);
      expect(xb.x + xb.width / 2, "✕ 오른쪽").toBeGreaterThan(b.x + b.width / 2);
      expect(xb.y + xb.height / 2, "✕ 위").toBeLessThan(b.y + b.height / 2);
      const t = (await p.getByRole("heading").boundingBox())!;
      expect(t.x + t.width, "제목이 ✕ 와 겹치지 않음").toBeLessThanOrEqual(xb.x + 0.5);
    }
  } finally {
    await context.close();
  }
});

// ---------- 접근성 ----------
test(`[C1]${T} 교사: 접근성 — role=dialog · aria-modal=true · 제목으로 이름 · 열리면 포커스가 팝업 안`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page } = await openTeacherHome(browser, info);
  try {
    const p = await waitPopup(page);
    await expect(p).toHaveAttribute("role", "dialog");
    await expect(p).toHaveAttribute("aria-modal", "true");
    await expect(page.getByRole("dialog", { name: FI_RULES.copy.title })).toHaveCount(1);
    await expect.poll(() => p.evaluate((el) => el.contains(document.activeElement)), { message: "처음 포커스가 팝업 안" }).toBe(true);
  } finally {
    await context.close();
  }
});

test(`[C1]${T} 교사: 포커스 트랩 — Tab·Shift+Tab 을 여러 번 눌러도 포커스가 팝업 밖(홈)으로 나가지 않음`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page } = await openTeacherHome(browser, info);
  try {
    const p = await waitPopup(page);
    await expect.poll(() => p.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    const n = (await p.locator("button:visible, a:visible").count()) + 2;
    for (const key of ["Tab", "Shift+Tab"]) {
      for (let i = 0; i < n; i++) {
        await page.keyboard.press(key);
        const inside = await p.evaluate((el) => el.contains(document.activeElement));
        expect(inside, `${key} ${i + 1}번째 뒤 포커스가 팝업 안`).toBe(true);
      }
    }
  } finally {
    await context.close();
  }
});

// ---------- 닫기 방식별 지속 범위 ----------
type CloseWay = { name: string; desktopOnly?: boolean; act: (page: Page) => Promise<void> };
const SESSION_WAYS: CloseWay[] = [
  { name: `'${CLOSE_LABEL}'`, act: (page) => dismissRow(page).getByRole("button", { name: CLOSE_LABEL, exact: true }).click() },
  { name: "✕", desktopOnly: true, act: (page) => xButton(page).click() },
  { name: "Esc", act: (page) => page.keyboard.press("Escape") },
  { name: "배경(딤)", act: (page) => page.mouse.click(4, 4) },
];

for (const way of SESSION_WAYS) {
  test(`[C1]${T} 교사: ${way.name}${way.desktopOnly ? "(1440만, 390 = ✕ 없음)" : ""} = 이번 접속에서만 숨김 (sessionStorage — 새로고침 0 · 다음 접속(새 컨텍스트) 다시 1 · localStorage 저장 없음)`, async ({ browser }, info) => {
    test.setTimeout(150_000);
    const { context, page } = await openTeacherHome(browser, info);
    let next: BrowserContext | undefined;
    try {
      await waitPopup(page);
      if (way.desktopOnly && vpOf(info) === "mobile") {
        // 390 바텀시트에는 ✕ 가 없다 (rules feature_intro.mobile) — 누를 수 없음을 확인
        await expect(xButton(page), "모바일 ✕ 없음").toBeHidden();
        return;
      }
      await way.act(page);
      await expect(popup(page), "닫힘").toHaveCount(0);
      const s = await storage(page);
      expect(s.closed, "sessionStorage 에 닫음").not.toBeNull();
      expect([s.until, s.never], "localStorage 저장 없음").toEqual([null, null]);
      await page.reload();
      await waitHome(page);
      await expectNoPopup(page, "같은 접속 새로고침 = 0");
      const v = await nextVisit(browser, info, context);
      next = v.context;
      await waitPopup(v.page);
    } finally {
      await next?.close();
      await context.close();
    }
  });
}

test(`[C1]${T} 교사: '${WEEK_LABEL}' = localStorage 에 지금+7일 만료 저장 · 다음 접속 0`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page } = await openTeacherHome(browser, info);
  let next: BrowserContext | undefined;
  try {
    await waitPopup(page);
    const before = Date.now();
    await dismissRow(page).getByRole("button", { name: WEEK_LABEL }).click();
    const after = Date.now();
    await expect(popup(page)).toHaveCount(0);
    const s = await storage(page);
    expect(s.never, "영구 숨김 아님").toBeNull();
    const until = Number(s.until);
    expect(until, "만료 = 누른 시각 + 7일").toBeGreaterThanOrEqual(before + WEEK_MS - 1_000);
    expect(until).toBeLessThanOrEqual(after + WEEK_MS + 1_000);
    const v = await nextVisit(browser, info, context);
    next = v.context;
    await expectNoPopup(v.page, "다음 접속 = 0");
  } finally {
    await next?.close();
    await context.close();
  }
});

test(`[C1]${T} 교사: '${WEEK_LABEL}' 7일 만료 — 시계 7일-1분 = 0 · 7일+1분 = 다시 1 (누른 뒤 시계 조작)`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const { context, page } = await openTeacherHome(browser, info);
  const opened: BrowserContext[] = [];
  try {
    await waitPopup(page);
    await dismissRow(page).getByRole("button", { name: WEEK_LABEL }).click();
    await expect(popup(page)).toHaveCount(0);
    const until = Number((await storage(page)).until);
    for (const [offset, shown] of [[-60_000, false], [60_000, true]] as const) {
      const st = await context.storageState();
      const [w, h] = devRules.viewports[vpOf(info)];
      const c = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: { width: w, height: h }, storageState: st });
      opened.push(c);
      await c.clock.install({ time: until + offset });
      const p = await c.newPage();
      await p.goto(routeOf(SCREEN));
      await waitHome(p);
      if (shown) await waitPopup(p);
      else await expectNoPopup(p, "7일 안 = 0");
    }
  } finally {
    for (const c of opened) await c.close();
    await context.close();
  }
});

test(`[C1]${T} 교사: 저장값 주입 — 만료 시각이 지났으면 1 · 남았으면 0 · 영구 숨김이면 0`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const cases: [string, Record<string, string>, boolean][] = [
    ["만료 지남", { [FI_UNTIL]: "__PAST__" }, true],
    ["만료 남음", { [FI_UNTIL]: "__FUTURE__" }, false],
    ["영구", { [FI_NEVER]: "1" }, false],
  ];
  for (const [what, ls, shown] of cases) {
    const { context, page } = await openAs(browser, info, "teacher", SCREEN, undefined, { featureIntro: true });
    try {
      await waitHome(page);
      await page.evaluate((entries) => {
        for (const [k, v] of Object.entries(entries)) {
          const val = v === "__PAST__" ? String(Date.now() - 60_000) : v === "__FUTURE__" ? String(Date.now() + 6 * 86_400_000) : v;
          localStorage.setItem(k, val);
        }
      }, ls);
      await page.reload();
      await waitHome(page);
      if (shown) await waitPopup(page);
      else await expectNoPopup(page, `${what} = 0`);
    } finally {
      await context.close();
    }
  }
});

test(`[C1]${T} 교사: 주 버튼 '${FI_RULES.copy.cta}' = ${CTA_PATH} (화면 7 서류로 입고) + 영구 숨김 (다음 접속·30일 뒤에도 0)`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const { context, page } = await openTeacherHome(browser, info);
  const opened: BrowserContext[] = [];
  try {
    const p = await waitPopup(page);
    await p.locator(sel("button-primary")).click();
    await page.waitForURL((u) => u.pathname === routeOf(7) && u.searchParams.get("mode") === "doc", { timeout: 30_000 });
    await expect(page.locator(sel("doc-upload")), "화면 7 서류 올리기").toHaveCount(1, { timeout: 30_000 });
    await expect(popup(page)).toHaveCount(0);
    const s = await storage(page);
    expect(s.never, "localStorage 영구 숨김").not.toBeNull();
    const v = await nextVisit(browser, info, context);
    opened.push(v.context);
    await expectNoPopup(v.page, "다음 접속 = 0");
    const st = await context.storageState();
    const [w, h] = devRules.viewports[vpOf(info)];
    const later = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: { width: w, height: h }, storageState: st });
    opened.push(later);
    await later.clock.install({ time: Date.now() + 30 * 86_400_000 });
    const lp = await later.newPage();
    await lp.goto(routeOf(SCREEN));
    await waitHome(lp);
    await expectNoPopup(lp, "30일 뒤 = 0");
  } finally {
    for (const c of opened) await c.close();
    await context.close();
  }
});

test(`[C1]${T} 교사: 저장소 접근 실패(getItem 예외) = 팝업을 띄우지 않음 · 홈은 그대로 (d7 §30)`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page } = await openTeacherHome(browser, info);
  try {
    await waitPopup(page); // 대조: 저장소가 정상이면 뜬다
    await context.addInitScript(() => {
      Storage.prototype.getItem = () => {
        throw new DOMException("blocked", "SecurityError");
      };
    });
    await page.reload();
    await waitHome(page);
    await expectNoPopup(page, "저장소 예외 = 0");
  } finally {
    await context.close();
  }
});

// ---------- V1 ----------
test(`[V1]${T} 교사 홈 + 신기능 소개 팝업 스크린샷 (test-results/v1-13-feature-intro-{mobile|desktop}.png)`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const vp = vpOf(info);
  const { context, page } = await openTeacherHome(browser, info);
  try {
    await waitPopup(page);
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(process.cwd(), "test-results", `v1-${SCREEN}-feature-intro-${vp}.png`) });
  } finally {
    await context.close();
  }
});
