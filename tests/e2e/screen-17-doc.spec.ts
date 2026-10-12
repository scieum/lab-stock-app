// 화면 17 센서 서류로 등록 (d7 §28 "센서 서류로 등록" · "센서 확인 표" · "센서 서류 저장 DB", design/rules.json 1.28 sensor.add_mobile · doc ·
// roles R5 · guest, dev-rules routes 17-doc, 시안 17-mobile · 17-desktop · 17-doc-upload · 17-doc-review · 17-doc-fail) — 화면 연결(D3), 두 폭.
// - 진입: 1440 머리 sensor-doc-add '서류로 등록'(button-outline) + '센서 등록' / 390 '등록' → 시트 '서류로 등록'(caption) · '직접 입력'.
// - /sensors/doc: doc-upload → AI로 읽기(처리 중) → doc-intake-table 확인 표 "읽은 센서 N개" · sensor-link(기존 센서에 더하기 · 지금 a개 → b개 /
//   새 센서로 등록 + new-sensor-fields 펼침) · "센서 아님 N개" 접힘(펼쳐 "센서로 넣기") · "확인 후 등록 · N개" → record_sensor_document →
//   토스트 "센서 N개를 등록했어요" → 화면 17, 바뀐 행 highlight-soft. 0개 · 실패 = 17-doc-fail 모양.
// - 학생 /sensors/doc → /?denied=staff 토스트. 둘러보기 sensor-doc-add 0.
// 실제 Gemini 를 부르지 않는다: POST /api/sensors/extract 는 테스트가 가로채 응답한다. 저장은 일회용 학교 교사로만(서버 액션 → DB 함수).
import { test, expect, type Locator, type Page, type Route, type TestInfo } from "@playwright/test";
import { openAs } from "./auth-state";
import { DOC_PDF, pickFile, waitUpload } from "./doc-intake-helpers";
import { newFrame } from "./desk-helpers";
import { openGuest, waitGuestShell } from "./guest-helpers";
import { devRules, routeOf, rules, sel } from "./screen-helpers";
import { HAS_SERVICE, openTemp } from "./screen-8-helpers";
import {
  NO_SENSOR_RESIDUE,
  STATUS_OK,
  cleanupSensors,
  liveSensors,
  rowNamed,
  sensorFixture,
  sensorRow,
  sharedSensorSnapshot,
  waitSensorList,
  type SensorFixture,
} from "./sensor-helpers";
import {
  ADD_MOBILE_LABEL,
  DIRECT,
  DOC_ENTRY,
  DOC_ENTRY_CAPTION,
  DOC_FRAME,
  DOC_ROUTE,
  DOC_TEXT,
  HIGHLIGHT_SOFT,
  NO_ACCESS,
  R,
  SENSOR_EXTRACT_API,
  exact,
  loose,
  looseIn,
  menuButton,
  type SensorDocItemBody,
} from "./d7-28-helpers";

test.describe.configure({ mode: "default" });

const SCREEN = 17;
const GROUP = "s17doc";
const LIST = routeOf(SCREEN);
const NEW_PATH = `${LIST}/new`;
/** rules sensor.doc.review "데스크톱 data-table 열 품명 · 회사 · 모델 · 수량 · 연결" */
const REVIEW_COLUMNS = ((/data-table 열 (.+?), 모바일/.exec(R.sensor.doc.review) ?? [])[1] ?? "").split(" · ").map((s) => s.trim());
/** 시안 17-desktop 머리 버튼 글자 */
const DESK_DOC_ADD = newFrame("17-desktop").find((n) => n.text && n.path.includes("sensor-doc-add"))?.text?.characters ?? "";
const DESK_ADD = newFrame("17-desktop").find((n) => n.text && n.path.includes("sensor-add"))?.text?.characters ?? "";

// ---------------------------------------------------------------- 가로채기 · 화면 요소

type Reply = { status?: number; body: unknown; delayMs?: number };
type Calls = { n: number; types: string[] };
async function interceptSensorExtract(page: Page, reply: () => Reply): Promise<Calls> {
  const calls: Calls = { n: 0, types: [] };
  await page.route(
    (u) => u.pathname === SENSOR_EXTRACT_API,
    async (route: Route) => {
      calls.n += 1;
      calls.types.push((route.request().headers()["content-type"] ?? "").split(";")[0]);
      const r = reply();
      if (r.delayMs) await new Promise((res) => setTimeout(res, r.delayMs));
      await route.fulfill({ status: r.status ?? 200, contentType: "application/json", body: JSON.stringify(r.body) }).catch(() => undefined);
    },
  );
  return calls;
}
const item = (name: string, maker: string | null, model: string | null, quantity: number, type: string | null, isSensor = true): SensorDocItemBody => ({
  name,
  originalName: null,
  maker,
  model,
  quantity,
  isSensor,
  type,
});

const upload = (page: Page) => page.locator(`main ${sel("doc-upload")}`);
/** "AI로 읽기" — 390 = doc-upload 안 / 1440 = 아래 고정 bottom-bar */
const readButton = (page: Page) =>
  page.locator(`main ${sel("doc-upload")} ${sel("button-primary")}, main [data-name="bottom-bar"] ${sel("button-primary")}`).filter({ hasText: exact(DOC_TEXT.read) });
const table = (page: Page) => page.locator(`main ${sel("doc-intake-table")}`);
const links = (page: Page) => table(page).locator(sel("sensor-link"));
const saveButton = (page: Page) => page.locator(`main ${sel("button-primary")}`).filter({ hasText: /^\s*확인 후 등록/ });

async function readDoc(page: Page): Promise<void> {
  await waitUpload(page);
  await pickFile(page, DOC_PDF);
  await expect(readButton(page), `'${DOC_TEXT.read}' 활성`).toBeEnabled();
  await readButton(page).click();
}

// ---------------------------------------------------------------- 일회용 학교

let fx: Promise<SensorFixture> | null = null;
function fixture(info: TestInfo): Promise<SensorFixture> {
  fx ??= sensorFixture(info, GROUP, true);
  fx.catch(() => (fx = null));
  return fx;
}
let sharedBefore: string[] | null = null;
test.beforeAll(async ({}, info) => {
  info.setTimeout(120_000);
  if (HAS_SERVICE) sharedBefore = await sharedSensorSnapshot();
});
test.afterAll(async ({}, info) => {
  info.setTimeout(300_000);
  if (!HAS_SERVICE) return;
  fx = null;
  expect(await cleanupSensors(GROUP, info.project.name), "일회용 계정·학교·센서 잔여물").toEqual(NO_SENSOR_RESIDUE);
  if (sharedBefore) expect(await sharedSensorSnapshot(), "학교 A·B·데모 센서 그대로").toEqual(sharedBefore);
});

test(`[C1][S17] 기대값 원본: dev-rules routes 17-doc = ${DOC_ROUTE} · components sensor-doc-add · sensor-link · new-sensor-fields · doc-intake-table · doc-upload = 17 · 시안 17-desktop 머리 '${DESK_DOC_ADD}' + '${DESK_ADD}' · rules add_mobile '${ADD_MOBILE_LABEL}' → '${DOC_ENTRY}' / '${DIRECT}'`, () => {
  expect(DOC_ROUTE, "routes 17-doc").toBe(`${LIST}/doc`);
  for (const c of ["sensor-doc-add", "sensor-link", "new-sensor-fields", "doc-intake-table", "doc-upload"]) expect(devRules.components[c], `${c} 화면`).toContain(SCREEN);
  expect(DESK_DOC_ADD, "시안 17-desktop sensor-doc-add").toBe(DOC_ENTRY);
  expect(REVIEW_COLUMNS.length, "rules doc.review 데스크톱 열").toBe(5);
  expect(rules.guest.hidden_components, "둘러보기 숨김 sensor-doc-add").toContain("sensor-doc-add");
  const r5 = rules.roles.R5.components ?? [];
  expect(r5, "R5 (학생 0) sensor-doc-add").toContain("sensor-doc-add");
});

test.describe("일회용 학교 교사", () => {
  test.skip(!HAS_SERVICE, "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음");

  test(`[C1][S17] [R-ui][S17] 진입: 1440 머리 sensor-doc-add '${DESK_DOC_ADD}'(button-outline, '${DESK_ADD}' 왼쪽) → ${DOC_ROUTE} / 390 '${ADD_MOBILE_LABEL}' → 시트 '${DOC_ENTRY}'('${DOC_ENTRY_CAPTION}') · '${DIRECT}'(→ ${NEW_PATH}) → ${DOC_ROUTE}`, async ({ browser }, info) => {
    test.setTimeout(240_000);
    const f = await fixture(info);
    const { page, context, viewport } = await openTemp(browser, info, f.teacher, LIST);
    try {
      await waitSensorList(page);
      const add = page.locator(`main ${sel("sensor-add")}`);
      await expect(add, "sensor-add 1").toHaveCount(1);
      if (viewport === "desktop") {
        const doc = page.locator(`main ${sel("sensor-doc-add")}`);
        await expect(doc, "sensor-doc-add 1").toHaveCount(1);
        await expect(doc, `'${DESK_DOC_ADD}'`).toHaveText(exact(DESK_DOC_ADD));
        await expect(doc.locator(sel("button-outline")), "button-outline").toHaveCount(1);
        await expect(add, `'${DESK_ADD}'`).toHaveText(exact(DESK_ADD));
        expect((await doc.boundingBox())!.x, "서류로 등록 = 센서 등록 왼쪽").toBeLessThan((await add.boundingBox())!.x);
        await doc.locator("a").first().click();
        await expect(page, `→ ${DOC_ROUTE}`).toHaveURL(new RegExp(`${DOC_ROUTE}$`), { timeout: 45_000 });
      } else {
        await expect(page.locator(`main ${sel("sensor-doc-add")}`), "390 목록 머리 sensor-doc-add 0 (시트 안)").toHaveCount(0);
        await expect(add, `'${ADD_MOBILE_LABEL}'`).toHaveText(exact(ADD_MOBILE_LABEL));
        const openChoice = async () => {
          const d = page.getByRole("dialog").filter({ has: page.locator(sel("sensor-doc-add")) });
          await expect(async () => {
            if (!(await d.isVisible())) await add.getByRole("button").first().click({ timeout: 3_000 });
            await expect(d).toBeVisible({ timeout: 3_000 });
          }).toPass({ timeout: 30_000 });
          return d;
        };
        let choice = await openChoice();
        const docRow = choice.locator(sel("sensor-doc-add"));
        await expect(docRow, `'${DOC_ENTRY}'`).toContainText(DOC_ENTRY);
        await expect(docRow, `caption '${DOC_ENTRY_CAPTION}'`).toContainText(DOC_ENTRY_CAPTION);
        const direct = choice.getByRole("link").filter({ hasText: exact(DIRECT) });
        await expect(direct, `'${DIRECT}' 1`).toHaveCount(1);
        expect(new URL((await direct.getAttribute("href"))!, page.url()).pathname, `'${DIRECT}' → ${NEW_PATH}`).toBe(NEW_PATH);
        await page.screenshot({ path: `test-results/v1-17-add-choice-${viewport}.png` });
        await direct.click();
        await expect(page.locator(sel("sensor-form")), `'${DIRECT}' → sensor-form`).toBeVisible({ timeout: 45_000 });
        await page.goto(LIST);
        await waitSensorList(page);
        choice = await openChoice();
        await choice.locator(sel("sensor-doc-add")).click();
        await expect(page, `'${DOC_ENTRY}' → ${DOC_ROUTE}`).toHaveURL(new RegExp(`${DOC_ROUTE}$`), { timeout: 45_000 });
      }
      await waitUpload(page);
    } finally {
      await context.close();
    }
  });

  test(`[C1][S17] 올리기 화면(두 폭): sensor-doc-add 머리 '${DOC_FRAME.heading}' · '${DOC_FRAME.caption}' · doc-upload '${DOC_FRAME.uploadHeading}' · '${DOC_FRAME.uploadCaption}' · '${DOC_TEXT.read}' 파일 전 비활성 · 390 nav × '${DOC_FRAME.navTitle}' ☰ 0 / 1440 app-sidebar(센서 활성) · nav-pill 0 · 처리 중 '${DOC_TEXT.reading}' · 확인 전 DB 그대로`, async ({ browser }, info) => {
    test.setTimeout(240_000);
    const f = await fixture(info);
    const before = await liveSensors(f.school.id);
    const { page, context, viewport } = await openTemp(browser, info, f.teacher, DOC_ROUTE);
    try {
      await waitUpload(page);
      const head = page.locator(`main ${sel("sensor-doc-add")}`);
      await expect(head, "머리 sensor-doc-add 1").toHaveCount(1);
      await expect(head.getByRole("heading", { name: DOC_FRAME.heading, exact: true }), `머리 '${DOC_FRAME.heading}'`).toBeVisible();
      await expect(head, `caption '${DOC_FRAME.caption}'`).toContainText(DOC_FRAME.caption);
      await expect(upload(page), "doc-upload 1").toHaveCount(1);
      await expect(upload(page), `'${DOC_FRAME.uploadHeading}'`).toContainText(DOC_FRAME.uploadHeading);
      await expect(upload(page), `'${DOC_FRAME.uploadCaption}'`).toContainText(DOC_FRAME.uploadCaption);
      await expect(readButton(page), `'${DOC_TEXT.read}' 1`).toHaveCount(1);
      await expect(readButton(page), "파일 전 비활성").toBeDisabled();
      if (viewport === "mobile") {
        const nav = page.locator(sel("nav-pill"));
        await expect(nav, "nav-pill 제목").toContainText(DOC_FRAME.navTitle);
        await expect(nav.getByRole("link", { name: "닫기", exact: true }), "× 1").toHaveCount(1);
        expect(new URL((await nav.getByRole("link", { name: "닫기", exact: true }).getAttribute("href"))!, page.url()).pathname, "× → 화면 17").toBe(LIST);
        await expect(menuButton(page), "하위 화면 ☰ 0").toHaveCount(0);
      } else {
        await expect(page.locator(sel("app-sidebar")), "app-sidebar 1").toHaveCount(1);
        await expect(page.locator(sel("nav-pill")), "nav-pill 0").toHaveCount(0);
        await expect(page.locator(`${sel("app-sidebar")} [aria-current="page"]`), "사이드바 '센서' 활성").toHaveText(/센서/);
      }
      await page.screenshot({ path: `test-results/v1-17-doc-upload-${viewport}.png` });
      const calls = await interceptSensorExtract(page, () => ({ body: { ok: true, docDate: null, items: [] }, delayMs: 3_000 }));
      await readDoc(page);
      await expect(page.getByText(DOC_TEXT.reading, { exact: true }).first(), `처리 중 '${DOC_TEXT.reading}'`).toBeVisible({ timeout: 10_000 });
      await expect(page.locator(`main ${sel("ex-empty-state-card")}`), "응답 뒤 0개 카드").toBeVisible({ timeout: 30_000 });
      expect(calls.n, "추출 요청 1").toBe(1);
      expect(calls.types[0], "multipart").toBe("multipart/form-data");
      expect(await liveSensors(f.school.id), "확인 전 DB 그대로").toEqual(before);
    } finally {
      await context.close();
    }
  });

  test(`[C1][S17] 0개 · 실패(두 폭): 0개 = ex-empty-state-card '${DOC_TEXT.emptyTitle}' · '${DOC_TEXT.emptyBody}' + button-outline '${DOC_TEXT.direct}'(→ ${NEW_PATH}) + doc-upload '${DOC_FRAME.failUploadHeading}' / 읽기 실패(502) = '${DOC_TEXT.failTitle}' · 다시 올리기`, async ({ browser }, info) => {
    test.setTimeout(240_000);
    const f = await fixture(info);
    const { page, context, viewport } = await openTemp(browser, info, f.teacher, DOC_ROUTE);
    try {
      let mode: "empty" | "fail" = "empty";
      const failMsg = "서류를 읽지 못했어요. 잠시 후 다시 시도해 주세요";
      await interceptSensorExtract(page, () =>
        mode === "empty" ? { body: { ok: true, docDate: null, items: [] } } : { status: 502, body: { ok: false, error: failMsg, code: "upstream" } },
      );
      await readDoc(page);
      const card = page.locator(`main ${sel("ex-empty-state-card")}`);
      await expect(card, "0개 카드").toBeVisible({ timeout: 30_000 });
      await expect(card, `'${DOC_TEXT.emptyTitle}'`).toContainText(DOC_TEXT.emptyTitle);
      await expect(card, `'${DOC_TEXT.emptyBody}'`).toContainText(DOC_TEXT.emptyBody);
      const direct = card.locator(sel("button-outline")).filter({ hasText: exact(DOC_TEXT.direct) });
      await expect(direct, `'${DOC_TEXT.direct}' button-outline`).toHaveCount(1);
      const href = (await direct.getAttribute("href")) ?? (await direct.locator("a").first().getAttribute("href"));
      expect(new URL(href!, page.url()).pathname, `'${DOC_TEXT.direct}' → ${NEW_PATH}`).toBe(NEW_PATH);
      await expect(upload(page), "아래 doc-upload 1").toHaveCount(1);
      await expect(upload(page), `doc-upload '${DOC_FRAME.failUploadHeading}' (시안 17-doc-fail)`).toContainText(DOC_FRAME.failUploadHeading);
      await expect(table(page), "확인 표 0").toHaveCount(0);
      await page.screenshot({ path: `test-results/v1-17-doc-fail-${viewport}.png` });
      // 읽기 실패
      mode = "fail";
      await pickFile(page, DOC_PDF);
      await readButton(page).click();
      await expect(card, `'${DOC_TEXT.failTitle}'`).toContainText(DOC_TEXT.failTitle, { timeout: 30_000 });
      await expect(table(page), "확인 표 0").toHaveCount(0);
      await expect(upload(page), "다시 올리기 doc-upload").toHaveCount(1);
    } finally {
      await context.close();
    }
  });

  test(`[C1][S17] [R-ui][S17] 확인 표 → 저장(두 폭): '${DOC_TEXT.reviewTitle(3)}' · 같은 회사+모델(대소문자·공백 무시) = '${DOC_TEXT.linkExisting("{이름}", 2, 3)}' + '${DOC_TEXT.change}'·'${DOC_TEXT.exclude}' · 없으면 '${DOC_TEXT.newSensor}' + new-sensor-fields 펼침(이름·종류·회사·수량·상태 정상) · '${DOC_TEXT.notSensor(1)}' 접힘 → '${DOC_TEXT.asSensor}' · '${DOC_TEXT.save(3)}' → 빼기 → '${DOC_TEXT.save(2)}' → 저장 = 토스트 '${DOC_TEXT.done(2)}' · 화면 17 · 바뀐 행 highlight-soft · DB(기존 수량 더함 · 새 센서 1 · 뺀 줄 그대로)`, async ({ browser }, info) => {
    test.setTimeout(300_000);
    const f = await fixture(info);
    const motion = f.sensors.find((s) => s.model === "PS-3219")!;
    const force = f.sensors.find((s) => s.model === "PS-3202")!;
    expect(motion.maker, "준비: 기존 센서 회사").toBe(force.maker);
    const newName = `무선 CO₂ 센서 ${f.tag}-${info.project.name.slice(0, 1)}`;
    const newMaker = (R as unknown as { sensor: { makers: Record<string, string[]> } }).sensor.makers["센서"][2];
    const newType = R.sensor.types.find((t) => t.startsWith("CO"))!;
    const ADD = 3;
    const items = [
      // 같은 회사 + 모델 (소문자 · 뒤 공백) → 기존 센서에 더하기
      item(motion.name, motion.maker, ` ${motion.model!.toLowerCase()} `, ADD, motion.type),
      item(newName, newMaker, null, 2, newType),
      item(force.name, force.maker, force.model, 1, force.type),
      item("배송비", null, null, 1, null, false),
    ];
    const before = await liveSensors(f.school.id);
    const { page, context, viewport } = await openTemp(browser, info, f.teacher, DOC_ROUTE);
    try {
      const calls = await interceptSensorExtract(page, () => ({ body: { ok: true, docDate: null, items } }));
      await readDoc(page);
      await expect(table(page), "doc-intake-table 1").toHaveCount(1, { timeout: 30_000 });
      expect(calls.n, "추출 요청 1").toBe(1);
      await expect(table(page), "data-variant sensor").toHaveAttribute("data-variant", "sensor");
      await expect(table(page).getByRole("heading", { name: DOC_TEXT.reviewTitle(3), exact: true }), `'${DOC_TEXT.reviewTitle(3)}'`).toBeVisible();
      const head = page.locator(`main ${sel("sensor-doc-add")}`);
      await expect(head, `머리 '${DOC_FRAME.guide}'`).toContainText(DOC_FRAME.guide);
      await expect(head, "머리 파일 이름").toContainText(DOC_PDF.name);
      // 데스크톱 표 머리 = rules 열 / 모바일 = 카드(머리 줄 없음)
      // 표 머리 칸 = 행 · 연결 줄 · 새 센서 칸(라벨 '회사' 등) 밖에서 글자가 정확히 그 열 이름인 보이는 요소
      const heads = await table(page).evaluate((el, cols) => {
        const shown = (e: Element) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden";
        };
        return Array.from(el.querySelectorAll("*"))
          .filter((e) => !e.closest('[role="listitem"], [data-component="sensor-link"], [data-component="new-sensor-fields"]'))
          .filter((e) => e.children.length === 0 && cols.includes((e.textContent ?? "").trim()) && shown(e))
          .map((e) => (e.textContent ?? "").trim());
      }, REVIEW_COLUMNS);
      if (viewport === "desktop") expect(heads, "1440 표 머리 = rules 열").toEqual(REVIEW_COLUMNS);
      else expect(heads, "390 = 행마다 카드 (표 머리 없음)").toEqual([]);
      await expect(links(page), "sensor-link = 센서 줄 3").toHaveCount(3);
      // 1) 기존 센서에 더하기
      await expect(links(page).nth(0), "기존 더하기 문구").toContainText(looseIn(DOC_TEXT.linkExisting(motion.name, motion.quantity, ADD)));
      await expect(links(page).nth(0).getByRole("button", { name: new RegExp(DOC_TEXT.change) }), `'${DOC_TEXT.change}'`).toHaveCount(1);
      await expect(links(page).nth(0).getByRole("button", { name: new RegExp(DOC_TEXT.exclude) }), `'${DOC_TEXT.exclude}'`).toHaveCount(1);
      // 2) 새 센서 → 펼침
      await expect(links(page).nth(1), `'${DOC_TEXT.newSensor}'`).toContainText(DOC_TEXT.newSensor);
      const fields = table(page).locator(sel("new-sensor-fields"));
      await expect(fields, "new-sensor-fields 1 (새 센서 줄만)").toHaveCount(1);
      // 칸 = 시안 17-doc-review new-sensor-fields 의 field-name · field-quantity
      await expect(fields.locator('[data-name="field-name"] input'), "이름 = 읽은 품명").toHaveValue(newName);
      await expect(fields.locator(sel("sensor-type-select")), `종류 = ${newType}`).toContainText(newType);
      await expect(fields.locator(sel("sensor-maker-select")), `회사 = ${newMaker}`).toContainText(newMaker);
      await expect(fields.locator('[data-name="field-quantity"] input'), "수량 = 2").toHaveValue("2");
      await expect(fields.locator(`${sel("segmented-control-active")}`).filter({ hasText: exact("정상") }), "상태 기본 정상").toHaveCount(1);
      // 3) 기존 센서 둘째
      await expect(links(page).nth(2), "둘째 기존 더하기").toContainText(looseIn(DOC_TEXT.linkExisting(force.name, force.quantity, 1)));
      // 센서 아님 묶음
      const other = table(page).getByRole("button", { name: loose(DOC_TEXT.notSensor(1)) });
      await expect(other, `'${DOC_TEXT.notSensor(1)}'`).toHaveCount(1);
      await expect(other, "처음 접힘").toHaveAttribute("aria-expanded", "false");
      await expect(table(page).getByText("배송비"), "접힘 → 품목 안 보임").toHaveCount(0);
      await other.click();
      await expect(table(page).getByText(/배송비/).first(), "펼침 → 품목").toBeVisible();
      await expect(table(page).getByRole("button", { name: new RegExp(DOC_TEXT.asSensor) }), `'${DOC_TEXT.asSensor}'`).toHaveCount(1);
      await other.click();
      await expect(saveButton(page), `'${DOC_TEXT.save(3)}'`).toHaveText(loose(DOC_TEXT.save(3)));
      await page.screenshot({ path: `test-results/v1-17-doc-review-${viewport}.png`, fullPage: true });
      expect(await liveSensors(f.school.id), "확인 전 DB 그대로").toEqual(before);
      // 셋째 줄 빼기 → N 줄어듦
      await links(page).nth(2).getByRole("button", { name: new RegExp(DOC_TEXT.exclude) }).click();
      await expect(saveButton(page), `'${DOC_TEXT.save(2)}'`).toHaveText(loose(DOC_TEXT.save(2)));
      // 저장
      await saveButton(page).click();
      await expect(page.locator(sel("ex-toast")).filter({ hasText: DOC_TEXT.done(2) }), `토스트 '${DOC_TEXT.done(2)}'`).toBeVisible({ timeout: 45_000 });
      await expect(page, "저장 → 화면 17").toHaveURL(new RegExp(`${LIST}(\\?|$)`));
      const live = await liveSensors(f.school.id);
      expect(live.length, "DB 센서 +1 (새 센서)").toBe(before.length + 1);
      expect((await sensorRow(motion.id))?.quantity, `${motion.name} ${motion.quantity} + ${ADD}`).toBe(motion.quantity + ADD);
      expect((await sensorRow(force.id))?.quantity, `뺀 줄 ${force.name} 그대로`).toBe(force.quantity);
      const made = live.find((s) => s.name === newName);
      expect(made, "새 센서 행").toBeTruthy();
      const row = await sensorRow(made!.id);
      expect(
        { school_id: row!.school_id, type: row!.type, maker: row!.maker, quantity: row!.quantity, status: row!.status, created_by: row!.created_by },
        "새 센서 값",
      ).toEqual({ school_id: f.school.id, type: newType, maker: newMaker, quantity: 2, status: STATUS_OK, created_by: f.teacher.id });
      // 바뀐 행 잠깐 highlight-soft (더한 센서 · 새 센서), 안 바뀐 행은 아님
      await waitSensorList(page);
      const lit = (l: Locator) =>
        l.evaluate((el, c) => [el, ...Array.from(el.querySelectorAll("*"))].some((e) => getComputedStyle(e).backgroundColor === c), HIGHLIGHT_SOFT);
      await expect.poll(() => lit(rowNamed(page, motion.name).first()), { message: `${motion.name} 행 highlight-soft`, timeout: 5_000 }).toBe(true);
      await expect.poll(() => lit(rowNamed(page, newName).first()), { message: "새 센서 행 highlight-soft", timeout: 5_000 }).toBe(true);
      expect(await lit(rowNamed(page, force.name).first()), "뺀 센서 행 강조 없음").toBe(false);
    } finally {
      await context.close();
    }
  });

  test(`[C1][S17] 센서 상세(하위 화면) 390 = ‹ 머리 · ☰ 0 / 1440 = ☰ 0`, async ({ browser }, info) => {
    test.setTimeout(240_000);
    const f = await fixture(info);
    const s = f.sensors[0];
    const { page, context, viewport } = await openTemp(browser, info, f.teacher, `${LIST}/${s.id}`);
    try {
      await expect(page.locator(sel("sensor-detail")).first(), "sensor-detail").toBeVisible({ timeout: 45_000 });
      await page.waitForLoadState("load");
      await expect(menuButton(page), "센서 상세 ☰ 0").toHaveCount(0);
      if (viewport === "mobile") await expect(page.locator(sel("nav-pill")).getByRole("link", { name: "뒤로", exact: true }), "‹ 1").toHaveCount(1);
    } finally {
      await context.close();
    }
  });

  test(`[R-ui][S17] 학생: 목록 sensor-doc-add 0 · ${DOC_ROUTE} → 홈 + '${NO_ACCESS.teacher_admin}' · doc-upload 0 · 추출 요청 0`, async ({ browser }, info) => {
    test.setTimeout(240_000);
    const f = await fixture(info);
    const { page, context } = await openTemp(browser, info, f.student, LIST);
    try {
      await waitSensorList(page);
      await expect(page.locator(sel("sensor-doc-add")), "학생 목록 sensor-doc-add 0").toHaveCount(0);
      const calls = await interceptSensorExtract(page, () => ({ body: { ok: true, docDate: null, items: [] } }));
      const seen: string[] = [];
      page.on("framenavigated", (fr) => {
        if (fr === page.mainFrame()) seen.push(fr.url());
      });
      await page.goto(DOC_ROUTE);
      await expect.poll(() => new URL(page.url()).pathname, { message: "홈으로", timeout: 45_000 }).toBe(routeOf(13));
      expect(seen.map((u) => new URL(u)).some((u) => u.pathname === routeOf(13) && u.searchParams.get("denied") === "staff"), `거쳐 간 주소 /?denied=staff (${seen.join(" → ")})`).toBe(true);
      await expect(page.locator(sel("ex-toast")).filter({ hasText: NO_ACCESS.teacher_admin }), "권한 토스트").toBeVisible({ timeout: 20_000 });
      await expect(page.locator(sel("doc-upload")), "doc-upload 0").toHaveCount(0);
      await expect(page.locator(sel("doc-intake-table")), "확인 표 0").toHaveCount(0);
      expect(calls.n, "추출 요청 0").toBe(0);
    } finally {
      await context.close();
    }
  });

  test(`[N1-ui][S17] 학교 B 교사 ${DOC_ROUTE}: 응답 본문 · 화면에 일회용 학교 센서 이름 0 (자기 학교 센서만 연결 후보)`, async ({ browser }, info) => {
    test.setTimeout(240_000);
    const f = await fixture(info);
    const b = await openAs(browser, info, "schoolB", SCREEN, DOC_ROUTE);
    try {
      expect(new URL(b.page.url()).pathname, "학교 B 교사 머묾").toBe(DOC_ROUTE);
      const html = (await b.response?.text()) ?? "";
      for (const s of f.sensors) expect(html, `응답에 ${s.name} 없음`).not.toContain(s.name);
      // 일회용 학교 센서와 같은 회사+모델을 읽어도 '기존 센서에 더하기'(그 학교 이름) 아님
      const target = f.sensors.find((s) => s.model === "PS-3219")!;
      await interceptSensorExtract(b.page, () => ({ body: { ok: true, docDate: null, items: [item(target.name, target.maker, target.model, 1, target.type)] } }));
      await readDoc(b.page);
      await expect(table(b.page), "확인 표").toHaveCount(1, { timeout: 30_000 });
      await expect(links(b.page).first(), "다른 학교 센서 이름 0").not.toContainText(DOC_TEXT.linkExisting(target.name, target.quantity, 1));
      expect((await b.page.locator("body").innerText()).includes(`${target.name} · 지금`), "다른 학교 센서 연결 0").toBe(false);
    } finally {
      await b.context.close();
    }
  });
});

test(`[GM-ui][S17g] 둘러보기 ${devRules.routes["17-guest"]}: sensor-doc-add 0 · sensor-add 0 · doc-upload 0 (rules guest.hidden_components)`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page } = await openGuest(browser, info, devRules.routes["17-guest"]);
  try {
    await waitGuestShell(page);
    await expect(page.locator(`main ${sel("sensor-row")}`).first(), "데모 센서 보임").toBeVisible({ timeout: 30_000 });
    for (const c of ["sensor-doc-add", "sensor-add", "doc-upload"]) await expect(page.locator(sel(c)), `둘러보기 ${c} 0`).toHaveCount(0);
  } finally {
    await context.close();
  }
});
