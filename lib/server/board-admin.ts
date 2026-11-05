import "server-only";
import { createAdminClient, adminErrorTag, isAdminConfigError, toAdminErrorInfo } from "./supabase-admin";
import { checkBoardAnswer, checkBoardInput, isBoardCategory, type BoardCategory, type BoardInputField } from "@/lib/board";

/**
 * 게시판 운영자 쓰기 (d7 §30) — FAQ 작성·수정·삭제, 답변 작성·수정, 글 숨기기·되살리기, 숨긴 글 보기.
 * RLS 로는 누구도 answer·hidden_at·faq 를 쓰지 못하므로 service role 로만 한다.
 * 이 함수들은 운영자 확인(lib/server/board-operator.ts)을 통과한 app/api/board/** 에서만 부른다.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BoardAdminCode = "not-found" | "invalid" | "config" | "failed";
export type BoardAdminResult<T> = { ok: true; data: T } | { ok: false; code: BoardAdminCode; error: string; field?: BoardInputField | "answer" };

const NOT_FOUND = "글을 찾을 수 없어요";
const CONFIG = "서버 설정 문제로 저장하지 못했어요";
const FAILED = "저장하지 못했어요. 잠시 후 다시 시도해 주세요";

function fail<T>(e: unknown): BoardAdminResult<T> {
  const info = toAdminErrorInfo(e);
  console.error(`[board-admin] ${adminErrorTag(info)}`);
  return isAdminConfigError(info) ? { ok: false, code: "config", error: CONFIG } : { ok: false, code: "failed", error: FAILED };
}

function admin() {
  return createAdminClient();
}

export type OperatorPost = {
  id: string;
  category: BoardCategory;
  title: string;
  body: string;
  schoolName: string | null;
  answer: string | null;
  answeredAt: string | null;
  hidden: boolean;
  createdAt: string;
  updatedAt: string;
};

/** 운영자의 글 보기 — 숨긴 글도 보인다 (화면은 '숨긴 글' caption). 글쓴이는 학교명만 */
export async function getPostAsOperator(id: string): Promise<BoardAdminResult<OperatorPost>> {
  if (!UUID_RE.test(id)) return { ok: false, code: "not-found", error: NOT_FOUND };
  try {
    const { data, error } = await admin()
      .from("board_posts")
      .select("id, category, title, body, answer, answered_at, hidden_at, created_at, updated_at, schools(name)")
      .eq("id", id)
      .maybeSingle();
    if (error) return fail(error);
    if (!data) return { ok: false, code: "not-found", error: NOT_FOUND };
    const school = data.schools as { name: string } | null;
    return {
      ok: true,
      data: {
        id: data.id,
        category: isBoardCategory(data.category) ? data.category : "bug",
        title: data.title,
        body: data.body,
        schoolName: school?.name ?? null,
        answer: data.answer,
        answeredAt: data.answered_at,
        hidden: data.hidden_at != null,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

/** FAQ 추가 (질문 = title, 답 = body, 글쓴이 없음) */
export async function createFaq(title: unknown, body: unknown): Promise<BoardAdminResult<{ id: string }>> {
  const c = checkBoardInput(title, body);
  if (!c.ok) return { ok: false, code: "invalid", error: c.error, field: c.field };
  try {
    const { data, error } = await admin()
      .from("board_posts")
      .insert({ category: "faq", title: c.title, body: c.body })
      .select("id")
      .single();
    if (error || !data) return fail(error);
    return { ok: true, data: { id: data.id } };
  } catch (e) {
    return fail(e);
  }
}

/** FAQ 고치기 — FAQ 행만 */
export async function updateFaq(id: string, title: unknown, body: unknown): Promise<BoardAdminResult<{ id: string }>> {
  if (!UUID_RE.test(id)) return { ok: false, code: "not-found", error: NOT_FOUND };
  const c = checkBoardInput(title, body);
  if (!c.ok) return { ok: false, code: "invalid", error: c.error, field: c.field };
  try {
    const { data, error } = await admin()
      .from("board_posts")
      .update({ title: c.title, body: c.body })
      .eq("id", id)
      .eq("category", "faq")
      .select("id");
    if (error) return fail(error);
    if (!data || data.length === 0) return { ok: false, code: "not-found", error: NOT_FOUND };
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

/** FAQ 삭제 — FAQ 행만 (교사 글은 운영자가 지우지 않고 숨긴다) */
export async function deleteFaq(id: string): Promise<BoardAdminResult<{ id: string }>> {
  if (!UUID_RE.test(id)) return { ok: false, code: "not-found", error: NOT_FOUND };
  try {
    const { data, error } = await admin().from("board_posts").delete().eq("id", id).eq("category", "faq").select("id");
    if (error) return fail(error);
    if (!data || data.length === 0) return { ok: false, code: "not-found", error: NOT_FOUND };
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

/** 답변 등록·고치기 — 오류 문의·개선 제안 글만. answered_at = 마지막으로 저장한 시각 */
export async function saveAnswer(id: string, answer: unknown): Promise<BoardAdminResult<{ id: string; answeredAt: string }>> {
  if (!UUID_RE.test(id)) return { ok: false, code: "not-found", error: NOT_FOUND };
  const c = checkBoardAnswer(answer);
  if (!c.ok) return { ok: false, code: "invalid", error: c.error, field: "answer" };
  const answeredAt = new Date().toISOString();
  try {
    const { data, error } = await admin()
      .from("board_posts")
      .update({ answer: c.answer, answered_at: answeredAt })
      .eq("id", id)
      .in("category", ["bug", "idea"])
      .select("id");
    if (error) return fail(error);
    if (!data || data.length === 0) return { ok: false, code: "not-found", error: NOT_FOUND };
    return { ok: true, data: { id, answeredAt } };
  } catch (e) {
    return fail(e);
  }
}

/** 글 숨기기·되살리기 (FAQ 포함 모든 분류) */
export async function setPostHidden(id: string, hidden: boolean): Promise<BoardAdminResult<{ id: string; hidden: boolean }>> {
  if (!UUID_RE.test(id)) return { ok: false, code: "not-found", error: NOT_FOUND };
  try {
    const { data, error } = await admin()
      .from("board_posts")
      .update({ hidden_at: hidden ? new Date().toISOString() : null })
      .eq("id", id)
      .select("id");
    if (error) return fail(error);
    if (!data || data.length === 0) return { ok: false, code: "not-found", error: NOT_FOUND };
    return { ok: true, data: { id, hidden } };
  } catch (e) {
    return fail(e);
  }
}
