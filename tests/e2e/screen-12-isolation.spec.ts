// 화면 12 (QR 찾기) 학교 격리 — N1-ui (390 · 1440). 학교 B 계정이 학교 A 시약장을 번호·id(QR 링크)로 찾아도 결과 0, 학교 A 계정도 반대로 같음.
// 기준: harness/d7-data.md §26 "화면 12 데이터"(기존 RLS — 다른 학교 id 는 0행 → "아니에요" 토스트용 학교명은 로그인 사용자 학교명)·"QR 해석",
//       harness/d5-gates.md N1-ui (로그인 후 화면 텍스트의 학교명 종류 = 1), design/rules.json never.N1.
// 화면 글자와 서버 응답 본문(문서 HTML · 서버 액션 응답) 둘 다 본다. 기대 데이터는 각 계정의 로그인 세션(RLS)으로 읽는다.
import { test, expect, type Page, type Response } from "@playwright/test";
import { openAs } from "./auth-state";
import { browserSession, routeOf, rules } from "./screen-helpers";
import { schoolNamesIn } from "./shell-helpers";
import {
  SCAN,
  SCREEN,
  expectResultContent,
  expectResultOpen,
  expectToast,
  findByNumber,
  manualError,
  missingText,
  notOursText,
  openScan,
  ownCabinets,
  schoolBView,
  sheet,
  waitScan,
  type ExpectCabinet,
} from "./screen-12-helpers";

/** 이 페이지가 받은 응답 본문 (같은 origin 문서 · 서버 액션 POST · RSC) */
function collectBodies(page: Page, origin: string): () => Promise<string[]> {
  const pending: Promise<string>[] = [];
  page.on("response", (res: Response) => {
    const req = res.request();
    if (new URL(req.url()).origin !== origin) return;
    const t = req.resourceType();
    if (t !== "document" && t !== "fetch" && t !== "xhr") return;
    pending.push(res.text().catch(() => ""));
  });
  return () => Promise.all(pending);
}

/** 다른 학교 값 (학교명 · 시약장 이름 · 시약명) — 자기 학교 글자 안에 들어 있는 것(예: "시약장 1" ⊂ "B 시약장 1")은 뺀다 */
function foreignStrings(other: { schoolName: string; cabs: ExpectCabinet[] }, own: { schoolName: string; cabs: ExpectCabinet[] }): string[] {
  const mine = new Set([own.schoolName, ...own.cabs.map((c) => c.label), ...own.cabs.flatMap((c) => c.rows.map((r) => r.name))]);
  return [...new Set([other.schoolName, ...other.cabs.map((c) => c.label), ...other.cabs.flatMap((c) => c.rows.map((r) => r.name))])].filter((s) => s && ![...mine].some((m) => m.includes(s)));
}

async function schoolAView(browser: Parameters<typeof openAs>[0], info: Parameters<typeof openAs>[1]): Promise<{ schoolName: string; cabs: ExpectCabinet[] }> {
  const { context, page } = await openAs(browser, info, "teacher", 13, routeOf(13));
  try {
    return { schoolName: (await browserSession(page)).schoolName, cabs: await ownCabinets(page) };
  } finally {
    await context.close();
  }
}

test(`[N1-ui][S${SCREEN}] 학교B 사용자: 학교 A 시약장 id 로 ${SCAN}?cabinet= → "{학교B 이름} 시약장 QR이 아니에요" · 결과 0 · 번호(학교 A 에만 있는 번호) → "{n}번 시약장이 없어요" · 같은 번호 = 자기 학교 시약장만 · 화면·응답 본문에 학교 A 학교명·시약장 이름·시약명 0 · 학교명 1종`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  const a = await schoolAView(browser, info);
  expect(a.cabs.length, "대조: 학교 A 시약장 ≥ 1").toBeGreaterThan(0);
  expect(a.cabs.some((c) => c.rows.length > 0), "대조: 학교 A 시약장에 시약 있음").toBe(true);
  const { context, page, viewport } = await openScan(browser, info, "schoolB");
  const bodies = collectBodies(page, new URL(page.url()).origin);
  try {
    await waitScan(page);
    const me = await browserSession(page);
    expect(me.schoolName).not.toBe(a.schoolName);
    const b = { schoolName: me.schoolName, cabs: await ownCabinets(page) };
    const foreign = foreignStrings(a, b);
    expect(foreign, "대조: 학교 A 학교명은 비교 대상").toContain(a.schoolName);
    expect(foreign.length, "대조: 학교 A 값 비교 수 ≥ 학교명 + 시약 1").toBeGreaterThanOrEqual(2);

    // 1) 학교 A 시약장 id (QR 링크)
    for (const cab of a.cabs) {
      await page.goto(`${SCAN}?cabinet=${cab.id}`);
      await waitScan(page);
      await expectToast(page, notOursText(me.schoolName), `학교 A ${cab.number}번 id`);
      await expect(sheet(page), `학교 A ${cab.number}번 id: 결과 0`).toHaveCount(0);
      await expect.poll(() => `${new URL(page.url()).pathname}${new URL(page.url()).search}`, { message: "주소 → /scan" }).toBe(SCAN);
    }

    // 2) 번호: 학교 A 에만 있는 번호 → 없어요 / 두 학교에 다 있는 번호 → 자기 학교 시약장
    const bNums = new Set(b.cabs.map((c) => c.number));
    const onlyA = a.cabs.find((c) => !bNums.has(c.number));
    expect(onlyA, "대조: 학교 A 에만 있는 번호 (seed: 학교 A 2개 · 학교 B 1개)").toBeTruthy();
    await findByNumber(page, viewport, String(onlyA!.number));
    await expect(manualError(page), `${onlyA!.number} → "${missingText(onlyA!.number)}"`).toHaveText(missingText(onlyA!.number), { timeout: 20_000 });
    await expect(sheet(page), "결과 0").toHaveCount(0);
    const shared = b.cabs.find((c) => a.cabs.some((x) => x.number === c.number));
    expect(shared, "대조: 두 학교에 같은 번호").toBeTruthy();
    await findByNumber(page, viewport, String(shared!.number));
    await expectResultOpen(page, shared!, `같은 번호 ${shared!.number}`);
    await expectResultContent(page, viewport, shared!, `같은 번호 ${shared!.number} = 학교 B 시약장`);

    // 화면 글자 · 응답 본문
    const text = await page.locator("body").innerText();
    for (const s of foreign) expect(text, `화면에 학교 A 값 "${s}" 0`).not.toContain(s);
    const names = await schoolNamesIn(page.locator("body"));
    expect(names.length, "학교명 종류 = rules distinct_school_names").toBe(rules.never.N1.distinct_school_names);
    const all = await bodies();
    expect(all.length, "대조: 응답 본문 수집됨").toBeGreaterThan(0);
    for (const body of all) for (const s of foreign) expect(body.includes(s), `응답 본문에 학교 A 값 "${s}" 0`).toBe(false);
  } finally {
    await context.close();
  }
});

test(`[N1-ui][S${SCREEN}] 학교A 학생: 학교 B 시약장 id 로 ${SCAN}?cabinet= · QR 링크 → 결과 0 · "{학교A 이름} 시약장 QR이 아니에요" · 화면·응답 본문에 학교 B 학교명·시약장 이름·시약명 0 · 학교명 1종`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  const bView = await schoolBView(browser, info);
  expect(bView.cabs.length, "대조: 학교 B 시약장 ≥ 1").toBeGreaterThan(0);
  const { context, page } = await openScan(browser, info, "student");
  const bodies = collectBodies(page, new URL(page.url()).origin);
  try {
    await waitScan(page);
    const me = await browserSession(page);
    const aView = { schoolName: me.schoolName, cabs: await ownCabinets(page) };
    const foreign = foreignStrings(bView, aView);
    expect(foreign, "대조: 학교 B 학교명은 비교 대상").toContain(bView.schoolName);
    for (const cab of bView.cabs) {
      const res = await page.goto(`${SCAN}?cabinet=${cab.id}`);
      expect(res?.status()).toBe(200);
      await waitScan(page);
      await expectToast(page, notOursText(me.schoolName), `학교 B ${cab.number}번 id`);
      await expect(sheet(page), "결과 0").toHaveCount(0);
    }
    const text = await page.locator("body").innerText();
    for (const s of foreign) expect(text, `화면에 학교 B 값 "${s}" 0`).not.toContain(s);
    expect((await schoolNamesIn(page.locator("body"))).length, "학교명 1종").toBe(rules.never.N1.distinct_school_names);
    for (const body of await bodies()) for (const s of foreign) expect(body.includes(s), `응답 본문에 학교 B 값 "${s}" 0`).toBe(false);
  } finally {
    await context.close();
  }
});
