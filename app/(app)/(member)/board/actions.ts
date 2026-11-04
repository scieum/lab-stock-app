"use server";

import { revalidatePath } from "next/cache";
import { isBoardCategory } from "@/lib/board";
import {
  createBoardPost,
  deleteBoardPost,
  listBoardPosts,
  updateBoardPost,
  type BoardListResult,
  type BoardPostInput,
  type DeleteBoardPostResult,
  type SaveBoardPostResult,
} from "@/lib/supabase/board";

function postInput(input: unknown): BoardPostInput {
  const o = input !== null && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return { category: o.category, title: o.title, body: o.body };
}

/**
 * 게시판 글쓰기·고치기·삭제 (화면 20, d7 §30) — 로그인 세션 + RLS (lib/supabase/board). 운영자 쓰기는 app/api/board/** 가 맡는다.
 * 목록·글 보기·관리 탭 요약이 바뀌므로 /board 아래와 /manage 를 다시 받게 한다.
 */
function refresh() {
  revalidatePath("/board", "layout");
  revalidatePath("/manage");
}

export async function createBoardPostAction(input: unknown): Promise<SaveBoardPostResult> {
  const result = await createBoardPost(postInput(input));
  if (result.ok) refresh();
  return result;
}

export async function updateBoardPostAction(id: unknown, input: unknown): Promise<SaveBoardPostResult> {
  const result = await updateBoardPost(typeof id === "string" ? id : "", postInput(input));
  if (result.ok) refresh();
  return result;
}

export async function deleteBoardPostAction(id: unknown): Promise<DeleteBoardPostResult> {
  const result = await deleteBoardPost(typeof id === "string" ? id : "");
  if (result.ok) refresh();
  return result;
}

/** '더 보기' — 오류 문의·개선 제안 다음 20개 (FAQ 는 한 번에 다 온다) */
export async function loadMoreBoardPostsAction(category: unknown, offset: unknown): Promise<BoardListResult> {
  if (!isBoardCategory(category) || category === "faq") return { ok: false, error: "분류를 골라 주세요" };
  const n = typeof offset === "number" && Number.isFinite(offset) ? offset : 0;
  return listBoardPosts(category, n);
}
