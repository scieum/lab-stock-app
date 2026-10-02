import Link from "next/link";
import { Icon } from "@/components/icons";
import styles from "./styles.module.css";

type Props = {
  label: string;
  href: string;
  icon: "home" | "flask" | "qr" | "record";
  active?: boolean;
};

/** 하단 탭바 항목 (활성: 검정 글자 + 하늘색 아이콘, 비활성: 회색) */
export function TabItem({ label, href, icon, active }: Props) {
  return (
    <Link
      data-component="tab-item"
      href={href}
      className={active ? styles.itemActive : styles.item}
      aria-current={active ? "page" : undefined}
    >
      <Icon name={icon} className={styles.icon} />
      <span className={styles.label}>{label}</span>
    </Link>
  );
}
