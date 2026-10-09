import { ReagentDeskTable } from "@/app/(app)/(member)/(desk)/_desk/reagent-desk-table";
import { DeskBaseProvider } from "@/app/(app)/(member)/(desk)/_desk/desk-base";
import styles from "@/app/(app)/(member)/(desk)/_desk/desk.module.css";
import { DesktopOnly } from "@/components/viewport-only";
import { getDemoReagentList } from "@/lib/supabase/demo-data";

export const dynamic = "force-dynamic";

/**
 * 둘러보기 시약 목록 + 오른쪽 드로어 묶음 (d7 §23 run d — 2g /demo/reagents · 3g /demo/reagents/[id] · 16g /demo/msds/[id]).
 * 로그인 (desk) 레이아웃과 같은 배치: 데스크톱 = 왼쪽 시약 목록 data-table(데모 학교, anon) + 오른쪽 각 페이지의 detail-drawer,
 * 주소 앞머리는 /demo (DeskBaseProvider). 모바일은 목록 묶음 없이 페이지가 지금처럼 전용 화면을 그린다.
 * 둘러보기에는 MSDS 한 번에 찾기(msds-bulk-banner)·사용 기록 입력이 없다 (rules.json guest.hidden_components · guest-lock).
 */
export default async function DemoDeskLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { items, cabinets } = await getDemoReagentList();
  return (
    <DeskBaseProvider base="/demo">
      <div className={styles.frame} data-desk-frame="">
        <DesktopOnly>
          <div className={styles.list} data-shown="true">
            <ReagentDeskTable items={items} cabinets={cabinets} canFindMsds={false} />
          </div>
        </DesktopOnly>
        {children}
      </div>
    </DeskBaseProvider>
  );
}
