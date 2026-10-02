import Link from "next/link";
import styles from "./styles.module.css";

type Props = {
  children: React.ReactNode;
  href?: string;
  fullWidth?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

/** 검정 stadium pill 버튼 (주 행동) */
export function ButtonPrimary({ children, href, fullWidth, className, type = "button", ...rest }: Props) {
  const cls = [styles.button, fullWidth ? styles.full : "", className ?? ""].join(" ").trim();
  if (href) {
    return (
      <Link data-component="button-primary" href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button data-component="button-primary" type={type} className={cls} {...rest}>
      {children}
    </button>
  );
}
