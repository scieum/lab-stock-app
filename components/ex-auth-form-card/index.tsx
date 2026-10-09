import styles from "./styles.module.css";

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /**
   * card = 카드 모양 그대로 (모든 폭)
   * split = 모바일은 카드, 데스크톱(≥ 1024)은 반 나눔 왼쪽 폼 열 — 테두리·안쪽 여백 없이 제목 28/700 · 부제 17/300 회색
   *   (시안 1·14-desktop form-column, d7 §23 run d)
   */
  variant?: "card" | "split";
} & Omit<React.FormHTMLAttributes<HTMLFormElement>, "title">;

/** 인증 폼 카드 (흰 바탕 + 연회색 테두리, radius 24) — 로그인·회원가입·비밀번호 찾기 */
export function AuthFormCard({ title, subtitle, children, className, variant = "card", ...rest }: Props) {
  return (
    <form
      data-component="ex-auth-form-card"
      className={[styles.card, variant === "split" ? styles.split : "", className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    >
      <div className={styles.heading}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>
      {children}
    </form>
  );
}
