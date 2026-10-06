"use server";

import { revalidatePath } from "next/cache";
import {
  createVendor,
  deleteVendor,
  toggleVendorFavorite,
  updateVendor,
  type DeleteVendorResult,
  type SaveVendorResult,
  type ToggleFavoriteResult,
} from "@/lib/supabase/vendors";

function field(input: unknown, key: string): unknown {
  return input !== null && typeof input === "object" ? (input as Record<string, unknown>)[key] : undefined;
}

/** 판매처가 바뀌면 화면 9 의 목록과 화면 6 의 판매처 연결 목록이 달라진다 */
function revalidate() {
  revalidatePath("/vendors");
  revalidatePath("/reorder");
}

/**
 * 판매처 등록·수정. 클라이언트 값은 믿지 않는다 — name·contact·website·note(와 수정할 id)만 꺼내
 * lib/vendor-rules(checkVendor)로 다시 검증하고, 학교·호출자 역할은 로그인 세션으로 서버가 정한다
 * (school_id·role 을 입력으로 받지 않는다 — 들어 있어도 쓰지 않는다). id 가 있으면 수정, 없으면 등록.
 */
export async function saveVendorAction(input: unknown): Promise<SaveVendorResult> {
  const values = {
    name: field(input, "name"),
    contact: field(input, "contact"),
    website: field(input, "website"),
    note: field(input, "note"),
  };
  const id = field(input, "id");
  const result = id === undefined || id === null ? await createVendor(values) : await updateVendor({ ...values, id });
  if (result.ok) revalidate();
  return result;
}

/** 판매처 삭제. 자기 학교 판매처만 — 공통 목록·다른 학교 행은 서버(RLS + school_id 조건)가 거부한다 */
export async function deleteVendorAction(input: unknown): Promise<DeleteVendorResult> {
  const result = await deleteVendor({ id: field(input, "id") });
  if (result.ok) revalidate();
  return result;
}

/** 판매처 즐겨찾기 추가·해제 (d7 §12-1). 우리 학교 판매처·공통 목록 모두. 학교·작성자는 세션으로 서버가 정한다 */
export async function toggleVendorFavoriteAction(input: unknown): Promise<ToggleFavoriteResult> {
  const result = await toggleVendorFavorite({ vendorId: field(input, "vendorId"), favorite: field(input, "favorite") });
  if (result.ok) revalidate();
  return result;
}
