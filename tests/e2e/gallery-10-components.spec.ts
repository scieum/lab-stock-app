// 화면 10 (사용 기록 내역) 새 컴포넌트의 컴포넌트 수준 동작 — 갤러리(/gallery, 비로그인 공개) 대상.
// 기준: 디자인 s2-spec "## 화면 10" (ex-modal-card · ex-data-table-cell 기록 행 · segmented-control · text-input · msds-entry),
//       harness/d7-data.md §7 (필터·목록·상세), design/frames/10-mobile.json (시안 상태).
// 기대값: 개수·문구는 design/frames/10-mobile.json 노드에서, 색은 design/rules.json colors.highlight 에서,
//         컴포넌트 목록은 harness/dev-rules.json components 에서 읽는다 (구현에서 읽지 않는다).
//         기간 선택지(최근 1개월·3개월·6개월·전체)와 빈 상태 문구는 프레임에 없어 d7-data.md §7 문장에서 그대로 옮긴 상수다.
// 태그: [K1] 은 dev-rules test_rules 에 없으므로 judge 의 규칙별 e2e 집계에 섞이지 않는다. [S10] 으로 화면 10 실행에 포함된다.
// /usage 화면(D3)·DB(D2) 검사는 여기서 하지 않는다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";

const SCREEN = 10;
const GALLERY = "/gallery";

type FrameNode = { name: string; type: string; path: string[]; fills: string[]; text: { characters: string } | null };
type Frame = { frames: { name: string; nodes: FrameNode[] }[] };
type Rules = { colors: { highlight: { values: string[] } } };
type Dev = { components: Record<string, number[]> };

const root = process.cwd();
const rules = JSON.parse(readFileSync(join(root, "design/rules.json"), "utf8")) as Rules;
const dev = JSON.parse(readFileSync(join(root, "harness/dev-rules.json"), "utf8")) as Dev;
const frame = JSON.parse(readFileSync(join(root, `design/frames/${SCREEN}-mobile.json`), "utf8")) as Frame;
const nodes = frame.frames[0].nodes;

// ---------- 기대값: 프레임 ----------
const under = (ancestor: string) => nodes.filter((n) => n.path.slice(0, -1).includes(ancestor));
const textOf = (list: FrameNode[], name: string) => list.filter((n) => n.name === name && n.text).map((n) => n.text!.characters);

const modalNodes = under("ex-modal-card");
const MODAL = {
  title: textOf(modalNodes, "modal-title")[0],
  amount: textOf(modalNodes, "amount-value")[0],
  unit: textOf(modalNodes, "amount-unit")[0],
  labels: textOf(modalNodes, "field-label"),
  values: textOf(modalNodes, "field-value"),
  msds: modalNodes.filter((n) => n.path.includes("msds-entry") && n.name === "label")[0]?.text?.characters,
  close: modalNodes.filter((n) => n.path.includes("button-outline") && n.name === "label")[0]?.text?.characters,
  msdsCount: modalNodes.filter((n) => n.name === "msds-entry").length,
  outlineCount: modalNodes.filter((n) => n.name === "button-outline").length,
};

// 필터 줄 = 프레임의 segmented-control·text-input 전부 (모바일 시안은 검색 바가 filter-row 아래 줄에 따로 있다)
const filterNodes = nodes.filter((n) => !n.path.includes("ex-modal-card") && !n.path.includes("record-list"));
const countIn = (list: FrameNode[], name: string) => list.filter((n) => n.name === name).length;
const FILTER = {
  segmented: countIn(filterNodes, "segmented-control"),
  active: countIn(filterNodes, "segmented-control-active"),
  textInput: countIn(filterNodes, "text-input"),
  activeLabel: filterNodes.filter((n) => n.path.includes("segmented-control-active") && n.name === "label")[0]?.text?.characters,
  otherLabel: filterNodes.filter((n) => n.path.includes("segmented-control-option") && n.name === "label")[0]?.text?.characters,
  period: textOf(filterNodes, "value")[0],
  searchPlaceholder: textOf(filterNodes, "placeholder")[0],
};

type FrameRow = { selectedFill: string | null; date: string; name: string; user: string; amount: string };
const FRAME_ROWS: FrameRow[] = [];
{
  let cur: Partial<FrameRow> | null = null;
  for (const n of nodes) {
    if (n.name === "ex-data-table-cell") {
      cur = { selectedFill: n.fills[0] ?? null };
      FRAME_ROWS.push(cur as FrameRow);
    } else if (cur && n.path.includes("ex-data-table-cell") && n.text) {
      if (n.name === "record-date") cur.date = n.text.characters;
      if (n.name === "reagent-name") cur.name = n.text.characters;
      if (n.name === "record-user") cur.user = n.text.characters;
      if (n.name === "record-amount") cur.amount = n.text.characters;
    } else if (!n.path.includes("ex-data-table-cell")) {
      cur = null;
    }
  }
}

// ---------- 기대값: rules.json 하늘색 ----------
const HIGHLIGHTS = rules.colors.highlight.values.map((v) => v.toLowerCase());
function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
}
const HIGHLIGHT_RGB = HIGHLIGHTS.map(hexToRgb);
// 프레임에서 선택 행에 칠해진 색 (하늘색 연한 토큰이어야 한다)
const SELECTED_FILL = FRAME_ROWS.map((r) => r.selectedFill).find((f) => f !== null) ?? "";

// d7-data.md §7 문장 그대로
const PERIOD_OPTIONS = ["최근 1개월", "최근 3개월", "최근 6개월", "전체"];
const EMPTY_TITLE = "아직 사용 기록이 없어요";

const sel = (name: string) => `[data-component="${name}"]`;
const exact = (s: string) => new RegExp(`^\\s*${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);

async function open(page: Page): Promise<void> {
  const res = await page.goto(GALLERY, { waitUntil: "networkidle" });
  expect(res?.status(), "갤러리 응답").toBe(200);
}

/** 갤러리의 ex-modal-card (열린 상태로 놓여 있어야 한다) */
async function modalOf(page: Page): Promise<Locator> {
  const modal = page.locator(sel("ex-modal-card"));
  await expect(modal, "갤러리 ex-modal-card (열린 상태)").toHaveCount(1);
  await expect(modal).toBeVisible();
  return modal;
}

/** 필터 줄 + 기록 목록이 놓인 갤러리 구역 = "내 기록" 옵션을 가진 segmented-control 이 들어 있는 section */
function historySection(page: Page): Locator {
  return page.locator("section").filter({
    has: page.locator(sel("segmented-control")).filter({ hasText: FILTER.otherLabel! }),
  });
}

/** 기록 행 = 그 구역의 ex-data-table-cell */
const recordRows = (section: Locator) => section.locator(sel("ex-data-table-cell"));

async function box(loc: Locator, what: string): Promise<{ x: number; y: number; width: number; height: number }> {
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  expect(b, `${what} 위치`).not.toBeNull();
  return b!;
}

// ---------- 기대값 자체 점검 ----------
test(`[K1][S${SCREEN}] 기대값 원본: 프레임 ${SCREEN}-mobile 에 ex-modal-card·filter-row·기록 행, rules.json 하늘색 2종`, () => {
  expect(MODAL.title, "프레임 modal-title").toBeTruthy();
  expect(MODAL.amount, "프레임 amount-value").toBeTruthy();
  expect(MODAL.unit, "프레임 amount-unit").toBeTruthy();
  expect(MODAL.labels, "프레임 field-label (s2-spec: 사용자 · 일시 · 메모)").toEqual(["사용자", "일시", "메모"]);
  expect(MODAL.values.length, "프레임 field-value 수").toBe(MODAL.labels.length);
  expect(MODAL.msds, "프레임 msds-entry 라벨").toBeTruthy();
  expect(MODAL.close, "프레임 button-outline 라벨").toBeTruthy();
  expect(FILTER.segmented, "프레임 filter-row segmented-control").toBeGreaterThan(0);
  expect(FILTER.textInput, "프레임 filter-row text-input").toBeGreaterThan(0);
  expect(FILTER.period, "프레임 기간 기본값").toBe(PERIOD_OPTIONS[0]);
  expect(FRAME_ROWS.length, "프레임 기록 행").toBeGreaterThan(1);
  expect(HIGHLIGHTS.length, "rules.json colors.highlight.values").toBe(2);
  expect(HIGHLIGHTS, "프레임 선택 행 채움 = rules.json 하늘색").toContain(SELECTED_FILL.toLowerCase());
});

// ---------- 갤러리 등장 (K1 의 DOM 판) ----------
test(`[K1][S${SCREEN}] 갤러리 DOM 에 dev-rules components 중 화면 ${SCREEN} 컴포넌트가 각각 1개 이상`, async ({ page }) => {
  const names = Object.entries(dev.components)
    .filter(([, screens]) => screens.includes(SCREEN))
    .map(([n]) => n);
  expect(names.length, `dev-rules components 에 화면 ${SCREEN} 컴포넌트`).toBeGreaterThan(0);
  for (const n of ["ex-modal-card", "ex-data-table-cell", "msds-entry", "ex-empty-state-card"]) {
    expect(names, `dev-rules components 화면 ${SCREEN} 에 ${n}`).toContain(n);
  }
  await open(page);
  for (const n of names) {
    expect(await page.locator(sel(n)).count(), `갤러리 ${n}`).toBeGreaterThanOrEqual(1);
  }
});

// ---------- ex-modal-card ----------
test.describe("ex-modal-card", () => {
  test(`[K1][S${SCREEN}] ex-modal-card 구성: 시약명 제목 · 사용량+단위 · 라벨-값 행(${MODAL.labels.join("·")}) · msds-entry "${MODAL.msds}" · button-outline "${MODAL.close}"`, async ({ page }) => {
    await open(page);
    const modal = await modalOf(page);

    await expect(modal.getByRole("heading", { name: MODAL.title!, exact: true }), "시약명 제목(heading)").toHaveCount(1);
    await expect(modal.getByText(MODAL.amount!, { exact: true }).first(), "사용량").toBeVisible();
    await expect(modal.getByText(MODAL.unit!, { exact: true }).first(), "단위").toBeVisible();
    for (let i = 0; i < MODAL.labels.length; i++) {
      await expect(modal.getByText(MODAL.labels[i], { exact: true }), `라벨 ${MODAL.labels[i]}`).toHaveCount(1);
      await expect(modal.getByText(MODAL.values[i], { exact: true }), `값 ${MODAL.values[i]}`).toHaveCount(1);
    }
    const msds = modal.locator(sel("msds-entry"));
    await expect(msds, "카드 안 msds-entry").toHaveCount(MODAL.msdsCount);
    await expect(msds, "msds-entry 문구").toContainText(MODAL.msds!);
    await expect(
      modal.locator(sel("button-pill-soft")).filter({ hasText: MODAL.msds! }),
      `button-pill-soft "${MODAL.msds}"`,
    ).toHaveCount(1);
    const outline = modal.locator(sel("button-outline"));
    await expect(outline, "카드 안 button-outline").toHaveCount(MODAL.outlineCount);
    await expect(outline, "button-outline 문구").toHaveText(exact(MODAL.close!));
    await expect(modal.getByRole("button", { name: MODAL.close!, exact: true }), `"${MODAL.close}" 는 버튼`).toHaveCount(1);
  });

  test(`[K1][S${SCREEN}] ex-modal-card 라벨-값 행: 라벨과 값이 같은 줄, 라벨이 왼쪽`, async ({ page }) => {
    await open(page);
    const modal = await modalOf(page);
    for (let i = 0; i < MODAL.labels.length; i++) {
      const l = await box(modal.getByText(MODAL.labels[i], { exact: true }), `라벨 ${MODAL.labels[i]}`);
      const v = await box(modal.getByText(MODAL.values[i], { exact: true }), `값 ${MODAL.values[i]}`);
      expect(l.x, `${MODAL.labels[i]}: 라벨이 값보다 왼쪽`).toBeLessThan(v.x);
      expect(l.y < v.y + v.height && v.y < l.y + l.height, `${MODAL.labels[i]}: 라벨과 값이 같은 줄`).toBe(true);
    }
  });

  test(`[K1][S${SCREEN}] ex-modal-card 순서: 제목 → 사용량 → ${MODAL.labels.join(" → ")} → msds-entry → "${MODAL.close}" (위→아래)`, async ({ page }) => {
    await open(page);
    const modal = await modalOf(page);
    const parts: [string, Locator][] = [
      ["제목", modal.getByRole("heading", { name: MODAL.title!, exact: true })],
      ["사용량", modal.getByText(MODAL.amount!, { exact: true }).first()],
      ...MODAL.labels.map((l): [string, Locator] => [`라벨 ${l}`, modal.getByText(l, { exact: true })]),
      ["msds-entry", modal.locator(sel("msds-entry"))],
      [`"${MODAL.close}"`, modal.locator(sel("button-outline"))],
    ];
    // DOM 순서
    const handles = [];
    for (const [what, loc] of parts) {
      await expect(loc, what).toHaveCount(1);
      handles.push(await loc.elementHandle());
    }
    for (let i = 0; i + 1 < handles.length; i++) {
      const follows = await page.evaluate(
        ([a, b]) => Boolean(a!.compareDocumentPosition(b!) & Node.DOCUMENT_POSITION_FOLLOWING),
        [handles[i], handles[i + 1]],
      );
      expect(follows, `DOM 순서: ${parts[i][0]} 다음에 ${parts[i + 1][0]}`).toBe(true);
    }
    // 화면 순서 (라벨-값 행 아래 msds-entry, 그 아래 닫기)
    const boxes = [];
    for (const [what, loc] of parts) boxes.push(await box(loc, what));
    const title = boxes[0];
    const firstField = boxes[2];
    const lastField = boxes[1 + MODAL.labels.length];
    const msds = boxes[boxes.length - 2];
    const close = boxes[boxes.length - 1];
    expect(title.y + title.height, "제목이 라벨-값 행보다 위").toBeLessThanOrEqual(firstField.y + 1);
    expect(boxes[1].y + boxes[1].height, "사용량이 라벨-값 행보다 위").toBeLessThanOrEqual(firstField.y + 1);
    for (let i = 2; i < 1 + MODAL.labels.length; i++) {
      expect(boxes[i].y + boxes[i].height, `${parts[i][0]} 이 ${parts[i + 1][0]} 보다 위`).toBeLessThanOrEqual(boxes[i + 1].y + 1);
    }
    expect(lastField.y + lastField.height, "msds-entry 가 라벨-값 행 아래").toBeLessThanOrEqual(msds.y + 1);
    expect(msds.y + msds.height, `"${MODAL.close}" 가 msds-entry 아래`).toBeLessThanOrEqual(close.y + 1);
  });

  test(`[K1][S${SCREEN}] ex-modal-card 접근성: role=dialog · aria-modal=true · aria-labelledby 가 시약명 제목을 가리킴`, async ({ page }) => {
    await open(page);
    const modal = await modalOf(page);
    await expect(modal, "role").toHaveAttribute("role", "dialog");
    await expect(modal, "aria-modal").toHaveAttribute("aria-modal", "true");
    const labelledby = await modal.getAttribute("aria-labelledby");
    expect(labelledby, "aria-labelledby").toBeTruthy();
    const ids = labelledby!.trim().split(/\s+/);
    const labelText = await page.evaluate(
      (list) => list.map((id) => document.getElementById(id)?.textContent?.trim() ?? null),
      ids,
    );
    expect(labelText, "aria-labelledby 가 가리키는 요소가 모두 존재").not.toContain(null);
    expect(labelText.join(" "), "연결된 제목 글자").toContain(MODAL.title!);
    const inside = await modal.evaluate((el, list) => list.every((id) => el.contains(document.getElementById(id))), ids);
    expect(inside, "연결된 제목이 카드 안에 있음").toBe(true);
    await expect(page.getByRole("dialog", { name: MODAL.title! }), "접근 가능한 이름 = 시약명").toHaveCount(1);
  });

  test(`[K1][S${SCREEN}] ex-modal-card 열리면 포커스가 카드 안으로 들어온다`, async ({ page }) => {
    await open(page);
    const modal = await modalOf(page);
    await expect
      .poll(() => modal.evaluate((el) => el === document.activeElement || el.contains(document.activeElement)), {
        message: "document.activeElement 가 ex-modal-card 안",
      })
      .toBe(true);
  });

  test(`[K1][S${SCREEN}] ex-modal-card Esc 로 닫힘`, async ({ page }) => {
    await open(page);
    const modal = await modalOf(page);
    await page.keyboard.press("Escape");
    await expect(modal, "Esc 뒤 ex-modal-card").toBeHidden();
  });

  test(`[K1][S${SCREEN}] ex-modal-card "${MODAL.close}" 로 닫힘`, async ({ page }) => {
    await open(page);
    const modal = await modalOf(page);
    await modal.locator(sel("button-outline")).filter({ hasText: exact(MODAL.close!) }).click();
    await expect(modal, `"${MODAL.close}" 뒤 ex-modal-card`).toBeHidden();
  });

  test(`[K1][S${SCREEN}] ex-modal-card 하늘색 없음: 카드와 그 안 요소의 채움·테두리·글자에 rules.json 하늘색(${HIGHLIGHTS.join("·")}) 0 (msds-entry 아이콘 선만 예외)`, async ({ page }) => {
    await open(page);
    const modal = await modalOf(page);
    const found = await modal.evaluate((el, rgbs) => {
      const hits: string[] = [];
      const all = [el, ...Array.from(el.querySelectorAll("*"))];
      for (const node of all) {
        const cs = getComputedStyle(node);
        const tag = `${node.tagName.toLowerCase()}${node.getAttribute("data-component") ? `[${node.getAttribute("data-component")}]` : ""}`;
        if (rgbs.includes(cs.backgroundColor)) hits.push(`${tag} background ${cs.backgroundColor}`);
        for (const side of ["Top", "Right", "Bottom", "Left"] as const) {
          const width = parseFloat(cs.getPropertyValue(`border-${side.toLowerCase()}-width`));
          const color = cs.getPropertyValue(`border-${side.toLowerCase()}-color`);
          if (width > 0 && rgbs.includes(color)) hits.push(`${tag} border-${side.toLowerCase()} ${color}`);
        }
        // 글자색: 직접 글자를 가진 요소만 (아이콘 svg 의 선 색은 s2-spec msds-entry 가 허용)
        const hasOwnText = Array.from(node.childNodes).some((c) => c.nodeType === Node.TEXT_NODE && (c.textContent ?? "").trim() !== "");
        if (hasOwnText && !node.closest("svg") && rgbs.includes(cs.color)) hits.push(`${tag} color ${cs.color}`);
      }
      return hits;
    }, HIGHLIGHT_RGB);
    expect(found, "카드 안 하늘색 사용처").toEqual([]);
  });
});

// ---------- ex-data-table-cell (기록 행) ----------
test.describe("ex-data-table-cell 기록 행", () => {
  const selectedFrameRow = FRAME_ROWS.find((r) => r.selectedFill !== null)!;
  const plainFrameRow = FRAME_ROWS.find((r) => r.selectedFill === null)!;

  function rowOf(section: Locator, r: FrameRow): Locator {
    return recordRows(section).filter({ hasText: r.name }).filter({ hasText: r.date });
  }

  test(`[K1][S${SCREEN}] 기록 행은 누를 수 있는 요소(button)이고 2개 이상 놓여 있다`, async ({ page }) => {
    await open(page);
    const section = historySection(page);
    await expect(section, "필터 줄·기록 목록 구역").toHaveCount(1);
    const rows = recordRows(section);
    expect(await rows.count(), "기록 행 수").toBeGreaterThanOrEqual(2);
    for (const row of await rows.all()) {
      const info = await row.evaluate((el) => ({ tag: el.tagName, role: el.getAttribute("role"), tabIndex: (el as HTMLElement).tabIndex }));
      expect(info.tag === "BUTTON" || info.role === "button", `기록 행은 button (실제 ${info.tag} role=${info.role})`).toBe(true);
      expect(info.tabIndex, "기록 행은 키보드로 닿을 수 있음").toBeGreaterThanOrEqual(0);
      await expect(row, "기록 행 활성").toBeEnabled();
    }
  });

  for (const [label, r] of [
    ["선택 행", selectedFrameRow],
    ["일반 행", plainFrameRow],
  ] as const) {
    test(`[K1][S${SCREEN}] 기록 행(${label}) 3열: 날짜 "${r.date}"(좌) · 시약명 "${r.name}" / 사용자 "${r.user}"(중) · 사용량 "${r.amount}"(우)`, async ({ page }) => {
      await open(page);
      const row = rowOf(historySection(page), r);
      await expect(row, `시안의 ${label}`).toHaveCount(1);
      const date = await box(row.getByText(r.date, { exact: true }), "날짜");
      const name = await box(row.getByText(r.name, { exact: true }), "시약명");
      const user = await box(row.getByText(r.user, { exact: true }), "사용자");
      const amount = await box(row.getByText(r.amount, { exact: true }), "사용량");
      const rowBox = await box(row, "행");

      expect(date.x + date.width, "날짜 열이 가운데 열보다 왼쪽").toBeLessThanOrEqual(name.x + 1);
      expect(name.x + name.width, "시약명이 사용량 열보다 왼쪽").toBeLessThanOrEqual(amount.x + 1);
      expect(user.x + user.width, "사용자가 사용량 열보다 왼쪽").toBeLessThanOrEqual(amount.x + 1);
      expect(Math.abs(user.x - name.x), "시약명·사용자는 같은 열(왼쪽 끝 일치)").toBeLessThanOrEqual(1);
      expect(name.y + name.height, "사용자는 시약명 아래 줄").toBeLessThanOrEqual(user.y + 1);
      // 사용량은 오른쪽 열: 행 오른쪽 절반에서 끝난다
      expect(amount.x + amount.width, "사용량이 행 오른쪽에 붙음").toBeGreaterThan(rowBox.x + rowBox.width / 2);
      expect(date.x, "날짜가 행 왼쪽 절반에서 시작").toBeLessThan(rowBox.x + rowBox.width / 2);
    });
  }

  test(`[K1][S${SCREEN}] 선택(누른) 행 배경 = 하늘색 연한 토큰 ${SELECTED_FILL}, 나머지 행은 하늘색 배경 아님`, async ({ page }) => {
    await open(page);
    const section = historySection(page);
    const bg = (row: Locator) => row.evaluate((el) => getComputedStyle(el).backgroundColor);

    const selected = rowOf(section, selectedFrameRow);
    await expect(selected, "시안의 선택 행").toHaveCount(1);
    expect(await bg(selected), "선택 행 배경").toBe(hexToRgb(SELECTED_FILL));

    const rows = await recordRows(section).all();
    let highlighted = 0;
    for (const row of rows) if (HIGHLIGHT_RGB.includes(await bg(row))) highlighted++;
    expect(highlighted, "하늘색 배경인 기록 행 수 (시안: 선택 행만)").toBe(FRAME_ROWS.filter((r) => r.selectedFill !== null).length);
    expect(await bg(rowOf(section, plainFrameRow)), "일반 행 배경").not.toBe(hexToRgb(SELECTED_FILL));
  });
});

// ---------- 필터 줄 ----------
test.describe("필터 줄", () => {
  /** 기간 드롭다운 = 구역 안 text-input 중 검색 바(placeholder)가 아닌 것 */
  function periodInput(section: Locator): Locator {
    return section.locator(sel("text-input")).filter({ hasNot: section.page().getByPlaceholder(FILTER.searchPlaceholder!) });
  }

  /** 드롭다운에 지금 보이는 값 (native select 면 선택된 option 글자, 아니면 보이는 글자) */
  async function shownValue(input: Locator): Promise<string> {
    return input.evaluate((el) => {
      const select = el instanceof HTMLSelectElement ? el : el.querySelector("select");
      if (select) return select.selectedOptions[0]?.textContent?.trim() ?? "";
      return (el as HTMLElement).innerText.trim();
    });
  }

  test(`[K1][S${SCREEN}] 필터 줄: segmented-control ${FILTER.segmented} · segmented-control-active ${FILTER.active} · text-input ${FILTER.textInput} (프레임과 같은 개수)`, async ({ page }) => {
    await open(page);
    const section = historySection(page);
    await expect(section, "필터 줄 구역").toHaveCount(1);
    await expect(section.locator(sel("segmented-control")), "segmented-control").toHaveCount(FILTER.segmented);
    await expect(section.locator(sel("segmented-control-active")), "segmented-control-active").toHaveCount(FILTER.active);
    await expect(section.locator(sel("text-input")), "text-input (기간·검색)").toHaveCount(FILTER.textInput);
    await expect(section.getByPlaceholder(FILTER.searchPlaceholder!), `검색 바 "${FILTER.searchPlaceholder}"`).toHaveCount(1);
    await expect(periodInput(section), "기간 드롭다운").toHaveCount(FILTER.textInput - 1);
  });

  test(`[K1][S${SCREEN}] 필터 "${FILTER.activeLabel} / ${FILTER.otherLabel}": 기본 선택 "${FILTER.activeLabel}", 한 번에 하나만 선택`, async ({ page }) => {
    await open(page);
    const section = historySection(page);
    const control = section.locator(sel("segmented-control"));
    const active = section.locator(sel("segmented-control-active"));
    await expect(control).toContainText(FILTER.activeLabel!);
    await expect(control).toContainText(FILTER.otherLabel!);
    await expect(active, "기본 선택").toHaveText(exact(FILTER.activeLabel!));

    await control.getByText(FILTER.otherLabel!, { exact: true }).click();
    await expect(active, "선택은 하나만").toHaveCount(FILTER.active);
    await expect(active, `"${FILTER.otherLabel}" 선택`).toHaveText(exact(FILTER.otherLabel!));

    await control.getByText(FILTER.activeLabel!, { exact: true }).click();
    await expect(active, "선택은 하나만").toHaveCount(FILTER.active);
    await expect(active, `"${FILTER.activeLabel}" 로 되돌림`).toHaveText(exact(FILTER.activeLabel!));
  });

  test(`[K1][S${SCREEN}] 기간 드롭다운 기본값 "${FILTER.period}"`, async ({ page }) => {
    await open(page);
    const period = periodInput(historySection(page));
    await expect(period, "기간 드롭다운").toHaveCount(1);
    expect(await shownValue(period), "기간 기본값").toBe(FILTER.period);
  });

  test(`[K1][S${SCREEN}] 기간 드롭다운 선택지 = ${PERIOD_OPTIONS.join(" · ")} (순서 포함), 고르면 보이는 값이 바뀐다`, async ({ page }) => {
    await open(page);
    const period = periodInput(historySection(page));
    await expect(period, "기간 드롭다운").toHaveCount(1);
    const native = await period.evaluate((el) => el instanceof HTMLSelectElement || el.querySelector("select") !== null);
    const pick = PERIOD_OPTIONS[PERIOD_OPTIONS.length - 2];
    if (native) {
      const select = period.locator("xpath=descendant-or-self::select");
      expect((await select.locator("option").allTextContents()).map((t) => t.trim())).toEqual(PERIOD_OPTIONS);
      await select.selectOption({ label: pick });
    } else {
      await period.getByRole("button").or(period.getByRole("combobox")).first().click();
      const options = period.getByRole("option");
      await expect(options).toHaveCount(PERIOD_OPTIONS.length);
      expect((await options.allInnerTexts()).map((t) => t.trim())).toEqual(PERIOD_OPTIONS);
      await period.getByRole("option", { name: pick, exact: true }).click();
    }
    await expect.poll(() => shownValue(period), { message: `"${pick}" 선택 뒤 보이는 값` }).toBe(pick);
  });

  test(`[K1][S${SCREEN}] 기간 드롭다운에 접근 가능한 이름이 있다 (라벨 없는 입력 금지)`, async ({ page }) => {
    await open(page);
    const period = periodInput(historySection(page));
    const name = await period.evaluate((el) => {
      const control = (el.matches("select,button,[role=combobox]") ? el : el.querySelector("select,button,[role=combobox]")) as HTMLElement | null;
      if (!control) return null;
      const byId = (control.getAttribute("aria-labelledby") ?? "")
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
        .join(" ")
        .trim();
      const label = control.id ? document.querySelector(`label[for="${control.id}"]`)?.textContent?.trim() ?? "" : "";
      const wrapping = control.closest("label")?.textContent?.trim() ?? "";
      return control.getAttribute("aria-label") || byId || label || (control.tagName === "SELECT" ? wrapping && "label" : "") || "";
    });
    expect(name, "기간 드롭다운 조작 요소(select·button·combobox)").not.toBeNull();
    expect(name, "기간 드롭다운 접근 가능한 이름").not.toBe("");
  });
});

// ---------- ex-empty-state-card (필터 결과 0건) ----------
test(`[K1][S${SCREEN}] ex-empty-state-card: "${EMPTY_TITLE}" 문구`, async ({ page }) => {
  await open(page);
  const card = page.locator(sel("ex-empty-state-card")).filter({ hasText: EMPTY_TITLE });
  expect(await card.count(), `"${EMPTY_TITLE}" 빈 상태 카드`).toBeGreaterThanOrEqual(1);
  await expect(card.first().getByText(EMPTY_TITLE, { exact: true })).toBeVisible();
});
