import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isBoardOperator } from "@/lib/server/board-operator";
import { getBoardAccess, getBoardPost } from "@/lib/supabase/board";
import { BoardFormView } from "../../_board/board-form-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "글 수정 · 게시판 · Lab_Stock" };

type Props = { params: Promise<{ id: string }> };

/**
 * `/board/[id]/edit` (d7 §30): 글쓴이 본인 + 답변 전 = board-form 채운 채. 답변이 달렸으면 글 보기로.
 * FAQ 는 운영자만 (app/api/board/faq 로 저장). 그 밖은 404.
 */
export default async function BoardEditPage({ params }: Props) {
  const { id } = await params;
  const access = await getBoardAccess();
  if (access.kind === "signed-out") redirect("/login");
  if (access.kind !== "member") redirect("/");

  const post = await getBoardPost(id);
  if (!post) notFound();
  const values = { category: post.category, title: post.title, body: post.body };
  if (post.category === "faq") {
    if (!(await isBoardOperator())) notFound();
    return <BoardFormView mode="faq" postId={post.id} defaultValues={values} />;
  }
  if (!post.isMine) notFound();
  if (post.answer != null) redirect(`/board/${post.id}`);
  return <BoardFormView mode="post" postId={post.id} defaultValues={values} />;
}
