// 화면 8 (사용자 관리) 새 컴포넌트의 컴포넌트 수준 동작 — 갤러리(/gallery/users, /gallery · 비로그인 공개) 대상.
// 기준: 디자인 s2-spec "## 화면 8" (user-manage · ex-data-table-cell 멤버/초대 행 · ex-modal-card ①초대 ②역할 변경 ③삭제 확인),
//       harness/d7-data.md §8 (멤버 목록·역할 변경·초대), design/frames/8-mobile.json (시안 상태 = 본문 + 역할 변경 시트).
// 기대값: 개수·문구는 design/frames/8-mobile.json 노드에서, 색은 design/rules.json colors.highlight 에서,
//         컴포넌트 목록은 harness/dev-rules.json components 에서 읽는다 (구현에서 읽지 않는다).
//         프레임에 없는 상태(초대 시트·삭제 확인·마지막 admin·빈 상태·토스트) 문구는 s2-spec "## 화면 8" · d7-data.md §8 문장에서 그대로 옮긴 상수다.
// 태그: [K1] 은 dev-rules test_rules 에 없으므로 judge 의 규칙별 e2e 집계에 섞이지 않는다. [S8] 로 화면 8 실행에 포함된다.
// /users 화면(D3)·DB(D2) 검사는 여기서 하지 않는다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";

const SCREEN = 8;
const GALLERY_USERS = "/gallery/users";
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
const leaf = (n: FrameNode) => n.path[n.path.length - 1];
const parents = (n: FrameNode) => n.path.slice(0, -1);
const under = (ancestor: string) => nodes.filter((n) => parents(n).includes(ancestor));
const textOf = (list: FrameNode[], name: string) => list.filter((n) => n.name === name && n.text).map((n) => n.text!.characters);

const bodyNodes = under("user-manage");
const modalNodes = under("ex-modal-card");

const HEADER = {
  heading: textOf(bodyNodes.filter((n) => n.path.includes("header-text")), "heading")[0],
  counts: textOf(bodyNodes.filter((n) => n.path.includes("header-text")), "caption")[0],
  invite: bodyNodes.filter((n) => n.path.includes("user-header-row") && n.path.includes("button-primary") && n.name === "label")[0]?.text
    ?.characters,
  placeholder: textOf(bodyNodes.filter((n) => n.path.includes("text-input")), "placeholder")[0],
  memberTitle: textOf(bodyNodes.filter((n) => n.path.includes("member-section")), "section-title")[0],
  inviteTitle: textOf(bodyNodes.filter((n) => n.path.includes("invite-section")), "section-title")[0],
  note: textOf(bodyNodes, "user-note")[0],
};

type FrameMember = { fill: string | null; name: string; role: string; badge: string | null };
type FrameInvite = { fill: string | null; email: string; caption: string; status: string };
const FRAME_MEMBERS: FrameMember[] = [];
const FRAME_INVITES: FrameInvite[] = [];
{
  let member: Partial<FrameMember> | null = null;
  let invite: Partial<FrameInvite> | null = null;
  for (const n of bodyNodes) {
    if (leaf(n) === "ex-data-table-cell") {
      member = null;
      invite = null;
      if (n.path.includes("member-section")) {
        member = { fill: n.fills[0] ?? null, badge: null };
        FRAME_MEMBERS.push(member as FrameMember);
      } else if (n.path.includes("invite-section")) {
        invite = { fill: n.fills[0] ?? null };
        FRAME_INVITES.push(invite as FrameInvite);
      }
      continue;
    }
    if (!n.path.includes("ex-data-table-cell")) {
      member = null;
      invite = null;
      continue;
    }
    if (!n.text) continue;
    if (member) {
      if (n.name === "name") member.name = n.text.characters;
      if (n.name === "role") member.role = n.text.characters;
      if (n.name === "label" && n.path.includes("badge-me")) member.badge = n.text.characters;
    }
    if (invite) {
      if (n.name === "email") invite.email = n.text.characters;
      if (n.name === "caption") invite.caption = n.text.characters;
      if (n.name === "status") invite.status = n.text.characters;
    }
  }
}
const SELF = FRAME_MEMBERS.find((m) => m.badge !== null);
const OTHERS = FRAME_MEMBERS.filter((m) => m.badge === null);

const optionLabels = (kind: string) =>
  modalNodes.filter((n) => parents(n).includes(kind) && n.name === "label" && n.text).map((n) => n.text!.characters);
const SHEET = {
  title: textOf(modalNodes.filter((n) => n.path.includes("modal-heading")), "title")[0],
  // role-options 안 라벨을 프레임 순서대로
  roles: modalNodes
    .filter((n) => n.path.includes("role-options") && n.name === "label" && n.text)
    .map((n) => n.text!.characters),
  selected: optionLabels("role-option-selected")[0],
  selectedFill: modalNodes.find((n) => leaf(n) === "role-option-selected")?.fills[0] ?? "",
  radioDotFill: modalNodes.find((n) => leaf(n) === "radio-dot")?.fills[0] ?? "",
  primary: modalNodes.filter((n) => parents(n).includes("button-primary") && n.name === "label")[0]?.text?.characters,
  outline: modalNodes.filter((n) => parents(n).includes("button-outline") && n.name === "label")[0]?.text?.characters,
};

// 프레임의 컴포넌트 개수 (dev-rules components 이름만 센다)
const componentNames = Object.keys(dev.components);
const countByName = (list: FrameNode[]) => {
  const out: Record<string, number> = {};
  for (const n of list) if (componentNames.includes(leaf(n))) out[leaf(n)] = (out[leaf(n)] ?? 0) + 1;
  return out;
};
const FRAME_BODY_COUNTS = countByName(bodyNodes);
const FRAME_MODAL_COUNTS = countByName(modalNodes);
const FRAME_TOP_COUNTS = countByName(nodes.filter((n) => ["user-manage", "ex-modal-card"].includes(leaf(n))));

// ---------- 기대값: rules.json 하늘색 ----------
const HIGHLIGHTS = rules.colors.highlight.values.map((v) => v.toLowerCase());
function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
}
const HIGHLIGHT_RGB = HIGHLIGHTS.map(hexToRgb);

// ---------- s2-spec "## 화면 8" · d7-data.md §8 문장 그대로 ----------
const SCHOOL = "샘플고등학교";
const ROLE_LABELS = ["학생", "교사", "admin"];
const LAST_ADMIN_HINT = "admin이 최소 1명 있어야 해요";
const INVITE_TITLE = "사용자 초대";
const INVITE_COPY = "초대 링크 복사";
const INVITE_ROLES = ["학생", "교사"];
const inviteSubmit = (n: number) => `${n}명 초대`;
const DELETE_TITLE = "이 사용자를 삭제할까요?";
const DELETE_CANCEL = "취소";
const DELETE_CONFIRM = "삭제";
const EMPTY_SEARCH = "찾는 사용자가 없어요";
const EMPTY_ALONE = "아직 초대한 사용자가 없어요";
const TOASTS = [/^\s*\d+명을 초대했어요\s*$/, /^\s*역할을 바꿨어요\s*$/, /^\s*사용자를 삭제했어요\s*$/];

const sel = (name: string) => `[data-component="${name}"]`;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exact = (s: string) => new RegExp(`^\\s*${esc(s)}\\s*$`);

async function open(page: Page, path = GALLERY_USERS): Promise<void> {
  const res = await page.goto(path);
  expect(res?.status(), `갤러리 ${path} 응답`).toBe(200);
}

/** 상태가 바뀌어도(검색·추가) 같은 요소를 가리키도록, 지금 고른 요소를 같은 이름 컴포넌트 중 순번으로 고정한다 */
async function pin(page: Page, name: string, loc: Locator, what: string): Promise<Locator> {
  await expect(loc, what).toHaveCount(1);
  const all = page.locator(sel(name));
  const index = await loc.evaluate((el, selector) => Array.from(document.querySelectorAll(selector)).indexOf(el), sel(name));
  expect(index, `${what} 순번`).toBeGreaterThanOrEqual(0);
  return all.nth(index);
}

/** 글자가 놓인 자리를 실제 마우스로 누른다 (라디오 행처럼 입력 요소가 행 전체를 덮어도 사용자와 같은 결과) */
async function pressText(page: Page, loc: Locator): Promise<void> {
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  expect(b, "누를 글자 위치").not.toBeNull();
  await page.mouse.click(b!.x + b!.width / 2, b!.y + b!.height / 2);
}

/** 시안 상태의 user-manage = 프레임의 다른 멤버 이름과 초대 이메일이 모두 보이는 것 */
async function mainOf(page: Page): Promise<Locator> {
  let loc = page.locator(sel("user-manage"));
  for (const m of OTHERS) loc = loc.filter({ hasText: m.name });
  for (const v of FRAME_INVITES) loc = loc.filter({ hasText: v.email });
  return pin(page, "user-manage", loc, "시안 상태 user-manage");
}
const memberRow = (scope: Locator, name: string) =>
  scope.locator(sel("ex-data-table-cell")).filter({ has: scope.page().getByText(name, { exact: true }) });
const searchInput = (scope: Locator) => scope.locator(sel("text-input")).getByPlaceholder(HEADER.placeholder!, { exact: true });

async function modalWithHeading(page: Page, title: string, extra?: (m: Locator) => Locator): Promise<Locator> {
  let modal = page.locator(sel("ex-modal-card")).filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  if (extra) modal = extra(modal);
  const pinned = await pin(page, "ex-modal-card", modal, `ex-modal-card "${title}"`);
  await expect(pinned).toBeVisible();
  return pinned;
}
/** 역할 변경 시트 (시안: 사용자 삭제가 있는 일반 멤버) */
const roleSheet = (page: Page) => modalWithHeading(page, SHEET.title!);
/** 본인·마지막 admin 시트 = 안내 문구가 있는 ex-modal-card */
async function lastAdminSheet(page: Page): Promise<Locator> {
  const modal = page.locator(sel("ex-modal-card")).filter({ hasText: LAST_ADMIN_HINT });
  return pin(page, "ex-modal-card", modal, `"${LAST_ADMIN_HINT}" 가 있는 ex-modal-card`);
}
/** 초대 시트 (0명 상태) */
const inviteSheet = (page: Page) =>
  modalWithHeading(page, INVITE_TITLE, (m) => m.filter({ has: page.locator(sel("button-primary")).filter({ hasText: exact(inviteSubmit(0)) }) }));

async function box(loc: Locator, what: string): Promise<{ x: number; y: number; width: number; height: number }> {
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  expect(b, `${what} 위치`).not.toBeNull();
  return b!;
}

/** 행에 칠해진 바탕색: 요소 자신 또는 요소를 거의 다 덮는 자손의 첫 불투명 배경. 없으면 "none" */
async function paintedBackground(loc: Locator): Promise<string> {
  return loc.evaluate((el) => {
    const transparent = (c: string) => c === "transparent" || /rgba\([^)]*,\s*0\)$/.test(c);
    const r = el.getBoundingClientRect();
    const list = [el, ...Array.from(el.querySelectorAll("*"))];
    for (const e of list) {
      const b = e.getBoundingClientRect();
      if (b.width < r.width * 0.9 || b.height < r.height * 0.9) continue;
      const c = getComputedStyle(e).backgroundColor;
      if (!transparent(c)) return c;
    }
    return "none";
  });
}

/** 라디오가 놓인 행(radiogroup 아래 조상들)의 배경색·테두리색 목록 */
async function optionPaint(radio: Locator): Promise<{ backgrounds: string[]; borders: string[] }> {
  return radio.evaluate((el) => {
    const backgrounds: string[] = [];
    const borders: string[] = [];
    let cur: Element | null = el.parentElement;
    while (cur && cur.getAttribute("role") !== "radiogroup") {
      const cs = getComputedStyle(cur);
      backgrounds.push(cs.backgroundColor);
      if (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== "none") borders.push(cs.borderTopColor);
      cur = cur.parentElement;
    }
    return { backgrounds, borders };
  });
}

// ---------- 기대값 자체 점검 ----------
test(`[K1][S${SCREEN}] 기대값 원본: 프레임 ${SCREEN}-mobile 에 user-manage(헤더·멤버·초대 대기·유의사항)·역할 변경 시트, rules.json 하늘색 2종`, () => {
  expect(HEADER.heading, "프레임 heading").toMatch(new RegExp(`^${esc(SCHOOL)} 사용자 \\d+명$`));
  expect(HEADER.counts, "프레임 역할별 인원 줄").toMatch(/^학생 \d+ · 교사 \d+ · admin \d+$/);
  expect(HEADER.invite, "프레임 헤더 button-primary").toBe("초대");
  expect(HEADER.placeholder, "프레임 검색 플레이스홀더").toBe("이름 검색");
  expect(HEADER.memberTitle, "프레임 멤버 섹션 제목").toBe("멤버");
  expect(HEADER.inviteTitle, "프레임 초대 대기 섹션 제목").toBe(`초대 대기 (${FRAME_INVITES.length})`);
  expect(HEADER.note, "프레임 유의사항").toBe(`같은 학교(${SCHOOL}) 계정만 초대할 수 있어요`);
  expect(FRAME_MEMBERS.length, "프레임 멤버 행").toBeGreaterThan(1);
  expect(FRAME_MEMBERS.every((m) => m.name && ROLE_LABELS.includes(m.role)), "멤버 행마다 이름·역할").toBe(true);
  expect(FRAME_MEMBERS.filter((m) => m.badge !== null).length, "프레임 본인 행").toBe(1);
  expect(SELF!.badge, "프레임 본인 배지").toBe("나");
  expect(HIGHLIGHTS, "프레임 본인 행 채움 = rules.json 하늘색").toContain((SELF!.fill ?? "").toLowerCase());
  for (const m of OTHERS) expect(HIGHLIGHTS, `프레임 ${m.name} 행 채움은 하늘색 아님`).not.toContain((m.fill ?? "").toLowerCase());
  expect(FRAME_INVITES.length, "프레임 초대 대기 행").toBeGreaterThan(0);
  expect(FRAME_INVITES.every((v) => v.email && v.caption && v.status === "대기"), "초대 행마다 이메일·초대일·대기").toBe(true);
  expect(SHEET.title, "프레임 시트 제목 = {이름}의 역할").toMatch(/의 역할$/);
  expect(OTHERS.map((m) => `${m.name}의 역할`), "시트 대상은 프레임의 다른 멤버").toContain(SHEET.title);
  expect(SHEET.roles, "프레임 라디오 3행").toEqual(ROLE_LABELS);
  expect(SHEET.roles, "프레임 선택 행").toContain(SHEET.selected);
  expect(HIGHLIGHTS, "프레임 선택 행 채움 = rules.json 하늘색").toContain(SHEET.selectedFill.toLowerCase());
  expect(HIGHLIGHTS, "프레임 라디오 채움 = rules.json 하늘색").toContain(SHEET.radioDotFill.toLowerCase());
  expect(SHEET.selectedFill.toLowerCase(), "선택 행 배경과 라디오 채움은 서로 다른 하늘색").not.toBe(SHEET.radioDotFill.toLowerCase());
  expect(SHEET.primary, "프레임 시트 button-primary").toBe("변경");
  expect(SHEET.outline, "프레임 시트 button-outline").toBe("사용자 삭제");
  expect(HIGHLIGHTS.length, "rules.json colors.highlight.values").toBe(2);
});

// ---------- 갤러리 등장 (K1 의 DOM 판) ----------
test(`[K1][S${SCREEN}] /gallery DOM 에 user-manage 1개 이상 (K1 갤러리 기준 페이지)`, async ({ page }) => {
  expect(dev.components["user-manage"], "dev-rules components.user-manage").toContain(SCREEN);
  await open(page, GALLERY);
  expect(await page.locator(sel("user-manage")).count(), "/gallery user-manage").toBeGreaterThanOrEqual(1);
});

test(`[K1][S${SCREEN}] /gallery/users DOM 에 화면 ${SCREEN} 본문·시트 컴포넌트가 각각 1개 이상`, async ({ page }) => {
  const want = [
    "user-manage",
    "text-input",
    "ex-data-table-cell",
    "ex-modal-card",
    "segmented-control",
    "segmented-control-active",
    "button-pill-soft",
    "button-primary",
    "button-outline",
    "ex-empty-state-card",
    "ex-toast",
  ];
  for (const n of want) expect(Object.keys(dev.components), `dev-rules components 에 ${n}`).toContain(n);
  await open(page);
  for (const n of want) expect(await page.locator(sel(n)).count(), `/gallery/users ${n}`).toBeGreaterThanOrEqual(1);
});

test(`[K1][S${SCREEN}] 컴포넌트 개수: 시안 상태 user-manage + 역할 변경 시트가 프레임 ${SCREEN}-mobile 개수 이상`, async ({ page }) => {
  expect(FRAME_TOP_COUNTS["user-manage"], "프레임 user-manage").toBe(1);
  expect(FRAME_TOP_COUNTS["ex-modal-card"], "프레임 ex-modal-card").toBe(1);
  expect(Object.keys(FRAME_BODY_COUNTS).length, "프레임 user-manage 안 컴포넌트 종류").toBeGreaterThan(0);
  expect(Object.keys(FRAME_MODAL_COUNTS).length, "프레임 ex-modal-card 안 컴포넌트 종류").toBeGreaterThan(0);
  await open(page);
  const main = await mainOf(page);
  const sheet = await roleSheet(page);
  for (const [name, n] of Object.entries(FRAME_BODY_COUNTS)) {
    expect(await main.locator(sel(name)).count(), `user-manage 안 ${name} (프레임 ${n})`).toBeGreaterThanOrEqual(n);
  }
  for (const [name, n] of Object.entries(FRAME_MODAL_COUNTS)) {
    expect(await sheet.locator(sel(name)).count(), `역할 변경 시트 안 ${name} (프레임 ${n})`).toBeGreaterThanOrEqual(n);
  }
  // 행 수는 프레임과 정확히 같다 (멤버 + 초대 대기)
  await expect(main.locator(sel("ex-data-table-cell")), "user-manage 안 ex-data-table-cell").toHaveCount(
    FRAME_BODY_COUNTS["ex-data-table-cell"],
  );
});

// ---------- user-manage 본문 ----------
test.describe("user-manage", () => {
  test(`[K1][S${SCREEN}] user-manage 헤더: "${HEADER.heading}" 제목 · "${HEADER.counts}" · button-primary "${HEADER.invite}"`, async ({ page }) => {
    await open(page);
    const main = await mainOf(page);
    await expect(main.getByRole("heading", { name: HEADER.heading!, exact: true }), "헤더 제목(heading)").toHaveCount(1);
    await expect(main.getByText(HEADER.counts!, { exact: true }), "역할별 인원 줄").toHaveCount(1);
    await expect(main.getByText(HEADER.counts!, { exact: true })).toBeVisible();
    const invite = main.locator(sel("button-primary")).filter({ hasText: exact(HEADER.invite!) });
    await expect(invite, `button-primary "${HEADER.invite}"`).toHaveCount(1);
    await expect(main.getByRole("button", { name: HEADER.invite!, exact: true }), `"${HEADER.invite}" 는 버튼`).toHaveCount(1);
    await expect(invite).toBeEnabled();
  });

  test(`[K1][S${SCREEN}] user-manage 이름 검색: text-input 1개, 플레이스홀더 "${HEADER.placeholder}", 접근 가능한 이름`, async ({ page }) => {
    await open(page);
    const main = await mainOf(page);
    await expect(main.locator(sel("text-input")), "user-manage 안 text-input").toHaveCount(FRAME_BODY_COUNTS["text-input"]);
    const input = searchInput(main);
    await expect(input, "이름 검색 입력").toHaveCount(1);
    await expect(input).toHaveValue("");
    const named = await input.evaluate((el) => {
      const byId = (el.getAttribute("aria-labelledby") ?? "")
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
        .join("")
        .trim();
      const label = el.id ? (document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim() ?? "") : "";
      return el.getAttribute("aria-label") || byId || label || "";
    });
    expect(named, "이름 검색 입력의 접근 가능한 이름 (플레이스홀더만으로는 부족)").not.toBe("");
  });

  test(`[K1][S${SCREEN}] user-manage "${HEADER.memberTitle}" 섹션: 프레임 순서대로 행마다 이름·역할 텍스트`, async ({ page }) => {
    await open(page);
    const main = await mainOf(page);
    await expect(main.getByRole("heading", { name: HEADER.memberTitle!, exact: true }), `"${HEADER.memberTitle}" 섹션 제목`).toHaveCount(1);
    const rows = main.locator(sel("ex-data-table-cell"));
    for (let i = 0; i < FRAME_MEMBERS.length; i++) {
      const m = FRAME_MEMBERS[i];
      const row = rows.nth(i);
      await expect(row.getByText(m.name, { exact: true }), `${i + 1}행 이름 ${m.name}`).toHaveCount(1);
      await expect(row.getByText(m.name, { exact: true })).toBeVisible();
      await expect(row.getByText(m.role, { exact: true }).first(), `${i + 1}행 역할 ${m.role}`).toBeVisible();
    }
    // 멤버의 이메일은 보여 주지 않는다 (d7 §8)
    for (const m of FRAME_MEMBERS) {
      expect(await memberRow(main, m.name).innerText(), `${m.name} 행에 이메일 없음`).not.toMatch(/@/);
    }
  });

  test(`[K1][S${SCREEN}] user-manage 본인 행: "나" 배지 1개 + 하늘색 연한 배경, 다른 행은 배지·하늘색 배경 없음`, async ({ page }) => {
    await open(page);
    const main = await mainOf(page);
    const self = memberRow(main, SELF!.name);
    await expect(self, "본인 행").toHaveCount(1);
    await expect(self.getByText(SELF!.badge!, { exact: true }), '"나" 배지').toHaveCount(1);
    await expect(self.getByText(SELF!.badge!, { exact: true })).toBeVisible();
    expect(await paintedBackground(self), "본인 행 배경").toBe(hexToRgb(SELF!.fill!));
    for (const m of OTHERS) {
      const row = memberRow(main, m.name);
      await expect(row, `${m.name} 행`).toHaveCount(1);
      await expect(row.getByText(SELF!.badge!, { exact: true }), `${m.name} 행 "나" 배지`).toHaveCount(0);
      expect(HIGHLIGHT_RGB, `${m.name} 행 배경은 하늘색이 아니다`).not.toContain(await paintedBackground(row));
    }
  });

  test(`[K1][S${SCREEN}] user-manage 다른 멤버 행은 누를 수 있다 (역할 변경 시트를 여는 버튼)`, async ({ page }) => {
    await open(page);
    const main = await mainOf(page);
    for (const m of OTHERS) {
      const row = memberRow(main, m.name);
      const isButton = await row.evaluate(
        (el) => el.matches("button,[role=button],a[href]") || el.querySelector("button,[role=button],a[href]") !== null,
      );
      expect(isButton, `${m.name} 행에 누를 수 있는 요소`).toBe(true);
    }
  });

  test(`[K1][S${SCREEN}] user-manage "초대 대기 (N)" 섹션: N = 행 수, 행마다 이메일 · 초대일 · "대기"`, async ({ page }) => {
    await open(page);
    const main = await mainOf(page);
    const title = main.getByRole("heading", { name: /^초대 대기 \(\d+\)$/ });
    await expect(title, '"초대 대기 (N)" 섹션 제목').toHaveCount(1);
    const n = Number(/\((\d+)\)/.exec(await title.innerText())![1]);
    const inviteRows = main.locator(sel("ex-data-table-cell")).filter({ hasText: "@" });
    await expect(inviteRows, "초대 대기 행 수 = 제목의 N").toHaveCount(n);
    expect(n, "N = 프레임 초대 행 수").toBe(FRAME_INVITES.length);
    await expect(title).toHaveText(exact(HEADER.inviteTitle!));
    for (let i = 0; i < FRAME_INVITES.length; i++) {
      const v = FRAME_INVITES[i];
      const row = inviteRows.nth(i);
      await expect(row.getByText(v.email, { exact: true }), `초대 ${i + 1}행 이메일`).toBeVisible();
      await expect(row.getByText(v.caption, { exact: true }), `초대 ${i + 1}행 초대일`).toBeVisible();
      await expect(row.getByText(v.status, { exact: true }), `초대 ${i + 1}행 상태`).toBeVisible();
      expect(HIGHLIGHT_RGB, `초대 ${i + 1}행 배경은 하늘색이 아니다`).not.toContain(await paintedBackground(row));
    }
  });

  test(`[K1][S${SCREEN}] user-manage 순서: 헤더 → 멤버 → 초대 대기 → 유의사항 "${HEADER.note}" (위→아래)`, async ({ page }) => {
    await open(page);
    const main = await mainOf(page);
    await expect(main.getByText(HEADER.note!, { exact: true }), "유의사항").toHaveCount(1);
    const parts: [string, Locator][] = [
      ["헤더 제목", main.getByRole("heading", { name: HEADER.heading!, exact: true })],
      ["멤버 제목", main.getByRole("heading", { name: HEADER.memberTitle!, exact: true })],
      ["첫 멤버 행", memberRow(main, FRAME_MEMBERS[0].name)],
      ["끝 멤버 행", memberRow(main, FRAME_MEMBERS[FRAME_MEMBERS.length - 1].name)],
      ["초대 대기 제목", main.getByRole("heading", { name: HEADER.inviteTitle!, exact: true })],
      ["첫 초대 행", main.locator(sel("ex-data-table-cell")).filter({ hasText: FRAME_INVITES[0].email })],
      ["유의사항", main.getByText(HEADER.note!, { exact: true })],
    ];
    let prev = -Infinity;
    let prevName = "";
    for (const [name, loc] of parts) {
      const b = await box(loc, name);
      expect(b.y, `${name} 은 ${prevName} 아래`).toBeGreaterThan(prev);
      prev = b.y;
      prevName = name;
    }
    // 이름 검색은 멤버 목록보다 위
    const s = await box(searchInput(main), "이름 검색");
    const first = await box(memberRow(main, FRAME_MEMBERS[0].name), "첫 멤버 행");
    expect(s.y, "이름 검색이 멤버 행보다 위").toBeLessThan(first.y);
  });

  test(`[K1][S${SCREEN}] user-manage 이름 검색: 부분 일치로 멤버 행이 걸러지고, 지우면 다시 전부`, async ({ page }) => {
    await open(page);
    const main = await mainOf(page);
    const target = OTHERS[0];
    // 이름의 뒤쪽 일부 (앞부분 일치가 아니라 부분 일치인지 본다)
    const part = target.name.slice(1);
    expect(part.length, "검색어 길이").toBeGreaterThan(0);
    const expected = FRAME_MEMBERS.filter((m) => m.name.includes(part)).map((m) => m.name);
    expect(expected.length, "검색어가 일부 행만 고른다").toBeLessThan(FRAME_MEMBERS.length);
    const input = searchInput(main);
    await input.fill(part);
    for (const m of FRAME_MEMBERS) {
      await expect(memberRow(main, m.name), `"${part}" 검색 뒤 ${m.name} 행`).toHaveCount(expected.includes(m.name) ? 1 : 0);
    }
    await expect(main.locator(sel("ex-empty-state-card")), "결과가 있으면 빈 상태 없음").toHaveCount(0);
    await input.fill("");
    for (const m of FRAME_MEMBERS) await expect(memberRow(main, m.name), `검색어를 지운 뒤 ${m.name} 행`).toHaveCount(1);
  });

  test(`[K1][S${SCREEN}] user-manage 검색 0건: ex-empty-state-card "${EMPTY_SEARCH}" + 검색 바 유지`, async ({ page }) => {
    await open(page);
    const main = await mainOf(page);
    const input = searchInput(main);
    const miss = FRAME_MEMBERS.map((m) => m.name).join("") + "없음";
    await input.fill(miss);
    const card = main.locator(sel("ex-empty-state-card"));
    await expect(card, "검색 0건 빈 상태 카드").toHaveCount(1);
    await expect(card.getByText(EMPTY_SEARCH, { exact: true })).toBeVisible();
    for (const m of FRAME_MEMBERS) await expect(memberRow(main, m.name), `0건일 때 ${m.name} 행`).toHaveCount(0);
    await expect(input, "검색 바 유지").toBeVisible();
    await expect(input).toHaveValue(miss);
    await expect(main.getByText(HEADER.note!, { exact: true }), "유의사항 유지").toHaveCount(1);
  });

  test(`[K1][S${SCREEN}] 갤러리 검색 0건 예시: "${EMPTY_SEARCH}" 카드 + 검색어가 든 검색 바, 멤버 행 0개`, async ({ page }) => {
    await open(page);
    const state = page.locator(sel("user-manage")).filter({ hasText: EMPTY_SEARCH });
    await expect(state, "검색 0건 상태 user-manage").toHaveCount(1);
    await expect(state.locator(sel("ex-empty-state-card")).filter({ hasText: EMPTY_SEARCH })).toHaveCount(1);
    const input = searchInput(state);
    await expect(input, "검색 바 유지").toBeVisible();
    expect((await input.inputValue()).trim(), "검색어").not.toBe("");
    for (const m of FRAME_MEMBERS) await expect(memberRow(state, m.name), `${m.name} 행`).toHaveCount(0);
  });

  test(`[K1][S${SCREEN}] 갤러리 다른 사용자 0명 예시: "${EMPTY_ALONE}" 1줄 + 본인 행 + 유의사항 유지, 초대 대기 섹션 없음`, async ({ page }) => {
    await open(page);
    const state = page.locator(sel("user-manage")).filter({ hasText: EMPTY_ALONE });
    await expect(state, "다른 사용자 0명 상태 user-manage").toHaveCount(1);
    const card = state.locator(sel("ex-empty-state-card"));
    await expect(card, "빈 상태 카드").toHaveCount(1);
    await expect(card.getByText(EMPTY_ALONE, { exact: true })).toBeVisible();
    const rows = state.locator(sel("ex-data-table-cell"));
    await expect(rows, "본인 행만").toHaveCount(1);
    await expect(rows.getByText(SELF!.badge!, { exact: true }), '"나" 배지').toHaveCount(1);
    await expect(state.getByRole("heading", { name: new RegExp(`^${esc(SCHOOL)} 사용자 1명$`) }), "헤더 인원 1명").toHaveCount(1);
    await expect(state.getByRole("heading", { name: /^초대 대기/ }), "초대 대기 섹션").toHaveCount(0);
    await expect(state.getByText(HEADER.note!, { exact: true }), "유의사항 유지").toBeVisible();
    await expect(state.locator(sel("button-primary")).filter({ hasText: exact(HEADER.invite!) }), "초대 버튼 유지").toHaveCount(1);
  });
});

// ---------- ex-modal-card ② 역할 변경 ----------
test.describe("ex-modal-card 역할 변경 시트", () => {
  test(`[K1][S${SCREEN}] 역할 변경 시트 구성: 제목 "${SHEET.title}" · 라디오 ${ROLE_LABELS.join("/")} · button-primary "${SHEET.primary}" · button-outline "${SHEET.outline}"`, async ({ page }) => {
    await open(page);
    const sheet = await roleSheet(page);
    await expect(sheet.getByRole("radiogroup"), "radiogroup").toHaveCount(1);
    const radios = sheet.getByRole("radiogroup").getByRole("radio");
    await expect(radios, "라디오 수").toHaveCount(SHEET.roles.length);
    for (let i = 0; i < SHEET.roles.length; i++) {
      await expect(radios.nth(i), `${i + 1}번째 라디오 이름`).toHaveAccessibleName(SHEET.roles[i]);
      await expect(radios.nth(i)).toBeEnabled();
    }
    const primary = sheet.locator(sel("button-primary"));
    await expect(primary, "시트 안 button-primary").toHaveCount(FRAME_MODAL_COUNTS["button-primary"]);
    await expect(primary).toHaveText(exact(SHEET.primary!));
    await expect(primary).toBeEnabled();
    const outline = sheet.locator(sel("button-outline"));
    await expect(outline, "시트 안 button-outline").toHaveCount(FRAME_MODAL_COUNTS["button-outline"]);
    await expect(outline).toHaveText(exact(SHEET.outline!));
    await expect(sheet.getByRole("button", { name: SHEET.outline!, exact: true }), `"${SHEET.outline}" 는 버튼`).toHaveCount(1);
  });

  test(`[K1][S${SCREEN}] 역할 변경 시트 순서·폭: 제목 → 라디오 3행 → 전폭 "${SHEET.primary}" → 맨 아래 "${SHEET.outline}"`, async ({ page }) => {
    await open(page);
    const sheet = await roleSheet(page);
    const group = await box(sheet.getByRole("radiogroup"), "radiogroup");
    const title = await box(sheet.getByRole("heading", { name: SHEET.title!, exact: true }), "제목");
    const primary = await box(sheet.locator(sel("button-primary")), "변경");
    const outline = await box(sheet.locator(sel("button-outline")), "사용자 삭제");
    expect(title.y, "제목이 라디오보다 위").toBeLessThan(group.y);
    expect(primary.y, "변경이 라디오 아래").toBeGreaterThanOrEqual(group.y + group.height);
    expect(outline.y, "사용자 삭제가 변경 아래").toBeGreaterThanOrEqual(primary.y + primary.height);
    expect(Math.abs(primary.width - group.width), "변경 버튼 폭 = 라디오 묶음 폭 (전폭)").toBeLessThanOrEqual(1);
    // 라디오 행은 위→아래로 쌓인다
    const radios = sheet.getByRole("radio");
    let prev = -Infinity;
    for (let i = 0; i < SHEET.roles.length; i++) {
      const label = await box(sheet.getByRole("radiogroup").getByText(SHEET.roles[i], { exact: true }), `${SHEET.roles[i]} 행`);
      expect(label.y, `${SHEET.roles[i]} 행이 앞 행 아래`).toBeGreaterThan(prev);
      prev = label.y;
    }
    await expect(radios).toHaveCount(SHEET.roles.length);
  });

  test(`[K1][S${SCREEN}] 역할 변경 라디오: 처음 "${SHEET.selected}" 만 선택, 다른 행을 누르면 그 하나만 선택`, async ({ page }) => {
    await open(page);
    const sheet = await roleSheet(page);
    const group = sheet.getByRole("radiogroup");
    for (const r of SHEET.roles) {
      const radio = group.getByRole("radio", { name: r, exact: true });
      if (r === SHEET.selected) await expect(radio, `처음 ${r}`).toBeChecked();
      else await expect(radio, `처음 ${r}`).not.toBeChecked();
    }
    for (const pick of [...SHEET.roles.filter((r) => r !== SHEET.selected), SHEET.selected!]) {
      await pressText(page, group.getByText(pick, { exact: true }));
      for (const r of SHEET.roles) {
        const radio = group.getByRole("radio", { name: r, exact: true });
        if (r === pick) await expect(radio, `"${pick}" 누른 뒤 ${r}`).toBeChecked();
        else await expect(radio, `"${pick}" 누른 뒤 ${r}`).not.toBeChecked();
      }
      await expect(group.getByRole("radio", { checked: true }), "선택된 라디오는 하나").toHaveCount(1);
    }
  });

  test(`[K1][S${SCREEN}] 역할 변경 라디오: 키보드 화살표로 선택이 옮겨 간다`, async ({ page }) => {
    await open(page);
    const sheet = await roleSheet(page);
    const group = sheet.getByRole("radiogroup");
    const i = SHEET.roles.indexOf(SHEET.selected!);
    const next = SHEET.roles[(i + 1) % SHEET.roles.length];
    await group.getByRole("radio", { name: SHEET.selected!, exact: true }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(group.getByRole("radio", { name: next, exact: true }), `ArrowDown 뒤 ${next}`).toBeChecked();
    await expect(group.getByRole("radio", { name: next, exact: true }), "포커스도 옮겨 간다").toBeFocused();
    await expect(group.getByRole("radio", { checked: true })).toHaveCount(1);
    await page.keyboard.press("ArrowUp");
    await expect(group.getByRole("radio", { name: SHEET.selected!, exact: true }), `ArrowUp 뒤 ${SHEET.selected}`).toBeChecked();
    await expect(group.getByRole("radio", { checked: true })).toHaveCount(1);
  });

  test(`[K1][S${SCREEN}] 역할 변경 라디오 선택 행: 하늘색 연한 배경 + 하늘색 테두리, 선택을 옮기면 표시도 옮겨 간다`, async ({ page }) => {
    await open(page);
    const sheet = await roleSheet(page);
    const group = sheet.getByRole("radiogroup");
    const fill = hexToRgb(SHEET.selectedFill);
    const line = hexToRgb(SHEET.radioDotFill);
    const check = async (selected: string) => {
      await expect(group.getByRole("radio", { name: selected, exact: true })).toBeChecked();
      for (const r of SHEET.roles) {
        const paint = await optionPaint(group.getByRole("radio", { name: r, exact: true }));
        if (r === selected) {
          expect(paint.backgrounds, `선택 행 ${r} 배경`).toContain(fill);
          expect(paint.borders, `선택 행 ${r} 테두리`).toContain(line);
        } else {
          for (const h of HIGHLIGHT_RGB) {
            expect(paint.backgrounds, `선택 안 된 행 ${r} 배경`).not.toContain(h);
            expect(paint.borders, `선택 안 된 행 ${r} 테두리`).not.toContain(h);
          }
        }
      }
    };
    await check(SHEET.selected!);
    const other = SHEET.roles.find((r) => r !== SHEET.selected)!;
    await pressText(page, group.getByText(other, { exact: true }));
    await page.mouse.move(0, 0);
    await check(other);
  });

  test(`[K1][S${SCREEN}] 본인·마지막 admin 시트: 라디오 전부 비활성(admin 선택) + "${LAST_ADMIN_HINT}", "${SHEET.outline}" 없음`, async ({ page }) => {
    await open(page);
    const sheet = await lastAdminSheet(page);
    await expect(sheet.getByRole("heading", { name: `${SELF!.name}의 역할`, exact: true }), "제목 {본인 이름}의 역할").toHaveCount(1);
    await expect(sheet.getByText(LAST_ADMIN_HINT, { exact: true }), "안내 문구").toBeVisible();
    const radios = sheet.getByRole("radiogroup").getByRole("radio");
    await expect(radios, "라디오 수").toHaveCount(ROLE_LABELS.length);
    for (let i = 0; i < ROLE_LABELS.length; i++) {
      await expect(radios.nth(i), `${ROLE_LABELS[i]} 라디오`).toHaveAccessibleName(ROLE_LABELS[i]);
      await expect(radios.nth(i), `${ROLE_LABELS[i]} 라디오 비활성`).toBeDisabled();
    }
    await expect(sheet.getByRole("radio", { name: "admin", exact: true }), "admin 선택").toBeChecked();
    await expect(sheet.getByRole("radio", { checked: true })).toHaveCount(1);
    await expect(sheet.locator(sel("button-outline")).filter({ hasText: SHEET.outline! }), `"${SHEET.outline}"`).toHaveCount(0);
    await expect(sheet.getByText(SHEET.outline!, { exact: true }), `"${SHEET.outline}" 글자`).toHaveCount(0);
    await expect(sheet.locator(sel("button-primary")).filter({ hasText: exact(SHEET.primary!) }), `button-primary "${SHEET.primary}"`).toHaveCount(1);
  });

  test(`[K1][S${SCREEN}] 본인·마지막 admin 시트: 다른 역할 행을 눌러도 admin 선택이 바뀌지 않는다`, async ({ page }) => {
    await open(page);
    const sheet = await lastAdminSheet(page);
    const group = sheet.getByRole("radiogroup");
    for (const r of ROLE_LABELS.filter((x) => x !== "admin")) {
      await pressText(page, group.getByText(r, { exact: true }));
      await expect(group.getByRole("radio", { name: "admin", exact: true }), `"${r}" 누른 뒤 admin`).toBeChecked();
      await expect(group.getByRole("radio", { name: r, exact: true }), `"${r}" 누른 뒤 ${r}`).not.toBeChecked();
    }
  });
});

// ---------- ex-modal-card ① 초대 ----------
test.describe("ex-modal-card 초대 시트", () => {
  const emailInput = (sheet: Locator) => sheet.locator(sel("text-input")).locator("input");
  const submit = (sheet: Locator) => sheet.locator(sel("button-primary"));
  const add = async (page: Page, sheet: Locator, email: string) => {
    await emailInput(sheet).fill(email);
    await emailInput(sheet).press("Enter");
  };

  test(`[K1][S${SCREEN}] 초대 시트 구성: 제목 "${INVITE_TITLE}" · button-pill-soft "${INVITE_COPY}" · 이메일 text-input · segmented-control "${INVITE_ROLES.join(" / ")}" · button-primary "${inviteSubmit(0)}"(비활성)`, async ({ page }) => {
    await open(page);
    const sheet = await inviteSheet(page);
    const copy = sheet.locator(sel("button-pill-soft")).filter({ hasText: exact(INVITE_COPY) });
    await expect(copy, `button-pill-soft "${INVITE_COPY}"`).toHaveCount(1);
    await expect(sheet.getByRole("button", { name: INVITE_COPY, exact: true }), `"${INVITE_COPY}" 는 버튼`).toHaveCount(1);
    await expect(sheet.locator(sel("text-input")), "초대 시트 text-input").toHaveCount(1);
    await expect(emailInput(sheet), "이메일 입력").toHaveCount(1);
    await expect(emailInput(sheet), "이메일 입력의 이름").toHaveAccessibleName(/이메일/);
    await expect(emailInput(sheet)).toHaveValue("");
    await expect(submit(sheet), "초대 시트 button-primary").toHaveCount(1);
    await expect(submit(sheet)).toHaveText(exact(inviteSubmit(0)));
    await expect(submit(sheet), "0명이면 비활성").toBeDisabled();
    // 전폭: 버튼 폭 = segmented-control 폭
    const seg = await box(sheet.locator(sel("segmented-control")), "segmented-control");
    const btn = await box(submit(sheet), "N명 초대");
    expect(Math.abs(btn.width - seg.width), "N명 초대 폭 = segmented-control 폭 (전폭)").toBeLessThanOrEqual(1);
    expect(btn.y, "N명 초대는 역할 선택 아래").toBeGreaterThanOrEqual(seg.y + seg.height);
  });

  test(`[K1][S${SCREEN}] 초대 시트 역할 선택: segmented-control 1개, 선택지 "${INVITE_ROLES.join(" / ")}" 뿐(admin 없음), active 1개, 누르면 옮겨 간다`, async ({ page }) => {
    await open(page);
    const sheet = await inviteSheet(page);
    const seg = sheet.locator(sel("segmented-control"));
    await expect(seg, "segmented-control").toHaveCount(1);
    const active = seg.locator(sel("segmented-control-active"));
    await expect(active, "segmented-control-active").toHaveCount(1);
    const options = seg.getByRole("radio").or(seg.getByRole("tab")).or(seg.getByRole("button"));
    await expect(options, "선택지 수").toHaveCount(INVITE_ROLES.length);
    expect((await options.allInnerTexts()).map((t) => t.trim()), "선택지").toEqual(INVITE_ROLES);
    expect(await seg.innerText(), "admin 선택지 없음").not.toMatch(/admin/i);
    const before = (await active.innerText()).trim();
    expect(INVITE_ROLES, "처음 선택").toContain(before);
    const other = INVITE_ROLES.find((r) => r !== before)!;
    await seg.getByText(other, { exact: true }).click();
    await expect(active, "한 번에 하나만 선택").toHaveCount(1);
    await expect(active, `"${other}" 선택`).toHaveText(exact(other));
  });

  test(`[K1][S${SCREEN}] 초대 시트: 이메일을 추가하면 "N명 초대" 의 N 이 늘고 활성, 제거하면 줄고 0명이면 다시 비활성`, async ({ page }) => {
    await open(page);
    const sheet = await inviteSheet(page);
    const btn = submit(sheet);
    const emails = FRAME_INVITES.map((v) => v.email);
    expect(emails.length, "프레임 초대 이메일").toBeGreaterThanOrEqual(2);
    for (let i = 0; i < emails.length; i++) {
      await add(page, sheet, emails[i]);
      await expect(btn, `${i + 1}번째 추가 뒤`).toHaveText(exact(inviteSubmit(i + 1)));
      await expect(btn).toBeEnabled();
      await expect(sheet.getByText(emails[i], { exact: true }), `추가한 이메일 ${emails[i]} 표시`).toBeVisible();
      await expect(emailInput(sheet), "추가 뒤 입력 칸 비움").toHaveValue("");
    }
    for (let i = emails.length - 1; i >= 0; i--) {
      const remove = sheet.getByRole("button", { name: new RegExp(esc(emails[i])) });
      await expect(remove, `${emails[i]} 제거 버튼(이름에 이메일)`).toHaveCount(1);
      await remove.click();
      await expect(btn, `${emails[i]} 제거 뒤`).toHaveText(exact(inviteSubmit(i)));
      await expect(sheet.getByText(emails[i], { exact: true }), `제거한 이메일 ${emails[i]}`).toHaveCount(0);
    }
    await expect(btn, "0명이면 비활성").toBeDisabled();
  });

  test(`[K1][S${SCREEN}] 초대 시트: 잘못된 형식은 추가되지 않고 안내가 뜬다`, async ({ page }) => {
    await open(page);
    const sheet = await inviteSheet(page);
    const btn = submit(sheet);
    for (const bad of ["jiwoo.han", "jiwoo@", "@example.com", "jiwoo han@example.com"]) {
      await add(page, sheet, bad);
      await expect(btn, `"${bad}" 는 추가되지 않는다`).toHaveText(exact(inviteSubmit(0)));
      await expect(btn).toBeDisabled();
      const alert = sheet.getByRole("alert");
      await expect(alert, `"${bad}" 안내(role=alert)`).toHaveCount(1);
      expect((await alert.innerText()).trim(), "안내 문구").not.toBe("");
      await expect(emailInput(sheet), "입력 칸 aria-invalid").toHaveAttribute("aria-invalid", "true");
      await emailInput(sheet).fill("");
    }
  });

  test(`[K1][S${SCREEN}] 초대 시트: 같은 이메일(대소문자만 다른 것 포함)은 다시 추가되지 않고 안내가 뜬다`, async ({ page }) => {
    await open(page);
    const sheet = await inviteSheet(page);
    const btn = submit(sheet);
    const email = FRAME_INVITES[0].email;
    await add(page, sheet, email);
    await expect(btn).toHaveText(exact(inviteSubmit(1)));
    await expect(sheet.getByRole("alert"), "정상 추가 뒤 안내 없음").toHaveCount(0);
    for (const dup of [email, email.toUpperCase()]) {
      await add(page, sheet, dup);
      await expect(btn, `"${dup}" 중복은 추가되지 않는다`).toHaveText(exact(inviteSubmit(1)));
      const alert = sheet.getByRole("alert");
      await expect(alert, `"${dup}" 중복 안내(role=alert)`).toHaveCount(1);
      expect((await alert.innerText()).trim(), "안내 문구").not.toBe("");
      await emailInput(sheet).fill("");
    }
    await expect(sheet.getByText(email, { exact: true }), "목록에는 한 번만").toHaveCount(1);
  });

  test(`[K1][S${SCREEN}] 갤러리 초대 2명 입력 예시: 이메일 2개 + button-primary "${inviteSubmit(2)}" 활성`, async ({ page }) => {
    await open(page);
    const sheet = await modalWithHeading(page, INVITE_TITLE, (m) =>
      m.filter({ has: page.locator(sel("button-primary")).filter({ hasText: exact(inviteSubmit(2)) }) }),
    );
    await expect(submit(sheet)).toBeEnabled();
    await expect(sheet.locator(sel("segmented-control-active")), "active 1개").toHaveCount(1);
    expect(await sheet.locator(sel("segmented-control")).innerText(), "admin 선택지 없음").not.toMatch(/admin/i);
    await expect(sheet.getByRole("button", { name: /@/ }), "이메일마다 제거 버튼").toHaveCount(2);
  });
});

// ---------- ex-modal-card ③ 삭제 확인 ----------
test(`[K1][S${SCREEN}] 삭제 확인 카드: "${DELETE_TITLE}" · button-outline "${DELETE_CANCEL}" · button-primary "${DELETE_CONFIRM}"`, async ({ page }) => {
  await open(page);
  const card = await modalWithHeading(page, DELETE_TITLE);
  const cancel = card.locator(sel("button-outline"));
  await expect(cancel, "button-outline").toHaveCount(1);
  await expect(cancel).toHaveText(exact(DELETE_CANCEL));
  const confirm = card.locator(sel("button-primary"));
  await expect(confirm, "button-primary").toHaveCount(1);
  await expect(confirm).toHaveText(exact(DELETE_CONFIRM));
  await expect(card.getByRole("button", { name: DELETE_CANCEL, exact: true })).toBeEnabled();
  await expect(card.getByRole("button", { name: DELETE_CONFIRM, exact: true })).toBeEnabled();
  const c = await box(cancel, "취소");
  const d = await box(confirm, "삭제");
  const title = await box(card.getByRole("heading", { name: DELETE_TITLE, exact: true }), "제목");
  expect(title.y, "제목이 버튼보다 위").toBeLessThan(Math.min(c.y, d.y));
});

// ---------- ex-modal-card 공통: 그림자 없음 + 1px 테두리 ----------
test(`[K1][S${SCREEN}] ex-modal-card 3종(역할 변경·초대·삭제 확인): 그림자 없음 + 테두리 1px`, async ({ page }) => {
  await open(page);
  const cards: [string, Locator][] = [
    ["역할 변경", await roleSheet(page)],
    ["초대", await inviteSheet(page)],
    ["삭제 확인", await modalWithHeading(page, DELETE_TITLE)],
  ];
  for (const [name, card] of cards) {
    const style = await card.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { shadow: cs.boxShadow, width: cs.borderTopWidth, style: cs.borderTopStyle };
    });
    expect(style.shadow, `${name} 카드 그림자`).toBe("none");
    expect(style.width, `${name} 카드 테두리 두께`).toBe("1px");
    expect(style.style, `${name} 카드 테두리`).toBe("solid");
  }
});

// ---------- ex-toast ----------
test(`[K1][S${SCREEN}] ex-toast: "N명을 초대했어요" · "역할을 바꿨어요" · "사용자를 삭제했어요" 문구`, async ({ page }) => {
  await open(page);
  for (const t of TOASTS) {
    const toast = page.locator(sel("ex-toast")).filter({ hasText: t });
    expect(await toast.count(), `ex-toast ${t}`).toBeGreaterThanOrEqual(1);
    await expect(toast.first()).toBeVisible();
  }
});
