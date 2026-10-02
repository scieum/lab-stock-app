import styles from "./styles.module.css";

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
} & Omit<React.FormHTMLAttributes<HTMLFormElement>, "title">;

/** 인증 폼 카드 (흰 바탕 + 연회색 테두리, radius 24) — 로그인·회원가입·비밀번호 찾기 */
export function AuthFormCard({ title, subtitle, children, className, ...rest }: Props) {
  return (
    <form data-component="ex-auth-form-card" className={[styles.card, className ?? ""].join(" ").trim()} {...rest}>
      <div className={styles.heading}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>
      {children}
    </form>
  );
}
