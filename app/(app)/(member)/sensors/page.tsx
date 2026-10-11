import { redirect } from "next/navigation";
import { MobileOnly } from "@/components/viewport-only";
import { parseSensorFilter } from "@/lib/sensor-rules";
import { getSensorList } from "@/lib/supabase/sensors";
import { SensorBrowser } from "./_sensors/sensor-browser";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * 화면 17 센서 목록 (모바일). 데스크톱은 레이아웃의 data-table 이 같은 주소 쿼리(?q · ?type · ?maker · ?status · ?page)로 그린다.
 */
export default async function SensorsPage({ searchParams }: Props) {
  const [data, params] = await Promise.all([getSensorList(), searchParams]);
  if (!data) redirect("/login");
  return (
    <MobileOnly>
      <SensorBrowser
        items={data.items}
        canEdit={data.role === "teacher" || data.role === "admin"}
        initialQuery={first(params.q) ?? ""}
        initialFilter={parseSensorFilter(params)}
      />
    </MobileOnly>
  );
}
