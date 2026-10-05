// 화면 11 (시약장 설정) 학교 격리: N1-ui
// 기준: harness/d5-gates.md N1-ui (로그인 후 화면 텍스트의 학교명 종류 = 1), design/rules.json never.N1,
//       harness/d7-data.md §9 (같은 학교 시약장만 · 칸 없음 시약 = 그 학교 것), dev-rules route_auth 11_note (?c 가 자기 학교 것이 아니면 첫 시약장).
// 공용 계정(학교 A·B)은 읽기만 한다. 대조용으로 일회용 학교(이름 붙인 시약장·시약)를 하나 만들고 끝나면 지운다.
// service role 은 준비·정리·대조 조회(다른 학교의 이름·시약장 이름·시약명 목록)에만 쓴다 — 판정 대상은 브라우저 화면과 응답 본문.
import { randomBytes } from "node:crypto";
import { test, expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { ROLE_LABEL, type Role } from "./db-helpers";
import { openAs } from "./auth-state";
import { browserClient, browserSession, countComponent, routeOf, rules, sel } from "./screen-helpers";
import { HAS_SERVICE, service } from "./screen-8-helpers";
import { ALL_COMPONENTS, BUSY, componentCounts, expectShell, installNavGate, schoolNamesIn, waitHydrated } from "./shell-helpers";
import {
  CABINETS_HREF,
  DOUBLE,
  FRAME_LAYOUT,
  HOME_SCREEN,
  NO_S11_RESIDUE,
  SCREEN,
  SLOT,
  SWITCHER,
  cleanup,
  dbView,
  expectActive,
  expectBoard,
  expectHeader,
  makeFixture,
  pillLabels,
  prepCabinet,
  prepLayout,
  prepPlace,
  prepReagent,
  prepRename,
  rows,
  sharedCabinetSnapshot,
  slots,
  waitCabinets,
  watchActions,
  type DbCabinet,
  type DbView,
  type S11Fixture,
} from "./screen-11-helpers";

test.describe.configure({ mode: "default" });
test.skip(!HAS_SERVICE, "SUPABASE_SERVICE_ROLE_KEY 가 없어 대조용 일회용 학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)");

const GROUP = "s11iso";
const N1 = rules.never.N1;
const withC = (id: string) => `${CABINETS_HREF}?c=${id}`;

type Fixture = { f: S11Fixture; cabinet: DbCabinet; label: string; reagents: string[] };
let before: string[] | null = null;
let fixtureCache: Promise<Fixture> | null = null;

/** 대조용 일회용 학교: 이름 붙인 시약장 1개(시안 칸 분류) + 배치 시약 1 + 칸 없음 시약 1 (워커당 1개) */
function otherSchool(info: TestInfo): Promise<Fixture> {
  fixtureCache ??= (async () => {
    const f = await makeFixture(info, GROUP);
    const cabinet = await prepCabinet(f);
    const label = `격리장-${randomBytes(3).toString("hex")}`;
    await prepRename(f, cabinet.id, label);
    await prepLayout(f, cabinet.id, DOUBLE, 4, FRAME_LAYOUT);
    const placed = await prepReagent(f, "격리배치");
    await prepPlace(f, placed.id, cabinet.id, "L1");
    const loose = await prepReagent(f, "격리칸없음");
    return { f, cabinet, label, reagents: [placed.name, loose.name] };
  })();
  fixtureCache.catch(() => {
    fixtureCache = null;
  });
  return fixtureCache;
}

test.beforeAll(async () => {
  if (HAS_SERVICE) before = await sharedCabinetSnapshot();
});

test.afterAll(async ({}, info) => {
  info.setTimeout(300_000);
  if (!HAS_SERVICE) return;
  fixtureCache = null;
  const left = await cleanup(GROUP, info.project.name);
  expect(left, "일회용 계정·학교·시약장·칸·시약 잔여물").toEqual(NO_S11_RESIDUE);
  if (before) expect(await sharedCabinetSnapshot(), "학교 A·B·데모 학교의 시약장·칸·시약 배치가 그대로").toEqual(before);
});

type Other = { id: string; name: string; isDemo: boolean; neis: string | null; cabinets: { id: string; label: string }[]; reagents: string[] };

/** 대조 조회 (service role): 주어진 학교가 아닌 모든 학교의 이름·시약장(id·이름)·시약명 */
async function otherSchools(ownSchoolId: string): Promise<Other[]> {
  const sb = service();
  const [schools, cabs, reagents] = await Promise.all([
    sb.from("schools").select("id, name, is_demo, neis_code").neq("id", ownSchoolId),
    sb.from("cabinets").select("id, school_id, label").neq("school_id", ownSchoolId),
    sb.from("reagents").select("school_id, name").neq("school_id", ownSchoolId),
  ]);
  for (const q of [schools, cabs, reagents]) if (q.error) throw new Error(`대조 조회 실패: ${q.error.message}`);
  return (schools.data ?? []).map((s) => ({
    id: s.id as string,
    name: s.name as string,
    isDemo: Boolean(s.is_demo),
    neis: (s.neis_code as string | null) ?? null,
    cabinets: (cabs.data ?? []).filter((c) => c.school_id === s.id).map((c) => ({ id: c.id as string, label: c.label as string })),
    reagents: (reagents.data ?? []).filter((r) => r.school_id === s.id).map((r) => r.name as string),
  }));
}

async function ownSchoolId(page: Page): Promise<string> {
  const { client, userId } = await browserClient(page);
  const prof = await client.from("profiles").select("school_id").eq("user_id", userId).single();
  if (prof.error || !prof.data) throw new Error(`profiles 자기 행 없음: ${prof.error?.message}`);
  return prof.data.school_id as string;
}

/**
 * 다른 학교의 학교명·시약장 이름·시약명이 글자(화면·응답 본문)에 없는지.
 * 자기 학교의 글자에 포함되는 값(같은 시약명 등)은 비교에서 빼고, 비교한 값의 수를 학교별로 돌려준다.
 */
function expectNoOtherSchool(texts: Record<string, string>, others: Other[], ownStrings: string[]): Record<string, number> {
  const compared: Record<string, number> = {};
  const own = ownStrings.map((s) => s.toLowerCase());
  const distinct = (v: string) => v.trim().length >= 2 && !own.some((o) => o.includes(v.toLowerCase()));
  for (const o of others) {
    compared[o.id] = 0;
    for (const v of [o.name, ...o.cabinets.map((c) => c.label), ...o.reagents]) {
      if (!distinct(v)) continue;
      compared[o.id] += 1;
      for (const [where, text] of Object.entries(texts)) {
        expect(text.toLowerCase().includes(v.toLowerCase()), `${where} 에 다른 학교(${o.name})의 '${v}'`).toBe(false);
      }
    }
  }
  return compared;
}

/** 학교명 종류 = rules.json distinct_school_names, 보이는 학교명은 자기 학교명(의 패턴에 걸리는 부분)뿐 */
function checkSchoolNames(text: string, mine: string, where: string): void {
  const names = [...new Set(text.match(new RegExp(N1.school_name_pattern, "g")) ?? [])];
  expect(names, `${where}: 학교명 종류`).toHaveLength(N1.distinct_school_names);
  for (const n of names) expect(mine, `${where}: 보이는 학교명 '${n}' 은 자기 학교명의 일부`).toContain(n);
  expect(text, `${where}: 자기 학교명 표시`).toContain(mine);
}

/** 자기 학교 글자: 학교명·시약장 이름·시약명 (지금 화면에 보이는 칸 없음 행 포함 — 다른 스펙이 학교 A 에 잠깐 넣는 임시 시약) */
async function ownStringsOf(page: Page, db: DbView, schoolName: string): Promise<string[]> {
  const shown = (await rows(page).allInnerTexts()).flatMap((t) => t.split(/\n/).map((x) => x.trim()).filter(Boolean));
  return [schoolName, ...db.cabinets.map((c) => c.label), ...db.reagentNames, ...shown];
}

/** 화면 글자 + 응답 본문 (기본 주소 · 시약장마다 ?c=) */
async function collect(page: Page, context: BrowserContext, db: DbView): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const path of [CABINETS_HREF, ...db.cabinets.map((c) => withC(c.id))]) {
    await page.goto(path);
    await waitCabinets(page);
    out[`화면 ${path}`] = await page.locator("body").innerText();
    const res = await context.request.get(path);
    expect(res.status(), `${path} 응답`).toBe(200);
    out[`응답 본문 ${path}`] = await res.text();
  }
  return out;
}

for (const role of ["teacher", "student"] as Role[]) {
  test(`[N1-ui][S${SCREEN}] ${ROLE_LABEL[role]} ${CABINETS_HREF}(· 시약장마다 ?c=): 화면·응답 본문에 다른 학교(학교B·일회용 학교·데모 학교·그 밖의 모든 학교)의 학교명·시약장 이름·시약명 0 · 학교명 종류 = rules.json distinct_school_names · pill = 자기 학교 시약장만`, async ({ browser }, info) => {
    test.setTimeout(300_000);
    const fx = await otherSchool(info);
    const { context, page } = await openAs(browser, info, role, SCREEN);
    const actions = watchActions(page);
    try {
      await waitCabinets(page);
      const me = await browserSession(page);
      const schoolId = await ownSchoolId(page);
      expect(schoolId, "일회용 학교와 다른 학교").not.toBe(fx.f.school.id);
      const db = await dbView(page);
      expect(db.cabinets.length, "대조: 자기 학교 시약장").toBeGreaterThan(0);

      const others = await otherSchools(schoolId);
      const temp = others.find((o) => o.id === fx.f.school.id);
      const demo = others.find((o) => o.isDemo);
      const schoolB = others.find((o) => o.neis === "TEST-SCHOOL-B");
      expect(temp?.cabinets.map((c) => c.label), "대조: 일회용 학교 시약장").toEqual([fx.label]);
      expect(temp?.reagents.sort(), "대조: 일회용 학교 시약").toEqual([...fx.reagents].sort());
      expect(demo?.cabinets.length, "대조: 데모 학교 시약장").toBeGreaterThan(0);
      expect(demo?.reagents.length, "대조: 데모 학교 시약").toBeGreaterThan(0);
      expect(schoolB?.cabinets.length, "대조: 학교 B 시약장").toBeGreaterThan(0);
      expect(schoolB?.reagents.length, "대조: 학교 B 시약").toBeGreaterThan(0);

      const texts = await collect(page, context, db);
      const own = await ownStringsOf(page, db, me.schoolName);
      const compared = expectNoOtherSchool(texts, others, own);
      expect(compared[temp!.id], "대조: 일회용 학교 값 비교 수 (학교명 + 시약장 + 시약 2)").toBe(4);
      expect(compared[schoolB!.id], "대조: 학교 B 값 비교 수").toBeGreaterThanOrEqual(3);
      expect(compared[demo!.id], "대조: 데모 학교 값 비교 수").toBeGreaterThanOrEqual(1);
      for (const [where, text] of Object.entries(texts)) {
        if (where.startsWith("화면")) checkSchoolNames(text, me.schoolName, where);
        else {
          const names = [...new Set(text.match(new RegExp(N1.school_name_pattern, "g")) ?? [])];
          for (const n of names) expect(me.schoolName, `${where}: 학교명 '${n}' 은 자기 학교명의 일부`).toContain(n);
        }
      }
      // pill = 자기 학교 시약장만
      expect((await pillLabels(page)).sort()).toEqual(db.cabinets.map((c) => c.label).sort());
      expect(actions.count(), "쓰기 요청 0건").toBe(0);
    } finally {
      await context.close();
    }
  });
}

for (const role of ["student", "teacher", "admin"] as Role[]) {
  test(`[N1-ui][S${SCREEN}] ${ROLE_LABEL[role]} ?c={학교B·일회용 학교·데모 학교 시약장 id} → 자기 학교 첫 시약장(200) · 화면·응답 본문에 그 학교의 시약장 이름·시약명·학교명 0`, async ({ browser }, info) => {
    test.setTimeout(300_000);
    const fx = await otherSchool(info);
    const { context, page } = await openAs(browser, info, role, SCREEN);
    try {
      await waitCabinets(page);
      const me = await browserSession(page);
      const schoolId = await ownSchoolId(page);
      const db = await dbView(page);
      const firstLabel = (await pillLabels(page))[0];
      const first = db.cabinets.find((c) => c.label === firstLabel)!;
      expect(first, "첫 pill 은 자기 학교 시약장").toBeTruthy();
      await expectActive(page, first.label, "c 없음");
      const own = await ownStringsOf(page, db, me.schoolName);

      const others = await otherSchools(schoolId);
      const targets = [
        others.find((o) => o.neis === "TEST-SCHOOL-B"),
        others.find((o) => o.id === fx.f.school.id),
        others.find((o) => o.isDemo),
      ];
      for (const o of targets) {
        expect(o, "대조: 대상 학교").toBeTruthy();
        expect(o!.cabinets.length, `대조: ${o!.name} 시약장`).toBeGreaterThan(0);
        for (const cab of o!.cabinets) {
          expect(db.cabinets.map((c) => c.id), "대조: 자기 학교 시약장 id 가 아니다").not.toContain(cab.id);
          const path = withC(cab.id);
          const res = await page.goto(path);
          expect(res?.status(), `${path} 응답`).toBe(200);
          await waitCabinets(page);
          expect(new URL(page.url()).pathname).toBe(CABINETS_HREF);
          await expectActive(page, first.label, `${o!.name} 시약장 id → 자기 학교 첫 시약장`);
          await expectHeader(page, first.label, first.door_type, first.shelves, `${o!.name} 시약장 id`);
          await expectBoard(page, first.door_type, first.shelves, db.classes[first.id] ?? {}, `${o!.name} 시약장 id`);
          expect((await pillLabels(page)).sort(), "pill = 자기 학교 시약장만").toEqual(db.cabinets.map((c) => c.label).sort());
          const html = await (await context.request.get(path)).text();
          const texts = { [`화면 ${o!.name}`]: await page.locator("body").innerText(), [`응답 본문 ${o!.name}`]: html, [`첫 응답 본문 ${o!.name}`]: await res!.text() };
          const compared = expectNoOtherSchool(texts, [o!], own);
          expect(compared[o!.id], `대조: ${o!.name} 값 비교 수`).toBeGreaterThanOrEqual(1);
          expect(html, "응답 본문에 그 시약장 id 로 만든 링크 없음").not.toContain(`c=${cab.id}"`);
          checkSchoolNames(texts[`화면 ${o!.name}`], me.schoolName, `${o!.name} 시약장 id`);
        }
      }
    } finally {
      await context.close();
    }
  });
}

test(`[N1-ui][S${SCREEN}] 학교B 교사 ${CABINETS_HREF}: 화면·응답 본문에 학교A·일회용 학교·데모 학교의 학교명·시약장 이름·시약명 0 · ?c={학교A 시약장 id} → 학교B 첫 시약장 · 칸 없음 목록·삭제 확인의 수 = 학교B 것만`, async ({ browser }, info) => {
  test.setTimeout(300_000);
  const fx = await otherSchool(info);
  const { context, page } = await openAs(browser, info, "schoolB", SCREEN);
  const actions = watchActions(page);
  try {
    await waitCabinets(page);
    const me = await browserSession(page);
    const schoolId = await ownSchoolId(page);
    const db = await dbView(page);
    expect(db.cabinets.length, "대조: 학교 B 시약장").toBeGreaterThan(0);
    const others = await otherSchools(schoolId);
    const schoolA = others.find((o) => o.neis === "TEST-SCHOOL-A");
    expect(schoolA?.cabinets.length, "대조: 학교 A 시약장").toBeGreaterThan(0);
    expect(others.find((o) => o.id === fx.f.school.id), "대조: 일회용 학교").toBeTruthy();

    const texts = await collect(page, context, db);
    const own = await ownStringsOf(page, db, me.schoolName);
    const compared = expectNoOtherSchool(texts, others, own);
    expect(compared[schoolA!.id], "대조: 학교 A 값 비교 수 (학교명·시약장·시약)").toBeGreaterThanOrEqual(5);
    expect(compared[fx.f.school.id], "대조: 일회용 학교 값 비교 수").toBe(4);
    for (const [where, text] of Object.entries(texts)) if (where.startsWith("화면")) checkSchoolNames(text, me.schoolName, where);

    const firstLabel = (await pillLabels(page))[0];
    const first = db.cabinets.find((c) => c.label === firstLabel)!;
    for (const cab of schoolA!.cabinets) {
      const res = await page.goto(withC(cab.id));
      expect(res?.status()).toBe(200);
      await waitCabinets(page);
      await expectActive(page, first.label, "학교 A 시약장 id → 학교 B 첫 시약장");
      await expectHeader(page, first.label, first.door_type, first.shelves, "학교 A 시약장 id");
      await expectBoard(page, first.door_type, first.shelves, db.classes[first.id] ?? {}, "학교 A 시약장 id");
      expectNoOtherSchool({ 화면: await page.locator("body").innerText(), "응답 본문": await res!.text() }, [schoolA!], own);
    }
    // 화면의 칸 수·pill 수는 학교 B 것만
    await expect(page.locator(`main ${sel(SWITCHER)}`)).toHaveCount(1);
    expect(await pillLabels(page)).toHaveLength(db.cabinets.length);
    expect(await countComponent(page, SLOT)).toBe(await slots(page).count());
    expect(actions.count(), "쓰기 요청 0건").toBe(0);
  } finally {
    await context.close();
  }
});

// =====================================================================
// 응답을 기다리는 동안 (본문 자리 표시) — 학교 데이터 비노출
// =====================================================================

// 폭 390 에는 교사·admin 홈에 /cabinets 로 가는 링크가 없다(탭바에도 없다) — 홈에서 넘어가는 흐름은 두 폭 모두 링크가 있는 학생으로 본다.
test(`[N1-ui][S${SCREEN}] 학교A 학생 홈 → ${CABINETS_HREF} 응답 대기 중: 본문에 시약장 이름·시약명·학교명 0 · 자리 표시 안 컴포넌트·글자 0 · 학교명 종류 = distinct_school_names · 응답 뒤 화면 ${SCREEN}`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  const { context, page, viewport } = await openAs(browser, info, "student", HOME_SCREEN);
  try {
    const gate = await installNavGate(page, info);
    await page.goto(routeOf(HOME_SCREEN));
    await expect(page.locator(`main ${sel("home-summary")}`).first()).toBeVisible({ timeout: 45_000 });
    const me = await browserSession(page);
    const db = await dbView(page);
    const words = [...new Set([...db.cabinets.map((c) => c.label), ...db.reagentNames])];
    expect(words.length, "대조: 자기 학교 시약장 이름·시약명").toBeGreaterThan(0);

    // 폭 1440 = nav-pill 의 "시약장 설정" 링크, 폭 390 = 홈 본문의 시약장 링크
    const link = viewport === "desktop" ? page.locator(`${sel("nav-pill")} nav a[href="${CABINETS_HREF}"]`) : page.locator(`main a[href="${CABINETS_HREF}"]`);
    await expect(link, `${CABINETS_HREF} 로 가는 링크`).toHaveCount(1);
    await link.scrollIntoViewIfNeeded();
    await waitHydrated(link);
    await expect.poll(() => gate.prefetched(), { message: `${CABINETS_HREF} 미리 받기`, timeout: 30_000 }).toContain(CABINETS_HREF);

    gate.hold();
    await link.click();
    await expect.poll(() => gate.held(), { message: "전환 요청이 붙잡혔다 (응답 전)", timeout: 30_000 }).toContain(CABINETS_HREF);
    const busy = page.locator(BUSY);
    await expect(busy, "본문 자리 표시 (aria-busy)").toBeVisible({ timeout: 30_000 });
    await expect(busy).toHaveCount(1);
    expect(gate.held(), "여전히 응답 전").toContain(CABINETS_HREF);

    const mainText = await page.locator("main").innerText();
    for (const w of words) expect(mainText, `응답 전 본문에 "${w}"`).not.toContain(w);
    expect(await schoolNamesIn(page.locator("main")), "응답 전 본문에 학교명").toEqual([]);
    expect((await busy.innerText()).trim(), "자리 표시 안 글자").toBe("");
    expect(await componentCounts(busy), "자리 표시 안 컴포넌트").toEqual(Object.fromEntries(ALL_COMPONENTS.map((n) => [n, 0])));
    expect(await busy.locator("a, button, input, select, textarea").count(), "자리 표시 안 조작 요소").toBe(0);
    await expectShell(page, viewport, SCREEN, "응답 전");
    const names = await schoolNamesIn(page.locator("body"));
    expect(names, "응답 전 학교명 종류").toHaveLength(N1.distinct_school_names);
    for (const n of names) expect(me.schoolName, `보이는 학교명 '${n}' 은 자기 학교명의 일부`).toContain(n);

    gate.release();
    await waitCabinets(page);
    expect((await pillLabels(page)).sort(), "응답 뒤: 자기 학교 시약장").toEqual(db.cabinets.map((c) => c.label).sort());
    await expectShell(page, viewport, SCREEN, "응답 뒤");
  } finally {
    await context.close();
  }
});

test(`[N1-ui][S${SCREEN}] 학교A 교사 시약장 전환(pill) 응답 대기 중: 화면에 다른 학교의 학교명·시약장 이름·시약명 0 · 학교명 종류 = distinct_school_names · 자리 표시가 보이면 그 안에 글자·컴포넌트 0 · 응답 뒤 누른 시약장`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  const fx = await otherSchool(info);
  const { context, page, viewport } = await openAs(browser, info, "teacher", SCREEN);
  const actions = watchActions(page);
  try {
    const gate = await installNavGate(page, info);
    await page.goto(CABINETS_HREF);
    await waitCabinets(page);
    const me = await browserSession(page);
    const db = await dbView(page);
    const others = await otherSchools(await ownSchoolId(page));
    expect(others.find((o) => o.id === fx.f.school.id), "대조: 일회용 학교").toBeTruthy();
    const own = await ownStringsOf(page, db, me.schoolName);
    const labels = await pillLabels(page);
    expect(labels.length, "대조: 시약장 2개 이상").toBeGreaterThanOrEqual(2);
    const target = db.cabinets.find((c) => c.label === labels[1])!;

    const pillLink = page.locator(`main ${sel(SWITCHER)} a[href="${withC(target.id)}"]`);
    await waitHydrated(pillLink);
    gate.hold();
    await pillLink.click();
    await expect.poll(() => gate.held(), { message: "전환 요청이 붙잡혔다 (응답 전)", timeout: 30_000 }).toContain(CABINETS_HREF);

    const text = await page.locator("body").innerText();
    const compared = expectNoOtherSchool({ "응답 전 화면": text }, others, own);
    expect(compared[fx.f.school.id], "대조: 일회용 학교 값 비교 수").toBe(4);
    checkSchoolNames(text, me.schoolName, "응답 전 화면");
    const busy = page.locator(BUSY);
    if ((await busy.count()) > 0) {
      expect((await busy.first().innerText()).trim(), "자리 표시 안 글자").toBe("");
      expect(await componentCounts(busy.first()), "자리 표시 안 컴포넌트").toEqual(Object.fromEntries(ALL_COMPONENTS.map((n) => [n, 0])));
    }
    await expectShell(page, viewport, SCREEN, "응답 전");
    expect(gate.held(), "여전히 응답 전").toContain(CABINETS_HREF);

    gate.release();
    await expect.poll(() => new URL(page.url()).searchParams.get("c"), { timeout: 30_000 }).toBe(target.id);
    await waitCabinets(page);
    await expectActive(page, target.label, "응답 뒤");
    await expectHeader(page, target.label, target.door_type, target.shelves, "응답 뒤");
    expectNoOtherSchool({ "응답 뒤 화면": await page.locator("body").innerText() }, others, own);
    expect(actions.count(), "쓰기 요청 0건").toBe(0);
  } finally {
    await context.close();
  }
});
