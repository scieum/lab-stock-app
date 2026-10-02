// 화면 3 (시약 상세) 표시값이 DB 와 일치하는지 (C1).
// DB 값은 그 계정의 브라우저 세션(publishable 키 + RLS)으로 읽는다. service role 미사용.
//  - reagent-detail-card: 시약명 · 재고(숫자+단위)
//  - 탭 패널(정보·사용 기록 어느 쪽이든): CAS 번호 · 보관 위치(시약장 이름 · 단 번호) · 보관 분류
//  - badge-low-stock: stock < min_stock 이면 카드 안 1개(화면 전체 1개), 아니면 화면 전체 0개
//  - 사용 기록 버튼(button-primary) 링크 = routes["4"] + ?reagent={id}
// 같은 실행의 R-db 테스트가 재고를 바꿨다 되돌리므로, 화면을 읽기 전·후 DB 가 같을 때만 비교한다.
import { test, expect, type Page } from "@playwright/test";
import { ROLE_LABEL, SCHOOL_A_ROLES, type Role } from "./db-helpers";
import { openAs } from "./auth-state";
import { PROFILE_ROLE, browserSession, countComponent, routeOf, sel } from "./screen-helpers";
import {
  SCREEN,
  USAGE_SCREEN,
  dbDetail,
  detailPath,
  seedReagents,
  seedSchoolOf,
  squash,
  textAcrossTabs,
  waitDetail,
  type DbDetail,
} from "./screen-3-helpers";

const ROLES: Role[] = [...SCHOOL_A_ROLES, "schoolB"];
const BADGE = "badge-low-stock";
const CARD = "reagent-detail-card";

type Shown = { card: string; cardBadges: number; pageBadges: number; text: string };

async function readShown(page: Page): Promise<Shown> {
  const card = page.locator(sel(CARD));
  await expect(card, `${CARD} 1개`).toHaveCount(1);
  return {
    card: await card.innerText(),
    cardBadges: await card.locator(sel(BADGE)).count(),
    pageBadges: await countComponent(page, BADGE),
    text: await textAcrossTabs(page),
  };
}

/** DB 읽기 → 화면 다시 열기 → 화면 읽기 → DB 다시 읽기. 앞뒤 DB 가 같을 때의 짝을 돌려준다. */
async function snapshot(page: Page, id: string): Promise<{ db: DbDetail; shown: Shown }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const before = await dbDetail(page, id);
    expect(before, `자기 세션으로 시약 ${id} 가 읽혀야 함 (자기 학교 seed 시약)`).not.toBeNull();
    await page.goto(detailPath(id));
    await waitDetail(page);
    const shown = await readShown(page);
    const after = await dbDetail(page, id);
    if (JSON.stringify(before) === JSON.stringify(after)) return { db: after!, shown };
  }
  throw new Error(`시약 ${id} 재고가 계속 바뀌어 화면과 비교할 스냅샷을 얻지 못함`);
}

for (const role of ROLES) {
  const school = seedSchoolOf(role);
  const own = seedReagents().filter((r) => r.school_id === school.id);
  // 재고 부족 1건 · 충분 1건 (seed 기준, 학교에 그런 시약이 있을 때만)
  const picks = [own.find((r) => r.low), own.find((r) => !r.low)].filter((r): r is NonNullable<typeof r> => !!r);

  test(`[C1][S${SCREEN}] ${ROLE_LABEL[role]}: seed 에 자기 학교 시약이 있어 상세 비교 대상이 있음`, () => {
    expect(own.length, `seed 학교 ${school.name} 시약 수`).toBeGreaterThan(0);
    expect(picks.length, "비교할 시약 (부족·충분 중 있는 것)").toBeGreaterThan(0);
  });

  for (const pick of picks) {
    test(`[C1][S${SCREEN}] ${ROLE_LABEL[role]} 시약 상세(${pick.name}, seed ${pick.low ? "재고 부족" : "재고 충분"}): 이름·CAS·재고·단위·보관 위치·${BADGE} 가 DB 와 일치`, async ({ browser }, info) => {
      test.setTimeout(150_000);
      const { context, page } = await openAs(browser, info, role, SCREEN, detailPath(pick.id));
      try {
        await waitDetail(page);
        const me = await browserSession(page);
        expect(me.role, "테스트 계정 역할").toBe(PROFILE_ROLE[role]);
        expect(me.schoolName, "테스트 계정 학교 = seed 학교").toBe(school.name);

        const { db, shown } = await snapshot(page, pick.id);
        // seed 의 부족/충분 구분이 DB 에도 그대로여야 배지 있음·없음 두 경우를 실제로 검사한다
        expect(db.low, `DB 재고 부족 여부 = seed (${pick.low ? "부족" : "충분"})`).toBe(pick.low);

        // 카드: 이름 · 재고 숫자+단위
        expect(shown.card, `카드에 시약명 ${db.name}`).toContain(db.name);
        expect(squash(shown.card), `카드에 재고 ${db.stock}${db.unit}`).toContain(squash(`${db.stock}${db.unit}`));

        // 탭 패널: CAS · 보관 위치 · 보관 분류
        expect(db.cas_no, "seed 시약은 CAS 번호가 있음").toBeTruthy();
        expect(shown.text, `CAS ${db.cas_no}`).toContain(db.cas_no!);
        expect(db.cabinet, "seed 시약은 보관 칸이 지정돼 있음").toBeTruthy();
        expect(shown.text, `보관 위치 시약장 ${db.cabinet}`).toContain(db.cabinet!);
        const locLine = shown.text.split(/\r?\n/).find((l) => l.includes(db.cabinet!)) ?? "";
        expect(locLine, `보관 위치 줄에 ${db.shelf}단`).toMatch(new RegExp(`(^|\\D)${db.shelf}(\\D|$)`));
        expect(shown.text, `보관 분류 ${db.storage_class}`).toContain(db.storage_class!);

        // 재고 부족 배지
        expect(shown.cardBadges, `카드 안 ${BADGE} (${db.low ? "부족" : "충분"}: stock ${db.stock} / min ${db.min_stock})`).toBe(
          db.low ? 1 : 0,
        );
        expect(shown.pageBadges, `화면 전체 ${BADGE}`).toBe(db.low ? 1 : 0);
      } finally {
        await context.close();
      }
    });
  }

  test(`[C1][S${SCREEN}] ${ROLE_LABEL[role]} 시약 상세: 사용 기록 버튼(button-primary) 링크 = routes["${USAGE_SCREEN}"]?reagent={id}`, async ({ browser }, info) => {
    test.setTimeout(120_000);
    const pick = picks[0];
    expect(pick, "비교할 seed 시약").toBeTruthy();
    const { context, page } = await openAs(browser, info, role, SCREEN, detailPath(pick.id));
    try {
      await waitDetail(page);
      const btn = page.locator(`main ${sel("button-primary")}`, { hasText: "사용 기록" });
      await expect(btn, "사용 기록 button-primary 1개").toHaveCount(1);
      await expect(btn).toBeVisible();
      const href = await btn.getAttribute("href");
      expect(href, "사용 기록 버튼은 링크").not.toBeNull();
      const u = new URL(href!, "http://x");
      expect(u.pathname, `routes["${USAGE_SCREEN}"]`).toBe(routeOf(USAGE_SCREEN));
      expect([...u.searchParams.keys()], "쿼리 = reagent 하나").toEqual(["reagent"]);
      expect(u.searchParams.get("reagent"), "reagent = 이 시약 id").toBe(pick.id);
    } finally {
      await context.close();
    }
  });
}
