import Link from "next/link";
import styles from "./styles.module.css";

type Props = {
  children: React.ReactNode;
  href?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

/** 흰 바탕 + 회색 테두리 stadium pill 버튼 (보조 행동) */
export function ButtonOutline({ children, href, className, type = "button", ...rest }: Props) {
  const cls = [styles.button, className ?? ""].join(" ").trim();
  if (href) {
    return (
      <Link data-component="button-outline" href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button data-component="button-outline" type={type} className={cls} {...rest}>
      {children}
    </button>
  );
}
