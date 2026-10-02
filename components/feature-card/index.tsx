import { Icon, type IconName } from "@/components/icons";
import styles from "./styles.module.css";

type Props = {
  /** 왼쪽 위 아이콘 (하늘색 선 아이콘, 시안 icon-building·icon-map-pin·icon-qr·icon-bell) */
  icon: IconName;
  title: string;
  description: string;
  /** 제목 오른쪽 배지 (예: 재고 부족 알림 카드의 badge-low-stock) */
  badge?: React.ReactNode;
  className?: string;
};

/** 화면 15 랜딩 기능 카드 (시안 15 feature-card): 회색 바탕 · radius 24 · padding 24, 아이콘 → 제목 줄 → 설명 */
export function FeatureCard({ icon, title, description, badge, className }: Props) {
  return (
    <article data-component="feature-card" className={[styles.card, className ?? ""].join(" ").trim()}>
      <Icon name={icon} className={styles.icon} />
      <div className={styles.titleRow}>
        <h2 className={styles.title}>{title}</h2>
        {badge ?? null}
      </div>
      <p className={styles.desc}>{description}</p>
    </article>
  );
}
