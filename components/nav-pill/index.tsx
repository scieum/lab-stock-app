import Link from "next/link";
import { Icon } from "@/components/icons";
import { LinkPending } from "@/components/link-pending";
import { NavAccountMenu } from "@/components/nav-account-menu";
import { linkPrefetch } from "@/lib/link-prefetch";
import { NavLinkLocked } from "./locked-link";
import styles from "./styles.module.css";

export type NavLinkItem = {
  label: string;
  href: string;
  active?: boolean;
  /** 둘러보기 잠금 — 링크 대신 guest-lock 버튼(ex-toast) */
  locked?: boolean;
};

type Props = {
  /** 하위 화면 제목 (있으면 뒤로가기 + 제목, 없으면 워드마크) */
  title?: string;
  backHref?: string;
  /** 자기 학교 이름 (로그인 후) */
  schoolName?: string;
  /** 오른쪽 끝 제목 (예: 회원가입 — 왼쪽은 뒤로가기 + 워드마크) */
  endTitle?: string;
  /** 워드마크 옆 현재 섹션 제목 — 모바일에서만 보인다 (데스크톱은 links 의 현재 섹션 표시가 대신한다) */
  sectionTitle?: string;
  /** 데스크톱 상단 링크 (모바일에서는 숨김 — 모바일은 tab-bar) */
  links?: NavLinkItem[];
  /**
   * 있으면 학교명 옆에 ▾(nav-account-menu)가 붙고 학교명 + ▾ 가 버튼이 되어, 누르면 "로그아웃" 1개짜리 메뉴가 열린다
   * (d7 §10 — 로그인 후 화면만).
   * 없으면 학교명은 지금처럼 글자다 (로그인 전 화면 · 둘러보기 · 소속 학교 없음 안내).
   */
  onLogout?: () => void | Promise<void>;
};

/** 상단 내비게이션 stadium pill */
export function NavPill({ title, backHref, schoolName, endTitle, links, sectionTitle, onLogout }: Props) {
  return (
    <header data-component="nav-pill" className={styles.nav}>
      <div className={styles.left}>
        {title ? (
          <span className={styles.titleGroup}>
            {backHref ? (
              <Link href={backHref} prefetch={linkPrefetch(backHref)} className={styles.back} aria-label="뒤로">
                <Icon name="back" className={styles.backIcon} />
              </Link>
            ) : null}
            <span className={styles.title}>{title}</span>
          </span>
        ) : backHref ? (
          <span className={styles.titleGroup}>
            <Link href={backHref} prefetch={linkPrefetch(backHref)} className={styles.back} aria-label="뒤로">
              <Icon name="back" className={styles.backIcon} />
            </Link>
            <span className={styles.wordmark}>Lab_Stock</span>
          </span>
        ) : sectionTitle ? (
          <span className={styles.sectionGroup}>
            <Link href="/" className={styles.wordmark}>
              Lab_Stock
            </Link>
            <span className={styles.sectionTitle}>{sectionTitle}</span>
          </span>
        ) : (
          <Link href="/" className={styles.wordmark}>
            Lab_Stock
          </Link>
        )}
        {links && links.length > 0 ? (
          <nav className={styles.links} aria-label="주 메뉴">
            {links.map((l) =>
              l.locked ? (
                <NavLinkLocked key={l.href} label={l.label} />
              ) : (
                <Link
                  key={l.href}
                  href={l.href}
                  prefetch={linkPrefetch(l.href)}
                  className={l.active ? styles.linkActive : styles.link}
                  aria-current={l.active ? "page" : undefined}
                >
                  {l.label}
                  <LinkPending />
                </Link>
              ),
            )}
          </nav>
        ) : null}
      </div>
      {schoolName ? (
        onLogout ? (
          <NavAccountMenu schoolName={schoolName} onLogout={onLogout} />
        ) : (
          <span className={styles.school}>{schoolName}</span>
        )
      ) : null}
      {endTitle ? <span className={styles.endTitle}>{endTitle}</span> : null}
    </header>
  );
}
