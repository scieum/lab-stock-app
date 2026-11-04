"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BoardAnswer } from "@/components/board-answer";
import { BoardDetail } from "@/components/board-detail";
import { BoardPostMenu } from "@/components/board-post-menu";
import { ButtonPrimary } from "@/components/button-primary";
import { DetailDrawer } from "@/components/detail-drawer";
import drawerStyles from "@/components/detail-drawer/styles.module.css";
import { Icon } from "@/components/icons";
import { PageMoreMenu } from "@/components/page-more-menu";
import menuStyles from "@/components/page-more-menu/styles.module.css";
import { TextInputArea } from "@/components/text-input";
import { DesktopOnly, MobileOnly } from "@/components/viewport-only";
import { BOARD_BODY_MAX, BOARD_HREF, BOARD_TEXT, boardAuthorLabel, boardCategoryLabel } from "@/lib/board";
import { clearFlashToast, setFlashToast } from "@/lib/flash-toast";
import type { BoardListItem, BoardPostDetail } from "@/lib/supabase/board";
import { deleteBoardPostAction } from "../actions";
import { BoardBack, BoardConfirm, BoardHead, BoardListBody, boardDate, boardListHref, boardOperatorFetch } from "./board-list";
import styles from "./board.module.css";

type Props = {
  post: BoardPostDetail;
  /** 운영자에게 보이는 숨긴 글 */
  hidden: boolean;
  operator: boolean;
  canWrite: boolean;
  /** 데스크톱 왼쪽 같은 분류 글 목록 */
  list: { items: BoardListItem[]; hasMore: boolean; error: string | null };
};

/**
 * 화면 20-detail 글 보기 (rules board.detail · own_post, d7 §30).
 * board-detail → board-answer(답이 있으면). board-post-menu ⋯ = 글쓴이 본인만(수정 · 삭제 — 답변 뒤 수정 비활성 + 이유).
 * 운영자만: page-more-menu '숨기기'(·'되살리기') · 아래 '답변' 입력 + '답변 등록'/'답변 고치기'.
 * 모바일 = head-row '‹ 게시판' + ⋯ / 데스크톱 = 글 목록 옆 detail-drawer(⋯ + ×).
 */
export function BoardPostView({ post, hidden, operator, canWrite, list }: Props) {
  const router = useRouter();
  const titleId = useId();
  const listHref = boardListHref(post.category);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opError, setOpError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const remove = () =>
    startTransition(async () => {
      setError(null);
      setFlashToast(BOARD_TEXT.deleted);
      const res = await deleteBoardPostAction(post.id);
      if (!res.ok) {
        clearFlashToast();
        setError(res.error);
        return;
      }
      router.push(listHref);
    });

  const toggleHidden = () =>
    startTransition(async () => {
      const err = await boardOperatorFetch(`/api/board/posts/${post.id}/hidden`, "PUT", { hidden: !hidden });
      setOpError(err);
      if (!err) router.refresh();
    });

  const menus = (
    <>
      {post.isMine ? (
        <BoardPostMenu
          editHref={`${BOARD_HREF}/${post.id}/edit`}
          answered={post.answer != null}
          onDelete={() => {
            setError(null);
            setConfirming(true);
          }}
        />
      ) : null}
      {operator ? (
        <PageMoreMenu label="운영자 메뉴">
          <button type="button" role="menuitem" className={menuStyles.item} disabled={pending} onClick={toggleHidden}>
            <span className={menuStyles.label}>{hidden ? "되살리기" : "숨기기"}</span>
          </button>
        </PageMoreMenu>
      ) : null}
    </>
  );

  const detail = (withTitleId: boolean) => (
    <>
      <BoardDetail
        categoryLabel={boardCategoryLabel(post.category)}
        title={post.title}
        author={boardAuthorLabel(post.schoolName)}
        date={boardDate(post.createdAt)}
        answered={post.answer != null}
        body={post.body}
        hidden={hidden}
        titleId={withTitleId ? titleId : undefined}
      />
      {opError ? (
        <p className={styles.error} role="alert">
          {opError}
        </p>
      ) : null}
      {post.answer != null ? <BoardAnswer body={post.answer} date={post.answeredAt ? boardDate(post.answeredAt) : ""} /> : null}
      {operator ? <AnswerForm postId={post.id} answer={post.answer} /> : null}
    </>
  );

  return (
    <>
      <MobileOnly>
        <div className={styles.page}>
          <div className={styles.headRow} data-name="head-row">
            <BoardBack href={listHref} />
            {menus}
          </div>
          <div className={styles.detailWrap} data-name="detail-wrap">
            {detail(false)}
          </div>
        </div>
      </MobileOnly>
      <DesktopOnly>
        <div className={styles.desk}>
          <div className={styles.deskList}>
            <BoardHead tab={post.category} canWrite={canWrite} />
            <BoardListBody
              key={post.category}
              tab={post.category}
              items={list.items}
              hasMore={list.hasMore}
              canWrite={canWrite}
              operator={operator}
              selectedId={post.id}
              error={list.error}
            />
          </div>
          <DetailDrawer labelledBy={titleId} closeHref={listHref} focusKey={post.id}>
            <div className={styles.drawerHead} data-name="drawer-head">
              {menus}
              <Link href={listHref} scroll={false} prefetch={false} className={drawerStyles.close} aria-label="닫기" data-name="drawer-close">
                <Icon name="close" className={drawerStyles.closeIcon} />
              </Link>
            </div>
            {detail(true)}
          </DetailDrawer>
        </div>
      </DesktopOnly>
      {confirming ? (
        <BoardConfirm
          title="글을 삭제할까요?"
          description="되돌릴 수 없어요."
          confirmLabel={BOARD_TEXT.delete}
          pending={pending}
          error={error}
          onCancel={() => setConfirming(false)}
          onConfirm={remove}
        />
      ) : null}
    </>
  );
}

/** 운영자 답변 입력 (d7 §30 운영자 화면 — 기존 text-input · button-primary 만) */
function AnswerForm({ postId, answer }: { postId: string; answer: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(answer ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ready = value.trim().length > 0 && !pending;

  return (
    <form
      className={styles.answerForm}
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        startTransition(async () => {
          setError(null);
          const err = await boardOperatorFetch(`/api/board/posts/${postId}/answer`, "PUT", { answer: value.trim() });
          if (err) setError(err);
          else router.refresh();
        });
      }}
    >
      <TextInputArea label="답변" name="answer" value={value} maxLength={BOARD_BODY_MAX} rows={4} onChange={(e) => setValue(e.target.value)} error={error ?? undefined} />
      <ButtonPrimary type="submit" disabled={!ready} aria-busy={pending || undefined}>
        {answer != null ? "답변 고치기" : "답변 등록"}
      </ButtonPrimary>
    </form>
  );
}
