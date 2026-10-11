// 홈 sensor-alert-tile — R-ui · C1 · GM-ui (390 · 1440). 일회용 학교.
// 기준(구현이 아니라 여기서 도출): harness/d7-data.md §25 "무선 센서 (화면 17)"(홈 sensor-alert-tile(교사·admin, 고장·점검 필요 ≥1 일 때만)),
//   design/rules.json 1.26 sensor.home(데스크톱 '지금 처리할 것' 숫자 타일 '고장·점검 필요 센서 N' · 모바일 home-summary 줄) ·
//   roles R5(학생 sensor-alert-tile 0) · guest.hidden_components, 새 프레임 13-mobile · 13-desktop.
import { test, expect, type TestInfo } from "@playwright/test";
import { devRules, routeOf, rules, sel } from "./screen-helpers";
import { HAS_SERVICE, openTemp } from "./screen-8-helpers";
import { newFrame } from "./desk-helpers";
import { openGuest } from "./guest-helpers";
import { NO_SENSOR_RESIDUE, SENSOR, STATUS, cleanupSensors, d7Row, liveSensors, makeSensor, quotes, sensorFixture, type SensorFixture } from "./sensor-helpers";

test.describe.configure({ mode: "default" });

const GROUP = "s13sens";
const TILE = "sensor-alert-tile";
const [, CHECK, BROKEN] = STATUS.map((s) => s.db);
/** rules sensor.home "'고장·점검 필요 센서 N'" */
const LABEL_TPL = quotes(SENSOR.home).find((q) => /N$/.test(q))!;
const label = (n: number) => LABEL_TPL.replace("N", String(n));

let withAlerts: Promise<SensorFixture> | null = null;
let okOnly: Promise<SensorFixture> | null = null;
function fxAlerts(info: TestInfo) {
  withAlerts ??= sensorFixture(info, GROUP, true);
  withAlerts.catch(() => (withAlerts = null));
  return withAlerts;
}
/** 정상 센서만 있는 학교 (고장 · 점검 필요 0) */
function fxOk(info: TestInfo) {
  okOnly ??= (async () => {
    const f = await sensorFixture(info, GROUP, false);
    await makeSensor(f.teacherClient, { name: `정상만 ${f.tag}`, type: SENSOR.types[0], maker: (SENSOR.makers["센서"] as string[])[0], model: null, quantity: 1, location: null, status: STATUS[0].db, memo: null });
    return f;
  })();
  okOnly.catch(() => (okOnly = null));
  return okOnly;
}

test(`[R-ui][S13] 기대값 원본: d7 §25 홈 ${TILE}(교사·admin, 고장·점검 필요 ≥1 일 때만) · rules sensor.home '${LABEL_TPL}' = 프레임 13 · R5 학생 0 · 둘러보기 숨김`, () => {
  expect(d7Row("무선 센서 (화면 17)")).toMatch(/홈 sensor-alert-tile\(교사·admin, 고장·점검 필요 ≥1 일 때만\)/);
  expect(rules.roles.R5.components, "R5").toContain(TILE);
  expect(rules.guest.hidden_components, "둘러보기 숨김").toContain(TILE);
  const mob = newFrame("13-mobile").filter((n) => n.path.includes(TILE) && n.text).map((n) => n.text!.characters);
  expect(mob, "13-mobile 타일 글자 = '고장·점검 필요 센서 N'").toEqual([label(2)]);
  const desk = newFrame("13-desktop").filter((n) => n.path.includes(TILE) && n.text).map((n) => n.text!.characters);
  expect(desk[0], "13-desktop 타일 캡션").toBe(LABEL_TPL.replace(/ N$/, ""));
  expect(desk, "13-desktop 숫자 · 내역").toEqual([LABEL_TPL.replace(/ N$/, ""), "2", "고장 1 · 점검 필요 1"]);
});

test(`[GM-ui][S13g] 둘러보기 홈(/demo): ${TILE} 0`, async ({ browser }, info) => {
  const g = await openGuest(browser, info, devRules.routes["13-guest"]);
  try {
    await expect(g.page.locator(sel("home-summary")).first()).toBeAttached({ timeout: 45_000 });
    await expect(g.page.locator(sel(TILE)), "둘러보기 0").toHaveCount(0);
  } finally {
    await g.context.close();
  }
});

test.describe("일회용 학교", () => {
  test.skip(!HAS_SERVICE, "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음");
  test.afterAll(async ({}, info) => {
    info.setTimeout(300_000);
    withAlerts = null;
    okOnly = null;
    expect(await cleanupSensors(GROUP, info.project.name), "잔여물").toEqual(NO_SENSOR_RESIDUE);
  });

  for (const role of ["teacher", "admin", "student"] as const) {
    test(`[R-ui][S13] 고장·점검 필요 ≥1 학교 ${role}: ${TILE} ${role === "student" ? 0 : 1}${role === "student" ? "" : ` · '${LABEL_TPL}' N = DB 고장 + 점검 필요 · 누르면 /sensors (고장 · 점검 필요만)`}`, async ({ browser }, info) => {
      test.setTimeout(300_000);
      const f = await fxAlerts(info);
      const live = await liveSensors(f.school.id);
      const broken = live.filter((s) => s.status === BROKEN).length;
      const check = live.filter((s) => s.status === CHECK).length;
      expect(broken + check, "준비: 고장 · 점검 필요 ≥1").toBeGreaterThan(0);
      const t = await openTemp(browser, info, f[role], routeOf(13));
      try {
        const page = t.page;
        await expect(page.locator(sel("home-summary")).first()).toBeAttached({ timeout: 45_000 });
        await expect(page.locator(sel("quick-action")).first()).toBeAttached({ timeout: 45_000 });
        const tile = page.locator(sel(TILE));
        if (role === "student") {
          await expect(tile, "학생 0 (R5)").toHaveCount(0);
          return;
        }
        await expect(tile, `${role} 1`).toHaveCount(1);
        const text = (await tile.innerText()).replace(/\s+/g, " ").trim();
        if (info.project.name === "desktop") {
          expect(text, "데스크톱 숫자 타일").toContain(LABEL_TPL.replace(/ N$/, ""));
          expect(text, "숫자").toContain(String(broken + check));
          expect(text, "내역").toContain(`고장 ${broken} · 점검 필요 ${check}`);
          await expect(page.locator(`[data-name="todo-section"] ${sel(TILE)}`), "'지금 처리할 것' 안").toHaveCount(1);
        } else {
          expect(text, "모바일 줄").toContain(label(broken + check));
          await expect(page.locator(`${sel("home-summary")} ${sel(TILE)}`), "home-summary 안").toHaveCount(1);
        }
        await tile.click();
        await expect(page, "→ /sensors").toHaveURL(new RegExp(`${routeOf(17)}(\\?|$)`), { timeout: 45_000 });
        const badges = page.locator(`main ${sel("sensor-row")} ${sel("sensor-status-badge")}`);
        await expect(badges, "고장 · 점검 필요만").toHaveCount(broken + check, { timeout: 45_000 });
        for (const b of await badges.allInnerTexts()) expect([STATUS[1].label, STATUS[2].label]).toContain(b.trim());
      } finally {
        await t.context.close();
      }
    });
  }

  for (const role of ["teacher", "admin"] as const) {
    test(`[R-ui][S13] 고장·점검 필요 0 (정상만) 학교 ${role}: ${TILE} 0`, async ({ browser }, info) => {
      test.setTimeout(300_000);
      const f = await fxOk(info);
      expect((await liveSensors(f.school.id)).filter((s) => s.status !== STATUS[0].db), "정상만").toHaveLength(0);
      const t = await openTemp(browser, info, f[role], routeOf(13));
      try {
        await expect(t.page.locator(sel("quick-action")).first()).toBeAttached({ timeout: 45_000 });
        await expect(t.page.locator(sel("home-summary")).first()).toBeAttached();
        await expect(t.page.locator(sel(TILE)), "0").toHaveCount(0);
      } finally {
        await t.context.close();
      }
    });
  }
});
