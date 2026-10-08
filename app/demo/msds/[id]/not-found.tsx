import { DemoNav } from "@/app/demo/demo-shell";
import { ButtonOutline } from "@/components/button-outline";
import styles from "@/app/(app)/(member)/msds/[id]/msds.module.css";

/** 데모 학교가 아닌 id·없는 id — 셸이 이 경로에서 nav-pill 을 그리지 않아 여기서 그린다 */
export default function DemoMsdsNotFound() {
  return (
    <div className={styles.page}>
      <DemoNav schoolName="데모 학교" />
      <div className={styles.column}>
        <p className={styles.source}>시약을 찾을 수 없어요</p>
        <ButtonOutline href="/demo/reagents">시약 목록으로</ButtonOutline>
      </div>
    </div>
  );
}
