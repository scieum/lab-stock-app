// 화면 7 (서류로 입고) — d7 §27 영문 서류 → 한국어 품명 (두 폭, C1).
// - 실제 Gemini 호출 없음: POST /api/intake/extract 를 interceptExtract 로 가로채 "영어 서류를 읽은 결과"(name 한국어 · originalName 영문 · cas)를 준다.
// - 공용 학교 A 교사: 확인 표까지만 (저장 서버 액션은 끊고 0건 단언). 학교 A 시약은 로그인 세션(RLS)으로 읽어 고른다.
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { openAs } from "./auth-state";
import { routeOf } from "./screen-helpers";
import { NEW_REAGENT, fieldsOf, interceptExtract, item, itemRows, linkOf, readToReview, rowOf, table, waitUpload } from "./doc-intake-helpers";
import { CAPTION_SIZE, ORIGINAL_PREFIX, TEXT_MUTED, blockActions, expectOriginal, freshName, ownReagents, pick, readOriginals } from "./d7-27-helpers";

const SCREEN = 7;

test(`[C1][S${SCREEN}] 학교A 교사 영어 서류 결과: doc-intake-table 품명 = 한국어 name · originalName 있으면 아래 "${ORIGINAL_PREFIX}…" 한 줄(${CAPTION_SIZE}px · text-muted ${TEXT_MUTED}) · null 이면 원문 줄 0 · 한국어 이름 일치 자동 연결 · cas 로만 일치하는 행도 자동 연결 · 연결 안 되는 행 = "${NEW_REAGENT}"(이름 기본값 = 한국어 name) · 저장 요청 0`, async ({ browser }, info) => {
  test.setTimeout(150_000);
  const { context, page } = await openAs(browser, info, "teacher", SCREEN);
  const saves = await blockActions(context, routeOf(SCREEN));
  try {
    await waitUpload(page);
    const own = await ownReagents(page);
    const { byName, byCas, casCandidates, plain } = pick(own);
    const CAS_NAME = freshName(own, "카스연결시험약");
    const NEW_NAME = freshName(own, "미등록시험약");
    const EN = { byName: "Known reagent in English", byCas: "Casium compound", unlinked: "Unregisterium sulfate" };
    const unit = (u: string) => (u === "g" ? "g" : "mL") as "g" | "mL";
    const docItems = [
      { ...item(byName.name, 500, unit(byName.unit), 2), originalName: EN.byName, cas: null },
      { ...item(CAS_NAME, 500, unit(byCas.unit), 1), originalName: EN.byCas, cas: byCas.cas_no },
      { ...item(NEW_NAME, 500, "g", 1), originalName: EN.unlinked, cas: null },
      { ...item(plain.name, 500, unit(plain.unit), 1), originalName: null, cas: null },
    ];
    const route = await interceptExtract(page, () => ({ body: { ok: true, docDate: null, items: docItems } }));
    await readToReview(page);
    expect(route.calls, "추출 요청 1건 (가로챔)").toBe(1);

    await expect(itemRows(page), "품목 4행").toHaveCount(4);
    const titles = await itemRows(page).evaluateAll((els) =>
      els.map((li) => {
        const t = li.querySelector('[data-name="item-name"]') as HTMLElement | null;
        const p = t?.querySelector('p:not([data-name="original-name"])') as HTMLElement | null;
        return (p?.innerText ?? "").replace(/\s+/g, " ").trim();
      }),
    );
    expect(titles, "품명 = 한국어 name").toEqual([byName.name, CAS_NAME, NEW_NAME, plain.name]);

    // 원문 줄
    const nameBox = (n: string) => rowOf(page, n).locator('[data-name="item-name"]');
    const NAME_SEL = 'p:not([data-name="original-name"])';
    expectOriginal(await readOriginals(nameBox(byName.name), NAME_SEL), EN.byName, `${byName.name} 행`);
    expectOriginal(await readOriginals(nameBox(CAS_NAME), NAME_SEL), EN.byCas, `${CAS_NAME} 행`);
    expectOriginal(await readOriginals(nameBox(NEW_NAME), NAME_SEL), EN.unlinked, `${NEW_NAME} 행`);
    expect(await readOriginals(nameBox(plain.name), NAME_SEL), `${plain.name} 행 (originalName null): 원문 줄 0`).toEqual([]);
    await expect(table(page).locator('[data-name="original-name"]'), "표 전체 원문 줄 = originalName 있는 행 3").toHaveCount(3);

    // 연결
    const shown = (n: string) => linkOf(rowOf(page, n)).locator('[data-name="text-input"]');
    await expect(linkOf(rowOf(page, byName.name)), "한국어 이름 일치 → 자동 연결").toHaveAttribute("data-link", "reagent");
    await expect(shown(byName.name), "연결 시약 = 같은 이름").toHaveAttribute("title", byName.name);
    await expect(linkOf(rowOf(page, CAS_NAME)), `cas ${byCas.cas_no} 만 같은 행 → 자동 연결`).toHaveAttribute("data-link", "reagent");
    expect(casCandidates.map((c) => c.name), "연결 시약 = 그 CAS 를 가진 우리 학교 시약").toContain(await shown(CAS_NAME).getAttribute("title"));
    await expect(linkOf(rowOf(page, plain.name)), "원문 null 행도 한국어 이름으로 연결").toHaveAttribute("data-link", "reagent");
    await expect(shown(plain.name)).toHaveAttribute("title", plain.name);

    // 연결 안 되는 행 → 새 시약 (이름 기본값 = 한국어 name, 원문 아님)
    const nr = rowOf(page, NEW_NAME);
    await expect(linkOf(nr), "연결 안 됨 → 새 시약").toHaveAttribute("data-link", "new");
    await expect(linkOf(nr).getByText(NEW_REAGENT, { exact: true }), `"${NEW_REAGENT}"`).toBeVisible();
    await expect(fieldsOf(nr), "첫 새 시약 행 펼침").toHaveCount(1);
    await expect(fieldsOf(nr).getByLabel("이름", { exact: true }), "새 시약 이름 기본값 = 한국어 name").toHaveValue(NEW_NAME);
    for (const n of [byName.name, CAS_NAME, plain.name]) await expect(fieldsOf(rowOf(page, n)), `${n}: 연결 행에는 새 시약 칸 없음`).toHaveCount(0);

    await page.screenshot({ path: join(process.cwd(), "test-results", `v1-${SCREEN}-d7-27-${info.project.name}.png`), fullPage: true });
    expect(saves.count(), "공용 계정 저장 요청 0건").toBe(0);
  } finally {
    await context.close();
  }
});
