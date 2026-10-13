import "server-only";
import { createAnonClient } from "./anon";
import { getServerClient, getServerSession, type SessionRole } from "./server";
import { DEMO_SCHOOL_ID } from "./demo-data";
import { isLowStock } from "@/lib/types";
import type { ManageCounts } from "@/lib/manage-menu";

/**
 * 화면 18 관리 목록 요약 숫자 (d7 §29, design/rules.json 1.29 manage.row).
 * 로그인 세션(publishable 키 + 쿠키)으로 한 번에(병렬) 읽고 RLS 가 자기 학교 · 보관 안 된 행만 돌려준다 (service role 미사용).
 * 역할별로 필요한 것만 읽는다 — 화면 항목(lib/manage-menu)과 같은 기준:
 *   모든 역할: 시약 N종 · 재고 부족 K / 센서 N개 · 고장 K / 시약장 N개
 *   교사·admin: + 재주문 알림 N건 (화면 6 과 같은 기준 stock < min_stock = 재고 부족 수)
 *   admin: + 학생 a · 교사 b · admin c (profiles) / 판매처 N곳 (우리 학교가 등록한 판매처 — 공통 목록 제외, 화면 9 '우리 학교' 목록)
 */
export type ManageSummary = { role: SessionRole; schoolName: string; counts: ManageCounts };

export type ManageSummaryResult =
  | { kind: "ok"; data: ManageSummary }
  | { kind: "no-school" }
  | { kind: "signed-out" };

type Count = { count: number | null; error: unknown };

function countOf(r: Count): number | undefined {
  return r.error || r.count === null ? undefined : r.count;
}

export async function getManageSummary(): Promise<ManageSummaryResult> {
  const me = await getServerSession();
  if (me.kind === "signed-out" || me.kind === "unavailable") return { kind: "signed-out" };
  if (me.kind === "no-school") return { kind: "no-school" };
  const role = me.role;
  const schoolId = me.school.id;
  const staff = role === "teacher" || role === "admin";
  const admin = role === "admin";

  const supabase = await getServerClient();
  const none = Promise.resolve(null);
  const [reagents, sensors, broken, cabinets, profiles, vendors] = await Promise.all([
    supabase.from("reagents").select("stock, min_stock").eq("school_id", schoolId),
    supabase.from("sensors").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
    supabase.from("sensors").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("status", "broken"),
    supabase.from("cabinets").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
    admin ? supabase.from("profiles").select("role").eq("school_id", schoolId) : none,
    admin ? supabase.from("vendors").select("id", { count: "exact", head: true }).eq("school_id", schoolId) : none,
  ]);

  const counts: ManageCounts = {};
  if (!reagents.error && reagents.data) {
    const low = reagents.data.filter((r) => isLowStock(r)).length;
    counts.reagents = { total: reagents.data.length, low };
    if (staff) counts.reorder = low;
  }
  const sensorTotal = countOf(sensors);
  const sensorBroken = countOf(broken);
  if (sensorTotal !== undefined && sensorBroken !== undefined) counts.sensors = { total: sensorTotal, broken: sensorBroken };
  const cabinetCount = countOf(cabinets);
  if (cabinetCount !== undefined) counts.cabinets = cabinetCount;
  if (admin && profiles && !profiles.error && profiles.data) {
    const by = (r: string) => profiles.data.filter((p) => p.role === r).length;
    counts.users = { student: by("student"), teacher: by("teacher"), admin: by("admin") };
  }
  if (admin && vendors) {
    const n = countOf(vendors);
    if (n !== undefined) counts.vendors = n;
  }

  return { kind: "ok", data: { role, schoolName: me.school.name, counts } };
}

/**
 * 둘러보기 관리 목록 요약 (18-guest-mobile — '재고' 묶음의 시약 · 센서 두 줄).
 * anon 클라이언트로 데모 학교 행만 읽는다 (RLS *_select_demo_anon).
 */
export async function getDemoManageCounts(): Promise<ManageCounts> {
  const supabase = createAnonClient();
  const [reagents, sensors, broken] = await Promise.all([
    supabase.from("reagents").select("stock, min_stock").eq("school_id", DEMO_SCHOOL_ID),
    supabase.from("sensors").select("id", { count: "exact", head: true }).eq("school_id", DEMO_SCHOOL_ID),
    supabase.from("sensors").select("id", { count: "exact", head: true }).eq("school_id", DEMO_SCHOOL_ID).eq("status", "broken"),
  ]);
  const counts: ManageCounts = {};
  if (!reagents.error && reagents.data) {
    counts.reagents = { total: reagents.data.length, low: reagents.data.filter((r) => isLowStock(r)).length };
  }
  const sensorTotal = countOf(sensors);
  const sensorBroken = countOf(broken);
  if (sensorTotal !== undefined && sensorBroken !== undefined) counts.sensors = { total: sensorTotal, broken: sensorBroken };
  return counts;
}
