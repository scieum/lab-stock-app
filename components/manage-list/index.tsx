import { ManageGroup } from "@/components/manage-group";
import { GuideLink } from "@/components/guide-link";
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
      {/* rules 1.32 manage.guide: 맨 아래 '도움말' 묶음의 guide-link '사용 가이드 ↗' — 모든 역할(학생 포함) · 둘러보기 공통, 새 탭 */}
      <div className={styles.divided}>
        <GuideLink variant="row" />
      </div>
    </nav>
  );
}
