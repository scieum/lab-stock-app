import { BoardLink } from "@/components/board-link";
import { ManageGroup } from "@/components/manage-group";
import groupStyles from "@/components/manage-group/styles.module.css";
import { GuideLink } from "@/components/guide-link";
import { boardAnsweredCaption } from "@/lib/board";
import { manageHelp, type ManageCounts, type ManageGroup as ManageGroupData, type ManageHelp } from "@/lib/manage-menu";
import styles from "./styles.module.css";

type Props = {
  /** lib/manage-menu manageMenu(role) · guestManageMenu() */
  groups: ManageGroupData[];
  counts?: ManageCounts;
  /** 맨 아래 '도움말' 묶음 (lib/manage-menu manageHelp — 둘러보기는 manageHelp("guest") = guide-link 만). 기본 = 로그인 */
  help?: ManageHelp;
  className?: string;
};

/**
 * manage-list (rules 1.29 manage.list, 시안 18-mobile · 18-guest-mobile): 묶음(manage-group) 사이 hairline-soft, canvas 바탕.
 * 묶음 = '재고' · '입고·주문'(교사·admin) · '학교'(admin) + 맨 아래 '도움말'(rules 1.32 manage.guide), 둘러보기는 '재고' 시약·센서 + 도움말(가이드만).
 */
export function ManageList({ groups, counts, help = manageHelp("member"), className }: Props) {
  const answered = counts?.boardAnswered;
  return (
    <nav data-component="manage-list" aria-label="관리" className={[styles.list, className ?? ""].filter(Boolean).join(" ")}>
      {groups.map((g, i) => (
        <div key={g.title} className={i > 0 ? styles.divided : undefined}>
          <ManageGroup group={g} counts={counts} />
        </div>
      ))}
      {/* rules 1.32 manage.guide: 맨 아래 넷째 묶음 '도움말' = board-link '게시판'(요약 '답변 완료 N', 0·값 없음 = caption 없음)
          + guide-link '사용 가이드 ↗'(새 탭). 둘러보기는 guide-link 만 */}
      <div className={styles.divided}>
        <section data-component="manage-group" className={groupStyles.group} aria-label={help.title}>
          <h2 className={groupStyles.title}>{help.title}</h2>
          <div className={groupStyles.rows}>
            {help.board ? <BoardLink variant="row" caption={answered === undefined ? null : boardAnsweredCaption(answered)} /> : null}
            <GuideLink variant="row" />
          </div>
        </section>
      </div>
    </nav>
  );
}
