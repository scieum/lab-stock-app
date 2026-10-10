// 화면 3 시약 삭제(= 보관) 흐름 — C1 · R-ui · GM-ui (390 · 1440). 일회용 학교.
// 기준(구현이 아니라 여기서 도출): harness/d7-data.md §24 "시약 삭제 (화면 3)" · "삭제 DB = 보관", design/rules.json 1.25 reagent_delete
//   (roles · entry · confirm · after · history) · roles R5(학생 reagent-more-menu·reagent-delete 0) · guest.hidden_components · variants["3"].delete,
//   새 프레임 3-delete-{mobile|desktop} (⋯ 위치 · 확인 모달 글자).
// - 진입 = 화면 3 만: 모바일 reagent-detail-card 오른쪽 위 ⋯ / 데스크톱 detail-drawer 머리 × 왼쪽 ⋯ → "시약 삭제" → 확인 모달 → 토스트 "시약을 삭제했어요" → 화면 2.
// - 보관 뒤 목록 · 시약장 칸 · 홈 · 재주문 알림에서 빠지고, 상세 주소는 없는 시약과 같은 응답(404).
// 데이터: 일회용 학교(admin·교사·학생 — service role 로 생성)의 임시 시약에만. 판정은 화면 + 대조 조회(service role). 공용 학교 A·B·데모 불변.
import { join } from "node:path";
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { routeOf, rules, sel } from "./screen-helpers";
import { drawer, isDeskPage, newFrame, waitDrawer } from "./desk-helpers";
import { HAS_SERVICE, openTemp, service, tempSchoolLike, type TempUser } from "./screen-8-helpers";
import { DOUBLE, NO_S11_RESIDUE, cleanup, makeFixture, prepCabinet, prepLayout, prepPlace, prepReagent, sharedCabinetSnapshot, watchActions, type S11Fixture } from "./screen-11-helpers";
import { guestDetailPath, openGuest, demoReagents } from "./guest-helpers";

test.describe.configure({ mode: "default" });

const GROUP = "s3del";
const TIMEOUT = 300_000;
const NO_SERVICE_REASON = "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)";
const MORE = "reagent-more-menu";
const DELETE = "reagent-delete";
const MODAL = "ex-modal-card";
const TOAST = "ex-toast";

// ---------- 기대값: rules.json reagent_delete ----------
type DeleteRules = { roles: string[]; entry: string; confirm: string; after: string; history: string };
const RD = (rules as unknown as { reagent_delete: DeleteRules }).reagent_delete;
const quotes = (s: string) => [...s.matchAll(/'([^']+)'/g)].map((m) => m[1]);
/** entry "항목 reagent-delete '시약 삭제'" */
const ITEM_LABEL = quotes(RD.entry).find((q) => q === "시약 삭제")!;
/** confirm 제목 "\"'{시약명}' 시약을 삭제할까요?\"" */
const TITLE_TPL = (/"('\{시약명\}' [^"]+)"/.exec(RD.confirm) ?? [])[1] ?? "";
const titleOf = (name: string) => TITLE_TPL.replace("{시약명}", name);
const [BODY, NOTE, CANCEL, CONFIRM] = quotes(RD.confirm).filter((q) => !q.includes("{시약명}") && q !== "시약 삭제" && !/^\{/.test(q));
/** after "ex-toast '시약을 삭제했어요' → 화면 2" */
const DONE = quotes(RD.after)[0];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exact = (s: string) => new RegExp(`^\\s*${esc(s)}\\s*$`);

// ---------- 일회용 학교 ----------
let fixtureCache: Promise<S11Fixture> | null = null;
function fixture(info: TestInfo): Promise<S11Fixture> {
  fixtureCache ??= makeFixture(info, GROUP);
  fixtureCache.catch(() => {
    fixtureCache = null;
  });
  return fixtureCache;
}
const detailPath = (id: string) => routeOf(3).replace(/\[[^\]]+\]/, id);
async function rowOf(id: string): Promise<{ deleted_at: string | null; deleted_by: string | null; slot_id: string | null; name: string }> {
  const r = await service().from("reagents").select("deleted_at, deleted_by, slot_id, name").eq("id", id).single();
  if (r.error) throw new Error(`대조 조회 실패: ${r.error.message}`);
  return r.data as { deleted_at: string | null; deleted_by: string | null; slot_id: string | null; name: string };
}

/** 이 화면 3 의 범위: 모바일 = reagent-detail-card · 데스크톱 = detail-drawer */
const scope3 = (page: Page) => (isDeskPage(page) ? drawer(page) : page.locator(`main ${sel("reagent-detail-card")}`));
async function waitDetail3(page: Page): Promise<void> {
  if (isDeskPage(page)) await waitDrawer(page);
  else await expect(page.locator(`main ${sel("reagent-detail-card")}`)).toBeVisible({ timeout: 45_000 });
  await page.waitForLoadState("load");
}
const moreButton = (page: Page) => scope3(page).locator(`${sel(MORE)} button[aria-haspopup="menu"]`);
async function openMenu(page: Page): Promise<void> {
  await expect(async () => {
    await moreButton(page).click();
    await expect(page.locator(sel(DELETE)), "⋯ → 시약 삭제").toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

let sharedBefore: string[] | null = null;
test.beforeAll(async ({}, info) => {
  info.setTimeout(120_000);
  if (HAS_SERVICE) sharedBefore = await sharedCabinetSnapshot();
});
test.afterAll(async ({}, info) => {
  info.setTimeout(TIMEOUT);
  if (!HAS_SERVICE) return;
  fixtureCache = null;
  const sb = service();
  const schools = await sb.from("schools").select("id").like("neis_code", tempSchoolLike(GROUP, info.project.name));
  const ids = (schools.data ?? []).map((s) => s.id as string);
  if (ids.length) await sb.from("usage_logs").delete().in("school_id", ids);
  const left = await cleanup(GROUP, info.project.name);
  expect(left, "일회용 계정·학교·시약·기록 잔여물").toEqual(NO_S11_RESIDUE);
  if (sharedBefore) expect(await sharedCabinetSnapshot(), "학교 A·B·데모 학교의 시약장·칸·시약 배치가 그대로").toEqual(sharedBefore);
});

test(`[C1][S3] 기대값 원본: rules reagent_delete 문구("${ITEM_LABEL}" · "${titleOf("{시약명}")}" · "${BODY}" · "${NOTE}" · "${CANCEL}"/"${CONFIRM}" · 토스트 "${DONE}") = 3-delete 프레임 · roles 교사·admin · R5 · guest 숨김 · variants 3.delete`, () => {
  expect(RD.roles, "교사·admin").toEqual(["교사", "admin"]);
  expect([ITEM_LABEL, BODY, NOTE, CANCEL, CONFIRM, DONE].every(Boolean), "rules 문구 모두 읽음").toBe(true);
  for (const vp of ["mobile", "desktop"]) {
    const f = newFrame(`3-delete-${vp}`);
    const texts = (pred: (n: (typeof f)[number]) => boolean) => f.filter((n) => n.text && pred(n)).map((n) => n.text!.characters);
    const name = texts((n) => n.name === "reagent-name" || (n.name === "title" && n.path.includes("drawer-head")))[0];
    expect(texts((n) => n.path.includes(MODAL) && n.name === "heading"), `3-delete-${vp} 제목`).toEqual([titleOf(name)]);
    expect(texts((n) => n.path.includes(MODAL) && n.name === "body"), "본문").toEqual([BODY]);
    expect(texts((n) => n.path.includes(MODAL) && n.name === "note"), "muted").toEqual([NOTE]);
    expect(texts((n) => n.path.includes("modal-actions") && n.path.includes("button-outline")), "취소 = button-outline").toEqual([CANCEL]);
    expect(texts((n) => n.path.includes("modal-actions") && n.path.includes("button-primary")), "삭제 = button-primary").toEqual([CONFIRM]);
    const more = f.find((n) => n.name === MORE)!;
    if (vp === "mobile") expect(more.path, "모바일 ⋯ = reagent-detail-card 안").toContain("reagent-detail-card");
    else {
      expect(more.path, "데스크톱 ⋯ = 드로어 머리").toContain("drawer-head");
      const i = f.findIndex((n) => n.name === MORE);
      const j = f.findIndex((n) => n.name === "drawer-close");
      expect(i, "⋯ 는 × 앞(왼쪽)").toBeLessThan(j);
    }
  }
  const R5 = (rules.roles as unknown as Record<string, { components?: string[]; max?: number; role?: string }>).R5;
  expect(R5.components, "R5 학생 0").toEqual(expect.arrayContaining([MORE, DELETE]));
  expect((rules as unknown as { guest: { hidden_components: string[] } }).guest.hidden_components, "둘러보기 숨김").toEqual(expect.arrayContaining([MORE, DELETE]));
  expect((rules as unknown as { variants: Record<string, Record<string, string[]>> }).variants["3"].delete).toEqual([MORE, MODAL]);
});

test.describe("일회용 학교", () => {
  test.skip(!HAS_SERVICE, NO_SERVICE_REASON);

  test(`[C1][S3] [R-ui][S3] 일회용 교사 시약 삭제: ⋯(모바일 카드 오른쪽 위 / 데스크톱 드로어 머리 × 왼쪽) → "${ITEM_LABEL}" → 확인 모달(rules confirm 문구 · 취소 = 그대로) → "${CONFIRM}" → 화면 2 → 도착 화면 토스트 "${DONE}" · DB 보관(deleted_at · deleted_by · 칸 비움) · 목록·시약장 칸·홈·재주문 알림에서 빠짐 · 상세 주소 = 없는 시약과 같은 404`, async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const cab = await prepCabinet(f);
    await prepLayout(f, cab.id as unknown as string, DOUBLE, 4, {});
    const r = await prepReagent(f, "삭제", 2, "병");
    await prepPlace(f, r.id, cab.id as unknown as string, "L1");
    // 재고 부족(재주문 알림 · 홈 재고 부족에 보이게): 기준 5 > 재고 2
    const th = await f.prep.rpc("set_reorder_threshold", { p_reagent_id: r.id, p_min_stock: 5 });
    expect(th.error, `준비: set_reorder_threshold (${th.error?.message})`).toBeNull();
    const t = await openTemp(browser, info, f.teacher, routeOf(6));
    const page = t.page;
    try {
      // 양성 대조: 보관 전에는 재주문 알림 · 홈 · 목록 · 시약장 칸에 있다
      await expect(page.locator(`main ${sel("reorder-alert-card")}`).filter({ hasText: r.name }), "보관 전 재주문 알림").toHaveCount(1, { timeout: 45_000 });
      await page.goto(routeOf(13));
      await expect(page.locator("main"), "보관 전 홈 재고 부족").toContainText(r.name, { timeout: 45_000 });
      await page.goto(`${routeOf(2)}?q=${encodeURIComponent(r.name)}`);
      await expect(page.locator("main"), "보관 전 목록").toContainText(r.name, { timeout: 45_000 });
      await page.goto(`${routeOf(11)}?c=${cab.id}`);
      await expect(page.locator(`main ${sel("slot-count")}`).first(), "보관 전 시약장 칸 시약 수").toBeVisible({ timeout: 45_000 });

      await page.goto(detailPath(r.id));
      await waitDetail3(page);
      const actions = watchActions(page);
      // ⋯ 위치
      await expect(moreButton(page), "⋯ 1").toHaveCount(1);
      const mb = (await moreButton(page).boundingBox())!;
      const sb = (await scope3(page).boundingBox())!;
      if (isDeskPage(page)) {
        const close = (await drawer(page).locator('[data-name="drawer-close"]').boundingBox())!;
        expect(mb.x + mb.width, "⋯ 는 × 왼쪽").toBeLessThanOrEqual(close.x + 1);
        expect(Math.abs(mb.y + mb.height / 2 - (close.y + close.height / 2)), "× 와 같은 줄").toBeLessThanOrEqual(4);
      } else {
        expect(sb.x + sb.width - (mb.x + mb.width), "카드 오른쪽").toBeLessThanOrEqual(40);
        expect(mb.y - sb.y, "카드 위쪽").toBeLessThanOrEqual(40);
      }
      await expect(moreButton(page), "⋯ 접근 이름 = 시약명 포함").toHaveAccessibleName(new RegExp(esc(r.name)));
      // 메뉴 → 확인 모달 → 취소
      await openMenu(page);
      await expect(page.locator(sel(DELETE)), `메뉴 항목 "${ITEM_LABEL}"`).toHaveText(exact(ITEM_LABEL));
      await page.locator(sel(DELETE)).click();
      const modal = page.locator(sel(MODAL));
      await expect(modal, "확인 모달 1").toHaveCount(1);
      await expect(modal.getByRole("heading"), "제목").toHaveText(exact(titleOf(r.name)));
      await expect(modal, "본문").toContainText(BODY);
      await expect(modal, "muted").toContainText(NOTE);
      await expect(modal.locator(sel("button-outline")), `"${CANCEL}"`).toHaveText(exact(CANCEL));
      await expect(modal.locator(sel("button-primary")), `"${CONFIRM}" = button-primary`).toHaveText(exact(CONFIRM));
      for (const n of (rules as unknown as { variants: Record<string, Record<string, string[]>> }).variants["3"].delete) await expect(page.locator(sel(n)).first(), `variants 3.delete ${n}`).toBeVisible();
      await page.screenshot({ path: join(process.cwd(), "test-results", `v1-3-delete-${t.viewport}.png`), fullPage: false });
      await modal.locator(sel("button-outline")).click();
      await expect(modal, "취소 → 닫힘").toHaveCount(0);
      expect(actions.count(), "취소 → 쓰기 0").toBe(0);
      expect((await rowOf(r.id)).deleted_at, "취소 → 보관 안 됨").toBeNull();
      // 삭제
      await openMenu(page);
      await page.locator(sel(DELETE)).click();
      const t0 = Date.now();
      await page.locator(sel(MODAL)).locator(sel("button-primary")).click();
      // rules reagent_delete.after: 화면 2 로 이동 → 도착 화면에서 토스트 "시약을 삭제했어요"
      await page.waitForURL((u) => u.pathname === routeOf(2), { timeout: 30_000 });
      const done = page.locator(sel(TOAST)).filter({ hasText: DONE });
      await expect(done, `화면 2 에서 토스트 "${DONE}"`).toBeVisible({ timeout: 10_000 });
      expect(new URL(page.url()).pathname, "토스트가 보일 때 = 화면 2").toBe(routeOf(2));
      await expect(done, "토스트는 잠시 뒤 사라짐").toHaveCount(0, { timeout: 15_000 });
      const row = await rowOf(r.id);
      expect(row.deleted_by, "deleted_by = 교사").toBe(f.teacher.id);
      expect(Math.abs(Date.parse(String(row.deleted_at)) - t0), "deleted_at = 지금").toBeLessThan(60_000);
      expect(row.slot_id, "칸 배치 비움").toBeNull();
      expect(actions.count(), "쓰기 1 (삭제)").toBe(1);
      // 목록 · 시약장 칸 · 홈 · 재주문 알림에서 빠짐
      await page.goto(`${routeOf(2)}?q=${encodeURIComponent(r.name)}`);
      await page.waitForLoadState("load");
      await expect(page.locator("main").getByRole("searchbox").first(), "목록 화면").toHaveValue(r.name, { timeout: 45_000 });
      await expect(page.locator(`main ${sel(isDeskPage(page) ? "ex-data-table-cell" : "reagent-row")}`), "목록 검색 0건").toHaveCount(0);
      await expect(page.locator("main"), "목록에 없음").not.toContainText(r.name);
      await page.goto(`${routeOf(11)}?c=${cab.id}`);
      await expect(page.locator(`main ${sel("cabinet-slot")}`).first(), "시약장 화면").toBeVisible({ timeout: 45_000 });
      await expect(page.locator(`main ${sel("slot-count")}`), "시약장 칸 시약 수 0").toHaveCount(0);
      await page.goto(routeOf(13));
      await page.waitForLoadState("load");
      await expect(page.locator(sel("app-sidebar")).or(page.locator(sel("nav-pill"))).first()).toBeVisible({ timeout: 45_000 });
      await expect(page.locator("main"), "홈에 없음").not.toContainText(r.name);
      await page.goto(routeOf(6));
      await page.waitForLoadState("load");
      await expect(page.locator(`main ${sel("reorder-alert-card")}`).filter({ hasText: r.name }), "재주문 알림에 없음").toHaveCount(0);
      await expect(page.locator("main"), "재주문 화면에 없음").not.toContainText(r.name);
      // 상세 주소 = 없는 시약과 같은 응답
      const gone = await page.goto(detailPath(r.id));
      const ghost = await page.goto(detailPath("00000000-0000-4000-8000-000000000000"));
      expect(gone?.status(), "보관 시약 상세 = 404").toBe(404);
      expect(gone?.status(), "없는 시약과 같은 상태").toBe(ghost?.status());
    } finally {
      await t.context.close();
    }
  });

  test(`[C1][S3] [R-ui][S3] 일회용 admin 시약 삭제: ⋯ → "${ITEM_LABEL}" → "${CONFIRM}" → 화면 2 → 토스트 · DB deleted_by = admin`, async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const r = await prepReagent(f, "관리자삭제", 9, "g");
    const t = await openTemp(browser, info, f.admin, detailPath(r.id));
    const page = t.page;
    try {
      await waitDetail3(page);
      await openMenu(page);
      await page.locator(sel(DELETE)).click();
      await expect(page.locator(sel(MODAL)).getByRole("heading")).toHaveText(exact(titleOf(r.name)));
      await page.locator(sel(MODAL)).locator(sel("button-primary")).click();
      // rules reagent_delete.after: 화면 2 로 이동 → 도착 화면에서 토스트 "시약을 삭제했어요"
      await page.waitForURL((u) => u.pathname === routeOf(2), { timeout: 30_000 });
      const done = page.locator(sel(TOAST)).filter({ hasText: DONE });
      await expect(done, `화면 2 에서 토스트 "${DONE}"`).toBeVisible({ timeout: 10_000 });
      expect(new URL(page.url()).pathname, "토스트가 보일 때 = 화면 2").toBe(routeOf(2));
      await expect(done, "토스트는 잠시 뒤 사라짐").toHaveCount(0, { timeout: 15_000 });
      expect((await rowOf(r.id)).deleted_by, "deleted_by = admin").toBe(f.admin.id);
    } finally {
      await t.context.close();
    }
  });

  test(`[R-ui][S3] 일회용 학생 시약 상세: ${MORE} 0 · ${DELETE} 0 (rules R5) — 같은 시약을 교사는 지울 수 있음 (양성 대조: 교사 화면 ⋯ 1)`, async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const r = await prepReagent(f, "학생", 4, "g");
    for (const [u, want] of [[f.student, 0], [f.teacher, 1]] as [TempUser, number][]) {
      const t = await openTemp(browser, info, u, detailPath(r.id));
      try {
        await waitDetail3(t.page);
        await expect(t.page.locator("main").getByText(r.name).first()).toBeVisible();
        await expect(t.page.locator(sel(MORE)), `${u === f.student ? "학생" : "교사"} ${MORE}`).toHaveCount(want);
        await expect(t.page.locator(sel(DELETE)), `${DELETE} (메뉴 닫힘)`).toHaveCount(0);
      } finally {
        await t.context.close();
      }
    }
  });
});

test(`[GM-ui][S3] 둘러보기 시약 상세(/demo): ${MORE} 0 · ${DELETE} 0 (rules guest.hidden_components)`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const demo = await demoReagents();
  const g = await openGuest(browser, info, guestDetailPath(demo[0].id));
  try {
    expect(g.response?.status()).toBe(200);
    await expect(g.page.locator("main").getByText(demo[0].name).first(), "데모 시약 상세").toBeVisible({ timeout: 45_000 });
    await expect(g.page.locator(sel(MORE)), MORE).toHaveCount(0);
    await expect(g.page.locator(sel(DELETE)), DELETE).toHaveCount(0);
  } finally {
    await g.context.close();
  }
});
