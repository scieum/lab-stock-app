import { ShotHome, ShotReagentTable } from "./shots";
import styles from "./styles.module.css";

export { Shot, ShotCabinet, ShotCabinetQr, ShotFilter, ShotHome, ShotIntake, ShotRecentUsage, ShotReagentTable, ShotReorderAlert, ShotReorderDrawer, ShotSignup, ShotUsageForm } from "./shots";

/** 히어로 표 카드에 보이는 세 줄 (시안 15-desktop product-shot/data-table) */
const HERO_ROWS = [
  { name: "염산", cab: 1, place: "1번 시약장 · 좌 1단", stock: "50 mL", low: true },
  { name: "글리세린", cab: 1, place: "1번 시약장 · 좌 2단", stock: "500 mL" },
  { name: "수산화나트륨", cab: 1, place: "1번 시약장 · 좌 1단", stock: "300 g" },
];

/**
 * 랜딩 히어로 오른쪽 그림 (시안 15-desktop product-shot, 800 × 660): 회색 바탕(radius 24) 위 브라우저 창
 * (점 3개 + "샘플고등학교 · Lab_Stock") 속 데스크톱 홈(13-desktop) + 왼쪽 아래에 겹친 시약 표 카드(2-desktop data-table).
 * 실제 앱 화면 조각을 HTML/CSS 로 그린 정적 그림 — 이미지 파일 아님. 오른쪽은 화면 끝에서 잘린다.
 */
export function ProductShot({ className }: { className?: string }) {
  return (
    <div
      data-component="product-shot"
      role="img"
      aria-label="Lab_Stock 데스크톱 홈과 시약 목록 화면 예시"
      className={[styles.shot, className ?? ""].filter(Boolean).join(" ")}
    >
      <div className={styles.base} aria-hidden="true">
        <div className={styles.browser}>
          <div className={styles.bar}>
            <span className={styles.dots}>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
            </span>
            <span className={styles.address}>샘플고등학교 · Lab_Stock</span>
          </div>
          <div className={styles.viewport}>
            <ShotHome />
          </div>
        </div>
      </div>
      <div className={styles.table} aria-hidden="true">
        <ShotReagentTable rows={HERO_ROWS} compact />
      </div>
    </div>
  );
}
