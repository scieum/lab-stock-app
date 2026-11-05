// 화면 20 게시판 UI 테스트 공용 (screen-20-*.spec.ts)
// 기대값: design/rules.json board · desktop_shell · manage · never.N1 · roles, design/frames/20-*.json, harness/d7-data.md §30,
//         harness/dev-rules.json routes · route_auth, public/guide/index.html '자주 묻는 질문'(FAQ seed 원본).
// 구현 파일(lib/board.ts 등)에서 기대값을 읽지 않는다.
// 글 준비: 교사·admin 세션(RLS)으로 만들고 글쓴이 세션으로 지운다. 답변·숨김 "준비"만 service role(판정에는 쓰지 않음, db-s20-board 와 같은 방식).
// 제목 접두사 = db-s20-board 의 'S20-db-' (그 정리 규칙이 그대로 적용된다). seed FAQ 는 읽기만.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Browser, type Locator, type Page, type TestInfo } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { openAs, type RolePage } from "./auth-state";
import { signIn, type Role, type Session } from "./db-helpers";
import { waitWidthSettled } from "./desk-helpers";
import { devRules, rules, sel } from "./screen-helpers";

const ROOT = process.cwd();

// ---------- rules ----------
export type BoardRules = {
  screen: number;
  paths: { list: string; detail: string; new: string };
  tabs: string;
  faq: string;
  row: string;
  status: string;
  author: string;
  write: string;
  form: string;
  detail: string;
  answer: string;
  own_post: string;
  empty: string;
  entry: string;
  faq_examples: { q: string; a: string }[];
};
export const BOARD = (rules as unknown as { board: BoardRules }).board;
export const SCREEN = BOARD.screen;
export const DS = rules.desktop_shell as unknown as { component: string; item: string; width: number; drawer_width: number; form_width: number; board_link: string };
export const MANAGE_BACK_RULE = (rules as unknown as { manage: { back: string; screen: number } }).manage;

/** rules board.tabs "segmented-control 3칸 FAQ(맨 앞, 고정) · 오류 문의 · 개선 제안" → 탭 글자 */
export const TAB_LABELS: string[] = (() => {
  const m = /3칸 (.+?)\. /.exec(BOARD.tabs);
  if (!m) throw new Error("rules board.tabs 에서 탭 글자를 읽지 못함");
  return m[1].split(" · ").map((s) => s.replace(/\(.*\)$/, "").trim());
})();
/** d7 §30 /board?tab=faq|bug|idea — TAB_LABELS 와 같은 순서 */
export const TAB_KEYS: string[] = (() => {
  const note = (devRules as unknown as { route_auth: Record<string, string> }).route_auth["20_note"] ?? "";
  const m = /\?tab=([a-z|\\]+)/.exec(note);
  if (!m) throw new Error("dev-rules route_auth 20_note 에서 tab 값을 읽지 못함");
  return m[1].replace(/\\/g, "").split("|");
})();
export const tabLabel = (key: string): string => TAB_LABELS[TAB_KEYS.indexOf(key)];

/** rules board.empty "ex-empty-state-card '아직 올라온 글이 없어요'" */
export const EMPTY_TITLE = /'([^']+)'/.exec(BOARD.empty)![1];
/** rules board.write "button-primary '글쓰기'" */
export const WRITE_LABEL = /'([^']+)'/.exec(BOARD.write)![1];
/** rules board.form board-privacy-note 문구 · '등록' */
export const PRIVACY_NOTE = /\+ '([^']+)'/.exec(BOARD.form)![1];
export const SUBMIT_LABEL = /button-primary '([^']+)'/.exec(BOARD.form)![1];
/** rules board.status '접수' · '답변 완료' */
export const STATUS_RECEIVED = /'([^']+)' = canvas-soft/.exec(BOARD.status)![1];
export const STATUS_ANSWERED = /'([^']+)' = ink/.exec(BOARD.status)![1];
/** rules board.detail 머리 '운영자 답변' */
export const ANSWER_HEAD = /머리 '([^']+)'/.exec(BOARD.detail)![1];
/** rules board.own_post '수정' · '삭제' · 이유 문구 */
export const OWN_EDIT = /: (\S+) · (\S+)\./.exec(BOARD.own_post)![1];
export const OWN_DELETE = /: (\S+) · (\S+)\./.exec(BOARD.own_post)![2];
export const EDIT_LOCKED = /이유 '([^']+)'/.exec(BOARD.own_post)![1];
/** rules board.author "학교명 + '선생님'" */
export const AUTHOR_SUFFIX = /학교명 \+ '([^']+)'/.exec(BOARD.author)![1];
export const authorLabel = (schoolName: string): string => `${schoolName} ${AUTHOR_SUFFIX}`;

/** d7 §30 토스트 문구 ('글을 올렸어요' · '글을 삭제했어요') */
const D7 = readFileSync(join(ROOT, "harness", "d7-data.md"), "utf8");
const d7Row = (head: string): string => {
  const l = D7.split(/\r?\n/).find((x) => x.startsWith(`| ${head} |`));
  if (!l) throw new Error(`d7 §30 '${head}' 줄 없음`);
  return l;
};
export const D7_NEW = d7Row("20-new");
export const D7_DETAIL = d7Row("20-detail");
export const D7_LIST = d7Row("화면 20 목록");
export const D7_OPERATOR_UI = d7Row("운영자 화면");
export const TOAST_POSTED = /ex-toast '([^']+)'/.exec(D7_NEW)![1];
export const TOAST_DELETED = /ex-toast '([^']+)'/.exec(D7_DETAIL)![1];

/** 게시판 경로 */
export const LIST = BOARD.paths.list;
export const NEW = BOARD.paths.new;
export const detailPath = (id: string): string => BOARD.paths.detail.replace("{id}", id);
export const listPath = (key: string): string => `${LIST}?tab=${key}`;

// ---------- FAQ 기대값 (가이드 '자주 묻는 질문' + d7 이 고른 rules faq_examples, 이 순서) ----------
function decodeHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}
function guideFaq(): { q: string; a: string }[] {
  const html = readFileSync(join(ROOT, "public", "guide", "index.html"), "utf8").replace(/\r\n/g, "\n");
  const sec = html.match(/<section id="faq"[\s\S]*?<\/section>/);
  if (!sec) throw new Error("public/guide/index.html 에 #faq 절이 없습니다");
  return [...sec[0].matchAll(/<details>\s*<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>\s*<\/details>/g)].map((m) => ({ q: decodeHtml(m[1]), a: decodeHtml(m[2]) }));
}
function d7Picked(): { q: string; a: string }[] {
  const quoted = [...d7Row("미리 등록 FAQ").matchAll(/'([^']+\?)'/g)].map((m) => m[1]);
  return quoted.map((q) => {
    const ex = BOARD.faq_examples.find((e) => e.q === q);
    if (!ex) throw new Error(`rules board.faq_examples 에 '${q}' 없음`);
    return ex;
  });
}
export const EXPECTED_FAQ = [...guideFaq(), ...d7Picked()];
/** d7 §30 "마이그레이션 seed 로 16개" */
export const FAQ_SEED_COUNT = Number(/seed 로 (\d+)개/.exec(d7Row("미리 등록 FAQ"))![1]);

// ---------- 프레임 ----------
export type FNode = {
  name: string;
  path: string[];
  width: number;
  height: number;
  padding: number[] | null;
  gap: number | null;
  fills: string[];
  cornerRadius: number | null;
  text: { characters: string; fontSize: number; fontWeight: number } | null;
};
const frameCache = new Map<string, FNode[]>();
export function frameNodes(name: string): FNode[] {
  let n = frameCache.get(name);
  if (!n) {
    const j = JSON.parse(readFileSync(join(ROOT, "design", "frames", `${name}.json`), "utf8")) as { frames: { nodes: FNode[] }[] };
    n = j.frames[0].nodes;
    frameCache.set(name, n);
  }
  return n;
}
/** 프레임에서 이름이 name 인 노드들 (문서 순서) */
export const fAll = (frame: string, name: string): FNode[] => frameNodes(frame).filter((n) => n.name === name);
/** 프레임에서 경로 끝이 ".../a/b" 인 첫 노드 */
export function fNode(frame: string, tail: string): FNode {
  const parts = tail.split("/");
  const n = frameNodes(frame).find((x) => x.path.slice(-parts.length).join("/") === tail);
  if (!n) throw new Error(`프레임 ${frame} 에 ${tail} 없음`);
  return n;
}
/** 노드 안 글자들 (경로에 ancestor 가 있는 TEXT) */
export const fTexts = (frame: string, ancestor: string): string[] =>
  frameNodes(frame)
    .filter((n) => n.text && n.path.includes(ancestor))
    .map((n) => n.text!.characters);

export const hexToRgb = (hex: string): string => {
  const h = hex.replace("#", "");
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
};

// ---------- 글 준비 · 정리 ----------
export const PREFIX = "S20-db-ui-";

function setupClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("답변·숨김 상태 준비에 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다 (.env.local) — 판정에는 쓰지 않음");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

const created: { id: string; author: Role }[] = [];

/** 이 워커가 만든 글로 등록 (UI 로 만든 글도 여기 넣어 지운다) */
export function track(id: string, author: Role): void {
  created.push({ id, author });
}

export async function newPost(role: Role, tag: string, category: "bug" | "idea" = "bug", body?: string): Promise<{ id: string; title: string; created_at: string }> {
  const s = await signIn(role);
  const title = `${PREFIX}${tag}`;
  const { data, error } = await s.client
    .from("board_posts")
    .insert({ category, title, body: body ?? `테스트 본문 ${tag}`, author_id: s.userId, author_school_id: s.schoolId })
    .select("id, created_at")
    .single();
  expect(error, `글 준비 (${role}): ${error?.message}`).toBeNull();
  const row = data as { id: string; created_at: string };
  track(row.id, role);
  return { id: row.id, title, created_at: row.created_at };
}

/** 답변 상태 준비 (RLS 로는 만들 수 없음 — d7 §30 운영자 쓰기 = service role) */
export async function prepAnswer(id: string, answer: string): Promise<string> {
  const at = new Date().toISOString();
  const r = await setupClient().from("board_posts").update({ answer, answered_at: at }).eq("id", id).like("title", `${PREFIX}%`).select("id");
  expect(r.error, `답변 준비: ${r.error?.message}`).toBeNull();
  expect(r.data ?? []).toHaveLength(1);
  return at;
}

export async function prepHidden(id: string): Promise<void> {
  const r = await setupClient().from("board_posts").update({ hidden_at: new Date().toISOString() }).eq("id", id).like("title", `${PREFIX}%`).select("id");
  expect(r.error, `숨김 준비: ${r.error?.message}`).toBeNull();
  expect(r.data ?? []).toHaveLength(1);
}

/** 제목으로 내 글 id (UI 로 만든 글 정리용, RLS) */
export async function idByTitle(role: Role, title: string): Promise<string[]> {
  const s = await signIn(role);
  const { data, error } = await s.client.from("board_posts").select("id").eq("title", title);
  expect(error, error?.message).toBeNull();
  return (data ?? []).map((r) => (r as { id: string }).id);
}

export async function cleanupPosts(): Promise<void> {
  const leftovers: string[] = [];
  for (const c of created.splice(0)) {
    const s = await signIn(c.author);
    const r = await s.client.from("board_posts").delete().eq("id", c.id).select("id");
    if (!r.error && (r.data ?? []).length === 1) continue;
    leftovers.push(c.id); // 숨긴 글(글쓴이에게도 안 보임) 또는 테스트 안에서 이미 지운 글
  }
  if (leftovers.length > 0) {
    const r = await setupClient().from("board_posts").delete().in("id", leftovers).like("title", `${PREFIX}%`);
    if (r.error) throw new Error(`테스트 글 정리 실패: ${r.error.message}`);
  }
}

export async function schoolNameOf(role: Role): Promise<string> {
  const s: Session = await signIn(role);
  const { data, error } = await s.client.from("schools").select("name").eq("id", s.schoolId).single();
  expect(error, `학교 이름: ${error?.message}`).toBeNull();
  return (data as { name: string }).name;
}

/** rules board.row 날짜 '10월 28일' (한국 시간) */
export function koDate(iso: string): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" }).formatToParts(new Date(iso));
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  return `${g("month")}월 ${g("day")}일`;
}

// ---------- 화면 열기 ----------
export async function openBoard(browser: Browser, info: TestInfo, role: Role, path: string): Promise<RolePage> {
  const rp = await openAs(browser, info, role, SCREEN, path);
  await settle(rp.page);
  return rp;
}

export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("load");
  await expect(page.locator("main").first()).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0, { timeout: 45_000 });
  await waitWidthSettled(page);
}

export const isDesk = (page: Page): boolean => (page.viewportSize()?.width ?? 0) >= devRules.viewports.desktop[0];

/** 보이는 그 폭의 본문 (데스크톱 글 보기 = detail-drawer) */
export const detailScope = (page: Page): Locator => (isDesk(page) ? page.locator(sel("detail-drawer")) : page.locator("main"));

export async function box(l: Locator, what: string): Promise<{ x: number; y: number; width: number; height: number }> {
  await expect(l, `${what} 보임`).toBeVisible();
  const b = await l.boundingBox();
  if (!b) throw new Error(`${what} 상자 없음`);
  return b;
}

export const css = (l: Locator, prop: string): Promise<string> => l.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

/** 내 글 줄 (제목으로) */
export const rowByTitle = (page: Page, title: string): Locator => page.locator(sel("board-post-row")).filter({ hasText: title });
