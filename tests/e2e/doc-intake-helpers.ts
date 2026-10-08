// 서류로 입고 (화면 7, harness/d7-data.md §21 · design/rules.json 1.18 intake · variants["7"] doc-upload·doc-review·doc-fail·suggest·msds,
// design/frames/7-*.json) 화면 테스트 공용.
// - 문구는 시안 프레임 글자 · rules.json intake · d7 §21 문장에서 읽는다 (구현에서 읽지 않는다).
// - 실제 Gemini 호출 없음: 화면 테스트는 POST /api/intake/extract 응답을 가로채 대체한다 (d7 §21 테스트 줄).
//   가로채지 않은 요청은 서버로 간다 — 이 환경(로컬)은 키가 없어 503.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Locator, type Page, type Route } from "@playwright/test";
import { rules, sel } from "./screen-helpers";
import { framePath } from "../frames";

export const API = "/api/intake/extract";
export const DOC_UPLOAD = "doc-upload";
export const DOC_TABLE = "doc-intake-table";
export const REAGENT_LINK = "reagent-link";
export const NEW_FIELDS = "new-reagent-fields";

type FrameNode = { name: string; path: string[]; text: { characters: string } | null };
const frame = (name: string): FrameNode[] =>
  (JSON.parse(readFileSync(framePath(`${name}`), "utf8")) as { frames: { nodes: FrameNode[] }[] }).frames[0].nodes;
const texts = (nodes: FrameNode[], name: string, under?: string): string[] =>
  nodes.filter((n) => n.name === name && n.text && (!under || n.path.includes(under))).map((n) => n.text!.characters);
const one = (nodes: FrameNode[], name: string, under?: string): string => {
  const t = texts(nodes, name, under);
  if (t.length === 0) throw new Error(`프레임에 ${under ? `${under}/` : ""}${name} 글자 없음`);
  return t[0];
};

const F_UP = frame("7-mobile");
const F_PROC = frame("7-doc-upload-mobile");
const F_REV = frame("7-doc-review-mobile");
const F_FAIL = frame("7-doc-fail-mobile");
const F_SUG = frame("7-suggest-mobile");

/** "품의서·영수증·거래명세서를 올려 주세요" */
export const UPLOAD_HEADING = one(F_UP, "heading", DOC_UPLOAD);
/** "PDF·JPG·PNG, 4MB까지" */
export const UPLOAD_CAPTION = one(F_UP, "caption", DOC_UPLOAD);
/** "촬영하기" · "파일 선택" (button-pill-soft 2개) */
export const [CAMERA, PICK_FILE] = texts(F_UP, "label", "button-pill-soft");
/** "AI로 읽기" */
export const READ = one(F_UP, "label", "button-primary");
/** "읽는 중이에요" · "품목·규격·수량을 찾고 있어요" · "취소" */
export const READING = one(F_PROC, "heading", DOC_UPLOAD);
export const READING_BODY = one(F_PROC, "body", DOC_UPLOAD);
export const CANCEL = one(F_PROC, "label", "button-outline");
/** "읽은 내용 확인" · "고칠 곳이 있으면 고친 뒤 입고하세요" */
export const REVIEW_TITLE = one(F_REV, "heading", DOC_TABLE);
export const REVIEW_CAPTION = one(F_REV, "caption", "table-head");
/** "서류 날짜" (입고일 칸 라벨) */
export const DATE_LABEL = one(F_REV, "field-label", "doc-date");
/** "우리 학교 시약" · "바꾸기" · "빼기" · "새 시약으로 등록" */
export const LINK_CAPTION = one(F_REV, "caption", REAGENT_LINK);
const linkLabels = [...new Set(texts(F_REV, "label", REAGENT_LINK))];
export const CHANGE = linkLabels.find((l) => l === "바꾸기") ?? "";
export const EXCLUDE = linkLabels.find((l) => l === "빼기") ?? "";
export const NEW_REAGENT = linkLabels.find((l) => l.includes("새 시약")) ?? "";
/** "확인 후 입고" */
export const SUBMIT = one(F_REV, "label", "button-primary");
/** "MSDS 찾기" (new-reagent-fields 안 msds-search) · "아직 없어요" */
export const MSDS_FIND = one(F_REV, "label", "msds-search");
export const NO_MSDS = one(F_REV, "caption", "msds-row");
/** 새 시약 칸 라벨: 이름 · 보관 분류 · 단위 · 재고량 · MSDS */
export const NEW_FIELD_LABELS = texts(F_REV, "field-label", NEW_FIELDS);
/** "시약 아님 N개" (시안 "시약 아님 2개" 의 숫자 자리) */
const NOT_REAGENT_TEMPLATE = one(F_REV, "label", "not-reagent-group").replace(/\d+/, "{n}");
export const notReagentText = (n: number) => NOT_REAGENT_TEMPLATE.replace("{n}", String(n));
/** "서류에서 품목을 찾지 못했어요" · "글자가 잘 보이게 …" · "직접 입력" · "다른 파일 올리기" */
export const EMPTY_TITLE = one(F_FAIL, "heading", "ex-empty-state-card");
export const EMPTY_BODY = one(F_FAIL, "body", "ex-empty-state-card");
export const EMPTY_ACTION = one(F_FAIL, "label", "ex-empty-state-card");
export const AGAIN_HEADING = one(F_FAIL, "heading", DOC_UPLOAD);
/** 저장 뒤 토스트 "{N}개 품목을 입고했어요" (d7 §21 · 시안 7-suggest "3개 품목을 입고했어요") */
const DONE_TEMPLATE = one(F_SUG, "label", "ex-toast").replace(/^\d+/, "{n}");
export const doneText = (n: number) => DONE_TEMPLATE.replace("{n}", String(n));

const D7 = readFileSync(join(process.cwd(), "harness", "d7-data.md"), "utf8");
export const S21 = D7.slice(D7.indexOf("## 21."), D7.indexOf("\n## ", D7.indexOf("## 21.") + 5));
const fromD7 = (re: RegExp, what: string): string => {
  const m = re.exec(S21);
  if (!m) throw new Error(`d7 §21 에서 ${what} 를 찾지 못함`);
  return m[1];
};
/** "시약으로 넣기" (d7 §21 2단계) */
export const ADD_AS_REAGENT = fromD7(/"(시약으로 넣기)"/, "시약으로 넣기");
/** d7 §21 토스트 문구 = 시안 문구 */
export const DONE_D7 = fromD7(/ex-toast "(\{N\}개 품목을 입고했어요)"/, "저장 뒤 토스트");
/** 품목 최대 (d7 §21 "품목 최대 50") */
export const ITEMS_MAX = Number(fromD7(/품목 최대 (\d+)/, "품목 최대"));
/** 파일 한도 (rules.json intake.max_mb · file_types) */
const INTAKE = (rules as unknown as { intake: { max_mb: number; file_types: string[] } }).intake;
export const MAX_BYTES = INTAKE.max_mb * 1024 * 1024;
export const FILE_TYPES = INTAKE.file_types;
export const MIN_H = (rules as unknown as { button: { min_height: number } }).button.min_height;
export const VARIANTS = (rules as unknown as { variants: Record<string, Record<string, string[]>> }).variants["7"];

export const exact = (s: string) => new RegExp(`^\\s*${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);

// ---------------------------------------------------------------- 파일

const PDF_HEAD = Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n", "latin1");
// 1x1 PNG (브라우저 미리보기에서 깨지지 않게 진짜 그림)
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
export type Upload = { name: string; mimeType: string; buffer: Buffer };
export const DOC_PDF: Upload = { name: "거래명세서_1007.pdf", mimeType: "application/pdf", buffer: PDF_HEAD };
export const DOC_PNG: Upload = { name: "영수증.png", mimeType: "image/png", buffer: PNG_1PX };
export function pdfOf(bytes: number): Upload {
  const b = Buffer.alloc(bytes, 0x20);
  PDF_HEAD.copy(b, 0);
  return { name: "큰서류.pdf", mimeType: "application/pdf", buffer: b };
}

// ---------------------------------------------------------------- 추출 응답 (d7 §21 구조화 출력 모양)

export type DocItemBody = {
  name: string;
  spec: string | null;
  specAmount: number | null;
  specUnit: "mL" | "L" | "g" | "kg" | null;
  quantity: number;
  quantityUnit: string | null;
  isReagent: boolean;
  suggestedClass: string | null;
};
export const item = (name: string, specAmount: number | null, specUnit: DocItemBody["specUnit"], quantity: number, o: Partial<DocItemBody> = {}): DocItemBody => ({
  name,
  spec: specAmount !== null && specUnit ? `${specAmount} ${specUnit}` : null,
  specAmount,
  specUnit,
  quantity,
  quantityUnit: "병",
  isReagent: true,
  suggestedClass: null,
  ...o,
});

export type ExtractRoute = { calls: number; files: string[] };
/**
 * POST /api/intake/extract 가로채기. reply() 가 null 이면 가로채지 않고 서버로 보낸다.
 * delayMs 만큼 기다렸다 답한다 (처리 중 화면을 보려고).
 */
export async function interceptExtract(
  page: Page,
  reply: () => { status?: number; body: unknown; delayMs?: number } | null,
): Promise<ExtractRoute> {
  const out: ExtractRoute = { calls: 0, files: [] };
  await page.route(
    (u) => u.pathname === API,
    async (route: Route) => {
      out.calls += 1;
      const req = route.request();
      const ct = req.headers()["content-type"] ?? "";
      const raw = req.postDataBuffer()?.toString("latin1") ?? "";
      const m = /filename="([^"]*)"/.exec(raw);
      out.files.push(`${ct.split(";")[0]}|${m ? Buffer.from(m[1], "latin1").toString("utf8") : ""}`);
      const r = reply();
      if (!r) return route.continue();
      if (r.delayMs) await new Promise((res) => setTimeout(res, r.delayMs));
      await route.fulfill({ status: r.status ?? 200, contentType: "application/json", body: JSON.stringify(r.body) }).catch(() => undefined);
    },
  );
  return out;
}

// ---------------------------------------------------------------- locator

export const upload = (page: Page) => page.locator(`main ${sel(DOC_UPLOAD)}`);
export const fileInput = (page: Page) => upload(page).locator('input[type="file"]:not([capture])');
export const readButton = (page: Page) => upload(page).locator(sel("button-primary")).filter({ hasText: exact(READ) });
export const table = (page: Page) => page.locator(`main ${sel(DOC_TABLE)}`);
/** 표의 품목 행 (role=list "서류 품목" 의 항목 — "시약 아님" 묶음의 줄은 빼고) */
export const itemRows = (page: Page) => table(page).getByRole("list", { name: "서류 품목" }).getByRole("listitem");
export const rowOf = (page: Page, itemName: string) => itemRows(page).filter({ has: page.getByText(itemName, { exact: true }) });
export const linkOf = (row: Locator) => row.locator(sel(REAGENT_LINK));
export const fieldsOf = (row: Locator) => row.locator(sel(NEW_FIELDS));
export const submitButton = (page: Page) => page.locator(`main ${sel("button-primary")}`).filter({ hasText: exact(SUBMIT) });
export const dateInput = (page: Page) => table(page).getByLabel(DATE_LABEL);
export const amountInput = (row: Locator) => row.getByRole("textbox", { name: /입고량/ });
export const qtyInput = (row: Locator) => row.getByRole("textbox", { name: /수량/ });
export const notReagentToggle = (page: Page) => table(page).getByRole("button", { name: /^시약 아님 \d+개$/ });

/** 화면이 하이드레이션될 때까지 (main 안의 그 컴포넌트에 React props 가 붙음) */
export async function hydratedIn(page: Page, component: string): Promise<void> {
  await page.waitForFunction(
    (s) => {
      const f = document.querySelector(s);
      return !!f && Object.keys(f).some((k) => k.startsWith("__reactProps"));
    },
    `main ${sel(component)}`,
    { timeout: 30_000 },
  );
}

/** 서류 올리기 단계가 보이고 하이드레이션됨 */
export async function waitUpload(page: Page): Promise<void> {
  await expect(upload(page), DOC_UPLOAD).toHaveCount(1, { timeout: 30_000 });
  await page.waitForLoadState("load");
  await hydratedIn(page, DOC_UPLOAD);
}

/** 파일 고르기 (실제 input[type=file]) */
export async function pickFile(page: Page, file: Upload): Promise<void> {
  await fileInput(page).setInputFiles({ name: file.name, mimeType: file.mimeType, buffer: file.buffer });
}

/** 파일 고르기 → "AI로 읽기" → 확인 표 */
export async function readToReview(page: Page, file: Upload = DOC_PDF): Promise<void> {
  await pickFile(page, file);
  await expect(readButton(page), `"${READ}" 활성`).toBeEnabled();
  await readButton(page).click();
  await expect(table(page), DOC_TABLE).toHaveCount(1, { timeout: 30_000 });
}

/** 범위 안 [data-component^="button-"] 의 높이 ≥ rules.json button.min_height (보이는 것만) */
export async function expectButtonHeights(scope: Locator, what: string): Promise<number> {
  const els = scope.locator('[data-component^="button-"]');
  const n = await els.count();
  let seen = 0;
  for (let i = 0; i < n; i++) {
    const el = els.nth(i);
    if (!(await el.isVisible())) continue;
    const b = await el.boundingBox();
    const label = (await el.innerText()).replace(/\s+/g, " ").trim();
    expect(b!.height, `${what}: "${label}" 누름 높이 ≥ ${MIN_H}`).toBeGreaterThanOrEqual(MIN_H);
    seen += 1;
  }
  return seen;
}

/** 오늘 (Asia/Seoul) YYYY-MM-DD 와 며칠 앞뒤 */
export function kstDate(offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
