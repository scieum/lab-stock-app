import { Icon } from "@/components/icons";
import styles from "./styles.module.css";

type Props = {
  /** 라벨 (기본 "시약장 추가" — 앞의 "+" 는 아이콘) */
  children?: React.ReactNode;
  /** 추가 요청 중 — 눌리지 않고 눌린 모양으로 보인다 */
  pending?: boolean;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">;

/**
 * "+ 시약장 추가" (화면 11 cabinet-switcher 줄 끝 · 빈 상태 카드 안).
 * button-pill-soft 모양이지만 data-component 는 cabinet-add 다 (R7: 학생 화면 0개).
 */
export function CabinetAdd({ children = "시약장 추가", pending = false, disabled, className, type = "button", ...rest }: Props) {
  return (
    <button
      data-component="cabinet-add"
      type={type}
      className={[styles.button, pending ? styles.pending : "", className ?? ""].filter(Boolean).join(" ")}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...rest}
    >
      <Icon name="plus" className={styles.icon} />
      <span>{children}</span>
    </button>
  );
}
