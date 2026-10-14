import { ManageRow } from "@/components/manage-row";
import type { ManageGroup as ManageGroupData, ManageCounts } from "@/lib/manage-menu";
import { manageCaption } from "@/lib/manage-menu";
import styles from "./styles.module.css";

type Props = {
  group: ManageGroupData;
  /** 요약 숫자 — 없으면 이름만 */
  counts?: ManageCounts;
};

/**
 * manage-group (rules 1.29 manage.list, 시안 18-mobile): 묶음 제목(caption 12 muted, 안쪽 24 16 8 16) + manage-row 들.
 */
export function ManageGroup({ group, counts = {} }: Props) {
  return (
    <section data-component="manage-group" className={styles.group} aria-label={group.title}>
      <h2 className={styles.title}>{group.title}</h2>
      <div className={styles.rows}>
        {group.items.map((it) => (
          <ManageRow key={it.key} href={it.href} label={it.label} icon={it.icon} caption={manageCaption(it.key, counts)} />
        ))}
      </div>
    </section>
  );
}
