// 화면 10 (사용 기록 내역) 필터 C1 — 전체/내 기록 · 기간 · 시약명 검색 · 주소 쿼리 · 0건
// 기준: harness/d7-data.md §7 (필터 = "전체 / 내 기록", 기간 = 최근 1개월(기본)·3개월·6개월·전체, 시약명 부분 일치,
//       0건 → ex-empty-state-card "아직 사용 기록이 없어요"), 디자인 s2-spec "## 화면 10".
// 화면 목록은 같은 필터로 로그인 세션(RLS)에서 읽은 DB 함수 usage_history 결과와 대조한다. 이 파일은 DB 에 쓰지 않는다.
// 주의: 테스트 학교의 기록은 모두 최근 1개월 안에 있어(운영 DB 는 used_at 을 지정해 넣을 수 없음)
//       기간 선택은 "선택·주소 반영·DB(그 기간) 와 일치"까지 본다.
import { test, expect, type Page } from "@playwright/test";
import { ROLE_LABEL, SCHOOL_A_ROLES, type Role } from "./db-helpers";
import { openAs } from "./auth-state";
import { PROFILE_ROLE, browserSession, countComponent, sel } from "./screen-helpers";
import {
  DEFAULT_PERIOD,
  EMPTY,
  EMPTY_TITLE,
  INPUT,
  MODAL,
  PERIODS,
  ROW,
  SCOPE_ALL,
  SCOPE_MINE,
  SCREEN,
  SEGMENT,
  SEGMENT_ACTIVE,
  activeSegment,
  dbHistory,
  emptyCard,
  exact,
  expectListMatchesDb,
  gotoAndMatch,
  historyPath,
  myDisplayName,
  periodSelect,
  queryParam,
  rows,
  searchInput,
  segment,
  selectedPeriodLabel,
  switchScope,
  waitHistory,
  type HistoryRow,
  type PeriodValue,
} from "./screen-10-helpers";

const labelOf = (v: PeriodValue) => PERIODS.find((p) => p.value === v)!.label;

/** 주소 쿼리가 이 값이 될 때까지 (필터 변경 → 주소 반영) */
async function expectQuery(page: Page, key: string, want: string | null | (string | null)[]): Promise<void> {
  const wants = Array.isArray(want) ? want : [want];
  await expect.poll(() => wants.includes(queryParam(page, key)), { message: `주소 ?${key} = ${JSON.stringify(wants)} (지금 ${page.url()})`, timeout: 15_000 }).toBe(true);
}

/** DB(최근 1개월, 전체)에서 기록 수가 가장 적은 시약 이름 — 검색 대상 (목록이 작아 대조가 빠르고 안정적) */
function rarestName(db: HistoryRow[]): { name: string; count: number } {
  const counts = new Map<string, number>();
  for (const r of db) counts.set(r.reagent_name, (counts.get(r.reagent_name) ?? 0) + 1);
  const sorted = [...counts.entries()].filter(([n]) => [...n].length >= 3).sort((a, b) => a[1] - b[1]);
  expect(sorted.length, "이름이 3자 이상인 시약의 기록이 있어야 함").toBeGreaterThan(0);
  return { name: sorted[0][0], count: sorted[0][1] };
}

// ---------- 전체 / 내 기록 ----------
for (const role of SCHOOL_A_ROLES) {
  test(`[C1][S${SCREEN}] ${ROLE_LABEL[role]} "${SCOPE_MINE}": 주소 ?mine=1 · ${SEGMENT_ACTIVE} 1개 "${SCOPE_MINE}" · 모든 행의 사용자 = 로그인 사용자 이름 · 목록 = DB(내 기록) → "${SCOPE_ALL}" 로 되돌리면 DB(전체)`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    const { context, page } = await openAs(browser, info, role, SCREEN);
    try {
      await waitHistory(page);
      const me = await browserSession(page);
      expect(me.role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
      const myName = await myDisplayName(page);
      const mineDb = await dbHistory(page, { mine: true });
      expect(mineDb.length, "전제: 이 계정의 최근 1개월 기록이 있음").toBeGreaterThan(0);
      for (const r of mineDb) {
        expect(r.is_mine, "DB 내 기록 = is_mine").toBe(true);
        expect(r.user_name, "DB 내 기록의 사용자 이름 = 내 이름").toBe(myName);
      }

      let t0 = Date.now();
      await switchScope(page, SCOPE_MINE);
      await expectQuery(page, "mine", "1");
      await expect(page.locator(`main ${sel(SEGMENT_ACTIVE)}`), `${SEGMENT_ACTIVE} 는 하나만`).toHaveCount(1);
      await expect(activeSegment(page)).toHaveText(exact(SCOPE_MINE));
      const mine = await expectListMatchesDb(page, { mine: true }, t0);
      expect(mine.flat.length, "내 기록 행 ≥ 1").toBeGreaterThan(0);
      for (const r of mine.flat) expect(r.user, "내 기록: 모든 행의 사용자 = 로그인 사용자").toBe(myName);
      // 기간·검색 값은 그대로
      expect(await selectedPeriodLabel(page), "기간 그대로").toBe(labelOf(DEFAULT_PERIOD));
      await expect(searchInput(page)).toHaveValue("");

      t0 = Date.now();
      await switchScope(page, SCOPE_ALL);
      await expectQuery(page, "mine", null);
      await expect(page.locator(`main ${sel(SEGMENT_ACTIVE)}`)).toHaveCount(1);
      const all = await expectListMatchesDb(page, {}, t0);
      expect(all.flat.length, "전체 행 ≥ 내 기록 행").toBeGreaterThanOrEqual(mine.flat.length);
    } finally {
      await context.close();
    }
  });
}

// ---------- 기간 ----------
test(`[C1][S${SCREEN}] 학교A 교사 기간 드롭다운: 선택지 ${PERIODS.map((p) => p.label).join(" · ")} (기본 ${labelOf(DEFAULT_PERIOD)}) · 선택하면 주소 ?period 와 목록(DB 그 기간)에 반영 · 새로 열어도 유지`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  const { context, page } = await openAs(browser, info, "teacher", SCREEN);
  try {
    await waitHistory(page);
    const select = periodSelect(page);
    await expect(select).toHaveCount(1);
    const options = (await select.locator("option").allInnerTexts()).map((t) => t.trim());
    expect(options, "기간 선택지 (d7 §7)").toEqual(PERIODS.map((p) => p.label));
    expect(await selectedPeriodLabel(page), "기본 기간").toBe(labelOf(DEFAULT_PERIOD));
    expect(queryParam(page, "period"), "기본 기간은 주소에 없음").toBeNull();

    for (const p of PERIODS.filter((x) => x.value !== DEFAULT_PERIOD)) {
      const t0 = Date.now();
      await select.selectOption({ label: p.label });
      await expectQuery(page, "period", p.value);
      expect(await selectedPeriodLabel(page), `선택 표시 ${p.label}`).toBe(p.label);
      const snap = await expectListMatchesDb(page, { period: p.value }, t0);
      expect(snap.flat.length, `${p.label} 행 ≥ 1`).toBeGreaterThan(0);
      // 전체/내 기록 선택은 그대로
      await expect(activeSegment(page)).toHaveText(exact(SCOPE_ALL));
      // 같은 주소를 새로 열어도 그 기간
      await page.reload();
      await waitHistory(page);
      expect(await selectedPeriodLabel(page), `새로 열어도 ${p.label}`).toBe(p.label);
      expect(queryParam(page, "period")).toBe(p.value);
    }

    // 기본 기간으로 되돌리기
    const t0 = Date.now();
    await select.selectOption({ label: labelOf(DEFAULT_PERIOD) });
    await expectQuery(page, "period", [null, DEFAULT_PERIOD]);
    expect(await selectedPeriodLabel(page)).toBe(labelOf(DEFAULT_PERIOD));
    await expectListMatchesDb(page, {}, t0);

    // 내 기록 + 기간을 같이 걸면 둘 다 주소·목록에 반영
    const myName = await myDisplayName(page);
    await switchScope(page, SCOPE_MINE);
    await expectQuery(page, "mine", "1");
    const t1 = Date.now();
    await select.selectOption({ label: labelOf("3m") });
    await expectQuery(page, "period", "3m");
    expect(queryParam(page, "mine"), "기간을 바꿔도 내 기록 유지").toBe("1");
    const both = await expectListMatchesDb(page, { mine: true, period: "3m" }, t1);
    for (const r of both.flat) expect(r.user).toBe(myName);
  } finally {
    await context.close();
  }
});

// ---------- 시약명 검색 ----------
test(`[C1][S${SCREEN}] 학교A 학생 시약명 검색(부분 일치): 입력을 멈추면 주소 ?q 와 목록에 반영 · 모든 행의 시약명에 검색어 포함 · 목록 = DB · Enter 는 바로 · 지우면 전체 · "%" 는 글자 그대로`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  const { context, page } = await openAs(browser, info, "student", SCREEN);
  try {
    await waitHistory(page);
    const base = await dbHistory(page, {});
    const { name } = rarestName(base);
    const chars = [...name];
    // 가운데~끝 조각, 앞 조각 (전체 이름이 아닌 부분)
    const tail = chars.slice(1).join("").trim();
    const head = chars.slice(0, Math.max(2, chars.length - 2)).join("").trim();
    expect(tail).not.toBe(name);
    const input = searchInput(page);

    // 1) 입력만 (Enter 없이) → 잠시 뒤 반영
    let t0 = Date.now();
    await input.fill(tail);
    await expectQuery(page, "q", tail);
    let snap = await expectListMatchesDb(page, { q: tail }, t0);
    expect(snap.flat.length, `"${tail}" 결과 ≥ 1`).toBeGreaterThan(0);
    for (const r of snap.flat) expect(r.name.toLowerCase(), `검색 "${tail}" 결과 시약명`).toContain(tail.toLowerCase());
    expect(snap.flat.some((r) => r.name === name), `결과에 ${name}`).toBe(true);
    await expect(input, "입력한 글자가 그대로").toHaveValue(tail);
    // 필터 구성은 그대로
    await expect(segment(page)).toHaveCount(1);
    await expect(page.locator(`main ${sel(INPUT)}`)).toHaveCount(2);

    // 2) Enter → 바로 반영
    t0 = Date.now();
    await input.fill(head);
    await input.press("Enter");
    await expectQuery(page, "q", head);
    snap = await expectListMatchesDb(page, { q: head }, t0);
    expect(snap.flat.length, `"${head}" 결과 ≥ 1`).toBeGreaterThan(0);
    for (const r of snap.flat) expect(r.name.toLowerCase(), `검색 "${head}" 결과 시약명`).toContain(head.toLowerCase());
    await expect(input).toHaveValue(head);

    // 3) 한 글자씩 빠르게 입력해도 마지막 값으로 정리된다 (중간 값으로 덮어쓰지 않음)
    t0 = Date.now();
    await input.fill("");
    await input.pressSequentially(tail, { delay: 40 });
    await expectQuery(page, "q", tail);
    await expectListMatchesDb(page, { q: tail }, t0);
    await expect(input, "빠르게 입력한 글자가 그대로").toHaveValue(tail);

    // 4) 내 기록과 같이: 둘 다 적용
    t0 = Date.now();
    await switchScope(page, SCOPE_MINE);
    await expectQuery(page, "mine", "1");
    expect(queryParam(page, "q"), "범위를 바꿔도 검색어 유지").toBe(tail);
    const myName = await myDisplayName(page);
    snap = await expectListMatchesDb(page, { mine: true, q: tail }, t0);
    for (const r of snap.flat) {
      expect(r.user).toBe(myName);
      expect(r.name.toLowerCase()).toContain(tail.toLowerCase());
    }
    t0 = Date.now();
    await switchScope(page, SCOPE_ALL);
    await expectQuery(page, "mine", null);
    await expectListMatchesDb(page, { q: tail }, t0);

    // 5) "%" 는 와일드카드가 아니라 글자 그대로
    t0 = Date.now();
    await input.fill("%");
    await input.press("Enter");
    await expectQuery(page, "q", "%");
    snap = await expectListMatchesDb(page, { q: "%" }, t0);
    for (const r of snap.flat) expect(r.name, '검색 "%" 결과 시약명').toContain("%");
    expect(snap.db.every((r) => r.reagent_name.includes("%")), 'DB 결과도 이름에 "%" 가 든 시약뿐').toBe(true);

    // 6) 지우면 전체
    t0 = Date.now();
    await input.fill("");
    await expectQuery(page, "q", null);
    snap = await expectListMatchesDb(page, {}, t0);
    expect(snap.flat.length).toBeGreaterThan(0);
  } finally {
    await context.close();
  }
});

// ---------- 주소로 바로 들어오기 ----------
test(`[C1][S${SCREEN}] 학교A admin 주소 쿼리로 바로 열기: ?mine=1&period=3m&q= 이 필터 3종에 복원 · 목록 = DB(같은 필터) / 잘못된 값(?mine=yes · ?period=zzz)은 기본값(전체 · ${labelOf(DEFAULT_PERIOD)})`, async ({ browser }, info) => {
  test.setTimeout(240_000);
  const { context, page } = await openAs(browser, info, "admin", SCREEN);
  try {
    await waitHistory(page);
    const myName = await myDisplayName(page);
    const mineDb = await dbHistory(page, { mine: true, period: "3m" });
    expect(mineDb.length, "전제: admin 의 기록이 있음").toBeGreaterThan(0);
    const name = rarestName(mineDb).name;
    const q = [...name].slice(1).join("").trim();

    // 복원
    const snap = await gotoAndMatch(page, { mine: true, period: "3m", q });
    await expect(page.locator(`main ${sel(SEGMENT_ACTIVE)}`)).toHaveCount(1);
    await expect(activeSegment(page)).toHaveText(exact(SCOPE_MINE));
    expect(await selectedPeriodLabel(page), "?period=3m").toBe(labelOf("3m"));
    await expect(searchInput(page), "?q").toHaveValue(q);
    expect(snap.flat.length, "복원된 필터 결과 ≥ 1").toBeGreaterThan(0);
    for (const r of snap.flat) {
      expect(r.user).toBe(myName);
      expect(r.name.toLowerCase()).toContain(q.toLowerCase());
    }

    // 기간마다 주소 값 그대로 복원
    for (const p of PERIODS) {
      const res = await page.goto(historyPath({ raw: { period: p.value } }));
      expect(res?.status()).toBe(200);
      await waitHistory(page);
      expect(await selectedPeriodLabel(page), `?period=${p.value}`).toBe(p.label);
      await expect(activeSegment(page)).toHaveText(exact(SCOPE_ALL));
    }

    // 잘못된 값 → 기본값 (오류 화면 아님), 검색어는 그대로 적용
    for (const raw of [
      { mine: "yes", period: "zzz", q },
      { mine: "0", period: "12m", q },
      { mine: "true", period: "", q },
      { period: "ALL", q },
    ] as Record<string, string>[]) {
      const t0 = Date.now();
      const res = await page.goto(historyPath({ raw }));
      expect(res?.status(), `${JSON.stringify(raw)} 응답`).toBe(200);
      await waitHistory(page);
      await expect(activeSegment(page), `${JSON.stringify(raw)} → 전체`).toHaveText(exact(SCOPE_ALL));
      expect(await selectedPeriodLabel(page), `${JSON.stringify(raw)} → 기본 기간`).toBe(labelOf(DEFAULT_PERIOD));
      await expect(searchInput(page)).toHaveValue(q);
      await expectListMatchesDb(page, { q }, t0);
    }

    // 학교·사용자를 주소로 바꿀 수 없다: 모르는 쿼리는 무시되고 자기 학교 목록 그대로
    const t0 = Date.now();
    const res = await page.goto(historyPath({ raw: { school: "00000000-0000-0000-0000-000000000000", user: "someone", school_id: "x" } }));
    expect(res?.status()).toBe(200);
    await waitHistory(page);
    await expectListMatchesDb(page, {}, t0);
  } finally {
    await context.close();
  }
});

// ---------- 0건 ----------
for (const role of ["student", "schoolB"] as Role[]) {
  test(`[C1][S${SCREEN}] ${ROLE_LABEL[role]} 필터 결과 0건: ${EMPTY} 1개 "${EMPTY_TITLE}" · ${ROW}·${MODAL} 0 · 필터는 그대로 (주소 진입 · 검색 입력 둘 다)`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    const none = `없는시약-${Date.now().toString(36)}`;
    const { context, page } = await openAs(browser, info, role, SCREEN);
    try {
      await waitHistory(page);
      expect(await dbHistory(page, { q: none, period: "all" }), "전제: DB 에 그 이름의 기록 0행").toHaveLength(0);

      const check = async (state: string) => {
        await expect(emptyCard(page), `${state}: ${EMPTY} 1개`).toHaveCount(1);
        await expect(emptyCard(page)).toBeVisible();
        await expect(emptyCard(page), `${state}: 문구`).toContainText(EMPTY_TITLE);
        await expect(rows(page), `${state}: ${ROW} 0`).toHaveCount(0);
        expect(await countComponent(page, MODAL), `${state}: ${MODAL} 0`).toBe(0);
        await expect(segment(page), `${state}: ${SEGMENT}`).toHaveCount(1);
        await expect(page.locator(`main ${sel(INPUT)}`), `${state}: ${INPUT} 2`).toHaveCount(2);
        await expect(searchInput(page)).toHaveValue(none);
      };

      // 주소로 진입
      for (const f of [{ q: none }, { q: none, period: "all" as const }, { q: none, mine: true }]) {
        const res = await page.goto(historyPath(f));
        expect(res?.status(), "0건도 200").toBe(200);
        await waitHistory(page);
        await check(`주소 ${historyPath(f)}`);
      }

      // 검색 입력으로
      await page.goto(historyPath());
      await waitHistory(page);
      const t0 = Date.now();
      const before = await expectListMatchesDb(page, {}, t0);
      if (before.flat.length > 0) expect(await countComponent(page, EMPTY), "기록이 있을 때 0건 카드 없음").toBe(0);
      await searchInput(page).fill(none);
      await expectQuery(page, "q", none);
      await check("검색 입력");
      // 검색어를 지우면 다시 목록
      const t1 = Date.now();
      await searchInput(page).fill("");
      await expectQuery(page, "q", null);
      await expectListMatchesDb(page, {}, t1);
    } finally {
      await context.close();
    }
  });
}
