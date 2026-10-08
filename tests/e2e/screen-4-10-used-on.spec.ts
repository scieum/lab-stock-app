// 화면 4 사용일 입력 · 화면 10 사용일 묶음 (d7 §15, 2026-10-07 — design/rules.json 1.17 usage_date · variants["4"]["past-date"]) C1 · V1.
// 기준(구현이 아니라 여기서 도출): design/rules.json usage_date(field · past_note · history), variants["4"],
//       harness/d7-data.md §15 (기본 오늘 · 최댓값 오늘 · 오늘 아니면 past-date-note · 화면 10 사용일 묶음·정렬 · 기간도 사용일 ·
//       기록한 날이 다를 때만 회색 캡션), §7 (화면 10 월 묶음 · 상세), design/frames/4-past-date-*.json · 10-*.json.
// 화면 10 목록은 시안 10(1.17)대로 사용일별 묶음 "10월 7일 · 오늘" (d7 §15 2026-10-07 정정 — screen-10-helpers).
//
// 데이터: 일회용 학교(admin·교사·학생, service role 로 생성)의 임시 시약에만 쓴다. 판정은 화면과 그 계정 세션(RLS) 조회.
//   service role 은 준비(학교·계정)·정리·대조 조회에만. 정리: usage_logs → 시약 → 시약장 → 프로필 → 계정 → 학교, 잔여물 0.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { routeOf, rules, sel } from "./screen-helpers";
import { tempSchoolLike, HAS_SERVICE, clientFor, openTemp, service, type TempUser } from "./screen-8-helpers";
import { NO_S11_RESIDUE, cleanup, makeFixture, sharedCabinetSnapshot, type S11Fixture } from "./screen-11-helpers";
import { CARD, TOAST, amountInput, submitButton, usagePath, waitUsage } from "./screen-4-helpers";
import {
  CAPTION_RE,
  captionOf,
  expectDetail,
  gotoAndMatch,
  groupLabel,
  openRow,
  readDetail,
  readList,
  recordedCaption,
  recordedTime,
  rows,
  waitHistory,
} from "./screen-10-helpers";
import { framePath } from "../frames";

test.describe.configure({ mode: "default" });

const GROUP = "s410u";
const TIMEOUT = 300_000;
const NO_SERVICE_REASON = "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)";

// ---------- 기대값: rules.json usage_date · variants · 프레임 ----------
const UD = (rules as unknown as { usage_date: Record<string, string> }).usage_date;
const VARIANT_PAST = (rules as unknown as { variants: Record<string, Record<string, string[]>> }).variants["4"]["past-date"];
const COLORS = rules as unknown as { colors: { accent: { value: string }; accent_soft: { value: string }; highlight: { values: string[] } } };
const quoted = (s: string) => (/'([^']+)'/.exec(s) ?? [])[1] ?? "";
/** usage_date.field "usage-date '사용일'" */
const DATE_LABEL = quoted(UD.field);
/** usage_date.past_note "'10월 3일 사용으로 기록해요'" → 날짜만 바꾼 문장 */
const PAST_NOTE_EXAMPLE = quoted(UD.past_note);
const md = (ymd: string) => `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일`;
const pastNote = (ymd: string) => PAST_NOTE_EXAMPLE.replace(/\d{1,2}월 \d{1,2}일/, md(ymd));
const hexToRgb = (hex: string) => {
  const h = hex.replace("#", "");
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
};
const COLORFUL = [COLORS.colors.accent.value, COLORS.colors.accent_soft.value, ...COLORS.colors.highlight.values].map((v) => hexToRgb(v.toLowerCase()));
/** 10 시안 record-caption 글자색 (회색) */
const CAPTION_FILL = (() => {
  const nodes = (JSON.parse(readFileSync(framePath("10-mobile"), "utf8")) as {
    frames: { nodes: { name: string; fills: string[] }[] }[];
  }).frames[0].nodes;
  return nodes.find((n) => n.name === "record-caption")?.fills[0] ?? "";
})();

// ---------- 한국 날짜 ----------
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

// ---------- 화면 4 locator ----------
const dateField = (page: Page) => page.locator(`main ${sel("usage-date")}`);
const dateInput = (page: Page) => dateField(page).locator("input");
const note = (page: Page) => page.locator(`main ${sel("past-date-note")}`);

// ---------- 일회용 학교 ----------
type Prepared = { f: S11Fixture; reagent: string; name: string };
let prepCache: Promise<Prepared> | null = null;
function prepared(info: TestInfo): Promise<Prepared> {
  prepCache ??= (async () => {
    const f = await makeFixture(info, GROUP);
    const name = `임시사용일화면-${Math.random().toString(36).slice(2, 7)}`;
    const res = await f.prep.rpc("register_reagent", {
      p_name: name,
      p_storage_class: (rules as unknown as { cabinet: { storage_classes: string[] } }).cabinet.storage_classes[0],
      p_stock: 1000,
      p_unit: "mL",
      p_intake_date: "2026-09-15",
      p_msds_url: "https://example.com/msds/s410u.pdf",
    });
    expect(res.error, `준비: register_reagent (${res.error?.message})`).toBeNull();
    const id = ((Array.isArray(res.data) ? res.data[0] : res.data) as { id: string }).id;
    return { f, reagent: id, name };
  })();
  prepCache.catch(() => {
    prepCache = null;
  });
  return prepCache;
}

async function logsBy(userId: string, reagentId: string): Promise<{ id: string; used_on: string; used_at: string; amount: number }[]> {
  const r = await service().from("usage_logs").select("id, used_on, used_at, amount").eq("user_id", userId).eq("reagent_id", reagentId).order("used_at");
  if (r.error) throw new Error(`대조 조회 실패: ${r.error.message}`);
  return (r.data ?? []).map((x) => ({ ...(x as { id: string; used_on: string; used_at: string }), amount: Number((x as { amount: number }).amount) }));
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

async function open(browser: Browser, info: TestInfo, u: TempUser, path: string) {
  const t = await openTemp(browser, info, u, path);
  return t;
}

test.describe("일회용 학교", () => {
  test.skip(!HAS_SERVICE, NO_SERVICE_REASON);

  test(`[C1][S4] 기대값 원본: rules usage_date "${DATE_LABEL}" · past_note "${PAST_NOTE_EXAMPLE}" · variants["4"]["past-date"] = ${VARIANT_PAST.join("·")} · 10 시안 캡션 색`, () => {
    expect(DATE_LABEL).toBe("사용일");
    expect(PAST_NOTE_EXAMPLE).toBe("10월 3일 사용으로 기록해요");
    expect(UD.field).toMatch(/기본 오늘/);
    expect(UD.field).toMatch(/오늘 이후 못 고름/);
    expect(VARIANT_PAST).toEqual(["usage-date", "past-date-note"]);
    expect(CAPTION_FILL).toMatch(/^#[0-9a-f]{6}$/i);
  });

  for (const role of ["student", "teacher", "admin"] as const) {
    test(`[C1][S4] 일회용 ${role === "student" ? "학생" : role === "teacher" ? "교사" : "admin"} 사용일: "${DATE_LABEL}" 기본 = 한국 오늘 · max = 오늘 · 사용량 아래 · 지난 날짜 → past-date-note "${PAST_NOTE_EXAMPLE}" 틀(저장 버튼 위, 무채색) · 미래 날짜 저장 거부 · 지난 날짜 저장 → DB used_on · 화면 10 그 사용일 묶음("M월 D일")에 "N월 N일에 기록" 캡션 · 상세 사용일·기록한 날`, async ({ browser }, info) => {
      test.setTimeout(TIMEOUT);
      const { f, reagent, name } = await prepared(info);
      const u = f[role];
      await awayFromMidnight();
      const today = daysAgo(0);
      const past = daysAgo(40);
      const t = await open(browser, info, u, usagePath(reagent));
      const page = t.page;
      try {
        await waitUsage(page, true);
        await expect(page.locator(sel(CARD)).first()).toContainText(name);
        // 기본 상태
        await expect(dateField(page), `usage-date "${DATE_LABEL}" 1개`).toHaveCount(1);
        await expect(dateField(page).locator("label"), "라벨").toContainText(DATE_LABEL);
        await expect(dateInput(page), "기본 = 한국 오늘").toHaveValue(today);
        await expect(dateInput(page), "고를 수 있는 마지막 날 = 오늘").toHaveAttribute("max", today);
        await expect(note(page), "오늘이면 past-date-note 없음").toHaveCount(0);
        const amt = (await amountInput(page).boundingBox())!;
        const dt = (await dateInput(page).boundingBox())!;
        expect(dt.y, "사용일은 사용량 아래 (rules usage_date.field)").toBeGreaterThan(amt.y);
        // 지난 날짜 → past-date-note
        await dateInput(page).fill(past);
        await expect(note(page), "지난 날짜 → past-date-note").toHaveCount(1);
        await expect(note(page)).toHaveText(new RegExp(`^\\s*${pastNote(past)}\\s*$`));
        for (const c of VARIANT_PAST) await expect(page.locator(sel(c)).first(), `variants["4"]["past-date"] ${c}`).toBeVisible();
        const nb = (await note(page).boundingBox())!;
        const sb = (await submitButton(page).boundingBox())!;
        expect(nb.y + nb.height, "past-date-note 는 저장 버튼 위").toBeLessThanOrEqual(sb.y + 1);
        const paints = await note(page).evaluate((el) => {
          const out: string[] = [];
          for (const n of [el, ...Array.from(el.querySelectorAll("*"))]) {
            const cs = getComputedStyle(n);
            out.push(cs.color, cs.backgroundColor, cs.borderTopColor);
            if (n instanceof SVGElement) out.push(cs.stroke, cs.fill);
          }
          return out;
        });
        expect(paints.filter((c) => COLORFUL.includes(c)), "past-date-note 무채색 (핑크·하늘색 없음)").toEqual([]);
        if (role === "student") await page.screenshot({ path: join(process.cwd(), "test-results", `v1-4-past-date-${t.viewport}.png`), fullPage: false });
        // 오늘로 되돌리면 안내가 사라진다
        await dateInput(page).fill(today);
        await expect(note(page), "오늘로 되돌림 → 없음").toHaveCount(0);

        // 미래 날짜는 저장되지 않는다 (입력 max 를 넘겨 넣어도)
        const before = await logsBy(u.id, reagent);
        await amountInput(page).fill("1");
        await dateInput(page).fill(daysAgo(-1));
        await submitButton(page).click();
        await expect(page.locator('main [role="alert"]').first(), "미래 사용일 → 에러").toBeVisible({ timeout: 30_000 });
        await expect(page.locator(sel(TOAST)), "미래 사용일 → 토스트 없음").toHaveCount(0);
        expect(await logsBy(u.id, reagent), "미래 사용일 → usage_logs 그대로").toEqual(before);

        // 지난 날짜로 저장
        await dateInput(page).fill(past);
        await amountInput(page).fill("1");
        const t0 = Date.now();
        await submitButton(page).click();
        await expect(page.locator(sel(TOAST)), "저장 → 토스트").toHaveCount(1, { timeout: 30_000 });
        await expect(dateInput(page), "저장 뒤 사용일은 오늘로").toHaveValue(today);
        await expect(note(page), "저장 뒤 안내 없음").toHaveCount(0);
        const added = (await logsBy(u.id, reagent)).filter((l) => !before.some((b) => b.id === l.id));
        expect(added, "usage_logs 새 행 1").toHaveLength(1);
        expect(added[0].used_on, "DB used_on = 고른 지난 날짜").toBe(past);
        expect(Math.abs(Date.parse(added[0].used_at) - t0), "used_at = 기록한 시각").toBeLessThan(60_000);

        // 화면 10: 기간 3개월 (40일 전 사용일 포함). 목록 = DB (사용일 묶음·정렬·캡션 — screen-10-helpers)
        const snap = await gotoAndMatch(page, { period: "3m", q: name });
        const idx = snap.shown.findIndex((r) => r.id === added[0].id);
        expect(idx, "방금 기록이 화면 10 (최근 3개월)에").toBeGreaterThanOrEqual(0);
        expect(snap.flat[idx].group, "사용일 묶음 헤더 = 사용일 (\"M월 D일\")").toBe(groupLabel(past, today));
        expect(snap.flat[idx].time, "다른 날 기록: 사용자 옆 시각 없음").toBeNull();
        expect(snap.flat[idx].caption, "캡션 = 기록한 날").toBe(recordedCaption(today));
        await openRow(page, idx);
        await expectDetail(page, snap.shown[idx]);
        const d = await readDetail(page);
        expect(d.fields["사용일"], "상세 사용일").toBe(past);
        expect(d.fields["기록한 날"].startsWith(today), "상세 기록한 날 = 오늘").toBe(true);
        // 최근 1개월(기본)에는 없다 — 기간도 사용일 기준
        const one = await gotoAndMatch(page, { q: name });
        expect(one.shown.some((r) => r.id === added[0].id), "최근 1개월에는 40일 전 사용일 기록 없음").toBe(false);
      } finally {
        await t.context.close();
      }
    });
  }

  test(`[C1][S10] 일회용 학생 화면 10: 사용일로 묶고 사용일 최신순(같은 날 기록 시각 최신순) · 늦게 기록한 지난 날짜는 그 날짜 자리 · 캡션 "N월 N일에 기록"은 기록한 날 ≠ 사용일 일 때만(회색 ${CAPTION_FILL}) · 상세 사용자·사용일·기록한 날·메모`, async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const { f, reagent, name } = await prepared(info);
    await awayFromMidnight();
    const today = daysAgo(0);
    const teacher = await clientFor(f.teacher);
    // 기록 순서와 사용일 순서를 섞어 남긴다 (교사 세션 record_usage)
    const plan = [
      { usedOn: daysAgo(0), memo: "오늘 1" },
      { usedOn: daysAgo(1), memo: "어제를 오늘 기록" },
      { usedOn: daysAgo(35), memo: "35일 전" },
      { usedOn: daysAgo(0), memo: "오늘 2" },
      { usedOn: daysAgo(1), memo: null },
    ];
    const made: string[] = [];
    for (const p of plan) {
      const res = await teacher.rpc("record_usage", { reagent_id: reagent, amount: 1, used_on: p.usedOn, ...(p.memo ? { memo: p.memo } : {}) });
      expect(res.error, `준비 record_usage(${p.usedOn}): ${res.error?.message}`).toBeNull();
      made.push(((Array.isArray(res.data) ? res.data[0] : res.data) as { id: string }).id);
      await new Promise((r) => setTimeout(r, 30));
    }
    const t = await open(browser, info, f.student, routeOf(10));
    const page = t.page;
    try {
      await waitHistory(page);
      // 목록 = DB (사용일 최신순 · 월 묶음 · 캡션) — 3개월
      const snap = await gotoAndMatch(page, { period: "3m", q: name });
      const mine = snap.shown.filter((r) => made.includes(r.id));
      expect(mine.length, "준비한 기록 5건이 모두 목록에").toBe(made.length);
      // 사용일 순서 (오늘 2 → 오늘 1 → 어제(null 메모) → 어제를 오늘 기록 → 35일 전)
      const want = [made[3], made[0], made[4], made[1], made[2]];
      expect(mine.map((r) => r.id), "사용일 최신순, 같은 날은 기록 시각 최신순").toEqual(want);
      // 캡션: 기록한 날(오늘) ≠ 사용일 인 행만
      for (const r of mine) {
        const i = snap.shown.indexOf(r);
        const shouldCaption = r.used_on !== today;
        expect(snap.flat[i].caption, `${r.used_on} 행 캡션`).toBe(shouldCaption ? recordedCaption(today) : null);
        expect(captionOf(r), "도우미 판단 = 기록한 날 ≠ 사용일").toBe(shouldCaption ? recordedCaption(today) : null);
      }
      // 캡션 글자색 = 시안 회색
      const capRow = rows(page).nth(snap.shown.findIndex((r) => r.id === made[1]));
      const cap = capRow.getByText(CAPTION_RE);
      await expect(cap, "캡션 1개").toHaveCount(1);
      expect(await cap.evaluate((el) => getComputedStyle(el).color), "캡션 회색 = 시안 record-caption").toBe(hexToRgb(CAPTION_FILL.toLowerCase()));
      const sameRow = rows(page).nth(snap.shown.findIndex((r) => r.id === made[0]));
      await expect(sameRow.getByText(CAPTION_RE), "같은 날 기록 = 캡션 없음").toHaveCount(0);
      // 35일 전은 그 날 묶음 · 오늘 기록은 "· 오늘" 묶음에 기록 시각과 함께
      const old = snap.shown.findIndex((r) => r.id === made[2]);
      expect(snap.flat[old].group, "35일 전 사용일 묶음").toBe(groupLabel(daysAgo(35), today));
      for (const id of [made[3], made[0]]) {
        const i = snap.shown.findIndex((r) => r.id === id);
        expect(snap.flat[i].group, "오늘 사용일 묶음 = \"M월 D일 · 오늘\"").toBe(`${md(today)} · 오늘`);
        expect(snap.flat[i].time, "같은 날 기록: 사용자 옆 기록 시각").toBe(recordedTime(snap.shown[i].used_at));
      }
      // 상세: 지난 사용일 기록
      await openRow(page, snap.shown.findIndex((r) => r.id === made[1]));
      await expectDetail(page, snap.shown.find((r) => r.id === made[1])!);
      const d = await readDetail(page);
      expect(d.fields["사용일"]).toBe(daysAgo(1));
      expect(d.fields["기록한 날"].startsWith(today), "기록한 날 = 오늘 시각").toBe(true);
      expect(d.fields["메모"]).toBe("어제를 오늘 기록");
      // 기본 기간(최근 1개월)은 사용일 기준: 35일 전 사용일 기록은 빠진다
      const one = await gotoAndMatch(page, { q: name });
      expect(one.shown.some((r) => r.id === made[2]), "최근 1개월: 35일 전 사용일 빠짐").toBe(false);
      expect(one.shown.filter((r) => made.includes(r.id)).length, "최근 1개월: 나머지 4건").toBe(4);
    } finally {
      await t.context.close();
    }
  });
  test(`[C1][S10] 일회용 교사 화면 10 묶음 헤더 (시안 10 group-label "10월 7일 · 오늘"): 오늘 = "M월 D일 · 오늘" 맨 위 · 올해 다른 날 = "M월 D일" · 다른 해 = "YYYY년 M월 D일" · 헤더 순서 = 사용일 최신순 · 묶음 안 기록 시각 최신순 · 같은 날 "이름 · HH:mm", 다른 날 이름 + 캡션 · 행에 날짜 열(MM.DD) 없음`, async ({ browser }, info) => {
    test.setTimeout(TIMEOUT);
    const { f, reagent, name } = await prepared(info);
    await awayFromMidnight();
    const today = daysAgo(0);
    const year = Number(today.slice(0, 4));
    // 올해의 다른 날 = 어제 (오늘이 1월 1일이면 어제는 작년이라 이 경우만 뺀다)
    const thisYearOther = daysAgo(1).slice(0, 4) === today.slice(0, 4) ? daysAgo(1) : null;
    const lastYear = `${year - 1}-12-03`;
    const twoYears = `${year - 2}-01-09`;
    const teacher = await clientFor(f.teacher);
    const plan = [lastYear, today, twoYears, ...(thisYearOther ? [thisYearOther] : []), today];
    const made: { id: string; usedOn: string }[] = [];
    for (const usedOn of plan) {
      const res = await teacher.rpc("record_usage", { reagent_id: reagent, amount: 1, used_on: usedOn });
      expect(res.error, `준비 record_usage(${usedOn}): ${res.error?.message}`).toBeNull();
      made.push({ id: ((Array.isArray(res.data) ? res.data[0] : res.data) as { id: string }).id, usedOn });
      await new Promise((r) => setTimeout(r, 30));
    }
    const t = await open(browser, info, f.teacher, routeOf(10));
    const page = t.page;
    try {
      await waitHistory(page);
      const snap = await gotoAndMatch(page, { period: "all", q: name });
      // 헤더 글자 (기대값 직접): 시안 틀 "10월 7일 · 오늘" · "10월 6일" + 다른 해 연도
      const want = new Map<string, string>([
        [today, `${md(today)} · 오늘`],
        [lastYear, `${year - 1}년 12월 3일`],
        [twoYears, `${year - 2}년 1월 9일`],
        ...(thisYearOther ? ([[thisYearOther, md(thisYearOther)]] as [string, string][]) : []),
      ]);
      for (const m of made) {
        const i = snap.shown.findIndex((r) => r.id === m.id);
        expect(i, `준비한 기록(${m.usedOn})이 목록에`).toBeGreaterThanOrEqual(0);
        expect(snap.flat[i].group, `${m.usedOn} 묶음 헤더`).toBe(want.get(m.usedOn));
        if (m.usedOn === today) {
          expect(snap.flat[i].time, "오늘 기록 = 사용자 옆 기록 시각").toBe(recordedTime(snap.shown[i].used_at));
          expect(snap.flat[i].caption, "오늘 기록 = 캡션 없음").toBeNull();
        } else {
          expect(snap.flat[i].time, `${m.usedOn}: 시각 없음`).toBeNull();
          expect(snap.flat[i].caption, `${m.usedOn}: 캡션 = 기록한 날(오늘)`).toBe(recordedCaption(today));
        }
      }
      // 헤더 순서 = 사용일 최신순, 오늘 묶음이 맨 위
      const labels = (await readList(page)).filter((e) => e.kind === "group").map((e) => (e as { label: string }).label);
      // (같은 시약에 앞 테스트들이 남긴 기록의 사용일도 함께 나온다 — 목록의 모든 사용일로 순서를 본다)
      const days = [...new Set(snap.shown.map((r) => r.used_on))];
      expect(days, "목록의 사용일 = 최신순").toEqual([...days].sort().reverse());
      for (const d of want.keys()) expect(days, `준비한 사용일 ${d} 묶음`).toContain(d);
      expect(labels, "묶음 헤더 = 사용일 최신순 (준비한 날은 위 기대 글자)").toEqual(days.map((d) => want.get(d) ?? groupLabel(d, today)));
      expect(labels[0], "맨 위 = 오늘 묶음").toBe(`${md(today)} · 오늘`);
      // 오늘 묶음 안: 나중에 기록한 것이 위
      const todays = made.filter((m) => m.usedOn === today).map((m) => m.id);
      expect(snap.shown.filter((r) => todays.includes(r.id)).map((r) => r.id), "오늘 묶음 안 = 기록 시각 최신순 (나중에 기록한 것이 위)").toEqual([...todays].reverse());
      const todayRows = snap.shown.filter((r) => r.used_on === today);
      for (let i = 1; i < todayRows.length; i++) expect(Date.parse(todayRows[i - 1].used_at), "오늘 묶음 전체: 기록 시각 최신순").toBeGreaterThanOrEqual(Date.parse(todayRows[i].used_at));
      // 행에 날짜 열(MM.DD) 없음
      for (const txt of await rows(page).allInnerTexts()) expect(txt, "행에 MM.DD 날짜 없음").not.toMatch(/(^|\s)\d{2}\.\d{2}(\s|$)/);
      await page.screenshot({ path: join(process.cwd(), "test-results", `v1-10-days-${t.viewport}.png`), fullPage: false });
    } finally {
      await t.context.close();
    }
  });
});
