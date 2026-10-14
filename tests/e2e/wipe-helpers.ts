// 시약 전체 삭제(화면 2) · 기록 삭제(화면 10) e2e 도우미 — harness/d7-data.md §29, design/rules.json 1.29 wipe · roles R5 · R8 · guest.
// 기대 문구는 rules wipe 의 따옴표 글자와 시안 2-wipe · 10-record-wipe 프레임에서 읽는다.
//
// 절대 규칙 (d7 §29 "테스트"): 공용 학교 A · B · 데모 데이터는 절대 지우지 않는다.
// - 공용 계정 화면에서는 확인 버튼을 누르지 않는다. 그래도 혹시 나가는 지우기 요청(서버 액션 POST 본문에 학교명)을 가로채 막고(abort) 센다 → 0 이어야 한다.
// - 성공 경로는 일회용 학교(service role 로 준비 · 정리)의 admin 으로만.
import { expect, type Locator, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { rules, sel } from "./screen-helpers";
import { loadShellFrameNodes } from "../frames";
import { service, sweep, tempSchoolLike } from "./screen-8-helpers";

export type WipeRules = {
  roles: string[];
  entry: string;
  empty: string;
  school_name_confirm: string;
  disabled_button: string;
  reagent: string;
  record: string;
};
export const WIPE = (rules as unknown as { wipe: WipeRules }).wipe;

/** 따옴표 안 글자들 */
const quoted = (s: string): string[] => [...s.matchAll(/'([^']+)'/g)].map((m) => m[1]);
const pick = (s: string, re: RegExp, what: string): string => {
  const q = quoted(s).find((x) => re.test(x));
  if (!q) throw new Error(`rules wipe 에서 ${what} 문구를 찾지 못함`);
  return q;
};

export const PAGE_MORE = "page-more-menu";
export const REAGENT_WIPE = "reagent-wipe";
export const RECORD_WIPE = "record-wipe";
export const NAME_CONFIRM = "school-name-confirm";
export const RANGE = "record-wipe-range";
export const PREVIEW = "wipe-preview";
export const MODAL = "ex-modal-card";
export const DRAWER = "detail-drawer";
export const TOAST = "ex-toast";
export const EMPTY = "ex-empty-state-card";
export const PRIMARY = "button-primary";
export const OUTLINE = "button-outline";

// ---------- 문구 (rules wipe) ----------
export const T = {
  reagentItem: pick(WIPE.entry, /^시약 전체 삭제$/, "시약 전체 삭제 메뉴"),
  recordItem: pick(WIPE.entry, /^기록 삭제$/, "기록 삭제 메뉴"),
  reagentEmpty: pick(WIPE.empty, /시약이 없어요/, "지울 시약 없음"),
  recordEmpty: pick(WIPE.empty, /기록이 없어요/, "지울 기록 없음"),
  mismatch: pick(WIPE.school_name_confirm, /달라요/, "학교 이름 다름"),
  reagentTitle: (n: number) => pick(WIPE.reagent, /\{N\}종을 모두/, "전체 삭제 제목").replace("{N}", n.toLocaleString("ko-KR")),
  reagentBody: pick(WIPE.reagent, /되돌릴 수 없어요/, "전체 삭제 본문"),
  close: pick(WIPE.reagent, /^닫기$/, "닫기"),
  wipeAll: pick(WIPE.reagent, /^전체 삭제$/, "전체 삭제 버튼"),
  reagentDone: (n: number) => pick(WIPE.reagent, /\{N\}종을 삭제했어요/, "전체 삭제 토스트").replace("{N}", n.toLocaleString("ko-KR")),
  recordTitle: pick(WIPE.record, /^기록 삭제$/, "기록 삭제 제목"),
  rangeOptions: pick(WIPE.record, /^전체 \| /, "범위 segmented").split("|").map((x) => x.trim()),
  rangeDefault: pick(WIPE.record, /^이 날짜 이전$/, "기본 범위"),
  preview: (u: number, i: number) =>
    pick(WIPE.record, /\{N\}건 · 입고 기록 \{M\}건을 지워요/, "미리보기").replace("{N}", u.toLocaleString("ko-KR")).replace("{M}", i.toLocaleString("ko-KR")),
  previewNote: pick(WIPE.record, /재고 수량은 그대로예요/, "미리보기 안내"),
  previewEmpty: pick(WIPE.record, /지울 기록이 없어요$/, "0건 미리보기"),
  recordButton: (n: number) => pick(WIPE.record, /^기록 \{N\+M\}건 삭제$/, "기록 삭제 버튼").replace("{N+M}", n.toLocaleString("ko-KR")),
  recordDone: (n: number) => pick(WIPE.record, /^기록 \{N\}건을 삭제했어요$/, "기록 삭제 토스트").replace("{N}", n.toLocaleString("ko-KR")),
};

/** rules wipe.disabled_button "꺼진 button-primary = #e0e0e0 채움 + #707070 글자" → rgb */
export const DISABLED_RGB = (() => {
  const hex = [...WIPE.disabled_button.matchAll(/#([0-9a-f]{6})/gi)].map((m) => m[1]);
  if (hex.length !== 2) throw new Error("rules wipe.disabled_button 색 2개를 읽지 못함");
  const rgb = (h: string) => `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
  return { background: rgb(hex[0]), color: rgb(hex[1]) };
})();

/**
 * school-name-confirm caption — 시안 2-wipe-mobile 글자("확인을 위해 학교 이름 '샘플고등학교'를 입력하세요")의 학교명 자리를 우리 학교명으로.
 * 조사(을/를)는 받침에 따른다: 끝이 한글이면 받침 있음 '을' · 없음 '를', 한글이 아니면(영문 · 숫자) 을/를/을(를) 중 하나.
 */
export function nameCaptionRe(schoolName: string): RegExp {
  const nodes = loadShellFrameNodes<{ path: string[]; name: string; text: { characters: string } | null }>("2-wipe-mobile");
  const cap = nodes.find((n) => n.path.includes(NAME_CONFIRM) && n.name === "caption" && n.text)?.text?.characters;
  if (!cap) throw new Error("시안 2-wipe-mobile school-name-confirm caption 없음");
  const m = /^(.*)'([^']+)'(을|를)(.*)$/.exec(cap);
  if (!m) throw new Error(`시안 caption 형식: ${cap}`);
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const last = schoolName.trim().slice(-1).charCodeAt(0);
  const hangul = last >= 0xac00 && last <= 0xd7a3;
  const josa = hangul ? ((last - 0xac00) % 28 === 0 ? "를" : "을") : "(?:을|를|을\\(를\\))";
  return new RegExp(`^\\s*${esc(m[1])}'${esc(schoolName.trim())}'${josa}${esc(m[4])}\\s*$`);
}

// ---------- 공용 학교 보호 ----------

/**
 * 공용 계정 화면: 서버 액션 POST(next-action) 중 본문에 학교명이 든 것(= 시약 전체 삭제 · 기록 삭제 실행)을 막고 센다.
 * (미리보기 숫자 세기는 날짜만 보낸다 — 그대로 통과)
 */
export async function guardWipe(page: Page, schoolName: string): Promise<() => string[]> {
  const blocked: string[] = [];
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (req.method() === "POST" && req.headers()["next-action"] !== undefined && (req.postData() ?? "").includes(schoolName)) {
      blocked.push(new URL(req.url()).pathname);
      await route.abort();
      return;
    }
    await route.continue().catch(() => undefined);
  });
  return () => [...blocked];
}

// ---------- 화면 조작 ----------

/** ⋯ 를 열어 메뉴 항목(reagent-wipe · record-wipe)을 돌려준다 */
export async function openMore(page: Page, item: string): Promise<Locator> {
  const menu = page.locator(`main ${sel(PAGE_MORE)}`);
  await expect(menu, `${PAGE_MORE} 1`).toHaveCount(1);
  const button = menu.locator("button").first();
  await expect(button).toBeVisible();
  await expect.poll(() => button.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps"))), { message: "⋯ 하이드레이션", timeout: 30_000 }).toBe(true);
  const entry = page.locator(`${sel(PAGE_MORE)} [role="menuitem"]${sel(item)}`);
  await expect(async () => {
    if ((await entry.count()) === 0) await button.click();
    await expect(entry).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  return entry;
}

/** 확인 상자 안 학교명 입력 칸 */
export const nameInput = (scope: Locator): Locator => scope.locator(`${sel(NAME_CONFIRM)} input`);

/** 꺼진 button-primary 모양 (rules wipe.disabled_button) */
export async function expectDisabledLook(button: Locator, what: string): Promise<void> {
  await expect(button, `${what}: 꺼짐`).toBeDisabled();
  await expect(button, `${what}: 채움 ${DISABLED_RGB.background}`).toHaveCSS("background-color", DISABLED_RGB.background);
  await expect(button, `${what}: 글자 ${DISABLED_RGB.color}`).toHaveCSS("color", DISABLED_RGB.color);
}

// ---------- 날짜 (한국) ----------
const KST = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
export const kstDaysAgo = (days: number): string => KST.format(new Date(Date.now() - days * 86_400_000));
export const kstToday = (): string => kstDaysAgo(0);
/** ymd 에서 days 일 전 */
export const ymdMinus = (ymd: string, days: number): string => new Date(Date.parse(`${ymd}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
/**
 * 기록 삭제 날짜 기본값 = 가장 최근에 지난 3월 1일 (오케스트레이터 결정 2026-10-13, 한국 학년도 시작) — 3월 1일 당일이면 그날.
 */
export function lastMarchFirst(today: string = kstToday()): string {
  const y = Number(today.slice(0, 4));
  return `${today.slice(5) >= "03-01" ? y : y - 1}-03-01`;
}
/** 한국 자정 앞뒤 2분은 피한다 (오늘 · 미래 판정이 바뀌지 않게) */
export async function awayFromMidnight(): Promise<void> {
  for (;;) {
    const now = Date.now();
    const next = new Date(`${kstDaysAgo(-1)}T00:00:00+09:00`).getTime();
    const prev = new Date(`${kstToday()}T00:00:00+09:00`).getTime();
    if (next - now > 120_000 && now - prev > 120_000) return;
    await new Promise((r) => setTimeout(r, 30_000));
  }
}

// ---------- 일회용 학교 데이터 ----------
const STORAGE = (rules as unknown as { cabinet: { storage_classes: string[] } }).cabinet.storage_classes;
let seq = 0;
const firstRow = (data: unknown): Record<string, unknown> => (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;

/** 임시 시약 (register_reagent — 입고 기록 1행이 같이 생긴다) */
export async function newReagent(c: SupabaseClient, stock: number, intakeDate: string): Promise<string> {
  const res = await c.rpc("register_reagent", {
    p_name: `임시전체삭제UI-${++seq}-${Math.random().toString(36).slice(2, 7)}`,
    p_storage_class: STORAGE[0],
    p_stock: stock,
    p_unit: "g",
    p_intake_date: intakeDate,
    p_msds_url: null,
  });
  expect(res.error, `준비: register_reagent (${res.error?.message})`).toBeNull();
  return firstRow(res.data).id as string;
}
export async function addIntake(c: SupabaseClient, id: string, amount: number, date: string): Promise<void> {
  const r = await c.rpc("record_intake", { p_reagent_id: id, p_amount: amount, p_intake_date: date });
  expect(r.error, `준비: record_intake ${date} (${r.error?.message})`).toBeNull();
}
export async function addUsage(c: SupabaseClient, id: string, amount: number, usedOn: string, cls?: { grade: number; no: number; subject: string }): Promise<void> {
  const r = await c.rpc("record_usage_batch", {
    p_items: [{ reagent_id: id, amount }],
    p_used_on: usedOn,
    p_memo: null,
    p_class_grade: cls?.grade ?? null,
    p_class_no: cls?.no ?? null,
    p_class_subject: cls?.subject ?? null,
  });
  expect(r.error, `준비: record_usage_batch ${usedOn} (${r.error?.message})`).toBeNull();
}

/** 일회용 학교 정리: 기록 · 시약 · 시약장 → 프로필 · 계정 · 학교. 잔여물 수 */
export async function cleanupTemp(group: string, project: string): Promise<{ rows: Record<string, number>; left: Awaited<ReturnType<typeof sweep>> }> {
  const sb = service();
  const schools = await sb.from("schools").select("id").like("neis_code", tempSchoolLike(group, project));
  const ids = (schools.data ?? []).map((s) => s.id as string);
  if (ids.length) {
    await sb.from("usage_logs").delete().in("school_id", ids);
    await sb.from("intake_logs").delete().in("school_id", ids);
    await sb.from("reagents").delete().in("school_id", ids);
    await sb.from("cabinets").delete().in("school_id", ids);
  }
  const rows: Record<string, number> = {};
  for (const table of ["reagents", "intake_logs", "usage_logs", "cabinets"]) {
    const r = ids.length ? await sb.from(table).select("id").in("school_id", ids) : { data: [] as unknown[] };
    rows[table] = (r.data ?? []).length;
  }
  const left = await sweep(group, project);
  return { rows, left };
}

/** 공용 학교 A · B · 데모의 "오래된" 행 지문 (1시간 전 이전 — 다른 스펙의 임시 행 제외): 살아 있는 시약 · 사용 · 입고 기록 id */
export type SharedSnap = { live: string[]; usage: string[]; intake: string[] };
export async function sharedSnapshot(): Promise<SharedSnap> {
  const sb = service();
  const s = await sb.from("schools").select("id").or("neis_code.like.TEST-SCHOOL-%,is_demo.eq.true");
  const ids = (s.data ?? []).map((x) => x.id as string);
  expect(ids.length, "공용 학교 A · B · 데모 (대조)").toBeGreaterThanOrEqual(3);
  const cutoff = new Date(Date.now() - 3_600_000).toISOString();
  const live = await sb.from("reagents").select("id").in("school_id", ids).is("deleted_at", null).lt("created_at", cutoff).order("id");
  const usage = await sb.from("usage_logs").select("id").in("school_id", ids).lt("used_at", cutoff).order("id");
  const intake = await sb.from("intake_logs").select("id").in("school_id", ids).lt("created_at", cutoff).order("id");
  for (const r of [live, usage, intake]) if (r.error) throw new Error(`공용 대조 조회 실패: ${r.error.message}`);
  const out = { live: (live.data ?? []).map((x) => x.id as string), usage: (usage.data ?? []).map((x) => x.id as string), intake: (intake.data ?? []).map((x) => x.id as string) };
  expect(out.live.length, "공용 학교 살아 있는 시약 ≥1 (대조)").toBeGreaterThan(0);
  return out;
}
export async function expectSharedIntact(before: SharedSnap, what: string): Promise<void> {
  const sb = service();
  const missing = async (table: string, ids: string[], live = false) => {
    const found = new Set<string>();
    for (let i = 0; i < ids.length; i += 200) {
      let q = sb.from(table).select("id").in("id", ids.slice(i, i + 200));
      if (live) q = q.is("deleted_at", null);
      const r = await q;
      if (r.error) throw new Error(`공용 대조 조회 실패: ${r.error.message}`);
      for (const x of r.data ?? []) found.add(x.id as string);
    }
    return ids.filter((id) => !found.has(id));
  };
  expect(await missing("reagents", before.live, true), `${what}: 공용 학교 시약 보관 0`).toEqual([]);
  expect(await missing("usage_logs", before.usage), `${what}: 공용 학교 사용 기록 삭제 0`).toEqual([]);
  expect(await missing("intake_logs", before.intake), `${what}: 공용 학교 입고 기록 삭제 0`).toEqual([]);
}
