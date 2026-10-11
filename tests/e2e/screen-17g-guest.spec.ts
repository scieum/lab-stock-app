// 화면 17g 둘러보기 센서 (dev-rules.json routes["17-guest"] · route_auth 17-guest "비로그인 (데모 학교 센서 읽기 전용)") — 비로그인 컨텍스트.
// 기준: harness/d7-data.md §25 "무선 센서 (화면 17)"(둘러보기 = 데모 센서 읽기 전용) · "센서 DB"(데모 학교에 센서 4~6개 시드),
//       design/rules.json guest(hidden_components · tab_locks · sidebar_locks · desktop) · sensor.roles · tab_bar.sensor_entry,
//       harness/dev-rules.json guest_screens · routes 17-guest.
// design/frames 에 17-guest 프레임은 없다 — 프레임 대조 없이 구조(배너 · 숨김 · 학교명 · 탭바 · 읽기 전용)만 본다.
// 데이터 비교는 anon 클라이언트(RLS). 공용 데이터는 읽기만.
import { test, expect, type Page } from "@playwright/test";
import { anonClient } from "./db-helpers";
import { openAs } from "./auth-state";
import { devRules, routeOf, rules, sel } from "./screen-helpers";
import { GUEST, checkBanner, checkHidden, checkSchoolName, checkTabBar, demoSchool, openGuest } from "./guest-helpers";
import { D7_25, SCREEN, d7Row, detailPath, guestListPath, isDesk, quotes, rowNamed, rowsOf, statusLabel, waitSensorList } from "./sensor-helpers";

const TAG = `S${SCREEN}g`;
const NOT_FOUND = quotes((rules as unknown as { not_found: { card: string } }).not_found.card);
/** d7 §25 "데모 학교에 센서 4~6개 시드" */
const DEMO_RANGE = (() => {
  const m = /데모 학교에 센서 (\d+)~(\d+)개/.exec(D7_25);
  if (!m) throw new Error("d7 §25 데모 센서 수를 읽지 못함");
  return [Number(m[1]), Number(m[2])] as const;
})();

type DemoSensor = { id: string; name: string; status: string };
async function demoSensors(): Promise<DemoSensor[]> {
  const school = await demoSchool();
  const { data, error } = await anonClient().from("sensors").select("id, school_id, name, status").order("name");
  expect(error, `anon sensors 조회 (${error?.message})`).toBeNull();
  const rows = data ?? [];
  expect(rows.filter((r) => r.school_id !== school.id), "anon 은 데모 학교 센서만").toHaveLength(0);
  return rows.map((r) => ({ id: r.id as string, name: r.name as string, status: r.status as string }));
}

function watchWrites(page: Page): () => string[] {
  const writes: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET" && r.method() !== "HEAD") writes.push(`${r.method()} ${r.url()}`);
  });
  return () => writes;
}

test(`[GM-ui][${TAG}] 기대값 원본: guest.screens · dev-rules guest_screens 에 17 · routes 17-guest · d7 §25 둘러보기 = 데모 센서 읽기 전용 · guest.hidden_components 에 센서 쓰기 · 데모 센서 ${DEMO_RANGE.join("~")}개`, () => {
  expect(GUEST.screens, "rules guest.screens").toContain(SCREEN);
  expect(devRules.guest_screens, "dev-rules guest_screens").toContain(SCREEN);
  expect(guestListPath(), "routes 17-guest").toBe("/demo/sensors");
  expect(d7Row("무선 센서 (화면 17)"), "d7 §25 둘러보기 = 데모 센서 읽기 전용").toMatch(/둘러보기 = 데모 센서 읽기 전용/);
  expect(GUEST.hidden_components, "숨김").toEqual(expect.arrayContaining(["sensor-add", "sensor-edit", "sensor-delete", "list-select-toggle", "select-checkbox", "bulk-action-bar", "sensor-alert-tile"]));
  expect(DEMO_RANGE).toEqual([4, 6]);
});

test(`[GM-ui][${TAG}] /demo/sensors 비로그인: 200 · guest-banner(가입 → /signup) · hidden_components 0 · 행 = anon 데모 센서(${DEMO_RANGE.join("~")}개, 상태 배지 글자) · 학교명 '데모 학교'만 · 390 탭바(4 · 잠금 ${GUEST.tab_locks}) + inventory-switch → /demo/reagents · 1440 사이드바 '센서' 활성 + 잠금 · V1`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const demo = await demoSensors();
  expect(demo.length, "데모 센서 수 (d7 §25)").toBeGreaterThanOrEqual(DEMO_RANGE[0]);
  expect(demo.length).toBeLessThanOrEqual(DEMO_RANGE[1]);
  const g = await openGuest(browser, info, guestListPath());
  try {
    const page = g.page;
    expect(g.response?.status(), "200").toBe(200);
    await waitSensorList(page);
    const writes = watchWrites(page);
    await checkBanner(page);
    await checkHidden(page);
    await checkSchoolName(page, g.response ? await g.response.text() : null);
    await checkTabBar(page, g.viewport, SCREEN);
    await expect(rowsOf(page), "행 = 데모 센서").toHaveCount(demo.length);
    for (const s of demo) await expect(rowNamed(page, s.name).locator(sel("sensor-status-badge")), `${s.name} 배지`).toHaveText(statusLabel(s.status));
    if (isDesk(page)) {
      await expect(page.locator(sel("app-sidebar")), "사이드바 1").toHaveCount(1);
      await expect(page.locator(`${sel("app-sidebar")} ${sel(GUEST.lock)}`), "사이드바 잠금 = guest.sidebar_locks").toHaveCount((GUEST as unknown as { sidebar_locks: number }).sidebar_locks);
      const active = page.locator(`${sel("app-sidebar")} ${sel("sidebar-item")}[aria-current="page"]`);
      await expect(active, "사이드바 '센서' 활성 (rules guest.desktop)").toHaveText(/센서/);
    } else {
      const sw = page.locator(`main ${sel("inventory-switch")}`);
      await expect(sw, "inventory-switch 1").toHaveCount(1);
      await expect(sw.locator(sel("segmented-control-active")), "센서 활성").toHaveText(/센서/);
      const reagentLink = sw.getByRole("tab", { name: "시약" });
      expect(new URL((await reagentLink.getAttribute("href"))!, "http://x").pathname, "시약 쪽 → /demo/reagents").toBe(devRules.routes["2-guest"]);
    }
    await page.screenshot({ path: `test-results/v1-17g-${info.project.name}.png` });
    // 상세: 읽기 전용 (수정 · 삭제 없음)
    const s = demo[0];
    await expect(async () => {
      const row = rowNamed(page, s.name);
      if (isDesk(page)) await row.locator("a").first().click({ timeout: 3_000 });
      else await row.click({ timeout: 3_000 });
      await expect(page.locator(sel("sensor-detail")), "sensor-detail").toBeVisible({ timeout: 10_000 });
    }).toPass({ timeout: 45_000 });
    expect(new URL(page.url()).pathname, "상세 주소 /demo/sensors/{id}").toBe(detailPath(s.id, "/demo"));
    await checkHidden(page);
    await checkBanner(page);
    expect(writes(), "둘러보기 쓰기 요청 0").toEqual([]);
  } finally {
    await g.context.close();
  }
});

test(`[GM-ui][${TAG}] [N1-ui][${TAG}] 데모가 아닌 센서 id · 없는 id → 404 카드('${NOT_FOUND[0]}', '홈으로' = /demo) · 로그인 사용자가 /demo/sensors 에 오면 /`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const g = await openGuest(browser, info, detailPath("00000000-0000-4000-8000-0000000000ff", "/demo"));
  try {
    expect(g.response?.status(), "없는 id = 404").toBe(404);
    await expect(g.page.getByText(NOT_FOUND[0], { exact: true }), "404 카드").toBeVisible();
    const home = g.page.locator(sel("ex-empty-state-card")).locator(sel("button-primary"));
    expect(new URL((await home.first().getAttribute("href"))!, "http://x").pathname, "'홈으로' = 둘러보기 홈").toBe(devRules.routes["13-guest"]);
  } finally {
    await g.context.close();
  }
  const t = await openAs(browser, info, "teacher", 13, guestListPath());
  try {
    expect(new URL(t.page.url()).pathname, "로그인 사용자 /demo/sensors → /").toBe(routeOf(13));
  } finally {
    await t.context.close();
  }
});
