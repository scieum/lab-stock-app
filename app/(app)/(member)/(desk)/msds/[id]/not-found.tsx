import { AppNav } from "@/app/(app)/app-shell";
import { ButtonOutline } from "@/components/button-outline";
import { DesktopOnly, MobileOnly } from "@/components/viewport-only";
import { DeskNotFoundDrawer } from "../../_desk/desk-drawer";
import { getServerSession } from "@/lib/supabase/server";
import styles from "./msds.module.css";

/** 없는 시약·다른 학교 시약 — 어느 쪽인지 구분하지 않는다. 셸이 이 경로에서 nav-pill 을 그리지 않아 여기서 그린다 */
export default async function MsdsNotFound() {
  const me = await getServerSession();
  return (
    <>
      <MobileOnly>
      <div className={styles.page}>
        {me.kind === "member" ? (
          <AppNav schoolName={me.school.name} staff={me.role !== "student"} admin={me.role === "admin"} />
        ) : null}
        <div className={styles.column}>
          <p className={styles.source}>시약을 찾을 수 없어요</p>
          <ButtonOutline href="/reagents">시약 목록으로</ButtonOutline>
        </div>
      </div>
      </MobileOnly>
      <DesktopOnly>
        <DeskNotFoundDrawer />
      </DesktopOnly>
    </>
  );
}
