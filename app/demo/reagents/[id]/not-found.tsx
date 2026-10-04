import { ButtonOutline } from "@/components/button-outline";
import styles from "@/app/(app)/(member)/reagents/[id]/detail.module.css";

/** 데모 학교에 없는 시약(실제 학교 id 포함) — 화면 3 과 같은 404 본문, 목록 링크만 둘러보기 경로 */
export default function DemoReagentNotFound() {
  return (
    <div className={styles.layout}>
      <p className={styles.empty}>시약을 찾을 수 없어요</p>
      <ButtonOutline href="/demo/reagents">시약 목록으로</ButtonOutline>
    </div>
  );
}
