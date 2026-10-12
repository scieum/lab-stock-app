import { notFound, redirect } from "next/navigation";
import { normalizeSensorType } from "@/lib/sensor-rules";
import { getSensorList } from "@/lib/supabase/sensors";
import { SensorFormView } from "../../_sensors/sensor-form-view";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

/** 화면 17 센서 수정 — 교사·admin 만 (학생은 상세로). 없는 · 다른 학교 · 삭제된 센서는 404 */
export default async function SensorEditPage({ params }: Props) {
  const [{ id }, data] = await Promise.all([params, getSensorList()]);
  if (!data) redirect("/login");
  const sensor = data.items.find((s) => s.id === id);
  if (!sensor) notFound();
  if (data.role === "student") redirect(`/sensors/${encodeURIComponent(sensor.id)}`);
  return (
    <SensorFormView
      initial={{
        id: sensor.id,
        name: sensor.name,
        type: normalizeSensorType(sensor.type) ?? "",
        maker: sensor.maker,
        model: sensor.model,
        quantity: sensor.quantity,
        locationText: sensor.locationText,
        slotId: sensor.slot?.id ?? null,
        status: sensor.status,
        memo: sensor.memo,
      }}
      cabinets={data.picker ?? []}
      slots={data.slots}
    />
  );
}
