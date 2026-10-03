import Link from "next/link";
import { Icon } from "@/components/icons";
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
  /** 데스크톱 상단 링크 (모바일에서는 숨김 — 모바일은 tab-bar) */
  links?: NavLinkItem[];
};

/** 상단 내비게이션 stadium pill */
export function NavPill({ title, backHref, schoolName, endTitle, links }: Props) {
  return (
    <header data-component="nav-pill" className={styles.nav}>
      <div className={styles.left}>
        {title ? (
          <span className={styles.titleGroup}>
            {backHref ? (
              <Link href={backHref} className={styles.back} aria-label="뒤로">
                <Icon name="back" className={styles.backIcon} />
              </Link>
            ) : null}
            <span className={styles.title}>{title}</span>
          </span>
        ) : backHref ? (
          <span className={styles.titleGroup}>
            <Link href={backHref} className={styles.back} aria-label="뒤로">
              <Icon name="back" className={styles.backIcon} />
            </Link>
            <span className={styles.wordmark}>Lab_Stock</span>
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
                  className={l.active ? styles.linkActive : styles.link}
                  aria-current={l.active ? "page" : undefined}
                >
                  {l.label}
                </Link>
              ),
            )}
          </nav>
        ) : null}
      </div>
      {schoolName ? <span className={styles.school}>{schoolName}</span> : null}
      {endTitle ? <span className={styles.endTitle}>{endTitle}</span> : null}
    </header>
  );
}
