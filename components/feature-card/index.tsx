import { Icon, type IconName } from "@/components/icons";
import styles from "./styles.module.css";

type Props = {
  /** 왼쪽 위 아이콘 (하늘색 선 아이콘, 시안 icon-building·icon-map-pin·icon-qr·icon-bell·icon-quote) */
  icon: IconName;
  /** 제목 (quote 카드에는 없다) */
  title?: string;
  description: string;
  /** 제목 오른쪽 배지 (예: 재고 부족 알림 카드의 badge-low-stock) */
  badge?: React.ReactNode;
  /** quote 카드 아래 출처 (예: "— 과학 교사") */
  caption?: string;
  /**
   * default = 15-mobile 회색 카드 세로 (아이콘 → 제목 줄 → 설명)
   * row = 1·14-desktop 소개 패널 흰 카드 가로 (아이콘 24 · 사이 16 · 제목 18/700 + 설명 15/400)
   * quote = 15-desktop 문제 공감 흰 카드 (padding 32 · 아이콘 → 인용 17/400 → 출처 13 회색)
   */
  variant?: "default" | "row" | "quote";
  className?: string;
};

/** 기능 카드 (시안 15 · 1 · 14 feature-card) — radius 24, 그림자 없음 */
export function FeatureCard({ icon, title, description, badge, caption, variant = "default", className }: Props) {
  if (variant === "quote") {
    return (
      <figure data-component="feature-card" className={[styles.quoteCard, className ?? ""].join(" ").trim()}>
        <Icon name={icon} className={styles.icon} />
        <blockquote className={styles.quote}>{description}</blockquote>
        {caption ? <figcaption className={styles.caption}>{caption}</figcaption> : null}
      </figure>
    );
  }
  if (variant === "row") {
    return (
      <article data-component="feature-card" className={[styles.rowCard, className ?? ""].join(" ").trim()}>
        <Icon name={icon} className={styles.icon} />
        <div className={styles.rowText}>
          <div className={styles.titleRow}>
            {title ? <h2 className={styles.title}>{title}</h2> : null}
            {badge ?? null}
          </div>
          <p className={styles.desc}>{description}</p>
        </div>
      </article>
    );
  }
  return (
    <article data-component="feature-card" className={[styles.card, className ?? ""].join(" ").trim()}>
      <Icon name={icon} className={styles.icon} />
      <div className={styles.titleRow}>
        {title ? <h2 className={styles.title}>{title}</h2> : null}
        {badge ?? null}
      </div>
      <p className={styles.desc}>{description}</p>
    </article>
  );
}
