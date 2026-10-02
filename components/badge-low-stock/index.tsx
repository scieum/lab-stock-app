import styles from "./styles.module.css";

/** 재고 부족 배지 — 핑크(accent)는 이 컴포넌트와 reorder-alert-card 안에서만 쓴다. */
export function BadgeLowStock({ children = "재고 부족" }: { children?: React.ReactNode }) {
  return (
    <span data-component="badge-low-stock" className={styles.badge}>
      {children}
    </span>
  );
}
