"use client";

import Link from "next/link";
import { ButtonOutline } from "@/components/button-outline";
import { NavAccountMenu } from "@/components/nav-account-menu";
import { SidebarItem } from "@/components/sidebar-item";
import type { SidebarGroup, SidebarKey } from "@/lib/sidebar-menu";
import { BoardLink } from "@/components/board-link";
import { GuideLink } from "@/components/guide-link";
import styles from "./styles.module.css";

type Props = {
  /** 자기 학교 이름 (시안 sidebar-brand school-name) */
  schoolName: string;
  /** 역할별 메뉴 묶음 (lib/sidebar-menu sidebarMenu) */
  groups: SidebarGroup[];
  /** 현재 화면의 메뉴 */
  active?: SidebarKey;
  /** 맨 아래 계정 줄 글자 ("김OO · 교사"). 없으면 계정 줄을 그리지 않는다 */
  account?: string;
  /** 계정 ▾ 메뉴의 "로그아웃" (d7 §10 — nav-account-menu 와 같은 동작) */
  onLogout?: () => void | Promise<void>;
  /** 셸 배치용 바깥 class (sticky·높이) */
  className?: string;
  /**
   * 둘러보기 데스크톱 (rules.json 1.24 guest.desktop, 시안 13-guest-desktop sidebar-account): 계정 줄 대신
   * "둘러보는 중" + 로그인(button-outline 전폭). 잠긴 메뉴(locked)는 guest-lock.
   */
  guest?: { loginHref: string };
  /** 화면 20 게시판(/board · /board/*)에서 true — board-link 현재 표시 (rules 1.32 desktop_shell.board_link) */
  boardActive?: boolean;
};

/**
 * 데스크톱 왼쪽 사이드바 (시안 1.22 app-sidebar, d7 §23 셸): 폭 240 · radius 0 · 회색 바탕(surface-muted) + 오른쪽 hairline.
 * 위 = 워드마크 Lab_Stock + 학교명, 그 아래 sidebar-item 목록(역할별 묶음, 묶음 제목 12 회색),
 * 맨 아래 = 계정 줄 "이름 · 역할" ▾ → 로그아웃.
 */
export function AppSidebar({ schoolName, groups, active, account, onLogout, className, guest, boardActive = false }: Props) {
  return (
    <aside data-component="app-sidebar" className={[styles.sidebar, className].filter(Boolean).join(" ")}>
      <div className={styles.top}>
        <div className={styles.brand}>
          <Link href="/" className={styles.wordmark}>
            Lab_Stock
          </Link>
          <span className={styles.school}>{schoolName}</span>
        </div>
        <nav className={styles.menu} aria-label="주 메뉴">
          {groups.map((g, i) => (
            <div key={g.title ?? i} className={styles.group} role="group" aria-label={g.title}>
              {g.title ? (
                <p className={styles.groupTitle} aria-hidden="true">
                  {g.title}
                </p>
              ) : null}
              {g.items.map((it) => (
                <SidebarItem
                  key={it.key}
                  label={it.label}
                  icon={it.icon}
                  href={it.href}
                  active={!it.locked && it.key === active}
                  locked={it.locked}
                />
              ))}
            </div>
          ))}
        </nav>
      </div>
      <div className={styles.bottom}>
        {/* rules 1.32 desktop_shell.guide_link: 계정 줄 위 guide-link '사용 가이드 ↗' — 모든 역할 · 둘러보기 공통, 새 탭 */}
        {/* rules 1.32 desktop_shell.board_link: guide-link 바로 위 board-link '게시판' — 로그인한 모든 역할, 둘러보기 없음 */}
        {/* 시안 20-desktop sidebar-guide: board-link ↔ guide-link gap 4 */}
        <div data-name="sidebar-guide" className={styles.guideGroup}>
          {guest ? null : <BoardLink variant="sidebar" active={boardActive} className={styles.guide} />}
          <GuideLink variant="sidebar" className={styles.guide} />
        </div>
        {guest ? (
          <div className={styles.guestAccount}>
            <span className={styles.guestStatus}>둘러보는 중</span>
            <ButtonOutline href={guest.loginHref} className={styles.guestLogin}>
              로그인
            </ButtonOutline>
          </div>
        ) : account ? (
          <div className={styles.account}>
            <NavAccountMenu schoolName={schoolName} label={account} variant="sidebar" onLogout={onLogout} />
          </div>
        ) : null}
      </div>
    </aside>
  );
}
