// 화면 4 여러 시약 사용 기록 — 흐름 C1 · C3 · R-ui (390 · 1440). 일회용 학교.
// 기준(구현이 아니라 여기서 도출): harness/d7-data.md §24 (여러 시약 사용 기록 · 수업 기록), design/rules.json 1.25 usage_batch(picker · list · row ·
//   common · save · errors · empty · after_save · entry · roles) · class_info(field · grades · classes · subject_max · recent · label) ·
//   desktop_shell.heavy_pages · guest(locked_tabs), 새 프레임 4-{mobile|desktop} · 4-picker · 4-empty · 4-error · 4-past-date.
// - 모바일 = 전용 화면(reagent-add → 바텀시트 체크 → "{N}개 담기"), 데스크톱 = 본문 페이지 + 검색 아래 드롭다운 + data-table.
// - 저장 = 한 트랜잭션(record_usage_batch) → 토스트 "N개 시약 사용을 기록했어요" → 들어온 화면 (?reagent → 그 시약 상세, ?from=usage → 화면 10, 그 밖 → 홈).
// - 서버 거절(한 트랜잭션 전부 취소) = 토스트 "저장하지 못했어요 — 표시한 시약을 확인해 주세요" + 문제 행 표시. 서버 거절은 화면을 연 뒤
//   service role(준비)로 그 시약의 재고를 줄여 실제 DB 거절을 만든다 (동시에 다른 사람이 쓴 상황).
// 데이터: 일회용 학교(admin·교사·학생 — service role 로 생성)의 임시 시약에만 쓴다. 판정은 화면과 그 계정 세션(RLS) / 대조 조회(service role).
//   정리: usage_logs → 시약 → 시약장 → 프로필 → 계정 → 학교, 잔여물 0. 공용 학교 A·B·데모 불변.
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { routeOf, rules, sel } from "./screen-helpers";
import { isDeskPage, newFrame } from "./desk-helpers";
import { HAS_SERVICE, clientFor, openTemp, anonContext, service, tempSchoolLike, type TempUser } from "./screen-8-helpers";
import { NO_S11_RESIDUE, cleanup, makeFixture, sharedCabinetSnapshot, watchActions, type S11Fixture } from "./screen-11-helpers";
import {
  ADDED,
  CI,
  DATE,
  DONE_TPL,
  EMPTY,
  EMPTY_AMOUNT,
  EMPTY_TITLE,
  OVER,
  PICKER,
  RECENT_CHIP,
  RECENT_MAX,
  SAVE_EMPTY,
  SERVER_FAIL,
  amountOf,
  classNoSelect,
  classSelect,
  classText,
  dateInput,
  doneText,
  exact,
  gradeSelect,
  heading,
  itemNamed,
  items,
  list,
  memoInput,
  openPicker,
  overText,
  pickLabel,
  picker,
  pickerNames,
  pickerRow,
  removeOf,
  rowStockText,
  saveBar,
  saveButton,
  saveLabel,
  stockText,
  subjectInput,
  toast,
  topOf,
  usagePath,
  waitUsage,
} from "./screen-4-helpers";

test.describe.configure({ mode: "default" });

const GROUP = "s4batch";
const DRAWER_NAME = "detail-drawer";
const LIST_NAME = "usage-batch-list";
const TIMEOUT = 300_000;
const NO_SERVICE_REASON = "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)";
const STORAGE = (rules as unknown as { cabinet: { storage_classes: string[] } }).cabinet.storage_classes;
type RoleKey = "student" | "teacher" | "admin";
const ROLE_TEXT: Record<RoleKey, string> = { student: "학생", teacher: "교사", admin: "admin" };

// ---------- 기대값 원본 (rules · 프레임) ----------
const frameText = (f: string, pred: (n: ReturnType<typeof newFrame>[number]) => boolean): string[] =>
  newFrame(f).filter((n) => n.text && pred(n)).map((n) => n.text!.characters);
const firstText = (f: string, pred: (n: ReturnType<typeof newFrame>[number]) => boolean, what: string): string => {
  const t = frameText(f, pred);
  if (!t.length) throw new Error(`프레임 ${f} 에 ${what} 없음`);
  return t[0];
};
/** 고르기 위 캡션 = 시안 4-picker-mobile reagent-picker caption (rules usage_batch.picker "최근 사용한 시약 먼저") */
const RECENT_CAPTION = firstText("4-picker-mobile", (n) => n.name === "caption" && n.path.includes(PICKER), "최근 캡션");

const KST = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
const daysAgo = (days: number) => KST.format(new Date(Date.now() - days * 86_400_000));
const kstMidnight = (ymd: string) => new Date(`${ymd}T00:00:00+09:00`).getTime();
async function awayFromMidnight(): Promise<void> {
  for (;;) {
    const now = Date.now();
    if (kstMidnight(daysAgo(-1)) - now > 180_000 && now - kstMidnight(daysAgo(0)) > 180_000) return;
    await new Promise((r) => setTimeout(r, 30_000));
  }
}

// ---------- 일회용 학교 · 시약 ----------
type R = { id: string; name: string; stock: number; unit: string };
type Prepared = { f: S11Fixture; c: Record<RoleKey, SupabaseClient> };
let prepCache: Promise<Prepared> | null = null;
function prepared(info: TestInfo): Promise<Prepared> {
  prepCache ??= (async () => {
    const f = await makeFixture(info, GROUP);
    return { f, c: { admin: f.prep, teacher: await clientFor(f.teacher), student: await clientFor(f.student) } };
  })();
  prepCache.catch(() => {
    prepCache = null;
  });
  return prepCache;
}
const userOf = (p: Prepared, role: RoleKey): TempUser => (role === "admin" ? p.f.admin : p.f[role]);

/** 임시 시약 (register_reagent — 일회용 admin 세션). 이름 앞 글자로 가나다 순서를 정한다 */
async function newReagent(p: Prepared, head: string, stock: number, unit: string): Promise<R> {
  const name = `${head}묶음-${randomUUID().slice(0, 6)}`;
  const res = await p.c.admin.rpc("register_reagent", {
    p_name: name,
    p_storage_class: STORAGE[0],
    p_stock: stock,
    p_unit: unit,
    p_intake_date: "2026-09-15",
    p_msds_url: null,
  });
  expect(res.error, `준비: register_reagent (${res.error?.message})`).toBeNull();
  const row = (Array.isArray(res.data) ? res.data[0] : res.data) as { id: string };
  return { id: row.id, name, stock, unit };
}
/** 준비 기록 (record_usage_batch — 그 사용자 세션) */
async function prepRecord(c: SupabaseClient, ids: string[], cls: { g?: number | null; n?: number | null; s?: string | null } = {}): Promise<void> {
  const res = await c.rpc("record_usage_batch", {
    p_items: ids.map((id) => ({ reagent_id: id, amount: 1 })),
    p_class_grade: cls.g ?? null,
    p_class_no: cls.n ?? null,
    p_class_subject: cls.s ?? null,
  });
  expect(res.error, `준비: record_usage_batch (${res.error?.message})`).toBeNull();
}

type Log = { id: string; reagent_id: string; user_id: string; school_id: string; amount: number; used_on: string; memo: string | null; class_grade: number | null; class_no: number | null; class_subject: string | null };
async function logsOf(ids: string[]): Promise<Log[]> {
  const r = await service().from("usage_logs").select("id, reagent_id, user_id, school_id, amount, used_on, memo, class_grade, class_no, class_subject").in("reagent_id", ids).order("used_at");
  if (r.error) throw new Error(`대조 조회 실패: ${r.error.message}`);
  return ((r.data ?? []) as Log[]).map((l) => ({ ...l, amount: Number(l.amount) }));
}
async function stocksOf(ids: string[]): Promise<number[]> {
  const r = await service().from("reagents").select("id, stock").in("id", ids);
  if (r.error) throw new Error(`대조 조회 실패: ${r.error.message}`);
  return ids.map((id) => Number((r.data ?? []).find((x) => x.id === id)?.stock));
}

let sharedBefore: string[] | null = null;
test.beforeAll(async ({}, info) => {
  info.setTimeout(120_000);
  if (HAS_SERVICE) sharedBefore = await sharedCabinetSnapshot();
});
test.afterAll(async ({}, info) => {
  info.setTimeout(TIMEOUT);
  if (!HAS_SERVICE) return;
  prepCache = null;
  const sb = service();
  const schools = await sb.from("schools").select("id").like("neis_code", tempSchoolLike(GROUP, info.project.name));
  const ids = (schools.data ?? []).map((s) => s.id as string);
  if (ids.length) await sb.from("usage_logs").delete().in("school_id", ids);
  const left = await cleanup(GROUP, info.project.name);
  expect(left, "일회용 계정·학교·시약·기록 잔여물").toEqual(NO_S11_RESIDUE);
  if (sharedBefore) expect(await sharedCabinetSnapshot(), "학교 A·B·데모 학교의 시약장·칸·시약 배치가 그대로").toEqual(sharedBefore);
});

test(`[C1][S4] 기대값 원본: rules usage_batch 문구(저장 "${saveLabel(3)}" · 0개 "${SAVE_EMPTY}" · 담기 "${pickLabel(2)}" · "${ADDED}" · 빈 "${EMPTY_TITLE}" · 초과 · "${EMPTY_AMOUNT}" · 거절 · 완료 "${DONE_TPL}") = 새 4 프레임 글자 · 최근 칩 최대 ${RECENT_MAX}`, () => {
  for (const vp of ["mobile", "desktop"]) {
    expect(firstText(`4-${vp}`, (n) => n.path.includes("save-bar") && n.path.includes("button-primary"), "저장"), `4-${vp} 저장`).toBe(saveLabel(3));
    expect(firstText(`4-empty-${vp}`, (n) => n.path.includes("save-bar") && n.path.includes("button-primary"), "0개 저장"), `4-empty-${vp} 저장`).toBe(SAVE_EMPTY);
    expect(firstText(`4-empty-${vp}`, (n) => n.name === "heading" && n.path.includes(EMPTY), "빈 제목"), `4-empty-${vp} 빈 제목`).toBe(EMPTY_TITLE);
    expect(firstText(`4-${vp}`, (n) => n.name === "heading" && n.path.includes(vp === "mobile" ? "batch-head" : "usage-batch-list"), "머리"), `4-${vp} 머리`).toBe(heading(3));
    expect(firstText(`4-error-${vp}`, (n) => n.path.includes(OVER) && n.name === "message", "초과"), `4-error-${vp} 초과`).toBe(overText(120, "mL"));
    expect(firstText(`4-error-${vp}`, (n) => n.name === "field-error", "빈 값"), `4-error-${vp} 빈 값`).toBe(EMPTY_AMOUNT);
    expect(frameText(`4-picker-${vp}`, (n) => n.name === "added-caption"), `4-picker-${vp} 담음`).toContain(ADDED);
    expect(frameText(`4-picker-${vp}`, (n) => n.name === "caption" && n.path.includes(PICKER)), `4-picker-${vp} 최근 캡션`).toContain(RECENT_CAPTION);
    expect(frameText(`4-${vp}`, (n) => n.name === "label" && n.path.includes(RECENT_CHIP)).length, `4-${vp} 최근 칩 ≤ ${RECENT_MAX}`).toBeLessThanOrEqual(RECENT_MAX);
  }
  expect(firstText("4-picker-mobile", (n) => n.path.includes(PICKER) && n.path.includes("button-primary"), "담기"), "4-picker-mobile 담기").toBe(pickLabel(2));
  expect(SERVER_FAIL).toBe("저장하지 못했어요 — 표시한 시약을 확인해 주세요");
  expect(doneText(2)).toBe("2개 시약 사용을 기록했어요");
  expect(RECENT_MAX).toBe(3);
  expect(RECENT_CAPTION).toBe("최근 사용한 시약");
  expect((rules as unknown as { usage_batch: { picker: string } }).usage_batch.picker, "rules picker 문장에 캡션").toContain(`${RECENT_CAPTION} 먼저`);
  expect(Object.keys(CI.grades).length, "class_info.grades").toBe(3);
});

test.describe("일회용 학교", () => {
  test.skip(!HAS_SERVICE, NO_SERVICE_REASON);

  test(`[C1][S4] 일회용 학생 시약 고르기(모바일 = 바텀시트 체크 → "{N}개 담기" / 데스크톱 = 검색 아래 드롭다운, 누르면 바로 담김): "${RECENT_CAPTION}" · 최근 사용한 시약 먼저(최신순) · 그다음 가나다 · 이미 담은 시약 "${ADDED}" 회색(못 고름) · 검색 = 부분 일치 · 0개면 담기 비활성 · 쓰기 0`, async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const p = await prepared(info);
    const [ga, na, da, ra, ma] = [await newReagent(p, "가", 1200, "mL"), await newReagent(p, "나", 120, "mL"), await newReagent(p, "다", 500, "g"), await newReagent(p, "라", 50, "mL"), await newReagent(p, "마", 25, "g")];
    // 학생의 최근 기록: 다 → (나중에) 라  ⇒ 최근 먼저 = 라, 다
    await prepRecord(p.c.student, [da.id]);
    await new Promise((r) => setTimeout(r, 50));
    await prepRecord(p.c.student, [ra.id]);
    const t = await openTemp(browser, info, p.f.student, usagePath(ga.id));
    const page = t.page;
    const actions = watchActions(page);
    try {
      await waitUsage(page);
      await expect(itemNamed(page, ga.name), "?reagent 의 시약 담긴 채").toHaveCount(1);
      await openPicker(page);
      await expect(picker(page).getByText(RECENT_CAPTION, { exact: true }), `"${RECENT_CAPTION}" 캡션`).toBeVisible();
      const names = (await pickerNames(page)).filter((n) => [ga, na, da, ra, ma].some((r) => r.name === n));
      expect(names.slice(0, 2), "최근 사용한 시약 먼저 (최신순)").toEqual([ra.name, da.name]);
      expect(names.slice(2), "그다음 가나다").toEqual([ga.name, na.name, ma.name]);
      // 행: 시약명 · "현재 {재고}" (담은 시약은 "담음")
      await expect(pickerRow(page, na.name), "행 재고 캡션").toContainText(rowStockText(na.stock, na.unit));
      const addedRow = pickerRow(page, ga.name);
      await expect(addedRow, `이미 담은 시약 "${ADDED}"`).toContainText(ADDED);
      await expect(addedRow, "담은 시약은 못 고름").toHaveAttribute("aria-disabled", "true");
      if (isDeskPage(page)) {
        // 데스크톱: 행을 누르면 바로 담긴다
        await pickerRow(page, na.name).click();
        await expect(itemNamed(page, na.name), "누르면 바로 담김").toHaveCount(1);
        await pickerRow(page, ma.name).click();
        await expect(items(page), "담은 시약 3").toHaveCount(3);
        // 검색 = 부분 일치
        const input = page.locator(`main ${sel("reagent-add")} input`);
        await input.fill(da.name.slice(0, 4));
        await expect(picker(page).locator('[data-name="picker-row"]'), "검색 결과 = 그 시약").toHaveCount(1);
        await expect(picker(page).locator('[data-name="picker-row"]')).toContainText(da.name);
        await picker(page).getByRole("button", { name: exact("닫기") }).click();
        // 시안 4-picker-desktop close-row "닫기" → 닫힘 (다시 열리지 않음), 검색 칸을 다시 누르면 다시 열린다
        await expect(picker(page), "닫기 → 드롭다운 닫힘").toHaveCount(0);
        await page.waitForTimeout(500);
        await expect(picker(page), "닫힌 채 그대로 (포커스 복귀로 다시 열리지 않음)").toHaveCount(0);
        await input.click();
        await expect(picker(page), "검색 칸을 다시 누르면 열림").toBeVisible();
        await expect(picker(page).locator('[data-name="picker-row"]').first(), "다시 연 목록").toBeVisible();
        await page.keyboard.press("Escape");
        await expect(picker(page), "Esc → 드롭다운 닫힘").toHaveCount(0);
      } else {
        const pick = picker(page).getByRole("button", { name: /개 담기$/ });
        await expect(pick, `0개 → "${pickLabel(0)}" 비활성`).toHaveText(exact(pickLabel(0)));
        await expect(pick).toBeDisabled();
        await pickerRow(page, na.name).click();
        await pickerRow(page, ma.name).click();
        await expect(pickerRow(page, na.name), "고른 행 체크").toHaveAttribute("aria-checked", "true");
        await expect(pick, `"${pickLabel(2)}"`).toHaveText(exact(pickLabel(2)));
        // 검색 = 부분 일치 (고른 것은 유지)
        await picker(page).getByPlaceholder("시약명 검색").fill(da.name.slice(0, 4));
        await expect(picker(page).locator('[data-name="picker-row"]'), "검색 결과 = 그 시약").toHaveCount(1);
        await picker(page).getByPlaceholder("시약명 검색").fill("");
        await expect(pick, "검색해도 고른 수 유지").toHaveText(exact(pickLabel(2)));
        await pick.click();
        await expect(picker(page), "담기 → 시트 닫힘").toHaveCount(0);
        await expect(items(page), "담은 시약 3").toHaveCount(3);
      }
      await expect(list(page).getByText(heading(3), { exact: true }), `머리 "${heading(3)}"`).toBeVisible();
      await expect(saveButton(page), `저장 "${saveLabel(3)}"`).toHaveText(exact(saveLabel(3)));
      // 다시 열면 방금 담은 시약도 "담음"
      await openPicker(page);
      for (const r of [ga, na, ma]) await expect(pickerRow(page, r.name), `${r.name} 담음`).toContainText(ADDED);
      await expect(pickerRow(page, ra.name), "안 담은 시약").not.toContainText(ADDED);
      await page.screenshot({ path: join(process.cwd(), "test-results", `v1-4-picker-${t.viewport}.png`), fullPage: false });
      expect(actions.count(), "쓰기 요청 0 (저장 안 함)").toBe(0);
    } finally {
      await t.context.close();
    }
  });

  test(`[C1][S4] 일회용 교사 담은 목록 · 공통 칸 · 저장 바: 행 = 시약명 · 현재 재고 · 사용량 + 단위 · 빼기 · 공통 칸 순서 사용일 → 수업 → 메모(목록 아래) · 저장 "사용 기록 저장 · N개" · 비활성(0개 · 빈 값 · 0 · 재고 초과) · 재고 초과 = 그 행 ${OVER} · 0 = "${EMPTY_AMOUNT}" · 빼기 → N 줄어듦 · 0개 = ${EMPTY} · 쓰기 0`, async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const p = await prepared(info);
    const [x, y, z] = [await newReagent(p, "사", 1200, "mL"), await newReagent(p, "아", 120, "mL"), await newReagent(p, "자", 500, "g")];
    const t = await openTemp(browser, info, p.f.teacher, usagePath(x.id));
    const page = t.page;
    const actions = watchActions(page);
    try {
      await waitUsage(page);
      await addPick(page, [y.name, z.name]);
      await expect(items(page), "담은 시약 3").toHaveCount(3);
      // 행 내용
      for (const r of [x, y, z]) {
        const row = itemNamed(page, r.name);
        await expect(row, `${r.name} 행 재고`).toContainText(isDeskPage(page) ? stockText(r.stock, r.unit) : rowStockText(r.stock, r.unit));
        await expect(row, `${r.name} 단위`).toContainText(r.unit);
        await expect(amountOf(page, r.name), `${r.name} 사용량 칸`).toHaveCount(1);
        await expect(removeOf(page, r.name), `${r.name} 빼기`).toHaveCount(1);
      }
      if (isDeskPage(page)) {
        const heads = (await list(page).locator("thead th").allInnerTexts()).map((s) => s.trim());
        expect(heads, "표 머리 = 시안 4-desktop").toEqual(frameText("4-desktop", (n) => n.name === "label" && n.path.includes("table-head")));
      }
      // 공통 칸 순서 (목록 아래): 사용일 → 수업 → 메모
      const yList = await topOf(list(page));
      const yDate = await topOf(page.locator(`main ${sel(DATE)}`));
      const yClass = await topOf(classSelect(page));
      const yMemo = await topOf(memoInput(page));
      expect(yList < yDate && yDate < yClass && yClass < yMemo, `순서 목록 ${yList} < 사용일 ${yDate} < 수업 ${yClass} < 메모 ${yMemo}`).toBe(true);
      await expect(dateInput(page), "사용일 기본 = 오늘").toHaveValue(daysAgo(0));
      await expect(dateInput(page), "오늘 이후 못 고름").toHaveAttribute("max", daysAgo(0));
      await expect(memoInput(page), "메모 200자").toHaveAttribute("maxlength", "200");
      await expect(subjectInput(page), `수업명 ${CI.subject_max}자`).toHaveAttribute("maxlength", String(CI.subject_max));
      // 저장 바
      await expect(saveButton(page)).toHaveText(exact(saveLabel(3)));
      await expect(saveButton(page), "빈 값 → 비활성").toBeDisabled();
      await amountOf(page, x.name).fill("50");
      await amountOf(page, y.name).fill("10");
      await amountOf(page, z.name).fill("5");
      await expect(saveButton(page), "모두 유효 → 활성").toBeEnabled();
      // 재고 초과 = 그 행의 usage-over-stock (rules errors) · 비활성
      await amountOf(page, y.name).fill("150");
      const over = page.locator(`main ${sel(OVER)}`);
      await expect(over, "재고 초과 줄 1").toHaveCount(1);
      await expect(over, "초과 문구").toHaveText(exact(overText(y.stock, y.unit)));
      if (isDeskPage(page)) {
        // 4-error-desktop: 표 안 그 행 바로 아래 줄
        const rowBox = (await itemNamed(page, y.name).boundingBox())!;
        const overBox = (await over.boundingBox())!;
        expect(overBox.y, "초과 줄은 그 행 아래").toBeGreaterThanOrEqual(rowBox.y + rowBox.height - 1);
        expect(overBox.y, "다음 행보다 위").toBeLessThan((await itemNamed(page, z.name).boundingBox())!.y);
      } else {
        await expect(itemNamed(page, y.name).locator(sel(OVER)), "초과 줄은 그 행 카드 안").toHaveCount(1);
      }
      await expect(amountOf(page, y.name), "초과 칸 aria-invalid").toHaveAttribute("aria-invalid", "true");
      await expect(saveButton(page), "재고 초과 → 비활성").toBeDisabled();
      await amountOf(page, y.name).fill("120");
      await expect(over, "재고와 같은 양 = 초과 아님").toHaveCount(0);
      await expect(saveButton(page)).toBeEnabled();
      // 0 · 빈 값 = 입력 칸 오류 "사용량을 적어 주세요" (칸을 떠난 뒤)
      await amountOf(page, z.name).fill("0");
      await amountOf(page, z.name).blur();
      await expect(page.locator("main").getByText(EMPTY_AMOUNT, { exact: true }), `"${EMPTY_AMOUNT}"`).toHaveCount(1);
      await expect(amountOf(page, z.name), "0 칸 aria-invalid").toHaveAttribute("aria-invalid", "true");
      await expect(saveButton(page), "0 → 비활성").toBeDisabled();
      await amountOf(page, z.name).fill("");
      await expect(saveButton(page), "빈 값 → 비활성").toBeDisabled();
      // 빼기 → 개수 줄어듦
      await removeOf(page, z.name).click();
      await expect(items(page), "빼기 → 2").toHaveCount(2);
      await expect(saveButton(page)).toHaveText(exact(saveLabel(2)));
      await expect(saveButton(page), "남은 행 모두 유효 → 활성").toBeEnabled();
      await removeOf(page, x.name).click();
      await removeOf(page, y.name).click();
      // 0개 = 빈 상태 (rules usage_batch.empty) + 저장 비활성
      await expect(items(page), "0개").toHaveCount(0);
      await expect(page.locator(`main ${sel(EMPTY)}`), `${EMPTY}`).toContainText(EMPTY_TITLE);
      await expect(page.locator(`main ${sel("reagent-add")}`).first(), "reagent-add").toBeVisible();
      await expect(saveButton(page)).toHaveText(exact(SAVE_EMPTY));
      await expect(saveButton(page), "0개 → 비활성").toBeDisabled();
      expect(actions.count(), "쓰기 요청 0").toBe(0);
    } finally {
      await t.context.close();
    }
  });

  const SAVE_CASES: { role: RoleKey; entry: "reagent" | "from-usage" | "none"; back: string }[] = [
    { role: "student", entry: "reagent", back: "그 시약 상세(화면 3)" },
    { role: "teacher", entry: "from-usage", back: "화면 10" },
    { role: "admin", entry: "none", back: "홈" },
  ];
  for (const c of SAVE_CASES) {
    test(`[C1][S4] [R-ui][S4] 일회용 ${ROLE_TEXT[c.role]} 저장 (${c.entry === "reagent" ? "?reagent 로 진입" : c.entry === "from-usage" ? "?from=usage" : "빈 채 진입"}): 여러 시약 · 사용일 · 수업(학년·반·수업명) · 메모 → DB 여러 행(자기 user_id · 학교 · 공통 값) · 재고 차감 → 토스트 "N개 시약 사용을 기록했어요" → ${c.back}`, async ({ browser }, info) => {
      test.setTimeout(TIMEOUT);
      const p = await prepared(info);
      await awayFromMidnight();
      const [x, y] = [await newReagent(p, "차", 300, "mL"), await newReagent(p, "카", 40, "g")];
      const path = c.entry === "reagent" ? usagePath(x.id) : c.entry === "from-usage" ? usagePath(undefined, { from: "usage" }) : usagePath();
      const u = userOf(p, c.role);
      const t = await openTemp(browser, info, u, path);
      const page = t.page;
      try {
        await waitUsage(page);
        await addPick(page, c.entry === "reagent" ? [y.name] : [x.name, y.name]);
        await amountOf(page, x.name).fill("12.5");
        await amountOf(page, y.name).fill("3");
        const past = daysAgo(2);
        await dateInput(page).fill(past);
        await gradeSelect(page).selectOption("2");
        await classNoSelect(page).selectOption("7");
        await subjectInput(page).fill("통합과학");
        await memoInput(page).fill("묶음 저장 메모");
        await expect(saveButton(page)).toHaveText(exact(saveLabel(2)));
        const t0 = Date.now();
        await saveButton(page).click();
        await expect(toast(page).filter({ hasText: doneText(2) }), `토스트 "${doneText(2)}"`).toBeVisible({ timeout: 30_000 });
        const back = c.entry === "reagent" ? routeOf(3).replace(/\[[^\]]+\]/, x.id) : c.entry === "from-usage" ? routeOf(10) : routeOf(13);
        await page.waitForURL((url) => url.pathname === back, { timeout: 30_000 });
        const logs = await logsOf([x.id, y.id]);
        expect(logs.map((l) => l.reagent_id).sort(), "usage_logs 2행 (시약마다)").toEqual([x.id, y.id].sort());
        for (const l of logs) {
          expect(l.user_id, "사용자 = 로그인한 사람").toBe(u.id);
          expect(l.school_id, "자기 학교").toBe(p.f.school.id);
          expect(l.used_on, "공통 사용일").toBe(past);
          expect([l.class_grade, l.class_no, l.class_subject], "공통 수업").toEqual([2, 7, "통합과학"]);
          expect(l.memo, "공통 메모").toBe("묶음 저장 메모");
        }
        expect(logs.find((l) => l.reagent_id === x.id)!.amount).toBe(12.5);
        expect(logs.find((l) => l.reagent_id === y.id)!.amount).toBe(3);
        expect(await stocksOf([x.id, y.id]), "재고 차감").toEqual([300 - 12.5, 40 - 3]);
        expect(Date.now() - t0, "저장 → 이동").toBeLessThan(60_000);
      } finally {
        await t.context.close();
      }
    });
  }

  test(`[C1][S4] 일회용 교사 화면 3 "사용 기록" → 화면 4 에 그 시약이 담긴 채 (rules usage_batch.entry) · 저장 뒤 그 시약 상세로`, async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const p = await prepared(info);
    const x = await newReagent(p, "타", 80, "mL");
    const detail = routeOf(3).replace(/\[[^\]]+\]/, x.id);
    const t = await openTemp(browser, info, p.f.teacher, detail);
    const page = t.page;
    try {
      const link = page.locator("main").getByRole("link", { name: exact("사용 기록") }).filter({ visible: true }).first();
      await expect(link, '화면 3 "사용 기록"').toBeVisible({ timeout: 45_000 });
      await link.click();
      await page.waitForURL((u) => u.pathname === routeOf(4));
      expect(new URL(page.url()).searchParams.get("reagent"), "?reagent = 그 시약").toBe(x.id);
      await waitUsage(page);
      await expect(items(page), "그 시약 하나가 담긴 채").toHaveCount(1);
      await expect(itemNamed(page, x.name)).toHaveCount(1);
      await amountOf(page, x.name).fill("1");
      await saveButton(page).click();
      await expect(toast(page).filter({ hasText: doneText(1) })).toBeVisible({ timeout: 30_000 });
      await page.waitForURL((u) => u.pathname === detail, { timeout: 30_000 });
      expect(await stocksOf([x.id])).toEqual([79]);
    } finally {
      await t.context.close();
    }
  });

  test(`[C1][S4] 일회용 학생 서버 거절(한 트랜잭션 전부 취소 — 화면을 연 뒤 한 시약 재고가 줄어듦): 토스트 "${SERVER_FAIL}" · 그 행 표시(aria-invalid) · 다른 행·재고·기록 그대로 · 화면 그대로(이동 없음)`, async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const p = await prepared(info);
    const [x, y] = [await newReagent(p, "파", 100, "mL"), await newReagent(p, "하", 100, "mL")];
    const t = await openTemp(browser, info, p.f.student, usagePath(x.id));
    const page = t.page;
    try {
      await waitUsage(page);
      await addPick(page, [y.name]);
      await amountOf(page, x.name).fill("5");
      await amountOf(page, y.name).fill("10");
      await expect(saveButton(page)).toBeEnabled();
      // 다른 사람이 그 사이에 써서 재고가 줄어든 상황 (준비 — service role)
      const cut = await service().from("reagents").update({ stock: 3 }).eq("id", y.id).select("id");
      expect(cut.data ?? [], "준비: 재고 3 으로").toHaveLength(1);
      const before = { logs: await logsOf([x.id, y.id]), stocks: await stocksOf([x.id, y.id]) };
      await saveButton(page).click();
      await expect(toast(page).filter({ hasText: SERVER_FAIL }), `토스트 "${SERVER_FAIL}"`).toBeVisible({ timeout: 30_000 });
      await expect(amountOf(page, y.name), "문제 행 표시").toHaveAttribute("aria-invalid", "true");
      await expect(amountOf(page, x.name), "다른 행은 표시 없음").not.toHaveAttribute("aria-invalid", "true");
      await expect(toast(page).filter({ hasText: /시약 사용을 기록했어요/ }), "성공 토스트 없음").toHaveCount(0);
      expect(new URL(page.url()).pathname, "이동 없음").toBe(routeOf(4));
      expect({ logs: await logsOf([x.id, y.id]), stocks: await stocksOf([x.id, y.id]) }, "전부 취소 — 기록·재고 그대로").toEqual(before);
      await page.screenshot({ path: join(process.cwd(), "test-results", `v1-4-error-${t.viewport}.png`), fullPage: false });
    } finally {
      await t.context.close();
    }
  });

  test(`[C1][S4] 일회용 admin 최근 수업 칩: 그 사용자의 최근 기록에서 서로 다른 조합 최대 ${RECENT_MAX}개(최신순) "{학년}학년 {반}반 · {수업명}"(있는 것만) · 누르면 학년·반·수업명 세 칸 채움 · 고른 칩 표시 · 저장하면 그 값`, async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const p = await prepared(info);
    const r = await newReagent(p, "거", 100, "g");
    const combos = [
      { g: 1, n: 1, s: "물리" },
      { g: 1, n: 2, s: "통합과학" },
      { g: 2, n: null, s: null },
      { g: 3, n: 4, s: "화학" },
      { g: null, n: null, s: "지구과학" },
    ];
    for (const c of combos) {
      await prepRecord(p.c.admin, [r.id], c);
      await new Promise((res) => setTimeout(res, 50));
    }
    await prepRecord(p.c.admin, [r.id], {}); // 수업 없는 기록은 칩이 되지 않는다
    const want = combos.slice(-RECENT_MAX).reverse().map((c) => classText(c.g, c.n, c.s));
    const t = await openTemp(browser, info, p.f.admin, usagePath(r.id));
    const page = t.page;
    try {
      await waitUsage(page);
      const chips = classSelect(page).locator(sel(RECENT_CHIP));
      await expect(chips, `칩 ${RECENT_MAX}`).toHaveCount(RECENT_MAX);
      expect((await chips.allInnerTexts()).map((s) => s.trim()), "최근 조합 (최신순)").toEqual(want);
      await expect(classSelect(page).getByText("최근", { exact: true }), '"최근" 캡션').toBeVisible();
      const target = combos[combos.length - 2]; // 3학년 4반 · 화학
      await chips.filter({ hasText: classText(target.g, target.n, target.s) }).click();
      await expect(gradeSelect(page), "학년 채움").toHaveValue(String(target.g));
      await expect(classNoSelect(page), "반 채움").toHaveValue(String(target.n));
      await expect(subjectInput(page), "수업명 채움").toHaveValue(target.s!);
      await expect(chips.filter({ hasText: classText(target.g, target.n, target.s) }), "고른 칩").toHaveAttribute("aria-pressed", "true");
      await expect(chips.filter({ hasText: want[0] }), "안 고른 칩").toHaveAttribute("aria-pressed", "false");
      // 학년 select 범위 = 학교급(일회용 학교 "…고등학교" → rules class_info.grades 고등학교)
      const gradeOpts = (await gradeSelect(page).locator("option").allInnerTexts()).map((s) => s.trim()).filter((s) => /^\d+학년$/.test(s));
      expect(gradeOpts, "학년 = 고등학교 범위").toEqual(CI.grades["고등학교"].map((g) => `${g}학년`));
      const classOpts = (await classNoSelect(page).locator("option").allInnerTexts()).map((s) => s.trim()).filter((s) => /^\d+반$/.test(s));
      expect(classOpts.length, `반 ${CI.classes[0]}~${CI.classes[1]}`).toBe(CI.classes[1] - CI.classes[0] + 1);
      await amountOf(page, r.name).fill("1");
      const before = (await logsOf([r.id])).length;
      await saveButton(page).click();
      await expect(toast(page).filter({ hasText: doneText(1) })).toBeVisible({ timeout: 30_000 });
      await expect.poll(async () => (await logsOf([r.id])).length).toBe(before + 1);
      const last = (await logsOf([r.id])).at(-1)!;
      expect([last.class_grade, last.class_no, last.class_subject], "칩 값으로 저장").toEqual([target.g, target.n, target.s]);
    } finally {
      await t.context.close();
    }
  });

  test(`[C1][S4] 일회용 학생 상태 프레임 대조: 4-empty(제목·본문·데스크톱 안내 줄·학년/반/수업명 안내·메모 안내·"${SAVE_EMPTY}") · 4-past-date(지난 날짜 = 고정 바 안 past-date-note, 저장 버튼 위(모바일)/왼쪽(데스크톱)) · 4-error(초과 · 빈 값 문구)`, async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const p = await prepared(info);
    const x = await newReagent(p, "너", 120, "mL");
    const t = await openTemp(browser, info, p.f.student, usagePath());
    const page = t.page;
    const vp = t.viewport;
    try {
      await waitUsage(page);
      // 4-empty
      const fe = `4-empty-${vp}`;
      const card = page.locator(`main ${sel(EMPTY)}`);
      await expect(card, "빈 카드").toContainText(firstText(fe, (n) => n.name === "heading" && n.path.includes(EMPTY), "빈 제목"));
      await expect(card).toContainText(firstText(fe, (n) => n.name === "body" && n.path.includes(EMPTY), "빈 본문"));
      if (vp === "desktop") await expect(card).toContainText(firstText(fe, (n) => n.name === "hint", "빈 안내"));
      else await expect(card.locator(sel("reagent-add")), "모바일: 빈 카드 안 시약 추가").toHaveCount(1);
      await expect(list(page).getByText(firstText(fe, (n) => n.name === "heading" && !n.path.includes(EMPTY), "머리"), { exact: true }), "머리 0개").toBeVisible();
      await expect(gradeSelect(page).locator("option").first(), "학년 안내").toHaveText(firstText(fe, (n) => n.path.includes("grade-select") && n.name === "input-value", "학년"));
      await expect(classNoSelect(page).locator("option").first(), "반 안내").toHaveText(firstText(fe, (n) => n.path.includes("class-number-select") && n.name === "input-value", "반"));
      await expect(subjectInput(page), "수업명 안내").toHaveAttribute("placeholder", firstText(fe, (n) => n.path.includes("class-select") && n.path.includes("text-input"), "수업명"));
      await expect(memoInput(page), "메모 안내").toHaveAttribute("placeholder", "메모 (선택)");
      await expect(saveButton(page)).toHaveText(exact(SAVE_EMPTY));
      await page.screenshot({ path: join(process.cwd(), "test-results", `v1-4-empty-${vp}.png`), fullPage: false });
      // 4-past-date
      await addPick(page, [x.name]);
      const past = daysAgo(3);
      await dateInput(page).fill(past);
      const note = saveBar(page).locator(sel("past-date-note"));
      await expect(note, "past-date-note = 고정 바 안").toHaveCount(1);
      const tpl = firstText(`4-past-date-${vp}`, (n) => n.path.includes("past-date-note") && !!n.text, "안내");
      const md = `${Number(past.slice(5, 7))}월 ${Number(past.slice(8, 10))}일`;
      await expect(note).toHaveText(exact(tpl.replace(/\d{1,2}월 \d{1,2}일/, md)));
      const nb = (await note.boundingBox())!;
      const sb = (await saveButton(page).boundingBox())!;
      if (vp === "mobile") expect(nb.y + nb.height, "모바일: 저장 버튼 위").toBeLessThanOrEqual(sb.y + 1);
      else expect(nb.x + nb.width, "데스크톱: 저장 버튼 왼쪽").toBeLessThanOrEqual(sb.x + 1);
      await page.screenshot({ path: join(process.cwd(), "test-results", `v1-4-past-date-${vp}.png`), fullPage: false });
      // 4-error
      await amountOf(page, x.name).fill("150");
      await expect(page.locator(`main ${sel(OVER)}`)).toHaveText(exact(overText(x.stock, x.unit)));
      await amountOf(page, x.name).fill("");
      await amountOf(page, x.name).blur();
      await expect(page.locator("main").getByText(firstText(`4-error-${vp}`, (n) => n.name === "field-error", "빈 값"), { exact: true })).toHaveCount(1);
    } finally {
      await t.context.close();
    }
  });
});

/** 시약 담기 (모바일 시트 / 데스크톱 드롭다운) */
async function addPick(page: Page, names: string[]): Promise<void> {
  await openPicker(page);
  for (const n of names) await pickerRow(page, n).first().click();
  // 데스크톱: 검색 칸에서 Esc 로 닫는다 ("닫기" 링크 자체는 고르기 테스트에서 본다)
  if (isDeskPage(page)) await page.keyboard.press("Escape");
  else await picker(page).getByRole("button", { name: exact(pickLabel(names.length)) }).click();
  await expect(picker(page)).toHaveCount(0);
  for (const n of names) await expect(itemNamed(page, n)).toHaveCount(1);
}

// ---------- C3: 데스크톱 본문 페이지 배치 ----------
test.describe("일회용 학교 C3", () => {
  test.skip(!HAS_SERVICE, NO_SERVICE_REASON);
  const FORM_W = (rules as unknown as { desktop_shell: { form_width: number; heavy_pages: number[] } }).desktop_shell.form_width;
  const fnode = (f: string, name: string) => {
    const n = newFrame(f).find((x) => x.name === name);
    if (!n) throw new Error(`${f} 에 ${name} 없음`);
    return n;
  };
  test(`[C3][S4] 일회용 교사 1440 = 본문 페이지(rules desktop_shell.heavy_pages): ${DRAWER_NAME} 0 · page-column 폭 ${FORM_W}(form_width) 본문 가운데 · 검색 칸 아래 드롭다운(열 폭 = 시안 4-picker-desktop) · 담은 시약 data-table(열 안) · 저장 바 = 사이드바 오른쪽~화면 끝 · 화면 아래 고정 · 높이 = 시안 save-bar · 버튼 오른쪽 끝 / 390 = data-table · app-sidebar · 드로어 0, 저장 바는 탭바 위`, async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    expect((rules as unknown as { desktop_shell: { heavy_pages: number[] } }).desktop_shell.heavy_pages, "heavy_pages 에 4").toContain(4);
    const p = await prepared(info);
    const [x, y] = [await newReagent(p, "더", 10, "g"), await newReagent(p, "러", 10, "g")];
    const t = await openTemp(browser, info, p.f.teacher, usagePath(x.id));
    const page = t.page;
    try {
      await waitUsage(page);
      if (!isDeskPage(page)) {
        for (const n of ["data-table", "app-sidebar", DRAWER_NAME]) await expect(page.locator(sel(n)), `390 ${n} 0`).toHaveCount(0);
        const bar = (await saveButton(page).boundingBox())!;
        const tab = (await page.locator(sel("tab-bar")).boundingBox())!;
        expect(bar.y + bar.height, "저장 버튼은 탭바 위").toBeLessThanOrEqual(tab.y + 1);
        return;
      }
      const vw = page.viewportSize()!.width;
      const vh = page.viewportSize()!.height;
      await expect(page.locator(sel(DRAWER_NAME)), "드로어 0").toHaveCount(0);
      const side = (await page.locator(sel("app-sidebar")).boundingBox())!;
      const col = page.locator('main [data-name="page-column"]');
      await expect(col, "page-column 1").toHaveCount(1);
      const cb = (await col.boundingBox())!;
      expect(Math.round(cb.width), `page-column 폭 = form_width ${FORM_W}`).toBe(FORM_W);
      expect(Math.abs(cb.x + cb.width / 2 - (side.x + side.width + vw) / 2), "본문 가운데").toBeLessThanOrEqual(2);
      // 담은 시약 표는 열 안
      const tb = (await page.locator(`main ${sel(LIST_NAME)} ${sel("data-table")}`).boundingBox())!;
      expect(tb.x >= cb.x - 1 && tb.x + tb.width <= cb.x + cb.width + 1, "data-table 은 page-column 안").toBe(true);
      // 드롭다운 = 검색 칸 바로 아래, 폭 = 시안
      await openPicker(page);
      const ab = (await page.locator(`main ${sel("reagent-add")}`).boundingBox())!;
      const pb = (await picker(page).boundingBox())!;
      expect(pb.y, "드롭다운은 검색 칸 아래").toBeGreaterThanOrEqual(ab.y + ab.height - 1);
      expect(Math.round(pb.width), "드롭다운 폭 = 시안 4-picker-desktop").toBe(fnode("4-picker-desktop", PICKER).width);
      await pickerRow(page, y.name).click();
      await page.keyboard.press("Escape");
      // 저장 바
      const bar = saveBar(page);
      expect(await bar.evaluate((el) => getComputedStyle(el).position), "저장 바 고정").toBe("fixed");
      const bb = (await bar.boundingBox())!;
      expect(Math.round(bb.x), "저장 바 왼쪽 = 사이드바 오른쪽").toBe(Math.round(side.x + side.width));
      expect(Math.round(bb.x + bb.width), "저장 바 오른쪽 = 화면 끝").toBe(vw);
      expect(Math.round(bb.y + bb.height), "저장 바 아래 = 화면 아래").toBe(vh);
      expect(Math.abs(bb.height - fnode("4-desktop", "save-bar").height!), "저장 바 높이 = 시안 save-bar").toBeLessThanOrEqual(1);
      const sb = (await saveButton(page).boundingBox())!;
      const pad = ((fnode("4-desktop", "save-bar") as unknown as { padding: number[] }).padding ?? [16, 32, 16, 32])[1];
      expect(Math.abs(bb.x + bb.width - pad - (sb.x + sb.width)), "저장 버튼 = 바 오른쪽 끝(안쪽 여백)").toBeLessThanOrEqual(2);
      await expect(saveButton(page)).toHaveText(exact(saveLabel(2)));
      // 맨 아래 메모 칸이 바에 가리지 않는다 (끝까지 내려서)
      await page.mouse.wheel(0, 5000);
      await expect.poll(async () => (await memoInput(page).boundingBox())!.y + (await memoInput(page).boundingBox())!.height <= (await bar.boundingBox())!.y + 1, { message: "메모 칸이 저장 바 위" }).toBe(true);
    } finally {
      await t.context.close();
    }
  });
});

// ---------- 둘러보기 · 비로그인 ----------
test(`[R-ui][S4] 비로그인 /usage/new → 로그인 화면 (사용 기록 칸 0) · 둘러보기(/demo) 의 "기록"은 잠금(rules guest.locked_tabs) — 화면 4 로 가는 링크 0`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const guest = (rules as unknown as { guest: { locked_tabs: string[]; lock: string } }).guest;
  expect(guest.locked_tabs, "rules guest.locked_tabs 에 기록").toContain("기록");
  const context = await anonContext(browser, info);
  try {
    const page = await context.newPage();
    await page.goto(routeOf(4));
    await page.waitForURL((u) => u.pathname === routeOf(1), { timeout: 30_000 });
    await expect(page.locator(sel("usage-batch-list")), "비로그인: 사용 기록 칸 0").toHaveCount(0);
    await page.goto("/demo");
    await page.waitForLoadState("load");
    await expect(page.locator(sel(guest.lock)).filter({ visible: true }).first(), "둘러보기 잠금 표시").toBeVisible({ timeout: 45_000 });
    await expect(page.locator(`a[href^="${routeOf(4)}"]`), "둘러보기: 화면 4 로 가는 링크 0").toHaveCount(0);
    const lockHosts = page.locator(`button:has(${sel(guest.lock)})`).filter({ visible: true }).filter({ hasText: "기록" });
    expect(await lockHosts.count(), '"기록" 잠금 버튼').toBeGreaterThanOrEqual(1);
  } finally {
    await context.close();
  }
});
