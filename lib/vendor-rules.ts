// 화면 9 판매처 설정 · 화면 6 판매처 연결 규칙 (harness/d7-data.md §11·§12).
// vendors 테이블 제약이 같은 검사를 다시 한다 — 여기는 사용자에게 보일 안내와 화면 표시를 만드는 용도.

export const VENDOR_NAME_MAX = 40;
export const VENDOR_CONTACT_MAX = 40;
export const VENDOR_WEBSITE_MAX = 300;
export const VENDOR_NOTE_MAX = 60;

export type VendorField = "name" | "contact" | "website" | "note";

export type VendorInput = { name: unknown; contact?: unknown; website?: unknown; note?: unknown };

/** DB 에 넣을 값 (빈 값은 null) */
export type VendorValue = { name: string; contact: string | null; website: string | null; note: string | null };

export type VendorChecked = { ok: true; value: VendorValue } | { ok: false; field: VendorField; error: string };

/** 화면에 보이는 판매처 (공통 목록은 schoolId = null) */
export type VendorLike = {
  name: string;
  contact?: string | null;
  website?: string | null;
  note?: string | null;
};

const HTTP_RE = /^https?:\/\//i;
// "javascript:" · "data:" · "mailto:" 같은 다른 스킴 ("host:8080" 처럼 포트가 붙은 주소는 스킴이 아니다)
const OTHER_SCHEME_RE = /^[a-z][a-z0-9+.-]*:(?!\d)/i;

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * 웹사이트 주소가 새 창으로 열 수 있는 값인지: http:// 또는 https:// 로 시작하고, 호스트가 있고,
 * 공백·제어 문자가 없고, 300자 이하. `javascript:` 등 다른 스킴은 모두 거부한다.
 */
export function isOpenableWebsite(v: unknown): v is string {
  if (typeof v !== "string") return false;
  if (v.length === 0 || v.length > VENDOR_WEBSITE_MAX) return false;
  if (/\s/.test(v) || [...v].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127)) return false;
  if (!HTTP_RE.test(v)) return false;
  try {
    const u = new URL(v);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname !== "";
  } catch {
    return false;
  }
}

/**
 * 입력한 웹사이트 주소 → 저장할 값.
 * 빈 값 = null(웹사이트 없음). 스킴 없이 적은 주소("www.example.com")는 https:// 를 붙인다(시안 9-desktop 폼 예시).
 * http(s) 가 아닌 스킴은 받지 않는다(undefined).
 */
export function normalizeWebsite(v: unknown): string | null | undefined {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (s === "") return null;
  if (HTTP_RE.test(s)) return isOpenableWebsite(s) ? s : undefined;
  if (OTHER_SCHEME_RE.test(s) || s.startsWith("//")) return undefined;
  const withScheme = `https://${s}`;
  return isOpenableWebsite(withScheme) ? withScheme : undefined;
}

/** 판매처 등록·수정 입력 검사 (이름 trim 1~40자, 연락처 40자, 웹사이트 null 또는 http(s) 300자, 부가 정보 60자) */
export function checkVendor(input: VendorInput): VendorChecked {
  if (input.name !== undefined && input.name !== null && typeof input.name !== "string") {
    return { ok: false, field: "name", error: "판매처명을 입력해 주세요" };
  }
  const name = text(input.name);
  if (name === "") return { ok: false, field: "name", error: "판매처명을 입력해 주세요" };
  if (name.length > VENDOR_NAME_MAX) {
    return { ok: false, field: "name", error: `판매처명은 ${VENDOR_NAME_MAX}자까지 쓸 수 있어요` };
  }

  const contact = text(input.contact);
  if (contact.length > VENDOR_CONTACT_MAX) {
    return { ok: false, field: "contact", error: `연락처는 ${VENDOR_CONTACT_MAX}자까지 쓸 수 있어요` };
  }

  if (text(input.website).length > VENDOR_WEBSITE_MAX) {
    return { ok: false, field: "website", error: `웹사이트 주소는 ${VENDOR_WEBSITE_MAX}자까지 쓸 수 있어요` };
  }
  const website = normalizeWebsite(input.website);
  if (website === undefined) {
    return { ok: false, field: "website", error: "웹사이트 주소를 확인해 주세요 (예: https://example.com)" };
  }

  const note = text(input.note);
  if (note.length > VENDOR_NOTE_MAX) {
    return { ok: false, field: "note", error: `부가 정보는 ${VENDOR_NOTE_MAX}자까지 쓸 수 있어요` };
  }

  return { ok: true, value: { name, contact: contact || null, website, note: note || null } };
}

/** 같은 학교 안 이름 중복 비교용 값 (대소문자·공백 무시) */
export function vendorNameKey(name: string): string {
  return name.replace(/\s+/g, "").toLowerCase();
}

/** 웹사이트 주소에서 보여 줄 호스트 ("https://www.11st.co.kr/x" → "www.11st.co.kr"). 열 수 없는 값이면 "" */
export function websiteHost(website: string | null | undefined): string {
  if (!isOpenableWebsite(website)) return "";
  try {
    return new URL(website).host;
  } catch {
    return "";
  }
}

/**
 * 판매처 행의 부가 정보 한 줄: "연락처 · 부가 정보" (있는 것만).
 * 둘 다 없으면 웹사이트 호스트(공통 목록처럼 주소만 있는 판매처), 그것도 없으면 "".
 */
export function vendorInfo(v: Pick<VendorLike, "contact" | "note" | "website">): string {
  const parts = [text(v.contact), text(v.note)].filter(Boolean);
  if (parts.length > 0) return parts.join(" · ");
  return websiteHost(v.website);
}

/** 판매처명 검색 (부분 일치, 대소문자·앞뒤 공백 무시). 빈 검색어 = 전체 */
export function filterVendors<T extends { name: string }>(vendors: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...vendors];
  return vendors.filter((v) => v.name.toLowerCase().includes(q));
}

/**
 * 판매처 연결 목록 순서 (d7 §11): 우리 학교 판매처 먼저, 그다음 공통 목록(schoolId = null). 같은 묶음 안은 이름순.
 */
export function orderVendorsForLink<T extends { name: string; schoolId: string | null }>(vendors: readonly T[]): T[] {
  return [...vendors].sort((a, b) => {
    const ga = a.schoolId === null ? 1 : 0;
    const gb = b.schoolId === null ? 1 : 0;
    if (ga !== gb) return ga - gb;
    return a.name.localeCompare(b.name, "ko");
  });
}
