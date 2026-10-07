// MSDS 찾기 화면 테스트 공용 (harness/d7-data.md §20, design/rules.json 1.18 msds · variants 2.msds-bulk · 3.msds · 7.msds · never.N2,
// design/frames/2-msds-bulk-* · 3-msds-* · 7-msds-*).
// - 문구는 시안 프레임 글자 · rules.json msds · d7 §20 문장에서 읽는다 (구현에서 읽지 않는다).
// - 실제 안전보건공단 호출 없음: 화면 테스트는 GET /api/msds/search 응답을 가로채 대체한다 (d7 §20 테스트 줄).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Locator, type Page, type Route } from "@playwright/test";
import { rules, sel } from "./screen-helpers";

export const API = "/api/msds/search";
export const MSDS_SEARCH = "msds-search";
export const MSDS_CANDIDATES = "msds-candidates";
export const MSDS_BULK_BANNER = "msds-bulk-banner";

type FrameNode = { name: string; path: string[]; text: { characters: string } | null };
const frame = (name: string): FrameNode[] =>
  (JSON.parse(readFileSync(join(process.cwd(), "design", "frames", `${name}.json`), "utf8")) as { frames: { nodes: FrameNode[] }[] }).frames[0].nodes;
const textAt = (nodes: FrameNode[], parent: string | string[], name: string): string => {
  const parents = Array.isArray(parent) ? parent : [parent];
  const n = nodes.find((x) => x.name === name && parents.every((p) => x.path.includes(p)) && x.text);
  if (!n) throw new Error(`프레임에 ${parents.join("/")}/${name} 글자 없음`);
  return n.text!.characters;
};
const F3 = frame("3-msds-mobile");
const F2 = frame("2-msds-bulk-mobile");

const D7 = readFileSync(join(process.cwd(), "harness", "d7-data.md"), "utf8");
export const S20 = D7.slice(D7.indexOf("## 20."), D7.indexOf("\n## ", D7.indexOf("## 20.") + 5));
const fromD7 = (re: RegExp, what: string): string => {
  const m = re.exec(S20);
  if (!m) throw new Error(`d7 §20 에서 ${what} 를 찾지 못함`);
  return m[1];
};

/** "MSDS 찾기" (시안 3-msds msds-search) */
export const FIND = textAt(F3, MSDS_SEARCH, "label");
/** "MSDS가 아직 없어요" (시안 3-msds msds-entry 캡션 · d7 §20) */
export const MISSING = (F3.find((x) => x.name === "caption" && x.path[x.path.length - 2] === "msds-entry")?.text?.characters ?? "");
/** "이 MSDS로" */
export const CONFIRM = textAt(F3, [MSDS_CANDIDATES, "button-primary"], "label");
/** "찾는 게 없어요 — 직접 입력" (후보가 있을 때) */
export const MORE_DIRECT = textAt(F3, "msds-direct", "label");
/** "찾지 못했어요 — 직접 입력" (0개, rules.json msds.candidates) */
export const NO_RESULT = (/0개면 '([^']+)'/.exec((rules as unknown as { msds: { candidates: string } }).msds.candidates) ?? [])[1] ?? "";
/** "한 번에 찾기" */
export const BULK_START = textAt(F2, [MSDS_BULK_BANNER, "button-pill-soft"], "label");
/** "건너뛰기" */
export const SKIP = textAt(F2, ["sheet-actions", "link-action"], "label");
/** "알맞은 MSDS를 골라 주세요" */
export const PICK_CAPTION = (F2.find((x) => x.name === "caption" && x.path[x.path.length - 2] === MSDS_CANDIDATES)?.text?.characters ?? "");
/** 띠 "MSDS 없는 시약 N종" (시안 2-msds-bulk 의 숫자 자리를 N 으로) */
const BANNER_TEMPLATE = (F2.find((x) => x.name === "label" && x.path[x.path.length - 2] === MSDS_BULK_BANNER)?.text?.characters ?? "").replace(/\d+/, "{n}");
export const bannerText = (n: number) => BANNER_TEMPLATE.replace("{n}", String(n));
/** 진행 "i / N" (시안 2-msds-bulk progress "1 / 4") */
const PROGRESS_TEMPLATE = textAt(F2, "sheet-title-row", "progress").replace(/^\d+/, "{i}").replace(/\d+$/, "{n}");
export const progressText = (i: number, n: number) => PROGRESS_TEMPLATE.replace("{i}", String(i)).replace("{n}", String(n));
/** 일괄 끝 "N종에 MSDS를 넣었어요" (d7 §20) */
const DONE_TEMPLATE = fromD7(/"(N종에 [^"]+)"/, "일괄 끝 문구");
export const doneText = (n: number) => DONE_TEMPLATE.replace("N", String(n));
/** 화면 3 저장 토스트 "MSDS를 넣었어요" (d7 §20 일괄 끝 문구의 공통 부분) */
export const SAVED = DONE_TEMPLATE.replace(/^N종에 /, "");
/** 한 번에 최대 (d7 §20 "한 번에 최대 20종") */
export const BULK_MAX = Number(fromD7(/한 번에 최대 (\d+)종/, "일괄 최대"));
/** 키 없음 503 문구 (d7 §20) */
export const NO_KEY_TEXT = fromD7(/키 없음 503 "([^"]+)"/, "키 없음 문구");

export const exact = (s: string) => new RegExp(`^\\s*${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);

export type Cand = { chemId: string; name: string; cas: string | null; msdsUrl: string };
const detail = (id: string) => `https://msds.kosha.or.kr/MSDSInfo/kcic/msdsdetail.do?chem_id=${id}&viewType=msds`;
/** 가로챈 응답의 후보 (질의어마다 이름이 달라 어느 시약의 후보인지 알 수 있게) */
export function candidatesFor(q: string): Cand[] {
  const h = [...q].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 900_000, 7) + 100_000;
  return [
    { chemId: String(h).padStart(6, "0"), name: `${q}`, cas: "7761-88-8", msdsUrl: detail(String(h).padStart(6, "0")) },
    { chemId: String(h + 1).padStart(6, "0"), name: `${q} 용액`, cas: "7757-79-1", msdsUrl: detail(String(h + 1).padStart(6, "0")) },
    { chemId: String(h + 2).padStart(6, "0"), name: `${q}(분석용)`, cas: null, msdsUrl: detail(String(h + 2).padStart(6, "0")) },
  ];
}

export type MsdsRoute = { queries: string[] };
/**
 * GET /api/msds/search 가로채기. reply(q) 가 null 이면 가로채지 않고 서버로 보낸다 (이 환경 = 키 없음 503).
 * 기본 = candidatesFor(q).
 */
export async function interceptSearch(
  page: Page,
  reply: (q: string) => { status?: number; body: unknown } | null = (q) => ({ body: { candidates: candidatesFor(q) } }),
): Promise<MsdsRoute> {
  const out: MsdsRoute = { queries: [] };
  await page.route(
    (u) => u.pathname === API,
    async (route: Route) => {
      const q = new URL(route.request().url()).searchParams.get("q") ?? "";
      out.queries.push(q);
      const r = reply(q);
      if (!r) return route.continue();
      await route.fulfill({ status: r.status ?? 200, contentType: "application/json", body: JSON.stringify(r.body) });
    },
  );
  return out;
}

export const sheet = (page: Page) => page.locator(sel(MSDS_CANDIDATES));
export const radios = (s: Locator) => s.getByRole("radio");
export const confirmButton = (s: Locator) => s.locator(sel("button-primary")).filter({ hasText: exact(CONFIRM) });
export const directLink = (s: Locator, text: string) => s.getByRole("button", { name: exact(text) });

/** 후보 행 글자 (이름 · "CAS …") 와 선택 */
export async function readRows(s: Locator): Promise<{ text: string; checked: boolean }[]> {
  const r = radios(s);
  const n = await r.count();
  const out: { text: string; checked: boolean }[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ text: (await r.nth(i).innerText()).replace(/\s+/g, " ").trim(), checked: (await r.nth(i).getAttribute("aria-checked")) === "true" });
  }
  return out;
}

/** 후보 시트가 결과를 보이는지: 행 = 후보 수 · 첫 행 선택 · 이름 + "CAS …"(없으면 CAS 없음 표기) */
export async function expectCandidates(s: Locator, cands: Cand[], what: string): Promise<void> {
  await expect(radios(s), `${what}: 후보 행 ${cands.length}`).toHaveCount(cands.length, { timeout: 15_000 });
  const rows = await readRows(s);
  expect(rows.map((r) => r.checked), `${what}: 결과가 오면 첫 후보 선택`).toEqual(cands.map((_, i) => i === 0));
  for (let i = 0; i < cands.length; i++) {
    expect(rows[i].text, `${what}: 행 ${i + 1} 이름`).toContain(cands[i].name);
    if (cands[i].cas) expect(rows[i].text, `${what}: 행 ${i + 1} CAS`).toContain(`CAS ${cands[i].cas}`);
  }
}

/** 화면 글자에 N2 금지어(rules.json never.N2.banned_terms) · 외부 API 호스트 0 */
export async function expectNoN2Terms(page: Page, what: string): Promise<void> {
  const text = (await page.locator("body").innerText()).toLowerCase();
  const banned = (rules as unknown as { never: { N2: { banned_terms: string[] } } }).never.N2.banned_terms;
  expect(banned.filter((t) => text.includes(t.toLowerCase())), `${what}: N2 금지어 0`).toEqual([]);
  expect(text, `${what}: 외부 API 주소 없음`).not.toContain("data.go.kr");
}
