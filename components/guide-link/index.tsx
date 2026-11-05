import { Icon } from "@/components/icons";
import itemStyles from "@/components/sidebar-item/styles.module.css";
import rowStyles from "@/components/manage-row/styles.module.css";
import { GUIDE_LABEL, GUIDE_LINK_PROPS } from "@/lib/guide-link";
import styles from "./styles.module.css";

type Props = {
  /**
   * sidebar = 데스크톱 사이드바 아래 한 줄 (rules desktop_shell.guide_link: 아이콘 20 + body text-muted + ↗, 44 높이, 현재 표시 없음)
   * row = 모바일 관리 탭(18) '도움말' 묶음 한 줄 (rules manage.guide: manage-row 모양, 오른쪽 › 대신 ↗)
   */
  variant: "sidebar" | "row";
  className?: string;
};

/**
 * guide-link (rules 1.32 guide, 시안 18-mobile · 20-desktop): '사용 가이드 ↗' — 정적 가이드(public/guide)를 새 탭으로 연다.
 * 모든 역할·둘러보기 공통. sidebar-item·manage-row 가 아니므로 그 이름은 달지 않는다 (메뉴 수 = rules desktop_shell.menu).
 */
export function GuideLink({ variant, className }: Props) {
  if (variant === "row") {
    return (
      <a data-component="guide-link" {...GUIDE_LINK_PROPS} className={[rowStyles.row, className ?? ""].filter(Boolean).join(" ")}>
        <Icon name="help" className={rowStyles.icon} />
        <span className={rowStyles.text}>
          <span className={rowStyles.name}>{GUIDE_LABEL}</span>
        </span>
        <Icon name="external" className={rowStyles.chevron} />
        <span className={styles.srOnly}>(새 탭)</span>
      </a>
    );
  }
  return (
    <a
      data-component="guide-link"
      {...GUIDE_LINK_PROPS}
      className={[itemStyles.item, styles.sidebar, className ?? ""].filter(Boolean).join(" ")}
    >
      <Icon name="help" className={itemStyles.icon} />
      <span className={[itemStyles.label, styles.sidebarLabel].join(" ")}>{GUIDE_LABEL}</span>
      <Icon name="external" className={[itemStyles.icon, styles.external].join(" ")} />
      <span className={styles.srOnly}>(새 탭)</span>
    </a>
  );
}
