import { SensorBrowser } from "@/app/(app)/(member)/sensors/_sensors/sensor-browser";
import { MobileOnly } from "@/components/viewport-only";
import { parseSensorFilter } from "@/lib/sensor-rules";
import { getDemoSensorList } from "@/lib/supabase/sensors";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** 화면 17g 둘러보기 센서 목록 (모바일) — /demo/sensors, 데모 학교 센서 읽기 전용 */
export default async function DemoSensorsPage({ searchParams }: Props) {
  const [items, params] = await Promise.all([getDemoSensorList(), searchParams]);
  return (
    <MobileOnly>
      <SensorBrowser
        items={items}
        canEdit={false}
        base="/demo"
        initialQuery={first(params.q) ?? ""}
        initialFilter={parseSensorFilter(params)}
      />
    </MobileOnly>
  );
}
