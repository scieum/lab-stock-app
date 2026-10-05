import { ButtonOutline } from "@/components/button-outline";
import styles from "./detail.module.css";

/** 없는 시약·다른 학교 시약 — 어느 쪽인지 구분하지 않는다 */
export default function ReagentNotFound() {
  return (
    <div className={styles.layout}>
      <p className={styles.empty}>시약을 찾을 수 없어요</p>
      <ButtonOutline href="/reagents">시약 목록으로</ButtonOutline>
    </div>
  );
}
