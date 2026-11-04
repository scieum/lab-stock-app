"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BoardPostRow } from "@/components/board-post-row";
import { BoardTabs } from "@/components/board-tabs";
import { BoardWrite } from "@/components/board-write";
import { ButtonOutline } from "@/components/button-outline";
import { ButtonPrimary } from "@/components/button-primary";
import { EmptyStateCard } from "@/components/ex-empty-state-card";
import { ModalCard } from "@/components/ex-modal-card";
import { FaqItem } from "@/components/faq-item";
import { Icon } from "@/components/icons";
import { LinkPending } from "@/components/link-pending";
import backStyles from "@/components/manage-back/styles.module.css";
import { BOARD_HREF, BOARD_LABEL, BOARD_TEXT, boardAuthorLabel, boardCategoryLabel, type BoardCategory } from "@/lib/board";
import { formatKoreanDate } from "@/lib/format";
import type { BoardListItem } from "@/lib/supabase/board";
import { loadMoreBoardPostsAction } from "../actions";
import styles from "./board.module.css";

/** 목록 주소 — FAQ(기본) = /board, 그 밖 = /board?tab= */
export function boardListHref(tab: BoardCategory): string {
  return tab === "faq" ? BOARD_HREF : `${BOARD_HREF}?tab=${tab}`;
}

/** board-write 가 여는 글쓰기 — 분류 = 지금 탭 (FAQ 탭이면 오류 문의, d7 §30) */
export function boardWriteHref(tab: BoardCategory): string {
  return `${BOARD_HREF}/new?category=${tab === "faq" ? "bug" : tab}`;
}

export function boardDate(iso: string): string {
  return formatKoreanDate(new Date(iso));
}

/** 시안 20-detail · 20-new head-row '‹ 게시판' (manage-back 과 같은 모양 — 시안 이름 board-back, 컴포넌트 목록 밖이라 data-component 없음) */
export function BoardBack({ href }: { href: string }) {
  return (
    <Link href={href} prefetch={false} className={backStyles.back} data-name="board-back">
      <Icon name="back" className={backStyles.icon} />
      <span className={backStyles.label}>{BOARD_LABEL}</span>
      <LinkPending />
    </Link>
  );
}

/** page-head: '게시판' + board-write(교사·admin, 학생 0 — R5) */
export function BoardHead({ tab, canWrite }: { tab: BoardCategory; canWrite: boolean }) {
  return (
    <div className={styles.pageHead} data-name="page-head">
      <h1 className={styles.title}>{BOARD_LABEL}</h1>
      {canWrite ? <BoardWrite href={boardWriteHref(tab)} /> : null}
    </div>
  );
}

type ConfirmProps = {
  title: string;
  description?: string;
  confirmLabel: string;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

/** 삭제 확인 (ex-modal-card): button-outline '취소' + button-primary. 핑크 없음 */
export function BoardConfirm({ title, description, confirmLabel, pending, error, onCancel, onConfirm }: ConfirmProps) {
  return (
    <div className={styles.dialog}>
      <ModalCard title={title} description={description} descriptionTone="body" density="roomy" hideClose closeIcon onClose={pending ? undefined : onCancel}>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.dialogActions} data-name="modal-actions">
          <ButtonOutline disabled={pending} onClick={onCancel}>
            취소
          </ButtonOutline>
          <ButtonPrimary disabled={pending} aria-busy={pending || undefined} onClick={onConfirm}>
            {confirmLabel}
          </ButtonPrimary>
        </div>
      </ModalCard>
    </div>
  );
}

/** 운영자 API 호출 (app/api/board/**) — 실패하면 안내 문구 */
export async function boardOperatorFetch(url: string, method: "POST" | "PUT" | "PATCH" | "DELETE", body?: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.ok) return null;
    const j = (await res.json().catch(() => null)) as { error?: unknown } | null;
    return typeof j?.error === "string" ? j.error : "저장하지 못했어요. 잠시 후 다시 시도해 주세요";
  } catch {
    return "저장하지 못했어요. 잠시 후 다시 시도해 주세요";
  }
}

const EMPTY_BODY: Partial<Record<BoardCategory, string>> = {
  // 시안 20-empty (개선 제안 0건)
  idea: "Lab_Stock을 쓰며 바라는 점을 남겨 주세요",
};

type Props = {
  tab: BoardCategory;
  items: BoardListItem[];
  hasMore: boolean;
  canWrite: boolean;
  /** 운영자 — FAQ 탭 '+ FAQ 추가' · FAQ 항목 '고치기 · 삭제' (d7 §30) */
  operator: boolean;
  /** 데스크톱 글 보기에서 드로어에 열린 글 */
  selectedId?: string;
  error?: string | null;
};

/**
 * 화면 20 목록 몸통: board-tabs → FAQ = faq-item 목록(여러 개 동시 펼침) / 오류 문의·개선 제안 = board-post-row 최신순 + '더 보기' /
 * 글 0 = ex-empty-state-card(20-empty) + board-write(교사·admin). 탭을 바꾸면 주소(?tab=)가 바뀐다.
 * 부르는 쪽이 key={tab} 으로 둔다 — 탭이 바뀌면 덧붙인 글을 버린다.
 */
export function BoardListBody({ tab, items, hasMore, canWrite, operator, selectedId, error }: Props) {
  const router = useRouter();
  const [shown, setShown] = useState(tab);
  const [extra, setExtra] = useState<BoardListItem[]>([]);
  const [more, setMore] = useState(hasMore);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const all = [...items, ...extra.filter((e) => !items.some((i) => i.id === e.id))];

  const loadMore = () =>
    startLoading(async () => {
      setMoreError(null);
      const res = await loadMoreBoardPostsAction(tab, all.length);
      if (!res.ok) {
        setMoreError(res.error);
        return;
      }
      setExtra((prev) => [...prev, ...res.items]);
      setMore(res.hasMore);
    });

  let body: React.ReactNode;
  if (error) {
    body = (
      <p className={styles.error} role="alert">
        {error}
      </p>
    );
  } else if (tab === "faq") {
    body = <FaqList items={all} operator={operator} />;
  } else if (all.length === 0) {
    body = (
      <div className={styles.emptyWrap}>
        <EmptyStateCard title={BOARD_TEXT.empty} description={EMPTY_BODY[tab]} icon="board" iconTone="ink">
          {canWrite ? <BoardWrite href={boardWriteHref(tab)} /> : null}
        </EmptyStateCard>
      </div>
    );
  } else {
    body = (
      <>
        <div className={styles.postList} data-name="board-post-list">
          {all.map((p) => (
            <BoardPostRow
              key={p.id}
              href={`${BOARD_HREF}/${p.id}`}
              categoryLabel={boardCategoryLabel(p.category)}
              title={p.title}
              author={boardAuthorLabel(p.schoolName)}
              date={boardDate(p.createdAt)}
              answered={p.answered}
              selected={p.id === selectedId}
            />
          ))}
        </div>
        {moreError ? (
          <p className={styles.error} role="alert">
            {moreError}
          </p>
        ) : null}
        {more ? (
          <div className={styles.more}>
            <ButtonOutline onClick={loadMore} disabled={loading} aria-busy={loading || undefined}>
              더 보기
            </ButtonOutline>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <div className={styles.tabsWrap}>
        <BoardTabs
          value={shown}
          onChange={(v) => {
            setShown(v);
            router.push(boardListHref(v));
          }}
        />
      </div>
      {body}
    </>
  );
}

/** FAQ 목록 — 운영자에게만 '+ FAQ 추가'(button-outline) · 펼친 상자 아래 '고치기 · 삭제' */
function FaqList({ items, operator }: { items: BoardListItem[]; operator: boolean }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<BoardListItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      if (!deleting) return;
      const err = await boardOperatorFetch(`/api/board/faq/${deleting.id}`, "DELETE");
      if (err) {
        setError(err);
        return;
      }
      setDeleting(null);
      router.refresh();
    });

  return (
    <>
      {operator ? (
        <div className={styles.faqTools}>
          <ButtonOutline href={`${BOARD_HREF}/new?category=faq`}>+ FAQ 추가</ButtonOutline>
        </div>
      ) : null}
      <div className={styles.faqList} data-name="faq-list">
        {items.map((f) => (
          <FaqItem key={f.id} question={f.title} answer={f.body}>
            {operator ? (
              <div className={styles.faqActions}>
                <ButtonOutline href={`${BOARD_HREF}/${f.id}/edit`}>고치기</ButtonOutline>
                <ButtonOutline
                  onClick={() => {
                    setError(null);
                    setDeleting(f);
                  }}
                >
                  {BOARD_TEXT.delete}
                </ButtonOutline>
              </div>
            ) : null}
          </FaqItem>
        ))}
      </div>
      {items.length === 0 ? (
        <div className={styles.emptyWrap}>
          <EmptyStateCard title={BOARD_TEXT.empty} icon="board" iconTone="ink" />
        </div>
      ) : null}
      {deleting ? (
        <BoardConfirm
          title="FAQ를 삭제할까요?"
          description={deleting.title}
          confirmLabel={BOARD_TEXT.delete}
          pending={pending}
          error={error}
          onCancel={() => setDeleting(null)}
          onConfirm={confirm}
        />
      ) : null}
    </>
  );
}
