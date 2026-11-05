"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BoardForm, type BoardFormValues } from "@/components/board-form";
import { BOARD_HREF, BOARD_TEXT, type BoardCategory } from "@/lib/board";
import { clearFlashToast, setFlashToast } from "@/lib/flash-toast";
import { createBoardPostAction, updateBoardPostAction } from "../actions";
import { BoardBack, boardListHref, boardOperatorFetch } from "./board-list";
import styles from "./board.module.css";

type Props = {
  /** post = 교사 글(분류 오류 문의 · 개선 제안) · faq = 운영자 FAQ */
  mode: "post" | "faq";
  /** 고치기면 글 id */
  postId?: string;
  defaultValues: { category: BoardCategory; title: string; body: string };
};

const TITLE = { post: { new: BOARD_TEXT.write, edit: "글 수정" }, faq: { new: "FAQ 추가", edit: "FAQ 수정" } } as const;

/**
 * 화면 20-new 글쓰기 · 고치기 (rules board.form, d7 §30): head-row '‹ 게시판' → page-title → board-form.
 * 등록 → 그 글 보기 + ex-toast '글을 올렸어요'. FAQ(운영자) = app/api/board/faq → 목록 FAQ 탭.
 */
export function BoardFormView({ mode, postId, defaultValues }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backHref = postId && mode === "post" ? `${BOARD_HREF}/${postId}` : boardListHref(defaultValues.category);

  const submit = async (v: BoardFormValues) => {
    setSubmitting(true);
    setError(null);
    if (mode === "faq") {
      const err = postId
        ? await boardOperatorFetch(`/api/board/faq/${postId}`, "PATCH", { title: v.title, body: v.body })
        : await boardOperatorFetch("/api/board/faq", "POST", { title: v.title, body: v.body });
      if (err) {
        setError(err);
        setSubmitting(false);
        return;
      }
      router.push(BOARD_HREF);
      router.refresh();
      return;
    }
    if (!postId) setFlashToast(BOARD_TEXT.posted);
    const res = postId ? await updateBoardPostAction(postId, v) : await createBoardPostAction(v);
    if (!res.ok) {
      clearFlashToast();
      setError(res.error);
      setSubmitting(false);
      return;
    }
    router.push(`${BOARD_HREF}/${res.id}`);
  };

  return (
    <div className={[styles.page, styles.formColumn].join(" ")}>
      <div className={styles.headRow} data-name="head-row">
        <BoardBack href={backHref} />
      </div>
      <h1 className={[styles.title, styles.formHead].join(" ")}>{TITLE[mode][postId ? "edit" : "new"]}</h1>
      <div className={styles.formWrap}>
        <BoardForm
          mode={mode}
          defaultValues={defaultValues}
          submitLabel={postId ? "저장" : BOARD_TEXT.submit}
          submitting={submitting}
          error={error}
          onSubmit={submit}
        />
      </div>
    </div>
  );
}
