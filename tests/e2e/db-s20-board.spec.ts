// [N1-db] · [R-db] 게시판 board_posts (화면 20) — 실제 RLS (publishable 키 + 각 계정 로그인). 판정에 service role 미사용.
// 기준(구현이 아니라 여기서 도출): harness/d7-data.md §30 (N1 예외 · 게시판 테이블 · 읽기/쓰기 RLS · 운영자 · 미리 등록 FAQ · 테스트),
//   design/rules.json board (author = 학교명 + '선생님', 이름·이메일 비공개 · faq_examples) · auth.board_exception,
//   public/guide/index.html '자주 묻는 질문' (질문·답 문구 그대로).
// - 테스트가 만든 글만 지운다(글쓴이 세션으로). seed FAQ 는 읽기만 하고 수정·삭제 시도도 하지 않는다.
// - 답변이 달린 글·숨긴 글은 RLS 로 만들 수 없다(d7 §30: 운영자 쓰기는 service role 만) → 그 상태 "준비"에만 service role 을 쓰고,
//   판정(수정·삭제·읽기)은 전부 각 계정 세션으로 한다. 준비용 키가 없으면 실패한다(건너뛰지 않음).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { anonClient, signIn, uniqueTag, type Session } from "./db-helpers";

test.describe.configure({ mode: "default" });

const ROOT = process.cwd();
/* eslint-disable @typescript-eslint/no-explicit-any */
const rules: any = JSON.parse(readFileSync(join(ROOT, "design", "rules.json"), "utf8"));
/* eslint-enable @typescript-eslint/no-explicit-any */

const DEMO_SCHOOL_ID = (() => {
  const src = readFileSync(join(ROOT, "lib", "supabase", "demo-data.ts"), "utf8");
  const m = src.match(/export const DEMO_SCHOOL_ID\s*=\s*"([0-9a-f-]{36})"/);
  if (!m) throw new Error("lib/supabase/demo-data.ts 에서 DEMO_SCHOOL_ID 를 찾지 못했습니다");
  return m[1];
})();

// ---------- 기대 FAQ 16개 (가이드 14개 + rules faq_examples 중 d7 §30 이 고른 2개, 이 순서) ----------
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
  const out: { q: string; a: string }[] = [];
  for (const m of sec[0].matchAll(/<details>\s*<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>\s*<\/details>/g)) {
    out.push({ q: decodeHtml(m[1]), a: decodeHtml(m[2]) });
  }
  return out;
}

/** d7 §30 '미리 등록 FAQ' 줄에서 rules board.faq_examples 중 고른 질문 (따옴표 안 문구) */
function d7PickedExamples(): { q: string; a: string }[] {
  const d7 = readFileSync(join(ROOT, "harness", "d7-data.md"), "utf8");
  const line = d7.split(/\r?\n/).find((l) => l.startsWith("| 미리 등록 FAQ"));
  if (!line) throw new Error("d7 §30 '미리 등록 FAQ' 줄이 없습니다");
  const quoted = [...line.matchAll(/'([^']+\?)'/g)].map((m) => m[1]);
  const examples: { q: string; a: string }[] = rules.board.faq_examples;
  return quoted.map((q) => {
    const ex = examples.find((e) => e.q === q);
    if (!ex) throw new Error(`rules board.faq_examples 에 '${q}' 가 없습니다`);
    return ex;
  });
}

const GUIDE_FAQ = guideFaq();
const PICKED = d7PickedExamples();
const EXPECTED_FAQ = [...GUIDE_FAQ, ...PICKED];

// ---------- 준비 · 정리 ----------
const LIST_KEYS = ["id", "category", "title", "body", "school_name", "answered", "created_at", "updated_at", "is_mine"].sort();
const DETAIL_KEYS = ["id", "category", "title", "body", "school_name", "answer", "answered_at", "created_at", "updated_at", "is_mine"].sort();
const PRIVATE_KEYS = ["author_id", "author_school_id", "name", "email", "role", "user_id", "author_name", "author_email", "author_role"];

function setupClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("답변·숨김 상태 준비에 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다 (.env.local) — 판정에는 쓰지 않음");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

/** 이 워커가 만든 글 (끝나면 지운다) */
const created: { id: string; author: Session }[] = [];

async function newPost(s: Session, tag: string, category: "bug" | "idea" = "bug"): Promise<string> {
  const { data, error } = await s.client
    .from("board_posts")
    .insert({ category, title: `S20-db-${tag}`, body: `테스트 본문 ${tag}`, author_id: s.userId, author_school_id: s.schoolId })
    .select("id")
    .single();
  expect(error, `글쓰기 (${s.role}): ${error?.message}`).toBeNull();
  const id = (data as { id: string }).id;
  created.push({ id, author: s });
  return id;
}

async function readAsAuthor(s: Session, id: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await s.client.from("board_posts").select("*").eq("id", id);
  expect(error, `board_posts 조회: ${error?.message}`).toBeNull();
  return ((data ?? [])[0] as Record<string, unknown>) ?? null;
}

async function schoolName(s: Session): Promise<string> {
  const { data, error } = await s.client.from("schools").select("name").eq("id", s.schoolId).single();
  expect(error, `자기 학교 이름: ${error?.message}`).toBeNull();
  return (data as { name: string }).name;
}

async function countByTitle(s: Session, title: string): Promise<number> {
  const { data, error } = await s.client.from("board_posts").select("id").eq("title", title);
  expect(error, `제목으로 조회: ${error?.message}`).toBeNull();
  return (data ?? []).length;
}

test.afterAll(async () => {
  const leftovers: string[] = [];
  for (const c of created.splice(0)) {
    const r = await c.author.client.from("board_posts").delete().eq("id", c.id).select("id");
    if (!r.error && (r.data ?? []).length === 1) continue;
    leftovers.push(c.id);
  }
  // 숨긴 글은 글쓴이에게도 안 보여 지우지 못한다 → 이 테스트가 만든 글(id 로 지정)만 준비용 클라이언트로 지운다
  if (leftovers.length > 0) {
    const r = await setupClient().from("board_posts").delete().in("id", leftovers).like("title", "S20-db-%");
    if (r.error) throw new Error(`테스트 글 정리 실패: ${r.error.message}`);
  }
});

// ---------- N1-db: 게시판만 학교를 넘어 읽힘, 쓰기는 학교를 넘지 못함 ----------
test("[N1-db][S20] 학교 B 교사가 학교 A 교사 글을 읽는다 (auth.board_exception) — 표·board_post·목록 모두", async ({}, info) => {
  const a = await signIn("teacher");
  const b = await signIn("schoolB");
  expect(b.schoolId).not.toBe(a.schoolId);
  const id = await newPost(a, uniqueTag(info));

  const direct = await b.client.from("board_posts").select("id, title").eq("id", id);
  expect(direct.error).toBeNull();
  expect(direct.data ?? []).toHaveLength(1);

  const one = await b.client.rpc("board_post", { p_id: id });
  expect(one.error, one.error?.message).toBeNull();
  expect((one.data ?? []) as unknown[]).toHaveLength(1);
  const row = (one.data as Record<string, unknown>[])[0];
  expect(row.school_name).toBe(await schoolName(a));
  expect(row.is_mine).toBe(false);

  const list = await b.client.rpc("board_posts_list", { p_category: "bug", p_limit: 200, p_offset: 0 });
  expect(list.error, list.error?.message).toBeNull();
  expect(((list.data ?? []) as { id: string }[]).some((r) => r.id === id)).toBe(true);
});

test("[N1-db][S20] 학교 B 교사가 학교 A 글 수정·삭제 = 0행, 글은 그대로", async ({}, info) => {
  const a = await signIn("teacher");
  const b = await signIn("schoolB");
  const id = await newPost(a, uniqueTag(info));
  const before = await readAsAuthor(a, id);

  const up = await b.client.from("board_posts").update({ title: "N1-db-침범" }).eq("id", id).select("id");
  expect(up.data ?? [], `update: ${up.error?.message}`).toHaveLength(0);
  const del = await b.client.from("board_posts").delete().eq("id", id).select("id");
  expect(del.data ?? [], `delete: ${del.error?.message}`).toHaveLength(0);

  expect(await readAsAuthor(a, id)).toEqual(before);
});

test("[N1-db][S20] 게시판 예외가 profiles 로 번지지 않음 — 학교 B 가 학교 A 글쓴이 프로필 0행", async ({}, info) => {
  const a = await signIn("teacher");
  const b = await signIn("schoolB");
  await newPost(a, uniqueTag(info));
  const { data, error } = await b.client.from("profiles").select("*").eq("user_id", a.userId);
  expect(error).toBeNull();
  expect(data ?? []).toHaveLength(0);
});

// ---------- R-db: 글쓰기 ----------
test("[R-db][S20] 학생 글쓰기 거부 (bug·idea 모두), 행 0", async ({}, info) => {
  const s = await signIn("student");
  for (const category of ["bug", "idea"] as const) {
    const title = `S20-db-학생-${category}-${uniqueTag(info)}`;
    const r = await s.client
      .from("board_posts")
      .insert({ category, title, body: "학생 글", author_id: s.userId, author_school_id: s.schoolId })
      .select("id");
    expect(r.error, `학생 ${category} insert 는 거부되어야 함`).not.toBeNull();
    for (const x of (r.data ?? []) as { id: string }[]) created.push({ id: x.id, author: s });
    expect(await countByTitle(await signIn("teacher"), title)).toBe(0);
  }
});

test("[R-db][S20] 교사 bug · admin idea 글쓰기 성공 (자기 author_id · 자기 학교)", async ({}, info) => {
  const t = await signIn("teacher");
  const ad = await signIn("admin");
  const tid = await newPost(t, uniqueTag(info), "bug");
  const aid = await newPost(ad, uniqueTag(info), "idea");
  const tr = await readAsAuthor(t, tid);
  const ar = await readAsAuthor(ad, aid);
  expect(tr).toMatchObject({ category: "bug", author_id: t.userId, author_school_id: t.schoolId, answer: null, answered_at: null, hidden_at: null });
  expect(ar).toMatchObject({ category: "idea", author_id: ad.userId, author_school_id: ad.schoolId, answer: null, answered_at: null, hidden_at: null });
});

test("[R-db][S20] 교사 글쓰기 거부: faq · 남의 author_id · 다른 학교 · 데모 학교 · answer/answered_at/hidden_at 지정", async ({}, info) => {
  const t = await signIn("teacher");
  const ad = await signIn("admin");
  const b = await signIn("schoolB");
  const now = new Date().toISOString();
  const cases: { label: string; row: Record<string, unknown> }[] = [
    { label: "category faq (글쓴이 있음)", row: { category: "faq", author_id: t.userId, author_school_id: t.schoolId } },
    { label: "category faq (글쓴이 없음)", row: { category: "faq" } },
    { label: "남의 author_id (같은 학교 admin)", row: { category: "bug", author_id: ad.userId, author_school_id: t.schoolId } },
    { label: "다른 학교 author_school_id", row: { category: "bug", author_id: t.userId, author_school_id: b.schoolId } },
    { label: "데모 학교 author_school_id", row: { category: "bug", author_id: t.userId, author_school_id: DEMO_SCHOOL_ID } },
    { label: "answer 지정", row: { category: "bug", author_id: t.userId, author_school_id: t.schoolId, answer: "셀프 답변", answered_at: now } },
    { label: "hidden_at 지정", row: { category: "bug", author_id: t.userId, author_school_id: t.schoolId, hidden_at: now } },
  ];
  for (const c of cases) {
    const title = `S20-db-거부-${uniqueTag(info)}`;
    const r = await t.client.from("board_posts").insert({ title, body: "거부되어야 함", ...c.row }).select("id");
    for (const x of (r.data ?? []) as { id: string }[]) created.push({ id: x.id, author: t });
    expect(r.error, `${c.label}: insert 는 거부되어야 함`).not.toBeNull();
    expect(await countByTitle(t, title), c.label).toBe(0);
  }
});

test("[R-db][S20] 학교 B 교사도 자기 학교로는 글쓰기 성공 (교차 학교 쓰기 거부의 양성 대조)", async ({}, info) => {
  const b = await signIn("schoolB");
  const id = await newPost(b, uniqueTag(info), "idea");
  expect(await readAsAuthor(b, id)).toMatchObject({ author_id: b.userId, author_school_id: b.schoolId });
});

// ---------- R-db: 수정 ----------
test("[R-db][S20] 글쓴이는 답변 전 제목·본문·분류(bug↔idea)를 고친다", async ({}, info) => {
  const t = await signIn("teacher");
  const id = await newPost(t, uniqueTag(info), "bug");
  const r = await t.client.from("board_posts").update({ title: `S20-db-고침-${uniqueTag(info)}`, body: "고친 본문", category: "idea" }).eq("id", id).select("id");
  expect(r.error, r.error?.message).toBeNull();
  expect(r.data ?? []).toHaveLength(1);
  expect(await readAsAuthor(t, id)).toMatchObject({ body: "고친 본문", category: "idea" });
});

test("[R-db][S20] RLS 로는 글쓴이도 answer · answered_at · hidden_at · faq · author_* 를 쓰지 못한다", async ({}, info) => {
  const t = await signIn("teacher");
  const b = await signIn("schoolB");
  const id = await newPost(t, uniqueTag(info));
  const before = await readAsAuthor(t, id);
  const now = new Date().toISOString();
  const patches: { label: string; patch: Record<string, unknown> }[] = [
    { label: "answer", patch: { answer: "셀프 답변", answered_at: now } },
    { label: "answered_at", patch: { answered_at: now } },
    { label: "hidden_at", patch: { hidden_at: now } },
    { label: "category faq", patch: { category: "faq" } },
    { label: "author_id", patch: { author_id: (await signIn("admin")).userId } },
    { label: "author_school_id", patch: { author_school_id: b.schoolId } },
  ];
  for (const p of patches) {
    const r = await t.client.from("board_posts").update(p.patch).eq("id", id).select("id");
    expect(r.error !== null || (r.data ?? []).length === 0, `${p.label}: 거부(오류 또는 0행)여야 함`).toBe(true);
  }
  expect(await readAsAuthor(t, id)).toEqual(before);
});

test("[R-db][S20] 같은 학교 다른 교사(admin)도 남의 글 수정·삭제 = 0행", async ({}, info) => {
  const t = await signIn("teacher");
  const ad = await signIn("admin");
  const id = await newPost(t, uniqueTag(info));
  const before = await readAsAuthor(t, id);
  const up = await ad.client.from("board_posts").update({ title: "R-db-침범" }).eq("id", id).select("id");
  expect(up.data ?? []).toHaveLength(0);
  const del = await ad.client.from("board_posts").delete().eq("id", id).select("id");
  expect(del.data ?? []).toHaveLength(0);
  expect(await readAsAuthor(t, id)).toEqual(before);
});

test("[R-db][S20] 답변이 달린 글: 글쓴이 수정 = 0행 · 삭제 = 성공 · board_my_answered_count ≥ 1", async ({}, info) => {
  const t = await signIn("teacher");
  const id = await newPost(t, uniqueTag(info));
  const answeredAt = new Date().toISOString();
  const prep = await setupClient().from("board_posts").update({ answer: "운영자 답변(테스트 준비)", answered_at: answeredAt }).eq("id", id).select("id");
  expect(prep.error, `준비(답변 달기): ${prep.error?.message}`).toBeNull();
  expect(prep.data ?? []).toHaveLength(1);

  const detail = await t.client.rpc("board_post", { p_id: id });
  expect(detail.error).toBeNull();
  expect((detail.data as Record<string, unknown>[])[0]).toMatchObject({ answer: "운영자 답변(테스트 준비)", is_mine: true });

  const cnt = await t.client.rpc("board_my_answered_count");
  expect(cnt.error, cnt.error?.message).toBeNull();
  expect(Number(cnt.data)).toBeGreaterThanOrEqual(1);

  const before = await readAsAuthor(t, id);
  const up = await t.client.from("board_posts").update({ title: `S20-db-답변뒤-${uniqueTag(info)}` }).eq("id", id).select("id");
  expect(up.error !== null || (up.data ?? []).length === 0, "답변 뒤 수정은 거부(오류 또는 0행)").toBe(true);
  expect(await readAsAuthor(t, id)).toEqual(before);

  const del = await t.client.from("board_posts").delete().eq("id", id).select("id");
  expect(del.error, del.error?.message).toBeNull();
  expect(del.data ?? []).toHaveLength(1);
  expect(await readAsAuthor(t, id)).toBeNull();
});

test("[R-db][S20] 글쓴이는 자기 글을 삭제한다 (실제 delete — 다른 학교에서도 사라짐)", async ({}, info) => {
  const t = await signIn("teacher");
  const b = await signIn("schoolB");
  const id = await newPost(t, uniqueTag(info));
  const del = await t.client.from("board_posts").delete().eq("id", id).select("id");
  expect(del.error).toBeNull();
  expect(del.data ?? []).toHaveLength(1);
  const after = await b.client.from("board_posts").select("id").eq("id", id);
  expect(after.data ?? []).toHaveLength(0);
});

test("[R-db][S20] 학생은 읽기만 — 다른 학교 글 읽기 성공, 남의 글 수정·삭제 0행", async ({}, info) => {
  const s = await signIn("student");
  const b = await signIn("schoolB");
  const id = await newPost(b, uniqueTag(info));
  const before = await readAsAuthor(b, id);
  const one = await s.client.rpc("board_post", { p_id: id });
  expect(one.error).toBeNull();
  expect((one.data ?? []) as unknown[]).toHaveLength(1);
  const up = await s.client.from("board_posts").update({ title: "R-db-침범" }).eq("id", id).select("id");
  expect(up.data ?? []).toHaveLength(0);
  const del = await s.client.from("board_posts").delete().eq("id", id).select("id");
  expect(del.data ?? []).toHaveLength(0);
  expect(await readAsAuthor(b, id)).toEqual(before);
});

// ---------- 숨긴 글 ----------
test("[R-db][S20] 숨긴 글은 글쓴이·다른 학교 모두 0행 (표·board_post·목록), 글쓴이 수정 0행", async ({}, info) => {
  const t = await signIn("teacher");
  const b = await signIn("schoolB");
  const id = await newPost(t, uniqueTag(info));
  const prep = await setupClient().from("board_posts").update({ hidden_at: new Date().toISOString() }).eq("id", id).select("id");
  expect(prep.error, `준비(숨기기): ${prep.error?.message}`).toBeNull();
  expect(prep.data ?? []).toHaveLength(1);

  for (const s of [t, b]) {
    const direct = await s.client.from("board_posts").select("id").eq("id", id);
    expect(direct.data ?? [], `${s.role} 표`).toHaveLength(0);
    const one = await s.client.rpc("board_post", { p_id: id });
    expect((one.data ?? []) as unknown[], `${s.role} board_post`).toHaveLength(0);
    const list = await s.client.rpc("board_posts_list", { p_category: "bug", p_limit: 200, p_offset: 0 });
    expect(((list.data ?? []) as { id: string }[]).some((r) => r.id === id), `${s.role} 목록`).toBe(false);
  }
  const up = await t.client.from("board_posts").update({ title: "숨긴 글 고치기" }).eq("id", id).select("id");
  expect(up.data ?? []).toHaveLength(0);
});

// ---------- anon · 데모(둘러보기) ----------
test("[R-db][S20] anon(둘러보기 포함) 읽기 0행 · 함수 실행 불가 · 글쓰기 거부", async ({}, info) => {
  const t = await signIn("teacher");
  await newPost(t, uniqueTag(info));
  const anon = anonClient();
  const sel = await anon.from("board_posts").select("id").limit(50);
  expect(sel.data ?? [], `anon select: ${sel.error?.message}`).toHaveLength(0);
  for (const category of ["faq", "bug", "idea"]) {
    const list = await anon.rpc("board_posts_list", { p_category: category, p_limit: 50, p_offset: 0 });
    expect((list.data ?? []) as unknown[], `anon board_posts_list(${category})`).toHaveLength(0);
  }
  const cnt = await anon.rpc("board_my_answered_count");
  expect(cnt.error !== null || Number(cnt.data) === 0).toBe(true);
  const title = `S20-db-anon-${uniqueTag(info)}`;
  const ins = await anon.from("board_posts").insert({ category: "bug", title, body: "anon", author_school_id: DEMO_SCHOOL_ID }).select("id");
  expect(ins.error, "anon insert 는 거부").not.toBeNull();
  expect(await countByTitle(t, title)).toBe(0);
});

// ---------- 읽기 함수: 글쓴이 표시 = 학교명만 ----------
test("[R-db][S20] board_posts_list · board_post 열 = 학교명 표시만 (author_id·이름·이메일·역할 없음)", async ({}, info) => {
  const t = await signIn("teacher");
  const b = await signIn("schoolB");
  const id = await newPost(t, uniqueTag(info));
  const nameA = await schoolName(t);

  for (const category of ["faq", "bug"]) {
    const list = await b.client.rpc("board_posts_list", { p_category: category, p_limit: 200, p_offset: 0 });
    expect(list.error, list.error?.message).toBeNull();
    const rows = (list.data ?? []) as Record<string, unknown>[];
    expect(rows.length, `${category} 목록 ≥ 1`).toBeGreaterThan(0);
    for (const r of rows) {
      expect(Object.keys(r).sort()).toEqual(LIST_KEYS);
      for (const k of PRIVATE_KEYS) expect(r, `${category} 목록에 ${k} 없음`).not.toHaveProperty(k);
    }
    if (category === "bug") {
      const mine = rows.find((r) => r.id === id);
      expect(mine).toMatchObject({ school_name: nameA, answered: false, is_mine: false });
    }
  }

  const one = await b.client.rpc("board_post", { p_id: id });
  expect(one.error).toBeNull();
  const row = (one.data as Record<string, unknown>[])[0];
  expect(Object.keys(row).sort()).toEqual(DETAIL_KEYS);
  for (const k of PRIVATE_KEYS) expect(row).not.toHaveProperty(k);
  // 학교명 외 개인 정보 문자열이 값에 섞이지 않는다 (글쓴이 uuid · 이메일)
  const flat = JSON.stringify(row);
  expect(flat).not.toContain(t.userId);
  expect(flat).not.toContain(process.env.TEST_TEACHER_EMAIL ?? "@@없음@@");

  const self = await t.client.rpc("board_post", { p_id: id });
  expect((self.data as Record<string, unknown>[])[0]).toMatchObject({ is_mine: true, school_name: nameA });
});

test("[R-db][S20] bug·idea 목록은 최신순", async ({}, info) => {
  const t = await signIn("teacher");
  const first = await newPost(t, `${uniqueTag(info)}-1`, "idea");
  const second = await newPost(t, `${uniqueTag(info)}-2`, "idea");
  const list = await t.client.rpc("board_posts_list", { p_category: "idea", p_limit: 200, p_offset: 0 });
  expect(list.error).toBeNull();
  const ids = ((list.data ?? []) as { id: string; created_at: string }[]).map((r) => r.id);
  expect(ids.indexOf(second)).toBeGreaterThanOrEqual(0);
  expect(ids.indexOf(second)).toBeLessThan(ids.indexOf(first));
  const times = ((list.data ?? []) as { created_at: string }[]).map((r) => Date.parse(r.created_at));
  for (let i = 1; i < times.length; i++) expect(times[i]).toBeLessThanOrEqual(times[i - 1]);
});

// ---------- 미리 등록 FAQ 16개 ----------
test("[R-db][S20] 기대 FAQ 출처 확인 — 가이드 14개 + d7 이 고른 rules 예시 2개", () => {
  expect(GUIDE_FAQ).toHaveLength(14);
  expect(PICKED.map((p) => p.q)).toEqual(["온라인학교는 회원가입에서 어디에 있나요?", "만 14세 미만 학생도 가입할 수 있나요?"]);
  expect(new Set(EXPECTED_FAQ.map((f) => f.q)).size).toBe(EXPECTED_FAQ.length);
});

for (const role of ["student", "teacher", "schoolB"] as const) {
  test(`[R-db][S20] FAQ seed ${EXPECTED_FAQ.length}개가 가이드 순서 → 예시 2개 순으로, 문구 그대로 (${role})`, async () => {
    const s = await signIn(role);
    const list = await s.client.rpc("board_posts_list", { p_category: "faq", p_limit: 200, p_offset: 0 });
    expect(list.error, list.error?.message).toBeNull();
    const rows = (list.data ?? []) as Record<string, unknown>[];
    const seedTitles = new Set(EXPECTED_FAQ.map((f) => f.q));
    const seeds = rows.filter((r) => seedTitles.has(String(r.title)));
    // 제목마다 정확히 1행 (다시 실행해도 중복 없음) · 순서 · 본문 그대로
    expect(seeds.map((r) => ({ q: r.title, a: r.body }))).toEqual(EXPECTED_FAQ);
    // seed 는 FAQ 목록 맨 앞 16개 (운영자가 나중에 더한 FAQ 는 뒤에)
    expect(rows.slice(0, EXPECTED_FAQ.length).map((r) => r.title)).toEqual(EXPECTED_FAQ.map((f) => f.q));
    for (const r of seeds) {
      expect(r).toMatchObject({ category: "faq", school_name: null, answered: false, is_mine: false });
    }
  });
}

test("[R-db][S20] 직접 표 조회로도 FAQ seed 는 글쓴이·학교 없음 (author_id · author_school_id null)", async () => {
  const s = await signIn("teacher");
  const { data, error } = await s.client
    .from("board_posts")
    .select("title, author_id, author_school_id, answer, hidden_at")
    .eq("category", "faq");
  expect(error, error?.message).toBeNull();
  // 제목 필터는 JS 에서: PostgREST in() 은 따옴표·괄호가 든 제목("AI 추출을 쓸 수 없어요(서버 설정)"…)을 잘못 나눠 일부 행을 놓친다
  const seedTitles = new Set(EXPECTED_FAQ.map((f) => f.q));
  const seeds = (data ?? []).filter((r) => seedTitles.has(String(r.title)));
  expect(seeds.map((r) => r.title).sort()).toEqual([...seedTitles].sort());
  for (const r of seeds) expect(r).toMatchObject({ author_id: null, author_school_id: null, answer: null, hidden_at: null });
});

test("[R-db][S20] 테스트 글 정리 대상은 이 워커가 만든 S20-db- 글뿐 (seed 보호 전제)", () => {
  for (const f of EXPECTED_FAQ) expect(f.q.startsWith("S20-db-")).toBe(false);
  expect(existsSync(join(ROOT, "public", "guide", "index.html"))).toBe(true);
});
