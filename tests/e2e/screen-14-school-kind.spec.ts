// 화면 14 (/signup) 학교급 (design/rules.json 1.18 neis.school_kinds · school_kind_select · variants 14.no-school,
// harness/d7-data.md §3·§19, harness/d5-gates.md N1-d: 시/도 → 지역 → 학교급 → 학교, 목록은 /api/neis 응답에서만).
// - 가로채기 테스트: /api/neis/* 를 page.route 로 가짜 응답으로 바꿔 화면 목록이 그 응답 그대로인지 본다 (NEIS·서버 호출 없음).
// - 실제 응답 테스트: 서버 /api/neis/schools?kind= 를 학교급마다 부른다 (서버가 NEIS 를 하루 캐시로 중계).
// - 가입 요청(/api/auth/signup)은 모두 가로챈다 — 실제 계정을 만들지 않는다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Page, type Route } from "@playwright/test";
import { routeOf, rules, sel, useProjectViewport, type ViewportName } from "./screen-helpers";
import {
  KIND,
  KINDS,
  NEIS_PREFIX,
  REGION,
  SCHOOL,
  SCREEN,
  SIDO,
  SIGNUP_API,
  expectLocked,
  frameCount,
  jsonList,
  kindSelected,
  kindTab,
  kindTabs,
  optionLabels,
  pickOption,
  selectBox,
  selectOptions,
  waitNeis,
  waitSignupScreen,
} from "./screen-14-helpers";
import { framePath } from "../frames";
import { expectPreLoginShell } from "./pre-login-helpers";

const N1 = rules.never.N1;
const DK = rules.neis.default_kind;
const OTHER_KINDS = KINDS.filter((k) => k !== DK);
const KIND_FIRST = rules.school_kind_select.default.match(/'([^']+)'/)?.[1] ?? "";
const NO_SCHOOL_VARIANT = rules.variants[String(SCREEN)]["no-school"];
/** rules.json school_kind_select.no_school 의 안내 틀 '이 지역에 {학교급}가 없어요 — 지역을 다시 골라 주세요' */
const NO_SCHOOL_TEMPLATE = rules.school_kind_select.no_school.match(/'([^']*\{학교급\}[^']*)'/)?.[1] ?? "";
const noSchoolText = (kind: string) => NO_SCHOOL_TEMPLATE.replace("{학교급}", kind);
/** d7 §19 "화면 14" 행 (디자인 1.21 맞춤) */
const D7_S14 =
  readFileSync(join(process.cwd(), "harness", "d7-data.md"), "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("| 화면 14 |") && l.includes("school-select-kind")) ?? "";

type NeisSchool = { name: string; sido: string; region: string; neis_code: string; office_code: string; kind: string };

// ---------- 시안 프레임 글자 ----------
type FrameNode = { name: string; path: string[]; text: { characters: string } | null };
type FrameFile = { frames: { name: string; nodes: FrameNode[] }[] };
function frameNodes(file: string): FrameNode[] {
  const f = JSON.parse(readFileSync(framePath(`${file}`), "utf8")) as FrameFile;
  const frame = f.frames.find((x) => x.name === file);
  if (!frame) throw new Error(`design/frames/${file}.json 에 프레임 ${file} 없음`);
  return frame.nodes;
}
function frameText(file: string, name: string, inside?: string): string {
  const n = frameNodes(file).find((x) => x.name === name && x.text && (!inside || x.path.includes(inside)));
  if (!n?.text) throw new Error(`${file} 에 글자 노드 ${name}${inside ? ` (${inside} 안)` : ""} 없음`);
  return n.text.characters;
}

// ---------- 가짜 /api/neis ----------
const F_SIDO = ["가짜도", "나짜도"];
const F_REGIONS: Record<string, string[]> = { 가짜도: ["가짜시", "나짜군"], 나짜도: ["다짜시"] };
const [FA, FB] = F_SIDO;
const [FA1, FA2] = F_REGIONS[FA];

function fakeSchool(kind: string, sido: string, region: string, prefix: string, n: number): NeisSchool {
  const ki = KINDS.indexOf(kind);
  return { name: `${prefix}${kind}`, sido, region, neis_code: `E2EF${ki}${n}${sido === FA ? 1 : 2}`, office_code: "E2E", kind };
}
/** (시/도, 지역, 학교급) → 가짜 학교. empty 학교급은 0개 */
function fakeSchools(sido: string, region: string, kind: string, empty: string[]): NeisSchool[] {
  if (empty.includes(kind)) return [];
  const base = region === FA1 ? ["가나", "가다", "나라", "청람"] : ["라마"];
  return base.map((p, i) => fakeSchool(kind, sido, region, `${p}${region === FA1 ? "" : region}`, i + 1));
}

type NeisLog = { path: string; params: URLSearchParams };
type FakeNeis = { log: NeisLog[]; held: Route[]; releaseHeld: () => Promise<void> };

/**
 * /api/neis/* 를 모두 가로채 가짜 응답을 준다 (서버·NEIS 에 닿지 않음).
 * hold: 학교 목록 응답을 붙잡아 두었다가 releaseHeld 때 보낸다 (불러오는 중 상태 확인용).
 */
async function fakeNeis(page: Page, opts: { empty?: string[]; hold?: boolean } = {}): Promise<FakeNeis> {
  const empty = opts.empty ?? [];
  const out: FakeNeis = {
    log: [],
    held: [],
    releaseHeld: async () => {
      const h = out.held.splice(0);
      for (const r of h) await answer(r);
    },
  };
  const answer = async (route: Route) => {
    const u = new URL(route.request().url());
    const p = u.searchParams;
    let body: unknown;
    if (u.pathname === NEIS_PREFIX + "sido") body = { sido: F_SIDO };
    else if (u.pathname === NEIS_PREFIX + "regions") body = { sido: p.get("sido"), regions: F_REGIONS[p.get("sido") ?? ""] ?? [] };
    else if (u.pathname === NEIS_PREFIX + "schools") {
      const [s, r, k] = [p.get("sido") ?? "", p.get("region") ?? "", p.get("kind") ?? ""];
      if (!KINDS.includes(k)) return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "kind" }) });
      body = { sido: s, region: r, kind: k, schools: fakeSchools(s, r, k, empty) };
    } else return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  };
  await page.route(
    (url) => url.pathname.startsWith(NEIS_PREFIX),
    async (route) => {
      const u = new URL(route.request().url());
      out.log.push({ path: u.pathname.slice(NEIS_PREFIX.length), params: u.searchParams });
      if (opts.hold && u.pathname === NEIS_PREFIX + "schools") {
        out.held.push(route);
        return;
      }
      await answer(route);
    },
  );
  return out;
}

const schoolLogs = (f: FakeNeis) => f.log.filter((l) => l.path === "schools");

/** 가짜 목록으로 시/도·지역까지 고른다 */
async function pickSidoRegion(page: Page, sido = FA, region = FA1): Promise<void> {
  await page.goto(routeOf(SCREEN));
  await waitSignupScreen(page);
  await selectBox(page, SIDO).click();
  await pickOption(page, SIDO, sido);
  await expect(selectBox(page, REGION)).toBeEnabled();
  await selectBox(page, REGION).click();
  await pickOption(page, REGION, region);
  await expect(selectBox(page, REGION)).toContainText(region);
}

/** 학교급 칸을 누르고 그 학교급의 학교 목록 요청을 기다린다 */
async function chooseKind(page: Page, kind: string): Promise<void> {
  await kindTab(page, kind).click();
  await expect(kindSelected(page)).toHaveText(kind);
}

async function chooseSchool(page: Page, name: string): Promise<void> {
  await expect(selectBox(page, SCHOOL)).toBeEnabled();
  await selectBox(page, SCHOOL).click();
  await pickOption(page, SCHOOL, name);
  await expect(selectBox(page, SCHOOL)).toContainText(name);
}

async function fillAccount(page: Page): Promise<void> {
  const password = "e2e-Intercept-1234";
  await page.locator('input[name="displayName"]').fill("e2e 가로챔");
  await page.locator('input[name="email"]').fill(`e2e-kind-${Date.now()}@example.com`);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="passwordConfirm"]').fill(password);
  const boxes = page.locator('form input[type="checkbox"]');
  const n = await boxes.count();
  expect(n, "약관 체크박스").toBeGreaterThan(0);
  for (let i = 0; i < n; i++) await boxes.nth(i).check({ force: true });
}

const isAchromatic = (rgb: string) => {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return !!m && m[1] === m[2] && m[2] === m[3];
};

// ======================================================================
// N1-d
// ======================================================================

test(`[N1-d][S${SCREEN}] 목록 = /api/neis 응답만: 가로챈 가짜 응답이 시/도·지역·학교 목록에 그대로 · 학교급 칸마다 schools?kind= 요청 (${KINDS.join("·")})`, async ({ page }, info) => {
  test.setTimeout(120_000);
  await useProjectViewport(page, info);
  const fake = await fakeNeis(page, { empty: [] });
  const external: string[] = [];
  page.on("request", (r) => {
    if (/neis\.go\.kr$/i.test(new URL(r.url()).hostname)) external.push(r.url());
  });

  await page.goto(routeOf(SCREEN));
  await waitSignupScreen(page);
  await selectBox(page, SIDO).click();
  expect(await optionLabels(page, SIDO), "시/도 = 가짜 /api/neis/sido 응답").toEqual(F_SIDO);
  await pickOption(page, SIDO, FA);
  await expect(selectBox(page, REGION)).toBeEnabled();
  await selectBox(page, REGION).click();
  expect(await optionLabels(page, REGION), "지역 = 가짜 /api/neis/regions 응답").toEqual(F_REGIONS[FA]);
  await pickOption(page, REGION, FA1);
  expect(schoolLogs(fake), "학교급 고르기 전 학교 요청").toEqual([]);

  for (const k of KINDS) {
    const before = schoolLogs(fake).length;
    await chooseKind(page, k);
    await expect.poll(() => schoolLogs(fake).length, { message: `${k} 학교 요청` }).toBe(before + 1);
    const q = schoolLogs(fake).at(-1)!.params;
    expect([q.get("sido"), q.get("region"), q.get("kind")], `${k} 쿼리`).toEqual([FA, FA1, k]);
    await expect(selectBox(page, SCHOOL)).toBeEnabled();
    await selectBox(page, SCHOOL).click();
    expect(await optionLabels(page, SCHOOL), `${k} 학교 = 가짜 응답`).toEqual(fakeSchools(FA, FA1, k, []).map((s) => s.name));
    await page.keyboard.press("Escape");
    await expect(selectOptions(page, SCHOOL)).toHaveCount(0);
  }
  expect(fake.log.map((l) => l.path), "가로챈 요청 종류").toEqual(["sido", "regions", ...KINDS.map(() => "schools")]);
  expect(external, "브라우저에서 NEIS 직접 호출").toEqual([]);
});

test(`[N1-d][S${SCREEN}] 실제 /api/neis/schools: 학교급마다 kind 쿼리 · 응답 학교 모두 그 학교급·고른 시/도·지역 · 화면 목록 = 응답`, async ({ page }, info) => {
  test.setTimeout(150_000);
  await useProjectViewport(page, info);
  const sidoRes = waitNeis(page, "sido");
  await page.goto(routeOf(SCREEN));
  await waitSignupScreen(page);
  await sidoRes;
  const regionRes = waitNeis(page, "regions");
  await selectBox(page, SIDO).click();
  await pickOption(page, SIDO, rules.neis.default_sido);
  await regionRes;
  await expect(selectBox(page, REGION)).toBeEnabled();
  await selectBox(page, REGION).click();
  await pickOption(page, REGION, rules.neis.default_region);

  const codes = new Set<string>();
  for (const k of KINDS) {
    const res = waitNeis(page, "schools");
    await chooseKind(page, k);
    const r = await res;
    const q = new URL(r.url()).searchParams;
    expect([q.get("sido"), q.get("region"), q.get("kind")], `${k} 쿼리`).toEqual([rules.neis.default_sido, rules.neis.default_region, k]);
    const body = (await r.json()) as { kind?: string };
    expect(body.kind, `${k} 응답 kind`).toBe(k);
    const schools = await jsonList<NeisSchool>(r, "schools");
    expect(schools.length, `${rules.neis.default_sido} ${rules.neis.default_region} ${k} 응답`).toBeGreaterThan(0);
    for (const s of schools) {
      expect(s.kind, `${s.name} 학교급`).toBe(k);
      expect([s.sido, s.region], `${s.name} 시/도·지역`).toEqual([rules.neis.default_sido, rules.neis.default_region]);
      expect(codes.has(s.neis_code), `학교 코드 ${s.neis_code} 가 다른 학교급에도`).toBe(false);
      codes.add(s.neis_code);
    }
    await expect(selectBox(page, SCHOOL)).toBeEnabled();
    await selectBox(page, SCHOOL).click();
    expect(await optionLabels(page, SCHOOL), `${k} 화면 목록 = 응답`).toEqual(schools.map((s) => s.name));
    await page.keyboard.press("Escape");
    await expect(selectOptions(page, SCHOOL)).toHaveCount(0);
  }
});

test(`[N1-d][S${SCREEN}] /api/neis/schools: kind 없음·빈 값·${KINDS.length}종 밖 → 400 (sido·region 있어도), sido·region 없음 → 400`, async ({ request }) => {
  const base = { sido: rules.neis.default_sido, region: rules.neis.default_region };
  const url = (q: Record<string, string>) => `${NEIS_PREFIX}schools?${new URLSearchParams(q)}`;
  const bad: [string, Record<string, string>][] = [
    ["kind 없음", base],
    ["kind 빈 값", { ...base, kind: "" }],
    ["kind 공백", { ...base, kind: "  " }],
    ["kind 특수학교", { ...base, kind: "특수학교" }],
    ["kind 각종학교", { ...base, kind: "각종학교" }],
    ["kind 줄임말", { ...base, kind: DK.slice(0, 2) }],
    ["kind 두 학교급 이어 붙임", { ...base, kind: KINDS.join(",") }],
    ["kind 영문", { ...base, kind: "high" }],
    ["sido 없음", { region: base.region, kind: DK }],
    ["region 없음", { sido: base.sido, kind: DK }],
  ];
  for (const [what, q] of bad) {
    const res = await request.get(url(q), { failOnStatusCode: false });
    expect(res.status(), `${what}: HTTP`).toBe(400);
    const body = (await res.json()) as { error?: string; schools?: unknown };
    expect(typeof body.error === "string" && body.error.length > 0, `${what}: 오류 문구`).toBe(true);
    expect(body.schools, `${what}: 학교 목록 없음`).toBeUndefined();
  }
  // kind 를 두 번 보내면 첫 값만 본다 — 3종 밖 값이 앞이면 400
  const dup = await request.get(`${NEIS_PREFIX}schools?${new URLSearchParams([...Object.entries(base), ["kind", "특수학교"], ["kind", DK]])}`, { failOnStatusCode: false });
  expect(dup.status(), "kind 중복(3종 밖이 앞)").toBe(400);
});

test(`[N2][S${SCREEN}] /api/neis/schools 400·200 응답에 NEIS 키·요청 URL 없음`, async ({ request }) => {
  const key = process.env.NEIS_API_KEY ?? "";
  const q = new URLSearchParams({ sido: rules.neis.default_sido, region: rules.neis.default_region });
  const res400 = await request.get(`${NEIS_PREFIX}schools?${q}&kind=${encodeURIComponent("특수학교")}`, { failOnStatusCode: false });
  const res200 = await request.get(`${NEIS_PREFIX}schools?${q}&kind=${encodeURIComponent(DK)}`, { failOnStatusCode: false });
  expect(res400.status()).toBe(400);
  expect(res200.status()).toBe(200);
  for (const [what, res] of [["400", res400], ["200", res200]] as const) {
    const text = await res.text();
    if (key) expect(text.includes(key), `${what} 응답에 NEIS 키 값 포함 여부`).toBe(false);
    expect(/KEY=|open\.neis\.go\.kr/i.test(text), `${what} 응답에 NEIS 요청 URL`).toBe(false);
    const headers = JSON.stringify(res.headersArray());
    if (key) expect(headers.includes(key), `${what} 헤더에 NEIS 키 값 포함 여부`).toBe(false);
  }
});

// ======================================================================
// C1
// ======================================================================

test(`[C1][S${SCREEN}] school-select-kind: ${KIND} 1개 · 칸 = rules.json neis.school_kinds 순서 · 라벨 학교급·필수(시안) · 기본값 없음 · 지역 전 잠김`, async ({ page }, info) => {
  test.setTimeout(90_000);
  const vp = await useProjectViewport(page, info);
  await fakeNeis(page);
  await page.goto(routeOf(SCREEN));
  await waitSignupScreen(page);

  const box = page.locator(sel(KIND));
  await expect(box, KIND).toHaveCount(frameCount(SCREEN, vp, KIND));
  await expect(box).toHaveCount(1);
  await expect(box.locator(sel("segmented-control")), "segmented-control").toHaveCount(1);
  await expect(kindTabs(page), "칸 수 = school_kinds").toHaveCount(KINDS.length);
  expect((await kindTabs(page).allTextContents()).map((t) => t.trim()), "칸 순서").toEqual(KINDS);
  // 시안 field-label-row: 라벨 "학교급" + "필수"
  const label = frameText(`${SCREEN}-${vp}`, "field-label", KIND);
  const required = frameText(`${SCREEN}-${vp}`, "field-required", KIND);
  await expect(box, "라벨").toContainText(label);
  await expect(box, "필수 표시").toContainText(required);
  // 기본값 없음 (rules.json school_kind_select.default) — 선택된 칸·흰 칸 0
  await expect(kindSelected(page), "선택된 학교급").toHaveCount(0);
  await expect(box.locator(sel("segmented-control-active")), "segmented-control-active").toHaveCount(0);
  for (const k of KINDS) await expect(kindTab(page, k), `지역 전 ${k} 비활성`).toBeDisabled();

  // 단계 표시 = 학교 선택 단계 수 (시안 step-bar 개수)
  const bar = page.locator(`${sel("ex-auth-form-card")} [role="progressbar"]`);
  await expect(bar).toHaveAttribute("aria-valuemax", String(N1.school_select_levels.length));
  expect(frameCount(SCREEN, vp, "step-bar"), "시안 step-bar 수 = 단계 수").toBe(N1.school_select_levels.length);
  await expect(bar).toHaveAttribute("aria-valuenow", "0");

  await selectBox(page, SIDO).click();
  await pickOption(page, SIDO, FA);
  await expect(bar).toHaveAttribute("aria-valuenow", "1");
  for (const k of KINDS) await expect(kindTab(page, k), `지역 전 ${k} 비활성`).toBeDisabled();
  await expect(selectBox(page, REGION)).toBeEnabled();
  await selectBox(page, REGION).click();
  await pickOption(page, REGION, FA1);
  await expect(bar).toHaveAttribute("aria-valuenow", "2");
  for (const k of KINDS) await expect(kindTab(page, k), `지역 뒤 ${k} 활성`).toBeEnabled();
  await expect(kindSelected(page), "지역을 골라도 학교급 자동 선택 없음").toHaveCount(0);
  await expectLocked(page, SCHOOL);
  await expect(selectBox(page, SCHOOL), "학교급 전 학교 칸 안내").toContainText(KIND_FIRST);

  await chooseKind(page, DK);
  await expect(bar).toHaveAttribute("aria-valuenow", "3");
  await expect(box.locator(sel("segmented-control-active")), "고른 칸 1개").toHaveCount(1);
  await expect(box.locator(sel("segmented-control-active"))).toHaveText(DK);
  await chooseSchool(page, fakeSchools(FA, FA1, DK, [])[0].name);
  await expect(bar).toHaveAttribute("aria-valuenow", "4");
});

test(`[C1][S${SCREEN}] 학교급을 바꾸면 학교 비움 · 지역을 바꾸면 학교 비움(학교급 유지) · 시/도를 바꾸면 지역·학교 비움(학교급 유지·잠김)`, async ({ page }, info) => {
  test.setTimeout(90_000);
  await useProjectViewport(page, info);
  const fake = await fakeNeis(page);
  await pickSidoRegion(page);

  const [k1, k2] = [DK, OTHER_KINDS[0]];
  await chooseKind(page, k1);
  const s1 = fakeSchools(FA, FA1, k1, [])[0].name;
  await chooseSchool(page, s1);

  // 학교급 변경 → 학교 비움, 새 학교급 목록
  await chooseKind(page, k2);
  await expect(selectBox(page, SCHOOL), "학교급 변경 후 학교 비움").not.toContainText(s1);
  await expect(selectBox(page, SCHOOL)).toBeEnabled();
  await selectBox(page, SCHOOL).click();
  expect(await optionLabels(page, SCHOOL)).toEqual(fakeSchools(FA, FA1, k2, []).map((s) => s.name));
  await expect(page.locator(`${sel(SCHOOL)} [role=option][aria-selected="true"]`), "선택된 학교 없음").toHaveCount(0);
  const s2 = fakeSchools(FA, FA1, k2, [])[1].name;
  await pickOption(page, SCHOOL, s2);
  await expect(selectBox(page, SCHOOL)).toContainText(s2);

  // 지역 변경 → 학교 비움, 학교급 유지, 새 지역·같은 학교급으로 요청
  await selectBox(page, REGION).click();
  await pickOption(page, REGION, FA2);
  await expect(selectBox(page, SCHOOL), "지역 변경 후 학교 비움").not.toContainText(s2);
  await expect(kindSelected(page), "지역 변경 후 학교급 유지").toHaveText(k2);
  await expect.poll(() => schoolLogs(fake).at(-1)?.params.get("region")).toBe(FA2);
  expect(schoolLogs(fake).at(-1)!.params.get("kind")).toBe(k2);
  const s3 = fakeSchools(FA, FA2, k2, [])[0].name;
  await chooseSchool(page, s3);

  // 시/도 변경 → 지역·학교 비움, 학교급은 유지하지만 지역 전이라 잠김
  await selectBox(page, SIDO).click();
  await pickOption(page, SIDO, FB);
  await expect(selectBox(page, REGION), "시/도 변경 후 지역 비움").not.toContainText(FA2);
  await expect(selectBox(page, SCHOOL), "시/도 변경 후 학교 비움").not.toContainText(s3);
  await expectLocked(page, SCHOOL);
  await expect(kindSelected(page), "시/도 변경 후 학교급 유지").toHaveText(k2);
  for (const k of KINDS) await expect(kindTab(page, k), `시/도 변경 후 ${k} 잠김`).toBeDisabled();
  // 새 지역을 고르면 남아 있던 학교급으로 바로 요청
  await expect(selectBox(page, REGION)).toBeEnabled();
  await selectBox(page, REGION).click();
  await pickOption(page, REGION, F_REGIONS[FB][0]);
  await expect.poll(() => schoolLogs(fake).at(-1)?.params.get("sido")).toBe(FB);
  expect(schoolLogs(fake).at(-1)!.params.get("kind")).toBe(k2);
});

test(`[C1][S${SCREEN}] 기대값 원본 (디자인 1.21 맞춤): 학교 0개 안내 = rules.json school_kind_select.no_school '{학교급}가 없어요' = d7 §19 화면 14 = 시안 14-no-school(${DK})`, () => {
  expect(NO_SCHOOL_TEMPLATE, "rules.json no_school 안내 틀").toBe("이 지역에 {학교급}가 없어요 — 지역을 다시 골라 주세요");
  expect(D7_S14, "d7 §19 화면 14 행").not.toBe("");
  expect(D7_S14, "d7 §19 안내 = rules 틀 (1.21 맞춤)").toContain(`"${NO_SCHOOL_TEMPLATE}"(디자인 1.21 맞춤)`);
  for (const vp of ["mobile", "desktop"] as const) {
    expect(frameText(`${SCREEN}-no-school-${vp}`, "note-text"), `시안 14-no-school-${vp} = rules 틀(${DK})`).toBe(noSchoolText(DK));
  }
  for (const k of KINDS) expect(noSchoolText(k), `${k}: 학교급 이름 + "가 없어요"`).toContain(`이 지역에 ${k}가 없어요`);
});

for (const emptyKind of [DK, OTHER_KINDS[0]]) {
  test(`[C1][S${SCREEN}] 14-no-school (${emptyKind} 0개, 가로챈 빈 응답): 학교 칸 자리에 무채색 안내(시안 note-text) · 선택 상자 없음 · variants ${SCREEN}.no-school 컴포넌트 · 불러오는 중엔 안내 없음`, async ({ page }, info) => {
    test.setTimeout(90_000);
    const vp = await useProjectViewport(page, info);
    const fake = await fakeNeis(page, { empty: [emptyKind], hold: true });
    await pickSidoRegion(page);

    // 시안 14-no-school 의 안내 문구 (시안은 rules.json default_kind 기준 — 다른 학교급은 그 이름만 바뀐다)
    const frameNote = frameText(`${SCREEN}-no-school-${vp}`, "note-text");
    expect(frameNote, "시안 안내 문구에 default_kind").toContain(DK);
    const want = frameNote.replace(DK, emptyKind);
    expect(want, "d7 §19 · rules.json no_school '{학교급}가 없어요' (1.21)").toBe(noSchoolText(emptyKind));

    await chooseKind(page, emptyKind);
    await expect.poll(() => fake.held.length, { message: "학교 요청 붙잡음" }).toBe(1);
    // 불러오는 중: 0개 안내를 미리 띄우지 않는다
    const school = page.locator(sel(SCHOOL));
    await expect(school, "불러오는 중 안내 없음").not.toContainText(want);
    await expect(selectBox(page, SCHOOL), "불러오는 중 선택 상자").toHaveCount(1);
    await fake.releaseHeld();

    await expect(school, "0개 안내").toContainText(want);
    await expect(selectBox(page, SCHOOL), "0개 → 선택 상자 대신 안내").toHaveCount(0);
    await expect(selectOptions(page, SCHOOL)).toHaveCount(0);
    for (const n of NO_SCHOOL_VARIANT) expect(await page.locator(sel(n)).count(), `variants ${SCREEN}.no-school ${n}`).toBeGreaterThanOrEqual(1);
    // 학교급은 그대로, 다시 고를 수 있다
    await expect(kindSelected(page)).toHaveText(emptyKind);
    for (const k of KINDS) await expect(kindTab(page, k)).toBeEnabled();

    // 무채색 (시안 no-school-note: 회색 바탕·검정 글자)
    const note = school.locator('[role="status"]');
    await expect(note).toHaveCount(1);
    await expect(note).toHaveText(want);
    // 새 프레임 14-no-school-{폭} 셸 (run d): 1440 = web-header 1 · nav-pill·app-sidebar 0 · 소개 패널 feature-card = 시안 / 390 = nav-pill 그대로
    await expectPreLoginShell(page, SCREEN, vp, "14-no-school");
    await expect(page.locator(sel("feature-card")), `feature-card = 시안 ${SCREEN}-no-school-${vp}`).toHaveCount(
      frameNodes(`${SCREEN}-no-school-${vp}`).filter((n) => n.name === "feature-card").length,
    );
    const colors = await note.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { color: cs.color, bg: cs.backgroundColor };
    });
    expect(isAchromatic(colors.color), `안내 글자색 ${colors.color}`).toBe(true);
    expect(isAchromatic(colors.bg), `안내 바탕색 ${colors.bg}`).toBe(true);

    await page.screenshot({ path: join(process.cwd(), "test-results", `v1-${SCREEN}-no-school-${emptyKind === DK ? "" : "other-"}${vp}.png`), fullPage: true });

    // 학교가 있는 학교급으로 바꾸면 안내가 사라지고 선택 상자가 돌아온다
    const other = KINDS.find((k) => k !== emptyKind)!;
    await chooseKind(page, other);
    await expect.poll(() => fake.held.length).toBe(1);
    await fake.releaseHeld();
    await expect(school).not.toContainText(want);
    await expect(selectBox(page, SCHOOL)).toBeEnabled();
  });
}

test(`[C1][S${SCREEN}] 학교 시트(모바일 하단)·드롭다운(데스크톱 상자 아래): 맥락 한 줄(시안 sheet-context 형식) · 학교 이름 검색 · 줄 아래 시/도 지역`, async ({ page }, info) => {
  test.setTimeout(90_000);
  const vp: ViewportName = await useProjectViewport(page, info);
  await fakeNeis(page);
  await pickSidoRegion(page);
  await chooseKind(page, DK);
  const all = fakeSchools(FA, FA1, DK, []);

  await expect(selectBox(page, SCHOOL)).toBeEnabled();
  await selectBox(page, SCHOOL).click();
  const sheet = page.locator(`${sel(SCHOOL)} [role="dialog"]`);
  await expect(sheet).toBeVisible();
  await expect(selectBox(page, SCHOOL)).toHaveAttribute("aria-expanded", "true");

  // 맥락 한 줄: 시안 "충청북도 청주시 · 고등학교 38곳" 형식 = "{시/도} {지역} · {학교급} {n}곳"
  const ctxFrame = frameText(`${SCREEN}-${vp}`, "sheet-context");
  expect(ctxFrame, "시안 맥락 형식").toBe(`${rules.neis.default_sido} ${rules.neis.default_region} · ${DK} ${ctxFrame.match(/(\d+)곳$/)?.[1]}곳`);
  await expect(sheet, "맥락 한 줄").toContainText(`${FA} ${FA1} · ${DK} ${all.length}곳`);

  // 검색 칸 (시안 sheet-search placeholder)
  const search = sheet.locator('input[type="search"]');
  await expect(search).toHaveCount(1);
  await expect(search).toHaveAttribute("placeholder", frameText(`${SCREEN}-${vp}`, "placeholder", "sheet-search"));
  await expect(search, "열면 검색 칸에 초점").toBeFocused();

  // 줄 = 학교 이름, 아래 회색 "시/도 지역" (data-sub)
  expect(await optionLabels(page, SCHOOL)).toEqual(all.map((s) => s.name));
  for (const s of all) {
    await expect(selectOptions(page, SCHOOL).filter({ hasText: s.name }), `${s.name} 아래 줄`).toHaveAttribute("data-sub", `${s.sido} ${s.region}`);
  }

  // 이름 검색 — 부분 일치만 남는다
  const q = all[0].name.slice(0, 1);
  await search.fill(q);
  const hits = all.filter((s) => s.name.includes(q)).map((s) => s.name);
  expect(hits.length, "검색 결과가 일부만이어야 의미 있음").toBeLessThan(all.length);
  await expect.poll(() => optionLabels(page, SCHOOL)).toEqual(hits);
  await search.fill("없는이름xyz");
  await expect(selectOptions(page, SCHOOL), "검색 0건").toHaveCount(0);
  await expect(sheet, "검색 0건 안내").toContainText("없어요");
  await search.fill(all[2].name);
  await expect.poll(() => optionLabels(page, SCHOOL)).toEqual([all[2].name]);

  // 위치: 모바일 = 화면 아래 붙은 시트(가로 전체), 데스크톱 = 선택 상자 바로 아래, 상자 폭
  const vpSize = page.viewportSize()!;
  const sb = (await sheet.boundingBox())!;
  const bb = (await selectBox(page, SCHOOL).boundingBox())!;
  if (vp === "mobile") {
    expect(Math.round(sb.y + sb.height), "시트 아래 = 화면 아래").toBe(vpSize.height);
    expect(Math.round(sb.width), "시트 폭 = 화면 폭").toBe(vpSize.width);
    await expect(sheet.getByRole("button", { name: /닫기/ }), "× 닫기").toBeVisible();
  } else {
    expect(sb.y, "드롭다운은 상자 아래").toBeGreaterThanOrEqual(bb.y + bb.height);
    expect(Math.abs(sb.x - bb.x), "드롭다운 왼쪽 = 상자 왼쪽").toBeLessThanOrEqual(1);
    expect(Math.abs(sb.width - bb.width), "드롭다운 폭 = 상자 폭").toBeLessThanOrEqual(1);
    await expect(sheet.getByRole("button", { name: /닫기/ }), "데스크톱은 × 없음").toBeHidden();
  }

  // 고르면 닫히고 상자에 이름
  await selectOptions(page, SCHOOL).first().click();
  await expect(sheet).toHaveCount(0);
  await expect(selectBox(page, SCHOOL)).toContainText(all[2].name);
  // 다시 열면 검색어는 비워져 전체 목록
  await selectBox(page, SCHOOL).click();
  await expect(search).toHaveValue("");
  expect(await optionLabels(page, SCHOOL)).toEqual(all.map((s) => s.name));
  if (vp === "mobile") await sheet.getByRole("button", { name: /닫기/ }).click();
  else await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(selectBox(page, SCHOOL), "닫아도 고른 학교 유지").toContainText(all[2].name);
});

test(`[C1][S${SCREEN}] 가입 제출 본문 neisCode = 고른 학교 코드 (학교급을 바꾸면 이전 학교 코드로 제출되지 않음) · 학교급 필드 미전송`, async ({ page }, info) => {
  test.setTimeout(90_000);
  await useProjectViewport(page, info);
  await fakeNeis(page);
  const bodies: Record<string, unknown>[] = [];
  await page.route(`**${SIGNUP_API}`, async (route) => {
    bodies.push(JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>);
    await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ ok: false, error: "e2e 가로챔" }) });
  });
  await pickSidoRegion(page);
  await chooseKind(page, DK);
  const first = fakeSchools(FA, FA1, DK, [])[0];
  await chooseSchool(page, first.name);
  await fillAccount(page);

  // 다른 학교급으로 바꾸면 학교가 비어 제출이 막힌다 (요청 0)
  const k2 = OTHER_KINDS[0];
  await chooseKind(page, k2);
  const submit = page.locator('form button[type="submit"]');
  await submit.click();
  await expect(page.locator('form [role="alert"]'), "학교 빈 채 제출 안내").toBeVisible();
  await page.waitForTimeout(500);
  expect(bodies.length, "학교 비었을 때 가입 요청").toBe(0);

  // 새 학교급의 학교를 고르면 그 코드로 제출
  const chosen = fakeSchools(FA, FA1, k2, [])[1];
  await chooseSchool(page, chosen.name);
  await submit.click();
  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0].neisCode, "neisCode = 고른 학교 코드").toBe(chosen.neis_code);
  expect(bodies[0].neisCode, "이전 학교 코드 아님").not.toBe(first.neis_code);
  const extra = Object.keys(bodies[0]).filter((k) => /kind|school|sido|region/i.test(k));
  expect(extra, "학교급·학교 관련 추가 필드").toEqual([]);
  expect(JSON.stringify(bodies[0]), "본문에 학교급 이름").not.toContain(k2);
});
