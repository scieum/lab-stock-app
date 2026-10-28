import { Icon } from "@/components/icons";
import { ManageGroup } from "@/components/manage-group";
import rowStyles from "@/components/manage-row/styles.module.css";
import { GUIDE_LABEL, GUIDE_LINK_PROPS } from "@/lib/guide-link";
import type { ManageCounts, ManageGroup as ManageGroupData } from "@/lib/manage-menu";
import styles from "./styles.module.css";

type Props = {
  /** lib/manage-menu manageMenu(role) · guestManageMenu() */
  groups: ManageGroupData[];
  counts?: ManageCounts;
  className?: string;
};

/**
 * manage-list (rules 1.29 manage.list, 시안 18-mobile · 18-guest-mobile): 묶음(manage-group) 사이 hairline-soft, canvas 바탕.
 * 묶음 = '재고' · '입고·주문'(교사·admin) · '학교'(admin), 둘러보기는 '재고' 시약·센서만.
 */
export function ManageList({ groups, counts, className }: Props) {
  return (
    <nav data-component="manage-list" aria-label="관리" className={[styles.list, className ?? ""].filter(Boolean).join(" ")}>
      {groups.map((g, i) => (
        <div key={g.title} className={i > 0 ? styles.divided : undefined}>
          <ManageGroup group={g} counts={counts} />
        </div>
      ))}
      {/* 시안 예외 (사용자 요청 2026-10-28, 요청서 10 대기): 목록 맨 아래 '사용 가이드' — 모든 역할(학생 포함) · 둘러보기 공통, 새 탭.
          manage-row 모양(같은 CSS)을 빌려 쓰되 관리 묶음·행이 아니므로 data-component 는 달지 않는다 (묶음·행 = rules manage.list) */}
      <div className={styles.divided}>
        <a {...GUIDE_LINK_PROPS} className={rowStyles.row}>
          <Icon name="info" className={rowStyles.icon} />
          <span className={rowStyles.text}>
            <span className={rowStyles.name}>{GUIDE_LABEL}</span>
          </span>
          <Icon name="external" className={rowStyles.chevron} />
        </a>
      </div>
    </nav>
  );
}
