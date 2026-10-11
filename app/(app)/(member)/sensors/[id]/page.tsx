import { notFound, redirect } from "next/navigation";
import { getSensorList } from "@/lib/supabase/sensors";
import { SensorDetailView } from "../_sensors/sensor-detail-view";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

/**
 * 화면 17 센서 상세 — /sensors/[id]. 자기 학교 · 보관 안 된 센서(RLS)만 — 없는 id · 다른 학교 id · 삭제된 센서는 똑같이 404.
 */
export default async function SensorDetailPage({ params }: Props) {
  const [{ id }, data] = await Promise.all([params, getSensorList()]);
  if (!data) redirect("/login");
  const sensor = data.items.find((s) => s.id === id);
  if (!sensor) notFound();
  return <SensorDetailView sensor={sensor} canEdit={data.role === "teacher" || data.role === "admin"} />;
}
