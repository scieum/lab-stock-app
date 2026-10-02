import styles from "./styles.module.css";

type Props = {
  title: string;
  subtitle?: string;
  /** 단계 진행 막대 (총 단계, 지난 단계 수) */
  steps?: { total: number; done: number };
  children: React.ReactNode;
} & Omit<React.FormHTMLAttributes<HTMLFormElement>, "title">;

/** 로그인 폼 카드 (흰 바탕 + 연회색 테두리, radius 24) */
export function AuthFormCard({ title, subtitle, steps, children, className, ...rest }: Props) {
  return (
    <form data-component="ex-auth-form-card" className={[styles.card, className ?? ""].join(" ").trim()} {...rest}>
      <div className={styles.heading}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>
      {steps ? (
        <div
          className={styles.progress}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={steps.total}
          aria-valuenow={steps.done}
        >
          {Array.from({ length: steps.total }, (_, i) => (
            <span key={i} className={i < steps.done ? styles.barDone : styles.bar} />
          ))}
        </div>
      ) : null}
      {children}
    </form>
  );
}
