import { ButtonPillSoft } from "@/components/button-pill-soft";
import { Icon } from "@/components/icons";
import styles from "./styles.module.css";

type Props = {
  title: string;
  /** 제목 아래 보조 문구 */
  description?: string;
  /** 있으면 아래에 연한 pill 버튼 */
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
};

/** 빈 상태 안내 카드 (하늘색 안내 아이콘 + 제목 + 보조 문구 + 선택 버튼). 화면 7 검색 0건 */
export function EmptyStateCard({ title, description, actionLabel, onAction, actionHref }: Props) {
  return (
    <div data-component="ex-empty-state-card" role="status" className={styles.card}>
      <Icon name="info" className={styles.icon} />
      <p className={styles.title}>{title}</p>
      {description ? <p className={styles.description}>{description}</p> : null}
      {actionLabel && (onAction || actionHref) ? (
        <div className={styles.action}>
          <ButtonPillSoft tone="white" href={actionHref} onClick={onAction}>
            {actionLabel}
          </ButtonPillSoft>
        </div>
      ) : null}
    </div>
  );
}
