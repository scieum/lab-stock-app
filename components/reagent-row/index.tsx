import Link from "next/link";
import { BadgeLowStock } from "@/components/badge-low-stock";
import { Icon } from "@/components/icons";
import styles from "./styles.module.css";

type Props = {
  title: string;
  /** 본문 (재고량 · 사용자 · 사용량 등) */
  body?: string;
  /** 보조 (입고일 · 시각) */
  caption?: string;
  lowStock?: boolean;
  /** 있으면 행 전체가 링크 + 오른쪽 화살표 */
  href?: string;
  /** 선택·활성 행 (하늘색 연한 바탕) */
  selected?: boolean;
};

/** 시약 목록·최근 사용 기록 행 (회색 바탕, radius 16) */
export function ReagentRow({ title, body, caption, lowStock, href, selected }: Props) {
  const cls = [styles.row, selected ? styles.selected : ""].join(" ").trim();
  const content = (
    <>
      <div className={styles.main}>
        <div className={styles.titleRow}>
          <span className={styles.title}>{title}</span>
          {lowStock ? <BadgeLowStock /> : null}
        </div>
        {body || caption ? (
          <div className={styles.meta}>
            {body ? <span className={styles.body}>{body}</span> : null}
            {caption ? <span className={styles.caption}>{caption}</span> : null}
          </div>
        ) : null}
      </div>
      {href ? <Icon name="chevron-right" className={styles.chevron} /> : null}
    </>
  );
  if (href) {
    return (
      <Link data-component="reagent-row" href={href} className={cls} aria-current={selected ? "true" : undefined}>
        {content}
      </Link>
    );
  }
  return (
    <div data-component="reagent-row" className={cls}>
      {content}
    </div>
  );
}
