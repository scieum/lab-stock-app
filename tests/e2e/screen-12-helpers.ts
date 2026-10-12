// 화면 12 (QR 찾기 /scan) e2e 공용 도우미.
// 기준: harness/d7-data.md §26 (화면 12 경로·권한 · 모양 · 카메라 · QR 해석 · 번호로 찾기 · 결과 · 데이터), §14 (QR 내용 = {origin}/scan?cabinet={id}),
//       harness/dev-rules.json 1.19 (routes 12 · route_auth 12 · components), design/rules.json 1.26 (screens_required 12 · variants 12 · tab_bar · desktop_shell),
//       design/frames/12-mobile · 12-desktop · 12-result-mobile · 12-result-desktop.json.
// 기대 글자는 d7 §26 · 프레임에서 읽고, 기대 데이터는 브라우저 로그인 세션(publishable 키 + RLS)으로 읽는다. service role 미사용.
// 카메라: 브라우저 getUserMedia 를 가로채 캔버스 영상(captureStream)을 돌려준다. 테스트가 그 캔버스에 진짜 QR 그림(qrcode 패키지)을
// 그리면 화면의 읽기 도구(BarcodeDetector 또는 jsqr)가 실제로 영상에서 QR 을 읽는다 — 디코드 결과를 주입하지 않는다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import QRCode from "qrcode";
import { expect, type Browser, type BrowserContext, type Locator, type Page, type TestInfo } from "@playwright/test";
import type { Role } from "./db-helpers";
import { openAs } from "./auth-state";
import { waitWidthSettled } from "./desk-helpers";
import { frameNodes, frameOf } from "./pre-login-helpers";
import { browserClient, devRules, routeOf, rules, sel, type ViewportName } from "./screen-helpers";

export const SCREEN = 12;
export const SCAN = routeOf(SCREEN);
export const REQUIRED = rules.screens_required[String(SCREEN)] as string[];
export const RESULT_VARIANT = (rules.variants[String(SCREEN)] ?? {}).result ?? [];
export const SHEET = "qr-result-sheet";
export const QR_SCAN = "qr-scan";
export const MANUAL = "qr-manual-entry";
export const TOAST = "ex-toast";
export const ROW = "reagent-row";
export const BADGE = "badge-low-stock";
export const DRAWER = "detail-drawer";
export const SEGMENT = "segmented-control";
export const CAB_NUMBER = "cabinet-number";
export const PILL_SOFT = "button-pill-soft";
export const OUTLINE = "button-outline";
export const LAYOUT_HREF = (id: string) => `${routeOf(11)}?c=${id}`;
export const DETAIL_HREF = (id: string) => routeOf(3).replace("[id]", id);

// ---------- d7 §26 문구 (원문에 그대로 있는지 전제 테스트가 확인한다) ----------

const D7 = readFileSync(join(process.cwd(), "harness", "d7-data.md"), "utf8").replace(/\r\n/g, "\n");
export const D7_26 = (() => {
  const s = D7.indexOf("## 26.");
  if (s < 0) throw new Error("d7 §26 없음");
  const e = D7.indexOf("\n## ", s + 5);
  return D7.slice(s, e < 0 ? undefined : e);
})();
export const D7_14 = (() => {
  const s = D7.indexOf("## 14.");
  const e = D7.indexOf("\n## ", s + 5);
  return D7.slice(s, e);
})();

/** d7 §26 표의 한 줄 (첫 칸 = 항목 이름) */
export function d7Row(item: string): string {
  const line = D7_26.split("\n").find((l) => l.startsWith(`| ${item} |`));
  if (!line) throw new Error(`d7 §26 "${item}" 줄 없음`);
  return line;
}

/** d7 §26 "번호로 찾기": 숫자가 아니면 */
export const NOT_NUMBER = /숫자가 아니면 "([^"]+)"/.exec(d7Row("번호로 찾기"))![1];
/** d7 §26 "번호로 찾기": 없으면 "{n}번 시약장이 없어요" */
const MISSING_TEMPLATE = /없으면 입력 아래 오류 "([^"]+)"/.exec(d7Row("번호로 찾기"))![1];
export const missingText = (n: number) => MISSING_TEMPLATE.replace("{n}", String(n));
/** d7 §26 "QR 해석": 다른 학교 = "{학교명} 시약장 QR이 아니에요" · 시약장 QR 아님 = "시약장 QR이 아니에요" */
const NOT_OURS_TEMPLATE = /다른 학교·삭제된 시약장 = ex-toast "([^"]+)"/.exec(d7Row("QR 해석"))![1];
export const notOursText = (school: string) => NOT_OURS_TEMPLATE.replace("{학교명}", school);
export const NOT_QR = /시약장 QR 이 아닌 코드 = ex-toast "([^"]+)"/.exec(d7Row("QR 해석"))![1];
/** d7 §26 "카메라": 권한 거부·카메라 없음 안내 */
export const UNAVAILABLE = /안내 "([^"]+)"/.exec(d7Row("카메라"))![1];
/** d7 §26 "결과": 시약 0개 문구 · 배치도 버튼 */
export const EMPTY = /시약 0개면 시트 안 "([^"]+)"/.exec(d7Row("결과 (12-result)"))![1];
export const LAYOUT_LABEL = /button-pill-soft "([^"]+)" → `\/cabinets\?c=\{id\}`/.exec(d7Row("결과 (12-result)"))![1];
/** d7 §26 "화면 12 모양": segmented-control "QR 스캔 | 번호로 찾기" */
export const MODES = (() => {
  const m = /segmented-control "([^"|\\]+) \\\| ([^"]+)"/.exec(d7Row("화면 12 모양"));
  if (!m) throw new Error("d7 §26 segmented-control 문구 없음");
  return { scan: m[1].trim(), manual: m[2].trim() };
})();
/** d7 §26 "번호로 찾기": 정수(1~9999) */
export const NUMBER_RANGE = (() => {
  const m = /정수\((\d+)~(\d+)\)/.exec(d7Row("번호로 찾기"))!;
  return { min: Number(m[1]), max: Number(m[2]) };
})();

// ---------- 프레임 ----------

export type FNode = ReturnType<typeof frameNodes>[number] & {
  cornerRadius?: number | number[] | null;
  text?: { characters: string; fontSize: number; fontWeight: number } | null;
};

export const frameName = (viewport: ViewportName, result = false) => `${SCREEN}-${result ? "result-" : ""}${viewport}`;

/** 프레임에서 이름이 name 이고 조상에 ancestor 가 있는 첫 노드 */
export function fnode(frame: string, name: string, ancestor?: string): FNode {
  const n = (frameOf(frame).nodes as FNode[]).find((x) => x.name === name && (!ancestor || x.path.includes(ancestor)));
  if (!n) throw new Error(`프레임 ${frame} 에 ${ancestor ? `${ancestor} 안 ` : ""}${name} 없음`);
  return n;
}

/** 프레임에서 조상에 ancestor 가 있는 TEXT 노드 글자 (문서 순서) */
export function ftexts(frame: string, name: string, ancestor: string): string[] {
  return (frameOf(frame).nodes as FNode[]).filter((x) => x.name === name && x.type === "TEXT" && x.path.includes(ancestor)).map((x) => x.text!.characters);
}

/** 프레임의 dev-rules components 이름별 개수 */
export function frameComponentCounts(frame: string, ancestor?: string): Record<string, number> {
  const known = new Set(Object.keys(devRules.components));
  const out: Record<string, number> = {};
  for (const n of frameOf(frame).nodes) if (known.has(n.name) && (!ancestor || n.path.includes(ancestor))) out[n.name] = (out[n.name] ?? 0) + 1;
  return out;
}

// ---------- 기대 데이터 (RLS) ----------

export type ExpectRow = { id: string; name: string; stock: string; slot: string; low: boolean };
export type ExpectCabinet = { id: string; number: number; label: string; door: string; shelves: number; caption: string; rows: ExpectRow[] };

/** design/rules.json cabinet.door_types 첫째 = 양문형 (좌·우) */
const DOUBLE = (JSON.parse(readFileSync(join(process.cwd(), "design", "rules.json"), "utf8")) as { cabinet: { door_types: string[] } }).cabinet.door_types[0];

/** d7 §26 칸 위치 "좌 1단" (양문형 = 좌·우 + 단, 단문형 = 단만 — d7 §9) */
export function slotText(door: string, side: string, shelf: number): string {
  return door === DOUBLE ? `${side === "R" ? "우" : "좌"} ${shelf}단` : `${shelf}단`;
}

/** d7 §26 캡션 "{문 종류} · {N}단 · 시약 {k}개" */
export const captionText = (door: string, shelves: number, k: number) => `${door} · ${shelves}단 · 시약 ${k}개`;

/** 재고 글자 비교용 (시안 "500 g" · "500g" 둘 다 — 공백 무시) */
export const squash = (s: string) => s.replace(/\s+/g, "");
export const stockText = (stock: number, unit: string) => `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(stock)}${unit}`;

/** 로그인 세션(RLS)으로 읽은 자기 학교 시약장 + 그 칸의 보관 안 된 시약 (칸 순서 = 문 → 단, 같은 칸은 이름순) */
export async function ownCabinets(page: Page): Promise<ExpectCabinet[]> {
  const { client } = await browserClient(page);
  const [c, s, r] = await Promise.all([
    client.from("cabinets").select("id, number, label, door_type, shelves").order("number"),
    client.from("cabinet_slots").select("id, cabinet_id, side, shelf"),
    client.from("reagents").select("id, name, stock, unit, min_stock, slot_id").not("slot_id", "is", null).is("deleted_at", null),
  ]);
  for (const q of [c, s, r]) if (q.error) throw new Error(`대조 조회 실패: ${q.error.message}`);
  const slots = new Map((s.data ?? []).map((x) => [x.id as string, x]));
  return (c.data ?? []).map((cab) => {
    const rows = (r.data ?? [])
      .map((x) => ({ x, slot: slots.get(x.slot_id as string) }))
      .filter((v) => v.slot && v.slot.cabinet_id === cab.id)
      .map((v) => ({
        id: v.x.id as string,
        name: v.x.name as string,
        stock: stockText(Number(v.x.stock), v.x.unit as string),
        slot: slotText(cab.door_type as string, v.slot!.side as string, Number(v.slot!.shelf)),
        low: v.x.min_stock !== null && Number(v.x.stock) < Number(v.x.min_stock),
        side: v.slot!.side as string,
        shelf: Number(v.slot!.shelf),
      }))
      .sort((a, b) => (a.side === b.side ? 0 : a.side === "L" ? -1 : 1) || a.shelf - b.shelf || a.name.localeCompare(b.name, "ko") || a.id.localeCompare(b.id))
      .map(({ id, name, stock, slot, low }) => ({ id, name, stock, slot, low }));
    return {
      id: cab.id as string,
      number: Number(cab.number),
      label: cab.label as string,
      door: cab.door_type as string,
      shelves: Number(cab.shelves),
      caption: captionText(cab.door_type as string, Number(cab.shelves), rows.length),
      rows,
    };
  });
}

/** 자기 학교 시약장 중 시약이 있고 재고 부족 시약이 하나 이상인 것 (양성 대조) */
export function cabinetWithLow(cabs: ExpectCabinet[]): ExpectCabinet {
  const c = cabs.find((x) => x.rows.length > 0 && x.rows.some((r) => r.low) && x.rows.some((r) => !r.low));
  expect(c, "대조: 시약이 있고 재고 부족·부족 아님 시약이 섞인 시약장 (seed)").toBeTruthy();
  return c!;
}

// ---------- 카메라 (getUserMedia 가로채기) ----------

export type CameraMode = "canvas" | "deny";

/**
 * 새 문서마다 getUserMedia 를 가로챈다.
 * canvas: 640×480 흰 캔버스 영상(captureStream). window.__qrShow(dataUrl|null) 로 가운데에 QR 그림을 그리거나 지운다.
 * deny: NotAllowedError (권한 거부).
 * window.__gum = 호출 수, window.__streams = 돌려준 영상들 (트랙 readyState 로 카메라 꺼짐을 본다).
 */
export async function installCamera(context: BrowserContext, mode: CameraMode): Promise<void> {
  await context.addInitScript((m: string) => {
    const w = window as unknown as Record<string, unknown>;
    w.__gum = 0;
    w.__streams = [] as MediaStream[];
    w.__qrImg = null;
    w.__qrShow = (url: string | null) =>
      new Promise<void>((resolve) => {
        if (!url) {
          w.__qrImg = null;
          resolve();
          return;
        }
        const img = new Image();
        img.onload = () => {
          w.__qrImg = img;
          resolve();
        };
        img.src = url;
      });
    const md = (navigator.mediaDevices ?? {}) as MediaDevices;
    if (!navigator.mediaDevices) Object.defineProperty(navigator, "mediaDevices", { value: md, configurable: true });
    md.getUserMedia = async () => {
      w.__gum = (w.__gum as number) + 1;
      if (m === "deny") throw new DOMException("Permission denied", "NotAllowedError");
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext("2d")!;
      const draw = () => {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const img = w.__qrImg as HTMLImageElement | null;
        if (img) ctx.drawImage(img, 170, 90, 300, 300);
      };
      draw();
      const timer = setInterval(draw, 50);
      const stream = canvas.captureStream(20);
      for (const t of stream.getTracks()) {
        const stop = t.stop.bind(t);
        t.stop = () => {
          clearInterval(timer);
          stop();
        };
      }
      (w.__streams as MediaStream[]).push(stream);
      return stream;
    };
  }, mode);
}

/** QR 그림 (dataURL) — 화면 12 가 읽을 글자 그대로 */
export function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { margin: 2, width: 300, errorCorrectionLevel: "M" });
}

export async function showQr(page: Page, text: string | null): Promise<void> {
  const url = text === null ? null : await qrDataUrl(text);
  await page.evaluate((u) => (window as unknown as { __qrShow: (x: string | null) => Promise<void> }).__qrShow(u), url);
}

export const gumCalls = (page: Page) => page.evaluate(() => (window as unknown as { __gum: number }).__gum);
/** 살아 있는(끝나지 않은) 카메라 트랙 수 */
export const liveTracks = (page: Page) =>
  page.evaluate(() => ((window as unknown as { __streams: MediaStream[] }).__streams ?? []).flatMap((s) => s.getTracks()).filter((t) => t.readyState === "live").length);

/** 시약장 QR 내용 (d7 §14: `{origin}/scan?cabinet={cabinet id}`) */
export const cabinetQr = (origin: string, id: string) => `${origin}${SCAN}?cabinet=${id}`;

// ---------- 화면 열기 ----------

export type ScanPage = { context: BrowserContext; page: Page; viewport: ViewportName };

/**
 * 역할 저장 세션으로 열고(openAs), 카메라 가로채기를 설치한 뒤 path 를 다시 연다 (가로채기는 새 문서부터 적용).
 */
export async function openScan(browser: Browser, info: TestInfo, role: Role, path: string = SCAN, camera: CameraMode = "canvas"): Promise<ScanPage> {
  const { context, page, viewport } = await openAs(browser, info, role, SCREEN, SCAN);
  await installCamera(context, camera);
  await page.goto(path);
  await page.waitForLoadState("load");
  return { context, page, viewport };
}

/** 화면 12 가 그려지고 하이드레이션·폭 정리가 끝날 때까지 */
export async function waitScan(page: Page): Promise<void> {
  await expect.poll(() => new URL(page.url()).pathname, { message: "화면 12 경로", timeout: 45_000 }).toBe(SCAN);
  await expect(page.locator(sel(QR_SCAN)).or(page.locator(sel(MANUAL))).first(), "화면 12 본문").toBeVisible({ timeout: 45_000 });
  await waitWidthSettled(page);
  // 하이드레이션: 번호 찾기 버튼(모바일 = qr-manual-entry 버튼, 데스크톱 = 찾기)에 React 속성
  const btn = page.locator(`${sel(MANUAL)} button`).first();
  await expect
    .poll(() => btn.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps"))), { message: "하이드레이션", timeout: 30_000 })
    .toBe(true);
}

/** 카메라가 영상을 받는 중 (video 에 영상이 붙고 재생 프레임이 있다) */
export async function waitCameraLive(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const v = document.querySelector(`[data-component="qr-scan"] video`) as HTMLVideoElement | null;
          return Boolean(v && v.srcObject && v.readyState >= 2 && v.videoWidth > 0);
        }),
      { message: "카메라 영상 재생", timeout: 30_000 },
    )
    .toBe(true);
}

export const sheet = (page: Page): Locator => page.locator(sel(SHEET));
export const sheetTitle = (page: Page): Locator => sheet(page).locator('[data-name="sheet-title-text"]');
export const sheetCaption = (page: Page): Locator => sheet(page).locator('[data-name="sheet-caption"]');
export const sheetClose = (page: Page): Locator => sheet(page).locator('[data-name="sheet-close"]');
export const toasts = (page: Page): Locator => page.locator(sel(TOAST));
export const manualCard = (page: Page): Locator => page.locator(`${sel(MANUAL)}:has(input)`);
export const manualInput = (page: Page): Locator => manualCard(page).locator("input");
export const manualError = (page: Page): Locator => manualCard(page).locator('[role="alert"]');
/** 결과의 배치도 보기 (모바일 = 시트 안, 데스크톱 = drawer-actions) */
export const layoutLink = (page: Page): Locator => page.locator(`${sel(SHEET)}, ${sel(DRAWER)}`).getByRole("link", { name: LAYOUT_LABEL });

/** 번호로 찾기: 모바일은 segmented "번호로 찾기" 로 바꾼 뒤, 데스크톱은 옆 카드에 바로 */
export async function findByNumber(page: Page, viewport: ViewportName, value: string): Promise<void> {
  if (viewport === "mobile" && (await manualInput(page).count()) === 0) {
    await page.locator(sel(SEGMENT)).getByRole("tab", { name: MODES.manual, exact: true }).click();
    await expect(manualInput(page), "번호로 찾기 입력 카드").toBeVisible();
  }
  await manualInput(page).fill(value);
  await manualCard(page).getByRole("button", { name: "찾기", exact: true }).click();
}

/** 결과가 열렸고 그 시약장이다 (주소창 ?cabinet={id}) */
export async function expectResultOpen(page: Page, cab: ExpectCabinet, what: string): Promise<void> {
  await expect(sheet(page), `${what}: ${SHEET} 1`).toHaveCount(1, { timeout: 30_000 });
  await expect(sheetTitle(page), `${what}: 시트 제목 = 시약장 이름`).toHaveText(cab.label);
  await expect.poll(() => new URL(page.url()).search, { message: `${what}: 주소 ?cabinet={id}` }).toBe(`?cabinet=${cab.id}`);
}

/** 결과 내용 = 기대 시약장 (머리·목록·배치도 보기) */
export async function expectResultContent(page: Page, viewport: ViewportName, cab: ExpectCabinet, what: string): Promise<void> {
  const s = sheet(page);
  await expect(s.locator(sel(CAB_NUMBER)), `${what}: ${CAB_NUMBER} 1`).toHaveCount(1);
  await expect(s.locator(sel(CAB_NUMBER)), `${what}: ${CAB_NUMBER} = 번호`).toHaveText(String(cab.number));
  await expect(sheetCaption(page), `${what}: 캡션`).toHaveText(cab.caption);
  await expect(layoutLink(page), `${what}: "${LAYOUT_LABEL}" 1`).toHaveCount(1);
  await expect(layoutLink(page), `${what}: "${LAYOUT_LABEL}" → ${LAYOUT_HREF(cab.id)}`).toHaveAttribute("href", LAYOUT_HREF(cab.id));
  if (cab.rows.length === 0) {
    await expect(s.getByText(EMPTY, { exact: true }), `${what}: "${EMPTY}"`).toBeVisible();
    await expect(s.locator(sel(ROW)), `${what}: ${ROW} 0`).toHaveCount(0);
    await expect(s.locator("table"), `${what}: 결과 표 0`).toHaveCount(0);
    return;
  }
  await expect(s.getByText(EMPTY, { exact: true }), `${what}: 빈 문구 0`).toHaveCount(0);
  if (viewport === "mobile") {
    const rows = s.locator(sel(ROW));
    await expect(rows, `${what}: ${ROW} = 시약 수`).toHaveCount(cab.rows.length);
    const got = await rows.evaluateAll((els) =>
      els.map((el) => ({
        text: (el as HTMLElement).innerText,
        href: el.getAttribute("href"),
        badges: el.querySelectorAll('[data-component="badge-low-stock"]').length,
        icons: [...el.querySelectorAll("svg")].filter((svg) => !svg.closest('[data-component="badge-low-stock"]')).length,
      })),
    );
    const frameIcons = (frameOf(frameName("mobile", true)).nodes as FNode[]).filter((n) => n.path.includes(ROW) && n.type === "VECTOR").length;
    cab.rows.forEach((r, i) => {
      const g = got[i];
      const lines = g.text.split("\n").map((t) => t.trim()).filter(Boolean);
      expect(lines[0], `${what}: ${i + 1}행 이름 (칸 순서)`).toBe(r.name);
      expect(squash(g.text), `${what}: "${r.name}" 재고`).toContain(squash(r.stock));
      expect(lines, `${what}: "${r.name}" 칸 위치`).toContain(r.slot);
      expect(g.badges, `${what}: "${r.name}" ${BADGE} ${r.low ? 1 : 0}`).toBe(r.low ? 1 : 0);
      expect(g.href, `${what}: "${r.name}" 행 → 화면 3`).toBe(DETAIL_HREF(r.id));
      expect(g.icons, `${what}: "${r.name}" 화살표 아이콘 = 시안 reagent-row 아이콘 수`).toBe(frameIcons);
    });
    return;
  }
  // 데스크톱 result-table: 시약명 · 칸 위치 · 재고 · 상태
  const table = s.locator('[data-name="result-table"] table');
  await expect(table, `${what}: result-table 1`).toHaveCount(1);
  const head = (await table.locator("thead th").allInnerTexts()).map((t) => t.trim());
  expect(head, `${what}: 표 머리 = 시안 table-head`).toEqual(ftexts(frameName("desktop", true), "label", "table-head"));
  const trs = table.locator("tbody tr");
  await expect(trs, `${what}: 표 행 = 시약 수`).toHaveCount(cab.rows.length);
  for (let i = 0; i < cab.rows.length; i += 1) {
    const r = cab.rows[i];
    const tds = trs.nth(i).locator("td");
    await expect(tds, `${what}: ${i + 1}행 칸 4`).toHaveCount(head.length);
    await expect(tds.nth(0), `${what}: ${i + 1}행 시약명 (칸 순서)`).toHaveText(r.name);
    await expect(tds.nth(0).locator("a"), `${what}: "${r.name}" → 화면 3`).toHaveAttribute("href", DETAIL_HREF(r.id));
    await expect(tds.nth(1), `${what}: "${r.name}" 칸 위치`).toHaveText(r.slot);
    expect(squash(await tds.nth(2).innerText()), `${what}: "${r.name}" 재고`).toBe(squash(r.stock));
    await expect(tds.nth(3).locator(sel(BADGE)), `${what}: "${r.name}" 상태 ${BADGE}`).toHaveCount(r.low ? 1 : 0);
  }
}

/** 결과가 닫혔다 (주소 /scan, 시트 0) */
export async function expectResultClosed(page: Page, what: string): Promise<void> {
  await expect(sheet(page), `${what}: ${SHEET} 0`).toHaveCount(0, { timeout: 15_000 });
  await expect.poll(() => `${new URL(page.url()).pathname}${new URL(page.url()).search}`, { message: `${what}: 주소 ${SCAN}` }).toBe(SCAN);
}

/** 화면에 뜬 토스트 글자 (d7 §26 ex-toast) */
export async function expectToast(page: Page, text: string, what: string): Promise<void> {
  await expect(toasts(page).filter({ hasText: text }), `${what}: ${TOAST} "${text}"`).toHaveCount(1, { timeout: 20_000 });
  await expect(toasts(page).first(), `${what}: 토스트 글자 그대로`).toHaveText(text);
}

/** 토스트가 DOM 에 새로 붙은 횟수를 센다 (같은 코드 연속 읽기 = 한 번) */
export async function watchToasts(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __toastAdds: string[]; __toastWatch?: boolean };
    w.__toastAdds = [];
    // 관찰자는 문서마다 하나 (다시 부르면 기록만 비운다)
    if (w.__toastWatch) return;
    w.__toastWatch = true;
    new MutationObserver((muts) => {
      for (const m of muts)
        for (const n of m.addedNodes) {
          if (!(n instanceof HTMLElement)) continue;
          const els = n.matches('[data-component="ex-toast"]') ? [n] : [...n.querySelectorAll('[data-component="ex-toast"]')];
          for (const e of els) w.__toastAdds.push((e as HTMLElement).innerText);
        }
    }).observe(document.body, { subtree: true, childList: true });
  });
}
export const toastAdds = (page: Page) => page.evaluate(() => (window as unknown as { __toastAdds: string[] }).__toastAdds);

/** 시트(결과)가 DOM 에 새로 붙은 횟수 */
export async function watchSheets(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __sheetAdds: number; __sheetWatch?: boolean };
    w.__sheetAdds = 0;
    if (w.__sheetWatch) return;
    w.__sheetWatch = true;
    new MutationObserver((muts) => {
      for (const m of muts)
        for (const n of m.addedNodes) {
          if (!(n instanceof HTMLElement)) continue;
          if (n.matches('[data-component="qr-result-sheet"]') || n.querySelector('[data-component="qr-result-sheet"]')) w.__sheetAdds += 1;
        }
    }).observe(document.body, { subtree: true, childList: true });
  });
}
export const sheetAdds = (page: Page) => page.evaluate(() => (window as unknown as { __sheetAdds: number }).__sheetAdds);

/** 학교 B 계정 세션으로 학교 B 시약장·학교명 (RLS) */
export async function schoolBView(browser: Browser, info: TestInfo): Promise<{ schoolName: string; cabs: ExpectCabinet[] }> {
  const { context, page } = await openAs(browser, info, "schoolB", 13, routeOf(13));
  try {
    const { client, userId } = await browserClient(page);
    const prof = await client.from("profiles").select("school_id").eq("user_id", userId).single();
    const sch = await client.from("schools").select("name").eq("id", prof.data!.school_id as string).single();
    return { schoolName: sch.data!.name as string, cabs: await ownCabinets(page) };
  } finally {
    await context.close();
  }
}
