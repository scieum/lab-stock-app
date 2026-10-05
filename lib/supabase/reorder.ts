import "server-only";
import { getServerClient, getServerSession } from "./server";
import { isReorderNeeded, sortByShortage } from "@/lib/reorder-rules";
import { orderVendorsForLink } from "@/lib/vendor-rules";

export type ReorderAlert = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  /** 필요량 = reagents.min_stock */
  minStock: number;
  /** 1조 사용량 (reagents.reorder_per_group) — 화면 5 가 채운다. 없으면 null */
  perGroup: number | null;
  /** 조 수 (reagents.reorder_groups). 없으면 null */
  groups: number | null;
  /** 재고가 기준 아래로 내려간 시각 (ISO, reagents.low_stock_since — DB 가 맞춘다) */
  lowSince: string | null;
};

export type ReorderVendor = {
  id: string;
  name: string;
  contact: string | null;
  website: string | null;
  note: string | null;
  /** 공통 목록(school_id = null) 여부 */
  common: boolean;
};

export type ReorderScreen = {
  schoolName: string;
  /** vendor-register(판매처 등록 진입)는 admin 에게만 (R3) */
  isAdmin: boolean;
  /** stock < min_stock 인 시약, 부족한 정도(모자란 양 ÷ 필요량)가 큰 순 */
  alerts: ReorderAlert[];
  /** 판매처 연결 목록: 우리 학교 판매처 먼저, 그다음 공통 목록 */
  vendors: ReorderVendor[];
};

export type ReorderScreenResult =
  | { kind: "ok"; data: ReorderScreen }
  /** 학생 — 화면 6 은 교사·admin 만 (d7 §11). 시약·판매처를 읽지 않는다 */
  | { kind: "forbidden" }
  /** 로그인은 됐지만 프로필이 없다 (내보낸 계정) */
  | { kind: "no-school" }
  | { kind: "signed-out" };

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * 화면 6 재주문 알림 — 로그인 세션(publishable 키 + 쿠키)으로 읽는다 (service role 미사용).
 * RLS: reagents 는 자기 학교 행만, vendors 는 교사·admin 에게 자기 학교 행 + 공통 목록만 보인다.
 * 알림 대상은 홈(화면 13)의 재고 부족과 같은 기준(stock < min_stock)이다.
 */
export async function getReorderScreen(): Promise<ReorderScreenResult> {
  // 역할을 먼저 본다 (요청당 1회 읽은 세션, layout 과 공유) — 학생이면 시약·판매처를 읽지 않는다
  const me = await getServerSession();
  if (me.kind === "signed-out" || me.kind === "unavailable") return { kind: "signed-out" };
  if (me.kind === "no-school") return { kind: "no-school" };
  if (me.role !== "teacher" && me.role !== "admin") return { kind: "forbidden" };
  const schoolId = me.school.id;

  const supabase = await getServerClient();
  const [reagents, vendors] = await Promise.all([
    supabase
      .from("reagents")
      .select("id, name, unit, stock, min_stock, reorder_per_group, reorder_groups, low_stock_since")
      .eq("school_id", schoolId)
      .order("name"),
    supabase
      .from("vendors")
      .select("id, school_id, name, contact, website, note")
      .or(`school_id.eq.${schoolId},school_id.is.null`)
      .order("name"),
  ]);

  const low = (reagents.data ?? [])
    .map((r) => ({
      id: r.id,
      name: r.name,
      unit: r.unit,
      stock: Number(r.stock),
      minStock: Number(r.min_stock),
      perGroup: numOrNull(r.reorder_per_group),
      groups: numOrNull(r.reorder_groups),
      lowStockSince: r.low_stock_since,
    }))
    .filter((r) => isReorderNeeded(r.stock, r.minStock));

  const alerts: ReorderAlert[] = sortByShortage(low).map(({ lowStockSince, ...r }) => ({ ...r, lowSince: lowStockSince }));

  const ordered = orderVendorsForLink(
    (vendors.data ?? [])
      // 다른 학교 행은 RLS 가 이미 걸렀다 — 한 번 더 확인
      .filter((v) => v.school_id === null || v.school_id === schoolId)
      .map((v) => ({ id: v.id, name: v.name, contact: v.contact, website: v.website, note: v.note, schoolId: v.school_id })),
  );

  return {
    kind: "ok",
    data: {
      schoolName: me.school.name,
      isAdmin: me.role === "admin",
      alerts,
      vendors: ordered.map(({ schoolId: sid, ...v }) => ({ ...v, common: sid === null })),
    },
  };
}
