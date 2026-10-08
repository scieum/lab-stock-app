// 화면 4 (사용 기록 입력) "메모" 입력 C1 — 시안 4 프레임의 메모 칸 + 화면 10 상세까지의 흐름
// 기준: 디자인 s2-spec "## 화면 4" (필수 라벨 옆 caption "필수"),
//       디자인 1.17 · d7 §15 (2026-10-07): 입력 순서 = 사용량(필수) · usage-date "사용일"(필수) · 사용자(필수) · 메모 (design/frames/4-*.json usage-form 순서),
//       design/frames/4-{mobile|desktop}.json (메모 칸 안내 글자), harness/d7-data.md §1·§7
//       (usage_logs.memo 200자 이하 · 빈 값은 null · 200자 초과는 거부 · 화면 10 상세의 메모, 없으면 "-").
// 운영 DB: 저장 성공 경로는 UI 전용 고정 시약(학교 A, `R-db-UI10-fixture-{project}`)에만, 실행마다 2건(각 1 mL).
//   usage_logs 는 지울 수 없어 기록은 남고, stock 은 테스트마다 교사 세션으로 되돌린다.
//   seed 시약의 stock·기록 수를 비교하는 다른 스펙(db-r-roles · db-n1 · screen-4-record)과 겹치지 않는다.
// 같은 고정 시약을 쓰는 테스트끼리 겹치지 않도록 이 파일은 한 워커에서 순서대로 돈다.
import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { ROLE_LABEL, SCHOOL_A_ROLES, uniqueTag, type Role } from "./db-helpers";
import { openAs, type RolePage } from "./auth-state";
import { PROFILE_ROLE, browserClient, browserSession, countComponent, sel, type ViewportName } from "./screen-helpers";
import { seedSchoolOf } from "./screen-3-helpers";
import { drawer, isDeskPage, newFrame } from "./desk-helpers";
import { SCREEN, TOAST, amountInput, seedOwnReagents, submitButton, usagePath, waitUsage, reagentHead } from "./screen-4-helpers";
import {
  MEMO_NONE,
  UI_FIX_STOCK,
  dbHistory,
  expectDetail,
  frameTexts,
  gotoAndMatch,
  myDisplayName,
  openRow,
  readDetail,
  resetFixtureStock,
  uiFixtureReagent,
  type FixtureReagent,
} from "./screen-10-helpers";

test.describe.configure({ mode: "default" });

const INPUT = "text-input";
const MEMO_LABEL = "메모";
const REQUIRED_MARK = "필수";
/** 시안 4 usage-form 입력 순서 (디자인 1.17 — "사용 날짜" 읽기 전용 칸 → 수량 아래 usage-date "사용일") */
const USED_ON_LABEL = "사용일";
const FIELD_ORDER = ["사용량", USED_ON_LABEL, "사용자", MEMO_LABEL];
const REQUIRED_FIELDS = ["사용량", USED_ON_LABEL, "사용자"];
/** 입력 칸 = text-input · usage-date (usage-date 는 text-input 모양, data-component 만 다름) */
const FIELD_SEL = `:is(${sel(INPUT)}, ${sel("usage-date")})`;
/** d7 §1·§7: 메모 200자 이하 */
const MEMO_MAX = 200;
const AMOUNT = 1;

const memoInput = (page: Page) => page.locator("main form").getByLabel(MEMO_LABEL, { exact: true });
/**
 * 라벨이 이 글자인 입력 칸: 390 = text-input·usage-date(라벨이 칸 안) /
 * 1440 = 드로어 form-row(라벨 칸 + 입력 칸, 시안 4-desktop usage-form — d7 §23 run b)
 */
const fieldOf = (page: Page, label: string) =>
  isDeskPage(page)
    ? drawer(page).locator('form [data-name="form-row"]').filter({ has: page.locator("label").getByText(label, { exact: true }) })
    : page.locator(`main form ${FIELD_SEL}`).filter({ has: page.locator("label").getByText(label, { exact: true }) });
/** 입력 칸 라벨들 (순서대로) */
const fieldLabels = (page: Page) => (isDeskPage(page) ? drawer(page).locator('form [data-name="form-row"] label') : page.locator(`main form ${FIELD_SEL} label`));

/** 시안 4 프레임: field-label "메모" 다음 글자 = 메모 칸 안내 글자 */
function memoPlaceholder(viewport: ViewportName): string {
  if (viewport === "desktop") {
    // 새 프레임 4-desktop: form-row(row-label "메모" → text-input placeholder)
    const nodes = newFrame("4-desktop");
    const i = nodes.findIndex((n) => n.name === "label" && n.path.includes("row-label") && n.text?.characters === MEMO_LABEL);
    expect(i, `시안 4-desktop 에 form-row 라벨 "${MEMO_LABEL}"`).toBeGreaterThanOrEqual(0);
    const next = nodes.slice(i + 1).find((n) => n.text && n.path.includes("text-input"));
    expect(next, "메모 라벨 다음 입력 칸 글자").toBeTruthy();
    return next!.text!.characters;
  }
  const texts = frameTexts(viewport, SCREEN);
  const i = texts.findIndex((t) => t.name === "field-label" && t.characters === MEMO_LABEL);
  expect(i, `시안 4-${viewport} 에 field-label "${MEMO_LABEL}"`).toBeGreaterThanOrEqual(0);
  const next = texts[i + 1];
  expect(next?.name, "메모 라벨 다음은 입력 칸 글자").toBe("input-value");
  return next.characters;
}

type MemoLog = { id: string; user_id: string; reagent_id: string; amount: number; memo: string | null };

async function fixtureLogs(page: Page, reagentId: string): Promise<MemoLog[]> {
  const { client } = await browserClient(page);
  const out: MemoLog[] = [];
  for (let from = 0; ; from += 1000) {
    const r = await client
      .from("usage_logs")
      .select("id, user_id, reagent_id, amount, memo")
      .eq("reagent_id", reagentId)
      .order("id")
      .range(from, from + 999);
    expect(r.error, `usage_logs 조회: ${r.error?.message}`).toBeNull();
    const part = (r.data ?? []) as MemoLog[];
    out.push(...part.map((l) => ({ ...l, amount: Number(l.amount) })));
    if (part.length < 1000) return out;
  }
}

/** 교사 세션 (고정 시약 준비·stock 원복용) — 학교 A 인지 확인 */
async function openStaff(browser: Browser, info: TestInfo): Promise<{ t: RolePage; fx: FixtureReagent }> {
  const t = await openAs(browser, info, "teacher", SCREEN);
  try {
    const me = await browserSession(t.page);
    expect(me.role, "원복용 계정 역할").toBe(PROFILE_ROLE.teacher);
    expect(me.schoolName, "쓰기는 테스트 학교 A 에서만").toBe(seedSchoolOf("teacher").name);
    const fx = await uiFixtureReagent(t.page, info);
    await resetFixtureStock(t.page, fx.id);
    return { t, fx };
  } catch (e) {
    await t.context.close();
    throw e;
  }
}

// ---------- 구조 (DB 불변) ----------
for (const role of [...SCHOOL_A_ROLES, "schoolB"] as Role[]) {
  test(`[C1][S${SCREEN}] ${ROLE_LABEL[role]} "${MEMO_LABEL}" 입력: ${INPUT} 순서 ${FIELD_ORDER.join(" · ")} · "${MEMO_LABEL}" 에는 "${REQUIRED_MARK}" 표시 없음(선택 항목) · maxlength ${MEMO_MAX} · 안내 글자 = 시안 · 비어 있음`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const { own } = seedOwnReagents(role);
    const { context, page, viewport } = await openAs(browser, info, role, SCREEN, usagePath(own[0].id));
    try {
      await waitUsage(page, true);
      expect((await browserSession(page)).role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);

      // 라벨 순서: 사용량 · 사용일 · 사용자 · 메모 ("필수" 표시 글자는 라벨 안에 있을 수 있어 뗀다)
      const labels = (await fieldLabels(page).allInnerTexts()).map((t) => t.replace(REQUIRED_MARK, "").trim());
      expect(labels.filter((l) => FIELD_ORDER.includes(l)), "입력 순서 (시안 4 · d7 §15)").toEqual(FIELD_ORDER);
      if (isDeskPage(page)) await expect(fieldOf(page, USED_ON_LABEL).locator(sel("usage-date")), `"${USED_ON_LABEL}" 은 usage-date`).toHaveCount(1);
      else await expect(fieldOf(page, USED_ON_LABEL).and(page.locator(sel("usage-date"))), `"${USED_ON_LABEL}" 은 usage-date`).toHaveCount(1);
      expect(labels[labels.length - 1], `"${MEMO_LABEL}" 은 마지막 입력`).toBe(MEMO_LABEL);

      // 필수 표시: 사용량·사용일·사용자에만
      for (const l of REQUIRED_FIELDS) {
        await expect(fieldOf(page, l), `${INPUT} "${l}"`).toHaveCount(1);
        await expect(fieldOf(page, l).getByText(REQUIRED_MARK, { exact: true }), `"${l}" 옆 "${REQUIRED_MARK}"`).toHaveCount(1);
      }
      const field = fieldOf(page, MEMO_LABEL);
      await expect(field, `${INPUT} "${MEMO_LABEL}" 1개`).toHaveCount(1);
      await expect(field).toBeVisible();
      await expect(field.getByText(REQUIRED_MARK), `"${MEMO_LABEL}" 에 "${REQUIRED_MARK}" 표시 없음`).toHaveCount(0);

      const memo = memoInput(page);
      await expect(memo, "메모 입력 1개").toHaveCount(1);
      await expect(field.locator("input, textarea"), "메모 입력은 text-input 안").toHaveCount(1);
      await expect(memo).toBeVisible();
      await expect(memo, "시약이 정해졌으면 쓸 수 있다").toBeEditable();
      await expect(memo).toHaveValue("");
      expect(await memo.evaluate((el) => (el as HTMLInputElement).required), "메모는 필수 아님").toBe(false);
      await expect(memo, `maxlength ${MEMO_MAX}`).toHaveAttribute("maxlength", String(MEMO_MAX));
      await expect(memo, "안내 글자 = 시안").toHaveAttribute("placeholder", memoPlaceholder(viewport));

      // 메모를 써도 저장 전에는 토스트가 없다
      await memo.fill("메모만");
      await expect(memo).toHaveValue("메모만");
      await expect(amountInput(page)).toHaveValue("");
      expect(await countComponent(page, TOAST), "입력만으로 토스트 없음").toBe(0);
      // 키보드로 MEMO_MAX 보다 길게 칠 수 없다
      await memo.fill("");
      await memo.pressSequentially("가".repeat(MEMO_MAX + 5), { delay: 0 });
      expect([...(await memo.inputValue())].length, `입력 길이 ≤ ${MEMO_MAX}`).toBeLessThanOrEqual(MEMO_MAX);
      expect([...(await memo.inputValue())].length, "입력이 들어감").toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });
}

// ---------- 저장 → DB → 화면 10 상세 ----------
type SaveCase = { role: Role; withMemo: boolean };
const SAVES: SaveCase[] = [
  { role: "student", withMemo: true },
  { role: "admin", withMemo: false },
];

for (const c of SAVES) {
  const what = c.withMemo ? "메모와 함께 저장 → usage_logs.memo = 입력값 → 화면 10 상세에 그 메모" : `메모 없이 저장 → usage_logs.memo null → 화면 10 상세 메모 "${MEMO_NONE}"`;
  test(`[C1][S${SCREEN}] ${ROLE_LABEL[c.role]} ${what} · 저장 후 메모·사용량 칸 초기화 (고정 시약 ${AMOUNT} mL, stock 원복)`, async ({ browser }, info) => {
    test.setTimeout(240_000);
    const { t, fx } = await openStaff(browser, info);
    try {
      const { context, page } = await openAs(browser, info, c.role, SCREEN, usagePath(fx.id));
      try {
        await waitUsage(page, true);
        const me = await browserSession(page);
        expect(me.role, "테스트 계정 역할").toBe(PROFILE_ROLE[c.role]);
        expect(me.schoolName, "쓰기는 테스트 학교 A 에서만").toBe(seedSchoolOf("teacher").name);
        await expect(reagentHead(page).first(), "카드에 고정 시약명").toContainText(fx.name);
        const myName = await myDisplayName(page);
        const before = new Set((await fixtureLogs(page, fx.id)).map((l) => l.id));
        const text = c.withMemo ? `UI 메모 ${uniqueTag(info)} 1반 3조` : "";

        await amountInput(page).fill(String(AMOUNT));
        if (c.withMemo) {
          await memoInput(page).fill(text);
          await expect(memoInput(page)).toHaveValue(text);
        } else {
          await expect(memoInput(page), "메모는 비워 둔다").toHaveValue("");
        }
        await expect(submitButton(page), "메모가 비어도 필수 항목이 차면 저장 가능").toBeEnabled();
        await submitButton(page).click();

        const toast = page.locator(sel(TOAST));
        await expect(toast, `저장 후 ${TOAST}`).toHaveCount(1, { timeout: 30_000 });
        await expect(toast).toContainText("사용 기록을 저장했어요");
        await expect(page.locator('main [role="alert"]'), "성공 시 에러 없음").toHaveCount(0);
        // 저장 후 초기화
        await expect(memoInput(page), "저장 후 메모 칸 초기화").toHaveValue("");
        await expect(amountInput(page), "저장 후 사용량 칸 초기화").toHaveValue("");

        // DB: 내가 만든 새 행 1개, memo 일치
        const added = (await fixtureLogs(page, fx.id)).filter((l) => !before.has(l.id) && l.user_id === me.userId);
        expect(added, "usage_logs 내 새 행 1개").toHaveLength(1);
        expect(added[0].amount, "usage_logs.amount").toBe(AMOUNT);
        expect(added[0].memo, "usage_logs.memo").toBe(c.withMemo ? text : null);

        // 화면 10: 그 기록의 상세
        const f = { q: fx.name, mine: true };
        const snap = await gotoAndMatch(page, f);
        const idx = snap.shown.findIndex((r) => r.id === added[0].id);
        expect(idx, "방금 저장한 기록이 화면 10 목록(내 기록 · 시약명 검색)에 있다").toBeGreaterThanOrEqual(0);
        expect(idx, "최신순 — 방금 저장한 내 기록이 첫 행").toBe(0);
        expect(snap.flat[idx].user, "행의 사용자 = 저장한 사람").toBe(myName);
        await openRow(page, idx);
        await expectDetail(page, snap.shown[idx]);
        const d = await readDetail(page);
        expect(d.fields["메모"], "화면 10 상세 메모").toBe(c.withMemo ? text : MEMO_NONE);
        expect(d.fields["사용자"], "화면 10 상세 사용자").toBe(myName);
        // DB 함수로도 같은 값
        const row = (await dbHistory(page, f)).find((r) => r.id === added[0].id);
        expect(row?.memo ?? null, "usage_history memo").toBe(c.withMemo ? text : null);
      } finally {
        await context.close();
      }
    } finally {
      await resetFixtureStock(t.page, fx.id).catch(() => undefined);
      const { client } = await browserClient(t.page);
      const after = await client.from("reagents").select("stock").eq("id", fx.id).single();
      await t.context.close();
      expect(Number(after.data?.stock), "고정 시약 stock 원복").toBe(UI_FIX_STOCK);
    }
  });
}

// ---------- 200자 초과 거부 (DB 불변) ----------
test(`[C1][S${SCREEN}] 학교A 교사 메모 ${MEMO_MAX + 1}자(입력 제한을 우회해 넣은 값) 저장 시도: 에러 표시 · ${TOAST} 없음 · usage_logs·stock 불변`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const { t, fx } = await openStaff(browser, info);
  try {
    const { context, page } = await openAs(browser, info, "teacher", SCREEN, usagePath(fx.id));
    try {
      await waitUsage(page, true);
      const before = (await fixtureLogs(page, fx.id)).map((l) => l.id).sort();
      const long = "가".repeat(MEMO_MAX + 1);
      await amountInput(page).fill(String(AMOUNT));
      // maxlength 는 사용자가 치는 글자만 막는다 — 스크립트로 값을 넣어(입력 이벤트까지) 화면 상태에 초과 값을 만든다
      await memoInput(page).evaluate((el, v) => {
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }, long);
      expect([...(await memoInput(page).inputValue())].length, "전제: 입력 칸에 초과 값이 들어감").toBe(MEMO_MAX + 1);
      await expect(submitButton(page)).toBeEnabled();
      await submitButton(page).click();

      const alert = page.locator('main [role="alert"]');
      await expect(alert.first(), `${MEMO_MAX}자 초과 → 에러 표시`).toBeVisible({ timeout: 30_000 });
      expect(await countComponent(page, TOAST), `${TOAST} 없음`).toBe(0);
      expect((await fixtureLogs(page, fx.id)).map((l) => l.id).sort(), "usage_logs 불변").toEqual(before);
      const { client } = await browserClient(page);
      const stock = await client.from("reagents").select("stock").eq("id", fx.id).single();
      expect(Number(stock.data?.stock), "stock 불변").toBe(UI_FIX_STOCK);
    } finally {
      await context.close();
    }
  } finally {
    await resetFixtureStock(t.page, fx.id).catch(() => undefined);
    await t.context.close();
  }
});
