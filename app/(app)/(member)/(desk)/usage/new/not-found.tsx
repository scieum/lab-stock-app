import { ButtonOutline } from "@/components/button-outline";
import { DesktopOnly, MobileOnly } from "@/components/viewport-only";
import { DeskNotFoundDrawer } from "../../_desk/desk-drawer";
import styles from "./usage.module.css";

/** 없는 시약·다른 학교 시약 — 어느 쪽인지 구분하지 않는다 (화면 3 과 같은 방식) */
export default function UsageReagentNotFound() {
  return (
    <>
      <MobileOnly>
      <div className={styles.notFound}>
        <p className={styles.empty}>시약을 찾을 수 없어요</p>
        <ButtonOutline href="/reagents">시약 목록으로</ButtonOutline>
      </div>
      </MobileOnly>
      <DesktopOnly>
        <DeskNotFoundDrawer />
      </DesktopOnly>
    </>
  );
}
