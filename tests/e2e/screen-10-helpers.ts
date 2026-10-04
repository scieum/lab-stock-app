// 화면 10 (사용 기록 내역, dev-rules.json routes["10"]) 테스트 공용 도우미.
// 기준: 디자인 s2-spec "## 화면 10", design/frames/10-{mobile|desktop}.json, harness/d7-data.md §7, dev-rules route_auth 10.
// - 문구(필터·안내·상세 라벨)는 위 명세·시안 문장에서 옮긴 상수다 (구현에서 읽지 않는다).
// - DB 값은 그 계정의 브라우저 세션(publishable 키 + RLS)으로만 읽고 쓴다. service role 미사용.
// - 운영 DB: 쓰기는 테스트 학교 A 의 UI 전용 고정 시약(이름 `R-db-UI10-fixture-{project}`)에만.
//   usage_logs 는 지울 수 없어 고정 시약은 남겨 두고 계속 재사용한다 (stock 은 쓸 때마다 되돌린다).
//   이름 접두사 R-db- 는 db-helpers pickReagent 가 건너뛰므로 seed 시약 칸을 쓰는 다른 스펙과 겹치지 않는다.
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { browserClient, devRules, routeOf, sel, type ViewportName } from "./screen-helpers";

export const SCREEN = 10;
export const ROW = "ex-data-table-cell";
export const MODAL = "ex-modal-card";
export const EMPTY = "ex-empty-state-card";
export const MSDS = "msds-entry";
export const SEGMENT = "segmented-control";
export const SEGMENT_ACTIVE = "segmented-control-active";
export const INPUT = "text-input";

// ---- s2-spec 화면 10 · 시안 10 프레임 · d7 §7 문구 ----
export const NAV_LABEL = "사용 기록 내역";
export const SCOPE_ALL = "전체";
export const SCOPE_MINE = "내 기록";
export const SEARCH_PLACEHOLDER = "시약명 검색";
export const EMPTY_TITLE = "아직 사용 기록이 없어요";
export const DETAIL_LABELS = ["사용자", "일시", "메모"] as const;
export const MSDS_LABEL = "MSDS 보기";
export const CLOSE_LABEL = "닫기";
export const MEMO_NONE = "-";
export const ACTIVE_TAB_LABEL = "기록";
export const ENTRY_LABEL = "사용 기록 입력";
/** s2-spec: 누른 행 배경 #e6f4fc */
export const PRESSED_ROW_BG = "rgb(230, 244, 252)";
/** d7 §7 기간: 최근 1개월(기본)·3개월·6개월·전체. value = 주소 쿼리 ?period 값 (기본값은 주소에서 생략) */
export const PERIODS = [
  { value: "1m", label: "최근 1개월", months: 1 },
  { value: "3m", label: "최근 3개월", months: 3 },
  { value: "6m", label: "최근 6개월", months: 6 },
  { value: "all", label: "전체", months: null },
] as const;
export type PeriodValue = (typeof PERIODS)[number]["value"];
export const DEFAULT_PERIOD: PeriodValue = "1m";
/** 한 번에 보여 주는 기록 수 상한 (d7 에 없는 구현 값 — 넘으면 목록 끝에 안내가 있어야 한다) */
export const LIST_CAP = 200;
/** DB 함수 usage_history 의 p_limit 상한 */
const DB_LIMIT = 500;

export const exact = (s: string) => new RegExp(`^\\s*${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);
export const squash = (s: string) => s.replace(/[\s,]/g, "");

export type Filter = { mine?: boolean; period?: PeriodValue; q?: string };

/** routes["10"] + ?mine · ?period · ?q */
export function historyPath(f: Filter & { raw?: Record<string, string> } = {}): string {
  const p = new URLSearchParams();
  if (f.mine) p.set("mine", "1");
  if (f.period && f.period !== DEFAULT_PERIOD) p.set("period", f.period);
  if (f.q) p.set("q", f.q);
  for (const [k, v] of Object.entries(f.raw ?? {})) p.set(k, v);
  const s = p.toString();
  return s ? `${routeOf(SCREEN)}?${s}` : routeOf(SCREEN);
}

/** 화면 10 에 속한 컴포넌트 (dev-rules components) */
export function screenComponents(): string[] {
  return Object.entries(devRules.components)
    .filter(([, screens]) => screens.includes(SCREEN))
    .map(([n]) => n);
}

type FrameNode = { name: string; text: { characters?: string } | null };

function frameNodes(screen: number, viewport: ViewportName): FrameNode[] {
  const j = JSON.parse(readFileSync(join(process.cwd(), "design", "frames", `${screen}-${viewport}.json`), "utf8")) as {
    frames: { nodes: FrameNode[] }[];
  };
  return j.frames[0].nodes;
}

/** design/frames/{screen}-{viewport}.json 의 노드 이름별 개수 */
export function frameCounts(viewport: ViewportName, screen: number = SCREEN): Record<string, number> {
  const out: Record<string, number> = {};
  for (const n of frameNodes(screen, viewport)) out[n.name] = (out[n.name] ?? 0) + 1;
  return out;
}

/** 시안 프레임의 글자 노드 (순서대로) */
export function frameTexts(viewport: ViewportName, screen: number = SCREEN): { name: string; characters: string }[] {
  return frameNodes(screen, viewport)
    .filter((n) => n.text && typeof n.text.characters === "string")
    .map((n) => ({ name: n.name, characters: n.text!.characters as string }));
}

// ---------- 화면 locator ----------
export const rows = (page: Page) => page.locator(`main ${sel(ROW)}`);
export const modal = (page: Page) => page.locator(sel(MODAL));
export const segment = (page: Page) => page.locator(`main ${sel(SEGMENT)}`);
export const activeSegment = (page: Page) => page.locator(`main ${sel(SEGMENT)} ${sel(SEGMENT_ACTIVE)}`);
export const segmentOption = (page: Page, label: string) => segment(page).getByText(exact(label));
export const searchInput = (page: Page) => page.locator("main").getByPlaceholder(SEARCH_PLACEHOLDER);
/** 기간 드롭다운 (text-input 안) */
export const periodSelect = (page: Page) => page.locator(`main ${sel(INPUT)} select`);
export const emptyCard = (page: Page) => page.locator(`main ${sel(EMPTY)}`);

export async function selectedPeriodLabel(page: Page): Promise<string> {
  return (await periodSelect(page).evaluate((el) => (el as HTMLSelectElement).selectedOptions[0]?.textContent ?? "")).trim();
}

/** 화면 10 이 그려지고 하이드레이션될 때까지 */
export async function waitHistory(page: Page): Promise<void> {
  await expect(segment(page).first(), `${SEGMENT} 보임`).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("load");
  await page.waitForFunction(
    (s) => {
      const f = document.querySelector(s);
      return !!f && Object.keys(f).some((k) => k.startsWith("__reactProps"));
    },
    `main ${sel(SEGMENT)}`,
    { timeout: 30_000 },
  );
}

/** "전체 / 내 기록" 전환 (하이드레이션 전 클릭이 무시돼도 다시 누른다) */
export async function switchScope(page: Page, label: string): Promise<void> {
  await expect(async () => {
    if (!exact(label).test(await activeSegment(page).innerText())) await segmentOption(page, label).click();
    await expect(activeSegment(page)).toHaveText(exact(label), { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

export const queryParam = (page: Page, key: string) => new URL(page.url()).searchParams.get(key);

// ---------- 목록 읽기 ----------
export type Entry = { kind: "group"; label: string } | { kind: "row"; texts: string[] };
export const GROUP_LABEL = /^\d{4}년 \d{1,2}월$/;

/** main 안의 월 그룹 헤더("YYYY년 M월")와 기록 행(글자 조각)을 문서 순서대로 읽는다 */
export async function readList(page: Page): Promise<Entry[]> {
  return page.locator("main").evaluate(
    (main, a) => {
      const out: ({ kind: "group"; label: string } | { kind: "row"; texts: string[] })[] = [];
      const seen = new Map<Element, { kind: "row"; texts: string[] }>();
      const re = new RegExp(a.re);
      const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const t = (n.textContent ?? "").replace(/\s+/g, " ").trim();
        if (!t) continue;
        const parent = n.parentElement;
        if (!parent || parent.closest("select, option, script, style")) continue;
        const row = parent.closest(a.row);
        if (row) {
          let e = seen.get(row);
          if (!e) {
            e = { kind: "row", texts: [] };
            seen.set(row, e);
            out.push(e);
          }
          e.texts.push(t);
        } else if (re.test(t) && !parent.closest(a.modal)) {
          out.push({ kind: "group", label: t });
        }
      }
      return out;
    },
    { row: sel(ROW), modal: sel(MODAL), re: GROUP_LABEL.source },
  );
}

// ---------- 자기 세션(RLS) DB ----------
export type HistoryRow = {
  id: string;
  used_at: string;
  amount: number;
  memo: string | null;
  reagent_id: string;
  reagent_name: string;
  unit: string;
  msds_url: string | null;
  user_name: string;
  is_mine: boolean;
};

/** now 에서 달 수만큼 앞 (기간 필터의 시작 시각) */
export function sinceOf(period: PeriodValue, now: Date = new Date()): string | null {
  const months = PERIODS.find((p) => p.value === period)!.months;
  if (months === null) return null;
  const d = new Date(now.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString();
}

/**
 * 로그인 세션으로 DB 함수 usage_history 조회 (d7 §7 — RLS 로 자기 학교 기록만, 최신순).
 * 화면과 같은 필터, 상한은 DB 최대(500)로 읽어 화면 상한(LIST_CAP)보다 넉넉하게.
 */
export async function dbHistory(page: Page, f: Filter = {}): Promise<HistoryRow[]> {
  const { client } = await browserClient(page);
  const { data, error } = await client.rpc("usage_history", {
    p_only_mine: f.mine === true,
    p_since: sinceOf(f.period ?? DEFAULT_PERIOD),
    p_query: f.q ?? null,
    p_limit: DB_LIMIT,
  });
  expect(error, `자기 세션 usage_history 조회: ${error?.message}`).toBeNull();
  const list = ((data ?? []) as Record<string, unknown>[]).map((r) => ({ ...(r as unknown as HistoryRow), amount: Number(r.amount) }));
  // 최신순 (used_at 내림차순) 인지 직접 확인
  for (let i = 1; i < list.length; i++) {
    expect(Date.parse(list[i - 1].used_at) >= Date.parse(list[i].used_at), "usage_history 는 최신순").toBe(true);
  }
  return list;
}

export async function myDisplayName(page: Page): Promise<string> {
  const { client, userId } = await browserClient(page);
  const { data, error } = await client.from("profiles").select("display_name").eq("user_id", userId).single();
  expect(error, "자기 profiles 조회").toBeNull();
  const name = String(data?.display_name ?? "");
  expect(name.length, "display_name").toBeGreaterThan(0);
  return name;
}

// ---------- 한국 시간 표기 (d7 §7 · 시안: 행 "10.02", 그룹 "2026년 10월", 상세 "2026.10.02 14:20") ----------
function kst(iso: string): Record<"year" | "month" | "day" | "hour" | "minute", string> {
  const out = { year: "", month: "", day: "", hour: "", minute: "" };
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  for (const p of fmt.formatToParts(new Date(iso))) if (p.type in out) out[p.type as keyof typeof out] = p.value;
  return out;
}
export const rowDate = (iso: string) => `${kst(iso).month}.${kst(iso).day}`;
export const groupLabel = (iso: string) => `${kst(iso).year}년 ${Number(kst(iso).month)}월`;
export const detailDateTime = (iso: string) => {
  const p = kst(iso);
  return `${p.year}.${p.month}.${p.day} ${p.hour}:${p.minute}`;
};
/** 사용량 + 단위 (공백·쉼표 무시 비교용) */
export const amountText = (r: Pick<HistoryRow, "amount" | "unit">) => squash(`${String(r.amount)}${r.unit}`);

type Flat = { group: string; date: string; name: string; user: string; amount: string };

/** DB 행 → 화면에 보여야 하는 값 */
function wantOf(r: HistoryRow): Flat {
  return { group: groupLabel(r.used_at), date: rowDate(r.used_at), name: r.reagent_name, user: r.user_name, amount: amountText(r) };
}

/** 화면 항목 → (그룹, 날짜, 시약명, 사용자, 사용량) 행. 구조가 틀리면 여기서 실패한다 */
export function flatten(entries: Entry[]): Flat[] {
  const out: Flat[] = [];
  let group: string | null = null;
  const groups: string[] = [];
  for (const e of entries) {
    if (e.kind === "group") {
      expect(e.label, "월 그룹 헤더 형식 YYYY년 M월").toMatch(GROUP_LABEL);
      expect(groups, `월 그룹 헤더 '${e.label}' 는 한 번만`).not.toContain(e.label);
      groups.push(e.label);
      group = e.label;
      continue;
    }
    expect(group, "기록 행은 월 그룹 헤더 아래에 있다").not.toBeNull();
    expect(e.texts.length, `행 3열 = 날짜 · 시약명/사용자 · 사용량 (${JSON.stringify(e.texts)})`).toBeGreaterThanOrEqual(4);
    out.push({ group: group!, date: e.texts[0], name: e.texts[1], user: e.texts[2], amount: squash(e.texts.slice(3).join("")) });
  }
  // 그룹 헤더는 최신 달이 위
  const key = (label: string) => {
    const m = /^(\d{4})년 (\d{1,2})월$/.exec(label)!;
    return Number(m[1]) * 12 + Number(m[2]);
  };
  for (let i = 1; i < groups.length; i++) expect(key(groups[i - 1]), "월 그룹은 최신순").toBeGreaterThan(key(groups[i]));
  // 빈 그룹 없음
  for (const g of groups) expect(out.some((r) => r.group === g), `그룹 '${g}' 에 행이 있음`).toBe(true);
  return out;
}

export type Snapshot = { db: HistoryRow[]; shown: HistoryRow[]; flat: Flat[] };

/**
 * 화면 목록 = 같은 필터의 DB 조회(최신순) 앞에서부터 LIST_CAP 건.
 * 다른 테스트가 동시에 기록을 추가하므로(운영 DB, 병렬 실행), 화면을 그린 뒤(t0 이후) 생긴 기록은
 * DB 목록 맨 앞에서 건너뛴다 — 건너뛴 행은 모두 t0 이후에 생긴 것이어야 한다.
 * 맞지 않으면 null (호출부가 다시 읽거나 실패 처리).
 */
function matchWindow(flat: Flat[], db: HistoryRow[], t0: number): { offset: number } | { diff: string } {
  const want = db.map(wantOf);
  const SKEW_MS = 30_000;
  for (let k = 0; k <= db.length; k++) {
    if (k > 0 && Date.parse(db[k - 1].used_at) < t0 - SKEW_MS) break;
    const part = want.slice(k, k + LIST_CAP);
    if (part.length !== flat.length) continue;
    if (JSON.stringify(part) === JSON.stringify(flat)) return { offset: k };
  }
  const first = want.slice(0, LIST_CAP);
  const i = flat.findIndex((r, idx) => JSON.stringify(r) !== JSON.stringify(first[idx]));
  return {
    diff: `화면 ${flat.length}행 ↔ DB ${first.length}행(전체 ${db.length}). 첫 차이 ${i}: 화면 ${JSON.stringify(flat[i])} ↔ DB ${JSON.stringify(first[i])}`,
  };
}

/**
 * 화면 목록이 DB(같은 필터)와 같아질 때까지 기다렸다가 확인한다.
 * t0 = 이 목록을 불러오게 한 동작(이동·필터 변경) 직전 시각.
 * 상한에 걸려 덜 보이면 목록 밖(main)에 "{상한}건" 안내가 있어야 한다.
 */
export async function expectListMatchesDb(page: Page, f: Filter, t0: number): Promise<Snapshot> {
  let result: Snapshot | null = null;
  let last = "";
  await expect(async () => {
    const entries = await readList(page);
    const flat = flatten(entries);
    const db = await dbHistory(page, f);
    const m = matchWindow(flat, db, t0);
    if ("diff" in m) {
      last = m.diff;
      throw new Error(m.diff);
    }
    result = { db, shown: db.slice(m.offset, m.offset + flat.length), flat };
  }, `화면 목록 = DB usage_history(${JSON.stringify(f)}) ${last}`).toPass({ timeout: 20_000, intervals: [200, 500, 1000] });
  const snap = result as Snapshot | null;
  if (!snap) throw new Error("목록 비교 실패");
  await expect(rows(page), "행 수").toHaveCount(snap.flat.length);
  if (snap.flat.length === 0) {
    await expect(emptyCard(page), `0건 → ${EMPTY}`).toHaveCount(1);
  } else {
    await expect(emptyCard(page), `기록이 있으면 ${EMPTY} 없음`).toHaveCount(0);
  }
  if (snap.db.length > snap.flat.length) {
    expect(snap.flat.length, "덜 보이는 것은 상한 때문일 때만").toBe(LIST_CAP);
    const outside = await page.locator("main").evaluate((main, rowSel) => {
      const c = main.cloneNode(true) as HTMLElement;
      c.querySelectorAll(rowSel).forEach((n) => n.remove());
      return c.textContent ?? "";
    }, sel(ROW));
    expect(outside, `상한(${LIST_CAP}건)에 걸리면 안내 문구`).toContain(`${LIST_CAP}건`);
  }
  return snap;
}

/** 화면 10 을 이 필터 주소로 열고 목록 = DB 확인 */
export async function gotoAndMatch(page: Page, f: Filter): Promise<Snapshot & { html: string }> {
  const t0 = Date.now();
  const res = await page.goto(historyPath(f));
  expect(res?.status(), `${historyPath(f)} 응답`).toBe(200);
  await waitHistory(page);
  const snap = await expectListMatchesDb(page, f, t0);
  return { ...snap, html: (await res?.text()) ?? "" };
}

// ---------- 상세 ----------
export type Detail = { title: string; amount: string; fields: Record<string, string>; texts: string[] };

/** ex-modal-card 의 글자 조각 → 제목 · 사용량 · 라벨-값 */
export async function readDetail(page: Page): Promise<Detail> {
  const texts = await modal(page).evaluate((card) => {
    const out: string[] = [];
    const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = (n.textContent ?? "").replace(/\s+/g, " ").trim();
      if (t) out.push(t);
    }
    return out;
  });
  const idx = DETAIL_LABELS.map((l) => texts.indexOf(l));
  for (const [i, l] of DETAIL_LABELS.entries()) expect(idx[i], `상세 라벨 "${l}" (${JSON.stringify(texts)})`).toBeGreaterThan(0);
  expect([...idx].sort((a, b) => a - b), "라벨 순서 사용자 · 일시 · 메모").toEqual(idx);
  const fields: Record<string, string> = {};
  for (const [i, l] of DETAIL_LABELS.entries()) {
    const next = i + 1 < idx.length ? idx[i + 1] : idx[i] + 2;
    fields[l] = texts.slice(idx[i] + 1, next).join(" ");
  }
  return { title: texts[0], amount: squash(texts.slice(1, idx[0]).join("")), fields, texts };
}

/**
 * 상세에 보여야 하는 메모: 없으면(null·공백 문자뿐) "-".
 * 화면 글자는 공백을 한 칸으로 줄여 읽으므로(readDetail) DB 값도 같은 방식으로 정리해 비교한다.
 * (공백 문자뿐인 memo 는 record_usage 가 null 로 바꾸기 전에 만들어진 옛 기록에만 있다.)
 */
export function memoText(memo: string | null): string {
  const t = (memo ?? "").replace(/\s+/g, " ").trim();
  return t === "" ? MEMO_NONE : t;
}

/** 열린 상세가 이 DB 기록의 것인지: 시약명 · 사용량+단위 · 사용자 · 일시(YYYY.MM.DD HH:mm, 한국 시간) · 메모(없으면 "-") · msds-entry · "닫기" */
export async function expectDetail(page: Page, r: HistoryRow): Promise<void> {
  await expect(modal(page), `${MODAL} 1개`).toHaveCount(1);
  await expect(modal(page)).toBeVisible();
  await expect(async () => {
    const d = await readDetail(page);
    expect(d.title, "상세 시약명").toBe(r.reagent_name);
    expect(d.amount, "상세 사용량 + 단위").toBe(amountText(r));
    expect(d.fields["사용자"], "상세 사용자").toBe(r.user_name);
    expect(d.fields["일시"], "상세 일시").toBe(detailDateTime(r.used_at));
    expect(d.fields["일시"], "일시 형식 YYYY.MM.DD HH:mm").toMatch(/^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}$/);
    expect(d.fields["메모"], "상세 메모").toBe(memoText(r.memo));
  }).toPass({ timeout: 10_000 });
  const entry = modal(page).locator(sel(MSDS));
  await expect(entry, `상세 안 ${MSDS} 1개`).toHaveCount(1);
  await expect(entry).toBeVisible();
  await expect(entry.locator(sel("button-pill-soft")).filter({ hasText: MSDS_LABEL }), `${MSDS} 안 button-pill-soft "${MSDS_LABEL}"`).toHaveCount(1);
  await expect(closeButton(page), `button-outline "${CLOSE_LABEL}"`).toHaveCount(1);
  await expect(closeButton(page)).toBeVisible();
}

export const closeButton = (page: Page) => modal(page).locator(sel("button-outline")).filter({ hasText: exact(CLOSE_LABEL) });

/** i 번째 행을 눌러 상세를 연다 (이미 그 행의 상세가 열려 있으면 그대로) */
export async function openRow(page: Page, index: number): Promise<Locator> {
  const row = rows(page).nth(index);
  await row.scrollIntoViewIfNeeded();
  await row.click();
  await expect(modal(page), `행을 누르면 ${MODAL}`).toHaveCount(1);
  return row;
}

// ---------- UI 전용 고정 시약 (학교 A, 프로젝트별 1개) ----------
export const UI_FIX_UNIT = "mL";
export const UI_FIX_STOCK = 100;
export const UI_FIX_MSDS = "https://example.com/msds/ui10-fixture.pdf";
export const UI_FIX_MEMO = "UI10 고정 메모 · 1반 3조 구리 이온 실험";
export const uiFixtureName = (info: TestInfo) => `R-db-UI10-fixture-${info.project.name}`;

export type FixtureReagent = { id: string; name: string; unit: string; msds_url: string | null };

async function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const dir = join(tmpdir(), "lab-stock-e2e-auth");
  mkdirSync(dir, { recursive: true });
  const lock = join(dir, `${name}.lock`);
  const start = Date.now();
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch {
      if (existsSync(lock) && Date.now() - statSync(lock).mtimeMs > 60_000) rmSync(lock, { recursive: true, force: true });
      if (Date.now() - start > 90_000) throw new Error(`잠금 대기 초과 (${name})`);
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  try {
    return await fn();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

/**
 * 교사(또는 admin) 세션으로 UI 전용 고정 시약을 찾거나 만든다 (학교 A 에서만 — 호출부가 학교를 확인한다).
 * 워커 여럿이 동시에 만들지 않도록 잠근다.
 */
export async function uiFixtureReagent(staffPage: Page, info: TestInfo): Promise<FixtureReagent> {
  const name = uiFixtureName(info);
  const cols = "id, name, unit, msds_url";
  return withLock(`ui10-fixture-${info.project.name}`, async () => {
    const { client, userId } = await browserClient(staffPage);
    const found = await client.from("reagents").select(cols).eq("name", name).order("id").limit(1);
    if (found.error) throw new Error(`고정 시약 조회 실패: ${found.error.message}`);
    if ((found.data ?? []).length > 0) return found.data![0] as FixtureReagent;
    const prof = await client.from("profiles").select("school_id").eq("user_id", userId).single();
    if (prof.error || !prof.data) throw new Error(`profiles 조회 실패: ${prof.error?.message}`);
    const made = await client
      .from("reagents")
      .insert({ school_id: prof.data.school_id, name, unit: UI_FIX_UNIT, stock: UI_FIX_STOCK, min_stock: 0, msds_url: UI_FIX_MSDS })
      .select(cols)
      .single();
    if (made.error || !made.data) throw new Error(`고정 시약 생성 실패: ${made.error?.message}`);
    return made.data as FixtureReagent;
  });
}

/** 교사 세션으로 고정 시약 stock 을 되돌린다 */
export async function resetFixtureStock(staffPage: Page, id: string): Promise<void> {
  const { client } = await browserClient(staffPage);
  const r = await client.from("reagents").update({ stock: UI_FIX_STOCK }).eq("id", id).select("stock");
  if (r.error || (r.data ?? []).length !== 1) throw new Error(`고정 시약 stock 되돌리기 실패: ${r.error?.message}`);
}

/**
 * 고정 시약에 "메모 있는 기록"·"메모 없는 기록"이 화면 기본 기간(최근 1개월) 목록 안에 각각 1건 이상 있게 한다.
 * 이미 있으면(만든 지 25일 이내) 아무것도 쓰지 않는다 — usage_logs 는 지울 수 없으므로 최소 횟수만.
 */
export async function ensureFixtureLogs(staffPage: Page, info: TestInfo): Promise<FixtureReagent> {
  const reagent = await uiFixtureReagent(staffPage, info);
  await withLock(`ui10-logs-${info.project.name}`, async () => {
    const fresh = Date.now() - 25 * 86_400_000;
    const top = (await dbHistory(staffPage, { q: reagent.name }))
      .filter((r) => r.reagent_id === reagent.id)
      .slice(0, LIST_CAP)
      .filter((r) => Date.parse(r.used_at) > fresh);
    const need: (string | null)[] = [];
    if (!top.some((r) => r.memo !== null)) need.push(UI_FIX_MEMO);
    if (!top.some((r) => r.memo === null)) need.push(null);
    if (need.length === 0) return;
    const { client } = await browserClient(staffPage);
    try {
      for (const memo of need) {
        const res = await client.rpc("record_usage", memo === null ? { reagent_id: reagent.id, amount: 1 } : { reagent_id: reagent.id, amount: 1, memo });
        if (res.error) throw new Error(`고정 기록 생성 실패: ${res.error.message}`);
      }
    } finally {
      await resetFixtureStock(staffPage, reagent.id);
    }
  });
  return reagent;
}
