// d7 §27 영문 문서 → 한국어 시약명 (화면 5·7) e2e 도우미.
// 기준: harness/d7-data.md §27(AI 출력 name·originalName·cas · 시약 연결 순서 · 화면 "원문: {originalName}" caption text-muted · 테스트),
//       §13(화면 5 중복 합치기 "N개 행을 합쳤어요") · §21(화면 7 서류로 입고), design/rules.json (typography.sizes · colors),
//       design 새 프레임 3-desktop (text-muted = 머리 칸 label 글자색, qa-d7-26 과 같은 원본).
// 공용 학교 A 계정은 화면을 열고 가로챈 추출 결과의 확인 표까지만 본다 (저장 요청은 끊고 0건을 단언).
// 학교 A 시약 목록은 로그인 세션(publishable 키 + RLS)으로 읽는다 — service role 미사용.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { browserClient, rules } from "./screen-helpers";
import { newFrame } from "./desk-helpers";

const D7 = readFileSync(join(process.cwd(), "harness", "d7-data.md"), "utf8");
const at = D7.indexOf("## 27.");
/** d7 §27 본문 */
export const S27 = at >= 0 ? D7.slice(at, D7.indexOf("\n## ", at + 5) > 0 ? D7.indexOf("\n## ", at + 5) : undefined) : "";
/** 원문 줄 앞말: "원문: {originalName}" → "원문: " */
export const ORIGINAL_PREFIX = /"(원문: )\{originalName\}"/.exec(S27)?.[1] ?? "";
export const originalText = (s: string) => `${ORIGINAL_PREFIX}${s}`;
/** d7 §13 중복 합치기 안내 "N개 행을 합쳤어요" */
const MERGE_TEMPLATE = /"(N개 행을 합쳤어요)"/.exec(D7)?.[1] ?? "";
export const mergedText = (n: number) => MERGE_TEMPLATE.replace("N", String(n));
/** 원문 줄 = caption: rules typography 가장 작은 크기 */
export const CAPTION_SIZE = Math.min(...(rules as unknown as { typography: { sizes: number[] } }).typography.sizes);
/** text-muted = 시안 3-desktop 머리 칸 label 글자색 (rules colors.allowed 안의 회색) */
export const TEXT_MUTED = newFrame("3-desktop").find((n) => n.name === "label" && n.path.includes("table-head"))!.fills![0];
export const rgb = (hex: string) => {
  const h = hex.replace("#", "");
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
};

/** 다른 스펙이 학교 A 에 잠깐 만드는 임시 시약 이름 접두사 */
const FOREIGN_TEMP = ["R-db-", "N1-db-", "S7-ui-"];
const HANGUL = /[가-힣]/;

/** CAS 번호 꼴 + 검사 숫자 (CAS 규칙 그대로 — 구현 함수를 쓰지 않는다) */
export function casValid(s: string | null | undefined): s is string {
  const m = /^(\d{2,7})-(\d{2})-(\d)$/.exec((s ?? "").trim());
  if (!m) return false;
  const digits = (m[1] + m[2]).split("").reverse();
  const sum = digits.reduce((a, c, i) => a + Number(c) * (i + 1), 0);
  return sum % 10 === Number(m[3]);
}

export type OwnReagent = { id: string; name: string; unit: string; cas_no: string | null };

/** 로그인 세션(RLS)으로 보이는 자기 학교 시약 — 다른 스펙의 임시 시약은 뺀다 */
export async function ownReagents(page: Page): Promise<OwnReagent[]> {
  const { client } = await browserClient(page);
  const r = await client.from("reagents").select("id, name, unit, cas_no").order("name");
  if (r.error) throw new Error(`reagents 조회 실패: ${r.error.message}`);
  return ((r.data ?? []) as OwnReagent[]).filter((x) => !FOREIGN_TEMP.some((p) => x.name.startsWith(p)));
}

export type Picks = {
  /** 한국어 이름으로 연결될 시약 (원문 줄 있음) */
  byName: OwnReagent;
  /** CAS 로만 연결될 시약 (응답 이름은 다른 이름) */
  byCas: OwnReagent;
  /** byCas 와 같은 CAS 를 가진 자기 학교 시약 전부 (자동 연결이 고를 수 있는 후보) */
  casCandidates: OwnReagent[];
  /** 한국어 이름으로 연결될 시약 (원문 null — 원문 줄 0) */
  plain: OwnReagent;
};

/**
 * 학교 A 시약 중 고른다: 한글 이름 · 단위 mL/g (화면 5 단위 선택·화면 7 규격 단위 모두 되는 것).
 * byCas = 검사 숫자가 맞는 cas_no (가능하면 학교 안에서 하나뿐인 CAS).
 */
export function pick(own: OwnReagent[]): Picks {
  const usable = own.filter((r) => HANGUL.test(r.name) && (r.unit === "mL" || r.unit === "g"));
  const withCas = usable.filter((r) => casValid(r.cas_no));
  expect(withCas.length, "준비: 학교 A 에 검사 숫자가 맞는 cas_no 를 가진 시약").toBeGreaterThan(0);
  const unique = withCas.filter((r) => own.filter((o) => (o.cas_no ?? "").trim() === r.cas_no!.trim()).length === 1);
  const byCas = (unique[0] ?? withCas[0])!;
  const casCandidates = own.filter((o) => (o.cas_no ?? "").trim() === byCas.cas_no!.trim());
  const rest = usable.filter((r) => r.id !== byCas.id && !casCandidates.some((c) => c.id === r.id));
  expect(rest.length, "준비: 학교 A 에 한국어 이름 연결용 시약 2개 이상 (CAS 시약 제외)").toBeGreaterThanOrEqual(2);
  return { byName: rest[0], byCas, casCandidates, plain: rest[1] };
}

/** 이름 연결이 생기지 않는 한국어 이름 (학교 A 에 없는 것인지 확인) */
export function freshName(own: OwnReagent[], base: string): string {
  expect(own.some((r) => r.name === base), `준비: 학교 A 에 '${base}' 없음`).toBe(false);
  return base;
}

/** 원문 줄의 글자·스타일·위치 */
export type OriginalLine = { text: string; fontSize: string; color: string; visible: boolean; belowName: boolean };

/**
 * 이름 칸(scope) 안의 [data-name="original-name"] 들을 읽는다.
 * nameSelector = 시약명 글자 요소 (원문 줄이 그 아래에 있는지 견준다).
 */
export async function readOriginals(scope: Locator, nameSelector: string): Promise<OriginalLine[]> {
  return scope.evaluate((el, nameSel) => {
    const nameEl = el.querySelector(nameSel) as HTMLElement | null;
    const nb = nameEl?.getBoundingClientRect();
    return Array.from(el.querySelectorAll('[data-name="original-name"]')).map((o) => {
      const cs = getComputedStyle(o);
      const b = (o as HTMLElement).getBoundingClientRect();
      return {
        text: ((o as HTMLElement).innerText ?? "").replace(/\s+/g, " ").trim(),
        fontSize: cs.fontSize,
        color: cs.color,
        visible: b.width > 0 && b.height > 0 && cs.visibility !== "hidden" && cs.display !== "none",
        belowName: !!nb && b.top >= nb.bottom - 1,
      };
    });
  }, nameSelector);
}

/** 원문 줄 1개 단언: 글자 · 크기 caption · 색 text-muted · 보임 · 시약명 아래 */
export function expectOriginal(lines: OriginalLine[], original: string, what: string): void {
  expect(lines.length, `${what}: 원문 줄 1`).toBe(1);
  const [l] = lines;
  expect(l.text, `${what}: 원문 줄 글자`).toBe(originalText(original));
  expect(l.fontSize, `${what}: 원문 줄 크기 ${CAPTION_SIZE}px`).toBe(`${CAPTION_SIZE}px`);
  expect(l.color, `${what}: 원문 줄 색 text-muted ${TEXT_MUTED}`).toBe(rgb(TEXT_MUTED));
  expect(l.visible, `${what}: 원문 줄 보임`).toBe(true);
  expect(l.belowName, `${what}: 원문 줄은 시약명 아래`).toBe(true);
}

/** 공용 계정 화면의 저장 서버 액션(POST + next-action)을 서버에 닿기 전에 끊는다 — count() 0 을 단언한다 */
export async function blockActions(context: BrowserContext, path: string): Promise<{ count: () => number }> {
  let n = 0;
  await context.route(
    (u) => u.pathname === path,
    async (route) => {
      const req = route.request();
      if (req.method() === "POST" && req.headers()["next-action"]) {
        n += 1;
        await route.abort("blockedbyclient").catch(() => undefined);
        return;
      }
      await route.fallback();
    },
  );
  return { count: () => n };
}
