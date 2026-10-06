// 화면 13 (홈) — quick-action 의 "시약장 설정" 진입(run 20261005-1759 범위 추가) · 홈 재주문 카드의 목적지(화면 6): C1 · R-ui
// 기준: 디자인 s2-spec 화면 13 quick-action(역할별) + 사용자 보고(시약장을 한 번 만든 뒤 모바일에서 화면 11 로 다시 들어갈 길이 없었음) →
//       교사·admin quick-action 에 "시약장 설정"(→ dev-rules routes["11"]) 추가, 학생은 "시약장 보기" 유지.
//       design/rules.json roles R7(cabinet-edit·cabinet-add)·R2(reorder-alert-card 학생 0), harness/d7-data.md §11 (홈과 같은 기준의 알림 → 화면 6).
// 공용 테스트 계정(학교 A — 시약장이 1개 이상 있는 학교)만 쓰고 DB 에 쓰지 않는다 (읽기·링크 이동만).
import { test, expect, type Page } from "@playwright/test";
import { ROLE_LABEL, SCHOOL_A_ROLES } from "./db-helpers";
import { openAs } from "./auth-state";
import { PROFILE_ROLE, ROLE_NAME, browserClient, browserSession, countComponent, devRules, roleChecks, routeOf, rules, sel } from "./screen-helpers";
import { boxOf, clean, exact, linksTo, onTop } from "./screen-6-9-helpers";

const SCREEN = 13;
const CABINETS = 11;
const REORDER = 6;
const HOME_HREF = routeOf(SCREEN);
const CABINETS_HREF = routeOf(CABINETS);
const REORDER_HREF = routeOf(REORDER);
const QUICK = "quick-action";
const CARD = "reorder-alert-card";
const SETTINGS = "시약장 설정";
const VIEW = "시약장 보기";
/**
 * 역할별 quick-action 라벨 — 디자인 1.15 정식 시안: dev-rules route_auth.home_quick_action
 * ("학생 = 사용 기록 입력·시약장 보기 / 교사 = … / admin = … (모바일 2+1)") 에서 읽고,
 * 교사·admin 은 rules.json app_exceptions["quick-action-cabinet"] ("교사 = …, admin = … (모바일 2+1)") 과 같은지 대조한다.
 */
function parseQuick(text: string, sep: RegExp): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const part of text.split(sep)) {
    const m = part.match(/(학생|교사|admin)\s*=\s*([^(]+)/);
    if (m) out[m[1]] = m[2].replace(/\.\s.*$/, "").trim().split("·").map((s) => s.trim()).filter(Boolean);
  }
  return out;
}
const FROM_DEV = parseQuick(String((devRules as unknown as { route_auth: Record<string, string> }).route_auth.home_quick_action), /\s\/\s/);
const FROM_RULES = parseQuick(String((rules as unknown as { app_exceptions: Record<string, string> }).app_exceptions["quick-action-cabinet"]).replace(/^\d+\s*홈:\s*/, ""), /,\s*/);
const QUICK_LABELS = { student: FROM_DEV["학생"], teacher: FROM_DEV["교사"], admin: FROM_DEV["admin"] } as Record<"student" | "teacher" | "admin", string[]>;

test(`[C1][S${SCREEN}] 기대값 원본: dev-rules route_auth.home_quick_action = rules.json app_exceptions quick-action-cabinet (교사·admin 3칸, 학생 2칸) · 교사·admin 에 "${SETTINGS}", 학생에 "${VIEW}"`, () => {
  expect(QUICK_LABELS.student, "학생 quick-action").toHaveLength(2);
  expect(QUICK_LABELS.teacher, "교사 quick-action").toHaveLength(3);
  expect(QUICK_LABELS.admin, "admin quick-action").toHaveLength(3);
  expect(FROM_RULES["교사"], "rules app_exceptions 교사 = dev-rules").toEqual(QUICK_LABELS.teacher);
  expect(FROM_RULES["admin"], "rules app_exceptions admin = dev-rules").toEqual(QUICK_LABELS.admin);
  for (const r of ["teacher", "admin"] as const) expect(QUICK_LABELS[r]).toContain(SETTINGS);
  expect(QUICK_LABELS.student).toContain(VIEW);
});
const R7 = rules.roles.R7;
const BUTTON_MIN_HEIGHT = (rules as unknown as { button: { min_height: number } }).button.min_height;

const quick = (page: Page) => page.locator(`main ${sel(QUICK)}`);
const quickItems = (page: Page) => quick(page).locator("a, button");
const quickLink = (page: Page, label: string) => quick(page).locator("a").filter({ hasText: exact(label) });

async function waitHome(page: Page): Promise<void> {
  await page.waitForLoadState("load");
  await expect(page.locator(sel("home-summary")).first(), "홈 본문").toBeVisible({ timeout: 30_000 });
  await expect(quick(page), QUICK).toBeVisible();
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
}

/** 로그인 세션(RLS)으로 읽은 자기 학교 시약장 수 */
async function cabinetCount(page: Page): Promise<number> {
  const { client } = await browserClient(page);
  const r = await client.from("cabinets").select("id");
  if (r.error) throw new Error(`cabinets 조회 실패: ${r.error.message}`);
  return (r.data ?? []).length;
}

// =====================================================================
// C1 — quick-action
// =====================================================================

for (const role of SCHOOL_A_ROLES as ("student" | "teacher" | "admin")[]) {
  const labels = QUICK_LABELS[role];
  const cabinetLabel = role === "student" ? VIEW : SETTINGS;
  test(`[C1][S${SCREEN}] ${ROLE_LABEL[role]} 홈 ${QUICK} = ${labels.map((l) => `"${l}"`).join(" · ")} (${labels.length}칸) · "${cabinetLabel}" → ${CABINETS_HREF} 링크가 시약장이 있는 학교에서도 보이고(가려지지 않음) 누르면 화면 ${CABINETS} 도착`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    const { context, page, viewport } = await openAs(browser, info, role, SCREEN);
    try {
      await waitHome(page);
      expect((await browserSession(page)).role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
      expect(await cabinetCount(page), "대조: 학교 A 에는 시약장이 1개 이상 있다 (만든 뒤에도 진입이 보여야 한다)").toBeGreaterThanOrEqual(1);

      await expect(page.locator(sel(QUICK)), `${QUICK} 1개`).toHaveCount(1);
      expect((await quickItems(page).allInnerTexts()).map(clean), `${ROLE_LABEL[role]} ${QUICK} 라벨`).toEqual([...labels]);
      const other = role === "student" ? SETTINGS : VIEW;
      await expect(quick(page).getByText(exact(other)), `${ROLE_LABEL[role]} 에게 "${other}" 는 없다`).toHaveCount(0);

      // 칸: 모두 보이고, 누름 영역 ≥ rules.json button.min_height, 서로 겹치지 않고 화면 폭 안
      const vp = page.viewportSize()!;
      const boxes = [];
      for (const label of labels) {
        const item = quickItems(page).filter({ hasText: exact(label) });
        await expect(item, `칸 "${label}"`).toHaveCount(1);
        await expect(item).toBeVisible();
        const b = await boxOf(item);
        expect(b.height, `칸 "${label}" 높이`).toBeGreaterThanOrEqual(BUTTON_MIN_HEIGHT);
        expect(b.left, `칸 "${label}" 왼쪽이 화면 안`).toBeGreaterThanOrEqual(0);
        expect(b.right, `칸 "${label}" 오른쪽이 화면 안 (${viewport})`).toBeLessThanOrEqual(vp.width + 0.5);
        boxes.push({ label, ...b });
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          const overlap = a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
          expect(overlap, `칸 "${a.label}" 과 "${b.label}" 이 겹치지 않음`).toBe(false);
        }
      }
      // 배치 (s2-spec 1.15 화면 13 · app_exceptions "(모바일 2+1)"): 3칸이면 모바일 = 위 2칸 같은 폭 + 아래 1칸 가로 전체, 데스크탑 = 한 줄 3칸.
      // 학생 2칸 = 한 줄
      const sameRow = (a: { top: number }, b: { top: number }) => Math.abs(a.top - b.top) <= 1;
      if (boxes.length === 3 && viewport === "mobile") {
        const [a, b, c] = boxes;
        expect(sameRow(a, b), "모바일 3칸: 위 2칸 같은 줄").toBe(true);
        expect(Math.abs(a.width - b.width), "모바일 3칸: 위 2칸 같은 폭").toBeLessThanOrEqual(1);
        expect(c.top, "모바일 3칸: 셋째 칸은 아래 줄").toBeGreaterThanOrEqual(Math.max(a.bottom, b.bottom) - 0.5);
        expect(Math.abs(c.left - a.left), "모바일 3칸: 아래 칸 왼쪽 = 위 줄 왼쪽").toBeLessThanOrEqual(1);
        expect(Math.abs(c.right - b.right), "모바일 3칸: 아래 칸 오른쪽 = 위 줄 오른쪽 (가로 전체)").toBeLessThanOrEqual(1);
      } else {
        for (const b of boxes.slice(1)) expect(sameRow(boxes[0], b), `${viewport} ${boxes.length}칸: 한 줄 ("${b.label}")`).toBe(true);
      }

      // 시약장 진입
      const link = quickLink(page, cabinetLabel);
      await expect(link, `"${cabinetLabel}" 링크`).toHaveCount(1);
      await expect(link).toHaveAttribute("href", CABINETS_HREF);
      await link.scrollIntoViewIfNeeded();
      await expect(link).toBeVisible();
      expect(await onTop(link), `"${cabinetLabel}" 이 다른 요소(tab-bar 등)에 덮이지 않음`).toBe(true);
      await link.click();
      await expect.poll(() => new URL(page.url()).pathname, { message: `화면 ${CABINETS} 도착`, timeout: 45_000 }).toBe(CABINETS_HREF);
      await expect(page.locator(`main ${sel("cabinet-switcher")}`), "화면 11 본문 (cabinet-switcher)").toBeVisible({ timeout: 45_000 });
      await expect(page.locator(`main ${sel("cabinet-slot")}`).first(), "시약장 배치도").toBeVisible();
      // 설정 화면: 교사·admin 은 편집 가능, 학생은 보기만 (R7)
      const editable = await countComponent(page, "cabinet-edit");
      if (role === "student") expect(editable, "학생 화면 11 cabinet-edit (R7)").toBe(0);
      else expect(editable, `${ROLE_LABEL[role]} 화면 11 cabinet-edit`).toBeGreaterThanOrEqual(1);
    } finally {
      await context.close();
    }
  });
}

// =====================================================================
// R-ui — 홈에는 cabinet-edit·cabinet-add 가 없다 (시약장이 있는 학교)
// =====================================================================

for (const role of SCHOOL_A_ROLES as ("student" | "teacher" | "admin")[]) {
  test(`[R-ui][S${SCREEN}] ${ROLE_LABEL[role]} 홈(시약장 있는 학교): ${(R7.components ?? []).join("·")} 0 — "시약장 설정"·"시약장 보기" 칸은 진입 링크일 뿐 R7 컴포넌트가 아니다 · 역할 규칙(roles) 상한 유지`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    // rules 1.15 R7 = cabinet-edit·cabinet-add·slot-assign·location-edit·qr-print — 모두 화면 13 소속이 아니다 (dev-rules components)
    expect(R7.components, "R7 컴포넌트에 cabinet-edit·cabinet-add").toEqual(expect.arrayContaining(["cabinet-edit", "cabinet-add"]));
    for (const c of R7.components ?? []) expect(devRules.components[c] ?? [], `dev-rules components ${c} 에 화면 ${SCREEN} 없음`).not.toContain(SCREEN);
    expect([R7.role, R7.max], "R7 학생 max 0").toEqual([ROLE_NAME.student, 0]);
    const { context, page } = await openAs(browser, info, role, SCREEN);
    try {
      await waitHome(page);
      expect(await cabinetCount(page), "대조: 시약장이 1개 이상").toBeGreaterThanOrEqual(1);
      for (const c of R7.components ?? []) expect(await countComponent(page, c), `${ROLE_LABEL[role]} 홈 ${c}`).toBe(0);
      for (const c of roleChecks(SCREEN, ROLE_NAME[role]).filter((k) => k.op === "max")) {
        expect(await countComponent(page, c.component), `${c.rule} ${c.component} ≤ ${c.value}`).toBeLessThanOrEqual(c.value);
      }
      // quick-action 안에는 역할 규칙이 세는 이름 중 그 역할에 금지된 것이 없다
      const inQuick = await quick(page).locator("[data-component]").evaluateAll((els) => els.map((el) => el.getAttribute("data-component") ?? ""));
      for (const c of roleChecks(SCREEN, ROLE_NAME[role]).filter((k) => k.op === "max" && k.value === 0)) {
        expect(inQuick, `${QUICK} 안 ${c.component}`).not.toContain(c.component);
      }
    } finally {
      await context.close();
    }
  });
}

// =====================================================================
// 홈 재주문 카드 → 화면 6
// =====================================================================

for (const role of ["teacher", "admin"] as const) {
  test(`[C1][S${SCREEN}] ${ROLE_LABEL[role]} 홈 ${CARD} 1개 · 그 안의 링크 → ${REORDER_HREF} · 누르면 화면 ${REORDER} 도착(manual-upload 표시)`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    expect(devRules.components[CARD] ?? [], `dev-rules components ${CARD} 에 화면 ${SCREEN}·${REORDER}`).toEqual(expect.arrayContaining([SCREEN, REORDER]));
    const { context, page } = await openAs(browser, info, role, SCREEN);
    try {
      await waitHome(page);
      const card = page.locator(`main ${sel(CARD)}`);
      await expect(card, CARD).toHaveCount(1);
      await expect(card).toBeVisible();
      const link = card.locator(`a[href="${REORDER_HREF}"]`);
      await expect(link, `${CARD} 안 ${REORDER_HREF} 링크`).toHaveCount(1);
      await expect(card.locator("a"), `${CARD} 안 링크는 화면 ${REORDER} 로만`).toHaveCount(1);
      await link.scrollIntoViewIfNeeded();
      expect(await onTop(link), "링크가 덮이지 않음").toBe(true);
      await link.click();
      await expect.poll(() => new URL(page.url()).pathname, { message: `화면 ${REORDER} 도착`, timeout: 45_000 }).toBe(REORDER_HREF);
      await expect(page.locator(`main ${sel("manual-upload")}`), "화면 6 본문").toBeVisible({ timeout: 45_000 });
      expect(new URL(page.url()).pathname, "홈으로 되돌려 보내지 않는다").toBe(REORDER_HREF);
    } finally {
      await context.close();
    }
  });
}

test(`[R-ui][S${SCREEN}] 학교A 학생 홈: ${CARD} 0 (R2) · ${REORDER_HREF} 링크 0 · ${QUICK} 에 "${SETTINGS}"·"입고"·"사용자 관리" 없음`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page } = await openAs(browser, info, "student", SCREEN);
  try {
    await waitHome(page);
    expect(new URL(page.url()).pathname).toBe(HOME_HREF);
    expect((await browserSession(page)).role, "테스트 계정 역할").toBe(PROFILE_ROLE.student);
    expect(await countComponent(page, CARD), `학생 홈 ${CARD}`).toBe(0);
    await expect(linksTo(page, REORDER_HREF), `학생 홈 ${REORDER_HREF} 링크`).toHaveCount(0);
    const labels = (await quickItems(page).allInnerTexts()).map(clean);
    for (const l of [SETTINGS, "입고", "사용자 관리"]) expect(labels, `학생 ${QUICK}`).not.toContain(l);
  } finally {
    await context.close();
  }
});
