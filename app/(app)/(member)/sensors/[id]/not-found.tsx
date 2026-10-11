import { NotFoundCard } from "@/app/not-found-card";
import styles from "@/app/not-found.module.css";

/** 없는 센서 · 다른 학교 센서 · 삭제된 센서 — 어느 쪽인지 구분하지 않는다 (앱 404 와 같은 카드, 데스크톱은 드로어 자리) */
export default function SensorNotFound() {
  return (
    <div className={styles.drawerSlot}>
      <NotFoundCard kind="app" />
    </div>
  );
}
