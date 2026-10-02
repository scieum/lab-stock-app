import { Icon } from "@/components/icons";
import styles from "./styles.module.css";

/** 저장 완료 토스트 (진회색 바탕 + 흰 글자, 하늘색 체크 아이콘) */
export function Toast({ children, floating }: { children: React.ReactNode; floating?: boolean }) {
  return (
    <div
      data-component="ex-toast"
      role="status"
      aria-live="polite"
      className={[styles.toast, floating ? styles.floating : ""].join(" ").trim()}
    >
      <Icon name="check" className={styles.icon} />
      <span>{children}</span>
    </div>
  );
}
