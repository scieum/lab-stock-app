// 화면 2 선택 모드 · 여러 개 삭제 — C1 · R-ui · GM-ui (390 · 1440). 일회용 학교.
// 기준(구현이 아니라 여기서 도출): harness/d7-data.md §25 "여러 개 삭제 (화면 2·17)", design/rules.json 1.26 bulk_delete
//   (roles · toggle · checkbox · select_all · row_tap · bar · confirm · after · max) · roles R5 · guest.hidden_components · variants["2"]
//   select · bulk-delete, 새 프레임 2-select-* · 2-bulk-delete-*.
// - 교사·admin: "선택" → 선택 모드(행 누르면 체크, 상세로 안 감) → bulk-action-bar "N개 선택됨 · 삭제" → 확인 모달 → 토스트
//   "시약 N개를 삭제했어요", 목록 그대로 · 선택 모드 끝. 전체 선택 = 지금 필터 · 검색 결과 전체(쪽을 넘어) 최대 100, 넘으면 "앞의 100개만 골랐어요".
// - 학생 · 둘러보기: list-select-toggle · select-checkbox · bulk-action-bar 0.
// 데이터: 일회용 학교에만 쓴다(시약 3 + 101). 대량 행은 service role 준비, 판정은 화면 + 대조 조회. 정리 후 잔여 0.
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { openAs } from "./auth-state";
import { devRules, routeOf, rules, sel } from "./screen-helpers";
import { HAS_SERVICE, openTemp, service, watchActions } from "./screen-8-helpers";
import { openGuest } from "./guest-helpers";
import { newFrame } from "./desk-helpers";
import { makeFixture, type S11Fixture } from "./screen-11-helpers";
import {
  BULK,
  BULK_REAGENT_BODY,
  CANCEL,
  CAPPED,
  CONFIRM,
  DELETE_NOTE,
  NO_SENSOR_RESIDUE,
  SELECT_ALL,
  SELECT_LABEL,
  bulkDone,
  bulkNames,
  bulkTitle,
  cleanupSensors,
  exact,
  isDesk,
  selectedText,
} from "./sensor-helpers";

test.describe.configure({ mode: "default" });

const SCREEN = 2;
const GROUP = "s2bulk";
const TIMEOUT = 360_000;
const NO_SERVICE_REASON = "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)";
const SELECT_COMPONENTS = ["list-select-toggle", "select-checkbox", "bulk-action-bar"];
const STORAGE = (rules as unknown as { cabinet: { storage_classes: string[] } }).cabinet.storage_classes;

type Fx = S11Fixture & { tag: string; small: { id: string; name: string }[]; many: { id: string; name: string }[] };
let fx: Promise<Fx> | null = null;
function fixture(info: TestInfo): Promise<Fx> {
  fx ??= (async () => {
    const base = await makeFixture(info, GROUP);
    const tag = randomBytes(2).toString("hex");
    const small: { id: string; name: string }[] = [];
    for (const k of ["가", "나", "다"]) {
      const name = `묶음${tag}-${k}`;
      const res = await base.prep.rpc("register_reagent", { p_name: name, p_storage_class: STORAGE[0], p_stock: 5, p_unit: "g", p_intake_date: "2026-09-15", p_msds_url: null });
      expect(res.error, `준비: register_reagent (${res.error?.message})`).toBeNull();
      small.push({ id: ((Array.isArray(res.data) ? res.data[0] : res.data) as { id: string }).id, name });
    }
    // 대량(전체 선택 상한 + 1): service role 준비
    const rows = Array.from({ length: BULK.max + 1 }, (_, i) => ({ school_id: base.school.id, name: `벌크${tag}-${String(i).padStart(3, "0")}`, unit: "g", stock: 1, min_stock: 0 }));
    const ins = await service().from("reagents").insert(rows).select("id, name");
    expect(ins.error, `준비: 대량 시약 (${ins.error?.message})`).toBeNull();
    return { ...base, tag, small, many: (ins.data ?? []) as { id: string; name: string }[] };
  })();
  fx.catch(() => (fx = null));
  return fx;
}

test.afterAll(async ({}, info) => {
  info.setTimeout(TIMEOUT);
  if (!HAS_SERVICE) return;
  fx = null;
  expect(await cleanupSensors(GROUP, info.project.name), "일회용 계정·학교·시약 잔여물").toEqual(NO_SENSOR_RESIDUE);
});

// ---------- 화면 ----------
const listRows = (page: Page) => (isDesk(page) ? page.locator(`main ${sel("data-table")} ${sel("ex-data-table-cell")}`) : page.locator(`main ${sel("reagent-row")}`));
const rowNamed = (page: Page, name: string) => listRows(page).filter({ hasText: name });
const toggle = (page: Page) => page.locator(`main ${sel("list-select-toggle")}`);

async function waitList(page: Page): Promise<void> {
  await expect(listRows(page).first(), "목록 행").toBeVisible({ timeout: 45_000 });
  await page.waitForLoadState("load");
  const gone = isDesk(page) ? ["nav-pill", "tab-bar"] : ["app-sidebar", "data-table"];
  for (const n of gone) await expect(page.locator(sel(n)), `폭 정리 ${n}`).toHaveCount(0, { timeout: 45_000 });
}

async function startSelect(page: Page): Promise<void> {
  await expect(async () => {
    await toggle(page).getByRole("button", { name: SELECT_LABEL, exact: true }).click({ timeout: 3_000 });
    await expect(page.locator(`main ${sel("select-checkbox")}`).first()).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
}

async function tapRow(page: Page, name: string): Promise<void> {
  const r = rowNamed(page, name);
  if (isDesk(page)) await r.getByRole("button", { name }).click();
  else await r.click();
}

async function selectAll(page: Page): Promise<void> {
  if (isDesk(page)) await page.locator(`main ${sel("data-table")} thead`).getByRole("checkbox", { name: SELECT_ALL }).click();
  else await toggle(page).getByRole("button", { name: SELECT_ALL, exact: true }).click();
}

async function archivedCount(ids: string[]): Promise<number> {
  const r = await service().from("reagents").select("id").in("id", ids).not("deleted_at", "is", null);
  return (r.data ?? []).length;
}

test(`[C1][S2] 기대값 원본: variants 2.select · 2.bulk-delete · rules bulk_delete 확인 문구('${bulkTitle("시약", 5)}' · 이름 3 + '외 N개' · '${BULK_REAGENT_BODY}' · '${DELETE_NOTE}' · '${CANCEL}'/'${CONFIRM}') = 프레임 2-bulk-delete · 상한 ${BULK.max}`, () => {
  expect(rules.variants["2"].select, "variants 2.select").toEqual(SELECT_COMPONENTS);
  expect(rules.variants["2"]["bulk-delete"], "variants 2.bulk-delete").toEqual(["bulk-action-bar", "ex-modal-card"]);
  expect(BULK.roles, "교사·admin").toEqual(["교사", "admin"]);
  for (const vp of ["mobile", "desktop"]) {
    const f = newFrame(`2-bulk-delete-${vp}`);
    const t = (name: string) => f.filter((n) => n.path.includes("ex-modal-card") && n.name === name && n.text).map((n) => n.text!.characters);
    expect(t("heading"), `${vp} 제목`).toEqual([bulkTitle("시약", 5)]);
    const names = t("selected-names")[0];
    expect(names, `${vp} 이름 줄 = 3개 + 외 N개`).toMatch(/^[^,]+, [^,]+, [^,]+ 외 2개$/);
    expect(t("body"), `${vp} 본문`).toEqual([BULK_REAGENT_BODY]);
    expect(t("note"), `${vp} muted`).toEqual([DELETE_NOTE]);
    const sel2 = newFrame(`2-select-${vp}`).find((n) => n.name === "selected-count" && n.text);
    expect(sel2?.text?.characters, `${vp} bulk-action-bar 글자 = 'N개 선택됨'`).toBe(selectedText(5));
  }
  expect(BULK.max, "bulk_delete.max").toBe(100);
});

test(`[R-ui][S2] 학생(학교 A): ${SELECT_COMPONENTS.join(" · ")} 0 (R5) / [GM-ui][S2g] 둘러보기 /demo/reagents: 0 (guest.hidden_components)`, async ({ browser }, info) => {
  test.setTimeout(TIMEOUT);
  const R5 = rules.roles.R5.components ?? [];
  expect(R5, "R5 에 선택 모드").toEqual(expect.arrayContaining(SELECT_COMPONENTS));
  const s = await openAs(browser, info, "student", SCREEN);
  try {
    await waitList(s.page);
    for (const c of SELECT_COMPONENTS) await expect(s.page.locator(sel(c)), `학생 ${c} 0`).toHaveCount(0);
  } finally {
    await s.context.close();
  }
  const g = await openGuest(browser, info, devRules.routes["2-guest"]);
  try {
    await waitList(g.page);
    for (const c of SELECT_COMPONENTS) await expect(g.page.locator(sel(c)), `둘러보기 ${c} 0`).toHaveCount(0);
  } finally {
    await g.context.close();
  }
});

test.describe("일회용 학교", () => {
  test.skip(!HAS_SERVICE, NO_SERVICE_REASON);

  test(`[C1][S2] [R-ui][S2] 교사 선택 모드 → 여러 개 삭제: '${SELECT_LABEL}' → 행 누르면 체크(상세 안 감) · '${selectedText(2)}' → bulk-action-bar · 확인 모달(rules 문구) · '${CANCEL}' = 그대로 · '${CONFIRM}' → 토스트 '${bulkDone("시약", 3)}' · 목록 그대로 · 선택 모드 끝 · DB 보관 3`, async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const { page, context } = await openTemp(browser, info, f.teacher, `${routeOf(SCREEN)}?q=${encodeURIComponent(`묶음${f.tag}`)}`);
    try {
      await waitList(page);
      await expect(listRows(page), "검색 → 3행").toHaveCount(3);
      for (const c of SELECT_COMPONENTS.slice(1)) await expect(page.locator(sel(c)), `선택 전 ${c} 0`).toHaveCount(0);
      await expect(toggle(page), "교사 list-select-toggle 1").toHaveCount(1);
      await startSelect(page);
      await expect(page.locator(`main ${sel("select-checkbox")}`), "행마다 select-checkbox (+ 데스크톱 머리 칸)").toHaveCount(isDesk(page) ? 4 : 3);
      const url = page.url();
      await tapRow(page, f.small[0].name);
      await tapRow(page, f.small[1].name);
      expect(page.url(), "행 누르기 → 주소 그대로 (상세 안 감)").toBe(url);
      await expect(page.locator(sel("detail-drawer")).or(page.locator(sel("reagent-detail-card"))), "상세 안 열림").toHaveCount(0);
      const bar = page.locator(sel("bulk-action-bar"));
      await expect(bar, "bulk-action-bar 1").toHaveCount(1);
      await expect(bar, selectedText(2)).toContainText(selectedText(2));
      for (const c of rules.variants["2"].select) await expect(page.locator(sel(c)).first(), `variants 2.select ${c}`).toBeVisible();
      // 한 번 더 누르면 풀림
      await tapRow(page, f.small[1].name);
      await expect(bar, selectedText(1)).toContainText(selectedText(1));
      await tapRow(page, f.small[1].name);
      await tapRow(page, f.small[2].name);
      await expect(bar, selectedText(3)).toContainText(selectedText(3));
      const open = async () => {
        await bar.getByRole("button", { name: CONFIRM, exact: true }).click();
        const d = page.getByRole("dialog", { name: bulkTitle("시약", 3) });
        await expect(d, "확인 모달").toBeVisible();
        return d;
      };
      let d = await open();
      for (const c of rules.variants["2"]["bulk-delete"]) await expect(page.locator(sel(c)).first(), `variants 2.bulk-delete ${c}`).toBeAttached();
      await expect(d, "이름 줄").toContainText(bulkNames(f.small.map((r) => r.name)));
      await expect(d, "본문").toContainText(BULK_REAGENT_BODY);
      await expect(d, "muted").toContainText(DELETE_NOTE);
      await expect(d.locator(sel("button-outline")), "취소 = button-outline").toHaveText(exact(CANCEL));
      await expect(d.locator(sel("button-primary")), "삭제 = button-primary").toHaveText(exact(CONFIRM));
      await d.locator(sel("button-outline")).click();
      await expect(d, "취소 → 닫힘").toHaveCount(0);
      expect(await archivedCount(f.small.map((r) => r.id)), "취소 → DB 그대로").toBe(0);
      await expect(bar, "취소 → 선택 그대로").toContainText(selectedText(3));
      d = await open();
      await d.locator(sel("button-primary")).click();
      await expect(page.locator(sel("ex-toast")).filter({ hasText: bulkDone("시약", 3) }), `토스트 '${bulkDone("시약", 3)}'`).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(sel("bulk-action-bar")), "선택 모드 끝").toHaveCount(0);
      await expect(page.locator(`main ${sel("select-checkbox")}`), "체크 0").toHaveCount(0);
      expect(new URL(page.url()).pathname, "목록 그대로").toBe(routeOf(SCREEN));
      await expect(listRows(page), "보관된 3행 빠짐").toHaveCount(0);
      expect(await archivedCount(f.small.map((r) => r.id)), "DB 보관 3").toBe(3);
      const by = await service().from("reagents").select("deleted_by").in("id", f.small.map((r) => r.id));
      expect((by.data ?? []).every((r) => r.deleted_by === f.teacher.id), "deleted_by = 교사").toBe(true);
    } finally {
      await context.close();
    }
  });

  test(`[C1][S2] [R-ui][S2] 전체 선택 = 검색 결과 전체(쪽을 넘어) 최대 ${BULK.max}: ${BULK.max + 1}개 → '${selectedText(BULK.max)}' + '${CAPPED}' → 삭제 → '${bulkTitle("시약", BULK.max)}' · 이름 3 + '외 ${BULK.max - 3}개' → 토스트 '${bulkDone("시약", BULK.max)}' · DB 보관 ${BULK.max} · 1행 남음`, async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const f = await fixture(info);
    const ids = f.many.map((r) => r.id);
    const { page, context } = await openTemp(browser, info, f.admin, `${routeOf(SCREEN)}?q=${encodeURIComponent(`벌크${f.tag}`)}`);
    try {
      await waitList(page);
      if (!isDesk(page)) await expect(listRows(page), `검색 → ${BULK.max + 1}행`).toHaveCount(BULK.max + 1);
      else await expect(page.locator("main"), `머리 '${BULK.max + 1}종'`).toContainText(`${BULK.max + 1}종`);
      await startSelect(page);
      const actions = watchActions(page);
      await selectAll(page);
      const bar = page.locator(sel("bulk-action-bar"));
      await expect(bar, selectedText(BULK.max)).toContainText(selectedText(BULK.max));
      await expect(page.getByText(CAPPED, { exact: true }), `'${CAPPED}'`).toBeVisible();
      expect(actions.count(), "전체 선택은 서버 요청 없음").toBe(0);
      await bar.getByRole("button", { name: CONFIRM, exact: true }).click();
      const d = page.getByRole("dialog", { name: bulkTitle("시약", BULK.max) });
      await expect(d, "확인 모달").toBeVisible();
      await expect(d, "이름 줄 '외 N개'").toContainText(`외 ${BULK.max - 3}개`);
      await d.locator(sel("button-primary")).click();
      await expect(page.locator(sel("ex-toast")).filter({ hasText: bulkDone("시약", BULK.max) }), "토스트").toBeVisible({ timeout: 45_000 });
      expect(await archivedCount(ids), `DB 보관 ${BULK.max}`).toBe(BULK.max);
      if (isDesk(page)) await expect(page.locator(`main [data-name="page-head"]`).first(), "머리 '1종'").toContainText(/(^|[^0-9])1종/);
      else await expect(listRows(page), "1행 남음").toHaveCount(1);
    } finally {
      await context.close();
    }
  });
});
