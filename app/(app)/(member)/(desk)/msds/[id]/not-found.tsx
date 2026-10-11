import { AppNav } from "@/app/(app)/app-shell";
import { NotFoundCard } from "@/app/not-found-card";
import styles from "@/app/not-found.module.css";
import { MobileOnly } from "@/components/viewport-only";
import { getServerSession } from "@/lib/supabase/server";

/**
 * 없는 시약 · 다른 학교 시약 — 어느 쪽인지 구분하지 않는다. d7 §25: 앱 404 와 같은 카드.
 * 셸이 이 경로(/msds/[id])에서 nav-pill 을 그리지 않아 모바일은 여기서 그린다. 데스크톱은 목록 옆 드로어 자리.
 */
export default async function MsdsNotFound() {
  const me = await getServerSession();
  return (
    <>
      <MobileOnly>
        {me.kind === "member" ? <AppNav schoolName={me.school.name} staff={me.role !== "student"} admin={me.role === "admin"} /> : null}
      </MobileOnly>
      <div className={styles.drawerSlot}>
        <NotFoundCard kind="app" />
      </div>
    </>
  );
}
