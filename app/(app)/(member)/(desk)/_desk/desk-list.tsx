import { getReagentList } from "@/lib/supabase/reagents-data";
import { ReagentDeskTable } from "./reagent-desk-table";
import styles from "./desk.module.css";

/** 데스크톱 시약 목록 데이터 (자기 학교 reagents, RLS) — 레이아웃이 Suspense 안에서 부른다 */
export async function DeskList() {
  const data = await getReagentList();
  if (!data) return null;
  return (
    <ReagentDeskTable
      items={data.items}
      cabinets={data.cabinets}
      canFindMsds={data.role === "teacher" || data.role === "admin"}
    />
  );
}

/** 목록을 받는 동안 (머리 줄 · 표 자리) */
export function DeskListSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      <div className={styles.skeletonBar} />
      <div className={styles.skeletonBar} />
      <div className={styles.skeletonTable} />
    </div>
  );
}
