// 화면 5 (실험 매뉴얼) — d7 §27 영문 문서 → 한국어 시약명 (두 폭, C1).
// - 실제 Gemini 호출 없음: POST /api/manual/extract 를 mockExtract 가 가로채 "영어 매뉴얼을 읽은 결과"(name 한국어 · originalName 영문 · cas)를 준다.
// - 공용 학교 A 교사: 확인 표까지만 (저장 요청은 blockSaves 로 끊고 0건 단언). 학교 A 시약은 로그인 세션(RLS)으로 읽어 고른다.
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { openAs } from "./auth-state";
import { sel } from "./screen-helpers";
import {
  CELL,
  MANUAL_SCREEN,
  UNLINKED,
  blockSaves,
  bodyRows,
  mockExtract,
  optionLabel,
  readRows,
  table,
  toResult,
  waitManual,
} from "./screen-5-helpers";
import { CAPTION_SIZE, ORIGINAL_PREFIX, S27, TEXT_MUTED, expectOriginal, freshName, mergedText, ownReagents, pick, readOriginals } from "./d7-27-helpers";

const SCREEN = MANUAL_SCREEN;

test(`[C1][S${SCREEN}] 기대값 원본: d7 §27 — 원문 줄 "${ORIGINAL_PREFIX}{originalName}" · 연결 순서(한국어 name → cas ↔ cas_no → originalName) · 중복 합치기 열쇠 = 한국어 name · 원문 줄 caption ${CAPTION_SIZE}px · text-muted ${TEXT_MUTED}`, () => {
  expect(S27, "d7 §27 있음").toMatch(/영문 문서 → 한국어 시약명/);
  expect(ORIGINAL_PREFIX).toBe("원문: ");
  expect(S27).toMatch(/\(1\) 한국어 name 열쇠 일치 → \(2\) cas 가 있으면 우리 학교 시약 `cas_no` 일치 → \(3\) originalName 열쇠 일치/);
  expect(S27).toMatch(/화면 5 중복 합치기 열쇠도 한국어 name 기준/);
  expect(S27).toMatch(/caption text-muted/);
  expect(mergedText(2)).toBe("2개 행을 합쳤어요");
  expect(CAPTION_SIZE).toBe(12);
  expect(TEXT_MUTED.toLowerCase()).toBe("#707070");
});

test(`[C1][S${SCREEN}] 학교A 교사 영어 매뉴얼 결과: extraction-table 시약명 = 한국어 name · originalName 있으면 아래 "${ORIGINAL_PREFIX}…" 한 줄(${CAPTION_SIZE}px · text-muted) · null 이면 원문 줄 0 · 한국어 이름 일치 자동 연결 · cas 로만 일치하는 행도 자동 연결 · 연결 안 되는 행 "${UNLINKED}" · 영문·한국어 두 행이 같은 한국어 name → 한 줄로 합쳐 "${mergedText(2)}" · 저장 요청 0`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page } = await openAs(browser, info, "teacher", SCREEN);
  const saves = await blockSaves(context);
  try {
    await waitManual(page);
    const own = await ownReagents(page);
    const { byName, byCas, casCandidates, plain } = pick(own);
    const CAS_NAME = freshName(own, "카스연결시험약");
    const NEW_NAME = freshName(own, "미등록시험약");
    const MERGE_NAME = freshName(own, "합침시험약");
    const EN = {
      byName: "Known reagent in English",
      byCas: "Casium compound",
      unlinked: "Unregisterium sulfate",
      merge: "Mergium chloride",
    };
    // 영어 매뉴얼을 읽은 AI 응답 (d7 §27 AI 출력 모양: name 한국어 · originalName 문서 표기 · cas 문서에 보인 CAS)
    const items = [
      { name: byName.name, originalName: EN.byName, cas: null, amount: 10, unit: byName.unit },
      { name: CAS_NAME, originalName: EN.byCas, cas: byCas.cas_no, amount: 2, unit: byCas.unit },
      { name: NEW_NAME, originalName: EN.unlinked, cas: null, amount: 1, unit: "mL" },
      { name: plain.name, originalName: null, cas: null, amount: 3, unit: plain.unit },
      { name: MERGE_NAME, originalName: EN.merge, cas: null, amount: 2, unit: "mL" },
      { name: MERGE_NAME, originalName: null, cas: null, amount: 3, unit: "mL" },
    ];
    const mock = await mockExtract(page, { status: 200, body: { ok: true, items } });
    await toResult(page);
    expect(mock.seen().length, "추출 요청 1건 (가로챔)").toBe(1);

    // 표: 같은 한국어 name 두 행은 한 줄 → 5행
    await expect(bodyRows(page), "행 수 (합친 뒤)").toHaveCount(5);
    const names = await bodyRows(page).evaluateAll(
      (els, cell) =>
        els.map((tb) => {
          const td = tb.querySelector(`td${cell}`) as HTMLElement;
          const copy = td.cloneNode(true) as HTMLElement;
          copy.querySelectorAll('[data-name="original-name"]').forEach((e) => e.remove());
          return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
        }),
      sel(CELL),
    );
    expect(names, "시약명 칸 = 한국어 name (원문 줄 제외)").toEqual([byName.name, CAS_NAME, NEW_NAME, plain.name, MERGE_NAME]);

    // 원문 줄: 시약명 칸(첫 칸) 안, 시약명 글자 아래
    const firstCell = (i: number) => bodyRows(page).nth(i).locator(`td${sel(CELL)}`).first();
    const NAME_SEL = 'span:not([data-name="original-name"])';
    expectOriginal(await readOriginals(firstCell(0), NAME_SEL), EN.byName, `${byName.name} 행`);
    expectOriginal(await readOriginals(firstCell(1), NAME_SEL), EN.byCas, `${CAS_NAME} 행`);
    expectOriginal(await readOriginals(firstCell(2), NAME_SEL), EN.unlinked, `${NEW_NAME} 행`);
    expect(await readOriginals(firstCell(3), NAME_SEL), `${plain.name} 행 (originalName null): 원문 줄 0`).toEqual([]);
    expectOriginal(await readOriginals(firstCell(4), NAME_SEL), EN.merge, `${MERGE_NAME} 합친 행 (처음 나온 행의 원문)`);
    await expect(table(page).locator('[data-name="original-name"]'), "표 전체 원문 줄 = originalName 있는 행 4").toHaveCount(4);
    for (const en of Object.values(EN)) {
      await expect(table(page).getByText(en, { exact: true }), `영문 '${en}' 이 시약명 자리에 단독으로 나오지 않음`).toHaveCount(0);
    }

    // 연결
    const rows = await readRows(page);
    expect(rows[0].linked, "한국어 이름 일치 → 자동 연결").toBe(optionLabel(byName));
    expect.soft(casCandidates.map(optionLabel), `cas ${byCas.cas_no} 만 같은 행 → 그 CAS 시약에 자동 연결`).toContain(rows[1].linked);
    expect(rows[2].linked, "이름·cas 모두 없는 행 → 미연결").toBe(UNLINKED);
    expect(rows[3].linked, "원문 null 행도 한국어 이름으로 연결").toBe(optionLabel(plain));
    expect(rows[4].linked, "합친 행 (학교에 없는 이름) → 미연결").toBe(UNLINKED);
    expect.soft(rows.map((r) => r.status), "행 상태").toEqual(["ok", "ok", "unlinked", "ok", "unlinked"]);
    expect(rows[2].detail, `미연결 행 안내 "${UNLINKED}"`).toContain(UNLINKED);

    // 중복 합치기: 1조 사용량 2 + 3 · 안내는 합친 행에만
    expect(rows[4].cells[1], "합친 행 1조 사용량 = 2 + 3").toBe("5");
    expect(rows[4].detail, `합친 행 "${mergedText(2)}"`).toContain(mergedText(2));
    for (const i of [0, 1, 2, 3]) expect(rows[i].detail, `${names[i]} 행에는 합침 안내 없음`).not.toMatch(/\d+개 행을 합쳤어요/);

    await page.screenshot({ path: join(process.cwd(), "test-results", `v1-${SCREEN}-d7-27-${info.project.name}.png`), fullPage: true });
    expect(saves.count(), "공용 계정 저장 요청 0건").toBe(0);
  } finally {
    await context.close();
  }
});
