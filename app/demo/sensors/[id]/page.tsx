import { notFound } from "next/navigation";
import { SensorDetailView } from "@/app/(app)/(member)/sensors/_sensors/sensor-detail-view";
import { getDemoSensorList } from "@/lib/supabase/sensors";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

/** 화면 17g 둘러보기 센서 상세 — 데모 학교가 아닌 id · 없는 id 는 404 (읽기 전용: 수정 · 삭제 없음) */
export default async function DemoSensorDetailPage({ params }: Props) {
  const [{ id }, items] = await Promise.all([params, getDemoSensorList()]);
  const sensor = items.find((s) => s.id === id);
  if (!sensor) notFound();
  return <SensorDetailView sensor={sensor} canEdit={false} base="/demo" />;
}
