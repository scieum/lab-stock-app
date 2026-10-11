import desk from "@/app/(app)/(member)/(desk)/_desk/desk.module.css";
import { SensorDesk } from "@/app/(app)/(member)/sensors/_sensors/sensor-desk";
import { DesktopOnly } from "@/components/viewport-only";
import { getDemoSensorList } from "@/lib/supabase/sensors";

export const dynamic = "force-dynamic";

/**
 * 둘러보기 센서 (화면 17g, d7 §25 — 데모 학교 센서 읽기 전용, anon). 로그인 화면 17 과 같은 배치:
 * 데스크톱 = 왼쪽 센서 목록 data-table + 오른쪽 각 페이지의 detail-drawer, 주소 앞머리 /demo.
 * 등록 · 선택 · 수정 · 삭제 없음 (rules guest.hidden_components).
 */
export default async function DemoSensorsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const items = await getDemoSensorList();
  return (
    <div className={desk.frame} data-desk-frame="">
      <DesktopOnly>
        <div className={desk.list} data-shown="true">
          <SensorDesk items={items} canEdit={false} base="/demo" />
        </div>
      </DesktopOnly>
      {children}
    </div>
  );
}
