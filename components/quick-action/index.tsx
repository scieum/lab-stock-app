import Link from "next/link";
import { Icon } from "@/components/icons";
import styles from "./styles.module.css";

export type QuickActionItem = {
  label: string;
  href: string;
  icon: "pen" | "intake" | "qr" | "record" | "cabinet" | "users";
  /**
   * 역할 규칙(rules.json roles)이 세는 진입점 이름 — 예: 입고 = stock-intake, 사용자 관리 = user-manage.
   * 주면 칸 링크에 data-component 로 붙는다.
   */
  entry?: string;
};

/** 홈 빠른 실행 (회색 타일 + 하늘색 원 아이콘). 역할별로 보여줄 항목만 넘긴다. */
export function QuickAction({ items }: { items: QuickActionItem[] }) {
  return (
    <nav data-component="quick-action" className={styles.grid} aria-label="빠른 실행">
      {items.map((it) => (
        <Link key={it.href} href={it.href} className={styles.item} data-component={it.entry}>
          <span className={styles.iconBg}>
            <Icon name={it.icon} className={styles.icon} />
          </span>
          <span className={styles.label}>{it.label}</span>
        </Link>
      ))}
    </nav>
  );
}
