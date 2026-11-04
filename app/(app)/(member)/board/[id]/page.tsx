import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getPostAsOperator } from "@/lib/server/board-admin";
import { isBoardOperator } from "@/lib/server/board-operator";
import { getBoardAccess, getBoardPost, listBoardPosts, type BoardPostDetail } from "@/lib/supabase/board";
import { BoardPostView } from "../_board/board-post-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "게시판 · Lab_Stock" };

type Props = { params: Promise<{ id: string }> };

/**
 * 화면 20-detail `/board/[id]` (d7 §30): 숨긴 글·없는 글·FAQ = 404 (FAQ 는 목록에서 펼친다).
 * 운영자는 숨긴 글도 본다('숨긴 글' caption) — 운영자 확인을 통과한 뒤에만 service role 로 읽는다(lib/server/board-admin).
 * 모바일 = 전용 화면 / 데스크톱 = 같은 분류 글 목록 + 오른쪽 detail-drawer (시안 20-detail-desktop).
 */
export default async function BoardPostPage({ params }: Props) {
  const { id } = await params;
  const access = await getBoardAccess();
  if (access.kind === "signed-out") redirect("/login");
  if (access.kind !== "member") redirect("/");

  const [found, operator] = await Promise.all([getBoardPost(id), isBoardOperator()]);
  let post: BoardPostDetail | null = found;
  let hidden = false;
  if (!post && operator) {
    const r = await getPostAsOperator(id);
    if (r.ok) {
      post = { ...r.data, answered: r.data.answer != null, isMine: false };
      hidden = r.data.hidden;
    }
  }
  if (!post || post.category === "faq") notFound();

  const list = await listBoardPosts(post.category);
  return (
    <BoardPostView
      post={post}
      hidden={hidden}
      operator={operator}
      canWrite={access.canWrite}
      list={{ items: list.ok ? list.items : [], hasMore: list.ok && list.hasMore, error: list.ok ? null : list.error }}
    />
  );
}
