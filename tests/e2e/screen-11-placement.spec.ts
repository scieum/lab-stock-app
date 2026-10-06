// 화면 11 (시약장 설정) 디자인 1.15 — 칸 시트(넣기·빼기) · 시약장 번호 · QR 인쇄 · 저장 안 한 편집 확인: C1 · R-ui · C2 · N1-ui
// 기준(구현이 아니라 여기서 도출): design/rules.json 1.15 (cabinet.number·slot_count·class_mismatch·incompatible·qr_label_text·qr_print_layout·
//       unsaved_confirm·slot_assign_roles·qr_print_roles, variants["11"].slot·print·unsaved, roles R7, tab_bar),
//       harness/d7-data.md §9·§14, harness/dev-rules.json (routes 11 · route_auth 11 · components),
//       디자인 run 20261006-1223 s2-spec "## 화면 11"·"## 상태 화면 11-slot"·"## 상태 화면 11-print"·"## 상태 화면 11-unsaved", design/frames/11-*.json.
//
// 쓰기 흐름은 일회용 학교·일회용 계정(교사·admin·학생)·임시 시약으로만 한다 (screen-11-helpers 머리말).
// 공용 학교 A 계정 테스트는 읽기 · 시트 열고 닫기 · 저장 안 하는 편집만 하고 쓰기 요청 0건을 단언한다.
// 실제 인쇄 대화상자는 띄우지 않는다 (window.print 를 가로챈다).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import QRCode from "qrcode";
import { test, expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { openAs } from "./auth-state";
import { browserClient, browserSession, countComponent, rules, sel } from "./screen-helpers";
import { detailPath, seedReagents } from "./screen-3-helpers";
import { HAS_SERVICE, openTemp } from "./screen-8-helpers";
import { shellLink, waitHydrated } from "./shell-helpers";
import {
  ADD,
  CAB,
  CABINETS_HREF,
  CLASSES,
  CONTINUE_BUTTON,
  DISCARD_BUTTON,
  DOUBLE,
  EDIT,
  MIX,
  MODAL,
  NO_S11_RESIDUE,
  NUMBER,
  QR_LABEL,
  QR_PRINT,
  QR_SHEET,
  ROW,
  SCREEN,
  SLOT_ASSIGN,
  SLOT_SHEET,
  TOAST,
  UNSAVED_TITLE,
  VARIANTS,
  acceptBeforeUnload,
  addButton,
  boxOf,
  cleanup,
  closeSlotSheet,
  dbView,
  dbViewByService,
  defaultName,
  deleteButton,
  deleteDialog,
  dialogInput,
  exact,
  expectActive,
  expectBoard,
  expectHeader,
  expectPills,
  hydrated,
  main,
  makeFixture,
  onTop,
  outlineIn,
  pickChips,
  pill,
  prepCabinet,
  prepLayout,
  prepPlace,
  prepReagent,
  prepRename,
  primaryIn,
  purgeSchool,
  readPills,
  renameButton,
  renameDialog,
  saveButton,
  selectSlot,
  setChip,
  sharedCabinetSnapshot,
  sheetClose,
  slotAt,
  slotSheet,
  slots,
  toast,
  unsavedBody,
  unsavedDialog,
  waitCabinets,
  waitEditable,
  watchActions,
  type DbView,
  type PrepReagent,
  type S11Fixture,
} from "./screen-11-helpers";

test.describe.configure({ mode: "default" });

const GROUP = "s11p";
const SAVE_TIMEOUT = 20_000;
const withC = (id: string) => `${CABINETS_HREF}?c=${id}`;
const R7 = rules.roles.R7;
const CAB_RULES = CAB as typeof CAB & { qr_label_text: string[]; slot_assign_roles: string[]; qr_print_roles: string[] };
const QR_HELP = CAB_RULES.qr_label_text[CAB_RULES.qr_label_text.length - 1];

// ---------- 문구 (rules.json · s2-spec 1.15) ----------
/** 한글 끝 글자 받침 여부 → 조사 */
const josa = (word: string, batchim: string, vowel: string) => {
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) throw new Error(`조사 판정: "${word}" 끝 글자가 한글이 아님`);
  return `${word}${(code - 0xac00) % 28 !== 0 ? batchim : vowel}`;
};
/** s2-spec 11-slot 시트 제목 "좌 2단" (양문형) */
const slotTitle = (key: string) => `${key[0] === "L" ? "좌" : "우"} ${key.slice(1)}단`;
/** s2-spec 11-slot ex-toast "염산을 좌 2단에 넣었어요" / "에탄올을 뺐어요(칸 없음)" */
const toastPut = (name: string, key: string) => `${josa(name, "을", "를")} ${slotTitle(key)}에 넣었어요`;
const toastOut = (name: string) => `${josa(name, "을", "를")} 뺐어요(${CAB.unassigned_label})`;
/**
 * rules.json cabinet.class_mismatch + s2-spec 11-slot mix-warning: 시약 분류가 칸 분류·칸 안 다른 시약 분류와 incompatible 조합이면
 * 조합마다 "{A}와 {B}는 섞으면 위험해요"(강한 문구), 아니고 칸 분류에 없으면 "이 칸은 {분류} 칸이에요 — 그래도 넣을 수 있어요", 맞으면 없음.
 */
function placementLines(reagentClass: string, slotClasses: string[], others: string[]): { kind: "none" | "mismatch" | "incompatible"; lines: string[] } {
  const around = new Set([...slotClasses, ...others]);
  const pairs = CAB.incompatible.filter(([a, b]) => (a === reagentClass && around.has(b)) || (b === reagentClass && around.has(a)));
  if (pairs.length) return { kind: "incompatible", lines: pairs.map(([a, b]) => `${josa(a, "과", "와")} ${josa(b, "은", "는")} 섞으면 위험해요`) };
  if (slotClasses.length && !slotClasses.includes(reagentClass)) {
    expect(slotClasses, "이 스펙은 분류 1개짜리 칸으로 불일치 문구를 본다").toHaveLength(1);
    return { kind: "mismatch", lines: [`이 칸은 ${slotClasses[0]} 칸이에요 — 그래도 넣을 수 있어요`] };
  }
  return { kind: "none", lines: [] };
}
const squash = (s: string) => s.replace(/\s+/g, " ").trim();
/** 화면 아래 "칸 없음 시약 (N)" 목록의 행 (칸 시트 안 행과 구분) */
const unassignedRows = (page: Page) => main(page).getByRole("region", { name: /^칸 없음 시약 \(\d+\)$/ }).locator(sel(ROW));
/** 보이는 학교명(rules N1 패턴)이 모두 자기 학교명의 일부이고 1종 */
function expectOneSchool(text: string, own: string, what: string): void {
  const names = [...new Set(text.match(new RegExp(rules.never.N1.school_name_pattern, "g")) ?? [])];
  expect(names, `${what}: 학교명 종류 = rules never.N1.distinct_school_names`).toHaveLength(rules.never.N1.distinct_school_names);
  for (const n of names) expect(own, `${what}: 보이는 학교명 "${n}" 은 자기 학교명의 일부`).toContain(n);
}

// ---------- 칸 시트 요소 ----------
const sheetList = (sheet: Locator) => sheet.getByRole("region", { name: /^이 칸의 시약 \(\d+\)$/ });
const sheetPicker = (sheet: Locator) => sheet.getByRole("region", { name: exact("넣을 시약 고르기") });
const assignButton = (sheet: Locator) => sheet.locator(sel(SLOT_ASSIGN)).getByRole("button");
const listNames = async (sheet: Locator) =>
  (await sheetList(sheet).locator(sel(ROW)).evaluateAll((els) => els.map((e) => (e.textContent ?? "")))).map(squash);

/** 한 번의 누름 안에서 여러 번 누른다 (연타) */
const burst = (l: Locator) =>
  l.evaluate((el) => {
    for (let i = 0; i < 3; i += 1) (el as HTMLElement).click();
  });

async function expectToast(page: Page, text: string): Promise<void> {
  await expect(toast(page).filter({ hasText: exact(text) }), `${TOAST} "${text}"`).toBeVisible({ timeout: SAVE_TIMEOUT });
}

/** 칸 없음 시약 수 (화면 아래 "칸 없음 시약 (N)") */
async function expectUnassignedCount(page: Page, n: number, what: string): Promise<void> {
  const heading = main(page).getByRole("heading", { name: /^\s*칸 없음 시약 \(\d+\)\s*$/ });
  if (n === 0) await expect(heading, `${what}: 칸 없음 목록 없음`).toHaveCount(0, { timeout: SAVE_TIMEOUT });
  else await expect(heading, `${what}: "칸 없음 시약 (${n})"`).toHaveText(exact(`${CAB.unassigned_label} 시약 (${n})`), { timeout: SAVE_TIMEOUT });
}

// ---------- QR (gallery-placement-components 의 방식: QR svg 를 그려 모듈 행렬을 읽고, 기대 내용으로 만든 QR 과 모듈이 모두 같은지) ----------
async function readQrMatrix(svg: Locator): Promise<boolean[][]> {
  return svg.evaluate(async (el) => {
    const vb = (el.getAttribute("viewBox") ?? "").split(/\s+/).map(Number);
    const n = vb[2];
    const scale = 8;
    const clone = el.cloneNode(true) as SVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(n * scale));
    clone.setAttribute("height", String(n * scale));
    clone.setAttribute("shape-rendering", "crispEdges");
    for (const p of Array.from(clone.querySelectorAll("path, rect"))) (p as SVGElement).setAttribute("fill", "#000");
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(clone.outerHTML)}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = n * scale;
    canvas.height = n * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const out: boolean[][] = [];
    for (let y = 0; y < n; y++) {
      const row: boolean[] = [];
      for (let x = 0; x < n; x++) {
        const i = ((y * scale + scale / 2) * canvas.width + (x * scale + scale / 2)) * 4;
        row.push(data[i] < 128);
      }
      out.push(row);
    }
    return out;
  });
}
function qrMatches(matrix: boolean[][], text: string): boolean {
  const n = matrix.length;
  return (["L", "M", "Q", "H"] as const).some((level) => {
    const qr = QRCode.create(text, { errorCorrectionLevel: level });
    const size = qr.modules.size;
    const q = (n - size) / 2;
    if (!Number.isInteger(q) || q < 0) return false;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const inside = y >= q && y < q + size && x >= q && x < q + size;
        const want = inside ? Boolean(qr.modules.get(y - q, x - q)) : false;
        if (matrix[y][x] !== want) return false;
      }
    }
    return true;
  });
}
/** d7 §14: QR 내용 = {origin}/scan?cabinet={cabinet id} */
const qrUrl = (info: TestInfo, id: string) => `${String(info.project.use.baseURL).replace(/\/+$/, "")}/scan?cabinet=${id}`;

/** design/frames/{name}.json 의 이름별 개수 (dev-rules components 에 있는 이름만) */
function frameCounts(name: string): Record<string, number> {
  const j = JSON.parse(readFileSync(join(process.cwd(), "design", "frames", `${name}.json`), "utf8")) as { frames: { nodes: { name: string }[] }[] };
  const out: Record<string, number> = {};
  for (const n of j.frames[0].nodes) out[n.name] = (out[n.name] ?? 0) + 1;
  return out;
}

// =====================================================================
// 일회용 학교
// =====================================================================

let before: string[] | null = null;
let fixtureCache: Promise<S11Fixture> | null = null;
function fixture(info: TestInfo): Promise<S11Fixture> {
  fixtureCache ??= makeFixture(info, GROUP);
  fixtureCache.catch(() => {
    fixtureCache = null;
  });
  return fixtureCache;
}
async function fresh(info: TestInfo): Promise<S11Fixture> {
  test.setTimeout(420_000);
  const f = await fixture(info);
  await purgeSchool(f.school.id);
  return f;
}

test.beforeAll(async () => {
  if (HAS_SERVICE) before = await sharedCabinetSnapshot();
});

test.afterAll(async ({}, info) => {
  info.setTimeout(300_000);
  if (!HAS_SERVICE) return;
  fixtureCache = null;
  const left = await cleanup(GROUP, info.project.name);
  expect(left, "일회용 계정·학교·시약장·칸·시약 잔여물").toEqual(NO_S11_RESIDUE);
  if (before) expect(await sharedCabinetSnapshot(), "학교 A·B·데모 학교의 시약장(번호)·칸·시약 배치가 그대로").toEqual(before);
});

/** 임시 시약 이름 — 끝 글자를 정해 토스트 조사를 판정한다 */
const nameOf = (tail: string) => `임시${Math.random().toString(36).slice(2, 7)}${tail}`;

type SlotState = {
  cabId: string;
  /** 칸 분류 */
  layout: Record<string, string[]>;
  inL1: PrepReagent[];
  /** 칸 없음 시약: 분류 불일치(산) · 위험 조합(산화제) · 일치(유기) */
  mismatch: PrepReagent & { cls: string };
  danger: PrepReagent & { cls: string };
  match: PrepReagent & { cls: string };
};

/** 칸 시트 상태: 1번 시약장 양문형 4단 · 좌1단 = 유기(시약 2: 유기) · 우1단 = 산, 칸 없음 시약 3 (s2-spec 11-slot 예시처럼 유기 칸에 넣기) */
async function prepSlotState(f: S11Fixture): Promise<SlotState> {
  const c = await prepCabinet(f);
  const layout = { L1: ["유기"], R1: ["산"] };
  await prepLayout(f, c.id, DOUBLE, 4, layout);
  const inL1: PrepReagent[] = [];
  for (const tail of ["에탄올", "메탄올"]) {
    const r = await prepReagent(f, tail, 200, "mL", "유기", nameOf(tail));
    await prepPlace(f, r.id, c.id, "L1");
    inL1.push(r);
  }
  // 분류는 rules.json 에서 고른다: 유기 칸에 넣으면 — 산(불일치만), 산화제(산화제·유기 incompatible), 유기(일치)
  const danger = CAB.incompatible.find(([a, b]) => a === "유기" || b === "유기")!;
  const dangerCls = danger[0] === "유기" ? danger[1] : danger[0];
  const mismatchCls = CLASSES.find((c2) => c2 !== "유기" && !CAB.incompatible.some(([a, b]) => (a === c2 && b === "유기") || (b === c2 && a === "유기")))!;
  const mismatch = { ...(await prepReagent(f, "염산", 1, "병", mismatchCls, nameOf("염산"))), cls: mismatchCls };
  const dangerR = { ...(await prepReagent(f, "과산화수소", 2, "병", dangerCls, nameOf("과산화수소"))), cls: dangerCls };
  const match = { ...(await prepReagent(f, "아세톤", 300, "mL", "유기", nameOf("아세톤"))), cls: "유기" };
  return { cabId: c.id, layout, inL1, mismatch, danger: dangerR, match };
}

test.describe("일회용 학교", () => {
  test.skip(!HAS_SERVICE, "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)");

  // ---------------------------------------------------------------
  // 칸 시트 — 넣기·빼기 (11-slot)
  // ---------------------------------------------------------------
  for (const who of ["teacher", "admin"] as const) {
    test(`[C1][S${SCREEN}] 일회용 ${who === "teacher" ? "교사" : "admin"} 칸 시트(11-slot): 칸 누름 → ${SLOT_SHEET} 제목 "좌 1단"·칸 분류 칩·"이 칸의 시약 (N)" 목록 = DB 그 칸 시약 · "시약 넣기" → 후보 = DB 칸 없음 시약(자기 학교) · 분류 불일치/위험 조합 ${MIX} 문구(rules cabinet.class_mismatch·incompatible) · variants.slot(${VARIANTS.slot.join("·")}) · 경고가 있어도 넣기 연타 → 요청 1건·토스트·slot-count +1·칸 없음 -1·DB slot_id · "빼기" 연타 → 요청 1건·칸 없음·slot-count -1`, async ({ browser }, info) => {
      const f = await fresh(info);
      const st = await prepSlotState(f);
      const user = who === "teacher" ? f.teacher : f.admin;
      const { context, page, viewport } = await openTemp(browser, info, user, withC(st.cabId));
      const actions = watchActions(page);
      try {
        await waitEditable(page);
        let db = await dbViewByService(f.school.id);
        expect(db.counts[st.cabId], "대조: 좌1단 시약 2").toEqual({ L1: 2 });
        await expectBoard(page, DOUBLE, 4, st.layout, "처음", db.counts[st.cabId]);
        await expectUnassignedCount(page, 3, "처음");

        // 칸 누름 → 칸 시트
        await hydrated(slotAt(page, DOUBLE, "L1"));
        await slotAt(page, DOUBLE, "L1").click();
        const sheet = slotSheet(page);
        await expect(sheet, SLOT_SHEET).toBeVisible();
        await expect(sheet.getByRole("heading", { name: exact(slotTitle("L1")) }), `시트 제목 "${slotTitle("L1")}"`).toBeVisible();
        expect((await sheet.locator(`${sel("storage-class-chip")}`).allInnerTexts()).map(squash), "제목 옆 칸 분류 칩 (보기 전용)").toEqual(st.layout.L1);
        await expect(sheet.locator(`button${sel("storage-class-chip")}`), "시트 분류 칩은 누르는 칩이 아니다").toHaveCount(0);
        await expect(sheet.getByRole("heading", { name: exact(`이 칸의 시약 (${st.inL1.length})`) })).toBeVisible();
        const want = (db.inSlot[st.cabId].L1 ?? []).map((r) => r.name).sort();
        expect((await listNames(sheet)).map((t) => want.find((n) => t.includes(n)) ?? t).sort(), "시트 목록 = DB 좌1단 시약").toEqual(want);
        for (const r of st.inL1) {
          const row = sheetList(sheet).locator(sel(ROW)).filter({ hasText: r.name });
          await expect(row.getByRole("button", { name: /빼기/ }), `"${r.name}" 행 "빼기"`).toHaveCount(1);
          await expect(row.locator(`a[href="${detailPath(r.id)}"]`), `"${r.name}" 행 → 시약 상세`).toHaveCount(1);
        }
        await expect(sheet.locator(sel(SLOT_ASSIGN)), `${SLOT_ASSIGN} 1개`).toHaveCount(1);
        await expect(assignButton(sheet), `${SLOT_ASSIGN} "시약 넣기"`).toHaveText(exact("시약 넣기"));
        await expect(slotAt(page, DOUBLE, "L1"), "누른 칸은 선택 칸").toHaveAttribute("aria-pressed", "true");

        // 넣을 시약 고르기 열기 → 후보 = DB 칸 없음 시약
        await assignButton(sheet).click();
        const picker = sheetPicker(sheet);
        await expect(picker, "넣을 시약 고르기").toBeVisible();
        await expect(picker.locator(`${sel("text-input")} input`), "검색 text-input").toHaveCount(1);
        const candidates = picker.locator(sel(ROW));
        await expect(candidates, "후보 수 = DB 칸 없음 시약 수").toHaveCount(db.unassigned.length);
        for (const u of db.unassigned) {
          const row = candidates.filter({ hasText: u.name });
          await expect(row, `후보 "${u.name}"`).toHaveCount(1);
          await expect(row, `후보 "${u.name}" caption "${CAB.unassigned_label}"`).toContainText(CAB.unassigned_label);
        }
        await expect(assignButton(sheet), "시약을 고르기 전에는 넣기 비활성").toBeDisabled();
        // 검색
        const search = picker.locator(`${sel("text-input")} input`);
        await search.fill(st.mismatch.name.slice(-4));
        await expect(candidates, "검색 → 이름에 그 글자가 있는 후보만").toHaveCount(1);
        await expect(candidates).toContainText(st.mismatch.name);
        await search.fill("");
        await expect(candidates).toHaveCount(db.unassigned.length);

        const mixIn = sheet.locator(sel(MIX));
        const others = st.inL1.map(() => "유기");
        for (const r of [st.danger, st.mismatch, st.match]) {
          await candidates.filter({ hasText: r.name }).click();
          await expect(candidates.filter({ hasText: r.name }), `"${r.name}" 고름`).toHaveAttribute("aria-pressed", "true");
          await expect(picker.locator('[aria-pressed="true"]'), "고른 후보는 하나").toHaveCount(1);
          const w = placementLines(r.cls, st.layout.L1, others);
          if (w.kind === "none") {
            await expect(mixIn, `"${r.cls}" 시약을 "${st.layout.L1}" 칸에: 경고 없음`).toHaveCount(0);
          } else {
            await expect(mixIn, `"${r.cls}" → ${w.kind} ${MIX}`).toHaveCount(1);
            const text = squash(await mixIn.innerText());
            for (const line of w.lines) expect(text, `${MIX} 문구 "${line}"`).toContain(line);
            if (w.kind === "incompatible") {
              for (const c of VARIANTS.slot) expect(await countComponent(page, c), `variants.slot ${c}`).toBeGreaterThanOrEqual(1);
              const frame = frameCounts(`${SCREEN}-slot-${viewport}`);
              for (const c of [SLOT_SHEET, SLOT_ASSIGN]) expect(await countComponent(page, c), `시안 11-slot ${c} = ${frame[c]}`).toBe(frame[c]);
              expect(await sheet.locator(sel("text-input")).count(), `시안 11-slot 시트 text-input = ${frame["text-input"]}`).toBe(frame["text-input"]);
            }
          }
          await expect(assignButton(sheet), `"${r.name}" 고른 뒤 넣기 활성 (경고는 막지 않는다)`).toBeEnabled();
        }
        expect(actions.count(), "고르기까지 쓰기 요청 0건").toBe(0);

        // 위험 조합이어도 넣는다 (연타)
        await candidates.filter({ hasText: st.danger.name }).click();
        await expect(mixIn).toHaveCount(1);
        await burst(assignButton(sheet));
        await expectToast(page, toastPut(st.danger.name, "L1"));
        expect(actions.count(), "연타에도 넣기 요청 1건").toBe(1);
        await expect.poll(async () => (await dbViewByService(f.school.id)).counts[st.cabId].L1, { message: "DB: 좌1단 시약 3", timeout: SAVE_TIMEOUT }).toBe(3);
        db = await dbViewByService(f.school.id);
        expect(db.inSlot[st.cabId].L1.map((r) => r.id), "DB: 넣은 시약 slot_id = 좌1단").toContain(st.danger.id);
        expect(db.unassigned.map((r) => r.id), "DB: 칸 없음에서 빠짐").not.toContain(st.danger.id);
        await expect(sheet.getByRole("heading", { name: exact(`이 칸의 시약 (3)`) }), "시트 목록 갱신").toBeVisible({ timeout: SAVE_TIMEOUT });
        await expect(sheetList(sheet).locator(sel(ROW)).filter({ hasText: st.danger.name })).toHaveCount(1);
        await expectBoard(page, DOUBLE, 4, st.layout, "넣은 뒤", db.counts[st.cabId]);
        await expectUnassignedCount(page, 2, "넣은 뒤");
        await expect(unassignedRows(page).filter({ hasText: st.danger.name }), "칸 없음 목록에서 빠짐").toHaveCount(0);
        await expect(unassignedRows(page), "칸 없음 목록 행 2").toHaveCount(2);

        // 빼기 (연타)
        await expect(toast(page)).toHaveCount(0, { timeout: SAVE_TIMEOUT });
        const outBtn = sheetList(sheet).locator(sel(ROW)).filter({ hasText: st.danger.name }).getByRole("button", { name: /빼기/ });
        await burst(outBtn);
        await expectToast(page, toastOut(st.danger.name));
        expect(actions.count(), "연타에도 빼기 요청 1건").toBe(2);
        await expect.poll(async () => (await dbViewByService(f.school.id)).counts[st.cabId].L1, { message: "DB: 좌1단 시약 2", timeout: SAVE_TIMEOUT }).toBe(2);
        db = await dbViewByService(f.school.id);
        expect(db.unassigned.map((r) => r.id), "DB: 뺀 시약 = 칸 없음 (slot_id null)").toContain(st.danger.id);
        await expect(sheet.getByRole("heading", { name: exact(`이 칸의 시약 (2)`) })).toBeVisible({ timeout: SAVE_TIMEOUT });
        await expectBoard(page, DOUBLE, 4, st.layout, "뺀 뒤", db.counts[st.cabId]);
        await expectUnassignedCount(page, 3, "뺀 뒤");

        // 닫기 → 시트 없음, 다른 칸(빈 칸)을 누르면 "이 칸의 시약 (0)"
        await closeSlotSheet(page);
        await slotAt(page, DOUBLE, "R1").click();
        await expect(slotSheet(page).getByRole("heading", { name: exact(slotTitle("R1")) })).toBeVisible();
        await expect(slotSheet(page).getByRole("heading", { name: exact("이 칸의 시약 (0)") })).toBeVisible();
        await expect(sheetList(slotSheet(page)).locator(sel(ROW)), "빈 칸 시트 목록 0").toHaveCount(0);
        await page.keyboard.press("Escape");
        await expect(slotSheet(page), "Esc → 닫힘").toHaveCount(0);
        expect(actions.count(), "쓰기 요청 = 넣기 1 + 빼기 1").toBe(2);
      } finally {
        await context.close();
      }
    });
  }

  test(`[R-ui][S${SCREEN}] 일회용 학생 칸 시트: 칸 누름 → ${SLOT_SHEET} 목록만 (= DB) · ${SLOT_ASSIGN}·"빼기"·고르는 칩·선택 칸 0 · 응답 본문에 ${SLOT_ASSIGN}·${QR_PRINT} 없음 (R7 · rules cabinet.slot_assign_roles = ${CAB_RULES.slot_assign_roles.join("·")}) · 쓰기 요청 0건`, async ({ browser }, info) => {
    const f = await fresh(info);
    const st = await prepSlotState(f);
    expect(CAB_RULES.slot_assign_roles, "rules: 학생은 넣기·빼기 역할이 아니다").not.toContain("학생");
    const { context, page, response } = await openTemp(browser, info, f.student, withC(st.cabId));
    const actions = watchActions(page);
    try {
      await waitCabinets(page);
      const html = await response!.text();
      for (const c of R7.components ?? []) {
        expect(await countComponent(page, c), `R7 ${c}`).toBe(R7.max);
        expect(html, `응답 본문에 ${c}`).not.toContain(`data-component="${c}"`);
      }
      const db = await dbViewByService(f.school.id);
      await expectBoard(page, DOUBLE, 4, st.layout, "학생", db.counts[st.cabId]);
      await hydrated(slotAt(page, DOUBLE, "L1"));
      await slotAt(page, DOUBLE, "L1").click();
      const sheet = slotSheet(page);
      await expect(sheet, `학생 ${SLOT_SHEET}`).toBeVisible();
      await expect(sheet.getByRole("heading", { name: exact(slotTitle("L1")) })).toBeVisible();
      await expect(sheet.getByRole("heading", { name: exact(`이 칸의 시약 (${st.inL1.length})`) })).toBeVisible();
      for (const r of db.inSlot[st.cabId].L1) await expect(sheet.locator(sel(ROW)).filter({ hasText: r.name }), `학생 목록 "${r.name}"`).toHaveCount(1);
      await expect(sheet.locator(sel(ROW)), "학생 목록 수 = DB").toHaveCount(db.inSlot[st.cabId].L1.length);
      await expect(sheet.locator(sel(SLOT_ASSIGN)), `학생 ${SLOT_ASSIGN}`).toHaveCount(0);
      await expect(sheet.getByRole("button", { name: /빼기|시약 넣기/ }), `학생 "빼기"·"시약 넣기"`).toHaveCount(0);
      await expect(sheet.getByText("넣을 시약 고르기"), "학생: 넣을 시약 고르기 없음").toHaveCount(0);
      await expect(pickChips(page), "학생 고르는 칩").toHaveCount(0);
      expect(await slots(page).evaluateAll((els) => els.map((e) => e.getAttribute("aria-pressed"))), "학생: 선택 칸 없음").not.toContain("true");
      // 행 → 시약 상세
      const target = st.inL1[0];
      await sheet.locator(sel(ROW)).filter({ hasText: target.name }).click();
      await page.waitForURL((u) => u.pathname === detailPath(target.id), { timeout: 45_000 });
      await expect(page.locator("main")).toContainText(target.name, { timeout: 45_000 });
      expect(actions.count(), "쓰기 요청 0건").toBe(0);
    } finally {
      await context.close();
    }
  });

  // ---------------------------------------------------------------
  // 시약장 번호 (rules.json cabinet.number · d7 §14)
  // ---------------------------------------------------------------
  test(`[C1][S${SCREEN}] 일회용 교사 시약장 번호: pill·제목의 ${NUMBER} = DB number · "+ 시약장 추가" → 다음 번호·"${defaultName(3)}" · 삭제한 번호는 다시 쓰지 않음(다음 추가 = "${defaultName(4)}") · 이름을 바꿔도 번호 그대로 · 이름 시트 "번호 N은 바뀌지 않아요"`, async ({ browser }, info) => {
    const f = await fresh(info);
    const c1 = await prepCabinet(f);
    const c2 = await prepCabinet(f);
    const { context, page } = await openTemp(browser, info, f.teacher, withC(c1.id));
    const actions = watchActions(page);
    try {
      await waitEditable(page);
      let db = await dbViewByService(f.school.id);
      expect(db.cabinets.map((c) => c.number), "DB: 번호 1, 2").toEqual([1, 2]);
      await expectPills(page, db.cabinets, "처음");
      await expectActive(page, c1.label, "처음", 1);
      await expectHeader(page, c1.label, DOUBLE, 4, "처음", 1);

      // 추가 → 3
      await hydrated(addButton(page));
      await addButton(page).click();
      await expectToast(page, `${josa(defaultName(3), "을", "를")} 추가했어요`);
      await expect.poll(async () => (await dbViewByService(f.school.id)).cabinets.length, { timeout: SAVE_TIMEOUT }).toBe(3);
      db = await dbViewByService(f.school.id);
      const c3 = db.cabinets.find((c) => c.number === 3)!;
      expect(c3, "DB: 다음 번호 3").toBeTruthy();
      expect(c3.label, `DB: 새 이름 "${defaultName(3)}"`).toBe(defaultName(3));
      await expect.poll(() => new URL(page.url()).searchParams.get("c"), { timeout: SAVE_TIMEOUT }).toBe(c3.id);
      await expectPills(page, db.cabinets, "추가 뒤");
      await expectActive(page, defaultName(3), "추가 뒤", 3);
      await expectHeader(page, defaultName(3), DOUBLE, 4, "추가 뒤", 3);

      // 3 삭제 → 다시 추가하면 4 (삭제된 번호는 다시 쓰지 않음)
      await expect(toast(page)).toHaveCount(0, { timeout: SAVE_TIMEOUT });
      await hydrated(deleteButton(page));
      await deleteButton(page).click();
      await primaryIn(deleteDialog(page), "삭제").click();
      await expectToast(page, `${josa(defaultName(3), "을", "를")} 삭제했어요`);
      await expect.poll(async () => (await dbViewByService(f.school.id)).cabinets.map((c) => c.number), { timeout: SAVE_TIMEOUT }).toEqual([1, 2]);
      await expectPills(page, (await dbViewByService(f.school.id)).cabinets, "삭제 뒤");
      await expect(toast(page)).toHaveCount(0, { timeout: SAVE_TIMEOUT });
      await hydrated(addButton(page));
      await addButton(page).click();
      await expectToast(page, `${josa(defaultName(4), "을", "를")} 추가했어요`);
      await expect.poll(async () => (await dbViewByService(f.school.id)).cabinets.map((c) => c.number), { timeout: SAVE_TIMEOUT }).toEqual([1, 2, 4]);
      db = await dbViewByService(f.school.id);
      const c4 = db.cabinets.find((c) => c.number === 4)!;
      expect(c4.label, "삭제한 3 을 건너뛴 이름").toBe(defaultName(4));
      await expectPills(page, db.cabinets, "다시 추가 뒤");
      await expectActive(page, defaultName(4), "다시 추가 뒤", 4);
      expect((await readPills(page)).map((p) => p.number), "화면 pill 번호에 3 없음").toEqual([1, 2, 4]);

      // 이름 바꾸기 → 번호 그대로
      await page.goto(withC(c2.id));
      await waitEditable(page);
      await renameButton(page).click();
      const dialog = renameDialog(page);
      await expect(dialog).toBeVisible();
      // s2-spec 화면 11 ex-modal-card: caption "번호 1은 바뀌지 않아요" — 나머지 번호 단언도 이어서 보도록 soft
      await expect.soft(dialog.getByText(exact("번호 2는 바뀌지 않아요")).or(dialog.getByText(exact("번호 2은 바뀌지 않아요"))), "이름 시트 caption \"번호 N은 바뀌지 않아요\" (s2-spec 화면 11 ex-modal-card)").toHaveCount(1);
      const name = "화학 준비실";
      await dialogInput(page).fill(name);
      await primaryIn(dialog, "저장").click();
      await expectToast(page, "이름을 바꿨어요");
      await expect.poll(async () => (await dbViewByService(f.school.id)).cabinets.find((c) => c.id === c2.id)?.label, { timeout: SAVE_TIMEOUT }).toBe(name);
      db = await dbViewByService(f.school.id);
      expect(db.cabinets.find((c) => c.id === c2.id)?.number, "DB: 이름을 바꿔도 번호 2").toBe(2);
      await expectPills(page, db.cabinets, "이름 바꾼 뒤");
      await expectActive(page, name, "이름 바꾼 뒤", 2);
      await expectHeader(page, name, DOUBLE, 4, "이름 바꾼 뒤", 2);
      expect(actions.count(), "쓰기 요청 = 추가 2 + 삭제 1 + 이름 1").toBe(4);
    } finally {
      await context.close();
    }
  });

  // ---------------------------------------------------------------
  // QR 인쇄 (11-print)
  // ---------------------------------------------------------------
  test(`[C1][S${SCREEN}] 일회용 교사 QR 인쇄(11-print): "${"QR 인쇄"}" → ${QR_SHEET} · variants.print(${VARIANTS.print.join("·")}) · 기본 = 지금 시약장 라벨 1 · "모두" → 라벨 = 시약장 수 · 라벨 글자 = rules qr_label_text(학교명·번호·이름·"${QR_HELP}") · QR 내용 = {origin}/scan?cabinet={id} · "인쇄" → window.print 1회 · 인쇄 미디어에서 라벨만 보임 · 서버 요청 0건`, async ({ browser }, info) => {
    const f = await fresh(info);
    const c1 = await prepCabinet(f);
    const c2 = await prepCabinet(f);
    const c3 = await prepCabinet(f);
    await prepRename(f, c3.id, "준비실 약품장");
    const { context, page, viewport } = await openTemp(browser, info, f.teacher, withC(c2.id));
    const actions = watchActions(page);
    try {
      await page.addInitScript(() => {
        (window as unknown as { __prints: number }).__prints = 0;
        window.print = () => {
          (window as unknown as { __prints: number }).__prints += 1;
        };
      });
      await page.reload();
      await waitEditable(page);
      const db = await dbViewByService(f.school.id);
      expect(CAB_RULES.qr_print_roles, "rules: QR 인쇄 = 교사·admin").toEqual(expect.arrayContaining(["교사", "admin"]));
      const printBtn = main(page).locator(sel(QR_PRINT)).getByRole("button");
      await expect(printBtn, `${QR_PRINT} 버튼`).toHaveCount(1);
      await expect(printBtn).toHaveText(/QR 인쇄/);
      await hydrated(printBtn);
      await printBtn.click();
      const sheet = page.locator(sel(QR_SHEET));
      await expect(sheet, QR_SHEET).toBeVisible();
      await expect(sheet.getByRole("heading", { name: exact("QR 인쇄") })).toBeVisible();
      for (const c of VARIANTS.print) expect(await countComponent(page, c), `variants.print ${c}`).toBeGreaterThanOrEqual(1);

      // 대상 고르기 pill: 시약장마다(번호 + 이름) + "모두"
      const options = sheet.getByRole("group", { name: "인쇄할 시약장" }).getByRole("button");
      await expect(options, "시약장 수 + 모두").toHaveCount(db.cabinets.length + 1);
      const optionTexts = await options.evaluateAll((els, numSel) =>
        els.map((el) => {
          const n = el.querySelector(numSel)?.textContent?.trim() ?? null;
          const clone = el.cloneNode(true) as HTMLElement;
          clone.querySelector(numSel)?.remove();
          return { number: n, label: (clone.textContent ?? "").trim(), pressed: el.getAttribute("aria-pressed") };
        }),
      sel(NUMBER));
      expect(optionTexts.slice(0, -1).map((o) => ({ number: Number(o.number), label: o.label })), "대상 pill = DB 시약장 (번호 순)").toEqual(
        [...db.cabinets].sort((a, b) => a.number - b.number).map((c) => ({ number: c.number, label: c.label })),
      );
      expect(optionTexts.at(-1)!.label, `마지막 pill "모두"`).toBe("모두");
      expect(optionTexts.filter((o) => o.pressed === "true").map((o) => o.label), "기본 = 지금 시약장 (rules qr_print_layout)").toEqual([c2.label]);

      /** 미리보기 라벨: 글자 = 학교명 · 번호 · 이름 · 안내, QR 내용 */
      const expectLabels = async (want: typeof db.cabinets, what: string) => {
        const labels = sheet.locator(sel(QR_LABEL));
        await expect(labels, `${what}: ${QR_LABEL} 수`).toHaveCount(want.length);
        await expect(sheet.getByText(exact(`A4 한 장에 라벨 ${want.length}개`)), `${what}: "A4 한 장에 라벨 ${want.length}개"`).toBeVisible();
        for (let i = 0; i < want.length; i += 1) {
          const label = labels.nth(i);
          const c = want[i];
          const text = squash(await label.innerText());
          expect(text, `${what}: 라벨 ${c.label} 학교명`).toContain(f.school.name);
          expect(text, `${what}: 라벨 ${c.label} 이름`).toContain(c.label);
          expect(text, `${what}: 라벨 ${c.label} 안내 (rules qr_label_text)`).toContain(QR_HELP);
          await expect(label.locator(sel(NUMBER)), `${what}: 라벨 ${c.label} 번호`).toHaveText(exact(String(c.number)));
          const svg = label.locator("svg").first();
          expect(qrMatches(await readQrMatrix(svg), qrUrl(info, c.id)), `${what}: 라벨 ${c.label} QR = ${qrUrl(info, c.id)}`).toBe(true);
          if (want.length > 1) expect(qrMatches(await readQrMatrix(svg), qrUrl(info, want[(i + 1) % want.length].id)), "대조: 다른 시약장 QR 과는 다르다").toBe(false);
        }
        // N1-ui: 라벨의 학교명 = 자기 학교 1종
        expectOneSchool((await labels.allInnerTexts()).join("\n"), f.school.name, `${what} 라벨`);
      };
      await expectLabels(db.cabinets.filter((c) => c.id === c2.id), "기본");
      await options.filter({ hasText: exact("모두") }).click();
      await expect(options.filter({ hasText: exact("모두") })).toHaveAttribute("aria-pressed", "true");
      const all = [...db.cabinets].sort((a, b) => a.number - b.number);
      await expectLabels(all, "모두");
      const frame = frameCounts(`${SCREEN}-print-${viewport}`);
      expect(await countComponent(page, QR_LABEL), `시안 11-print (시약장 ${frame[QR_LABEL]}개 "모두") 와 같은 규칙: 라벨 = 시약장 수`).toBe(all.length);

      // 인쇄 → window.print 1회 (가로챔), 인쇄 미디어에서는 인쇄 사본(라벨)만 보인다
      await primaryIn(sheet, "인쇄").click();
      await expect.poll(() => page.evaluate(() => (window as unknown as { __prints: number }).__prints), { message: "window.print 1회" }).toBe(1);
      const printRoot = page.locator("[data-print-root]");
      await expect(printRoot, "화면에서는 인쇄 사본이 보이지 않는다").toBeHidden();
      await page.emulateMedia({ media: "print" });
      try {
        await expect(printRoot, "인쇄 미디어: 인쇄 사본 보임").toBeVisible();
        await expect(printRoot.locator('svg[role="img"]'), "인쇄 사본 QR 수 = 시약장 수").toHaveCount(all.length);
        const printed = squash(await printRoot.innerText());
        for (const c of all) expect(printed, `인쇄 사본에 ${c.label}`).toContain(c.label);
        expect(printed).toContain(QR_HELP);
        for (const l of [page.locator("main"), page.locator(sel("nav-pill")), sheet, page.locator(sel(rules.tab_bar.component))]) {
          if ((await l.count()) === 0) continue;
          await expect(l.first(), "인쇄 미디어: 화면 요소는 숨김").toBeHidden();
        }
      } finally {
        await page.emulateMedia({ media: "screen" });
      }
      await sheetClose(sheet).click();
      await expect(sheet, "× → 닫힘").toHaveCount(0);
      await expect(printRoot, "시트를 닫으면 인쇄 사본도 없다").toHaveCount(0);
      expect(actions.count(), "QR 인쇄는 서버에 저장하지 않는다 (요청 0건)").toBe(0);
      const after = await dbViewByService(f.school.id);
      expect(after.cabinets.map((c) => c.id), "DB 그대로").toEqual(db.cabinets.map((c) => c.id));
      void c1;
    } finally {
      await context.close();
    }
  });

  // ---------------------------------------------------------------
  // 저장 안 한 편집 확인 (11-unsaved)
  // ---------------------------------------------------------------
  test(`[C1][S${SCREEN}] 일회용 교사 저장 안 한 편집(11-unsaved, rules cabinet.unsaved_confirm): 편집 없으면 pill·셸 링크 바로 이동 · 편집 후 pill·셸 링크(tab-bar/nav)·${ADD} → ${MODAL} "${UNSAVED_TITLE}"(variants.unsaved) · "${CONTINUE_BUTTON}" = 머묾·편집 유지·요청 0 · "${DISCARD_BUTTON}" = 버리고 이동(추가는 그때 1건) · 새로고침 = 브라우저 기본 확인`, async ({ browser }, info) => {
    const f = await fresh(info);
    const c1 = await prepCabinet(f);
    const c2 = await prepCabinet(f);
    const { context, page, viewport } = await openTemp(browser, info, f.teacher, withC(c1.id));
    const actions = watchActions(page);
    const unload = acceptBeforeUnload(page);
    try {
      await waitEditable(page);
      const home = shellLink(page, viewport, 13);
      // 편집이 없으면 확인 없이 이동
      await hydrated(pill(page, c2.label));
      await pill(page, c2.label).click();
      await expect.poll(() => new URL(page.url()).searchParams.get("c"), { timeout: SAVE_TIMEOUT }).toBe(c2.id);
      await expect(unsavedDialog(page), "편집 없음 → 확인 없음").toHaveCount(0);
      await page.goto(withC(c1.id));
      await waitEditable(page);

      /** 편집: 우4단에 첫 분류 */
      const makeEdit = async () => {
        await selectSlot(page, DOUBLE, "R4");
        await setChip(page, CLASSES[0], true);
        await expect(saveButton(page)).toBeEnabled();
      };
      const expectConfirm = async (what: string) => {
        const d = unsavedDialog(page);
        await expect(d, `${what} → "${UNSAVED_TITLE}"`).toBeVisible();
        for (const c of VARIANTS.unsaved) expect(await countComponent(page, c), `variants.unsaved ${c}`).toBeGreaterThanOrEqual(1);
        await expect(page.locator(sel(MODAL)), `${MODAL} 1개`).toHaveCount(1);
        await expect(d.getByText(exact(unsavedBody(c1.label))), "안내 문구").toBeVisible();
        const discard = outlineIn(d, DISCARD_BUTTON);
        const cont = primaryIn(d, CONTINUE_BUTTON);
        await expect(discard, `button-outline "${DISCARD_BUTTON}"`).toHaveCount(1);
        await expect(cont, `button-primary "${CONTINUE_BUTTON}"`).toHaveCount(1);
        const a = await boxOf(discard);
        const b = await boxOf(cont);
        expect(a.right, `"${DISCARD_BUTTON}" 왼쪽 · "${CONTINUE_BUTTON}" 오른쪽`).toBeLessThanOrEqual(b.left);
        expect(Math.abs(a.top - b.top), "가로 2버튼").toBeLessThanOrEqual(1);
        return { d, discard, cont };
      };
      const stayed = async (what: string) => {
        await expect(unsavedDialog(page), `${what}: 카드 닫힘`).toHaveCount(0);
        expect(new URL(page.url()).pathname, `${what}: 화면 그대로`).toBe(CABINETS_HREF);
        expect(new URL(page.url()).searchParams.get("c"), `${what}: 시약장 그대로`).toBe(c1.id);
        await expectBoard(page, DOUBLE, 4, { R4: [CLASSES[0]] }, `${what}: 편집 유지`);
        await expect(saveButton(page), `${what}: 저장 가능`).toBeEnabled();
      };

      await makeEdit();
      // pill → 계속 편집
      await pill(page, c2.label).click();
      let ui = await expectConfirm("pill");
      await ui.cont.click();
      await stayed("pill → 계속 편집");
      // 셸 링크(홈) → 계속 편집
      await waitHydrated(home);
      await home.click();
      ui = await expectConfirm(`셸 링크(${viewport === "mobile" ? "tab-bar" : "nav"})`);
      await ui.cont.click();
      await stayed("셸 링크 → 계속 편집");
      // 시약장 추가 → 계속 편집 → 요청 0
      await addButton(page).click();
      ui = await expectConfirm(ADD);
      await ui.cont.click();
      await stayed(`${ADD} → 계속 편집`);
      expect(actions.count(), `"${CONTINUE_BUTTON}" 는 요청 0건`).toBe(0);
      expect((await dbViewByService(f.school.id)).cabinets, "DB 그대로").toHaveLength(2);

      // 시약장 추가 → 버리고 이동 → 추가 1건, 편집은 버려짐
      await addButton(page).click();
      ui = await expectConfirm(`${ADD} 두 번째`);
      await ui.discard.click();
      await expectToast(page, `${josa(defaultName(3), "을", "를")} 추가했어요`);
      expect(actions.count(), "버리고 이동 → 추가 요청 1건").toBe(1);
      await expect.poll(async () => (await dbViewByService(f.school.id)).cabinets.length, { timeout: SAVE_TIMEOUT }).toBe(3);
      let db: DbView = await dbViewByService(f.school.id);
      expect(Object.values(db.classes[c1.id]).flat(), "버린 편집은 저장되지 않았다").toEqual([]);
      const c3 = db.cabinets.find((c) => c.number === 3)!;
      await expect.poll(() => new URL(page.url()).searchParams.get("c"), { timeout: SAVE_TIMEOUT }).toBe(c3.id);

      // 다시 1번 시약장 → 편집 → 셸 링크 → 버리고 이동 = 홈
      await pill(page, c1.label).click();
      await expect.poll(() => new URL(page.url()).searchParams.get("c"), { timeout: SAVE_TIMEOUT }).toBe(c1.id);
      await waitEditable(page);
      await expectBoard(page, DOUBLE, 4, {}, "되돌아온 1번 시약장 (편집 없음)");
      await makeEdit();
      await waitHydrated(home);
      await home.click();
      ui = await expectConfirm("셸 링크 두 번째");
      await ui.discard.click();
      await expect.poll(() => new URL(page.url()).pathname, { message: "버리고 이동 → 홈", timeout: 45_000 }).toBe("/");
      await expect(page.locator(`main ${sel("home-summary")}`).first()).toBeVisible({ timeout: 45_000 });

      // 새로고침 = 브라우저 기본 확인 (beforeunload)
      await page.goto(withC(c1.id));
      await waitEditable(page);
      const n0 = unload.count();
      await page.reload();
      await waitEditable(page);
      expect(unload.count() - n0, "편집 없으면 새로고침 확인 없음").toBe(0);
      await makeEdit();
      await page.reload();
      await waitEditable(page);
      expect(unload.count() - n0, "편집 중 새로고침 = 브라우저 기본 확인 1번").toBe(1);
      await expect(saveButton(page), "받아들이면 편집은 사라진다").toBeDisabled();
      db = await dbViewByService(f.school.id);
      expect(Object.values(db.classes[c1.id]).flat(), "DB: 저장되지 않았다").toEqual([]);
      expect(actions.count(), "쓰기 요청 = 추가 1건뿐").toBe(1);
    } finally {
      await context.close();
    }
  });

  test(`[R-ui][S${SCREEN}] 일회용 학생: ${QR_PRINT}·${QR_SHEET}·${ADD}·${EDIT}·${SLOT_ASSIGN} 0 (R7 · rules qr_print_roles) · 학생은 편집이 없어 이탈 확인 없음 (셸 링크 바로 이동)`, async ({ browser }, info) => {
    const f = await fresh(info);
    const c1 = await prepCabinet(f);
    await prepCabinet(f);
    expect(CAB_RULES.qr_print_roles, "rules: 학생은 QR 인쇄 역할이 아니다").not.toContain("학생");
    const { context, page, viewport } = await openTemp(browser, info, f.student, withC(c1.id));
    const actions = watchActions(page);
    try {
      await waitCabinets(page);
      for (const c of [QR_PRINT, QR_SHEET, QR_LABEL, ADD, EDIT, SLOT_ASSIGN]) expect(await countComponent(page, c), `학생 ${c}`).toBe(0);
      await expect(main(page).getByRole("button", { name: /QR 인쇄/ }), "학생 'QR 인쇄' 버튼").toHaveCount(0);
      const home = shellLink(page, viewport, 13);
      await waitHydrated(home);
      await home.click();
      await expect.poll(() => new URL(page.url()).pathname, { timeout: 45_000 }).toBe("/");
      await expect(unsavedDialog(page)).toHaveCount(0);
      expect(actions.count(), "쓰기 요청 0건").toBe(0);
    } finally {
      await context.close();
    }
  });
});

// =====================================================================
// 공용 학교 A — 읽기·시트 열고 닫기만 (쓰기 요청 0건)
// =====================================================================

test(`[C2][S${SCREEN}] 학교A 교사: 폭 390 = ${SLOT_SHEET}·${QR_SHEET} 아래 끝 = tab-bar 위쪽 선(전폭, tab-bar 를 가리지 않음)·시트 버튼 가려지지 않음 / 폭 1440 = tab-bar 0 · 시트는 화면 가운데 카드 · 본문 2단(왼쪽 배치도 열 : 오른쪽 ${EDIT} 카드 ≈ 시안 11-desktop 860 : 420) (쓰기 0건)`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const tb = rules.tab_bar;
  const { context, page, viewport } = await openAs(browser, info, "teacher", SCREEN);
  const actions = watchActions(page);
  try {
    await waitEditable(page);
    const vp = page.viewportSize()!;
    const db = await dbView(page);
    const id0 = await activeId(page, db);
    const cab = db.cabinets.find((c) => c.id === id0)!;
    const placedKey = Object.keys(db.counts[cab.id])[0] ?? Object.keys(db.slotIds[cab.id])[0];
    expect(db.slotIds[cab.id][placedKey], "대조: DB 칸이 있는 칸 (넣기 후보를 열 수 있다)").toBeTruthy();
    const door = cab.door_type;

    const sheets: [string, () => Promise<void>, Locator][] = [
      [SLOT_SHEET, async () => { await slotAt(page, door, placedKey).click(); await assignButton(slotSheet(page)).click(); }, slotSheet(page)],
      [QR_SHEET, async () => { await main(page).locator(sel(QR_PRINT)).getByRole("button").click(); }, page.locator(sel(QR_SHEET))],
    ];
    if (viewport === "mobile") {
      const bar = page.locator(sel(tb.component));
      await expect(bar).toHaveCount(1);
      await expect(page.locator(sel(tb.item))).toHaveCount(tb.items);
      const barBox = await boxOf(bar);
      for (const [name, open, sheet] of sheets) {
        await open();
        await expect(sheet, name).toBeVisible();
        const s = await boxOf(sheet);
        expect(s.bottom, `${name}: 아래 끝 ≤ tab-bar 위쪽 선`).toBeLessThanOrEqual(barBox.top + 0.5);
        expect(barBox.top - s.bottom, `${name}: tab-bar 위쪽 선에 붙는다`).toBeLessThanOrEqual(1);
        expect(Math.round(s.left), `${name}: 전폭(왼쪽)`).toBe(0);
        expect(Math.round(s.right), `${name}: 전폭(오른쪽)`).toBe(vp.width);
        expect(s.top, `${name}: 화면 안`).toBeGreaterThanOrEqual(0);
        expect(await onTop(bar.locator(sel(tb.item)).first()), `${name}: tab-bar 를 가리지 않음`).toBe(true);
        expect(await onTop(bar.locator(sel(tb.item)).last()), `${name}: tab-bar 를 가리지 않음 (끝)`).toBe(true);
        const primary = sheet.locator(sel("button-primary")).last();
        await primary.scrollIntoViewIfNeeded();
        expect((await boxOf(primary)).bottom, `${name}: 아래 버튼이 tab-bar 위`).toBeLessThanOrEqual(barBox.top + 0.5);
        expect(await onTop(primary), `${name}: 아래 버튼이 가려지지 않음`).toBe(true);
        await sheetClose(sheet).click();
        await expect(sheet).toHaveCount(0);
      }
    } else {
      await expect(page.locator(sel(tb.component)), "1440 tab-bar").toHaveCount(0);
      await expect(page.locator(sel(tb.item)), "1440 tab-item").toHaveCount(0);
      // 2단: 왼쪽 열(전환·배치도·칸 없음 목록) · 오른쪽 편집 카드 — 시안 11-desktop page-body: layout-column 860 · cabinet-edit 420
      const left = await boxOf(main(page).locator(sel("cabinet-switcher")));
      const board = await boxOf(slots(page).first());
      const card = await boxOf(main(page).locator(sel(EDIT)));
      expect(card.left, "편집 카드는 배치도 오른쪽 열").toBeGreaterThan(board.right);
      expect(Math.abs(card.top - left.top), "두 열의 위 끝이 같다").toBeLessThanOrEqual(24);
      const leftWidth = card.left - left.left;
      const ratio = card.width / leftWidth;
      const want = 420 / (860 + 32);
      expect(Math.abs(ratio - want), `오른쪽 카드 : 왼쪽 열(사이 포함) ≈ 시안 420 : 892 (실제 ${card.width.toFixed(0)} : ${leftWidth.toFixed(0)})`).toBeLessThanOrEqual(0.06);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "가로 스크롤 없음").toBe(true);
      for (const [name, open, sheet] of sheets) {
        await open();
        await expect(sheet, name).toBeVisible();
        const s = await boxOf(sheet);
        expect(Math.abs((s.left + s.right) / 2 - vp.width / 2), `${name}: 화면 가로 가운데`).toBeLessThanOrEqual(16);
        expect(s.top, `${name}: 화면 안 (위)`).toBeGreaterThanOrEqual(0);
        expect(s.bottom, `${name}: 화면 안 (아래)`).toBeLessThanOrEqual(vp.height);
        expect(s.width, `${name}: 전폭이 아닌 카드`).toBeLessThan(vp.width / 2);
        await sheetClose(sheet).click();
        await expect(sheet).toHaveCount(0);
      }
    }
    expect(actions.count(), "쓰기 요청 0건").toBe(0);
  } finally {
    await context.close();
  }
});

/** 지금 활성 시약장 id (주소에 c 가 없으면 첫 pill) */
async function activeId(page: Page, db: DbView): Promise<string> {
  const c = new URL(page.url()).searchParams.get("c");
  if (c) return c;
  const first = (await readPills(page))[0];
  return db.cabinets.find((x) => x.label === first.label)!.id;
}

test(`[N1-ui][S${SCREEN}] 학교A 교사: ${SLOT_ASSIGN} 후보 = 자기 학교 칸 없음 시약(RLS 대조) · 다른 학교 시약명 0 (화면·응답 본문) · ${QR_LABEL} 학교명 1종 = 자기 학교 · ${QR_SHEET} 대상 = 자기 학교 시약장 (쓰기 0건)`, async ({ browser }, info) => {
  test.setTimeout(180_000);
  const { context, page, response } = await openAs(browser, info, "teacher", SCREEN);
  const actions = watchActions(page);
  try {
    await waitEditable(page);
    const me = await browserSession(page);
    const db = await dbView(page);
    const id = await activeId(page, db);
    const cab = db.cabinets.find((c) => c.id === id)!;
    // 다른 학교 시약명 (학교 B — 공용 계정 세션으로 읽을 수 없으므로 seed 이름으로 대조)
    const { client } = await browserClient(page);
    const own = await client.from("reagents").select("name");
    const ownNames = new Set((own.data ?? []).map((r) => r.name as string));
    const seedB = seedReagents().filter((r) => !ownNames.has(r.name));
    expect(seedB.length, "대조: 다른 학교 seed 시약").toBeGreaterThan(0);

    const key = Object.keys(db.slotIds[cab.id])[0];
    expect(key, "대조: DB 칸이 있는 칸").toBeTruthy();
    await slotAt(page, cab.door_type, key).click();
    const sheet = slotSheet(page);
    await expect(sheet).toBeVisible();
    await assignButton(sheet).click();
    const picker = sheetPicker(sheet);
    if (db.unassigned.length === 0) {
      await expect(picker.getByText(`'${CAB.unassigned_label}' 시약이 없어요`)).toBeVisible();
    } else {
      const cands = picker.locator(sel(ROW));
      await expect(cands, "후보 수 = 자기 학교 칸 없음 시약 수 (RLS)").toHaveCount(db.unassigned.length);
      for (const u of db.unassigned) await expect(cands.filter({ hasText: u.name }), `후보 "${u.name}"`).toHaveCount(1);
    }
    const shown = await page.locator("body").innerText();
    const html = await response!.text();
    for (const r of seedB) {
      expect(shown, `화면에 다른 학교 시약 "${r.name}"`).not.toContain(r.name);
      expect(html, `응답 본문에 다른 학교 시약 "${r.name}"`).not.toContain(r.name);
    }
    await sheetClose(sheet).click();

    await main(page).locator(sel(QR_PRINT)).getByRole("button").click();
    const qr = page.locator(sel(QR_SHEET));
    await expect(qr).toBeVisible();
    const all = qr.getByRole("button", { name: exact("모두") });
    if ((await all.count()) > 0) await all.click();
    await expect(qr.locator(sel(QR_LABEL)), "라벨 수 = 자기 학교 시약장 수").toHaveCount(db.cabinets.length);
    for (const t of await qr.locator(sel(QR_LABEL)).allInnerTexts()) expect(t, "QR 라벨에 자기 학교명").toContain(me.schoolName);
    expectOneSchool((await qr.locator(sel(QR_LABEL)).allInnerTexts()).join("\n"), me.schoolName, "QR 라벨");
    for (const c of db.cabinets) await expect(qr.locator(sel(QR_LABEL)).filter({ hasText: c.label }), `라벨 "${c.label}"`).toHaveCount(1);
    expectOneSchool(await page.locator("body").innerText(), me.schoolName, "화면");
    await sheetClose(qr).click();
    expect(actions.count(), "쓰기 요청 0건").toBe(0);
  } finally {
    await context.close();
  }
});

// =====================================================================
// R-ui — 공용 계정: R7 의 화면 11 컴포넌트 (교사·admin 에 있음, 학생 0)
// =====================================================================
for (const role of ["student", "teacher", "admin"] as const) {
  const staff = role !== "student";
  test(`[R-ui][S${SCREEN}] 학교A ${role === "student" ? "학생" : role === "teacher" ? "교사" : "admin"} ${CABINETS_HREF}: ${QR_PRINT} ${staff ? "1 (시안 11 관리 줄)" : "0 (R7)"} · 칸 시트를 열면 ${SLOT_ASSIGN} ${staff ? "1" : "0 (R7)"} · ${ADD} ${staff ? "1" : "0"} (쓰기 0건)`, async ({ browser }, info) => {
    test.setTimeout(150_000);
    const { context, page, viewport } = await openAs(browser, info, role, SCREEN);
    const actions = watchActions(page);
    try {
      await waitCabinets(page);
      const frame = frameCounts(`${SCREEN}-${viewport}`);
      expect(await countComponent(page, QR_PRINT), `${QR_PRINT}`).toBe(staff ? frame[QR_PRINT] : R7.max);
      expect(await countComponent(page, ADD), `${ADD}`).toBe(staff ? frame[ADD] : R7.max);
      const db = await dbView(page);
      const id = await activeId(page, db);
      const cab = db.cabinets.find((c) => c.id === id)!;
      const key = Object.keys(db.slotIds[cab.id])[0];
      await hydrated(slotAt(page, cab.door_type, key));
      await slotAt(page, cab.door_type, key).click();
      await expect(slotSheet(page)).toBeVisible();
      expect(await countComponent(page, SLOT_ASSIGN), `${SLOT_SHEET} 안 ${SLOT_ASSIGN}`).toBe(staff ? 1 : R7.max);
      await closeSlotSheet(page);
      for (const c of R7.components ?? []) if (!staff) expect(await countComponent(page, c), `학생 R7 ${c}`).toBe(R7.max);
      expect(actions.count(), "쓰기 요청 0건").toBe(0);
    } finally {
      await context.close();
    }
  });
}
