import "server-only";
import { getServerClient, getServerSession } from "./server";
import { checkVendor, type VendorField, type VendorInput } from "@/lib/vendor-rules";

const ADMIN_ONLY = "판매처 설정은 admin만 할 수 있어요";
const SIGNED_OUT = "다시 로그인해 주세요";
const NO_SCHOOL = "소속 학교가 없어요";
const NOT_FOUND = "판매처를 찾을 수 없어요";
const DUPLICATE_NAME = "같은 이름의 판매처가 이미 있어요";
const INVALID = "입력한 내용을 확인해 주세요";
const SAVE_FAILED = "저장하지 못했어요. 잠시 후 다시 시도해 주세요";
const DELETE_FAILED = "삭제하지 못했어요. 잠시 후 다시 시도해 주세요";
const STAFF_ONLY = "즐겨찾기는 교사·admin만 바꿀 수 있어요";
const FAVORITE_DENIED = "이 판매처는 즐겨찾기할 수 없어요";
const FAVORITE_FAILED = "즐겨찾기를 저장하지 못했어요. 잠시 후 다시 시도해 주세요";

const COLUMNS = "id, name, contact, website, note";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type VendorItem = {
  id: string;
  name: string;
  contact: string | null;
  website: string | null;
  note: string | null;
  /** 우리 학교 즐겨찾기 (vendor_favorites, d7 §12-1) */
  favorite: boolean;
};

export type VendorScreen = {
  schoolName: string;
  /** 우리 학교 판매처 (이름순) */
  vendors: VendorItem[];
  /** 공통 목록 (school_id = null, 이름순) — 보기 전용 */
  common: VendorItem[];
};

export type VendorScreenResult =
  | { kind: "ok"; data: VendorScreen }
  /** 학생·교사 — 화면 9 는 admin 만 (d7 §12). 판매처를 읽지 않는다 */
  | { kind: "forbidden" }
  /** 로그인은 됐지만 프로필이 없다 (내보낸 계정) */
  | { kind: "no-school" }
  | { kind: "signed-out" };

export type SaveVendorResult =
  /** 저장한 판매처 (즐겨찾기 여부는 목록을 다시 읽을 때 붙는다) */
  | { ok: true; vendor: Omit<VendorItem, "favorite"> }
  /** field = 문제가 된 입력 칸 (입력 검사에서 걸렸을 때) */
  | { ok: false; error: string; field?: VendorField };

export type DeleteVendorResult = { ok: true; id: string } | { ok: false; error: string };

export type ToggleFavoriteResult = { ok: true; vendorId: string; favorite: boolean } | { ok: false; error: string };

function byName(a: VendorItem, b: VendorItem): number {
  return a.name.localeCompare(b.name, "ko");
}

/**
 * 화면 9 판매처 설정 — 로그인 세션(publishable 키 + 쿠키)으로 읽는다 (service role 미사용).
 * RLS: vendors 는 교사·admin 에게 자기 학교 행 + 공통 목록(school_id = null)만 보인다. 화면은 admin 만.
 */
export async function getVendorScreen(): Promise<VendorScreenResult> {
  // 역할을 먼저 본다 (요청당 1회 읽은 세션, layout 과 공유) — admin 이 아니면 판매처를 읽지 않는다
  const me = await getServerSession();
  if (me.kind === "signed-out" || me.kind === "unavailable") return { kind: "signed-out" };
  if (me.kind === "no-school") return { kind: "no-school" };
  if (me.role !== "admin") return { kind: "forbidden" };
  const schoolId = me.school.id;

  const supabase = await getServerClient();
  const [{ data }, favorites] = await Promise.all([
    supabase
      .from("vendors")
      .select("id, school_id, name, contact, website, note")
      .or(`school_id.eq.${schoolId},school_id.is.null`)
      .order("name"),
    favoriteVendorIds(schoolId),
  ]);
  const rows = data ?? [];
  const item = (v: (typeof rows)[number]): VendorItem => ({
    id: v.id,
    name: v.name,
    contact: v.contact,
    website: v.website,
    note: v.note,
    favorite: favorites.has(v.id),
  });
  return {
    kind: "ok",
    data: {
      schoolName: me.school.name,
      vendors: rows.filter((v) => v.school_id === schoolId).map(item).sort(byName),
      common: rows.filter((v) => v.school_id === null).map(item).sort(byName),
    },
  };
}

/**
 * 자기 학교 즐겨찾기 판매처 id (vendor_favorites, d7 §12-1). 로그인 세션(RLS)으로 읽는다 — 교사·admin 에게 자기 학교 행만 보인다.
 * 읽기에 실패하면 빈 집합(즐겨찾기 없음 = 전체 목록)으로 본다.
 */
export async function favoriteVendorIds(schoolId: string): Promise<Set<string>> {
  const supabase = await getServerClient();
  const { data, error } = await supabase.from("vendor_favorites").select("vendor_id").eq("school_id", schoolId);
  if (error) return new Set();
  return new Set((data ?? []).map((r) => r.vendor_id));
}

/**
 * 즐겨찾기 추가·해제 (d7 §12-1) — 교사·admin, 자기 학교 행만. vendor_favorites 에 직접 insert·delete
 * (RLS: 자기 학교 + 교사·admin + 데모 학교 아님 + 대상 판매처가 공통 목록이거나 자기 학교 것, created_by = 본인).
 * 학교·작성자는 세션에서만 정한다 — 입력으로 받지 않는다. 이미 같은 상태면(중복 추가·없는 행 해제) 성공으로 본다.
 */
export async function toggleVendorFavorite(input: { vendorId: unknown; favorite: unknown }): Promise<ToggleFavoriteResult> {
  const vendorId = input?.vendorId;
  if (typeof vendorId !== "string" || !UUID_RE.test(vendorId)) return { ok: false, error: NOT_FOUND };
  if (typeof input?.favorite !== "boolean") return { ok: false, error: INVALID };
  const favorite = input.favorite;

  const me = await getServerSession();
  if (me.kind === "signed-out" || me.kind === "unavailable") return { ok: false, error: SIGNED_OUT };
  if (me.kind === "no-school") return { ok: false, error: NO_SCHOOL };
  if (me.role !== "teacher" && me.role !== "admin") return { ok: false, error: STAFF_ONLY };
  const schoolId = me.school.id;

  const supabase = await getServerClient();
  if (favorite) {
    const { error } = await supabase
      .from("vendor_favorites")
      .insert({ school_id: schoolId, vendor_id: vendorId, created_by: me.userId });
    // 23505 = 이미 즐겨찾기 (다른 사람이 먼저 눌렀다) → 원하는 상태
    if (error && error.code !== "23505") {
      return { ok: false, error: error.code === "42501" ? FAVORITE_DENIED : error.code === "23503" ? NOT_FOUND : FAVORITE_FAILED };
    }
  } else {
    const { error } = await supabase
      .from("vendor_favorites")
      .delete()
      .eq("school_id", schoolId)
      .eq("vendor_id", vendorId);
    if (error) return { ok: false, error: error.code === "42501" ? FAVORITE_DENIED : FAVORITE_FAILED };
  }
  return { ok: true, vendorId, favorite };
}

/** 쓰기 전 확인: 로그인 + 소속 학교 + admin. 학교는 세션(profiles)에서만 정한다 — 입력으로 받지 않는다 */
async function adminSchool(): Promise<{ ok: true; schoolId: string } | { ok: false; error: string }> {
  const me = await getServerSession();
  if (me.kind === "signed-out" || me.kind === "unavailable") return { ok: false, error: SIGNED_OUT };
  if (me.kind === "no-school") return { ok: false, error: NO_SCHOOL };
  if (me.role !== "admin") return { ok: false, error: ADMIN_ONLY };
  return { ok: true, schoolId: me.school.id };
}

function saveError(code: string | undefined): SaveVendorResult {
  switch (code) {
    case "23505":
      return { ok: false, error: DUPLICATE_NAME, field: "name" };
    case "23514":
    case "22001":
      return { ok: false, error: INVALID };
    case "42501":
      return { ok: false, error: ADMIN_ONLY };
    default:
      return { ok: false, error: SAVE_FAILED };
  }
}

/**
 * 판매처 등록 — vendors 에 직접 insert (RLS: admin + 자기 학교 + 데모 학교 아님, 값은 테이블 제약이 다시 검사).
 * school_id 는 세션의 학교로만 넣는다 (입력에 school_id 가 있어도 쓰지 않는다).
 */
export async function createVendor(input: VendorInput): Promise<SaveVendorResult> {
  const checked = checkVendor(input ?? { name: "" });
  if (!checked.ok) return checked;

  const who = await adminSchool();
  if (!who.ok) return who;

  const supabase = await getServerClient();
  const { data, error } = await supabase
    .from("vendors")
    .insert({ school_id: who.schoolId, ...checked.value })
    .select(COLUMNS)
    .maybeSingle();
  if (error) return saveError(error.code);
  if (!data) return { ok: false, error: SAVE_FAILED };
  return { ok: true, vendor: data };
}

/**
 * 판매처 수정 — 자기 학교 행만 (RLS + school_id 조건). 공통 목록·다른 학교 행은 0행 → "판매처를 찾을 수 없어요".
 * school_id 는 바꾸지 않는다. 입력에 note 가 없으면(undefined — 화면 9 폼에는 부가 정보 칸이 없다, d7 §18)
 * note 열은 건드리지 않는다 (기존 값 유지).
 */
export async function updateVendor(input: VendorInput & { id: unknown }): Promise<SaveVendorResult> {
  if (typeof input?.id !== "string" || !UUID_RE.test(input.id)) return { ok: false, error: NOT_FOUND };
  const checked = checkVendor(input);
  if (!checked.ok) return checked;

  const who = await adminSchool();
  if (!who.ok) return who;

  const supabase = await getServerClient();
  const { note, ...withoutNote } = checked.value;
  const patch = input.note === undefined ? withoutNote : { ...withoutNote, note };
  const { data, error } = await supabase
    .from("vendors")
    .update(patch)
    .eq("id", input.id)
    .eq("school_id", who.schoolId)
    .select(COLUMNS);
  if (error) return saveError(error.code);
  const row = data?.[0];
  if (!row) return { ok: false, error: NOT_FOUND };
  return { ok: true, vendor: row };
}

/** 판매처 삭제 — 자기 학교 행만 (RLS + school_id 조건). 공통 목록·다른 학교 행은 0행 → "판매처를 찾을 수 없어요" */
export async function deleteVendor(input: { id: unknown }): Promise<DeleteVendorResult> {
  if (typeof input?.id !== "string" || !UUID_RE.test(input.id)) return { ok: false, error: NOT_FOUND };

  const who = await adminSchool();
  if (!who.ok) return who;

  const supabase = await getServerClient();
  const { data, error } = await supabase
    .from("vendors")
    .delete()
    .eq("id", input.id)
    .eq("school_id", who.schoolId)
    .select("id");
  if (error) return { ok: false, error: error.code === "42501" ? ADMIN_ONLY : DELETE_FAILED };
  if (!data?.[0]) return { ok: false, error: NOT_FOUND };
  return { ok: true, id: input.id };
}
