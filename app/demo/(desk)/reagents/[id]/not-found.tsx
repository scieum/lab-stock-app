import { NotFoundCard } from "@/app/not-found-card";
import styles from "@/app/not-found.module.css";

/** 데모 학교에 없는 시약(실제 학교 id 포함) — 화면 3 과 같은 404 카드, "홈으로" = 둘러보기 홈. 데스크톱은 목록 옆 드로어 자리 */
export default function DemoReagentNotFound() {
  return (
    <div className={styles.drawerSlot}>
      <NotFoundCard kind="app" homeHref="/demo" />
    </div>
  );
}
