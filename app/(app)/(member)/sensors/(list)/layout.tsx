import { redirect } from "next/navigation";
import desk from "@/app/(app)/(member)/(desk)/_desk/desk.module.css";
import { DesktopOnly } from "@/components/viewport-only";
import { getSensorList } from "@/lib/supabase/sensors";
import { SensorDesk } from "../_sensors/sensor-desk";

export const dynamic = "force-dynamic";

/**
 * 화면 17 센서 — 목록 + 오른쪽 드로어 묶음 (d7 §25, 디자인 1.26 17-desktop · 17-detail · 17-form).
 * 데스크톱(≥ 1024): 왼쪽 본문 = 센서 목록 data-table(드로어를 여닫아도 다시 만들어지지 않는다),
 *   오른쪽 = 각 페이지가 그리는 detail-drawer(상세 · 등록 · 수정). /sensors 는 드로어 없이 목록만.
 * 모바일: 목록 묶음 없이 페이지가 전용 화면(목록 · 상세 · 폼)을 그린다.
 * 모든 역할 (자기 학교 센서만, RLS). 쓰기는 교사·admin.
 */
export default async function SensorsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const data = await getSensorList();
  if (!data) redirect("/login");
  const canEdit = data.role === "teacher" || data.role === "admin";
  return (
    <div className={desk.frame} data-desk-frame="">
      <DesktopOnly>
        <div className={desk.list} data-shown="true">
          <SensorDesk items={data.items} canEdit={canEdit} />
        </div>
      </DesktopOnly>
      {children}
    </div>
  );
}
