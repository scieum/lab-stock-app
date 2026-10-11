// 화면 12 (QR 찾기) 시약 0개 시약장 결과 — C1 (390 · 1440). 일회용 학교의 일회용 학생 계정.
// 기준: harness/d7-data.md §26 "결과 (12-result)"(목록 = 그 시약장 칸에 있는 보관 안 된 시약, 시약 0개면 시트 안 "이 시약장에는 아직 시약이 없어요"),
//       "화면 12 경로·권한"(모든 역할 — 학생 포함). 공용 학교 A 에는 빈 시약장이 없어 일회용 학교를 쓴다.
// 준비는 일회용 admin 세션의 DB 함수(add_cabinet · register_reagent), service role 은 정리·잔여물 대조에만 (screen-11-helpers).
import { test, expect, type TestInfo } from "@playwright/test";
import { HAS_SERVICE, openTemp } from "./screen-8-helpers";
import { NO_S11_RESIDUE, cleanup, makeFixture, prepCabinet, prepReagent, type S11Fixture } from "./screen-11-helpers";
import { sel } from "./screen-helpers";
import {
  EMPTY,
  ROW,
  SCAN,
  SCREEN,
  captionText,
  expectResultContent,
  expectResultOpen,
  findByNumber,
  installCamera,
  ownCabinets,
  sheet,
  waitScan,
} from "./screen-12-helpers";

test.describe.configure({ mode: "default" });
test.skip(!HAS_SERVICE, "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)");

const GROUP = "s12e";
let fixtureCache: Promise<{ f: S11Fixture; cabinetId: string; looseName: string }> | null = null;

/** 일회용 학교: 빈 시약장 1개(기본 양문형 4단) + 칸 없음 시약 1개 (결과에 나오면 안 된다) */
function fixture(info: TestInfo) {
  fixtureCache ??= (async () => {
    const f = await makeFixture(info, GROUP);
    const cab = await prepCabinet(f);
    const loose = await prepReagent(f, "칸없음");
    return { f, cabinetId: cab.id as string, looseName: loose.name };
  })();
  fixtureCache.catch(() => {
    fixtureCache = null;
  });
  return fixtureCache;
}

test.afterAll(async ({}, info) => {
  info.setTimeout(300_000);
  if (!HAS_SERVICE) return;
  fixtureCache = null;
  const left = await cleanup(GROUP, info.project.name);
  expect(left, "일회용 계정·학교·시약장·칸·시약 잔여물").toEqual(NO_S11_RESIDUE);
});

test(`[C1][S${SCREEN}] 일회용 학생 · 시약 0개 시약장: ${SCAN}?cabinet={id} · 번호로 찾기 → 결과 안 "${EMPTY}" · ${ROW}/결과 표 0 · 캡션 "{문 종류} · {N}단 · 시약 0개" · 칸 없음 시약은 결과에 없음`, async ({ browser }, info) => {
  test.setTimeout(360_000);
  const { f, cabinetId, looseName } = await fixture(info);
  const { context, page, viewport } = await openTemp(browser, info, f.student, SCAN);
  try {
    await installCamera(context, "canvas");
    await page.goto(`${SCAN}?cabinet=${cabinetId}`);
    await waitScan(page);
    const cabs = await ownCabinets(page);
    expect(cabs.map((c) => c.id), "대조: 일회용 학교 시약장 1개").toEqual([cabinetId]);
    const cab = cabs[0];
    expect(cab.rows, "대조: 칸에 있는 시약 0").toEqual([]);
    expect(cab.caption, "캡션 = 시약 0개").toBe(captionText(cab.door, cab.shelves, 0));
    await expectResultOpen(page, cab, "빈 시약장 주소창");
    await expectResultContent(page, viewport, cab, "빈 시약장 주소창");
    await expect(sheet(page), `칸 없음 시약 "${looseName}" 은 결과에 없음`).not.toContainText(looseName);
    await expect(page.locator(sel(ROW)), `${ROW} 0`).toHaveCount(0);

    await page.goto(SCAN);
    await waitScan(page);
    await findByNumber(page, viewport, String(cab.number));
    await expectResultOpen(page, cab, "빈 시약장 번호");
    await expectResultContent(page, viewport, cab, "빈 시약장 번호");
  } finally {
    await context.close();
  }
});
