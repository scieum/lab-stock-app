// 화면 4 (사용 기록, dev-rules.json routes["4"]) 구조 규칙: C1 · C2 · R-ui · V1 — 디자인 1.25 여러 시약 사용 기록 (d7 §24).
// 기대값: design/rules.json (screens_required 4 · variants 4 · tab_bar · roles · usage_batch) · harness/dev-rules.json (viewports, components)
//   · 새 프레임 4-{mobile|desktop} · 4-picker · 4-empty · 4-error · 4-past-date.
// 로그인은 auth-state.ts 의 역할별 storageState 를 재사용한다. 이 파일은 저장하지 않는다 (서버 쓰기 요청 0 — 재고 불변).
// 저장 흐름(토스트 · DB)은 screen-4-batch.spec.ts (일회용 학교).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { ROLE_LABEL, SCHOOL_A_ROLES, type Role } from "./db-helpers";
import { openAs } from "./auth-state";
import { PROFILE_ROLE, ROLE_NAME, browserClient, browserSession, countComponent, devRules, roleChecks, rules, sel } from "./screen-helpers";
import {
  ADD,
  EMPTY,
  ITEM,
  LIST,
  OVER,
  PICKER,
  RECENT_CHIP,
  RECENT_MAX,
  SAVE_EMPTY,
  classText,
  SCREEN,
  TOAST,
  amountOf,
  dateInput,
  dbStock,
  exact,
  openPicker,
  overText,
  saveButton,
  saveLabel,
  seedOwnReagents,
  usagePath,
  waitUsage,
} from "./screen-4-helpers";
import { NEW_FRAMES_DIR, framePath } from "../frames";
import { SHELL_COMPONENTS, expectShell, isShellComponent } from "./shell-helpers";
import { deskOnlyComponents } from "../desktop-shell";
import { DRAWER, countScoped, isDeskPage, mobileOnlyOf } from "./desk-helpers";
import { watchActions } from "./screen-11-helpers";

const ROLES: Role[] = [...SCHOOL_A_ROLES, "schoolB"];

/** design/frames/{name}.json 의 노드 이름 (dev-rules components 에 있는 이름만) */
function frameNames(name: string): Set<string> {
  const j = JSON.parse(readFileSync(framePath(`${name}`), "utf8")) as { frames: { nodes: { name: string }[] }[] };
  return new Set(j.frames[0].nodes.map((n) => n.name).filter((n) => devRules.components[n]));
}
/** 화면 4 의 모든 새 프레임(4-* · 둘러보기 없음)에 나오는 이름 */
const ALL_4_FRAMES = readdirSync(NEW_FRAMES_DIR).filter((f) => /^4-/.test(f));
const IN_ANY_4_FRAME = new Set(ALL_4_FRAMES.flatMap((f) => [...frameNames(f.replace(/\.json$/, ""))]));
/** rules.json variants[4] (1.25: past-date · picker · empty · error) */
const VARIANTS4 = (rules as unknown as { variants: Record<string, Record<string, string[]>> }).variants[String(SCREEN)] ?? {};
const seoulDaysAgo = (days: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() - days * 86_400_000));

/** rules.json roles 상 이 역할에 0개여야 하는 컴포넌트 */
function forbiddenFor(role: Role): Set<string> {
  const name = role === "schoolB" ? "교사" : ROLE_NAME[role as keyof typeof ROLE_NAME];
  return new Set(roleChecks(SCREEN, name).filter((c) => c.op === "max" && c.value === 0).map((c) => c.component));
}

test(`[C1][S${SCREEN}] 기대값 원본: screens_required[4] ⊂ 새 4 프레임 · variants[4] = past-date·picker·empty·error 의 컴포넌트가 그 상태 프레임에 있음 · 데스크톱 = 본문 페이지(heavy_pages, ${DRAWER} 0)`, () => {
  const required = rules.screens_required[String(SCREEN)] as string[];
  expect(required, "screens_required 4 (1.25)").toEqual(expect.arrayContaining(["usage-date", LIST, ITEM, "class-select"]));
  for (const n of required) expect(frameNames("4-mobile").has(n) && frameNames("4-desktop").has(n), `screens_required ${n} 은 4-mobile·4-desktop 에`).toBe(true);
  expect(Object.keys(VARIANTS4).sort(), "variants 4 상태").toEqual(["empty", "error", "past-date", "picker"]);
  for (const [state, names] of Object.entries(VARIANTS4)) {
    for (const vp of ["mobile", "desktop"]) for (const n of names) expect(frameNames(`4-${state}-${vp}`), `variants 4.${state} ${n} 은 4-${state}-${vp} 에`).toContain(n);
  }
  const heavy = (rules as unknown as { desktop_shell: { heavy_pages: number[] } }).desktop_shell.heavy_pages;
  expect(heavy, "heavy_pages 에 4").toContain(SCREEN);
  for (const f of ALL_4_FRAMES) expect(frameNames(f.replace(/\.json$/, "")).has(DRAWER), `${f} 드로어 없음`).toBe(false);
});

// ---------- C1 ----------
for (const role of ROLES) {
  test(`[C1][S${SCREEN}] ${ROLE_LABEL[role]} ?reagent 자기 학교 시약: screens_required[${SCREEN}] · dev-rules components 중 화면 ${SCREEN} 컴포넌트(기본 프레임 4-{폭}) 표시 (${TOAST} 는 저장 전 0) · variants 상태(past-date · error · picker · empty)는 그 상태에서 · 쓰기 요청 0`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    const required = rules.screens_required[String(SCREEN)] as string[];
    const forbidden = forbiddenFor(role);
    const fromDev = Object.entries(devRules.components)
      .filter(([, screens]) => screens.includes(SCREEN))
      .map(([n]) => n);
    expect(fromDev, `${TOAST} 는 화면 ${SCREEN} 컴포넌트 (저장 뒤 검사는 screen-4-batch)`).toContain(TOAST);
    const desk = info.project.name === "desktop";
    const deskOnly = deskOnlyComponents();
    const mobileOnly = mobileOnlyOf(SCREEN, SHELL_COMPONENTS);
    expect(mobileOnly, "새 4 프레임: 모바일에만 있는 화면 4 본문 컴포넌트 없음 (같은 컴포넌트를 폭마다 다르게 배치)").toEqual([]);
    expect(deskOnly, "data-table 은 데스크톱 전용").toContain("data-table");
    const widthOff = desk ? mobileOnly : deskOnly;
    const baseFrame = frameNames(`${SCREEN}-${info.project.name}`);
    const variantOnly = [...new Set(Object.values(VARIANTS4).flat())].filter((n) => fromDev.includes(n) && !baseFrame.has(n));
    expect(variantOnly.sort(), "기본 프레임에 없고 variants[4] 에만 있는 컴포넌트").toEqual([EMPTY, "past-date-note", PICKER, OVER].sort());
    // dev-rules components 에 4 가 있지만 새 4 프레임 어디에도 없는 것 (1.25 에서 화면 4 의 reagent-detail-card 가 사라짐 — dev-rules 갱신 대상, 보고)
    const frameless = fromDev.filter((n) => !IN_ANY_4_FRAME.has(n) && !isShellComponent(n) && n !== TOAST && !deskOnly.includes(n));

    const { school, own } = seedOwnReagents(role);
    const pick = own[0];
    const { context, page, response, viewport } = await openAs(browser, info, role, SCREEN, usagePath(pick.id));
    const actions = watchActions(page);
    try {
      expect(response?.status(), "자기 학교 시약 사용 기록 화면 응답").toBe(200);
      await waitUsage(page);
      await expectShell(page, viewport, SCREEN, `${ROLE_LABEL[role]} 화면 ${SCREEN}`);
      const me = await browserSession(page);
      expect(me.role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
      expect(me.schoolName, "테스트 계정 학교 = seed 학교").toBe(school.name);
      // ?reagent 의 시약이 담긴 채 시작 (rules usage_batch.entry)
      await expect(page.locator(`main ${sel(ITEM)}`), "담은 시약 1").toHaveCount(1);
      await expect(page.locator(`main ${sel(ITEM)}`).first(), "담은 시약 = ?reagent 의 시약").toContainText(pick.name);
      const body = page.locator("body");
      const count = (name: string) => countScoped(body, name);
      for (const name of widthOff) await expect(page.locator(sel(name)), `${name} — ${desk ? "모바일" : "데스크톱"} 전용 (폭 ${viewport}: 0)`).toHaveCount(0, { timeout: 30_000 });
      await expect(page.locator(sel(DRAWER)), "본문 페이지 — 드로어 0").toHaveCount(0);

      for (const name of required) {
        if (forbidden.has(name)) continue;
        expect(await count(name), `screens_required ${name}`).toBeGreaterThanOrEqual(1);
      }
      const appEx = (rules as unknown as { app_exceptions: Record<string, string> }).app_exceptions;
      for (const name of fromDev) {
        if (isShellComponent(name) || widthOff.includes(name)) continue;
        if (name in appEx) {
          expect(await count(name), `셸 ${name} = 1`).toBe(1);
          continue;
        }
        if (forbidden.has(name)) {
          expect(await count(name), `${name} (roles 상 ${ROLE_LABEL[role]} 0)`).toBe(0);
          continue;
        }
        if (name === TOAST) {
          expect(await count(name), `${name} 저장 전`).toBe(0);
          continue;
        }
        if (variantOnly.includes(name)) {
          expect(await count(name), `${name} 기본 상태 0 (variants[4] 상태 컴포넌트)`).toBe(0);
          continue;
        }
        if (name === RECENT_CHIP) {
          // rules class_info.recent: 그 사용자의 최근 기록에서 서로 다른 조합 최대 3 — 데이터에 따라 (공용 계정은 쓰지 않고 자기 세션으로 읽어 센다)
          const { client, userId } = await browserClient(page);
          const logs = await client.from("usage_logs").select("class_grade, class_no, class_subject").eq("user_id", userId).order("used_at", { ascending: false }).limit(100);
          expect(logs.error, "자기 세션 usage_logs").toBeNull();
          const combos: string[] = [];
          for (const l of logs.data ?? []) {
            const t = classText(l.class_grade as number | null, l.class_no as number | null, (l.class_subject as string | null) ?? null);
            if (t && !combos.includes(t)) combos.push(t);
          }
          const want = combos.slice(0, RECENT_MAX);
          expect(await count(name), `${name} = 내 최근 조합 ${want.length}`).toBe(want.length);
          if (want.length) expect((await page.locator(sel(name)).allInnerTexts()).map((x) => x.trim()), "최근 조합 글자").toEqual(want);
          continue;
        }
        if (frameless.includes(name)) {
          expect(await count(name), `${name}: 새 4 프레임 어디에도 없음 → 0`).toBe(0);
          continue;
        }
        expect(await count(name), `${name}`).toBeGreaterThanOrEqual(1);
        await expect(page.locator(sel(name)).first(), `${name} 보임`).toBeVisible();
      }
      // 저장 버튼 = 고정 바 안 button-primary "사용 기록 저장 · 1개" — 사용량이 비어 있어 비활성 (rules usage_batch.errors 빈 값)
      await expect(saveButton(page), `저장 "${saveLabel(1)}"`).toHaveText(exact(saveLabel(1)));
      await expect(saveButton(page), "사용량 빈 값 → 저장 비활성").toBeDisabled();

      // variants 4.past-date: 사용일을 어제로
      await dateInput(page).fill(seoulDaysAgo(1));
      for (const name of VARIANTS4["past-date"]) await expect(page.locator(sel(name)).first(), `variants[4].past-date ${name} 보임`).toBeVisible();
      await dateInput(page).fill(seoulDaysAgo(0));
      await expect(page.locator(sel("past-date-note")), "오늘로 되돌림 → past-date-note 0").toHaveCount(0);
      // variants 4.error: 사용량 > 현재 재고 → 그 행 usage-over-stock "재고 {재고}보다 많아요" + 저장 비활성
      const st = await dbStock(page, pick.id);
      expect(st, "자기 세션(RLS)으로 시약 재고 읽음").not.toBeNull();
      await amountOf(page, pick.name).fill(String(st!.stock + 1));
      for (const name of VARIANTS4.error) await expect(page.locator(sel(name)).first(), `variants[4].error ${name} 보임`).toBeVisible();
      await expect(page.locator(`main ${sel(OVER)}`), "재고 초과 안내 문구 (rules usage_batch.errors)").toHaveText(exact(overText(st!.stock, st!.unit)));
      await expect(saveButton(page), "재고 초과 → 저장 비활성").toBeDisabled();
      await amountOf(page, pick.name).fill("");
      // variants 4.picker: 시약 고르기 열기 (저장하지 않고 닫는다)
      await openPicker(page);
      for (const name of VARIANTS4.picker) await expect(page.locator(sel(name)).first(), `variants[4].picker ${name} 보임`).toBeVisible();
      if (isDeskPage(page)) await page.keyboard.press("Escape");
      else await page.locator(sel(PICKER)).getByRole("button", { name: exact("닫기") }).first().click();
      await expect(page.locator(sel(PICKER)), "고르기 닫힘").toHaveCount(0);
      // variants 4.empty: 시약 없이 들어오면 (홈 quick-action · 탭 "기록")
      await page.goto(usagePath());
      await waitUsage(page);
      for (const name of VARIANTS4.empty) await expect(page.locator(`main ${sel(name)}`).first(), `variants[4].empty ${name} 보임`).toBeVisible();
      await expect(page.locator(`main ${sel(ITEM)}`), "빈 채 시작").toHaveCount(0);
      await expect(saveButton(page), `0개 저장 버튼 "${SAVE_EMPTY}"`).toHaveText(exact(SAVE_EMPTY));
      await expect(saveButton(page), "0개 → 저장 비활성").toBeDisabled();
      expect(actions.count(), "쓰기 요청 0건 (저장하지 않음)").toBe(0);
    } finally {
      await context.close();
    }
  });
}

// ---------- C2 ----------
for (const role of ROLES) {
  test(`[C2][S${SCREEN}] ${ROLE_LABEL[role]}: 탭바 = rules.json tab_bar 기준 (390 표시·항목 수·라벨 순서, 1440 미표시) · 390 저장 바는 탭바 위`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const tb = rules.tab_bar;
    const { own } = seedOwnReagents(role);
    const { context, page, viewport } = await openAs(browser, info, role, SCREEN, usagePath(own[0].id));
    try {
      await waitUsage(page);
      const shown = viewport === "mobile" && tb.mobile_screens.includes(SCREEN);
      await expect(page.locator(sel(tb.component)), `${viewport} ${tb.component}`).toHaveCount(shown ? 1 : 0);
      await expect(page.locator(sel(tb.item)), `${viewport} ${tb.item}`).toHaveCount(shown ? tb.items : 0);
      if (shown) {
        expect(tb.labels.length, "rules.json tab_bar labels 수 = items").toBe(tb.items);
        const tabItems = page.locator(`${sel(tb.component)} ${sel(tb.item)}`);
        await expect(tabItems, "tab-item 은 tab-bar 안에").toHaveCount(tb.items);
        const labels = (await tabItems.allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
        expect(labels, "탭 라벨 순서").toEqual(tb.labels);
        // rules usage_batch.save "맨 아래 고정 바(모바일 = 탭바 위)"
        const bar = (await saveButton(page).boundingBox())!;
        const tab = (await page.locator(sel(tb.component)).boundingBox())!;
        expect(bar.y + bar.height, "저장 버튼은 탭바 위").toBeLessThanOrEqual(tab.y + 1);
      }
    } finally {
      await context.close();
    }
  });
}

// ---------- R-ui ----------
for (const role of SCHOOL_A_ROLES) {
  const roleName = ROLE_NAME[role as keyof typeof ROLE_NAME];
  const checks = roleChecks(SCREEN, roleName);
  if (checks.length === 0) continue;
  for (const withReagent of [true, false]) {
    test(`[R-ui][S${SCREEN}] ${ROLE_LABEL[role]} 사용 기록(${withReagent ? "?reagent 지정" : "빈 채 시작"}): roles ${[...new Set(checks.map((c) => c.rule))].join("·")} 개수 · 사용 기록 칸은 모든 역할에 (rules usage_batch.roles)`, async ({ browser }, info) => {
      test.setTimeout(120_000);
      expect(rules as unknown as { usage_batch: { roles: string } }).toBeTruthy();
      const { own } = seedOwnReagents(role);
      const { context, page } = await openAs(browser, info, role, SCREEN, usagePath(withReagent ? own[0].id : undefined));
      try {
        await waitUsage(page);
        expect((await browserSession(page)).role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
        for (const c of checks) {
          const n = await countComponent(page, c.component);
          if (c.op === "max") expect(n, `${c.rule} ${c.component} ≤ ${c.value}`).toBeLessThanOrEqual(c.value);
          else {
            expect(n, `${c.rule} ${c.component} ≥ ${c.value}`).toBeGreaterThanOrEqual(c.value);
            await expect(page.locator(sel(c.component)).first(), `${c.rule} ${c.component} 보임`).toBeVisible();
          }
        }
        // 모든 역할(학생 포함): 담기 · 저장 칸이 있다
        await expect(page.locator(`main ${sel(ADD)}`).first(), "reagent-add").toBeVisible();
        await expect(saveButton(page), "저장 버튼").toHaveCount(1);
      } finally {
        await context.close();
      }
    });
  }
}

test(`[R-ui][S${SCREEN}] rules.json roles 중 학생 max 규칙이 화면 ${SCREEN} 학생 검사에 모두 포함됨 · usage_batch.roles = 모든 역할(학생 포함)`, () => {
  const studentMax = Object.entries(rules.roles).filter(([, r]) => r.role === ROLE_NAME.student && r.max !== undefined);
  expect(studentMax.length, "rules.json 학생 max 규칙").toBeGreaterThan(0);
  const checks = roleChecks(SCREEN, ROLE_NAME.student);
  for (const [id] of studentMax) expect(checks.some((c) => c.rule === id), `학생 검사에 ${id}`).toBe(true);
  expect((rules as unknown as { usage_batch: { roles: string } }).usage_batch.roles).toMatch(/모든 역할\(학생 포함\)/);
});

// ---------- V1 (보고용 스크린샷, 실패 조건 아님) ----------
test(`[V1][S${SCREEN}] 화면 ${SCREEN} 스크린샷 저장 (학생, ?reagent 학교 A seed 시약, 저장 전)`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { own } = seedOwnReagents("student");
  const { context, page, viewport } = await openAs(browser, info, "student", SCREEN, usagePath(own[0].id));
  try {
    await waitUsage(page).catch(() => undefined);
    await page.screenshot({ path: join(process.cwd(), "test-results", `v1-${SCREEN}-${viewport}.png`), fullPage: false });
  } finally {
    await context.close();
  }
});
