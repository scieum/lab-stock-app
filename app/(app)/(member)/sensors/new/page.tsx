import { redirect } from "next/navigation";
import { EMPTY_SENSOR_FORM } from "@/lib/sensor-rules";
import { getSensorList } from "@/lib/supabase/sensors";
import { SensorFormView } from "../_sensors/sensor-form-view";

export const dynamic = "force-dynamic";

/** 화면 17 센서 등록 — 교사·admin 만 (학생은 목록으로) */
export default async function SensorNewPage() {
  const data = await getSensorList();
  if (!data) redirect("/login");
  if (data.role === "student") redirect("/sensors");
  return <SensorFormView initial={EMPTY_SENSOR_FORM} cabinets={data.picker ?? []} slots={data.slots} />;
}
