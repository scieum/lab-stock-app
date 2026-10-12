import { redirect } from "next/navigation";
import { deniedHomePath } from "@/lib/no-access";
import { getSensorDocEntry } from "@/lib/supabase/sensors";
import { SensorDocScreen } from "./sensor-doc-screen";

export const dynamic = "force-dynamic";

/**
 * 화면 17 센서 서류로 등록 (d7 §28, dev-rules routes 17-doc = /sensors/doc) — 교사·admin 만.
 * 비로그인 → /login, 학교 없음 → /, 학생(·데모 학교 계정) → /?denied=staff (화면을 그리지도, 센서를 읽지도 않는다).
 * 모바일 = 전용 화면, 데스크톱 = 본문 페이지(목록 · 드로어 묶음 밖 — 무거운 작업).
 */
export default async function SensorDocPage() {
  const entry = await getSensorDocEntry();
  if (entry.kind === "signed-out") redirect("/login");
  if (entry.kind === "no-school") redirect("/");
  if (entry.kind === "forbidden") redirect(deniedHomePath("staff"));
  const { sensors, picker, slots } = entry.data;
  return <SensorDocScreen sensors={sensors} cabinets={picker} slots={slots} />;
}
