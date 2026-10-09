import { DeskNotFoundDrawer } from "@/app/(app)/(member)/(desk)/_desk/desk-drawer";
import styles from "@/app/(app)/(member)/(desk)/reagents/[id]/detail.module.css";
import { ButtonOutline } from "@/components/button-outline";
import { DesktopOnly, MobileOnly } from "@/components/viewport-only";

/** 데모 학교에 없는 시약(실제 학교 id 포함) — 화면 3 과 같은 404 본문, 목록 링크만 둘러보기 경로. 데스크톱은 목록 옆 드로어 자리 */
export default function DemoReagentNotFound() {
  return (
    <>
      <MobileOnly>
        <div className={styles.layout}>
          <p className={styles.empty}>시약을 찾을 수 없어요</p>
          <ButtonOutline href="/demo/reagents">시약 목록으로</ButtonOutline>
        </div>
      </MobileOnly>
      <DesktopOnly>
        <DeskNotFoundDrawer />
      </DesktopOnly>
    </>
  );
}
