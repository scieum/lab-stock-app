import Link from "next/link";
import { BadgeLowStock } from "@/components/badge-low-stock";
import { Icon } from "@/components/icons";
import { LinkPending } from "@/components/link-pending";
import { linkPrefetch } from "@/lib/link-prefetch";
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
  /** 있으면 행 전체가 선택 버튼 (화면 7 검색 결과). 선택되면 왼쪽 선택 표시 + 오른쪽 체크 */
  onSelect?: () => void;
};

/** 시약 목록·최근 사용 기록 행 (회색 바탕, radius 16) */
export function ReagentRow({ title, body, caption, lowStock, href, selected, onSelect }: Props) {
  const cls = [styles.row, selected ? styles.selected : ""].join(" ").trim();
  const content = (
    <>
      {onSelect && selected ? <span className={styles.indicator} aria-hidden="true" /> : null}
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
      {href && !onSelect ? <Icon name="chevron-right" className={styles.chevron} /> : null}
      {onSelect && selected ? <Icon name="check" className={styles.check} /> : null}
    </>
  );
  if (onSelect) {
    return (
      <button
        data-component="reagent-row"
        type="button"
        className={[cls, styles.selectable].join(" ")}
        aria-pressed={Boolean(selected)}
        onClick={onSelect}
      >
        {content}
      </button>
    );
  }
  if (href) {
    return (
      <Link data-component="reagent-row" href={href} prefetch={linkPrefetch(href)} className={cls} aria-current={selected ? "true" : undefined}>
        {content}
        <LinkPending />
      </Link>
    );
  }
  return (
    <div data-component="reagent-row" className={cls}>
      {content}
    </div>
  );
}
