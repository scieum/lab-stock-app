import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isBoardOperator } from "@/lib/server/board-operator";
import { getBoardAccess } from "@/lib/supabase/board";
import { BoardFormView } from "../_board/board-form-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "글쓰기 · 게시판 · Lab_Stock" };

type Props = { searchParams: Promise<{ category?: string | string[] }> };

/**
 * 화면 20-new `/board/new?category=bug|idea` (d7 §30) — 교사·admin 만. 학생이 오면 /board 로.
 * `?category=faq` 는 운영자의 'FAQ 추가'(운영자가 아니면 /board).
 */
export default async function BoardNewPage({ searchParams }: Props) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.category) ? sp.category[0] : sp.category;
  const access = await getBoardAccess();
  if (access.kind === "signed-out") redirect("/login");
  if (access.kind !== "member") redirect("/");

  if (raw === "faq") {
    if (!(await isBoardOperator())) redirect("/board");
    return <BoardFormView mode="faq" defaultValues={{ category: "faq", title: "", body: "" }} />;
  }
  if (!access.canWrite) redirect("/board");
  return <BoardFormView mode="post" defaultValues={{ category: raw === "idea" ? "idea" : "bug", title: "", body: "" }} />;
}
