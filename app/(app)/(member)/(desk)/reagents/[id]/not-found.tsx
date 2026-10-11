import { NotFoundCard } from "@/app/not-found-card";
import styles from "@/app/not-found.module.css";

/**
 * 없는 시약 · 다른 학교 시약 · 삭제(보관)된 시약 — 어느 쪽인지 구분하지 않는다.
 * d7 §25: 앱 404 와 같은 카드 (프레임 13-not-found). 데스크톱은 목록 옆 드로어 자리.
 */
export default function ReagentNotFound() {
  return (
    <div className={styles.drawerSlot}>
      <NotFoundCard kind="app" />
    </div>
  );
}
