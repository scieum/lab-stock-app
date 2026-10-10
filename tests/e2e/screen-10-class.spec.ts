// 화면 10 수업 기록 · 반 필터 · 삭제된 시약 (d7 §24, design/rules.json 1.25 class_info(label · filter · grades) · reagent_delete.history) — C1 (390 · 1440).
// 기준(구현이 아니라 여기서 도출): class-label "{학년}학년 {반}반 · {수업명}"(있는 것만) — 모바일 행 caption(없으면 없음),
//   데스크톱 data-table 열 "수업"(없으면 "—"), 드로어 "수업 | 값". class-filter "반: 전체 ▾" → 학년(전체·1~) → 반(학년 전체·1~20), 서버 필터(?grade · ?cls).
//   보관(삭제)된 시약의 기록 = 시약명 회색(시안 10 fills) + deleted-reagent-tag "삭제된 시약" + 시약 상세·MSDS 링크 없음.
//   새 프레임 10-{mobile|desktop} (머리행 열 · 글자색).
// 데이터: 일회용 학교(admin·교사·학생)의 임시 시약 · 기록만. 목록 = 그 계정 세션(RLS)의 usage_records 와 대조 (screen-10-helpers).
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { rules, sel } from "./screen-helpers";
import { isDeskPage, newFrame } from "./desk-helpers";
import { HAS_SERVICE, clientFor, openTemp, service, tempSchoolLike } from "./screen-8-helpers";
import { NO_S11_RESIDUE, cleanup, makeFixture, sharedCabinetSnapshot, type S11Fixture } from "./screen-11-helpers";
import { CLASS_LABEL, CLASS_NONE_DESK, DELETED_TAG, DESK_HEADS, classText, expectDetail, gotoAndMatch, historyPath, openRow, rows, waitHistory, expectListMatchesDb } from "./screen-10-helpers";

test.describe.configure({ mode: "default" });

const GROUP = "s10cls";
const TIMEOUT = 300_000;
const NO_SERVICE_REASON = "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)";
const STORAGE = (rules as unknown as { cabinet: { storage_classes: string[] } }).cabinet.storage_classes;
const CI = (rules as unknown as { class_info: { filter: string; label: string; grades: Record<string, number[]>; classes: [number, number] } }).class_info;
const RD = (rules as unknown as { reagent_delete: { history: string } }).reagent_delete;
/** class_info.filter "button-pill-soft '반: 전체 ▾'" */
const FILTER_ALL = ((/'([^']+)'/.exec(CI.filter) ?? [])[1] ?? "").replace(/\s*▾$/, "");
/** reagent_delete.history "deleted-reagent-tag '삭제된 시약'" */
const TAG_TEXT = (/'([^']+)'/.exec(RD.history) ?? [])[1] ?? "";
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exact = (s: string) => new RegExp(`^\\s*${esc(s)}\\s*$`);
const rgb = (hex: string) => {
  const h = hex.replace("#", "");
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
};
/** 시안 10-mobile 시약명 글자색: 보통 · 삭제된 시약 */
const NAME_FILL = (() => {
  const ns = newFrame("10-mobile").filter((n) => n.name === "reagent-name");
  const deleted = ns.find((n) => n.path.includes("name-row"));
  const live = ns.find((n) => !n.path.includes("name-row"));
  return { live: (live as unknown as { fills: string[] }).fills[0], deleted: (deleted as unknown as { fills: string[] }).fills[0] };
})();

// ---------- 일회용 학교 · 기록 ----------
type Prepared = {
  f: S11Fixture;
  /** 2학년 3반 · 화학 만 */
  a: { id: string; name: string };
  /** 1학년 만 */
  b: { id: string; name: string };
  /** 수업 없음 */
  c: { id: string; name: string };
  /** 2학년 5반 → 보관 */
  gone: { id: string; name: string };
};
let prepCache: Promise<Prepared> | null = null;
async function newReagent(prep: SupabaseClient, head: string): Promise<{ id: string; name: string }> {
  const name = `${head}수업-${randomUUID().slice(0, 6)}`;
  const res = await prep.rpc("register_reagent", { p_name: name, p_storage_class: STORAGE[0], p_stock: 100, p_unit: "mL", p_intake_date: "2026-09-15", p_msds_url: "https://example.com/msds/s10cls.pdf" });
  expect(res.error, `준비: register_reagent (${res.error?.message})`).toBeNull();
  return { id: ((Array.isArray(res.data) ? res.data[0] : res.data) as { id: string }).id, name };
}
async function record(c: SupabaseClient, ids: string[], g: number | null, n: number | null, s: string | null): Promise<void> {
  const res = await c.rpc("record_usage_batch", { p_items: ids.map((id) => ({ reagent_id: id, amount: 1 })), p_class_grade: g, p_class_no: n, p_class_subject: s });
  expect(res.error, `준비: record_usage_batch (${res.error?.message})`).toBeNull();
}
function prepared(info: TestInfo): Promise<Prepared> {
  prepCache ??= (async () => {
    const f = await makeFixture(info, GROUP);
    const [a, b, c, gone] = [await newReagent(f.prep, "가"), await newReagent(f.prep, "나"), await newReagent(f.prep, "다"), await newReagent(f.prep, "라")];
    const student = await clientFor(f.student);
    const teacher = await clientFor(f.teacher);
    await record(student, [a.id], 2, 3, "화학");
    await record(teacher, [b.id], 1, null, null);
    await record(student, [c.id], null, null, null);
    await record(teacher, [gone.id], 2, 5, null);
    const arc = await teacher.rpc("archive_reagent", { p_reagent_id: gone.id });
    expect(arc.error, `준비: archive_reagent (${arc.error?.message})`).toBeNull();
    return { f, a, b, c, gone };
  })();
  prepCache.catch(() => {
    prepCache = null;
  });
  return prepCache;
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

/** 시약명이 든 기록 행 */
const rowNamed = (page: Page, name: string) => rows(page).filter({ hasText: name });

test(`[C1][S10] 기대값 원본: class_info.filter "${FILTER_ALL}" · label 틀 · 10-desktop 머리 ${DESK_HEADS.join("·")} · 시약명 색 보통 ${NAME_FILL.live} / 삭제 ${NAME_FILL.deleted} · 태그 "${TAG_TEXT}"`, () => {
  expect(FILTER_ALL).toBe("반: 전체");
  expect(CI.label).toMatch(/\{학년\}학년 \{반\}반 · \{수업명\}/);
  expect(CI.label).toMatch(/없으면 '—'/);
  expect(DESK_HEADS, "10-desktop 표 머리에 수업").toContain("수업");
  expect(DESK_HEADS.indexOf("수업"), "수업 = 시약명 다음").toBe(DESK_HEADS.indexOf("시약명") + 1);
  expect(TAG_TEXT).toBe("삭제된 시약");
  expect(NAME_FILL.deleted, "삭제된 시약명 = 회색").not.toBe(NAME_FILL.live);
  expect(classText(2, 3, "화학")).toBe("2학년 3반 · 화학");
  expect(classText(1, null, null)).toBe("1학년");
  expect(classText(null, null, "통합과학")).toBe("통합과학");
});

test.describe("일회용 학교", () => {
  test.skip(!HAS_SERVICE, NO_SERVICE_REASON);

  test(`[C1][S10] 일회용 학생 class-label: 목록 = DB(usage_records — 수업 · 삭제 여부 포함) · "{학년}학년 {반}반 · {수업명}" 있는 것만 · 수업 없는 기록 = 390 class-label 없음 / 1440 "수업" 열 "${CLASS_NONE_DESK}" · 상세 "수업" 줄`, async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const p = await prepared(info);
    const t = await openTemp(browser, info, p.f.student, historyPath());
    const page = t.page;
    try {
      await waitHistory(page);
      const snap = await gotoAndMatch(page, {});
      expect(snap.flat.length, "기록 4").toBe(4);
      const label = (name: string) => rowNamed(page, name).locator(sel(CLASS_LABEL));
      await expect(label(p.a.name), "2학년 3반 · 화학").toHaveText(exact(classText(2, 3, "화학")));
      await expect(label(p.b.name), "1학년 (있는 것만)").toHaveText(exact(classText(1, null, null)));
      if (isDeskPage(page)) {
        const heads = (await page.locator(`main ${sel("data-table")} thead th`).allInnerTexts()).map((s) => s.trim()).filter(Boolean);
        expect(heads, "표 머리 = 시안 10-desktop").toEqual(DESK_HEADS);
        await expect(label(p.c.name), `수업 없음 = "${CLASS_NONE_DESK}"`).toHaveText(exact(CLASS_NONE_DESK));
      } else {
        await expect(label(p.c.name), "390 수업 없음 = class-label 없음").toHaveCount(0);
      }
      const idx = snap.shown.findIndex((r) => r.reagent_id === p.a.id);
      await openRow(page, idx);
      await expectDetail(page, snap.shown[idx]);
      await page.screenshot({ path: join(process.cwd(), "test-results", `v1-10-class-${t.viewport}.png`), fullPage: false });
    } finally {
      await t.context.close();
    }
  });

  test(`[C1][S10] 일회용 교사 class-filter "${FILTER_ALL}" → 학년(전체 · 학교급 범위) → 반: 주소 ?grade · ?cls · 목록 = 같은 필터의 DB · 서버에서 거름(응답 본문에 다른 반 기록 없음) · "전체" → 필터 해제`, async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const p = await prepared(info);
    const t = await openTemp(browser, info, p.f.teacher, historyPath());
    const page = t.page;
    try {
      await waitHistory(page);
      const filter = page.locator(`main ${sel("class-filter")}`);
      const btn = filter.getByRole("button").first();
      await expect(btn, `버튼 "${FILTER_ALL}"`).toHaveText(exact(FILTER_ALL));
      await expect(async () => {
        await btn.click();
        await expect(filter.getByRole("group", { name: "학년" })).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 20_000 });
      const grades = (await filter.getByRole("group", { name: "학년" }).getByRole("button").allInnerTexts()).map((s) => s.trim());
      expect(grades, "학년 = 전체 + 학교급(고등학교) 범위").toEqual(["전체", ...CI.grades["고등학교"].map((g) => `${g}학년`)]);
      let t0 = Date.now();
      await filter.getByRole("button", { name: "2학년", exact: true }).click();
      await page.waitForURL((u) => u.searchParams.get("grade") === "2" && !u.searchParams.has("cls"));
      await expectListMatchesDb(page, { grade: 2 }, t0);
      for (const r of [p.a, p.gone]) await expect(rowNamed(page, r.name), `2학년: ${r.name}`).toHaveCount(1);
      for (const r of [p.b, p.c]) await expect(rowNamed(page, r.name), `2학년 아님: ${r.name}`).toHaveCount(0);
      // 반 줄
      const classes = filter.getByRole("group", { name: "반" });
      await expect(classes, "학년을 고르면 반 줄").toBeVisible();
      const classBtns = (await classes.getByRole("button").allInnerTexts()).map((s) => s.trim());
      expect(classBtns.length, `반 = 학년 전체 + ${CI.classes[0]}~${CI.classes[1]}`).toBe(1 + CI.classes[1] - CI.classes[0] + 1);
      t0 = Date.now();
      await classes.getByRole("button", { name: "3반", exact: true }).click();
      await page.waitForURL((u) => u.searchParams.get("grade") === "2" && u.searchParams.get("cls") === "3");
      await expectListMatchesDb(page, { grade: 2, cls: 3 }, t0);
      await expect(rows(page), "2학년 3반 = 1건").toHaveCount(1);
      await expect(rowNamed(page, p.a.name)).toHaveCount(1);
      await expect(btn, "버튼에 고른 반").toContainText("2학년");
      await expect(btn).toContainText("3반");
      // 서버 필터: 주소로 바로 열어도 같고, 응답 본문에 다른 반 기록의 시약명이 없다
      const res = await page.goto(historyPath({ grade: 2, cls: 3 }));
      const html = (await res?.text()) ?? "";
      expect(html, "응답 본문에 2학년 3반 기록").toContain(p.a.name);
      for (const r of [p.b, p.c, p.gone]) expect(html, `응답 본문에 다른 반 기록 ${r.name} 없음 (서버에서 거름)`).not.toContain(r.name);
      await waitHistory(page);
      // 전체 → 해제
      await expect(async () => {
        await page.locator(`main ${sel("class-filter")}`).getByRole("button").first().click();
        await expect(page.locator(`main ${sel("class-filter")}`).getByRole("group", { name: "학년" })).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 20_000 });
      t0 = Date.now();
      await page.locator(`main ${sel("class-filter")}`).getByRole("button", { name: "전체", exact: true }).click();
      await page.waitForURL((u) => !u.searchParams.has("grade") && !u.searchParams.has("cls"));
      const all = await expectListMatchesDb(page, {}, t0);
      expect(all.flat.length, "전체 = 4건").toBe(4);
    } finally {
      await t.context.close();
    }
  });

  test(`[C1][S10] 일회용 admin 보관(삭제)된 시약의 기록: 시약명 회색(시안 10 ${NAME_FILL.deleted}) + ${DELETED_TAG} "${TAG_TEXT}" · 행·상세에 시약 상세/MSDS 링크 없음 · 기록·사용량·수업은 그대로`, async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const p = await prepared(info);
    const t = await openTemp(browser, info, p.f.admin, historyPath());
    const page = t.page;
    try {
      await waitHistory(page);
      const snap = await gotoAndMatch(page, {});
      const idx = snap.shown.findIndex((r) => r.reagent_id === p.gone.id);
      expect(idx, "보관 시약 기록이 목록에 남음").toBeGreaterThanOrEqual(0);
      expect(snap.shown[idx].reagent_deleted, "usage_records reagent_deleted").toBe(true);
      expect(snap.flat[idx].deleted, "화면 태그").toBe(true);
      const row = rowNamed(page, p.gone.name);
      await expect(row.locator(sel(DELETED_TAG)), `태그 "${TAG_TEXT}"`).toHaveText(exact(TAG_TEXT));
      await expect(rows(page).locator(sel(DELETED_TAG)), "태그는 보관 시약 행에만").toHaveCount(1);
      const nameColor = (r: ReturnType<typeof rowNamed>, name: string) => r.getByText(name, { exact: true }).first().evaluate((el) => getComputedStyle(el).color);
      expect(await nameColor(row, p.gone.name), "삭제된 시약명 = 회색").toBe(rgb(NAME_FILL.deleted));
      expect(await nameColor(rowNamed(page, p.a.name), p.a.name), "보통 시약명 = ink").toBe(rgb(NAME_FILL.live));
      await expect(row.locator('a[href*="/reagents/"], a[href*="/msds/"]'), "행에 시약·MSDS 링크 0").toHaveCount(0);
      await expect(row.locator(sel(CLASS_LABEL)), "수업 그대로").toHaveText(exact(classText(2, 5, null)));
      await openRow(page, idx);
      await expectDetail(page, snap.shown[idx]);
    } finally {
      await t.context.close();
    }
  });
});
