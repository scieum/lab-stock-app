import { NotFoundCard } from "@/app/not-found-card";
import styles from "@/app/not-found.module.css";

/** 없는 시약 · 다른 학교 시약 · 보관된 시약 — 어느 쪽인지 구분하지 않는다. d7 §25: 앱 404 와 같은 카드. 두 폭 같은 본문 */
export default function UsageReagentNotFound() {
  return (
    <div className={styles.appMain}>
      <NotFoundCard kind="app" />
    </div>
  );
}
