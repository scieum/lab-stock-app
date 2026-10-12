// 영문 문서 → 한국어 시약명 (d7 §27). 화면·서버 공용 순수 함수 — 환경변수·네트워크를 쓰지 않는다.
// - AI 구조화 출력의 originalName(문서 표기)·cas(문서에 보인 CAS) 검사
// - AI 가 한국어로 바꾸지 못한 이름(한글 없이 영문만)을 학교 상용 이름 표(lib/msds-aliases)·CAS 로 한 번 더 한국어로.
//   못 찾으면 영문 그대로 둔다(사용자가 고친다).
// 상대 import 만 쓴다 (vitest 는 @/ 별칭이 없다).
import { aliasKey, koreanNameForCas, lookupEnglishAliasCas } from "./msds-aliases";
import { isCasChecksumValid } from "./msds-rules";

const HANGUL = /[가-힣]/;

/** 한글이 하나라도 있는가 */
export function hasHangul(s: string): boolean {
  return HANGUL.test(s);
}

/** 한글이 없고 영문 글자가 있는 이름 ("Sodium chloride", "NaCl") */
export function isLatinOnlyName(s: string): boolean {
  return !HANGUL.test(s) && /[A-Za-z]/.test(s);
}

function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * CAS 칸 검사: "CAS 7647-01-0" · "CAS No.: 7647-01-0" 처럼 앞에 붙은 표기는 떼고,
 * 숫자-숫자-숫자 꼴 + 검사 숫자가 맞을 때만 그 값. 그 밖은 null (추측한 값·틀린 값은 버린다).
 */
export function cleanCas(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v
    .normalize("NFKC")
    .trim()
    .replace(/^cas(?:\s*(?:no\.?|number|번호|#))?\s*[:：]?\s*/i, "")
    .trim();
  return isCasChecksumValid(t) ? t : null;
}

/* ───────── 영문 이름 정리 ───────── */

// 농도: 0.1 M · 1 N · 35% · 0.1 mol/L · 10 mM · 5 ppm (뒤에 w/v 등)
const EN_CONC =
  /(?<![a-z\d.])\d+(?:\.\d+)?\s*(?:mol\/l|mol\/dm3|mmol\/l|mm|m|n|%|ppm)(?:\s*\(?(?:w\/v|v\/v|w\/w)\)?)?(?![a-z\d])/gi;
// 규격: 500 mL · 25 g · 1 kg · 500mL x 4
const EN_SIZE = /(?<![a-z\d.])\d+(?:\.\d+)?\s*(?:ml|l|g|kg|mg)(?:\s*[x×*]\s*\d+)?(?![a-z\d])/gi;
// 등급·형태 표기 (떼도 물질이 바뀌지 않는 말)
const EN_NOISE =
  /(?<![a-z])(?:acs|ar|gr|ep|cp|lr|usp|p\.a\.|pa|reagent|grade|analytical|extra|pure|purified|laboratory|lab|solution|soln\.?|aqueous|aq\.?|powder|powdered|granular|granules|crystals?|crystalline|pellets|flakes|beads|solid|liquid|for|use|indicator)(?![a-z])/gi;
const EN_DILUTE = /(?<![a-z])(?:dilute|diluted|dil\.?)(?![a-z])/gi;
const EN_CONCENTRATED = /(?<![a-z])(?:concentrated|conc\.?)(?![a-z])/gi;
const EN_ANHYDROUS = /(?<![a-z])(?:anhydrous|absolute)(?![a-z])/gi;
const EN_PARENS_NON_OXIDATION = /\((?!\s*(?:i{1,3}|iv|v|vi{0,3}|ix|x)\s*\))[^()]*\)/gi;

/** 농도 표기만 모은 것: "Hydrochloric acid 0.1 M" → "0.1M" (없으면 "") */
function englishConcText(s: string): string {
  return (s.match(EN_CONC) ?? []).map((m) => m.replace(/[\s()]/g, "")).join(", ");
}

function squash(s: string): string {
  return s.replace(/\(\s*\)/g, " ").replace(/[,;]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * 영문 이름 → 한국어 이름 (상용 이름 표·CAS). 못 찾으면 null.
 * 1) cas 가 표에 있으면 그 대표 이름 2) 농도·규격·등급·형태 표기를 뗀 영문 이름이 영문 표에 있으면 그 CAS 의 대표 이름
 * 3) "dilute"·"concentrated"·"anhydrous" 까지 떼고 다시. 농도는 숫자·단위 그대로 괄호로 붙이고(염산(0.1M)),
 * dilute → "묽은 ", concentrated → "진한 " 을 앞에 붙인다.
 */
export function koreanNameFromAliases(name: string, cas?: string | null): string | null {
  const src = name.normalize("NFKC");
  const conc = englishConcText(src);
  const dilute = EN_DILUTE.test(src);
  EN_DILUTE.lastIndex = 0;
  const concentrated = EN_CONCENTRATED.test(src);
  EN_CONCENTRATED.lastIndex = 0;

  let base = koreanNameForCas(cleanCas(cas ?? null));
  if (!base) {
    // 화학식 괄호("Ca(OH)2")를 지키려고 먼저 농도·규격만 뗀 이름으로, 그다음 괄호·등급·형태 표기까지 뗀 이름으로
    const plain = squash(src.replace(EN_SIZE, " ").replace(EN_CONC, " "));
    const stripped = squash(plain.replace(EN_PARENS_NON_OXIDATION, " ").replace(EN_NOISE, " "));
    const tries = [plain, stripped, squash(stripped.replace(EN_DILUTE, " ").replace(EN_CONCENTRATED, " ").replace(EN_ANHYDROUS, " "))];
    for (const t of tries) {
      if (t === "") continue;
      const hit = koreanNameForCas(lookupEnglishAliasCas(t));
      if (hit) {
        base = hit;
        break;
      }
    }
  }
  if (!base) return null;
  const prefix = dilute && !base.startsWith("묽은") ? "묽은 " : concentrated && !base.startsWith("진한") ? "진한 " : "";
  return `${prefix}${base}${conc ? `(${conc})` : ""}`;
}

export type LocalizedName = {
  /** 표에 보일 이름 (한국어, 못 바꾸면 영문 그대로) */
  name: string;
  /** 문서 표기 (문서가 한국어이거나 name 과 같으면 null) */
  originalName: string | null;
  /** 문서에 보인 CAS (형식·검사 숫자가 맞을 때만) */
  cas: string | null;
};

/**
 * AI 가 준 한 줄의 이름 정리 (d7 §27). name 은 이미 공백 정리한 1자 이상 값.
 * - cas: cleanCas. originalName: 공백 정리·max 자까지, 비었거나 한글이 있거나 name 과 같으면(공백·대소문자 무시) null.
 * - name 에 한글이 없고 영문만이면 상용 이름 표·CAS 로 한국어 이름을 찾는다(name → originalName 순).
 *   찾으면 name = 한국어 이름, originalName 이 비었으면 원래 영문 name 을 originalName 으로 남긴다.
 */
export function localizeReagentName(name: string, rawOriginal: unknown, rawCas: unknown, max: number): LocalizedName {
  const cas = cleanCas(rawCas);
  let original = cleanText(rawOriginal, max);
  let out = name;
  if (isLatinOnlyName(name)) {
    const ko =
      koreanNameFromAliases(name, cas) ?? (original !== "" && isLatinOnlyName(original) ? koreanNameFromAliases(original, cas) : null);
    if (ko) {
      if (original === "") original = name;
      out = ko.slice(0, max);
    }
  }
  const originalName = original === "" || hasHangul(original) || aliasKey(original) === aliasKey(out) ? null : original;
  return { name: out, originalName, cas };
}
