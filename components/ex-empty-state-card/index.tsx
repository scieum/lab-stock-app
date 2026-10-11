import { ButtonPillSoft } from "@/components/button-pill-soft";
import { Icon, type IconName } from "@/components/icons";
import styles from "./styles.module.css";

type Props = {
  title: string;
  /** 제목 아래 보조 문구 */
  description?: string;
  /** 있으면 아래에 연한 pill 버튼 */
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
  /** 위 아이콘 (기본 안내 아이콘 — 화면 11 빈 상태는 "cabinet") */
  icon?: IconName;
  /** muted = 회색 카드(기본), outlined = 흰 바탕 + 테두리 큰 카드 (시안 11-empty) */
  variant?: "muted" | "outlined";
  /** 문구 아래 자리 (화면 11: cabinet-add — 학생 화면에는 넘기지 않는다) */
  children?: React.ReactNode;
  /** true = children 자리를 카드 폭 전체로 (시안 1.26 13-not-found card-actions · 17-empty sensor-add 전폭) */
  fullActions?: boolean;
  /** 아이콘 색 — ink = 검정 선 (시안 1.26 icon-compass) */
  iconTone?: "highlight" | "ink";
};

/** 빈 상태 안내 카드 (하늘색 안내 아이콘 + 제목 + 보조 문구 + 선택 버튼). 화면 7 검색 0건 */
export function EmptyStateCard({
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
  icon = "info",
  variant = "muted",
  children,
  fullActions = false,
  iconTone = "highlight",
}: Props) {
  return (
    <div
      data-component="ex-empty-state-card"
      role="status"
      className={[styles.card, variant === "outlined" ? styles.outlined : ""].filter(Boolean).join(" ")}
    >
      <Icon name={icon} className={[styles.icon, iconTone === "ink" ? styles.iconInk : ""].filter(Boolean).join(" ")} />
      <p className={styles.title}>{title}</p>
      {description ? <p className={styles.description}>{description}</p> : null}
      {actionLabel && (onAction || actionHref) ? (
        <div className={styles.action}>
          <ButtonPillSoft tone="white" href={actionHref} onClick={onAction}>
            {actionLabel}
          </ButtonPillSoft>
        </div>
      ) : null}
      {children ? <div className={[styles.action, fullActions ? styles.actionFull : ""].filter(Boolean).join(" ")}>{children}</div> : null}
    </div>
  );
}
