import { ButtonOutline } from "@/components/button-outline";
import styles from "./usage.module.css";

/** 없는 시약 · 다른 학교 시약 · 보관된 시약 — 어느 쪽인지 구분하지 않는다 (화면 3 과 같은 방식). 두 폭 같은 본문 */
export default function UsageReagentNotFound() {
  return (
    <div className={styles.notFound}>
      <p className={styles.notFoundText}>시약을 찾을 수 없어요</p>
      <div>
        <ButtonOutline href="/reagents">시약 목록으로</ButtonOutline>
      </div>
    </div>
  );
}
