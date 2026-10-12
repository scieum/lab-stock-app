// d7 §28 화면 연결(D3) 테스트 공용 — 센서 종류 묶음·파스코 카탈로그·센서 서류 등록·모바일 전체 메뉴·권한 안내·초대 취소·랜딩.
// 기준(구현이 아니라 여기서 도출): harness/d7-data.md §28, design/rules.json 1.28 sensor.type_groups · type_select · filter · catalog ·
//   add_mobile · doc · mobile_menu · no_access · invite_cancel · landing_hero_mark · desktop_shell.menu · colors,
//   harness/dev-rules.json 1.20 routes · components, design/frames 13-menu-mobile · 13-no-access-* · 8-invite-cancel-* · 17-type · 17-filter ·
//   17-model · 17-desktop · 17-mobile · 17-doc-upload · 17-doc-review · 17-doc-fail · 15-*.
// 문구는 rules 따옴표 글자 · 프레임 글자에서 읽는다 (구현 상수를 읽지 않는다).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import { newFrame } from "./desk-helpers";
import { devRules, routeOf, rules, sel } from "./screen-helpers";

type R28 = {
  sensor: {
    types: string[];
    type_groups: Record<string, string[]>;
    type_select: string;
    filter: string;
    catalog: { maker: string; suggest: string; fill: string; other_makers: string };
    add_mobile: string;
    list: string;
    doc: { entry: string; upload: string; review: string; link: string; new_sensor: string; not_sensor: string; save: string; fail: string };
  };
  mobile_menu: { button: string; sheet: string; tab_bar: string; guest: string };
  no_access: { copy: { teacher_admin: string; admin: string } };
  invite_cancel: { screen: number; roles: string[]; entry: string; confirm: string; after: string };
  landing_hero_mark: { rule: string };
  desktop_shell: { menu: { all: string[]; teacher_admin: string[]; admin: string[] } };
  colors: { highlight: { values: string[] } };
};
export const R = rules as unknown as R28;

export const quotes = (s: string) => [...s.matchAll(/'([^']+)'/g)].map((m) => m[1]);
const pick = (s: string, pred: (q: string) => boolean, what: string): string => {
  const q = quotes(s).find(pred);
  if (!q) throw new Error(`rules 에서 ${what} 를 읽지 못함`);
  return q;
};
export const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const exact = (s: string) => new RegExp(`^\\s*${esc(s)}\\s*$`);
export const squash = (s: string) => s.replace(/\s+/g, " ").trim();
/** 글자 사이 공백을 느슨하게 (span 사이 공백이 textContent 에 없을 때) — 공백 자리 = \s* */
export const loose = (s: string) => new RegExp(`^\\s*${s.split(/\s+/).map(esc).join("\\s*")}\\s*$`);
/** loose 와 같되 앞뒤 고정 없음 (긴 글 안에 들어 있는지) */
export const looseIn = (s: string) => new RegExp(s.split(/\s+/).map(esc).join("\\s*"));

const D7 = readFileSync(join(process.cwd(), "harness", "d7-data.md"), "utf8").replace(/\r\n/g, "\n");
export const D7_28 = D7.slice(D7.indexOf("## 28."), D7.indexOf("\n## ", D7.indexOf("## 28.") + 1));

/** #rrggbb → rgb(r, g, b) */
export const rgbOf = (hex: string) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
/** colors.highlight-soft (하늘색 틴트) — highlight.values 의 둘째 */
export const HIGHLIGHT_SOFT = rgbOf(R.colors.highlight.values[1]);

// ---------------------------------------------------------------- 센서 종류 묶음 (type_groups · type_select · filter)

export const TYPE_GROUPS: { title: string; types: string[] }[] = Object.entries(R.sensor.type_groups).map(([title, types]) => ({ title, types }));
/** "종류 고르기" (비었을 때 placeholder) */
export const TYPE_PLACEHOLDER = pick(R.sensor.type_select, (q) => q.endsWith("고르기"), "type_select placeholder");
/** "종류 검색" */
export const TYPE_SEARCH = pick(R.sensor.type_select, (q) => q.endsWith("검색"), "type_select 검색");
/** "맞는 종류가 없어요" */
export const TYPE_NONE = pick(R.sensor.type_select, (q) => q.startsWith("맞는"), "type_select 빈 결과");
/** 필터 묶음 줄 고른 개수 — rules '화학 · 2개' 틀 */
const FILTER_COUNT_TPL = pick(R.sensor.filter, (q) => / · \d+개$/.test(q), "filter 묶음 개수");
export const filterGroupLabel = (group: string, n: number) => FILTER_COUNT_TPL.replace(/^[^·]+ ·/, `${group} ·`).replace(/\d+/, String(n));
export const groupOf = (type: string) => TYPE_GROUPS.find((g) => g.types.includes(type))!;

export const typeSheet = (page: Page) => page.locator(sel("sensor-type-sheet"));
export const typeGroups = (scope: Locator) => scope.locator(sel("sensor-type-group"));
export const typeGroup = (scope: Locator, title: string) => typeGroups(scope).filter({ has: scope.page().locator("button[aria-expanded]", { hasText: new RegExp(`^\\s*${esc(title)}`) }) });
/** 묶음 줄(펼침/접힘 버튼) */
export const groupRow = (group: Locator) => group.locator("button[aria-expanded]").first();
/** 종류 chip (이름이 정확히 그 종류인 버튼) */
export const typeChip = (scope: Locator, type: string) => scope.getByRole("button", { name: exact(type) });
/** 범위 안에 보이는 종류 chip 이름들 (rules types 중) */
export async function visibleTypes(scope: Locator): Promise<string[]> {
  const out: string[] = [];
  for (const t of R.sensor.types) if ((await typeChip(scope, t).count()) > 0) out.push(t);
  return out;
}

// ---------------------------------------------------------------- 파스코 카탈로그 (catalog)

export const PASCO = R.sensor.catalog.maker;
export const SUGGEST_MAX = Number((/최대 (\d+)줄/.exec(R.sensor.catalog.suggest) ?? [])[1]);
export const SUGGEST_RAW = pick(R.sensor.catalog.suggest, (q) => q.startsWith("목록에 없어요"), "catalog.suggest 그대로 적기");
/** "카탈로그에서 종류·이름을 채웠어요" (채운 칸만 이름) */
export const FILL_NOTE = pick(R.sensor.catalog.fill, (q) => q.startsWith("카탈로그에서"), "catalog.fill 안내");
/** 받침 있으면 '을', 없으면 '를' (rules 문구 "종류·이름을" 의 조사를 채운 칸 이름에 맞춘다) */
const objParticle = (word: string) => ((word.charCodeAt(word.length - 1) - 0xac00) % 28 === 0 ? "를" : "을");
export const fillNoteOf = (filled: ("종류" | "이름")[]) => {
  const words = filled.join("·");
  return FILL_NOTE.replace(/종류·이름[을를]/, `${words}${objParticle(words)}`);
};
/** 시안 17-model 후보 행: 모델번호(match + rest) + caption "무선 비색·탁도 · 색·탁도" · 입력 글자 = match */
export const MODEL_FRAME = (() => {
  const nodes = newFrame("17-model-mobile");
  const rows: { model: string; caption: string; nameKo: string; type: string }[] = [];
  let model = "";
  for (const n of nodes) {
    if (!n.path.includes("sensor-model-suggest") || !n.text) continue;
    if (n.name === "match") model = n.text.characters;
    else if (n.name === "rest") model += n.text.characters;
    else if (n.name === "caption") {
      const cap = n.text.characters;
      const i = cap.lastIndexOf(" · ");
      rows.push({ model, caption: cap, nameKo: cap.slice(0, i), type: cap.slice(i + 3) });
      model = "";
    }
  }
  const query = nodes.find((n) => n.name === "match" && n.text)?.text?.characters ?? "";
  const value = nodes.find((n) => n.name === "input-value" && n.path.includes("field-model"))?.text?.characters ?? "";
  return { rows, query, value };
})();

// ---------------------------------------------------------------- 센서 서류로 등록 (add_mobile · doc)

export const DOC_ROUTE = devRules.routes["17-doc"];
/** 모바일 머리 '등록' · 시트 '서류로 등록' · caption · '직접 입력' */
export const [ADD_MOBILE_LABEL, DOC_ENTRY, DOC_ENTRY_CAPTION, DIRECT] = quotes(R.sensor.add_mobile);
export const DOC_TEXT = {
  /** "서류를 읽는 중이에요" */
  reading: pick(R.sensor.doc.upload, (q) => q.includes("읽는 중"), "doc.upload 처리 중"),
  /** "AI로 읽기" */
  read: pick(R.sensor.doc.upload, (q) => q.startsWith("AI"), "doc.upload AI로 읽기"),
  /** "읽은 센서 N개" */
  reviewTitle: (n: number) => pick(R.sensor.doc.review, (q) => q.startsWith("읽은 센서"), "doc.review 머리").replace("N", String(n)),
  /** "기존 센서에 더하기 · {이름} · 지금 3개 → 5개" */
  linkExisting: (name: string, now: number, add: number) =>
    pick(R.sensor.doc.link, (q) => q.startsWith("기존 센서에 더하기"), "doc.link 기존")
      .replace("{이름}", name)
      .replace(/지금 \d+개 → \d+개/, `지금 ${now}개 → ${now + add}개`),
  change: pick(R.sensor.doc.link, (q) => q === "바꾸기", "doc.link 바꾸기"),
  exclude: pick(R.sensor.doc.link, (q) => q === "빼기", "doc.link 빼기"),
  newSensor: pick(R.sensor.doc.link, (q) => q.startsWith("새 센서"), "doc.link 새 센서"),
  /** "센서 아님 N개" */
  notSensor: (n: number) => pick(R.sensor.doc.not_sensor, (q) => q.startsWith("센서 아님"), "doc.not_sensor").replace("N", String(n)),
  /** "센서로 넣기" (d7 §28 센서 확인 표) */
  asSensor: ((/"(센서로 넣기)"/.exec(D7_28) ?? [])[1]) as string,
  /** "확인 후 등록 · N개" */
  save: (n: number) => pick(R.sensor.doc.save, (q) => q.startsWith("확인 후 등록"), "doc.save 버튼").replace("N", String(n)),
  /** "센서 N개를 등록했어요" */
  done: (n: number) => pick(R.sensor.doc.save, (q) => q.endsWith("등록했어요"), "doc.save 토스트").replace("N", String(n)),
  emptyTitle: pick(R.sensor.doc.fail, (q) => q.startsWith("센서를 찾지"), "doc.fail 0개 제목"),
  emptyBody: pick(R.sensor.doc.fail, (q) => q.startsWith("다른 서류"), "doc.fail 0개 본문"),
  failTitle: pick(R.sensor.doc.fail, (q) => q.startsWith("서류를 읽지"), "doc.fail 실패 제목"),
  direct: pick(R.sensor.doc.fail, (q) => q === "직접 입력", "doc.fail 직접 입력"),
};
if (!DOC_TEXT.asSensor) throw new Error("d7 §28 에서 \"센서로 넣기\" 를 읽지 못함");

const frameText = (frame: string, name: string, under?: string): string => {
  const n = newFrame(frame).find((x) => x.name === name && x.text && (!under || x.path.includes(under)));
  if (!n) throw new Error(`${frame} 에 ${under ? `${under}/` : ""}${name} 글자 없음`);
  return n.text!.characters;
};
/** 시안 17-doc-upload: 머리 제목 · caption · doc-upload 제목 · caption */
export const DOC_FRAME = {
  heading: frameText("17-doc-upload-mobile", "heading", "sensor-doc-add"),
  caption: frameText("17-doc-upload-mobile", "caption", "sensor-doc-add"),
  uploadHeading: frameText("17-doc-upload-mobile", "heading", "doc-upload"),
  uploadCaption: frameText("17-doc-upload-mobile", "caption", "doc-upload"),
  guide: frameText("17-doc-review-mobile", "guide", "sensor-doc-add"),
  navTitle: frameText("17-doc-upload-mobile", "nav-title", "nav-pill"),
  failUploadHeading: frameText("17-doc-fail-mobile", "heading", "doc-upload"),
};

export const SENSOR_EXTRACT_API = "/api/sensors/extract";
/** d7 §28 센서 추출 API 구조화 출력의 한 품목 */
export type SensorDocItemBody = {
  name: string;
  originalName: string | null;
  maker: string | null;
  model: string | null;
  quantity: number;
  isSensor: boolean;
  type: string | null;
};

// ---------------------------------------------------------------- 모바일 전체 메뉴 (mobile_menu)

export const MENU_BUTTON = /^([a-z][a-z-]*):/.exec(R.mobile_menu.button)![1];
export const MENU_SHEET = /^([a-z][a-z-]*):/.exec(R.mobile_menu.sheet)![1];
/** 버튼 크기 "44×44" */
export const MENU_BUTTON_SIZE = Number((/(\d+)×\d+/.exec(R.mobile_menu.button) ?? [])[1]);
/** 역할별 묶음 (rules mobile_menu.sheet "홈·시약·센서·기록·시약장·QR 스캔 / (교사·admin) 입고·… / (admin) 사용자·판매처") */
export const MENU_GROUPS: string[][] = (() => {
  const m = /역할별 묶음: (.+?)\. 묶음 사이/.exec(R.mobile_menu.sheet);
  if (!m) throw new Error("rules mobile_menu.sheet 에서 묶음을 읽지 못함");
  return m[1].split(" / ").map((g) => g.replace(/^\([^)]*\)\s*/, "").split("·").map((s) => s.trim()));
})();
/** 묶음 제목 (시안 13-menu-mobile menu-group-title) — 둘째·셋째 묶음 */
export const MENU_GROUP_TITLES = newFrame("13-menu-mobile")
  .filter((n) => n.path.includes("menu-group-title") && n.text)
  .map((n) => n.text!.characters);
export const LOGOUT = pick(R.mobile_menu.sheet, (q) => q === "로그아웃", "mobile_menu.sheet 로그아웃");
/** 데스크톱 사이드바 묶음과 같은 순서 → 화면 번호 (desktop_shell.menu: 홈 13 · 시약 2 · 센서 17 · 기록 10 · 시약장 11 · QR 12 / 입고 7 · 실험 매뉴얼 5 · 재주문 6 / 사용자 8 · 판매처 9) */
const MENU_SCREENS: number[][] = [
  [13, 2, 17, 10, 11, 12],
  [7, 5, 6],
  [8, 9],
];
/** 역할별로 보이는 묶음 수 (학생 1 · 교사 2 · admin 3 — desktop_shell.menu all / teacher_admin / admin) */
export const groupsFor = (role: "student" | "teacher" | "admin") => MENU_GROUPS.slice(0, role === "student" ? 1 : role === "teacher" ? 2 : 3);
/** 모바일 메뉴 글자 → 그 화면 경로 */
export function menuRouteOf(label: string): string {
  for (const [gi, g] of MENU_GROUPS.entries()) {
    const i = g.indexOf(label);
    if (i >= 0) return routeOf(MENU_SCREENS[gi][i]);
  }
  throw new Error(`메뉴 글자 ${label} 의 화면 없음`);
}
/** 데스크톱 사이드바 글자(desktop_shell.menu) → 같은 자리의 모바일 메뉴 글자 (QR 찾기 → QR 스캔) */
export function mobileLabelOf(deskLabel: string): string {
  const d = [R.desktop_shell.menu.all, R.desktop_shell.menu.teacher_admin, R.desktop_shell.menu.admin];
  for (const [gi, g] of d.entries()) {
    const i = g.indexOf(deskLabel);
    if (i >= 0) return MENU_GROUPS[gi][i];
  }
  throw new Error(`사이드바 글자 ${deskLabel} 없음`);
}
/** 둘러보기 메뉴: 학교 '데모 학교' · 활성 묶음 · guest-lock 묶음 · '가입하기' */
export const GUEST_MENU = (() => {
  const g = R.mobile_menu.guest;
  const active = (/\. (\S+?) 활성/.exec(g) ?? [])[1];
  const locked = (/활성, (.+?) guest-lock/.exec(g) ?? [])[1];
  if (!active || !locked) throw new Error("rules mobile_menu.guest 에서 활성 · 잠금 항목을 읽지 못함");
  return {
    school: quotes(g)[0],
    active: active.split("·"),
    locked: locked.split("·"),
    signup: pick(g, (q) => q.includes("가입"), "mobile_menu.guest 가입하기"),
  };
})();

export const menuButton = (page: Page) => page.locator(sel(MENU_BUTTON));
export const menuSheet = (page: Page) => page.locator(sel(MENU_SHEET));
/** 시트 안 메뉴 항목(링크 · 잠금 버튼) — 글자로 */
export const menuItem = (sheet: Locator, label: string) =>
  sheet.locator("a, button").filter({ hasText: new RegExp(`^\\s*${esc(label)}\\s*$`) });
/** 시트 안 메뉴 항목 글자 순서 (로그아웃 · 닫기 · 가입하기 빼고) */
export async function menuLabels(sheet: Locator): Promise<string[]> {
  const all = MENU_GROUPS.flat();
  const texts = await sheet.locator("nav a, nav button").evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText.replace(/\s+/g, " ").trim()));
  return texts.filter((t) => all.includes(t));
}

/** ☰ 를 눌러 시트를 연다 (하이드레이션 전 클릭 대비 다시 시도) */
export async function openMenu(page: Page): Promise<Locator> {
  const sheet = menuSheet(page);
  await expect(async () => {
    if (!(await sheet.isVisible())) await menuButton(page).click({ timeout: 3_000 });
    await expect(sheet, "mobile-menu-sheet 보임").toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  return sheet;
}

// ---------------------------------------------------------------- 권한 없는 주소 (no_access)

export const NO_ACCESS = R.no_access.copy;

// ---------------------------------------------------------------- 초대 취소 (invite_cancel)

const IC = R.invite_cancel;
export const INVITE_CANCEL = {
  item: pick(IC.entry, (q) => q === "초대 취소", "invite_cancel.entry 항목"),
  title: (email: string) => pick(IC.confirm, (q) => q.includes("{이메일}"), "invite_cancel.confirm 제목").replace("{이메일}", email),
  body: pick(IC.confirm, (q) => q.endsWith("없어요."), "invite_cancel.confirm 본문"),
  close: pick(IC.confirm, (q) => q === "닫기", "invite_cancel.confirm 닫기"),
  confirm: pick(IC.confirm, (q) => q === "초대 취소", "invite_cancel.confirm 확인"),
  done: quotes(IC.after)[0],
  menu: (/^([a-z][a-z-]*):/.exec(IC.entry) ?? [])[1],
  component: (/→ ([a-z][a-z-]*) '/.exec(IC.entry) ?? [])[1],
};

// ---------------------------------------------------------------- 랜딩 (landing_hero_mark)

export const HERO = {
  wordmark: quotes(R.landing_hero_mark.rule)[0],
  tag: pick(R.landing_hero_mark.rule, (q) => q.includes("관리"), "landing_hero_mark 꼬리표"),
};

/** 화면 경로 [param] 채우기 */
export const fill = (screen: number | string, id: string) => (typeof screen === "number" ? routeOf(screen) : devRules.routes[screen]).replace(/\[[^\]]+\]/, id);
