// 권한 없는 주소 (harness/d7-data.md §28 "권한 없는 주소" · design/rules.json 1.28 no_access · roles R5·R6).
// 학생이 교사·admin 화면(7 입고 · 5 실험 매뉴얼 · 6 재주문 알림)으로 들어오면 홈 `/?denied=staff`,
// 교사가 admin 화면(8 사용자 · 9 판매처)으로 들어오면 홈 `/?denied=admin` 으로 보낸다.
// 홈이 토스트 뒤 주소에서 ?denied 를 지우므로(D3), 도착 주소가 아니라 거쳐 간 주소(문서 요청 · 프레임 이동)를 모두 기록해 본다.
// 양성 대조: 교사는 교사·admin 화면에, admin 은 admin 화면에 그대로 머문다.
import { test, expect, type Page } from "@playwright/test";
import { openAs } from "./auth-state";
import { routeOf } from "./screen-helpers";
import type { Role } from "./db-helpers";

const DENIED_PARAM = "denied";
const STAFF_SCREENS = [7, 5, 6];
const ADMIN_SCREENS = [8, 9];
const HOME = routeOf(13);

/** page 가 거쳐 간 주소 (문서 요청 + 프레임 이동 — history.replaceState 포함) */
function recordUrls(page: Page): () => string[] {
  const urls: string[] = [];
  page.on("request", (r) => {
    if (r.isNavigationRequest()) urls.push(r.url());
  });
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) urls.push(f.url());
  });
  return () => urls;
}

const deniedOf = (u: string): { path: string; denied: string | null } => {
  const url = new URL(u);
  return { path: url.pathname, denied: url.searchParams.get(DENIED_PARAM) };
};

async function visit(browser: import("@playwright/test").Browser, info: import("@playwright/test").TestInfo, role: Role, screen: number) {
  const opened = await openAs(browser, info, role, 13);
  const urls = recordUrls(opened.page);
  await opened.page.goto(routeOf(screen));
  await opened.page.waitForLoadState("load");
  return { ...opened, urls };
}

for (const screen of STAFF_SCREENS) {
  test(`[R5][S${screen}] 학생이 ${routeOf(screen)} → 홈 /?${DENIED_PARAM}=staff`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    const { context, page, urls } = await visit(browser, info, "student", screen);
    try {
      await expect.poll(() => new URL(page.url()).pathname, { message: "홈으로 이동" }).toBe(HOME);
      const seen = urls().map(deniedOf);
      expect(seen, `거쳐 간 주소에 ${HOME}?${DENIED_PARAM}=staff (${urls().join(" → ")})`).toContainEqual({ path: HOME, denied: "staff" });
      expect(seen.some((s) => s.denied === "admin"), "admin 표시는 아님").toBe(false);
    } finally {
      await context.close();
    }
  });

  test(`[R5][S${screen}] 양성 대조: 교사는 ${routeOf(screen)} 에 머문다 (denied 없음)`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    const { context, page, urls } = await visit(browser, info, "teacher", screen);
    try {
      expect(new URL(page.url()).pathname).toBe(routeOf(screen));
      expect(urls().map(deniedOf).some((s) => s.denied !== null), "denied 없음").toBe(false);
    } finally {
      await context.close();
    }
  });
}

for (const screen of ADMIN_SCREENS) {
  test(`[R6][S${screen}] 교사가 ${routeOf(screen)} → 홈 /?${DENIED_PARAM}=admin`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    const { context, page, urls } = await visit(browser, info, "teacher", screen);
    try {
      await expect.poll(() => new URL(page.url()).pathname, { message: "홈으로 이동" }).toBe(HOME);
      const seen = urls().map(deniedOf);
      expect(seen, `거쳐 간 주소에 ${HOME}?${DENIED_PARAM}=admin (${urls().join(" → ")})`).toContainEqual({ path: HOME, denied: "admin" });
      expect(seen.some((s) => s.denied === "staff"), "staff 표시는 아님").toBe(false);
    } finally {
      await context.close();
    }
  });

  test(`[R6][S${screen}] 양성 대조: admin 은 ${routeOf(screen)} 에 머문다 (denied 없음)`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    const { context, page, urls } = await visit(browser, info, "admin", screen);
    try {
      expect(new URL(page.url()).pathname).toBe(routeOf(screen));
      expect(urls().map(deniedOf).some((s) => s.denied !== null), "denied 없음").toBe(false);
    } finally {
      await context.close();
    }
  });
}
