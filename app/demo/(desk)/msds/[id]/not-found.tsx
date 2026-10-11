import { NotFoundCard } from "@/app/not-found-card";
import styles from "@/app/not-found.module.css";
import { DemoNav } from "@/app/demo/demo-shell";
import { MobileOnly } from "@/components/viewport-only";

/**
 * 데모 학교가 아닌 id · 없는 id — 모바일은 셸이 이 경로에서 nav-pill 을 그리지 않아 여기서 그린다.
 * 데스크톱은 목록 옆 드로어 자리 (화면 3g 와 같은 카드).
 */
export default function DemoMsdsNotFound() {
  return (
    <>
      <MobileOnly>
        <DemoNav schoolName="데모 학교" />
      </MobileOnly>
      <div className={styles.drawerSlot}>
        <NotFoundCard kind="app" homeHref="/demo" />
      </div>
    </>
  );
}
