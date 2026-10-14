// 화면 18 관리 (/manage · 둘러보기 /demo/manage) 학교 격리 — N1-ui (390 · 1440).
// 기준: harness/d7-data.md §29 "화면 18 관리"(요약 = 로그인 세션 RLS 숫자) · §2 N1(다른 학교 데이터 0), harness/d5-gates.md N1-ui,
//       design/rules.json manage · never.N1 · guest.
// - 390: 학교A·학교B 사용자가 보는 요약 caption = 자기 학교 DB(RLS) 숫자. 상대 학교 학교명 · 시약명 · 요약 caption 이
//   화면 글자 · 응답 본문(문서 HTML · 탭 이동 RSC) 에 0. 학교명 종류 = rules distinct_school_names.
// - 둘러보기 18g 390: 요약 = 데모(anon) 숫자, 학교A·B 학교명 · 시약명 · 요약 caption 0 (화면 · 문서 · RSC).
// - 1440: 데스크톱은 사이드바 — /manage → / , /demo/manage → /demo, manage-list 0 · 상대 학교명 0.
// 기대 데이터는 각 계정의 로그인 세션(publishable 키 + RLS) 또는 anon 으로 읽는다. service role 미사용. 쓰기 0.
import { test, expect, type Browser, type Page, type Response, type TestInfo } from "@playwright/test";
import { anonClient, ROLE_LABEL, type Role } from "./db-helpers";
import { openAs } from "./auth-state";
import { browserClient, browserSession, devRules, mobileActiveTab, routeOf, rules, sel } from "./screen-helpers";
import { schoolNamesIn } from "./shell-helpers";
import { demoSchool, guestRouteOf, openGuest, waitGuestShell } from "./guest-helpers";
import { LIST, ROW, ROW_SCREEN, SCREEN, dbCounts, expectedCaption, readList, squash, waitManage, type Counts } from "./screen-18-helpers";

const N1 = rules.never.N1;
const TB = rules.tab_bar;
const GUEST_PATH = devRules.routes[`${SCREEN}-guest`];

/** 학교 하나의 값: 학교명 · 시약명(RLS) · 요약 caption(행 이름 → rules manage.row 형식) */
type SchoolView = { schoolName: string; reagentNames: string[]; counts: Counts; captions: string[] };

/** 행 이름 전부(관리 아래 화면)에 대해 숫자가 있는 요약 caption */
function captionsOf(c: Counts): string[] {
  return [...new Set(Object.keys(ROW_SCREEN).map((label) => expectedCaption(label, c)).filter((x): x is string => !!x))];
}

/** 로그인 세션(RLS)으로 읽은 자기 학교 값 */
async function viewOf(page: Page): Promise<SchoolView> {
  const me = await browserSession(page);
  const counts = await dbCounts(page, me.role === "admin");
  const { client } = await browserClient(page);
  const r = await client.from("reagents").select("name");
  expect(r.error, "RLS reagents name").toBeNull();
  return { schoolName: me.schoolName, reagentNames: [...new Set((r.data ?? []).map((x) => x.name as string))], counts, captions: captionsOf(counts) };
}

/** 다른 계정의 학교 값 (별도 컨텍스트, 홈에서 읽기만) */
async function viewAs(browser: Browser, info: TestInfo, role: Role): Promise<SchoolView> {
  const { context, page } = await openAs(browser, info, role, 13, routeOf(13));
  try {
    return await viewOf(page);
  } finally {
    await context.close();
  }
}

/**
 * 보이면 안 되는 상대 값: 학교명 · 시약명 · 요약 caption.
 * 자기 쪽 글자 안에 들어 있는 것(예: 상대 '시약 5종' ⊂ 자기 '시약 15종', 같은 숫자의 '시약장 2개')은 구분할 수 없으므로 뺀다.
 */
function foreignStrings(other: SchoolView, own: { schoolName: string; reagentNames: string[]; captions: string[] }): { names: string[]; captions: string[] } {
  const mine = [own.schoolName, ...own.reagentNames, ...own.captions];
  const keep = (s: string) => !!s && !mine.some((m) => m.includes(s));
  return {
    names: [other.schoolName, ...other.reagentNames].filter(keep),
    captions: other.captions.filter((c) => keep(c) && !own.captions.some((m) => squash(m).includes(squash(c)))),
  };
}

/** 이 페이지가 받은 같은 origin 응답 본문 (문서 · RSC fetch · prefetch) — 종류 기록. 이동 뒤 읽지 못한 본문은 빈 문자열(대조는 rscBody · documentHtml 가 맡는다) */
function collectBodies(page: Page): () => Promise<{ kind: string; url: string; body: string }[]> {
  const pending: Promise<{ kind: string; url: string; body: string }>[] = [];
  const origin = new URL(page.url()).origin;
  page.on("response", (res: Response) => {
    const req = res.request();
    if (new URL(req.url()).origin !== origin) return;
    const t = req.resourceType();
    if (t !== "document" && t !== "fetch" && t !== "xhr") return;
    const rsc = req.headers()["rsc"] === "1" || (res.headers()["content-type"] ?? "").includes("text/x-component");
    pending.push(res.text().then((body) => ({ kind: rsc ? "rsc" : t, url: req.url(), body })).catch(() => ({ kind: t, url: req.url(), body: "" })));
  });
  return () => Promise.all(pending);
}

/** 비 GET 요청(쓰기) 기록 */
function watchWrites(page: Page): () => string[] {
  const w: string[] = [];
  page.on("request", (r) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(r.method())) w.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });
  return () => w;
}

/** 탭 '관리' 로 클라이언트 이동 (RSC 요청) */
async function goManageByTab(page: Page, target: string): Promise<void> {
  const tab = page.locator(`${sel(TB.component)} ${sel(TB.item)}`).filter({ hasText: mobileActiveTab(SCREEN) });
  await expect(tab, "'관리' 탭 1").toHaveCount(1, { timeout: 30_000 });
  await expect(tab).toHaveAttribute("href", target);
  await tab.click();
}

/**
 * RSC 응답 (같은 컨텍스트 쿠키, 요청 머리 RSC: 1 — 클라이언트 이동이 받는 것과 같은 payload).
 * Next 는 _rsc 캐시 키가 맞지 않으면 같은 경로 ?_rsc 로 307 을 보낸다 — 그것만 따라가고, 다른 경로(로그인 등)로 가면 실패.
 */
async function rscBody(page: Page, path: string): Promise<string> {
  const res = await page.request.get(path, { headers: { RSC: "1" } });
  expect(new URL(res.url()).pathname, `${path} RSC 도착 경로`).toBe(path);
  expect(res.status(), `${path} RSC 응답`).toBe(200);
  expect(res.headers()["content-type"] ?? "", `${path} RSC content-type`).toContain("text/x-component");
  const body = await res.text();
  expect(body.length, `대조: ${path} RSC 본문 있음`).toBeGreaterThan(0);
  return body;
}

/** 문서 HTML (같은 컨텍스트 쿠키) — 서버가 그린 첫 그림 */
async function documentHtml(page: Page, path: string): Promise<string> {
  const res = await page.request.get(path, { maxRedirects: 0 });
  expect(res.status(), `${path} 문서 응답`).toBe(200);
  return res.text();
}

const PAIRS: { viewer: Role; other: Role }[] = [
  { viewer: "admin", other: "schoolB" },
  { viewer: "student", other: "schoolB" },
  { viewer: "schoolB", other: "admin" },
];

for (const { viewer, other } of PAIRS) {
  test(`[N1-ui][S${SCREEN}] ${ROLE_LABEL[viewer]} ${routeOf(SCREEN)} 390: 요약 caption = 자기 학교 DB(RLS) 숫자 · ${ROLE_LABEL[other]} 학교의 학교명·시약명·요약 caption 이 화면 글자 · 응답 본문(문서 · 탭 이동 RSC) 에 0 · 학교명 종류 = rules distinct_school_names / 1440: → ${routeOf(13)} · manage-list 0 · 상대 학교명 0`, async ({ browser }, info) => {
    test.setTimeout(240_000);
    const otherView = await viewAs(browser, info, other);
    const { context, page, viewport } = await openAs(browser, info, viewer, 13, routeOf(13));
    const writes = watchWrites(page);
    try {
      const own = await viewOf(page);
      expect(own.schoolName, "대조: 두 계정은 다른 학교").not.toBe(otherView.schoolName);
      const foreign = foreignStrings(otherView, own);
      expect(foreign.names, "대조: 상대 학교명은 비교 대상").toContain(otherView.schoolName);
      expect(foreign.names.length, "대조: 상대 학교명 + 시약명 ≥ 2").toBeGreaterThanOrEqual(2);

      if (viewport === "desktop") {
        await page.goto(routeOf(SCREEN));
        await expect.poll(() => new URL(page.url()).pathname, { message: `1440 ${routeOf(SCREEN)} → ${routeOf(13)}`, timeout: 30_000 }).toBe(routeOf(13));
        await expect(page.locator(sel("home-summary")).first(), "홈 본문").toBeVisible({ timeout: 30_000 });
        await expect(page.locator(sel(LIST)), "1440 manage-list 0").toHaveCount(0);
        const text = await page.locator("body").innerText();
        expect(text, `상대 학교명 ${otherView.schoolName} 0`).not.toContain(otherView.schoolName);
        const names = await schoolNamesIn(page.locator("body"));
        expect(names.length, "학교명 종류 = rules distinct_school_names").toBe(N1.distinct_school_names);
        for (const n of names) expect(own.schoolName, `보이는 학교명 '${n}' 은 자기 학교명의 일부`).toContain(n);
        expect(writes(), "쓰기 요청 0").toEqual([]);
        return;
      }

      // 390: 홈 → 탭 '관리' (클라이언트 이동 = RSC)
      const bodies = collectBodies(page);
      await goManageByTab(page, routeOf(SCREEN));
      await waitManage(page);
      // 요약 caption = 자기 학교 RLS 숫자 (화면에서 읽을 때 다시 센다 — 그 사이 다른 테스트가 바꿨을 수 있으므로)
      const now = await dbCounts(page, (await browserSession(page)).role === "admin");
      const shown = await readList(page);
      expect(shown.rows.length, "대조: manage-row ≥ 1").toBeGreaterThan(0);
      let withCaption = 0;
      for (const r of shown.rows) {
        const cap = expectedCaption(r.label, now);
        if (cap) withCaption++;
        expect(r.text, `행 '${r.label}' = 이름${cap ? ` + 자기 학교 '${cap}'` : "만"}`).toBe(squash(r.label + (cap ?? "")));
      }
      expect(withCaption, "대조: 요약 caption 이 있는 행 ≥ 1").toBeGreaterThan(0);
      const ownNow = { ...own, captions: captionsOf(now) };
      const f = foreignStrings(otherView, ownNow);

      // 화면 글자
      const text = await page.locator("body").innerText();
      for (const s of [...f.names, ...f.captions]) expect(text, `화면에 상대 학교 값 "${s}" 0`).not.toContain(s);
      const rowText = (await page.locator(`main ${sel(ROW)}`).allInnerTexts()).join("\n");
      for (const c of f.captions) expect(squash(rowText), `행 글자에 상대 요약 "${c}" 0`).not.toContain(squash(c));
      const names = await schoolNamesIn(page.locator("body"));
      expect(names.length, "학교명 종류 = rules distinct_school_names").toBe(N1.distinct_school_names);
      for (const n of names) expect(own.schoolName, `보이는 학교명 '${n}' 은 자기 학교명의 일부`).toContain(n);

      // 응답 본문: 탭 이동 RSC + 문서 HTML
      const got = await bodies();
      const rsc = await rscBody(page, routeOf(SCREEN));
      const html = await documentHtml(page, routeOf(SCREEN));
      // 대조: 문서 HTML 에 자기 학교 요약 caption 이 들어 있음 (서버가 그린 목록)
      const ownCaps = shown.rows.map((r) => expectedCaption(r.label, now)).filter((x): x is string => !!x);
      for (const c of ownCaps) expect(squash(html.replace(/<[^>]+>/g, "")), `대조: 문서 HTML 에 자기 요약 '${c}'`).toContain(squash(c));
      for (const { kind, url, body } of [...got, { kind: "rsc(request)", url: routeOf(SCREEN), body: rsc }, { kind: "document(request)", url: routeOf(SCREEN), body: html }]) {
        const plain = squash(body.replace(/<[^>]+>/g, ""));
        for (const s of f.names) expect(body.includes(s), `${kind} ${new URL(url, "http://x").pathname} 본문에 상대 값 "${s}" 0`).toBe(false);
        for (const c of f.captions) expect(plain.includes(squash(c)), `${kind} ${new URL(url, "http://x").pathname} 본문에 상대 요약 "${c}" 0`).toBe(false);
      }
      expect(writes(), "쓰기 요청 0").toEqual([]);
    } finally {
      await context.close();
    }
  });
}

test(`[N1-ui][GM-ui][S${SCREEN}g] 둘러보기 ${GUEST_PATH} 390: 요약 caption = 데모 학교(anon) 숫자만 · 학교A·학교B 학교명·시약명·요약 caption 이 화면 글자 · 응답 본문(문서 · 탭 이동 RSC) 에 0 · 학교명 = '${rules.guest.school_name}' / 1440: → ${guestRouteOf(13)} · 학교A·B 학교명 0`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  const a = await viewAs(browser, info, "admin");
  const b = await viewAs(browser, info, "schoolB");
  expect(a.schoolName).not.toBe(b.schoolName);
  const demo = await demoSchool();
  const anon = anonClient();
  const [rg, sn] = await Promise.all([anon.from("reagents").select("name, school_id, stock, min_stock"), anon.from("sensors").select("school_id, status")]);
  expect(rg.error, "anon reagents").toBeNull();
  expect(sn.error, "anon sensors").toBeNull();
  for (const rows of [rg.data, sn.data]) expect((rows ?? []).filter((x) => x.school_id !== demo.id), "anon = 데모 학교 행만").toEqual([]);
  const demoCounts: Counts = {
    reagents: (rg.data ?? []).length,
    low: (rg.data ?? []).filter((x) => Number(x.stock) < Number(x.min_stock)).length,
    sensors: (sn.data ?? []).length,
    broken: (sn.data ?? []).filter((x) => x.status === "broken").length,
    cabinets: 0,
  };
  expect(demoCounts.reagents, "대조: 데모 시약 ≥ 1").toBeGreaterThan(0);
  const demoView = { schoolName: demo.name, reagentNames: [...new Set((rg.data ?? []).map((x) => x.name as string))], captions: captionsOf(demoCounts) };
  const fa = foreignStrings(a, demoView);
  const fb = foreignStrings(b, demoView);
  const foreignNames = [...new Set([...fa.names, ...fb.names])];
  const foreignCaps = [...new Set([...fa.captions, ...fb.captions])];
  expect(foreignNames, "대조: 학교A 학교명 비교 대상").toContain(a.schoolName);
  expect(foreignNames, "대조: 학교B 학교명 비교 대상").toContain(b.schoolName);

  const { context, page, viewport } = await openGuest(browser, info, guestRouteOf(13));
  const writes = watchWrites(page);
  try {
    await waitGuestShell(page);
    if (viewport === "desktop") {
      await page.goto(GUEST_PATH);
      await expect.poll(() => new URL(page.url()).pathname, { message: `1440 ${GUEST_PATH} → ${guestRouteOf(13)}`, timeout: 30_000 }).toBe(guestRouteOf(13));
      await waitGuestShell(page);
      await expect(page.locator(sel(LIST)), "1440 manage-list 0").toHaveCount(0);
      const text = await page.locator("body").innerText();
      for (const s of [a.schoolName, b.schoolName]) expect(text, `학교명 ${s} 0`).not.toContain(s);
      expect(writes(), "쓰기 요청 0").toEqual([]);
      return;
    }
    const bodies = collectBodies(page);
    await goManageByTab(page, GUEST_PATH);
    await expect.poll(() => new URL(page.url()).pathname, { message: "18g 경로", timeout: 30_000 }).toBe(GUEST_PATH);
    await expect(page.locator(`main ${sel(LIST)}`), "manage-list").toBeVisible({ timeout: 45_000 });
    const shown = await readList(page);
    expect(shown.rows.length, "대조: 둘러보기 행 ≥ 1").toBeGreaterThan(0);
    for (const r of shown.rows) {
      const cap = expectedCaption(r.label, demoCounts);
      expect(cap, `행 '${r.label}' 은 데모 숫자 요약이 있는 행`).not.toBeNull();
      expect(r.text, `행 '${r.label}' = 이름 + 데모 '${cap}'`).toBe(squash(r.label + (cap ?? "")));
    }
    const text = await page.locator("body").innerText();
    for (const s of [...foreignNames, ...foreignCaps]) expect(text, `화면에 학교 값 "${s}" 0`).not.toContain(s);
    const names = await schoolNamesIn(page.locator("body"));
    for (const n of names) expect(rules.guest.school_name, `보이는 학교명 '${n}' 은 데모 학교명의 일부`).toContain(n);

    const got = await bodies();
    const rsc = await rscBody(page, GUEST_PATH);
    const html = await documentHtml(page, GUEST_PATH);
    for (const r of shown.rows) {
      const cap = expectedCaption(r.label, demoCounts)!;
      expect(squash(html.replace(/<[^>]+>/g, "")), `대조: 문서 HTML 에 데모 요약 '${cap}'`).toContain(squash(cap));
    }
    for (const { kind, url, body } of [...got, { kind: "rsc(request)", url: GUEST_PATH, body: rsc }, { kind: "document(request)", url: GUEST_PATH, body: html }]) {
      const plain = squash(body.replace(/<[^>]+>/g, ""));
      for (const s of foreignNames) expect(body.includes(s), `${kind} ${new URL(url, "http://x").pathname} 본문에 학교 값 "${s}" 0`).toBe(false);
      for (const c of foreignCaps) expect(plain.includes(squash(c)), `${kind} ${new URL(url, "http://x").pathname} 본문에 학교 요약 "${c}" 0`).toBe(false);
    }
    expect(writes(), "쓰기 요청 0").toEqual([]);
  } finally {
    await context.close();
  }
});
