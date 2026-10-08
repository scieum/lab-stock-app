// 개발 예외 시안 반영 (harness/d7-data.md §18, 디자인 run 20261007-0848 — design/frames 1.17 · rules.json 1.17 reorder.auto·app_exceptions):
// [C1][S3] 시약 상세 reorder-threshold: 자동이면 auto-threshold-badge "자동"(시안 3 회색 pill) + 캡션, basis·manual 은 배지 없음
// [C1][S6] 알림 카드: 자동이면 수량 줄 "재주문 기준 Nu [자동] / 현재 재고 Mu"(d7 §11 1.21) + 캡션, 판매처 "확인" 뒤 카드 안 새 창 안내 줄 + "직접 열기"
// [C1][S8] 삭제 확인 시트: × 닫기 · "{이름} · 사용·입고 기록은 남아요" · "{이름} 삭제" / 초대 시트: 역할(학생·교사) 고르기 유지 + × 닫기
//          (rules.json 1.21 app_exceptions.sheet-close "초대는 이메일 + 역할(학생·교사) 고르기" · d7 §18 화면 8 — 머리 "학생 a · 교사 b · admin c" 유지)
// [C1][S9] 등록·수정 폼: × 닫기 · 취소 · 부가 정보 칸 없음 · 웹사이트 칸 유지 · 저장해도 기존 note 는 DB 에 그대로 · 목록 행 = 이름 + 연락처만(웹사이트 안 보임)
// [C1][S5] 추출 행: 아래 연결 줄("우리 학교 시약" 선택·삭제·"기존 기준 N · 그대로 둬요/바뀌어요") · 단위 = 선택 상자(병·mL·g) · "N개 행을 합쳤어요" 무채색 줄
//
// 기대값: 문구·색은 design/frames(1.17)·design/rules.json·d7 §18 에서 읽는다 (구현에서 읽지 않는다).
// 모든 상태는 일회용 학교(service role 로 계정·학교 생성 — 메일 없음, 세션은 쿠키)에서 만들고, 판정 대상 호출은 로그인 세션(RLS)으로 한다.
// service role 은 준비·정리·대조 조회에만 쓴다. 공용 학교 A·B·데모는 쓰지 않는다 (afterAll 에서 불변 확인). 외부 사이트는 불러오지 않는다(stubExternal).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Locator, type TestInfo } from "@playwright/test";
import { countComponent, rules, sel } from "./screen-helpers";
import { detailPath, waitDetail } from "./screen-3-helpers";
import { prepReagent as prepBare } from "./screen-11-helpers";
import {
  CANCEL_BUTTON as S8_CANCEL,
  CONFIRM_TITLE,
  DELETE_USER_BUTTON,
  HAS_SERVICE,
  INVITE_ROLE_ORDER,
  ROLE_TEXT,
  addMember,
  clientFor,
  confirmDialog,
  deleteBodyText,
  deleteButtonLabel,
  inviteDialog,
  memberRow,
  openInviteSheet,
  openRoleSheet,
  openTemp,
  outlineIn as s8OutlineIn,
  primaryIn as s8PrimaryIn,
  profileByService,
  roleDialog,
  service,
  waitUsers,
} from "./screen-8-helpers";
import {
  CANCEL_BUTTON,
  DIRECT_OPEN,
  FIELD_CONTACT,
  FIELD_NAME,
  FIELD_WEBSITE,
  NO_RESIDUE_69,
  PILL_SOFT,
  PINK,
  REORDER_HREF,
  SAVE_BUTTON,
  SKY,
  VENDORS_HREF,
  CARD_AMOUNT,
  boxOf,
  cardOf,
  chooseRowMenu,
  cleanup,
  confirmButton,
  fakeSite,
  fieldInput,
  hex,
  linkDialog,
  makeSchool,
  onTop,
  openCreateForm,
  openLinkModal,
  pickVendor,
  prepVendor,
  purge,
  readAlerts,
  readVendorRows,
  registerBlock,
  saveButton,
  sharedSnapshot,
  stubExternal,
  tabBarTop,
  vendorRow,
  vendorsBySchool,
  waitReorder,
  waitVendors,
  type Fx,
} from "./screen-6-9-helpers";
import {
  BASIS_RE,
  MANUAL_HREF,
  UNITS,
  blockSaves,
  mockExtract,
  okReply,
  optionLabel,
  prepNamed,
  readRows,
  rowById,
  toResult,
  waitManual,
  type FakeItem,
} from "./screen-5-helpers";

test.describe.configure({ mode: "default" });
test.skip(!HAS_SERVICE, "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)");

const GROUP = "s18";
const TIMEOUT = 420_000;
const SAVE_TIMEOUT = 20_000;

// ---------- 기대값: d7 §18 · §11-1 ----------
const D7 = readFileSync(join(process.cwd(), "harness", "d7-data.md"), "utf8");
function d7Section(head: string): string {
  const s = D7.indexOf(head);
  if (s < 0) throw new Error(`harness/d7-data.md 에서 "${head}" 를 찾지 못했습니다`);
  const after = D7.slice(s + head.length);
  const e = after.search(/\n#{2,3} /);
  return D7.slice(s, e < 0 ? undefined : s + head.length + e);
}
function d7Row(sec: string, key: string): string {
  const line = sec.split(/\r?\n/).find((l) => l.startsWith(`| ${key}`));
  if (!line) throw new Error(`harness/d7-data.md 에서 "| ${key}" 행을 찾지 못했습니다`);
  return line;
}
const S18 = d7Section("## 18.");
const S11_1 = d7Section("### 11-1.");
const S18_AUTO = d7Row(S18, "자동 기준 표시");
const CAPTIONS = [...S18_AUTO.matchAll(/\*\*"([^"]+)"\*\*/g)].map((m) => m[1]);
const USAGE_CAPTION = CAPTIONS.find((c) => /사용량/.test(c)) ?? "";
const INTAKE_CAPTION = CAPTIONS.find((c) => /입고량/.test(c)) ?? "";
const SHOW = [...d7Row(S11_1, "표시").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const AUTO_LABEL = SHOW[0];
const NONE_TEXT = SHOW.find((q) => /아직/.test(q)) ?? "";
const MANUAL_TEXT = /'manual'\(화면 3 ([^)]+)\)/.exec(d7Row(S11_1, "기준의 출처"))?.[1] ?? "";
/** d7 §11 카드 수량 줄 앞말 (1.21: "재주문 기준 {min_stock}{unit} / 현재 재고 {stock}{unit}" — 숫자·단위 붙여 씀) */
const NEED = CARD_AMOUNT.need;
const STOCK_WORD = CARD_AMOUNT.stock;
/** d7 §18 화면 8·9 행 (1.21 맞춤) */
const S18_ROWS_8 = S18.split(/\r?\n/).filter((l) => l.startsWith("| 화면 8 |"));
const S18_ROW_9 = d7Row(S18, "화면 9");
/** rules.json 1.21 app_exceptions (sheet-close · user-count-line) */
const APP_EXC = (rules as unknown as { app_exceptions: Record<string, string> }).app_exceptions;

// ---------- 기대값: 시안 1.17 프레임 ----------
type FNode = { name: string; path: string[]; fills: string[]; strokes: string[]; cornerRadius: unknown; padding?: number[] | null; text: { characters: string } | null };
const frame = (name: string) => (JSON.parse(readFileSync(join(process.cwd(), "design", "frames", `${name}.json`), "utf8")) as { frames: { nodes: FNode[] }[] }).frames[0].nodes;
const node = (nodes: FNode[], pred: (n: FNode) => boolean, what: string): FNode => {
  const n = nodes.find(pred);
  if (!n) throw new Error(`design/frames 에서 ${what} 를 찾지 못했습니다`);
  return n;
};
const f3 = frame("3-mobile");
const f6 = frame("6-mobile");
const f8 = frame("8-mobile");
const f9 = frame("9-mobile");
const f5 = frame("5-mobile");
const AUTO_BADGE = "auto-threshold-badge";
const BADGE3 = node(f3, (n) => n.name === AUTO_BADGE, "3-mobile auto-threshold-badge");
const BADGE3_LABEL = node(f3, (n) => n.name === "label" && n.path.includes(AUTO_BADGE), "3-mobile 배지 글자");
const CAPTION3 = node(f3, (n) => n.name === "auto-caption", "3-mobile auto-caption");
const BADGE6 = node(f6, (n) => n.name === AUTO_BADGE, "6-mobile auto-threshold-badge");
const BADGE6_LABEL = node(f6, (n) => n.name === "label" && n.path.includes(AUTO_BADGE), "6-mobile 배지 글자");
const CAPTION6 = node(f6, (n) => n.name === "auto-caption", "6-mobile auto-caption");
const NEW_WINDOW_NOTE = node(f6, (n) => n.name === "note" && n.path.includes("vendor-new-window"), "6-mobile vendor-new-window note").text!.characters;
const NEW_WINDOW_ACTION = node(f6, (n) => n.name === "label" && n.path.includes("vendor-new-window"), "6-mobile 직접 열기").text!.characters;
const NEW_WINDOW_NOTE_FILL = node(f6, (n) => n.name === "note" && n.path.includes("vendor-new-window"), "6 note").fills[0];
const SHEET8 = f8.filter((n) => n.path.includes("ex-modal-card"));
const S8_TITLE = node(SHEET8, (n) => n.name === "sheet-title", "8 sheet-title").text!.characters;
const S8_BODY = node(SHEET8, (n) => n.name === "sheet-body", "8 sheet-body").text!.characters;
const S8_DELETE = node(SHEET8, (n) => n.name === "label" && n.path.includes("button-primary"), "8 삭제 버튼").text!.characters;
const S8_FRAME_CANCEL = node(SHEET8, (n) => n.name === "label" && n.path.includes("button-outline"), "8 취소").text!.characters;
const SHEET9 = f9.filter((n) => n.path.includes("ex-modal-card"));
const S9_HELPER = node(SHEET9, (n) => n.name === "sheet-helper", "9 sheet-helper").text!.characters;
const S9_FIELDS = SHEET9.filter((n) => n.name === "field-label" && n.text).map((n) => n.text!.characters);
const S9_CANCEL = node(SHEET9, (n) => n.name === "label" && n.path.includes("button-outline"), "9 취소").text!.characters;
const S9_SAVE = node(SHEET9, (n) => n.name === "label" && n.path.includes("button-primary"), "9 저장").text!.characters;
const S9_SHEET_PAD = node(f9, (n) => n.name === "ex-modal-card", "9 ex-modal-card").padding!;
const S9_DESKTOP_W = (JSON.parse(readFileSync(join(process.cwd(), "design", "frames", "9-desktop.json"), "utf8")) as { frames: { nodes: { name: string; width: number }[] }[] }).frames[0].nodes.find((n) => n.name === "ex-modal-card")!.width;
const MERGE5 = node(f5, (n) => n.name === "label" && n.path.includes("merge-note"), "5 merge-note label");
const LINK_LABEL5 = node(f5, (n) => n.name === "field-label" && n.path.includes("link-row"), "5 link-row field-label").text!.characters;
const DELETE5 = node(f5, (n) => n.name === "label" && n.path.includes("delete-link"), "5 delete-link").text!.characters;
const THRESHOLD_NOTES5 = f5.filter((n) => n.name === "threshold-note" && n.text).map((n) => n.text!.characters);

const rgb = (hex: string) => {
  const h = hex.replace("#", "");
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
};
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exact = (s: string) => new RegExp(`^\\s*${esc(s)}\\s*$`);
const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const MIN_H = (rules as unknown as { button: { min_height: number } }).button.min_height;

/** 요소와 자손의 바탕·글자·선 색 (핑크·하늘색 검사용) */
async function paints(l: Locator): Promise<string[]> {
  return l.evaluate((el) => {
    const out: string[] = [];
    for (const e of [el, ...Array.from(el.querySelectorAll("*"))]) {
      const cs = getComputedStyle(e);
      out.push(cs.backgroundColor, cs.color);
      for (const side of ["Top", "Right", "Bottom", "Left"] as const) {
        if (parseFloat(cs[`border${side}Width`]) > 0 && cs[`border${side}Style`] !== "none") out.push(cs[`border${side}Color`]);
      }
    }
    return out;
  });
}
async function expectNoPinkSky(l: Locator, what: string): Promise<void> {
  const used = await paints(l);
  expect(used.filter((c) => PINK.includes(c)), `${what}: 핑크(accent·accent_soft) 없음`).toEqual([]);
  expect(used.filter((c) => SKY.includes(c)), `${what}: 하늘색(highlight) 없음`).toEqual([]);
}
const css = (l: Locator, prop: string) => l.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

// ---------- 일회용 학교 ----------
let before: string[] | null = null;
let fixtureCache: Promise<Fx> | null = null;
function fixture(info: TestInfo): Promise<Fx> {
  fixtureCache ??= makeSchool(info, GROUP);
  fixtureCache.catch(() => {
    fixtureCache = null;
  });
  return fixtureCache;
}
async function fresh(info: TestInfo): Promise<Fx> {
  test.setTimeout(TIMEOUT);
  const f = await fixture(info);
  await purge([f.school.id]);
  return f;
}

test.beforeAll(async () => {
  if (HAS_SERVICE) before = await sharedSnapshot();
});

test.afterAll(async ({}, info) => {
  info.setTimeout(300_000);
  if (!HAS_SERVICE) return;
  fixtureCache = null;
  const left = await cleanup(GROUP, info.project.name);
  expect(left, "일회용 계정·학교·시약·판매처·기록 잔여물").toEqual(NO_RESIDUE_69);
  if (before) expect(await sharedSnapshot(), "공통 판매처 목록 · 학교 A·B·데모의 판매처·시약 기준 열이 그대로").toEqual(before);
});

type Src = { id: string; name: string; unit: string; stock: number; min_stock: number; reorder_per_group: number | null; reorder_groups: number | null; min_stock_source: string; min_stock_auto_basis: string | null };
async function bySession(f: Fx, id: string): Promise<Src> {
  const c = await clientFor(f.teacher);
  const r = await c.from("reagents").select("id, name, unit, stock, min_stock, reorder_per_group, reorder_groups, min_stock_source, min_stock_auto_basis").eq("id", id).single();
  expect(r.error, `로그인 세션(RLS)으로 시약 읽기 (${r.error?.message})`).toBeNull();
  const d = r.data as Record<string, unknown>;
  return {
    id: d.id as string,
    name: d.name as string,
    unit: d.unit as string,
    stock: Number(d.stock),
    min_stock: Number(d.min_stock),
    reorder_per_group: d.reorder_per_group === null ? null : Number(d.reorder_per_group),
    reorder_groups: d.reorder_groups === null ? null : Number(d.reorder_groups),
    min_stock_source: d.min_stock_source as string,
    min_stock_auto_basis: (d.min_stock_auto_basis as string | null) ?? null,
  };
}
async function teacherRpc(f: Fx, fn: string, args: Record<string, unknown>): Promise<void> {
  const res = await (await clientFor(f.teacher)).rpc(fn, args);
  expect(res.error, `준비: 교사 ${fn} (${res.error?.code} ${res.error?.message})`).toBeNull();
}
/** 준비(service role): 재고만 낮춘다 — 입고 근거 자동 기준보다 적은 재고(사용 기록 없이)는 함수로 만들 수 없다 */
async function lowerStock(id: string, stock: number): Promise<void> {
  const r = await service().from("reagents").update({ stock }).eq("id", id).select("id");
  expect(r.error, `준비: 재고 낮추기 (${r.error?.message})`).toBeNull();
  expect(r.data ?? []).toHaveLength(1);
}
/** 준비(service role): 그 시약의 입고 기록을 지운다 — 계산할 기록이 없는 자동 0 */
async function dropIntakeLogs(id: string): Promise<void> {
  const r = await service().from("intake_logs").delete().eq("reagent_id", id);
  expect(r.error, `준비: 입고 기록 지우기 (${r.error?.message})`).toBeNull();
}

test(`[C1][S3] 기대값 원본: d7 §18 캡션("${USAGE_CAPTION}" · "${INTAKE_CAPTION}") · 시안 1.17 3·6 배지(바탕 ${BADGE3.fills[0]} · 글자 ${BADGE3_LABEL.fills[0]} · pill) · 6 새 창 안내 줄 · 8·9 시트 · 5 연결 줄`, () => {
  expect(CAPTIONS.length, "§18 굵은 따옴표 캡션 2개").toBe(2);
  expect(USAGE_CAPTION).toBe(CAPTION3.text!.characters);
  expect(USAGE_CAPTION, "시안 6 캡션도 같다").toBe(CAPTION6.text!.characters);
  expect(INTAKE_CAPTION).toMatch(/입고량의 \d+%/);
  expect(S18_AUTO, "값 0 은 §11-1 그대로").toContain(`"${NONE_TEXT}"`);
  expect([AUTO_LABEL, BADGE3_LABEL.text!.characters, BADGE6_LABEL.text!.characters], "배지 글자").toEqual(["자동", "자동", "자동"]);
  expect(BADGE3.cornerRadius, "pill").toBe(9999);
  for (const c of [BADGE3.fills[0], BADGE3_LABEL.fills[0], BADGE6.fills[0], BADGE6_LABEL.fills[0]].map(rgb)) {
    expect(PINK, `배지 색 ${c} 은 핑크 아님`).not.toContain(c);
    expect(SKY, `배지 색 ${c} 은 하늘색 아님`).not.toContain(c);
  }
  expect(MANUAL_TEXT, "§11-1 직접 입력 문구").toBe("직접 입력");
  expect([NEW_WINDOW_NOTE, NEW_WINDOW_ACTION]).toEqual(["사이트를 새 창으로 열었어요. 열리지 않았다면", DIRECT_OPEN]);
  expect([S8_TITLE, S8_FRAME_CANCEL], "시안 8 삭제 확인").toEqual([CONFIRM_TITLE, S8_CANCEL]);
  expect(S8_BODY, "시안 8 본문 = {이름} · 사용·입고 기록은 남아요").toBe(deleteBodyText("박OO"));
  expect(S8_DELETE, "시안 8 버튼 = {이름} 삭제").toBe(deleteButtonLabel("박OO"));
  expect([S9_HELPER, S9_CANCEL, S9_SAVE]).toEqual(["우리 학교에서만 보여요", CANCEL_BUTTON, SAVE_BUTTON]);
  expect(S9_FIELDS, "시안 9 입력 칸 = 판매처명·연락처·웹사이트 주소 (부가 정보 없음)").toEqual([FIELD_NAME, FIELD_CONTACT, FIELD_WEBSITE]);
  expect([LINK_LABEL5, DELETE5]).toEqual(["우리 학교 시약", "삭제"]);
  expect(MERGE5.text!.characters).toBe("2개 행을 합쳤어요");
  for (const t of THRESHOLD_NOTES5) expect(t, "시안 5 기존 기준 줄").toMatch(/^기존 기준 \S+ · (그대로 둬요|바뀌어요|새로 정해요)$/);
  expect(UNITS, "d7 §13 단위").toEqual(["병", "mL", "g"]);
});

test(`[C1][S6] 기대값 원본 (디자인 1.21 맞춤): d7 §11 카드 수량 줄 "${NEED} {min_stock}{unit} / ${STOCK_WORD} {stock}{unit}" = rules.json reorder.card_text '${NEED} N{단위}'`, () => {
  expect(NEED).toBe("재주문 기준");
  expect(STOCK_WORD).toBe("현재 재고");
  const card = (rules as unknown as { reorder: { card_text: string } }).reorder.card_text;
  expect(card, "rules.json reorder.card_text 수량 앞말").toContain(`'${NEED} N{단위}'`);
  expect(card, "rules.json reorder.card_text 날짜 모양").toContain("'10월 7일 알림'");
});

test(`[C1][S8] 기대값 원본 (디자인 1.21 맞춤): rules.json app_exceptions sheet-close "초대는 이메일 + 역할(${INVITE_ROLE_ORDER.map((r) => ROLE_TEXT[r]).join("·")}) 고르기" · user-count-line "학생 a · 교사 b · admin c" = d7 §18 화면 8`, () => {
  const sheet = APP_EXC["sheet-close"];
  const roles = /초대는 이메일 \+ 역할\(([^)]+)\) 고르기/.exec(sheet)?.[1] ?? "";
  expect(roles.split("·"), "rules 초대 역할 = 학생·교사 (admin 없음)").toEqual(INVITE_ROLE_ORDER.map((r) => ROLE_TEXT[r]));
  expect(sheet, "초대 시트 이름 칸 없음").toContain("이름 칸 없음");
  expect(APP_EXC["user-count-line"], "rules 8 머리 인원 줄").toContain("'학생 a · 교사 b · admin c'");
  const r8 = S18_ROWS_8.find((l) => /1\.21/.test(l)) ?? "";
  expect(r8, "d7 §18 화면 8 (1.21) 행").not.toBe("");
  expect(r8, "d7 §18 화면 8 머리 유지").toContain(`"학생 a · 교사 b · admin c" 유지`);
  expect(r8, "d7 §18 화면 8 초대 = 이메일 + 역할").toContain(`초대 = 이메일 + 역할(${INVITE_ROLE_ORDER.map((r) => ROLE_TEXT[r]).join("·")})`);
});

test(`[C1][S9] 기대값 원본 (디자인 1.21 맞춤): rules.json sheet-close "판매처 행은 이름 + 연락처만(웹사이트 주소 표시 안 함)" · "부가 정보 칸 없음" = d7 §18 화면 9 (등록·수정 폼에는 웹사이트 칸 유지)`, () => {
  const sheet = APP_EXC["sheet-close"];
  expect(sheet).toContain("판매처 행은 이름 + 연락처만(웹사이트 주소 표시 안 함)");
  expect(sheet).toContain("9 부가 정보 칸 없음");
  expect(S18_ROW_9, "d7 §18 화면 9 행 = 이름 + 연락처만").toContain("목록 행은 이름 + 연락처만");
  expect(S18_ROW_9, "d7 §18 화면 9 폼 웹사이트 칸 유지").toContain("등록·수정 폼에는 웹사이트 칸 유지");
  expect(S9_FIELDS, "시안 9 폼 칸에 웹사이트 주소").toContain(FIELD_WEBSITE);
});

// =====================================================================
// 화면 3 — auto-threshold-badge + 캡션
// =====================================================================

test(`[C1][S3] 일회용 학교 교사 시약 상세 reorder-threshold (d7 §18): 자동(사용) ${AUTO_BADGE} "${AUTO_LABEL}" + "${USAGE_CAPTION}" · 자동(입고) + "${INTAKE_CAPTION}" · 자동 0 = 배지 + "${NONE_TEXT}"(캡션 없음) · 매뉴얼 근거·직접 입력은 배지 0(근거 줄 그대로) · 배지 = 시안 3 회색 pill · 핑크·하늘색 0`, async ({ browser }, info) => {
  const f = await fresh(info);
  const usage = await prepBare(f, "사용", 10);
  await teacherRpc(f, "record_usage", { reagent_id: usage.id, amount: 6 });
  const intake = await prepBare(f, "입고", 10);
  const zero = await prepBare(f, "영", 10);
  await dropIntakeLogs(zero.id);
  await teacherRpc(f, "set_reorder_threshold", { p_reagent_id: zero.id, p_min_stock: 4 });
  await teacherRpc(f, "reset_reorder_threshold", { p_reagent_id: zero.id });
  const basis = await prepBare(f, "근거", 30);
  await teacherRpc(f, "save_reorder_basis", { p_items: [{ reagent_id: basis.id, per_group: 10, groups: 6 }] });
  const manual = await prepBare(f, "직접", 10);
  await teacherRpc(f, "set_reorder_threshold", { p_reagent_id: manual.id, p_min_stock: 5 });
  const s = {
    usage: await bySession(f, usage.id),
    intake: await bySession(f, intake.id),
    zero: await bySession(f, zero.id),
    basis: await bySession(f, basis.id),
    manual: await bySession(f, manual.id),
  };
  expect([s.usage.min_stock_source, s.usage.min_stock_auto_basis], "대조: 자동(사용)").toEqual(["auto", "usage"]);
  expect([s.intake.min_stock_source, s.intake.min_stock_auto_basis], "대조: 자동(입고)").toEqual(["auto", "intake"]);
  expect([s.zero.min_stock_source, s.zero.min_stock], "대조: 자동 0").toEqual(["auto", 0]);
  expect(s.basis.min_stock_source).toBe("basis");
  expect(s.manual.min_stock_source).toBe("manual");
  const want: Record<keyof typeof s, { badge: boolean; caption: string | null }> = {
    usage: { badge: true, caption: USAGE_CAPTION },
    intake: { badge: true, caption: INTAKE_CAPTION },
    zero: { badge: true, caption: null },
    basis: { badge: false, caption: `1반 1회 실험량 10 ${s.basis.unit} × 6조 기준` },
    manual: { badge: false, caption: MANUAL_TEXT },
  };

  const { context, page, viewport } = await openTemp(browser, info, f.teacher, detailPath(s.usage.id));
  try {
    for (const k of Object.keys(s) as (keyof typeof s)[]) {
      if (k !== "usage") await page.goto(detailPath(s[k].id));
      await waitDetail(page);
      const row = page.locator(`main ${sel("reorder-threshold")}`);
      await expect(row, `${k}: reorder-threshold 1`).toHaveCount(1);
      const badge = row.locator(sel(AUTO_BADGE));
      const caption = row.getByTestId("reorder-threshold-source");
      if (want[k].badge) {
        await expect(badge, `${viewport} ${k}: ${AUTO_BADGE} 1`).toHaveCount(1);
        await expect(badge).toHaveText(exact(AUTO_LABEL));
        expect(await css(badge, "background-color"), `${k}: 배지 바탕 = 시안 ${BADGE3.fills[0]}`).toBe(rgb(BADGE3.fills[0]));
        expect(await css(badge, "color"), `${k}: 배지 글자 = 시안 ${BADGE3_LABEL.fills[0]}`).toBe(rgb(BADGE3_LABEL.fills[0]));
        const b = await boxOf(badge);
        expect(parseFloat(await css(badge, "border-top-left-radius")), `${k}: pill`).toBeGreaterThanOrEqual(b.height / 2 - 0.5);
        await expectNoPinkSky(badge, `${k} 배지`);
        // 배지는 값 옆 (같은 줄, 값 오른쪽)
        const value = row.getByText(k === "zero" ? NONE_TEXT : new RegExp(`^\\s*${s[k].min_stock}\\s*${esc(s[k].unit)}\\s*$`)).first();
        const vb = await boxOf(value);
        expect(b.left, `${k}: 배지는 값 오른쪽`).toBeGreaterThanOrEqual(vb.right - 0.5);
        expect(Math.abs(b.top + b.height / 2 - (vb.top + vb.height / 2)), `${k}: 배지·값 한 줄`).toBeLessThan(vb.height);
      } else {
        await expect(badge, `${viewport} ${k}: 자동이 아니면 ${AUTO_BADGE} 0`).toHaveCount(0);
      }
      if (want[k].caption === null) {
        await expect(caption, `${k}: 캡션 없음 (값 자리에 "${NONE_TEXT}")`).toHaveCount(0);
        await expect(row.getByText(exact(NONE_TEXT)), `${k}: "${NONE_TEXT}"`).toHaveCount(1);
      } else {
        await expect(caption, `${k}: 캡션 "${want[k].caption}"`).toHaveText(exact(want[k].caption!));
        await expectNoPinkSky(caption, `${k} 캡션`);
        if (want[k].badge) {
          expect(await css(caption, "color"), `${k}: 캡션 글자 = 시안 ${CAPTION3.fills[0]}`).toBe(rgb(CAPTION3.fills[0]));
          expect((await boxOf(caption)).top, `${k}: 캡션은 배지 아래 줄`).toBeGreaterThanOrEqual((await boxOf(badge)).bottom - 1);
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${k}: 가로 스크롤 없음`).toBe(true);
    }
    // 학생도 같은 표시 (읽기만)
  } finally {
    await context.close();
  }
  const st = await openTemp(browser, info, f.student, detailPath(s.intake.id));
  try {
    await waitDetail(st.page);
    const row = st.page.locator(`main ${sel("reorder-threshold")}`);
    await expect(row.locator(sel(AUTO_BADGE)), "학생: 자동(입고) 배지").toHaveCount(1);
    await expect(row.getByTestId("reorder-threshold-source"), "학생: 같은 캡션").toHaveText(exact(INTAKE_CAPTION));
    expect(await countComponent(st.page, "threshold-edit"), "학생 threshold-edit 0 (R5)").toBe(0);
  } finally {
    await st.context.close();
  }
});

// =====================================================================
// 화면 6 — 알림 카드 배지·캡션
// =====================================================================

test(`[C1][S6] 일회용 학교 교사 재주문 알림 카드 (d7 §18): 자동 기준 카드 = 수량 줄 "${NEED} Nu [${AUTO_LABEL}] / ${STOCK_WORD} Mu"(d7 §11 1.21 · 배지는 두 조각 사이·한 줄) + 그 아래 캡션("${USAGE_CAPTION}"/"${INTAKE_CAPTION}", 시안 6 회색) · 배지 = 시안 6(바탕 ${BADGE6.fills[0]}·테두리 ${BADGE6.strokes[0]}) · 직접 입력 카드는 배지·캡션 0 · 핑크는 badge-low-stock 에만`, async ({ browser }, info) => {
  const f = await fresh(info);
  const usage = await prepBare(f, "사용", 10);
  await teacherRpc(f, "record_usage", { reagent_id: usage.id, amount: 9 });
  const intake = await prepBare(f, "입고", 100);
  await lowerStock(intake.id, 5);
  const manual = await prepBare(f, "직접", 7);
  await teacherRpc(f, "set_reorder_threshold", { p_reagent_id: manual.id, p_min_stock: 9 });
  const db = { usage: await bySession(f, usage.id), intake: await bySession(f, intake.id), manual: await bySession(f, manual.id) };
  for (const r of Object.values(db)) expect(r.stock < r.min_stock, `대조: ${r.name} 부족`).toBe(true);
  expect([db.usage.min_stock_auto_basis, db.intake.min_stock_auto_basis, db.manual.min_stock_source]).toEqual(["usage", "intake", "manual"]);

  const { context, page, viewport } = await openTemp(browser, info, f.teacher, REORDER_HREF);
  try {
    await waitReorder(page);
    const shown = await readAlerts(page);
    expect(shown.map((c) => c.name).sort(), "알림 카드 3").toEqual(Object.values(db).map((r) => r.name).sort());
    for (const [k, cap] of [["usage", USAGE_CAPTION], ["intake", INTAKE_CAPTION]] as const) {
      const r = db[k];
      const card = cardOf(page, r.name);
      const badge = card.locator(sel(AUTO_BADGE));
      await expect(badge, `${viewport} ${k}: ${AUTO_BADGE} 1`).toHaveCount(1);
      await expect(badge).toHaveText(exact(AUTO_LABEL));
      expect(await css(badge, "background-color"), `${k}: 배지 바탕 = 시안 6`).toBe(rgb(BADGE6.fills[0]));
      expect(await css(badge, "color"), `${k}: 배지 글자 = 시안 6`).toBe(rgb(BADGE6_LABEL.fills[0]));
      expect(await css(badge, "border-top-color"), `${k}: 배지 테두리 = 시안 6`).toBe(rgb(BADGE6.strokes[0]));
      await expectNoPinkSky(badge, `${k} 카드 배지`);
      const need = card.getByText(exact(`${NEED} ${r.min_stock}${r.unit}`));
      const stock = card.getByText(exact(`/ ${STOCK_WORD} ${r.stock}${r.unit}`));
      await expect(need, `${k}: "${NEED} ${r.min_stock}${r.unit}"`).toHaveCount(1);
      await expect(stock, `${k}: "/ ${STOCK_WORD} ${r.stock}${r.unit}"`).toHaveCount(1);
      const [nb, bb, sb] = [await boxOf(need), await boxOf(badge), await boxOf(stock)];
      expect(bb.left, `${k}: 배지는 재주문 기준 오른쪽`).toBeGreaterThanOrEqual(nb.right - 0.5);
      expect(sb.left, `${k}: 재고는 배지 오른쪽`).toBeGreaterThanOrEqual(bb.right - 0.5);
      for (const x of [bb, sb]) expect(Math.abs(x.top + x.height / 2 - (nb.top + nb.height / 2)), `${k}: 수량 줄 한 줄`).toBeLessThan(nb.height);
      const caption = card.getByText(exact(cap));
      await expect(caption, `${k}: 캡션 "${cap}"`).toHaveCount(1);
      expect((await boxOf(caption)).top, `${k}: 캡션은 수량 줄 아래`).toBeGreaterThanOrEqual(nb.bottom - 1);
      expect(await css(caption, "color"), `${k}: 캡션 글자 = 시안 6 ${CAPTION6.fills[0]}`).toBe(rgb(CAPTION6.fills[0]));
      await expectNoPinkSky(caption, `${k} 캡션`);
    }
    const plain = cardOf(page, db.manual.name);
    await expect(plain.locator(sel(AUTO_BADGE)), "직접 입력 카드: 배지 0").toHaveCount(0);
    for (const cap of [USAGE_CAPTION, INTAKE_CAPTION]) await expect(plain.getByText(exact(cap)), `직접 입력 카드: "${cap}" 없음`).toHaveCount(0);
    await expect(plain.getByText(exact(`${NEED} ${db.manual.min_stock}${db.manual.unit} / ${STOCK_WORD} ${db.manual.stock}${db.manual.unit}`)), "직접 입력 카드 수량 줄 그대로 (d7 §11 1.21)").toHaveCount(1);
    await expect(plain.getByText(exact(`재주문 기준 ${db.manual.min_stock} ${db.manual.unit}`)), "직접 입력 카드 기준 문구 (d7 §11 두 번째 형태)").toHaveCount(1);
    await expect(page.locator("main").getByText(/필요량 \d/), "옛 앞말 \"필요량 N\" 없음").toHaveCount(0);
    // 핑크는 badge-low-stock 밖에 없다 (자동 배지 포함)
    const pinkOutside = await page.locator("main").evaluate((root, pink) => {
      const out: string[] = [];
      for (const e of Array.from(root.querySelectorAll("*"))) {
        if (e.closest('[data-component="badge-low-stock"]')) continue;
        const cs = getComputedStyle(e);
        if (pink.includes(cs.backgroundColor) || pink.includes(cs.color)) out.push(`${e.tagName}.${e.getAttribute("data-component") ?? ""}`);
      }
      return out;
    }, PINK);
    expect(pinkOutside, "badge-low-stock 밖 핑크").toEqual([]);
  } finally {
    await context.close();
  }
});

// =====================================================================
// 화면 6 — 새 창 안내 줄 · 직접 열기
// =====================================================================

test(`[C1][S6] 일회용 학교 교사: 판매처 "확인" → 새 창 + 그 카드 안 vendor-link 아래 안내 줄(role=status · 바깥 링크 아이콘 · "{판매처} ${NEW_WINDOW_NOTE}" 회색 · ${PILL_SOFT} "${DIRECT_OPEN}" 링크 = 같은 주소·새 창·noopener·누름 높이 ≥ ${MIN_H}) · 다른 카드에는 없음 · "${DIRECT_OPEN}" 을 누르면 같은 주소의 새 창`, async ({ browser }, info) => {
  const f = await fresh(info);
  const a = await prepBare(f, "가", 2);
  await teacherRpc(f, "set_reorder_threshold", { p_reagent_id: a.id, p_min_stock: 10 });
  const b = await prepBare(f, "나", 2);
  await teacherRpc(f, "set_reorder_threshold", { p_reagent_id: b.id, p_min_stock: 10 });
  const site = fakeSite("nw");
  const vendor = await prepVendor(f, { name: `새창 판매처-${hex()}`, website: site });

  const { context, page, viewport } = await openTemp(browser, info, f.teacher, REORDER_HREF);
  const stub = await stubExternal(context, info);
  try {
    await waitReorder(page);
    const card = cardOf(page, a.name);
    const other = cardOf(page, b.name);
    await expect(card.getByRole("status"), "확인 전 안내 줄 없음").toHaveCount(0);
    await openLinkModal(page, card);
    await pickVendor(page, vendor.name);
    const [popup] = await Promise.all([context.waitForEvent("page", { timeout: 20_000 }), confirmButton(page).click()]);
    await popup.waitForURL((u) => u.href !== "about:blank", { timeout: 20_000 });
    expect(popup.url(), "새 창 = 판매처 웹사이트").toBe(new URL(site).href);
    await popup.close();
    await expect(linkDialog(page), "확인 뒤 모달 닫힘").toHaveCount(0);

    const note = card.getByRole("status").filter({ has: page.getByRole("link", { name: exact(DIRECT_OPEN) }) });
    await expect(note, `${viewport}: 그 카드 안 안내 줄 1`).toHaveCount(1);
    await expect(other.getByRole("status"), "다른 카드에는 안내 줄 없음").toHaveCount(0);
    expect(squash(await note.innerText()), "안내 줄 문구").toBe(`${vendor.name} ${NEW_WINDOW_NOTE} ${DIRECT_OPEN}`);
    const text = note.getByText(new RegExp(`${esc(NEW_WINDOW_NOTE)}$`));
    expect(await css(text, "color"), `안내 글자 = 시안 ${NEW_WINDOW_NOTE_FILL}`).toBe(rgb(NEW_WINDOW_NOTE_FILL));
    expect(await note.locator("svg").count(), "바깥 링크 아이콘").toBeGreaterThanOrEqual(1);
    const direct = note.getByRole("link", { name: exact(DIRECT_OPEN) });
    await expect(direct.locator(`xpath=ancestor-or-self::*[@data-component="${PILL_SOFT}"]`), `"${DIRECT_OPEN}" 은 ${PILL_SOFT}`).toHaveCount(1);
    expect(new URL((await direct.getAttribute("href"))!).href, `"${DIRECT_OPEN}" href = 새 창 주소`).toBe(new URL(site).href);
    await expect(direct).toHaveAttribute("target", "_blank");
    expect(((await direct.getAttribute("rel")) ?? "").split(/\s+/), "rel noopener").toContain("noopener");
    expect((await boxOf(direct)).height, `누름 높이 ≥ ${MIN_H}`).toBeGreaterThanOrEqual(MIN_H);
    expect(await onTop(direct), `"${DIRECT_OPEN}" 이 가려지지 않음`).toBe(true);
    await expectNoPinkSky(note, "안내 줄");
    // 위치: vendor-link 아래 (같은 카드)
    const lb = await boxOf(card.locator(sel("vendor-link")));
    expect((await boxOf(note)).top, "안내 줄은 vendor-link 아래").toBeGreaterThanOrEqual(lb.bottom - 1);
    // 직접 열기 → 같은 주소 새 창
    const [again] = await Promise.all([context.waitForEvent("page", { timeout: 20_000 }), direct.click()]);
    await again.waitForURL((u) => u.href !== "about:blank", { timeout: 20_000 });
    expect(again.url(), `"${DIRECT_OPEN}" 새 창 = 같은 주소`).toBe(new URL(site).href);
    await again.close();
    expect(new URL(page.url()).pathname, "화면은 그대로").toBe(REORDER_HREF);
    expect(stub.hits().every((u) => new URL(u).host === new URL(site).host), "고른 판매처 밖 주소 요청 0").toBe(true);
  } finally {
    await context.close();
  }
});

// =====================================================================
// 화면 8 — 삭제 확인 시트 · 초대 시트
// =====================================================================

test(`[C1][S8] 일회용 학교 admin 사용자 삭제 확인 시트 (시안 1.17 8 · d7 §18): 제목 "${CONFIRM_TITLE}" + 오른쪽 위 × 닫기 · 본문 "{이름} · 사용·입고 기록은 남아요" · button-outline "${S8_CANCEL}" + button-primary "{이름} 삭제" 한 줄 · × 를 누르면 시트가 닫히고 아무것도 지워지지 않음 · "{이름} 삭제" → 삭제`, async ({ browser }, info) => {
  const f = await fresh(info);
  const m = await addMember(f.school, info, GROUP, "삭제확인");
  const { context, page } = await openTemp(browser, info, f.admin);
  try {
    await waitUsers(page);
    await s8OutlineIn(await openRoleSheet(page, m.name), DELETE_USER_BUTTON).click();
    const dlg = confirmDialog(page);
    await expect(dlg, "삭제 확인 시트").toBeVisible();
    const title = dlg.getByRole("heading", { name: exact(CONFIRM_TITLE) });
    const close = dlg.getByRole("button", { name: "닫기", exact: true });
    await expect(close, "× 닫기 1").toHaveCount(1);
    const [tb, cb] = [await boxOf(title), await boxOf(close)];
    expect(cb.left, "× 는 제목 오른쪽").toBeGreaterThan(tb.right);
    expect(cb.top, "× 는 위쪽 (본문보다 위)").toBeLessThan((await boxOf(dlg.getByText(exact(deleteBodyText(m.name))))).top);
    expect(cb.height, `× 누름 높이 ≥ ${MIN_H}`).toBeGreaterThanOrEqual(MIN_H);
    await expect(dlg.getByText(exact(deleteBodyText(m.name))), "본문").toBeVisible();
    const cancel = s8OutlineIn(dlg, S8_CANCEL);
    const del = s8PrimaryIn(dlg, deleteButtonLabel(m.name));
    await expect(cancel).toHaveCount(1);
    await expect(del, `"${deleteButtonLabel(m.name)}"`).toHaveCount(1);
    await expect(dlg.locator(sel("button-primary")), "button-primary 는 하나").toHaveCount(1);
    const [xb, db] = [await boxOf(cancel), await boxOf(del)];
    expect(Math.abs(xb.top - db.top), "취소·삭제 한 줄").toBeLessThan(2);
    expect(xb.right, "취소가 왼쪽").toBeLessThanOrEqual(db.left + 0.5);
    await expectNoPinkSky(dlg, "삭제 확인 시트");

    // × → 닫힘 (역할 시트로도 가지 않는다), 아무것도 지워지지 않는다
    await close.click();
    await expect(confirmDialog(page), "× 로 닫힘").toHaveCount(0);
    await expect(roleDialog(page, m.name), "× 는 시트를 모두 닫는다").toHaveCount(0);
    expect(await profileByService(m.id), "× : 프로필 그대로").not.toBeNull();
    await expect(memberRow(page, m.name)).toHaveCount(1);

    // 다시 열어 "{이름} 삭제"
    await s8OutlineIn(await openRoleSheet(page, m.name), DELETE_USER_BUTTON).click();
    await s8PrimaryIn(confirmDialog(page), deleteButtonLabel(m.name)).click();
    await expect(memberRow(page, m.name), "목록에서 사라짐").toHaveCount(0, { timeout: SAVE_TIMEOUT });
    await expect.poll(() => profileByService(m.id), { timeout: SAVE_TIMEOUT }).toBeNull();
  } finally {
    await context.close();
  }
});

test(`[C1][S8] 일회용 학교 admin 초대 시트: 역할 고르기(${INVITE_ROLE_ORDER.map((r) => ROLE_TEXT[r]).join("·")}, admin 없음) 유지 — 사용자 결정 2026-10-07(d7 §18·§8 우선) · 오른쪽 위 × 닫기 · × 로 닫으면 초대 0건`, async ({ browser }, info) => {
  const f = await fresh(info);
  const { context, page } = await openTemp(browser, info, f.admin);
  try {
    await waitUsers(page);
    const dlg = await openInviteSheet(page);
    const seg = dlg.locator(sel("segmented-control"));
    await expect(seg, "역할 고르기 segmented-control 1").toHaveCount(1);
    for (const r of INVITE_ROLE_ORDER) await expect(seg.getByText(exact(ROLE_TEXT[r])), `역할 "${ROLE_TEXT[r]}"`).toHaveCount(1);
    await expect(seg.getByText(exact(ROLE_TEXT.admin)), "초대 역할에 admin 없음 (d7 §8)").toHaveCount(0);
    await seg.getByText(exact(ROLE_TEXT.teacher)).click();
    await expect(seg.locator(sel("segmented-control-active")), "고른 역할만 활성").toHaveText(exact(ROLE_TEXT.teacher));
    const close = dlg.getByRole("button", { name: "닫기", exact: true });
    await expect(close, "× 닫기 1").toHaveCount(1);
    expect((await boxOf(close)).height, `× 누름 높이 ≥ ${MIN_H}`).toBeGreaterThanOrEqual(MIN_H);
    await close.click();
    await expect(inviteDialog(page), "× 로 닫힘").toHaveCount(0);
    const inv = await service().from("invites").select("id").eq("school_id", f.school.id);
    expect(inv.data ?? [], "초대 0건").toEqual([]);
  } finally {
    await context.close();
  }
});

// =====================================================================
// 화면 9 — 등록·수정 폼
// =====================================================================

test(`[C1][S9] 일회용 학교 admin 판매처 폼 (시안 1.17 9 · d7 §18): 등록 = 제목 + × 닫기 + "${S9_HELPER}" + ${S9_FIELDS.join("·")} (부가 정보 칸 없음) + "${S9_CANCEL}"·"${S9_SAVE}" · ×·취소는 저장 없이 닫음 · 모바일 tab-bar 위 하단 시트 / 데스크톱 가운데 카드(폭 ${S9_DESKTOP_W}) · 수정 저장해도 기존 note 는 DB 에 그대로 · 목록 행 = 판매처명 + 연락처만`, async ({ browser }, info) => {
  const f = await fresh(info);
  const v = await prepVendor(f, { name: `노트 판매처-${hex()}`, contact: "043-555-0101", note: "시약·실험 기구", website: fakeSite("nt") });
  const plain = await prepVendor(f, { name: `연락처없음-${hex()}`, contact: null, note: "소모품" });
  const { context, page, viewport } = await openTemp(browser, info, f.admin, VENDORS_HREF);
  try {
    await waitVendors(page);
    // 행 = 판매처명 + 연락처만 (note·웹사이트 없음)
    expect((await readVendorRows(page)).sort(), "행 = 판매처명 + 연락처 (연락처 없으면 이름만)").toEqual([[v.name, v.contact!], [plain.name]].sort());
    for (const x of [v, plain]) {
      const t = await vendorRow(page, x.name).innerText();
      expect(t, `${x.name}: note 안 보임`).not.toContain(x.note!);
      if (x.website) expect(t, `${x.name}: 웹사이트 안 보임`).not.toContain(new URL(x.website).host);
    }

    // 등록 폼 구성
    await openCreateForm(page);
    const form = registerBlock(page).locator("form");
    await expect(form, "폼 1").toHaveCount(1);
    const close = form.getByRole("button", { name: "닫기", exact: true });
    await expect(close, "× 닫기 1").toHaveCount(1);
    expect((await boxOf(close)).height, `× 누름 높이 ≥ ${MIN_H}`).toBeGreaterThanOrEqual(MIN_H);
    await expect(form.getByText(exact(S9_HELPER)), `안내 "${S9_HELPER}"`).toBeVisible();
    for (const label of S9_FIELDS) await expect(fieldInput(page, label), `"${label}" 칸`).toHaveCount(1);
    await expect(form.locator("input:not([type=hidden]), textarea"), "입력 칸 = 시안 3개 (부가 정보 없음)").toHaveCount(S9_FIELDS.length);
    await expect(form.getByLabel(/부가 정보/), "부가 정보 칸 없음").toHaveCount(0);
    const cancel = form.locator(sel("button-outline")).filter({ hasText: exact(S9_CANCEL) });
    await expect(cancel, `"${S9_CANCEL}"`).toHaveCount(1);
    const [cb, sb] = [await boxOf(cancel), await boxOf(saveButton(page))];
    expect(Math.abs(cb.top - sb.top), "취소·저장 한 줄").toBeLessThan(2);
    expect(cb.right, "취소가 왼쪽").toBeLessThanOrEqual(sb.left + 0.5);
    const vp = page.viewportSize()!;
    // 시트·카드 = 폼에서 위로 올라가며 처음 만나는 바탕색이 있는 상자 (폼 자신 포함)
    const fb = await form.evaluate((el) => {
      let cur: Element | null = el;
      while (cur && getComputedStyle(cur).backgroundColor === "rgba(0, 0, 0, 0)") cur = cur.parentElement;
      const r = (cur ?? el).getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    });
    if (viewport === "mobile") {
      const top = await tabBarTop(page);
      expect(fb.bottom, "모바일: 시트 아래 끝 ≤ tab-bar 위쪽 선").toBeLessThanOrEqual(top + 0.5);
      expect(top - fb.bottom, "모바일: 시트는 tab-bar 바로 위").toBeLessThanOrEqual(1.5);
      expect(Math.abs(top - sb.bottom - S9_SHEET_PAD[2]), `모바일: 저장 아래 = 시안 시트 아래 여백 ${S9_SHEET_PAD[2]}`).toBeLessThanOrEqual(1.5);
      expect(Math.round(fb.width), "모바일: 시트 전폭").toBe(vp.width);
    } else {
      expect(Math.abs(fb.width - S9_DESKTOP_W), `데스크톱: 카드 폭 = 시안 ${S9_DESKTOP_W}`).toBeLessThanOrEqual(1);
      expect(Math.abs(fb.left + fb.width / 2 - vp.width / 2), "데스크톱: 가운데").toBeLessThanOrEqual(2);
      expect(fb.top, "데스크톱: 화면 안").toBeGreaterThanOrEqual(0);
      expect(fb.bottom, "데스크톱: 화면 안").toBeLessThanOrEqual(vp.height + 0.5);
    }
    // 하늘색은 폼 안에서 허용(아이콘·포커스) — rules.json highlight.forbidden_within 인 button-primary 안에만 없어야 한다
    expect((await paints(form)).filter((c) => PINK.includes(c)), "폼: 핑크 없음").toEqual([]);
    expect((await paints(saveButton(page))).filter((c) => SKY.includes(c)), "저장(button-primary): 하늘색 없음").toEqual([]);

    // × · 취소: 저장 없이 닫힘
    await fieldInput(page, FIELD_NAME).fill(`닫힐 판매처-${hex()}`);
    await close.click();
    await expect(fieldInput(page, FIELD_NAME), "× 로 닫힘").toHaveCount(0);
    await openCreateForm(page);
    await expect(fieldInput(page, FIELD_NAME), "다시 열면 빈 값").toHaveValue("");
    await fieldInput(page, FIELD_NAME).fill(`취소할 판매처-${hex()}`);
    await registerBlock(page).locator("form").locator(sel("button-outline")).filter({ hasText: exact(S9_CANCEL) }).click();
    await expect(fieldInput(page, FIELD_NAME), "취소로 닫힘").toHaveCount(0);
    expect((await vendorsBySchool(f.school.id)).map((x) => x.id).sort(), "×·취소: DB 그대로").toEqual([v.id, plain.id].sort());

    // 수정: 연락처만 바꿔 저장 → note 그대로
    await chooseRowMenu(page, v.name, "수정");
    await expect(fieldInput(page, FIELD_CONTACT)).toHaveValue(v.contact!);
    await expect(fieldInput(page, FIELD_WEBSITE), "수정 폼 웹사이트 칸 = 기존 값 (d7 §18 1.21: 폼에는 웹사이트 칸 유지)").toHaveValue(v.website!);
    await expect(registerBlock(page).locator("form").getByLabel(/부가 정보/), "수정 폼에도 부가 정보 칸 없음").toHaveCount(0);
    await fieldInput(page, FIELD_CONTACT).fill("043-555-0202");
    await saveButton(page).click();
    await expect(page.locator(sel("ex-toast")).filter({ hasText: "판매처를 저장했어요" }), "저장 토스트").toBeVisible({ timeout: SAVE_TIMEOUT });
    await expect.poll(async () => (await vendorsBySchool(f.school.id)).find((x) => x.id === v.id)?.contact, { timeout: SAVE_TIMEOUT }).toBe("043-555-0202");
    const after = (await vendorsBySchool(f.school.id)).find((x) => x.id === v.id)!;
    expect(after.note, "DB note 그대로 (폼에 칸이 없다)").toBe(v.note);
    expect(after.website, "웹사이트 그대로").toBe(v.website);
    expect((await readVendorRows(page)).find((r) => r[0] === v.name), "행 = 이름 + 새 연락처").toEqual([v.name, "043-555-0202"]);
  } finally {
    await context.close();
  }
});

// =====================================================================
// 화면 5 — 추출 행 배치 (연결 줄 · 단위 선택 상자 · 합치기 줄)
// =====================================================================

test(`[C1][S5] 일회용 학교 교사 추출 행 (시안 1.17 5 · d7 §18): 행마다 아래 연결 줄 = "${LINK_LABEL5}" 선택(상자 안 라벨) · "${DELETE5}" · 기존 기준 줄("기존 기준 N · 그대로 둬요/바뀌어요") · 단위 = 선택 상자(${UNITS.join("·")}) · 같은 시약 2행 → "${MERGE5.text!.characters}" 무채색 줄(아이콘) · 조 수 기본값 빈 값 · 저장 요청 0`, async ({ browser }, info) => {
  const f = await fresh(info);
  const grow = await prepNamed(f, { name: "염산(0.1 M)", unit: "mL", stock: 100, min: 50 });
  const keep = await prepNamed(f, { name: "수산화 나트륨", unit: "g", stock: 100, min: 30 });
  const items: FakeItem[] = [
    { name: "염산", amount: 10, unit: "mL" },
    { name: "염산", amount: 10, unit: "mL" },
    { name: "수산화나트륨", amount: 5, unit: "g" },
  ];
  const { context, page } = await openTemp(browser, info, f.teacher, MANUAL_HREF);
  const saves = await blockSaves(context);
  try {
    await waitManual(page);
    await expect(page.locator("main").getByLabel("조 수", { exact: true }), "조 수 기본값 빈 값").toHaveValue("");
    await mockExtract(page, okReply(items));
    await toResult(page, "매뉴얼.pdf", 4);
    const rows = await readRows(page);
    expect(rows.map((r) => r.cells.slice(0, 3)), "합친 뒤 2행").toEqual([["염산", "20", "mL"], ["수산화나트륨", "5", "g"]]);
    expect(rows.map((r) => r.linked)).toEqual([optionLabel(grow), optionLabel(keep)]);

    for (const [i, r] of rows.entries()) {
      const tb = rowById(page, r.id);
      const main = tb.locator("tr").first();
      const detail = tb.locator("tr").nth(1);
      // 연결 줄: 선택 상자(라벨이 상자 안) · 삭제
      const picker = detail.locator('button[aria-haspopup="listbox"]');
      await expect(picker, `${r.cells[0]}: "${LINK_LABEL5}" 선택 1`).toHaveCount(1);
      await expect(picker, `${r.cells[0]}: 선택 칸 이름 = "${LINK_LABEL5}"`).toHaveAccessibleName(LINK_LABEL5);
      await expect(picker.getByText(exact(LINK_LABEL5)), `${r.cells[0]}: 라벨은 상자 안`).toHaveCount(1);
      const del = detail.getByRole("button", { name: new RegExp(`${esc(r.cells[0])}.*${DELETE5}`) });
      await expect(del, `${r.cells[0]}: "${DELETE5}"`).toHaveCount(1);
      await expect(del).toHaveText(exact(DELETE5));
      const [pb, db, mb] = [await boxOf(picker), await boxOf(del), await boxOf(main)];
      expect(pb.top, `${r.cells[0]}: 연결 줄은 윗줄 아래`).toBeGreaterThanOrEqual(mb.bottom - 1);
      expect(db.left, `${r.cells[0]}: 삭제는 선택 오른쪽`).toBeGreaterThanOrEqual(pb.right - 0.5);
      expect(Math.abs(db.top + db.height / 2 - (pb.top + pb.height / 2)), `${r.cells[0]}: 선택·삭제 한 줄`).toBeLessThan(pb.height);
      expect(db.height, `${r.cells[0]}: 삭제 누름 높이 ≥ ${MIN_H}`).toBeGreaterThanOrEqual(MIN_H);
      // 단위 = 선택 상자 (병·mL·g)
      const unit = main.getByRole("combobox", { name: new RegExp(`${esc(r.cells[0])}.*단위`) });
      await expect(unit, `${r.cells[0]}: 단위 선택 상자`).toHaveCount(1);
      expect((await unit.locator("option").allInnerTexts()).map(squash).filter((o) => o !== "선택"), `${r.cells[0]}: 단위 선택지 = d7 §13`).toEqual(UNITS);
      expect(await unit.inputValue(), `${r.cells[0]}: 고른 단위`).toBe(r.cells[2]);
      // 기존 기준 줄
      const basisNote = tb.locator('[data-note="basis"]');
      await expect(basisNote, `${r.cells[0]}: 기존 기준 줄 1`).toHaveCount(1);
      const t = squash(await basisNote.innerText());
      expect(t, `${r.cells[0]}: 기존 기준 N`).toMatch(BASIS_RE);
      expect(t, `${r.cells[0]}: "기존 기준 N · …"`).toMatch(i === 0 ? /^기존 기준 50 ?mL · .*바뀌어요$/ : /^기존 기준 30 ?g · .*그대로 둬요$/);
      expect((await paints(detail)).filter((c) => PINK.includes(c)), `${r.cells[0]} 연결 줄: 핑크 없음`).toEqual([]);
      expect((await paints(basisNote)).filter((c) => SKY.includes(c) || PINK.includes(c)), `${r.cells[0]} 기존 기준 줄: 무채색`).toEqual([]);
    }
    // 합치기 줄: 합친 행에만, 아이콘 + 무채색 글자
    const merged = rowById(page, rows[0].id).getByTestId("extract-merged-note");
    await expect(merged, "합친 행: 안내 1").toHaveCount(1);
    await expect(merged).toHaveText(exact(MERGE5.text!.characters));
    expect(await merged.locator("svg").count(), "합치기 아이콘").toBeGreaterThanOrEqual(1);
    expect(await css(merged, "color"), `합치기 글자 = 시안 ${MERGE5.fills[0]}`).toBe(rgb(MERGE5.fills[0]));
    await expectNoPinkSky(merged, "합치기 줄");
    await expect(rowById(page, rows[1].id).getByTestId("extract-merged-note"), "합치지 않은 행: 안내 없음").toHaveCount(0);
    expect(saves.count(), "저장 요청 0건").toBe(0);
    expect((await vendorsBySchool(f.school.id)).length, "판매처 변화 없음").toBe(0);
  } finally {
    await context.close();
  }
});
