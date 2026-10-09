import Link from "next/link";
import { ButtonOutline } from "@/components/button-outline";
import { ButtonPrimary } from "@/components/button-primary";
import styles from "./styles.module.css";

type Props = {
  /**
   * 오른쪽 버튼 (시안 header-actions):
   * - "both" = 로그인(button-outline) + 회원가입(button-primary) — 15-desktop
   * - "signup" = 회원가입만 — 1-desktop (로그인 화면)
   * - "login" = 로그인만 — 14-desktop (회원가입 화면)
   */
  actions?: "both" | "signup" | "login";
  /** true = 스크롤해도 화면 위에 붙어 있다 (15 랜딩 — landing-tabs 가 그 아래에 붙는다) */
  sticky?: boolean;
  loginHref?: string;
  signupHref?: string;
  className?: string;
};

/**
 * 로그인 전 화면 데스크톱 상단 바 (rules.json 1.24 desktop_shell.pre_login.component, 시안 1·14·15-desktop web-header):
 * 전폭 · 높이 64 · 좌우 32 · radius 0 · canvas(흰) 바탕 + 아래 hairline-soft. 왼쪽 워드마크 Lab_Stock(17/600) → `/`,
 * 오른쪽 header-actions(사이 8). 로그인 후·둘러보기 화면에는 없다 (그쪽은 app-sidebar).
 */
export function WebHeader({ actions = "both", sticky = false, loginHref = "/login", signupHref = "/signup", className }: Props) {
  return (
    <header
      data-component="web-header"
      className={[styles.header, sticky ? styles.sticky : "", className ?? ""].filter(Boolean).join(" ")}
    >
      <Link href="/" className={styles.wordmark}>
        Lab_Stock
      </Link>
      <nav className={styles.actions} aria-label="계정">
        {actions !== "signup" ? (
          <ButtonOutline href={loginHref} className={styles.button}>
            로그인
          </ButtonOutline>
        ) : null}
        {actions !== "login" ? (
          <ButtonPrimary href={signupHref} className={styles.button}>
            회원가입
          </ButtonPrimary>
        ) : null}
      </nav>
    </header>
  );
}
