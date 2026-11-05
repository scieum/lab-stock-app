import { NotFoundCard } from "@/app/not-found-card";
import styles from "@/app/not-found.module.css";

/** 없는 글 · 숨긴 글 · FAQ id — 어느 쪽인지 구분하지 않는다 (앱 404 와 같은 카드, 프레임 13-not-found) */
export default function BoardPostNotFound() {
  return (
    <div className={styles.appMain}>
      <NotFoundCard kind="app" />
    </div>
  );
}
