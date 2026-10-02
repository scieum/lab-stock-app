import type { Database, Tables } from "./database";

export type { Database, Tables };
export type Role = "student" | "teacher" | "admin";
export type School = Tables<"schools">;
export type Profile = Tables<"profiles">;
export type Cabinet = Tables<"cabinets">;
export type CabinetSlot = Tables<"cabinet_slots">;
export type Reagent = Tables<"reagents">;
export type UsageLog = Tables<"usage_logs">;

/** 재고 부족 = stock < min_stock (d7 §1) */
export function isLowStock(r: Pick<Reagent, "stock" | "min_stock">): boolean {
  return Number(r.stock) < Number(r.min_stock);
}

/** NEIS 중계 API 응답의 학교 한 건 */
export type NeisSchool = {
  neis_code: string;
  office_code: string;
  name: string;
  sido: string;
  region: string;
};
