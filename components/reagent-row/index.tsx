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
  /** 오른쪽 끝 보조 글자 (화면 11 "칸 없음" — caption 회색). 있으면 링크 행이어도 화살표 대신 이 글자를 둔다 */
  trailingCaption?: string;
  /** 있으면 행 전체가 링크 + 오른쪽 화살표 */
  href?: string;
  /** 선택·활성 행 (하늘색 연한 바탕) */
  selected?: boolean;
  /** 있으면 행 전체가 선택 버튼 (화면 7 검색 결과). 선택되면 왼쪽 선택 표시 + 오른쪽 체크 */
  onSelect?: () => void;
  /**
   * 행 오른쪽 끝 동작 (디자인 1.15 칸 시트의 "빼기" 조용한 텍스트 동작). 있으면 행은 링크·버튼이 아닌 묶음이 되고
   * (href·onSelect 무시 — 누름 요소를 겹치지 않는다) 동작만 누를 수 있다.
   */
  action?: React.ReactNode;
};

/** 시약 목록·최근 사용 기록 행 (회색 바탕, radius 16) */
export function ReagentRow({ title, body, caption, lowStock, trailingCaption, href, selected, onSelect, action }: Props) {
  const cls = [styles.row, selected ? styles.selected : ""].join(" ").trim();
  if (action) {
    return (
      <div data-component="reagent-row" className={[cls, styles.withAction].join(" ")}>
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
        {trailingCaption ? <span className={styles.trailing}>{trailingCaption}</span> : null}
        <div className={styles.action}>{action}</div>
      </div>
    );
  }
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
      {trailingCaption ? <span className={styles.trailing}>{trailingCaption}</span> : null}
      {href && !onSelect && !trailingCaption ? <Icon name="chevron-right" className={styles.chevron} /> : null}
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
