// 보관 분류 추천 공용 규칙 (d7 §26 QA 개선 (11) · §21 서류 입고 suggestedClass · §17 위치 추천).
// 인화성(GHS 인화성 액체 H224·H225·H226 또는 학교 상용 표)이 유기보다 먼저 — 아세톤·에탄올·메탄올 = 인화성.
// 서류 입고(lib/doc-intake-rules normalizeDocItem)와 위치 추천(lib/location-suggest)이 이 함수 하나를 쓴다.
// 순수 함수 · 상대 import 만 (vitest 는 @/ 별칭이 없다).
import { STORAGE_CLASSES, type StorageClass } from "./intake-rules";
import { aliasKey, cleanReagentName, lookupAliasCas } from "./msds-aliases";

/** GHS 인화성 액체 유해 문구 (구분 1·2·3) */
export const FLAMMABLE_HAZARD_CODES = ["H224", "H225", "H226"] as const;

/**
 * 학교 상용 인화성 액체 표 — [CAS, 이름·별칭…]. 상용 이름 표(lib/msds-aliases)에 있는 것은 CAS 로도 찾는다.
 * 다른 분류가 먼저인 물질(빙초산 = 산, 과산화물 등)은 넣지 않는다.
 */
const FLAMMABLE_ROWS: readonly (readonly [string, ...string[]])[] = [
  ["64-17-5", "에탄올", "에틸알코올", "에틸 알코올", "무수 에탄올", "무수에탄올", "소독용 에탄올"],
  ["67-56-1", "메탄올", "메틸알코올", "메틸 알코올"],
  ["67-63-0", "아이소프로필알코올", "이소프로필알코올", "2-프로판올", "아이소프로판올", "이소프로판올", "IPA"],
  ["67-64-1", "아세톤"],
  ["60-29-7", "다이에틸에테르", "디에틸에테르", "에테르", "에틸에테르"],
  ["110-54-3", "헥세인", "헥산", "n-헥세인", "n-헥산", "노말헥산"],
  ["108-88-3", "톨루엔"],
  ["141-78-6", "아세트산에틸", "에틸아세테이트", "초산에틸"],
  ["71-23-8", "1-프로판올", "프로판올", "노말프로판올", "n-프로판올"],
  ["71-36-3", "1-뷰탄올", "뷰탄올", "부탄올", "1-부탄올", "n-부탄올"],
  ["110-82-7", "사이클로헥세인", "시클로헥산", "사이클로헥산"],
  ["8032-32-4", "석유에테르", "석유 에테르", "페트롤리움 에테르"],
  ["1330-20-7", "자일렌", "크실렌", "키실렌"],
  ["71-43-2", "벤젠"],
  ["75-05-8", "아세토나이트릴", "아세토니트릴"],
  ["109-99-9", "테트라하이드로퓨란", "테트라히드로푸란", "THF"],
  ["142-82-5", "헵테인", "헵탄", "n-헵테인", "n-헵탄"],
  ["109-66-0", "펜테인", "펜탄", "n-펜테인", "n-펜탄"],
];

const FLAMMABLE_CAS = new Set(FLAMMABLE_ROWS.map(([cas]) => cas));
const FLAMMABLE_NAMES = new Set(FLAMMABLE_ROWS.flatMap(([, ...names]) => names.map((n) => aliasKey(n))));

/** 학교 상용 인화성 액체 CAS 목록 (확인용) */
export const FLAMMABLE_CAS_LIST: readonly string[] = [...FLAMMABLE_CAS];

export type StorageClassIdent = {
  name?: string | null;
  cas?: string | null;
  /** MSDS 유해 문구 코드 (예: "H225") — 있으면 인화성 판정에 쓴다 */
  hazardCodes?: readonly string[] | null;
};

/** 인화성 액체인가 — 유해 문구 H224·H225·H226, 또는 CAS·이름(정리한 이름 포함)이 학교 상용 인화성 표에 있다 */
export function isFlammableReagent(ident: StorageClassIdent): boolean {
  if (ident.hazardCodes?.some((h) => (FLAMMABLE_HAZARD_CODES as readonly string[]).includes(h.trim().toUpperCase()))) return true;
  const cas = ident.cas?.trim();
  if (cas && FLAMMABLE_CAS.has(cas)) return true;
  // 서류 품명에 붙은 규격·수량("500mL", "1L x 2", "25 g")은 떼고 견준다
  const name = ident.name
    ?.normalize("NFKC")
    .replace(/\d+(?:[.,]\d+)?\s*(?:ml|l|g|kg|mg|ea|병|개|통|박스|box)(?![a-z가-힣])/gi, " ")
    .replace(/(?:^|\s)[x×*]\s*\d+(?=\s|$)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) return false;
  if (FLAMMABLE_NAMES.has(aliasKey(name))) return true;
  const cleaned = cleanReagentName(name);
  if (cleaned && FLAMMABLE_NAMES.has(aliasKey(cleaned))) return true;
  const aliasCas = lookupAliasCas(name);
  return aliasCas !== null && FLAMMABLE_CAS.has(aliasCas);
}

function toClass(v: unknown): StorageClass | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return (STORAGE_CLASSES as readonly string[]).includes(t) ? (t as StorageClass) : null;
}

/** 인화성에 자리를 내주는 분류 — 유기(인화성이 먼저)·기타·없음 */
const YIELDS_TO_FLAMMABLE: readonly (StorageClass | null)[] = ["유기", "기타", null];

/**
 * 보관 분류 추천 (서류 입고 suggestedClass): 인화성 액체면 유기·기타·없음 대신 "인화성".
 * 산·염기·산화제·독성·무기염 등 다른 분류를 받았으면 그대로 둔다.
 */
export function suggestStorageClass(suggested: unknown, ident: StorageClassIdent): StorageClass | null {
  const cls = toClass(suggested);
  if (YIELDS_TO_FLAMMABLE.includes(cls) && isFlammableReagent(ident)) return "인화성";
  return cls;
}

/**
 * 위치 추천에 쓰는 분류 (d7 §17): 저장된 분류가 없으면 없음(추천 없음 — §17 그대로),
 * 저장된 분류가 유기·기타인 인화성 액체는 "인화성"으로 본다 (서류 입고와 같은 규칙).
 */
export function effectiveStorageClass(stored: unknown, ident: StorageClassIdent): StorageClass | null {
  // 저장된 값은 정확히 같은 글자만 분류로 본다 (앞뒤 공백·모르는 값 = 분류 없음, §17 그대로)
  if (typeof stored !== "string" || !(STORAGE_CLASSES as readonly string[]).includes(stored)) return null;
  const cls = stored as StorageClass;
  return suggestStorageClass(cls, ident);
}

/** 서류 입고 AI 프롬프트에 넣는 분류 규칙 한 줄 (lib/server/gemini.ts) */
export const STORAGE_CLASS_PROMPT_RULE =
  "보관 분류는 인화성이 유기보다 먼저입니다: 인화성 액체(GHS H224·H225·H226 — 아세톤·에탄올·메탄올·아이소프로필알코올·에테르·헥세인·톨루엔·아세트산에틸 등)는 유기가 아니라 인화성으로 추천합니다.";
