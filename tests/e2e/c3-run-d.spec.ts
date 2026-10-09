// C3 데스크톱 재구성 run d — 로그인 전 1·14·15 + 둘러보기 데스크톱 (harness/d5-gates.md C3, harness/d7-data.md §23 "run d 세부",
// design/rules.json 1.24 desktop_shell.pre_login · guest(sidebar_locks · desktop) · footer · landing_rhythm · typography.display_sizes · frames.tall,
// harness/dev-rules.json 1.14 (web-header [1,14,15] · product-shot·landing-tabs·landing-section·step-flow·cta-band·web-footer [15] ·
// desktop_migrated_screens 1~16)).
// - 1440: 로그인 전 = web-header 1(시안 높이·radius 0·전폭) · nav-pill·app-sidebar 0, 1·14 = 왼쪽 폼(시안 form-column) / 오른쪽 소개 패널 반 나눔,
//   14 = 번호 섹션 "1 학교 선택" → "2 계정", 15 = 긴 랜딩(섹션 순서 · 띠 배경 · 검정 띠 반전 버튼 · footer 한 줄 · 큰 글자 40/48 허용 컴포넌트 안 ·
//   landing-tabs 고정 + 보이는 섹션 밑줄 · 떠오름 한 번 16px·0.4s · 동작 줄이기면 끔)
// - 1440 둘러보기 = app-sidebar(위 "데모 학교", 홈·시약 + 잠긴 기록·QR 찾기 guest-lock 2, 아래 "둘러보는 중" + 로그인) + 본문 위 guest-banner,
//   2g/3g/16g = data-table + 드로어(주소 /demo/…, 읽기 전용)
// - 390 은 변경 없음 (모바일 그대로)
// 기대값은 규칙 파일과 새 프레임(design/frames)에서만 읽는다. 비로그인 컨텍스트만 쓴다 (공용 데이터 읽기만).
import { test, expect, type Locator, type Page } from "@playwright/test";
import { DESKTOP_SHELL, frameSidebarItems } from "../desktop-shell";
import { desktopMigratedScreens } from "../frames";
import { DRAWER, DRAWER_W, SIDEBAR_W, TABLE, drawer, drawerClose, drawerTitle, waitDrawer, waitWidthSettled } from "./desk-helpers";
import { GUEST, demoReagents, guestDetailPath, guestRouteOf, openGuest } from "./guest-helpers";
import {
  HEADER,
  PRE,
  R,
  expectPreLoginShell,
  frameNodes,
  frameOf,
  frameTextsIn,
  hexToRgb,
  hexesIn,
  scrollThrough,
} from "./pre-login-helpers";
import { devRules, routeOf, rules, sel, type ViewportName } from "./screen-helpers";

const VIEW_W = devRules.viewports.desktop[0];
const LANDING = 15;
const SIGNUP = 14;
const LOGIN = 1;
const REQ15 = PRE.desktop_required[String(LANDING)] ?? [];
const DISPLAY = R.typography.display_sizes;
const GUEST_DESK = GUEST as unknown as typeof GUEST & { sidebar_locks: number; desktop: string };
const SIDEBAR_LOCKS = GUEST_DESK.sidebar_locks;

/** 화면 글자 정리 */
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** 화면 폭 이름 */
const vpOf = (page: Page): ViewportName => ((page.viewportSize()?.width ?? 0) >= VIEW_W ? "desktop" : "mobile");

/** 로그인 전 화면이 그려지고 폭 정리가 끝날 때까지 */
async function openPre(page: Page, screen: number): Promise<ViewportName> {
  const res = await page.goto(routeOf(screen));
  expect(res?.status(), `${routeOf(screen)} 응답`).toBe(200);
  await page.waitForLoadState("load");
  const vp = vpOf(page);
  await expectPreLoginShell(page, screen, vp, `화면 ${screen}`);
  return vp;
}

/** 요소 상자 */
async function box(l: Locator, what: string) {
  await expect(l, `${what} 보임`).toBeVisible();
  const b = await l.boundingBox();
  if (!b) throw new Error(`${what} 상자 없음`);
  return b;
}

/** non-GET 요청 기록 */
function watchWrites(page: Page): () => string[] {
  const writes: string[] = [];
  page.on("request", (r) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(r.method())) writes.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });
  return () => writes;
}

// =====================================================================
// 기대값 원본
// =====================================================================

test(`[C3][S*] 기대값 원본 (run d): pre_login.screens ${PRE.screens.join("·")} = dev-rules ${HEADER} · desktop_required[15] ${REQ15.join("·")} = dev-rules [15] · display ${DISPLAY.sizes.join("/")} only_within ${DISPLAY.only_within.join("·")} · 15-desktop 높이 = frames.tall · footer = 시안 · 띠 색 = landing_rhythm · 둘러보기 사이드바 잠금 ${SIDEBAR_LOCKS}`, () => {
  expect([...devRules.components[HEADER]].sort(), `dev-rules components ${HEADER}`).toEqual([...PRE.screens].sort());
  for (const n of REQ15) expect(devRules.components[n], `dev-rules components ${n} = [15]`).toEqual([LANDING]);
  for (const s of PRE.screens) expect(DESKTOP_SHELL.screens, `로그인 전 ${s} 은 사이드바 셸 대상 아님`).not.toContain(s);
  const migrated = desktopMigratedScreens();
  for (const s of devRules.mvp_screens) expect(migrated, `mvp 화면 ${s} 이전됨 (run d 끝 = 전부)`).toContain(s);
  // typography: 큰 글자는 본문 크기 목록 밖 + 시안 15-desktop 의 40·48 글자는 허용 컴포넌트 안
  const bodySizes = (R.typography as unknown as { sizes: number[] }).sizes;
  for (const s of DISPLAY.sizes) expect(bodySizes, `큰 글자 ${s} 는 본문 크기 목록 밖`).not.toContain(s);
  const bigFrame = frameOf("15-desktop").nodes.filter((n) => n.type === "TEXT" && DISPLAY.sizes.includes(Number(n.text?.fontSize)));
  expect(bigFrame.length, "시안 15-desktop 40·48 글자").toBeGreaterThan(0);
  for (const n of bigFrame) {
    expect(DISPLAY.only_within.some((c) => n.path.includes(c)) || n.path.some((p) => /^section-band-[2-5]$/.test(p)), `시안 ${n.text!.characters} (${n.text!.fontSize}) 위치`).toBe(true);
  }
  // frames.tall
  const tall = R.frames.tall["15-desktop"];
  const f15 = frameOf("15-desktop");
  expect(f15.width).toBe(tall.width);
  expect(f15.height).toBeGreaterThanOrEqual(tall.min_height);
  expect(f15.height).toBeLessThanOrEqual(tall.max_height);
  // footer
  expect(frameTextsIn("15-desktop", "web-footer"), "시안 web-footer 글자 = rules footer.text").toEqual([R.footer.text]);
  // 띠 색: 시안 띠 fill 은 rules landing_rhythm 의 색만 (흰·회 번갈아, step-flow·cta-band 는 검정)
  const bandHex = hexesIn(R.landing_rhythm.bands);
  expect(bandHex.length, "landing_rhythm 색 3").toBe(3);
  const bands = frameBandFills();
  for (const b of bands) expect(bandHex, `시안 띠 ${b}`).toContain(b);
  // 둘러보기 사이드바 잠금: 시안 4장 모두 사이드바 안 guest-lock = sidebar_locks
  for (const s of GUEST.screens) {
    const locks = frameOf(`${s}-guest-desktop`).nodes.filter((n) => n.name === GUEST.lock && n.path.includes(DESKTOP_SHELL.component)).length;
    expect(locks, `시안 ${s}-guest-desktop 사이드바 잠금`).toBe(SIDEBAR_LOCKS);
  }
});

/** 시안 15-desktop 히어로 아래 띠 fill 순서 (section-band-N … cta-band) */
function frameBandFills(): string[] {
  return frameOf("15-desktop")
    .nodes.filter((n) => n.path.length === 2 && (/^section-band-\d+$/.test(n.name) || n.name === "cta-band"))
    .map((n) => (n.fills?.[0] ?? "").toLowerCase());
}

// =====================================================================
// 로그인 전 1·14·15 — web-header
// =====================================================================

for (const screen of PRE.screens) {
  test(`[C3][S${screen}] 1440 ${HEADER} 1 (시안 높이·radius 0·전폭·바탕·아래 hairline) · 버튼 = 시안 header-actions · ${PRE.forbidden.join("·")} 0 / 390 = ${HEADER} 0 · nav-pill 시안 수 (모바일 그대로)`, async ({ page }) => {
    test.setTimeout(90_000);
    const vp = await openPre(page, screen);
    if (vp === "mobile") return; // 390 은 openPre → expectPreLoginShell 에서 web-header 0 · nav-pill = 새 모바일 프레임 수
    const frame = `${screen}-desktop`;
    const fh = frameNodes(frame, HEADER)[0];
    const h = page.locator(sel(HEADER));
    const b = await box(h, HEADER);
    expect(Math.round(b.x), `${HEADER} x`).toBe(0);
    expect(Math.round(b.y), `${HEADER} y`).toBe(0);
    expect(Math.round(b.width), `${HEADER} 전폭`).toBe(VIEW_W);
    expect(Math.round(b.height), `${HEADER} 높이 = 시안 ${fh.height}`).toBe(fh.height);
    const cs = await h.evaluate((el) => {
      const s = getComputedStyle(el);
      return { r: [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomLeftRadius, s.borderBottomRightRadius], bg: s.backgroundColor, bb: s.borderBottomColor, bbw: s.borderBottomWidth, shadow: s.boxShadow };
    });
    expect(cs.r, "radius 0").toEqual(["0px", "0px", "0px", "0px"]);
    expect(cs.bg, `바탕 = 시안 ${fh.fills![0]}`).toBe(hexToRgb(fh.fills![0]));
    if (fh.strokes?.[0]) {
      // 아래 hairline (시안 stroke) — border-bottom 또는 box-shadow 로
      const line = hexToRgb(fh.strokes[0]);
      expect(cs.bb === line && parseFloat(cs.bbw) > 0 ? true : cs.shadow.includes(line), `아래 hairline = 시안 ${fh.strokes[0]}`).toBe(true);
    }
    // 왼쪽 워드마크 = 시안
    const word = frameNodes(frame, "wordmark").find((n) => n.path.includes(HEADER))!.text!.characters;
    expect(norm(await h.innerText()).startsWith(word), `왼쪽 ${word}`).toBe(true);
    // 오른쪽 버튼 = 시안 header-actions (컴포넌트·글자·순서), 링크 = 로그인 routes[1] · 회원가입 routes[14]
    const want = frameOf(frame)
      .nodes.filter((n) => n.path.includes("header-actions") && n.name.startsWith("button-") && n.path[n.path.length - 2] === "header-actions")
      .map((n) => ({ comp: n.name, label: frameOf(frame).nodes.find((t) => t.type === "TEXT" && t.path.includes(n.name) && t.path.includes("header-actions") && t.path.indexOf(n.name) === t.path.length - 2)?.text?.characters ?? "" }));
    expect(want.length, `시안 ${frame} 버튼`).toBeGreaterThan(0);
    const shown = await h.locator('[data-component^="button-"]').evaluateAll((els) =>
      els.map((e) => ({ comp: e.getAttribute("data-component"), label: (e as HTMLElement).innerText.replace(/\s+/g, " ").trim(), href: e.getAttribute("href") })),
    );
    expect(shown.map((s) => ({ comp: s.comp, label: s.label })), `${HEADER} 버튼 = 시안 ${frame}`).toEqual(want);
    const hrefOf: Record<string, string> = { 로그인: routeOf(LOGIN), 회원가입: routeOf(SIGNUP) };
    for (const s of shown) {
      expect(hrefOf[s.label], `알려진 버튼 글자 ${s.label}`).toBeTruthy();
      expect(s.href ? new URL(s.href, "http://x").pathname : null, `${s.label} 링크`).toBe(hrefOf[s.label]);
    }
    // 1 = 회원가입 · 14 = 로그인 · 15 = 둘 다 (d7 §23 run d: 지금 화면으로 가는 버튼은 없다)
    if (screen === LOGIN) expect(shown.map((s) => s.label)).not.toContain("로그인");
    if (screen === SIGNUP) expect(shown.map((s) => s.label)).not.toContain("회원가입");
    // 셸 이외: 탭바 · 계정 메뉴 · 사이드바 항목 0
    for (const n of [rules.tab_bar.component, rules.tab_bar.item, DESKTOP_SHELL.item, "nav-account-menu", GUEST.banner, GUEST.lock]) {
      await expect(page.locator(sel(n)), `1440 화면 ${screen}: ${n} 0`).toHaveCount(0);
    }
  });
}

// =====================================================================
// 1·14 반 나눔
// =====================================================================

for (const screen of [LOGIN, SIGNUP]) {
  test(`[C3][S${screen}] 1440 반 나눔: 왼쪽 폼(ex-auth-form-card 폭 = 시안 form-column) / 오른쪽 소개 패널(시안 intro-panel 폭·바탕, feature-card ${frameNodes(`${screen}-desktop`, "feature-card").length} = 시안 제목 순서) · 390 = 소개 패널 없음(모바일 그대로)`, async ({ page }) => {
    test.setTimeout(90_000);
    const vp = await openPre(page, screen);
    const frame = `${screen}-${vp}`;
    const cards = page.locator(sel("feature-card"));
    if (vp === "mobile") {
      await expect(cards, `390 feature-card = 시안 ${frame}`).toHaveCount(frameNodes(frame, "feature-card").length);
      await expect(page.locator(sel("ex-auth-form-card")).first(), "390 폼").toBeVisible();
      return;
    }
    const pane = frameNodes(frame, "form-pane")[0];
    const col = frameNodes(frame, "form-column")[0];
    const intro = frameNodes(frame, "intro-panel")[0];
    expect(pane.width! + intro.width!, "시안 폼 칸 + 소개 패널 = 화면 폭").toBe(VIEW_W);
    const header = await box(page.locator(sel(HEADER)), HEADER);
    // 폼 열
    const form = page.locator(sel("ex-auth-form-card")).first();
    const fb = await box(form, "ex-auth-form-card");
    expect(Math.round(fb.width), `폼 열 폭 = 시안 form-column ${col.width}`).toBe(col.width);
    expect(fb.x + fb.width, "폼은 왼쪽 칸 안").toBeLessThanOrEqual(pane.width!);
    expect(fb.y, "폼은 web-header 아래").toBeGreaterThanOrEqual(header.y + header.height);
    // 폼 제목 = 시안 auth-title
    const title = frameTextsIn(frame, "auth-heading")[0];
    await expect(form.locator("h1").first(), `폼 제목 = 시안 ${title}`).toHaveText(title);
    // 소개 패널: feature-card 들의 가장 가까운 공통 조상 중 바탕 = 시안 intro-panel fill
    const panelFill = hexToRgb(intro.fills![0]);
    const panel = await page.evaluate(
      ({ s, fill }) => {
        const cards = [...document.querySelectorAll(s)];
        if (cards.length === 0) return null;
        let e: HTMLElement | null = cards[0].parentElement;
        while (e && !(cards.every((c) => e!.contains(c)) && getComputedStyle(e).backgroundColor === fill)) e = e.parentElement;
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height, text: e.innerText };
      },
      { s: sel("feature-card"), fill: panelFill },
    );
    expect(panel, `소개 패널(바탕 ${intro.fills![0]}) — feature-card 를 모두 담음`).not.toBeNull();
    expect(Math.round(panel!.x), `소개 패널 x = 시안 폼 칸 폭 ${pane.width}`).toBe(pane.width);
    expect(Math.round(panel!.w), `소개 패널 폭 = 시안 ${intro.width}`).toBe(intro.width);
    expect(Math.round(panel!.y), "소개 패널은 web-header 바로 아래").toBe(Math.round(header.y + header.height));
    for (const t of [...frameTextsIn(frame, "intro-head")]) expect(norm(panel!.text), `소개 글 ${t}`).toContain(norm(t));
    const wantTitles = frameTextsIn(frame, "feature-card").filter((_, i, a) => frameOf(frame).nodes.some((n) => n.name === "feature-title" && n.text?.characters.trim() === a[i]));
    await expect(cards, `feature-card = 시안 ${wantTitles.length}`).toHaveCount(wantTitles.length);
    for (let i = 0; i < wantTitles.length; i++) await expect(cards.nth(i), `카드 ${i + 1} 제목`).toContainText(wantTitles[i]);
  });
}

// =====================================================================
// 14 번호 섹션
// =====================================================================

test(`[C3][S${SIGNUP}] 1440 번호 섹션 순서 = 시안 14-desktop ("1 학교 선택" → 시/도·지역·학교급·학교 → "2 계정" → 계정 입력 4 → 가입하기) · 390 = 시안 14-mobile 섹션 제목(번호 없음)`, async ({ page }) => {
  test.setTimeout(90_000);
  const vp = await openPre(page, SIGNUP);
  const frame = `${SIGNUP}-${vp}`;
  const nodes = frameOf(frame).nodes;
  const nums = nodes.filter((n) => n.name === "section-number" && n.text).map((n) => n.text!.characters.trim());
  const titles = nodes.filter((n) => n.name === "section-title" && n.text).map((n) => n.text!.characters.trim());
  expect(titles.length, `시안 ${frame} 섹션 제목`).toBe(2);
  if (vp === "desktop") expect(nums, "시안 번호").toEqual(["1", "2"]);
  else expect(nums, "시안 14-mobile 번호 없음").toEqual([]);
  const heads = page.locator(`${sel("ex-auth-form-card")} h2`);
  await expect(heads, "섹션 제목 2").toHaveCount(2);
  const shown = (await heads.allInnerTexts()).map((t) => t.replace(/\s+/g, ""));
  expect(shown, `섹션 제목 = 시안 ${frame}`).toEqual(titles.map((t, i) => `${nums[i] ?? ""}${t}`.replace(/\s+/g, "")));
  // 문서 순서: 제목 1 → 학교 선택 4단계 → 제목 2 → 계정 text-input → 가입 버튼
  const order = await page.evaluate(
    ({ levels, form }) => {
      const f = document.querySelector(form)!;
      const hs = [...f.querySelectorAll("h2")];
      const seq: Element[] = [hs[0], ...levels.map((l) => f.querySelector(`[data-component="${l}"]`)!), hs[1]];
      const inputs = [...f.querySelectorAll('[data-component="text-input"]')];
      const submit = f.querySelector('[data-component="button-primary"]')!;
      const before = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      const ok = seq.every((e, i) => e && (i === 0 || before(seq[i - 1], e)));
      return { ok, inputsAfter: inputs.length > 0 && inputs.every((i) => before(hs[1], i) && before(i, submit)), inputs: inputs.length, submit: (submit as HTMLElement).innerText.trim() };
    },
    { levels: rules.never.N1.school_select_levels, form: sel("ex-auth-form-card") },
  );
  expect(order.ok, "제목 1 → 시/도 → 지역 → 학교급 → 학교 → 제목 2").toBe(true);
  expect(order.inputsAfter, "계정 입력은 제목 2 뒤 · 가입 버튼 앞").toBe(true);
  expect(order.inputs, `계정 입력 = 시안 text-input ${frameNodes(frame, "text-input").length}`).toBe(frameNodes(frame, "text-input").length);
  const submitLabel = nodes.find((n) => n.type === "TEXT" && n.path.includes("section-account") && n.path.includes("button-primary"))?.text?.characters
    ?? nodes.find((n) => n.type === "TEXT" && n.path.includes("button-primary") && !n.path.includes(HEADER))?.text?.characters;
  expect(order.submit, "가입 버튼 = 시안").toBe(submitLabel);
});

// =====================================================================
// 15 긴 랜딩
// =====================================================================

/** 15 데스크톱: 동작 줄이기로 열어 모두 보이게 (구조 검사용) */
async function openLanding(page: Page, reduce = true): Promise<ViewportName> {
  if (reduce) await page.emulateMedia({ reducedMotion: "reduce" });
  const vp = await openPre(page, LANDING);
  await expect(page.locator(sel("landing-hero")).first()).toBeVisible({ timeout: 30_000 });
  return vp;
}

test(`[C3][S${LANDING}] desktop_required ${REQ15.join("·")} = 시안 15-desktop 개수 · 보임 / 390 = 0 (15-mobile 그대로) · 섹션 순서 = pre_login.landing_sections`, async ({ page }) => {
  test.setTimeout(90_000);
  const vp = await openLanding(page);
  if (vp === "mobile") {
    for (const n of REQ15) await expect(page.locator(sel(n)), `390 ${n} 0`).toHaveCount(0);
    const f = frameOf("15-mobile").nodes;
    for (const n of ["landing-hero", "landing-cta", "guest-entry", "feature-card"]) {
      await expect(page.locator(sel(n)), `390 ${n} = 시안 15-mobile`).toHaveCount(f.filter((x) => x.name === n).length);
    }
    return;
  }
  for (const n of REQ15) {
    const want = frameNodes("15-desktop", n).length;
    expect(want, `시안 15-desktop ${n}`).toBeGreaterThan(0);
    await expect(page.locator(sel(n)), `${n} = 시안 ${want}`).toHaveCount(want);
    for (let i = 0; i < want; i++) await expect(page.locator(sel(n)).nth(i), `${n}[${i}] 보임`).toBeVisible();
  }
  // 히어로 안: product-shot · landing-cta · guest-entry
  for (const n of ["product-shot", "landing-cta", "guest-entry"]) await expect(page.locator(`${sel("landing-hero")} ${sel(n)}`), `히어로 안 ${n}`).toHaveCount(1);
  // 순서: 히어로 → landing-tabs → 문제 공감 feature-card 3 → landing-section 4 → step-flow → 대상 탭(segmented-control) → 안심 → cta-band → web-footer
  expect(PRE.landing_sections, "rules 순서 문장").toMatch(/히어로.*landing-tabs.*feature-card 3.*landing-section 4.*step-flow.*segmented-control.*안심.*cta-band.*web-footer/);
  const seq = ["landing-hero", "landing-tabs", "feature-card", "landing-section", "step-flow", "segmented-control", "cta-band", "web-footer"];
  const order = await page.evaluate((names) => {
    const all = [...document.querySelectorAll("[data-component]")];
    return names.map((n) => all.findIndex((e) => e.getAttribute("data-component") === n));
  }, seq);
  for (let i = 0; i < seq.length; i++) expect(order[i], `${seq[i]} 있음`).toBeGreaterThanOrEqual(0);
  for (let i = 1; i < seq.length; i++) expect(order[i], `${seq[i - 1]} → ${seq[i]}`).toBeGreaterThan(order[i - 1]);
  // 문제 공감 feature-card 수 = 시안 (히어로 아래, landing-section 앞)
  await expect(page.locator(sel("feature-card")), "feature-card = 시안 15-desktop").toHaveCount(frameNodes("15-desktop", "feature-card").length);
  // 섹션 제목 = 시안 (문서 순서)
  const frameTitles = frameOf("15-desktop").nodes.filter((n) => n.type === "TEXT" && (n.name === "section-title" || n.name === "cta-title")).map((n) => norm(n.text!.characters));
  const shownTitles = (await page.locator("main h2").allInnerTexts()).map(norm);
  expect(shownTitles, "섹션 제목 = 시안 15-desktop (순서)").toEqual(frameTitles);
  // 히어로 제목 = 시안
  await expect(page.locator(`${sel("landing-hero")} h1`), "히어로 제목 = 시안").toHaveText(new RegExp(norm(frameTextsIn("15-desktop", "landing-hero").find((t) => t.includes("\n")) ?? "").replace(/\s/g, "\\s*")));
  // step-flow 5단계 글자 = 시안
  const steps = frameOf("15-desktop").nodes.filter((n) => n.name === "step-label").map((n) => n.text!.characters.trim());
  expect(steps.length, "시안 step-flow 단계").toBe(5);
  const stepText = norm(await page.locator(sel("step-flow")).innerText());
  let at = -1;
  for (const s of steps) {
    const i = stepText.indexOf(s, at + 1);
    expect(i, `step-flow "${s}" (순서)`).toBeGreaterThan(at);
    at = i;
  }
  // 대상 탭 = 시안 (교사·학생·관리자)
  const aud = frameOf("15-desktop").nodes.filter((n) => n.type === "TEXT" && n.path.includes("segmented-control")).map((n) => n.text!.characters.trim());
  const audShown = (await page.locator(`main ${sel("segmented-control")} [role="tab"]`).allInnerTexts()).map(norm);
  expect(audShown, "대상 탭 = 시안").toEqual(aud);
  // 안심 2×2: 시안 item-title 4 순서 그대로 (운영 숫자 없음)
  const trust = frameOf("15-desktop").nodes.filter((n) => n.name === "item-title").map((n) => n.text!.characters.trim());
  expect(trust.length).toBe(4);
  const body = norm(await page.locator("main").innerText());
  let p = -1;
  for (const t of trust) {
    const i = body.indexOf(t, p + 1);
    expect(i, `안심 "${t}" (순서)`).toBeGreaterThan(p);
    p = i;
  }
});

test(`[C3][S${LANDING}] 1440 띠 배경 순서 = 시안 15-desktop (rules landing_rhythm: 흰↔회 번갈아, step-flow·cta-band 검정) · 히어로 아래 전폭`, async ({ page }) => {
  test.setTimeout(90_000);
  const vp = await openLanding(page);
  if (vp === "mobile") {
    // 390 = 15-mobile 그대로 (띠 없음)
    for (const n of ["landing-section", "step-flow", "cta-band", "landing-tabs"]) await expect(page.locator(sel(n)), `390 ${n} 0`).toHaveCount(0);
    return;
  }
  const want = frameBandFills();
  const bandHex = hexesIn(R.landing_rhythm.bands); // [흰, 회, 검정]
  const dark = bandHex[2];
  const shown = await page.evaluate(({ tabs }) => {
    const t = document.querySelector(tabs)!;
    const out: { bg: string; w: number; comp: string | null; hasStep: boolean }[] = [];
    let e = t.nextElementSibling;
    while (e) {
      const r = e.getBoundingClientRect();
      if (r.height > 0) out.push({ bg: getComputedStyle(e).backgroundColor, w: Math.round(r.width), comp: e.getAttribute("data-component"), hasStep: !!e.querySelector('[data-component="step-flow"]') || e.getAttribute("data-component") === "step-flow" });
      e = e.nextElementSibling;
    }
    return out;
  }, { tabs: sel("landing-tabs") });
  expect(shown.map((s) => s.bg), "띠 바탕 순서 = 시안").toEqual(want.map(hexToRgb));
  for (const s of shown) expect(s.w, "띠 전폭").toBe(VIEW_W);
  const darkIdx = shown.map((s, i) => (s.bg === hexToRgb(dark) ? i : -1)).filter((i) => i >= 0);
  expect(darkIdx.length, "검정 띠 2 (step-flow · cta-band)").toBe(2);
  expect(shown[darkIdx[0]].hasStep, "첫 검정 띠 = step-flow").toBe(true);
  expect(shown[darkIdx[1]].comp, "둘째 검정 띠 = cta-band").toBe("cta-band");
  // 검정이 아닌 띠는 흰·회 번갈아
  const light = shown.filter((s) => s.bg !== hexToRgb(dark)).map((s) => s.bg);
  for (const b of light) expect([hexToRgb(bandHex[0]), hexToRgb(bandHex[1])], "흰·회").toContain(b);
});

test(`[C3][S${LANDING}] 1440 검정 띠 반전 버튼(rules landing_rhythm.inverted_button) · cta-band 글자·링크 = 시안 · 밝은 띠 button-primary = 검정 채움`, async ({ page }) => {
  test.setTimeout(90_000);
  const vp = await openLanding(page);
  if (vp === "mobile") {
    // 390 = 15-mobile 그대로: cta-band 0, landing-cta button-primary = 검정 채움 (반전 없음)
    await expect(page.locator(sel("cta-band")), "390 cta-band 0").toHaveCount(0);
    const bg = await page.locator(`${sel("landing-cta")} ${sel("button-primary")}`).first().evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(bg, "390 landing-cta button-primary = 검정").toBe(hexToRgb(hexesIn(R.landing_rhythm.bands)[2]));
    return;
  }
  // "#141414 띠 안에서만 button-primary = #ffffff 채움 + #141414 라벨, button-outline = #ffffff 테두리·라벨"
  const inv = R.landing_rhythm.inverted_button;
  const dark = (/^(#[0-9a-fA-F]{6})\s*띠/.exec(inv)?.[1] ?? "").toLowerCase();
  const white = (/(#[0-9a-fA-F]{6})\s*채움/.exec(inv)?.[1] ?? "").toLowerCase();
  const label = (/(#[0-9a-fA-F]{6})\s*라벨/.exec(inv)?.[1] ?? "").toLowerCase();
  const outline = (/button-outline\s*=\s*(#[0-9a-fA-F]{6})/.exec(inv)?.[1] ?? "").toLowerCase();
  expect([dark, white, label, outline].every((h) => /^#[0-9a-f]{6}$/.test(h)), `inverted_button 색 읽음: ${inv}`).toBe(true);
  expect(hexesIn(R.landing_rhythm.bands), "반전 띠 색 = landing_rhythm 검정").toContain(dark);
  const band = page.locator(sel("cta-band"));
  const prim = band.locator(sel("button-primary"));
  const out = band.locator(sel("button-outline"));
  await expect(prim).toHaveCount(1);
  await expect(out).toHaveCount(1);
  const ps = await prim.evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, color: getComputedStyle(e).color }));
  expect(ps.bg, "검정 띠 button-primary = 흰 채움").toBe(hexToRgb(white));
  expect(ps.color, "검정 띠 button-primary 라벨").toBe(hexToRgb(label));
  const os = await out.evaluate((e) => ({ border: getComputedStyle(e).borderTopColor, bw: getComputedStyle(e).borderTopWidth, color: getComputedStyle(e).color, bg: getComputedStyle(e).backgroundColor }));
  expect(os.border, "검정 띠 button-outline 테두리").toBe(hexToRgb(outline));
  expect(parseFloat(os.bw), "테두리 있음").toBeGreaterThan(0);
  expect(os.color, "검정 띠 button-outline 라벨").toBe(hexToRgb(outline));
  expect(await band.evaluate((e) => getComputedStyle(e).backgroundColor), "cta-band 바탕 = 반전 띠 색").toBe(hexToRgb(dark));
  // 글자·링크 = 시안 cta-band
  const ft = frameTextsIn("15-desktop", "cta-band");
  for (const t of ft) await expect(band, `cta-band "${t}"`).toContainText(t);
  const labels = [norm(await prim.innerText()), norm(await out.innerText())];
  expect(labels, "cta 버튼 글자 = 시안").toEqual(frameTextsIn("15-desktop", "cta-actions"));
  expect(new URL((await prim.getAttribute("href"))!, "http://x").pathname, "회원가입 → routes[14]").toBe(routeOf(SIGNUP));
  expect(new URL((await out.getAttribute("href"))!, "http://x").pathname, "둘러보기 → routes[13-guest]").toBe(guestRouteOf(13));
  // 밝은 곳 button-primary (히어로·헤더) = 검정 채움 (반전은 검정 띠 안에서만)
  for (const where of [sel("landing-hero"), sel(HEADER)]) {
    const bg = await page.locator(`${where} ${sel("button-primary")}`).first().evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(bg, `${where} button-primary = 검정`).toBe(hexToRgb(dark));
  }
});

test(`[C3][S${LANDING}] 1440 web-footer 한 줄 = rules footer.text · 링크 0 · 위 hairline · 글자색·크기 = 시안 · 가운데`, async ({ page }) => {
  test.setTimeout(90_000);
  const vp = await openLanding(page);
  if (vp === "mobile") {
    // 390 = 15-mobile 그대로 (footer 없음 — 시안 15-mobile)
    for (const n of ["web-footer"]) await expect(page.locator(sel(n)), `390 ${n} 0`).toHaveCount(0);
    return;
  }
  const foot = page.locator(sel("web-footer"));
  await expect(foot).toHaveCount(1);
  expect(norm(await foot.innerText()), "footer 글자 = rules footer.text").toBe(R.footer.text);
  await expect(foot.locator("a"), "열·약관 링크 없음").toHaveCount(0);
  const ff = frameNodes("15-desktop", "web-footer")[0];
  const fc = frameNodes("15-desktop", "copyright")[0];
  const cs = await foot.evaluate((el) => {
    const s = getComputedStyle(el);
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let t: Text | null = null;
    for (let n = w.nextNode(); n; n = w.nextNode()) if ((n.textContent ?? "").trim()) { t = n as Text; break; }
    const p = t!.parentElement!;
    const range = document.createRange();
    range.selectNodeContents(t!);
    const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
    const rr = range.getBoundingClientRect();
    return { bt: s.borderTopColor, btw: s.borderTopWidth, shadow: s.boxShadow, color: getComputedStyle(p).color, size: getComputedStyle(p).fontSize, lines, cx: rr.x + rr.width / 2, w: el.getBoundingClientRect().width };
  });
  expect(cs.lines, "한 줄").toBe(1);
  expect(Math.round(cs.w), "전폭").toBe(VIEW_W);
  expect(Math.abs(cs.cx - VIEW_W / 2), "가운데").toBeLessThanOrEqual(2);
  const line = hexToRgb(ff.strokes![0]);
  expect(cs.bt === line && parseFloat(cs.btw) > 0 ? true : cs.shadow.includes(line), `위 hairline = 시안 ${ff.strokes![0]}`).toBe(true);
  expect(cs.color, `글자색 = 시안 ${fc.fills![0]}`).toBe(hexToRgb(fc.fills![0]));
  expect(cs.size, `글자 크기 = 시안 ${fc.text!.fontSize}`).toBe(`${fc.text!.fontSize}px`);
});

const DISPLAY_PATHS = [routeOf(LANDING), routeOf(LOGIN), routeOf(SIGNUP), guestRouteOf(13), guestRouteOf(2)];
test(`[C3][S*] 큰 글자 ${DISPLAY.sizes.join("·")} 은 ${DISPLAY.only_within.join("·")} 안에서만 (typography.display_sizes) — ${DISPLAY_PATHS.join(" · ")} · 15-desktop 히어로·섹션·cta 제목 크기 = 시안`, async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const path of DISPLAY_PATHS) {
    await page.goto(path);
    await page.waitForLoadState("load");
    await waitWidthSettled(page);
    const bad = await page.evaluate(
      ({ sizes, within }) =>
        [...document.querySelectorAll("body *")]
          .filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim()))
          .filter((e) => sizes.includes(Math.round(parseFloat(getComputedStyle(e).fontSize))))
          .filter((e) => !within.some((c) => e.closest(`[data-component="${c}"]`)))
          .map((e) => `${e.tagName} ${getComputedStyle(e).fontSize} "${(e.textContent ?? "").trim().slice(0, 30)}"`),
      { sizes: DISPLAY.sizes, within: DISPLAY.only_within },
    );
    expect(bad, `${path}: 허용 컴포넌트 밖 큰 글자`).toEqual([]);
  }
  if (vpOf(page) === "desktop") {
    await page.goto(routeOf(LANDING));
    await page.waitForLoadState("load");
    const fNodes = frameOf("15-desktop").nodes.filter((n) => n.type === "TEXT" && DISPLAY.sizes.includes(Number(n.text?.fontSize)));
    const shown = await page.evaluate(
      ({ sizes }) =>
        [...document.querySelectorAll("main h1, main h2")]
          .filter((e) => sizes.includes(Math.round(parseFloat(getComputedStyle(e).fontSize))))
          .map((e) => ({ t: (e as HTMLElement).innerText.replace(/\s+/g, ""), s: Math.round(parseFloat(getComputedStyle(e).fontSize)) })),
      { sizes: DISPLAY.sizes },
    );
    expect(shown, "큰 제목 = 시안 15-desktop (글자·크기)").toEqual(fNodes.map((n) => ({ t: n.text!.characters.replace(/\s+/g, ""), s: Number(n.text!.fontSize) })));
  }
});

test(`[C3][S${LANDING}] 1440 landing-tabs: 탭 글자 = 시안 · web-header 아래 고정(스크롤해도 y = 헤더 높이) · 보이는 섹션 탭만 하늘색 밑줄(시안 tab-underline) · 탭 누르면 그 섹션으로`, async ({ page }) => {
  test.setTimeout(120_000);
  const vp = await openLanding(page, false);
  if (vp === "mobile") {
    // 390 = 15-mobile 그대로 (탭 없음 — 시안 15-mobile)
    for (const n of ["landing-tabs"]) await expect(page.locator(sel(n)), `390 ${n} 0`).toHaveCount(0);
    return;
  }
  const tabs = page.locator(sel("landing-tabs"));
  const links = tabs.locator("a[href]");
  const labels = frameOf("15-desktop").nodes.filter((n) => n.type === "TEXT" && n.path.includes("landing-tabs")).map((n) => n.text!.characters.trim());
  expect((await links.allInnerTexts()).map(norm), "탭 글자 = 시안").toEqual(labels);
  const underline = frameOf("15-desktop").nodes.find((n) => n.name === "tab-underline")!.fills![0];
  const sky = hexToRgb(underline);
  expect(R.colors.highlight as unknown as { values: string[] }, "밑줄 = rules highlight 하늘색").toBeTruthy();
  expect((R.colors.highlight as unknown as { values: string[] }).values.map((v) => v.toLowerCase())).toContain(underline.toLowerCase());
  const hdr = page.locator(sel(HEADER));
  const hh = (await box(hdr, HEADER)).height;
  /** 탭마다 하늘색 밑줄 여부 (border-bottom · ::after · ::before · box-shadow · 자식 막대) */
  const skyTabs = () =>
    links.evaluateAll(
      (els, c) =>
        els.map((el) => {
          const has = (e: Element, pseudo?: string) => {
            const s = getComputedStyle(e, pseudo);
            if (pseudo && (s.content === "none" || s.content === "normal")) return false;
            return (
              (s.borderBottomColor === c && parseFloat(s.borderBottomWidth) > 0) ||
              s.backgroundColor === c ||
              s.boxShadow.includes(c) ||
              s.textDecorationColor === c && s.textDecorationLine.includes("underline")
            );
          };
          const host = el.closest("li") ?? el;
          return [el, host, ...el.querySelectorAll("*")].some((e) => has(e) || has(e, "::after") || has(e, "::before"));
        }),
      sky,
    );
  // 시안 첫 탭 활성 (시안 = 맨 위 상태) — 맨 위에서 활성 탭 1
  await expect(tabs.locator('[aria-current="true"], [aria-current="page"], [aria-current="location"]'), "활성 탭 1").toHaveCount(1);
  const sections = await links.evaluateAll((els) => els.map((e) => (e.getAttribute("href") ?? "").replace(/^.*#/, "")));
  for (const id of sections) await expect(page.locator(`[id="${id}"]`), `탭 대상 섹션 #${id}`).toHaveCount(1);
  for (let i = 0; i < sections.length; i++) {
    // 그 섹션이 헤더 + 탭 바로 아래에 오도록 스크롤
    await page.evaluate(
      ({ id, off }) => {
        const el = document.getElementById(id)!;
        window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - off + 8);
      },
      { id: sections[i], off: hh + (await tabs.boundingBox())!.height },
    );
    await expect
      .poll(async () => (await skyTabs()).map((v, k) => (v ? k : -1)).filter((k) => k >= 0), { message: `${labels[i]} 섹션이 보이면 그 탭만 밑줄`, timeout: 10_000 })
      .toEqual([i]);
    await expect(links.nth(i), `${labels[i]} aria-current`).toHaveAttribute("aria-current", /true|page|location/);
    const tb = (await tabs.boundingBox())!;
    const hb = (await hdr.boundingBox())!;
    expect(Math.round(hb.y), "web-header 위에 고정").toBe(0);
    expect(Math.round(tb.y), "landing-tabs = web-header 바로 아래 고정").toBe(Math.round(hh));
  }
  // 탭 누르면 그 섹션이 보이고 그 탭 활성
  await page.evaluate(() => window.scrollTo(0, 0));
  await links.nth(1).click();
  await expect.poll(async () => (await skyTabs()).map((v, k) => (v ? k : -1)).filter((k) => k >= 0), { message: "탭 누름 → 그 탭 밑줄", timeout: 10_000 }).toEqual([1]);
  const sec = page.locator(`[id="${sections[1]}"]`);
  await expect.poll(async () => Math.round((await sec.boundingBox())!.y), { message: "누른 탭의 섹션이 탭 아래로", timeout: 10_000 }).toBeLessThanOrEqual(Math.round(hh + (await tabs.boundingBox())!.height) + 2);
});

const MOTION = R.landing_rhythm.motion;
const REVEAL_PX = Number(/(\d+)\s*px/.exec(MOTION)?.[1]);
const REVEAL_S = Number(/([\d.]+)\s*초/.exec(MOTION)?.[1]);

test(`[C3][S${LANDING}] 1440 떠오름 (landing_rhythm.motion): 화면 밖 섹션 제목·카드 = ${REVEAL_PX}px 아래·투명 → 들어오면 ${REVEAL_S}초 동안 떠오름 · 한 번만(다시 올라가도 그대로) · 서버 HTML·JS 없이도 모두 보임`, async ({ page, browser }, info) => {
  test.setTimeout(120_000);
  expect(REVEAL_PX, "rules 거리").toBeGreaterThan(0);
  expect(REVEAL_S, "rules 시간").toBeGreaterThan(0);
  const vp = await openLanding(page, false);
  if (vp === "mobile") {
    // 390 = 15-mobile 그대로: 숨겨진 떠오름 대상 없음 (끝까지 스크롤한 뒤에도 모두 보임)
    await scrollThrough(page);
    const hidden = await page.locator("main [data-reveal]").evaluateAll((els) => els.filter((e) => Number(getComputedStyle(e).opacity) < 1).length);
    expect(hidden, "390 투명한 떠오름 대상 0").toBe(0);
    for (const n of ["landing-hero", "landing-cta", "guest-entry"]) await expect(page.locator(sel(n)).first(), `390 ${n} 보임`).toBeVisible();
    return;
  }
  const reveal = page.locator("main [data-reveal]");
  expect(await reveal.count(), "떠오르는 요소").toBeGreaterThan(0);
  // 화면 밖(아래) 대상: 안심 섹션 제목 — 시안 마지막 섹션 제목 근처
  const target = page.locator("main h2", { hasText: frameOf("15-desktop").nodes.find((n) => n.name === "section-title" && n.path.includes("trust-section"))!.text!.characters });
  const host = target.locator("xpath=ancestor-or-self::*[@data-reveal][1]");
  await expect(host, "안심 제목은 떠오름 대상").toHaveCount(1);
  const st = () => host.evaluate((e) => { const s = getComputedStyle(e); return { o: Number(s.opacity), t: s.transform, d: s.transitionDuration, p: s.transitionProperty, top: e.getBoundingClientRect().top }; });
  // JS 가 동작을 켠 뒤(서버 HTML 은 보임) 화면 밖 대상이 숨김 상태로 자리 잡을 때까지
  await expect.poll(async () => (await st()).o, { message: "들어오기 전 투명 (JS 가 켠 뒤)", timeout: 5_000 }).toBe(0);
  const before = await st();
  expect(before.top, "대상은 화면 아래").toBeGreaterThan(page.viewportSize()!.height);
  expect(before.o, "들어오기 전 투명").toBe(0);
  expect(before.t, `들어오기 전 ${REVEAL_PX}px 아래`).toMatch(new RegExp(`^matrix\\(1, 0, 0, 1, 0, ${REVEAL_PX}\\)$`));
  expect(before.d.split(",").map((x) => parseFloat(x)), `전환 ${REVEAL_S}s`).toContain(REVEAL_S);
  expect(before.p, "opacity · transform 전환").toMatch(/opacity|all/);
  await host.scrollIntoViewIfNeeded();
  await expect.poll(async () => (await st()).o, { message: "들어오면 보임", timeout: 5_000 }).toBe(1);
  await expect.poll(async () => (await st()).t, { message: "들어오면 제자리", timeout: 5_000 }).toBe("none");
  // 한 번만: 맨 위로 올라가 화면 밖이 돼도 다시 숨지 않는다
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(Math.ceil(REVEAL_S * 1000) + 300);
  const back = await st();
  expect(back.o, "다시 화면 밖 → 그대로 보임 (한 번)").toBe(1);
  expect(back.t).toBe("none");
  // 서버 HTML: 숨김 표시 없음 (JS 가 붙인 뒤에만 숨김)
  const html = await (await page.request.get(routeOf(LANDING))).text();
  expect(html.includes("data-reveal"), "서버 HTML 에 떠오름 대상").toBe(true);
  expect(html.includes('data-motion="on"'), "서버 HTML 은 동작 켜짐 표시 없음 (모두 보임)").toBe(false);
  // JS 없이: 모든 떠오름 대상 보임
  const ctx = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: page.viewportSize()!, javaScriptEnabled: false });
  try {
    const p2 = await ctx.newPage();
    await p2.goto(routeOf(LANDING));
    await p2.waitForLoadState("load");
    const hidden = await p2.locator("main [data-reveal]").evaluateAll((els) => els.filter((e) => Number(getComputedStyle(e).opacity) < 1).length);
    expect(await p2.locator("main [data-reveal]").count(), "JS 없이 대상").toBeGreaterThan(0);
    expect(hidden, "JS 없이 투명한 대상 0").toBe(0);
  } finally {
    await ctx.close();
  }
});

test(`[C3][S${LANDING}] 1440 동작 줄이기(prefers-reduced-motion): 떠오름 끔 — 모든 대상 처음부터 보임·제자리·전환 없음 · 스크롤해도 그대로`, async ({ page }) => {
  test.setTimeout(90_000);
  const vp = await openLanding(page, true);
  if (vp === "mobile") {
    // 390 = 15-mobile 그대로: 숨겨진 떠오름 대상 없음 (끝까지 스크롤한 뒤에도 모두 보임)
    await scrollThrough(page);
    const hidden = await page.locator("main [data-reveal]").evaluateAll((els) => els.filter((e) => Number(getComputedStyle(e).opacity) < 1).length);
    expect(hidden, "390 투명한 떠오름 대상 0").toBe(0);
    for (const n of ["landing-hero", "landing-cta", "guest-entry"]) await expect(page.locator(sel(n)).first(), `390 ${n} 보임`).toBeVisible();
    return;
  }
  const all = page.locator("main [data-reveal]");
  expect(await all.count()).toBeGreaterThan(0);
  const read = () =>
    all.evaluateAll((els) =>
      els.map((e) => {
        const s = getComputedStyle(e);
        return { o: Number(s.opacity), t: s.transform, d: s.transitionDuration.split(",").map((x) => parseFloat(x)) };
      }),
    );
  for (const s of await read()) {
    expect(s.o, "보임").toBe(1);
    expect(s.t, "제자리").toBe("none");
    expect(Math.max(...s.d), "전환 없음").toBe(0);
  }
  await scrollThrough(page);
  for (const s of await read()) expect(s.o, "스크롤 뒤에도 보임").toBe(1);
});

// =====================================================================
// 둘러보기 데스크톱 (13g · 2g · 3g · 16g)
// =====================================================================

const sidebar = (page: Page) => page.locator(sel(DESKTOP_SHELL.component));

async function guestPaths(): Promise<Record<number, string>> {
  const demo = (await demoReagents())[0];
  return {
    13: guestRouteOf(13),
    2: guestRouteOf(2),
    3: guestDetailPath(demo.id),
    16: guestRouteOf(16).replace(/\[[^\]]+\]/, demo.id),
  };
}

for (const g of GUEST.screens) {
  test(`[C3][S${g}g] 둘러보기 1440: ${DESKTOP_SHELL.component} 1(폭 ${SIDEBAR_W}·radius 0·위 "${GUEST.school_name}") · ${DESKTOP_SHELL.item} = 시안 ${g}-guest-desktop(글자·순서·활성) · 잠금 ${SIDEBAR_LOCKS}(기록·QR 찾기 = 버튼) · 아래 "둘러보는 중" + 로그인 · 본문 위 ${GUEST.banner} · nav-pill·tab-bar·계정 메뉴 0 · 구조 컴포넌트 = 시안 / 390 = 사이드바·표·드로어 0 · nav-pill·tab-bar 1`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const path = (await guestPaths())[g];
    const { context, page, viewport, response } = await openGuest(browser, info, path);
    const writes = watchWrites(page);
    try {
      expect(response?.status(), `${path} 응답`).toBe(200);
      await expect(page.locator(sel(GUEST.banner)).first()).toBeVisible({ timeout: 30_000 });
      await waitWidthSettled(page);
      if (viewport === "mobile") {
        for (const n of [DESKTOP_SHELL.component, DESKTOP_SHELL.item, TABLE, DRAWER, HEADER]) await expect(page.locator(sel(n)), `390 ${n} 0`).toHaveCount(0);
        await expect(page.locator(sel("nav-pill")), "390 nav-pill 1").toHaveCount(1);
        await expect(page.locator(sel(rules.tab_bar.component)), "390 tab-bar 1").toHaveCount(1);
        return;
      }
      const frame = `${g}-guest-desktop`;
      const sb = sidebar(page);
      await expect(sb, `${DESKTOP_SHELL.component} 1`).toHaveCount(1);
      const b = await box(sb, DESKTOP_SHELL.component);
      expect(Math.round(b.width), `폭 ${SIDEBAR_W}`).toBe(SIDEBAR_W);
      expect(Math.round(b.x)).toBe(0);
      expect(await sb.evaluate((e) => getComputedStyle(e).borderTopRightRadius), "radius 0").toBe("0px");
      // 위: Lab_Stock + 데모 학교
      const brand = frameTextsIn(frame, "sidebar-brand");
      expect(brand, "시안 sidebar-brand").toEqual(["Lab_Stock", GUEST.school_name]);
      const sbText = norm(await sb.innerText());
      expect(sbText.startsWith(`${brand[0]} ${brand[1]}`), `사이드바 위 = ${brand.join(" · ")}`).toBe(true);
      await expect(sb.getByText(GUEST.school_name, { exact: true }), "학교명 1").toHaveCount(1);
      // 메뉴 = 시안 (글자·순서·활성)
      const want = frameSidebarItems(frame);
      const items = sb.locator(sel(DESKTOP_SHELL.item));
      await expect(items, `${DESKTOP_SHELL.item} = 시안 ${want.length}`).toHaveCount(want.length);
      expect((await items.allInnerTexts()).map(norm), "메뉴 글자 순서 = 시안").toEqual(want.map((w) => w.label));
      const activeWant = want.filter((w) => w.active).map((w) => w.label);
      expect(activeWant.length, `시안 ${frame} 활성 1`).toBe(1);
      const active = sb.locator(`${sel(DESKTOP_SHELL.item)}[aria-current="page"]`);
      await expect(active, "활성 1").toHaveCount(1);
      await expect(active, `활성 = 시안 "${activeWant[0]}"`).toHaveText(new RegExp(`^\\s*${activeWant[0]}\\s*$`));
      // 관리 메뉴(교사·admin) 숨김
      for (const l of [...DESKTOP_SHELL.menu.teacher_admin, ...DESKTOP_SHELL.menu.admin]) await expect(sb.getByText(l, { exact: true }), `관리 메뉴 "${l}" 숨김`).toHaveCount(0);
      // 잠금: 시안에서 guest-lock 을 품은 메뉴 = 잠긴 메뉴 (버튼, 링크 아님)
      const frameNodesAll = frameOf(frame).nodes;
      const lockedLabels: string[] = [];
      frameNodesAll.forEach((n, i) => {
        if (n.name !== DESKTOP_SHELL.item) return;
        const end = frameNodesAll.findIndex((x, j) => j > i && x.name === DESKTOP_SHELL.item);
        const inner = frameNodesAll.slice(i + 1, end < 0 ? undefined : end).filter((x) => x.path.includes(DESKTOP_SHELL.item));
        if (inner.some((x) => x.name === GUEST.lock)) lockedLabels.push(inner.find((x) => x.type === "TEXT")!.text!.characters);
      });
      expect(lockedLabels.length, `시안 잠긴 메뉴 = sidebar_locks ${SIDEBAR_LOCKS}`).toBe(SIDEBAR_LOCKS);
      await expect(sb.locator(sel(GUEST.lock)), `사이드바 잠금 ${SIDEBAR_LOCKS}`).toHaveCount(SIDEBAR_LOCKS);
      for (const l of lockedLabels) {
        const it = items.filter({ hasText: l });
        await expect(it.locator(sel(GUEST.lock)), `${l} 잠금`).toHaveCount(1);
        expect(await it.evaluate((e) => e.tagName), `${l} = 버튼`).toBe("BUTTON");
        expect(await it.getAttribute("href"), `${l} 링크 아님`).toBeNull();
      }
      // 잠기지 않은 메뉴 = 둘러보기 경로 링크
      const guestPrefixes = devRules.guest_screens.map((s) => guestRouteOf(s).replace(/\/\[[^\]]+\].*$/, ""));
      for (const w of want.filter((x) => !lockedLabels.includes(x.label))) {
        const href = await items.filter({ hasText: w.label }).getAttribute("href");
        expect(href, `${w.label} 링크`).not.toBeNull();
        expect(guestPrefixes, `${w.label} → 둘러보기 경로`).toContain(new URL(href!, "http://x").pathname);
      }
      // 아래: "둘러보는 중" + 로그인 (시안 sidebar-account)
      const acc = frameTextsIn(frame, "sidebar-account");
      expect(acc, "시안 sidebar-account").toEqual(["둘러보는 중", "로그인"]);
      await expect(sb.getByText(acc[0], { exact: true }), `"${acc[0]}"`).toHaveCount(1);
      const login = sb.locator(`a${sel("button-outline")}`, { hasText: acc[1] });
      await expect(login, "로그인 button-outline 1").toHaveCount(1);
      expect(new URL((await login.getAttribute("href"))!, "http://x").pathname, "로그인 → routes[1]").toBe(routeOf(LOGIN));
      const lb = await box(login, "로그인");
      const ib = await box(items.last(), "마지막 메뉴");
      expect(lb.y, "로그인은 메뉴 아래").toBeGreaterThan(ib.y + ib.height);
      // 본문 위 guest-banner (사이드바 오른쪽, 본문 맨 위)
      const banner = page.locator(sel(GUEST.banner));
      await expect(banner, `${GUEST.banner} 1`).toHaveCount(1);
      const bb = await box(banner, GUEST.banner);
      expect(Math.round(bb.x), "배너는 사이드바 오른쪽").toBeGreaterThanOrEqual(SIDEBAR_W);
      const firstContent = await page.evaluate((s) => {
        const ys = [...document.querySelectorAll(s)].map((e) => e.getBoundingClientRect().top);
        return ys.length ? Math.min(...ys) : null;
      }, `main ${sel(TABLE)}, main ${sel("home-summary")}, main h1`);
      if (firstContent !== null) expect(bb.y, "배너는 본문 위").toBeLessThan(firstContent);
      await expect(banner, "배너 문구 = 시안").toContainText(frameTextsIn(frame, "guest-banner")[0]);
      // 셸 이외 0
      for (const n of ["nav-pill", rules.tab_bar.component, rules.tab_bar.item, "nav-account-menu", HEADER]) await expect(page.locator(sel(n)), `1440 ${n} 0`).toHaveCount(0);
      for (const n of GUEST.hidden_components) await expect(page.locator(sel(n)), `hidden ${n} 0`).toHaveCount(0);
      // 구조 컴포넌트 = 시안 (데이터와 무관한 것)
      const structural = [DESKTOP_SHELL.component, DESKTOP_SHELL.item, GUEST.lock, GUEST.banner, TABLE, DRAWER, "home-summary", "quick-action", "list-filter-button", "text-input", "msds-entry", "msds-qr-tile", "reagent-location", "reorder-threshold", "msds-original-link"];
      for (const n of structural) {
        const fc = frameNodes(frame, n).length;
        await expect(page.locator(sel(n)), `${n} = 시안 ${frame} ${fc}`).toHaveCount(fc);
      }
      if (frameNodes(frame, DRAWER).length > 0) {
        const d = await waitDrawer(page);
        expect(Math.round((await d.boundingBox())!.width), `드로어 폭 ${DRAWER_W}`).toBe(DRAWER_W);
      }
      expect(writes(), "쓰기 요청 0").toEqual([]);
    } finally {
      await context.close();
    }
  });
}

test(`[C3][S2g] 둘러보기 1440 표 → 드로어 읽기 전용: 행 누름 → ${guestRouteOf(3)} 주소 + 드로어(제목 = 시약명) · 새로고침 유지 · Esc → 목록 주소 · MSDS 보기 → ${guestRouteOf(16)} 드로어 "‹ 시약 상세" → 3g · × → 목록 · 쓰기 요청 0 · hidden_components 0`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const list = guestRouteOf(2);
  const { context, page, viewport } = await openGuest(browser, info, list);
  const writes = watchWrites(page);
  if (viewport === "mobile") {
    // 390 = 변경 없음: 목록 reagent-row · 표·드로어·사이드바 0, 행 → 전용 상세 화면(reagent-detail-card)
    try {
      await expect(page.locator(sel("reagent-row")).first(), "390 reagent-row").toBeVisible({ timeout: 30_000 });
      await waitWidthSettled(page);
      for (const n of [TABLE, DRAWER, DESKTOP_SHELL.component]) await expect(page.locator(sel(n)), `390 ${n} 0`).toHaveCount(0);
      const href = new URL((await page.locator(sel("reagent-row")).first().getAttribute("href"))!, "http://x").pathname;
      await page.goto(href);
      await expect(page.locator(sel("reagent-detail-card")).first(), "390 상세 = 전용 화면").toBeVisible({ timeout: 30_000 });
      await waitWidthSettled(page);
      await expect(page.locator(sel(DRAWER)), "390 드로어 0").toHaveCount(0);
      expect(writes(), "쓰기 요청 0").toEqual([]);
    } finally {
      await context.close();
    }
    return;
  }
  const hidden = async (where: string) => {
    for (const n of GUEST.hidden_components) expect(await page.locator(sel(n)).count(), `${where}: ${n} 0`).toBe(0);
  };
  try {
    await expect(page.locator(`main ${sel(TABLE)}`)).toBeVisible({ timeout: 30_000 });
    await waitWidthSettled(page);
    const row = page.locator(`main ${sel(TABLE)} tbody tr`).first();
    const link = row.locator("a[href]").first();
    const name = norm(await link.innerText());
    const href = new URL((await link.getAttribute("href"))!, "http://x").pathname;
    expect(href, "행 링크 = 둘러보기 상세 경로").toMatch(new RegExp(`^${guestRouteOf(3).replace(/\[[^\]]+\]/, "[^/]+")}$`));
    await link.click();
    await page.waitForURL((u) => u.pathname === href, { timeout: 30_000 });
    await waitDrawer(page);
    expect(norm(await drawerTitle(page).innerText()), "드로어 제목 = 행 시약명").toBe(name);
    await expect(page.locator(`main ${sel(TABLE)}`), "드로어 뒤 목록 그대로").toBeVisible();
    await hidden("3g 드로어");
    await page.reload();
    await waitDrawer(page);
    expect(new URL(page.url()).pathname, "새로고침 → 같은 주소").toBe(href);
    expect(norm(await drawerTitle(page).innerText()), "새로고침 → 같은 드로어").toBe(name);
    await page.keyboard.press("Escape");
    await page.waitForURL((u) => u.pathname === list, { timeout: 15_000 });
    await expect(drawer(page), "Esc → 드로어 닫힘").toHaveCount(0);
    // 다시 열어 MSDS 보기 → 16g 드로어
    await page.goto(href);
    await waitDrawer(page);
    const msds = drawer(page).locator(`${sel("msds-entry")} a[href]`).filter({ hasText: "MSDS 보기" });
    await expect(msds, "MSDS 보기 1").toHaveCount(1);
    const msdsHref = new URL((await msds.getAttribute("href"))!, "http://x").pathname;
    expect(msdsHref).toMatch(new RegExp(`^${guestRouteOf(16).replace(/\[[^\]]+\]/, "[^/]+")}$`));
    await msds.click();
    await page.waitForURL((u) => u.pathname === msdsHref, { timeout: 30_000 });
    await waitDrawer(page);
    await hidden("16g 드로어");
    const back = drawer(page).locator('[data-name="back-link"]');
    const backLabel = frameTextsIn("16-guest-desktop", "back-link")[0];
    await expect(back, `뒤로 = 시안 "${backLabel}"`).toHaveText(new RegExp(`^\\s*${backLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`));
    await back.click();
    await page.waitForURL((u) => u.pathname === href, { timeout: 30_000 });
    await waitDrawer(page);
    await drawerClose(page).click();
    await page.waitForURL((u) => u.pathname === list, { timeout: 15_000 });
    await expect(drawer(page), "× → 드로어 닫힘").toHaveCount(0);
    expect(writes(), "쓰기 요청 0").toEqual([]);
  } finally {
    await context.close();
  }
});

// =====================================================================
// 새 프레임 대조 — 둘러보기 390 ({g}-guest-mobile, desktop_migrated_screens 에 든 화면 = 새 프레임)
// =====================================================================

/** 데이터 수와 무관한 구조 컴포넌트 (390 둘러보기) — 행·배지·칸 번호처럼 데이터에 따라 달라지는 것은 뺀다 */
const MOBILE_STRUCTURAL = [
  "nav-pill",
  rules.tab_bar.component,
  rules.tab_bar.item,
  GUEST.banner,
  "quick-action",
  "home-summary",
  "reagent-detail-card",
  "reagent-location",
  "reorder-threshold",
  "msds-entry",
  "msds-qr-tile",
  "segmented-control",
  "list-filter-button",
  "text-input",
  "msds-original-link",
];

for (const g of GUEST.screens) {
  test(`[C3][S${g}g] 새 프레임 대조 ${g}-guest-{mobile|desktop}: 구조 컴포넌트 수 = 시안 (390 은 보이는 ${GUEST.lock} 포함 · 1440 은 위 사이드바 테스트) · 사이드바·표·드로어는 1440 만`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const path = (await guestPaths())[g];
    const { context, page, viewport } = await openGuest(browser, info, path);
    try {
      await expect(page.locator(sel(GUEST.banner)).first()).toBeVisible({ timeout: 30_000 });
      await waitWidthSettled(page);
      const frame = `${g}-guest-${viewport}`;
      if (viewport === "desktop") {
        for (const n of [DESKTOP_SHELL.component, TABLE]) await expect(page.locator(sel(n)), `${n} = 시안 ${frame}`).toHaveCount(frameNodes(frame, n).length);
        return;
      }
      if (g === 3) {
        // 시안 3-guest-mobile 은 "정보" 탭이 열린 상태 — 같은 상태로 맞춘다
        const tab = page.locator(`main ${sel("segmented-control")} [role="tab"]`, { hasText: "정보" }).first();
        await expect(async () => {
          if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
          await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
        }).toPass({ timeout: 15_000 });
      }
      const diff: string[] = [];
      for (const n of MOBILE_STRUCTURAL) {
        const want = frameNodes(frame, n).length;
        const got = await page.locator(sel(n)).count();
        if (got !== want) diff.push(`${n}: 시안 ${want} · 화면 ${got}`);
      }
      const locksWant = frameNodes(frame, GUEST.lock).length;
      const locksGot = await page.locator(sel(GUEST.lock)).evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null || e.getClientRects().length > 0).length);
      if (locksGot !== locksWant) diff.push(`${GUEST.lock}(보이는 것): 시안 ${locksWant} · 화면 ${locksGot}`);
      for (const n of [DESKTOP_SHELL.component, TABLE, DRAWER, HEADER]) if ((await page.locator(sel(n)).count()) !== 0) diff.push(`${n}: 390 은 0`);
      expect(diff, `새 프레임 ${frame} 와 다른 구조 컴포넌트`).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
