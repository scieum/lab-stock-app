import "server-only";
import { getServerClient, getServerSession } from "./server";
import {
  BOARD_PAGE_SIZE,
  checkBoardInput,
  isBoardCategory,
  type BoardCategory,
  type BoardInputField,
} from "@/lib/board";

/**
 * 게시판 (화면 20, d7 §30) — 로그인 세션(publishable 키 + 쿠키)으로만 읽고 쓴다. service role 미사용 (RLS 적용).
 * RLS: 읽기 = 프로필 있는 로그인 사용자(학생 포함) · 숨기지 않은 모든 학교 글. 쓰기 = 교사·admin 이 bug·idea 만.
 * 글쓴이 표시는 DB 함수가 붙인 학교명만 — 이름·이메일·역할·author_id 는 받지도 내보내지도 않는다.
 */

const SIGNED_OUT = "다시 로그인해 주세요";
const NO_SCHOOL = "소속 학교가 없어요";
const STAFF_ONLY = "글쓰기는 교사·admin만 할 수 있어요";
const NOT_FOUND = "글을 찾을 수 없어요";
const NOT_EDITABLE = "답변이 달린 글은 고칠 수 없어요";
const BAD_CATEGORY = "분류를 골라 주세요";
const SAVE_FAILED = "저장하지 못했어요. 잠시 후 다시 시도해 주세요";
const DELETE_FAILED = "삭제하지 못했어요. 잠시 후 다시 시도해 주세요";
const LOAD_FAILED = "글을 불러오지 못했어요. 잠시 후 다시 시도해 주세요";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BoardListItem = {
  id: string;
  category: BoardCategory;
  title: string;
  /** FAQ 는 목록에서 펼쳐 보이므로 본문을 함께 준다 */
  body: string;
  /** 글쓴이 학교명 (FAQ = null → '운영자') */
  schoolName: string | null;
  answered: boolean;
  createdAt: string;
  updatedAt: string;
  isMine: boolean;
};

export type BoardPostDetail = BoardListItem & {
  answer: string | null;
  answeredAt: string | null;
};

export type BoardAccess =
  | { kind: "signed-out" }
  | { kind: "no-school" }
  | { kind: "member"; canWrite: boolean };

/** 화면 20 접근 — 로그인 + 학교 프로필이면 읽기, 교사·admin 이면 글쓰기 */
export async function getBoardAccess(): Promise<BoardAccess> {
  const me = await getServerSession();
  if (me.kind === "signed-out" || me.kind === "unavailable") return { kind: "signed-out" };
  if (me.kind === "no-school") return { kind: "no-school" };
  return { kind: "member", canWrite: me.role === "teacher" || me.role === "admin" };
}

type ListRow = {
  id: string;
  category: string;
  title: string;
  body: string;
  school_name: string | null;
  answered: boolean;
  created_at: string;
  updated_at: string;
  is_mine: boolean;
};

function toItem(r: ListRow): BoardListItem {
  return {
    id: r.id,
    category: isBoardCategory(r.category) ? r.category : "bug",
    title: r.title,
    body: r.body,
    schoolName: r.school_name ?? null,
    answered: !!r.answered,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    isMine: !!r.is_mine,
  };
}

export type BoardListResult =
  | { ok: true; items: BoardListItem[]; hasMore: boolean }
  | { ok: false; error: string };

/**
 * 분류별 목록. FAQ = 전부(가이드 순서), 오류 문의·개선 제안 = 최신순 20개씩 (offset 으로 '더 보기').
 * limit + 1 개를 읽어 다음 쪽이 있는지 안다.
 */
export async function listBoardPosts(category: BoardCategory, offset = 0): Promise<BoardListResult> {
  const supabase = await getServerClient();
  const pageSize = category === "faq" ? 200 : BOARD_PAGE_SIZE;
  const { data, error } = await supabase.rpc("board_posts_list", {
    p_category: category,
    p_limit: category === "faq" ? pageSize : pageSize + 1,
    p_offset: category === "faq" ? 0 : Math.max(0, Math.floor(offset)),
  });
  if (error) return { ok: false, error: LOAD_FAILED };
  const rows = (data ?? []) as ListRow[];
  const hasMore = category !== "faq" && rows.length > pageSize;
  return { ok: true, items: rows.slice(0, pageSize).map(toItem), hasMore };
}

/** 글 하나 (답변 포함). 숨긴 글·없는 글·잘못된 id = null (화면은 404) */
export async function getBoardPost(id: string): Promise<BoardPostDetail | null> {
  if (!UUID_RE.test(id)) return null;
  const supabase = await getServerClient();
  const { data, error } = await supabase.rpc("board_post", { p_id: id });
  if (error) throw new Error(LOAD_FAILED);
  const r = (data ?? [])[0] as (ListRow & { answer: string | null; answered_at: string | null }) | undefined;
  if (!r) return null;
  return {
    ...toItem({ ...r, answered: r.answer != null }),
    answer: r.answer ?? null,
    answeredAt: r.answered_at ?? null,
  };
}

/** 관리 탭 board-link 요약 — 내가 쓴 글 중 답변 완료 수 (학생·오류 = 0, caption 없음) */
export async function countMyAnsweredPosts(): Promise<number> {
  const me = await getServerSession();
  if (me.kind !== "member" || me.role === "student") return 0;
  const supabase = await getServerClient();
  const { data, error } = await supabase.rpc("board_my_answered_count");
  if (error || typeof data !== "number") return 0;
  return data;
}

export type SaveBoardPostResult =
  | { ok: true; id: string }
  | { ok: false; error: string; field?: BoardInputField | "category" };

export type BoardPostInput = { category: unknown; title: unknown; body: unknown };

function postCategory(v: unknown): "bug" | "idea" | null {
  return v === "bug" || v === "idea" ? v : null;
}

/** 글쓰기 (교사·admin, bug·idea). author_id·author_school_id 는 세션에서 — RLS 가 다시 확인한다 */
export async function createBoardPost(input: BoardPostInput): Promise<SaveBoardPostResult> {
  const me = await getServerSession();
  if (me.kind === "signed-out" || me.kind === "unavailable") return { ok: false, error: SIGNED_OUT };
  if (me.kind === "no-school") return { ok: false, error: NO_SCHOOL };
  if (me.role !== "teacher" && me.role !== "admin") return { ok: false, error: STAFF_ONLY };
  const category = postCategory(input.category);
  if (!category) return { ok: false, error: BAD_CATEGORY, field: "category" };
  const checked = checkBoardInput(input.title, input.body);
  if (!checked.ok) return { ok: false, error: checked.error, field: checked.field };

  const supabase = await getServerClient();
  const { data, error } = await supabase
    .from("board_posts")
    .insert({
      category,
      title: checked.title,
      body: checked.body,
      author_id: me.userId,
      author_school_id: me.school.id,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.code === "42501" ? STAFF_ONLY : SAVE_FAILED };
  return { ok: true, id: data.id };
}

/** 글 고치기 (글쓴이 본인 · 답변 전). RLS 가 0행이면 답변이 달렸거나 내 글이 아님 */
export async function updateBoardPost(id: string, input: BoardPostInput): Promise<SaveBoardPostResult> {
  if (!UUID_RE.test(id)) return { ok: false, error: NOT_FOUND };
  const me = await getServerSession();
  if (me.kind === "signed-out" || me.kind === "unavailable") return { ok: false, error: SIGNED_OUT };
  if (me.kind === "no-school") return { ok: false, error: NO_SCHOOL };
  const category = postCategory(input.category);
  if (!category) return { ok: false, error: BAD_CATEGORY, field: "category" };
  const checked = checkBoardInput(input.title, input.body);
  if (!checked.ok) return { ok: false, error: checked.error, field: checked.field };

  const supabase = await getServerClient();
  const { data, error } = await supabase
    .from("board_posts")
    .update({ category, title: checked.title, body: checked.body })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: SAVE_FAILED };
  if (!data || data.length === 0) {
    // 왜 0행인지: 내 글인데 답변이 달렸으면 '고칠 수 없어요', 아니면 '없어요'
    const post = await getBoardPost(id).catch(() => null);
    return { ok: false, error: post?.isMine && post.answer != null ? NOT_EDITABLE : NOT_FOUND };
  }
  return { ok: true, id };
}

export type DeleteBoardPostResult = { ok: true; id: string } | { ok: false; error: string };

/** 글 삭제 (글쓴이 본인, 답변 뒤에도 가능 — 실제 delete) */
export async function deleteBoardPost(id: string): Promise<DeleteBoardPostResult> {
  if (!UUID_RE.test(id)) return { ok: false, error: NOT_FOUND };
  const me = await getServerSession();
  if (me.kind === "signed-out" || me.kind === "unavailable") return { ok: false, error: SIGNED_OUT };
  if (me.kind === "no-school") return { ok: false, error: NO_SCHOOL };
  const supabase = await getServerClient();
  const { data, error } = await supabase.from("board_posts").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: DELETE_FAILED };
  if (!data || data.length === 0) return { ok: false, error: NOT_FOUND };
  return { ok: true, id };
}
