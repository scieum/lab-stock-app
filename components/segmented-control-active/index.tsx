import styles from "./styles.module.css";

type Props = {
  children: React.ReactNode;
  /** outline = 하늘색 테두리(필터), indicator = 아래 하늘색 막대(탭) */
  variant?: "outline" | "indicator";
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

/** 세그먼트 컨트롤의 선택된 항목 — 그림자 허용 예외 컴포넌트 */
export function SegmentedControlActive({ children, variant = "outline", className, type = "button", ...rest }: Props) {
  return (
    <button
      data-component="segmented-control-active"
      type={type}
      role="tab"
      aria-selected="true"
      className={[styles.active, styles[variant], className ?? ""].join(" ").trim()}
      {...rest}
    >
      <span>{children}</span>
      {variant === "indicator" ? <span className={styles.bar} aria-hidden="true" /> : null}
    </button>
  );
}
