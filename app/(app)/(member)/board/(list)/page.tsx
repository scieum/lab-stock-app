import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ManageBack } from "@/components/manage-back";
import { MobileOnly } from "@/components/viewport-only";
import { isBoardCategory } from "@/lib/board";
import { isBoardOperator } from "@/lib/server/board-operator";
import { getBoardAccess, listBoardPosts } from "@/lib/supabase/board";
import { BoardHead, BoardListBody } from "../_board/board-list";
import styles from "../_board/board.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "게시판 · Lab_Stock" };

type Props = { searchParams: Promise<{ tab?: string | string[] }> };

/**
 * 화면 20 게시판 목록 `/board?tab=faq|bug|idea` (기본 faq, d7 §30) — 로그인한 모든 역할, 전체 학교 공용(N1 예외 — 게시판 글만).
 * 비로그인 → /login (proxy · (member) 레이아웃), 프로필 없는 세션 → /.
 * 모바일 = head-row '‹ 관리'(시안 20-mobile) · tab-bar 활성 '관리' / 데스크톱 = 사이드바 board-link 현재 표시.
 */
export default async function BoardPage({ searchParams }: Props) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab = isBoardCategory(raw) ? raw : "faq";
  const access = await getBoardAccess();
  if (access.kind === "signed-out") redirect("/login");
  if (access.kind !== "member") redirect("/");
  const [list, operator] = await Promise.all([listBoardPosts(tab), isBoardOperator()]);

  return (
    <div className={styles.page}>
      <MobileOnly>
        <div className={styles.headRow} data-name="head-row">
          <ManageBack href="/manage" />
        </div>
      </MobileOnly>
      <BoardHead tab={tab} canWrite={access.canWrite} />
      <BoardListBody
        key={tab}
        tab={tab}
        items={list.ok ? list.items : []}
        hasMore={list.ok && list.hasMore}
        canWrite={access.canWrite}
        operator={operator}
        error={list.ok ? null : list.error}
      />
    </div>
  );
}
