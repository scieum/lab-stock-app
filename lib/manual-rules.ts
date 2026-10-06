// 화면 5 실험 매뉴얼 규칙 (harness/d7-data.md §13). 클라이언트·서버 공용 순수 함수.
// 서버(추출 API·DB 함수 save_reorder_basis)가 같은 검사를 다시 한다 — 여기는 화면 안내와 추출 결과 정리용.

/* ───────── 파일 ───────── */

export const MANUAL_FILE_MAX_BYTES = 4 * 1024 * 1024;
export const MANUAL_FILE_MIME = ["application/pdf", "image/jpeg", "image/png"] as const;
/** <input type="file" accept> 값 */
export const MANUAL_FILE_ACCEPT = MANUAL_FILE_MIME.join(",");

export const MANUAL_FILE_ERRORS = {
  type: "PDF, JPG, PNG 파일만 올릴 수 있어요",
  size: "파일이 너무 커요. 4MB 이하로 올려 주세요",
  empty: "빈 파일이에요. 다른 파일을 골라 주세요",
} as const;

export type ManualFileKind = "pdf" | "image";
export type ManualFileLike = { name: string; type?: string | null; size: number };

const EXT_MIME: Record<string, (typeof MANUAL_FILE_MIME)[number]> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

function extensionOf(name: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(name.trim());
  return m ? m[1].toLowerCase() : "";
}

/**
 * 파일의 MIME (PDF·JPG·PNG 가 아니면 null).
 * - 확장자가 pdf·jpg·jpeg·png 여야 한다.
 * - 브라우저가 MIME 을 알려 주면(type 이 비어 있지 않으면) 그 값이 확장자와 같은 형식이어야 한다.
 *   (type 이 빈 문자열이면 확장자만 본다 — 일부 환경에서 type 이 비어 온다)
 */
export function manualFileMime(file: Pick<ManualFileLike, "name" | "type">): (typeof MANUAL_FILE_MIME)[number] | null {
  const byExt = EXT_MIME[extensionOf(file.name)];
  if (!byExt) return null;
  const type = (file.type ?? "").trim().toLowerCase();
  if (type === "") return byExt;
  // image/jpg 는 표준이 아니지만 가끔 온다
  const normalized = type === "image/jpg" ? "image/jpeg" : type;
  return normalized === byExt ? byExt : null;
}

/** 미리보기 종류: PDF 는 문서 자리 표시, 이미지는 썸네일. 허용 형식이 아니면 null */
export function manualFileKind(file: Pick<ManualFileLike, "name" | "type">): ManualFileKind | null {
  const mime = manualFileMime(file);
  if (!mime) return null;
  return mime === "application/pdf" ? "pdf" : "image";
}

/** 파일 검사: 통과하면 null, 아니면 사용자에게 보일 문구 (형식 → 빈 파일 → 크기 순) */
export function validateManualFile(file: ManualFileLike): string | null {
  if (!manualFileMime(file)) return MANUAL_FILE_ERRORS.type;
  if (!Number.isFinite(file.size) || file.size <= 0) return MANUAL_FILE_ERRORS.empty;
  if (file.size > MANUAL_FILE_MAX_BYTES) return MANUAL_FILE_ERRORS.size;
  return null;
}

/* ───────── 조 수 ───────── */

export const GROUPS_MIN = 1;
export const GROUPS_MAX = 20;
export const GROUPS_ERROR = `조 수는 ${GROUPS_MIN}~${GROUPS_MAX} 사이 숫자로 입력해 주세요`;

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

/** 조 수: 1~20 정수. 문자열은 숫자만("6", " 6 ") 받는다 ("6.0"·"6조"·"" 는 거부) */
export function checkGroups(input: unknown): Checked<number> {
  let n: number;
  if (typeof input === "number") n = input;
  else if (typeof input === "string" && /^\d{1,3}$/.test(input.trim())) n = Number(input.trim());
  else return { ok: false, error: GROUPS_ERROR };
  if (!Number.isInteger(n) || n < GROUPS_MIN || n > GROUPS_MAX) return { ok: false, error: GROUPS_ERROR };
  return { ok: true, value: n };
}

/* ───────── 수량 (소수 3자리까지, 정수 1000배로 계산해 부동소수 오차를 없앤다) ───────── */

export const AMOUNT_DECIMALS = 3;
export const AMOUNT_MAX = 1_000_000;
const SCALE = 10 ** AMOUNT_DECIMALS;

/** 0.1 → 100 (1000배 정수). 소수 3자리 아래는 반올림 */
function toScaled(n: number): number {
  return Math.round(n * SCALE);
}

function fromScaled(n: number): number {
  return n / SCALE;
}

/**
 * 사용량 입력값 → 숫자. 0보다 크고 1,000,000 이하, 소수 3자리까지("50", "0.5", " 2 ").
 * 쉼표·단위·음수·지수 표기·빈 값은 null.
 */
export function parseAmount(text: unknown): number | null {
  if (typeof text === "number") {
    if (!Number.isFinite(text) || text <= 0 || text > AMOUNT_MAX) return null;
    const scaled = toScaled(text);
    return scaled > 0 ? fromScaled(scaled) : null;
  }
  if (typeof text !== "string") return null;
  const t = text.trim();
  if (!/^\d+(\.\d{1,3})?$/.test(t)) return null;
  const n = Number(t);
  if (!(n > 0) || n > AMOUNT_MAX) return null;
  return n;
}

/** 필요량 = 1조 사용량 × 조 수 (0.1 × 3 = 0.3 — 0.30000000000000004 가 아니다) */
export function requiredAmount(perGroup: number, groups: number): number {
  return fromScaled(toScaled(perGroup) * groups);
}

const amountFmt = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: AMOUNT_DECIMALS });

/** 화면 표시: "300 mL" · "1,200 g" · "0.3 g" (단위가 없으면 숫자만) */
export function formatAmountText(value: number, unit: string): string {
  const n = amountFmt.format(fromScaled(toScaled(value)));
  return unit ? `${n} ${unit}` : n;
}

/** 입력 칸에 넣을 값: 50 → "50", 0.5 → "0.5" (쉼표 없음) */
export function amountInputText(value: number | null): string {
  if (value === null) return "";
  return String(fromScaled(toScaled(value)));
}

/* ───────── 단위 ───────── */

export const MANUAL_UNITS = ["병", "mL", "g"] as const;
export type ManualUnit = (typeof MANUAL_UNITS)[number];

export function isManualUnit(v: unknown): v is ManualUnit {
  return typeof v === "string" && (MANUAL_UNITS as readonly string[]).includes(v);
}

/** 표기 → [단위, 곱할 값]. 키는 소문자·공백 없는 표기 */
const UNIT_TABLE: Record<string, [ManualUnit, number]> = {
  ml: ["mL", 1],
  "㎖": ["mL", 1],
  "mℓ": ["mL", 1],
  cc: ["mL", 1],
  밀리리터: ["mL", 1],
  l: ["mL", 1000],
  "ℓ": ["mL", 1000],
  리터: ["mL", 1000],
  liter: ["mL", 1000],
  litre: ["mL", 1000],
  g: ["g", 1],
  그램: ["g", 1],
  gram: ["g", 1],
  grams: ["g", 1],
  kg: ["g", 1000],
  "㎏": ["g", 1000],
  킬로그램: ["g", 1000],
  mg: ["g", 0.001],
  "㎎": ["g", 0.001],
  밀리그램: ["g", 0.001],
  병: ["병", 1],
  bottle: ["병", 1],
  bottles: ["병", 1],
};

export type NormalizedAmount = {
  /** 환산한 수량 (숫자가 아니거나 0 이하·환산 후 0.001 미만이면 null — 사용자가 채운다) */
  amount: number | null;
  /** 병·mL·g 중 하나. 그 밖의 단위(방울·스푼·개 …)·빈 값은 "" (미확정 — 사용자가 고른다) */
  unit: ManualUnit | "";
};

/**
 * 추출 단위 정리 (d7 §13): L→mL ×1000, kg→g ×1000, mg→g ÷1000, "ml"·"ML"·"㎖"·"cc" → mL.
 * 대소문자·앞뒤 공백·끝의 마침표는 무시. 표에 없는 단위는 미확정("")이고 수량은 그대로 둔다.
 */
export function normalizeUnit(amount: unknown, unit: unknown): NormalizedAmount {
  const n = typeof amount === "number" ? amount : typeof amount === "string" && amount.trim() !== "" ? Number(amount) : Number.NaN;
  const valid = Number.isFinite(n) && n > 0;
  const key = typeof unit === "string" ? unit.normalize("NFC").trim().toLowerCase().replace(/[\s.]/g, "") : "";
  const hit = UNIT_TABLE[key];
  if (!hit) return { amount: valid ? parseAmount(n) : null, unit: "" };
  const [u, factor] = hit;
  if (!valid) return { amount: null, unit: u };
  // 곱셈 오차를 피하려고 ÷1000 은 나눗셈으로 한다
  const converted = factor === 0.001 ? n / 1000 : n * factor;
  return { amount: parseAmount(converted), unit: u };
}

/* ───────── 시약명 자동 연결 ───────── */

export type ManualReagent = {
  id: string;
  name: string;
  /** 우리 학교 시약의 단위 (병·mL·g) */
  unit: string;
  /** 지금의 재주문 기준 (0 = 기준 없음) */
  minStock: number;
  /**
   * 지금 기준의 출처 (reagents.min_stock_source, d7 §11-1). 'auto' 면 저장하면 필요량으로 항상 바뀐다.
   * 없으면 기존 규칙(더 큰 값만)으로 본다.
   */
  source?: "auto" | "basis" | "manual";
};

/*
 * 자동 연결 규칙 (d7 §13 "이름이 같거나 비슷한 것" 을 좁게 해석한다).
 *
 * 원칙: 자동 연결은 "같은 물질임이 표기 차이로만 설명되는 경우"에만 한다.
 *       잘못 연결하면 엉뚱한 시약에 재주문 기준이 저장되므로, 애매하면 연결하지 않는다(사용자가 표에서 직접 고른다).
 *
 * 견주는 값 두 가지:
 *   열쇠(reagentNameKey)  공백·대소문자·문장부호·농도 표기·끝의 "용액/수용액"을 무시한 이름
 *   핵심 이름(coreNameKey) 열쇠에서 "물질을 바꾸지 않는" 꾸밈말·표기까지 떼어 낸 이름
 *
 * 떼는 것 (양쪽 이름 모두에서):
 *   - 농도 표기: 숫자 + M·N·mol/L·%·wt%·w/v%·v/v%·ppm·몰·몰농도·노르말, 괄호 안 농도 "(0.1M)"
 *   - 앞 꾸밈말: 묽은·진한·무수·정제·고체·액체·분말·결정·포화 (여러 개 겹쳐도 됨)
 *   - 뒤 표기: 용액·수용액, 수화물(수화물·일~십이수화물·"5수화물"·"n수화물"·"·5H2O")
 *   - 등급 표기: EP·GR·CP(뒤에 "급"·"등급" 가능), 1급·일급·특급(앞에 "시약" 가능), 시약급, 시약용
 *
 * 떼지 않는 것 (다르면 다른 시약):
 *   - 산화수 괄호 "(I)"·"(II)"·"(III)"… — 이름의 일부다. 열쇠 안에 "<ii>" 토큰으로 남긴다.
 *     서로 다르면 연결하지 않고, 한쪽에만 있어도 연결하지 않는다("산화구리" ↔ "산화구리(II)" 미연결).
 *   - 그 밖의 모든 글자. "한쪽 이름이 다른 쪽을 포함한다"는 것만으로는 연결하지 않는다
 *     ("황산" ↔ "황산구리", "질산" ↔ "질산은", "나트륨" ↔ "수산화나트륨", "에탄올" ↔ "에탄올아민" 미연결).
 *   - "무수" 뒤의 이름이 "산"으로 끝날 때의 "무수" — 산 무수물은 다른 물질이다("무수아세트산" ≠ "아세트산").
 *   - 떼고 남는 이름이 2자 미만이 되는 경우("정제수" 를 "수" 로 만들지 않는다. 그래서 "분말 철" ↔ "철" 도 미연결).
 *
 * 한계:
 *   - 별칭·화학식·영문명은 잇지 못한다("가성소다" ↔ "수산화나트륨", "NaOH", "에탄올" ↔ "ethanol").
 *   - 산화수는 괄호 안 로마 숫자(I~X)만 알아본다("황산구리 II", "황산구리(2)" 는 그냥 다른 글자로 본다 → 미연결 쪽).
 *   - 농도 표기는 앞 글자와 띄어 쓰거나 괄호에 넣은 것만 알아본다("염산0.1M" 은 못 지운다 → 미연결 쪽).
 *   - 농도만 다른 시약("염산 0.1M" ↔ "염산 1M")은 같은 물질로 보아 연결한다(농도까지 같은 후보가 있으면 그것이 먼저).
 */

// 농도 표기: 숫자 + M · N · mol/L · % · wt% · ppm · 몰 · 노르말 (뒤에 "수용액"·"용액"이 붙어도 됨)
const CONC = String.raw`(?:약\s*)?\d+(?:\.\d+)?\s*(?:mol\/l|wt\s*%|w\/v\s*%|v\/v\s*%|ppm|%|m|n|몰농도|몰|노르말)`;
const CONC_IN_PARENS = new RegExp(String.raw`[(（\[]\s*${CONC}\s*(?:수용액|용액)?\s*[)）\]]`, "g");
const CONC_TOKEN = new RegExp(String.raw`(?<![a-z가-힣\d.])${CONC}(?![a-z가-힣\d])`, "g");
// 산화수 괄호: (I)~(X). NFKC 뒤라 "Ⅱ"·전각 괄호도 여기로 온다
const OXIDATION = /[(\[]\s*(viii|vii|vi|iv|ix|iii|ii|i|v|x)\s*[)\]]/g;
// 공백·문장부호 ("<" ">" 는 산화수 토큰이라 남긴다)
const PUNCT = /[\s()[\]{}\-·ㆍ,./_:;'"]/g;
// "·5H2O" 류 (가운뎃점·마침표·별표 뒤)
const HYDRATE_FORMULA = /[·ㆍ‧・•.*]\s*\d*\s*h2o(?![a-z\d])/g;
// 등급 표기
const GRADE = /(?<![a-z\d])(?:ep|gr|cp)(?:\s*(?:등급|급))?(?![a-z\d])|(?:시약\s*)?(?:(?<![\d.])1\s*급|일급|특급)|시약급|시약용/g;
// 뒤 표기 (앞에 2자 이상 남을 때만)
const CORE_SUFFIX = /(?<=.{2})(?:수용액|용액|(?:[일이삼사오육칠팔구]|십[일이]?|\d+|n)?수화물)$/;
// 앞 꾸밈말 (뒤에 2자 이상 남을 때만). "무수"는 따로 본다
const CORE_PREFIX = /^(?:묽은|진한|정제|고체|액체|분말|결정|포화)(?=.{2})/;
const ANHYDROUS = /^무수(?=.{2})/;

/** NFKC·소문자, 산화수 괄호 → "<ii>" 토큰, 농도 표기 제거 (공백·문장부호는 아직 남아 있다) */
function baseName(name: string): string {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(OXIDATION, "<$1>")
    .replace(CONC_IN_PARENS, " ")
    .replace(CONC_TOKEN, " ");
}

/**
 * 시약명을 견주는 열쇠로 만든다.
 * 1) 전각→반각(NFKC), 소문자
 * 2) 산화수 괄호는 이름의 일부로 남긴다: "(II)" → "<ii>" ("황산구리(II)" 와 "황산구리(I)"·"황산구리" 는 서로 다른 열쇠)
 * 3) 괄호 안이 농도 표기뿐이면 괄호째 지운다: "염산(0.1M)" → "염산"
 * 4) 홀로 있는 농도 표기를 지운다: "염산 0.1M"·"에탄올 95%" → "염산"·"에탄올"
 * 5) 공백과 문장부호( ( ) [ ] - · , . / )를 지운다: "황산구리(II) 오수화물" → "황산구리<ii>오수화물"
 * 6) 끝의 "수용액"·"용액"을 지운다(남는 글자가 있을 때만): "수산화나트륨 수용액" → "수산화나트륨"
 */
export function reagentNameKey(name: string): string {
  return baseName(name)
    .replace(PUNCT, "")
    .replace(/(.)(?:수용액|용액)$/, "$1");
}

/** 핵심 이름: 열쇠에서 등급·수화물·용액 표기와 앞 꾸밈말까지 뗀 것 (무엇을 떼는지는 위 규칙 주석) */
function coreNameKey(name: string): string {
  let s = baseName(name).replace(HYDRATE_FORMULA, " ").replace(GRADE, " ").replace(PUNCT, "");
  // 뒤 표기를 먼저 다 떼고(용액·수화물이 겹칠 수 있다), 그다음 앞 꾸밈말을 뗀다
  for (let next = s.replace(CORE_SUFFIX, ""); next !== s; next = s.replace(CORE_SUFFIX, "")) s = next;
  for (;;) {
    let next = s.replace(CORE_PREFIX, "");
    // 산 무수물("무수아세트산")은 다른 물질이라 "무수"를 떼지 않는다
    if (next === s && ANHYDROUS.test(s) && !s.endsWith("산")) next = s.replace(ANHYDROUS, "");
    if (next === s) break;
    s = next;
  }
  return s;
}

/** 농도는 남기고 공백·대소문자만 무시한 열쇠 (같은 이름 후보가 여럿일 때 농도까지 같은 것을 먼저 고른다) */
function rawNameKey(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(/\s/g, "");
}

/** 이름에 적힌 농도 표기만 모은 것: "묽은 염산(0.1M)" → "0.1m", 없으면 "" */
function concKey(name: string): string {
  const s = name.normalize("NFKC").toLowerCase();
  const found = [...(s.match(CONC_IN_PARENS) ?? []), ...(s.replace(CONC_IN_PARENS, " ").match(CONC_TOKEN) ?? [])];
  return found
    .map((m) => m.replace(/[\s()[\]약]|수용액|용액/g, ""))
    .sort()
    .join("|");
}

/**
 * 추출한 시약명 → 우리 학교 시약 하나 (없으면 null). 사용자가 표에서 바꿀 수 있는 "제안"이다.
 * 무엇을 같은 이름으로 보는지는 위 "자동 연결 규칙" 주석.
 *
 * 1순위 완전 일치: 열쇠(reagentNameKey)가 같은 시약.
 * 2순위 핵심 이름 일치: 허용된 꾸밈말·표기를 뗀 핵심 이름이 같은 시약
 *        ("염산" ↔ "묽은 염산", "황산구리(II)" ↔ "황산구리(II) 오수화물" 은 연결,
 *         "황산" ↔ "황산구리", "황산구리(II)" ↔ "황산구리(I)", "산화구리" ↔ "산화구리(II)" 는 연결하지 않음)
 * 3순위 없음: null. (포함 관계만으로는 연결하지 않는다)
 *
 * 같은 순위에 후보가 여럿이면 가장 가까운 것:
 *   ① 농도까지 같은 이름(공백·대소문자만 무시) → ② 농도 표기가 같은 것 → ③ 꾸밈말 차이가 적은 것(열쇠 길이 차이)
 *   → ④ 이름 가나다순 → ⑤ id 순.
 */
export function matchReagent<T extends Pick<ManualReagent, "id" | "name">>(name: string, reagents: readonly T[]): T | null {
  const key = reagentNameKey(name);
  if (key === "") return null;
  const raw = rawNameKey(name);
  const conc = concKey(name);

  const pick = (candidates: { r: T; k: string }[]): T | null => {
    if (candidates.length === 0) return null;
    const sorted = [...candidates].sort((a, b) => {
      const ra = rawNameKey(a.r.name) === raw ? 0 : 1;
      const rb = rawNameKey(b.r.name) === raw ? 0 : 1;
      if (ra !== rb) return ra - rb;
      const ca = concKey(a.r.name) === conc ? 0 : 1;
      const cb = concKey(b.r.name) === conc ? 0 : 1;
      if (ca !== cb) return ca - cb;
      const da = Math.abs(a.k.length - key.length);
      const db = Math.abs(b.k.length - key.length);
      if (da !== db) return da - db;
      const byName = a.r.name.localeCompare(b.r.name, "ko");
      if (byName !== 0) return byName;
      return a.r.id < b.r.id ? -1 : a.r.id > b.r.id ? 1 : 0;
    });
    return sorted[0].r;
  };

  const keyed = reagents.map((r) => ({ r, k: reagentNameKey(r.name) })).filter((c) => c.k !== "");
  const exact = pick(keyed.filter((c) => c.k === key));
  if (exact) return exact;

  const core = coreNameKey(name);
  if (core === "") return null;
  return pick(keyed.filter((c) => coreNameKey(c.r.name) === core));
}

/* ───────── 추출 결과 → 확인 표의 행 ───────── */

export const EXTRACTION_ROWS_MAX = 50;
export const EXTRACTION_NAME_MAX = 80;

/** AI 가 준 한 줄 (형식을 믿지 않는다) */
export type ExtractedItem = { name?: unknown; amount?: unknown; unit?: unknown };

export type ExtractionRow = {
  id: string;
  /** 추출한 시약명 (고치지 않는다) */
  name: string;
  /** 1조 사용량 입력값 (사용자가 고치는 문자열) */
  perGroup: string;
  /** 처음 추출한 1조 사용량 (환산 후). 못 읽었으면 null — perGroup 과 다르면 "고친 칸" */
  extractedPerGroup: number | null;
  /** 단위 (미확정이면 "") */
  unit: ManualUnit | "";
  /** 연결한 우리 학교 시약 (없으면 null = 등록되지 않은 시약, 저장에서 빠진다) */
  reagentId: string | null;
  /**
   * 이 행으로 합친 추출 행 수 (d7 §13 중복 합치기). 1 = 합치지 않음, 2 이상이면 화면이 "N개 행을 합쳤어요" 를 보인다.
   * 없으면 1 로 본다.
   */
  mergedCount?: number;
};

/** 추출 행 합치기 안내 (mergedCount ≥ 2 일 때만, 아니면 null) */
export function mergedRowsText(row: Pick<ExtractionRow, "mergedCount">): string | null {
  const n = row.mergedCount ?? 1;
  return n >= 2 ? `${n}개 행을 합쳤어요` : null;
}

/**
 * 추출 결과 정리: 이름이 빈 줄은 버리고(이름은 80자까지), 단위를 병·mL·g 로 정리·환산하고,
 * 우리 학교 시약과 자동 연결한다. 최대 50행. 행 id 는 "row-1" 부터.
 *
 * 중복 합치기 (d7 §13): 시약명 열쇠(reagentNameKey)와 정리한 단위가 같은 행은 한 줄로 합친다.
 *   - 1조 사용량 = 수량이 있는 행들의 합 (수량을 못 읽은 행은 합에서 빠지지만 행은 흡수된다).
 *     모두 수량이 없으면 null. 합이 상한(1,000,000)을 넘으면 null (사용자가 채운다).
 *   - 이름·연결 시약은 처음 나온 행의 것, 순서도 처음 나온 순서.
 *   - 단위가 다르거나 단위가 미확정("")이면 합치지 않는다. 열쇠가 빈 이름도 합치지 않는다.
 *   - 합친 행 수는 mergedCount 에 남긴다.
 */
export function normalizeExtraction(items: readonly ExtractedItem[], reagents: readonly ManualReagent[]): ExtractionRow[] {
  type Acc = { name: string; unit: ManualUnit | ""; scaled: number | null; count: number; reagentId: string | null };
  const groups: Acc[] = [];
  const byKey = new Map<string, Acc>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const name = typeof item.name === "string" ? item.name.replace(/\s+/g, " ").trim().slice(0, EXTRACTION_NAME_MAX) : "";
    if (name === "") continue;
    const { amount, unit } = normalizeUnit(item.amount, item.unit);
    const nameKey = reagentNameKey(name);
    const mergeKey = nameKey !== "" && unit !== "" ? `${nameKey}\u0000${unit}` : null;
    const hit = mergeKey ? byKey.get(mergeKey) : undefined;
    if (hit) {
      hit.count += 1;
      if (amount !== null) hit.scaled = (hit.scaled ?? 0) + toScaled(amount);
      continue;
    }
    if (groups.length >= EXTRACTION_ROWS_MAX) continue;
    const acc: Acc = {
      name,
      unit,
      scaled: amount === null ? null : toScaled(amount),
      count: 1,
      reagentId: matchReagent(name, reagents)?.id ?? null,
    };
    groups.push(acc);
    if (mergeKey) byKey.set(mergeKey, acc);
  }
  return groups.map((g, i) => {
    const amount = g.scaled === null ? null : parseAmount(fromScaled(g.scaled));
    return {
      id: `row-${i + 1}`,
      name: g.name,
      perGroup: amountInputText(amount),
      extractedPerGroup: amount,
      unit: g.unit,
      reagentId: g.reagentId,
      mergedCount: g.count,
    };
  });
}

/** 사용자가 고친 칸인가 (추출값과 숫자가 다르다 — "50" 과 "50.0" 은 같은 값) */
export function isAmountEdited(row: Pick<ExtractionRow, "perGroup" | "extractedPerGroup">): boolean {
  const now = parseAmount(row.perGroup);
  if (row.extractedPerGroup === null) return row.perGroup.trim() !== "";
  return now === null || toScaled(now) !== toScaled(row.extractedPerGroup);
}

/* ───────── 행 상태 · 저장 항목 ───────── */

/**
 * ok        저장할 수 있다
 * unlinked  연결한 시약이 없다 — 저장에서 빠진다 (오류 아님)
 * amount    사용량이 숫자가 아니다 (오류)
 * unit      단위를 고르지 않았다 (오류)
 * mismatch  단위가 연결한 시약의 단위와 다르다 (오류)
 */
export type RowStatus = "ok" | "unlinked" | "amount" | "unit" | "mismatch";

export const ROW_MESSAGES = {
  unlinked: "등록되지 않은 시약이에요. 저장에서 빠져요",
  amount: "1조 사용량을 0보다 큰 숫자로 입력해 주세요",
  unit: "단위를 골라 주세요",
} as const;

export function mismatchMessage(reagentUnit: string): string {
  return `우리 학교 시약 단위는 ${reagentUnit}예요. 단위와 사용량을 맞춰 주세요`;
}

export type BasisOutcome = "changed" | "kept";

/**
 * 저장 결과 예측 (save_reorder_basis 와 같은 규칙, d7 §11-1 · §13):
 * 지금 기준이 자동(source = auto)이면 항상 바뀐다. 매뉴얼·직접 입력 기준이면 새 필요량이 더 클 때만 바뀌고
 * 같거나 작으면 유지 (더 큰 값 유지). source 를 모르면 매뉴얼·직접 입력과 같이 본다.
 */
export function basisOutcome(required: number, minStock: number, source?: ManualReagent["source"]): BasisOutcome {
  if (source === "auto") return "changed";
  return toScaled(required) > toScaled(minStock) ? "changed" : "kept";
}

export type RowView = {
  id: string;
  status: RowStatus;
  /** 오류·안내 문구 (ok 면 null) */
  message: string | null;
  /** 연결한 시약 (목록에 없으면 null) */
  reagent: ManualReagent | null;
  /** 이 행의 1반 1회 필요량 (사용량을 못 읽으면 null) */
  required: number | null;
  /** 이 행의 필요량 표시 ("300 mL", 못 읽으면 "-") */
  requiredText: string;
  /** 사용량 칸을 고쳤는가 */
  edited: boolean;
  /** 같은 시약에 연결된 저장 가능한 행 수 (2 이상이면 합쳐서 저장) */
  mergedCount: number;
  /** 합친 필요량 (ok 행만) */
  mergedRequired: number | null;
  /** 기존 기준과 견준 결과 (ok 행만) */
  outcome: BasisOutcome | null;
};

/** save_reorder_basis(p_items) 의 항목 (d7 §13) */
export type SaveItem = { reagent_id: string; per_group: number; groups: number };

export type SavePlan = {
  rows: RowView[];
  /** 저장 항목: ok 행만, 같은 시약은 1조 사용량을 합쳐 1항목 (처음 나온 순서) */
  items: SaveItem[];
  /** 오류 행 id (amount·unit·mismatch) */
  errorRowIds: string[];
  /** 저장에서 빠지는 행 id (unlinked) */
  skippedRowIds: string[];
  canSave: boolean;
  /** 저장할 수 없는 이유 (canSave 면 null) */
  blockReason: string | null;
};

export const SAVE_BLOCK = {
  empty: "찾은 시약이 없어요. 다시 추출해 주세요",
  errors: (n: number) => `고쳐야 할 행이 ${n}개 있어요. 표시된 행을 먼저 맞춰 주세요`,
  none: "저장할 시약이 없어요. 우리 학교 시약을 연결해 주세요",
} as const;

function rowStatus(row: ExtractionRow, reagent: ManualReagent | null, amount: number | null): RowStatus {
  if (!reagent) return "unlinked";
  if (amount === null) return "amount";
  if (row.unit === "") return "unit";
  if (row.unit !== reagent.unit) return "mismatch";
  return "ok";
}

/**
 * 확인 표의 행 상태와 저장 항목을 한 번에 만든다.
 * - 연결된 행만 저장한다. 연결되지 않은 행은 빠진다(오류 아님).
 * - 연결된 행에 오류(사용량·단위 미확정·단위 불일치)가 하나라도 있으면 저장할 수 없다.
 * - 한 시약에 두 행이 연결되면 1조 사용량을 합친다.
 * - 조 수가 1~20 정수가 아니면 저장할 수 없다.
 */
export function planSave(rows: readonly ExtractionRow[], reagents: readonly ManualReagent[], groups: number): SavePlan {
  const groupsOk = checkGroups(groups).ok;
  const byId = new Map(reagents.map((r) => [r.id, r]));

  const base = rows.map((row) => {
    const reagent = row.reagentId ? (byId.get(row.reagentId) ?? null) : null;
    const amount = parseAmount(row.perGroup);
    return { row, reagent, amount, status: rowStatus(row, reagent, amount) };
  });

  // 같은 시약끼리 합산 (1000배 정수)
  const sums = new Map<string, { scaled: number; count: number }>();
  for (const b of base) {
    if (b.status !== "ok" || !b.reagent || b.amount === null) continue;
    const cur = sums.get(b.reagent.id) ?? { scaled: 0, count: 0 };
    sums.set(b.reagent.id, { scaled: cur.scaled + toScaled(b.amount), count: cur.count + 1 });
  }

  const views: RowView[] = base.map(({ row, reagent, amount, status }) => {
    const required = amount !== null && groupsOk ? requiredAmount(amount, groups) : null;
    const sum = status === "ok" && reagent ? sums.get(reagent.id) : undefined;
    const mergedRequired = sum && groupsOk ? fromScaled(sum.scaled * groups) : null;
    const message =
      status === "ok" ? null : status === "mismatch" ? mismatchMessage(reagent?.unit ?? "") : ROW_MESSAGES[status];
    return {
      id: row.id,
      status,
      message,
      reagent,
      required,
      requiredText: required === null ? "-" : formatAmountText(required, row.unit),
      edited: isAmountEdited(row),
      mergedCount: sum?.count ?? 0,
      mergedRequired,
      outcome: mergedRequired !== null && reagent ? basisOutcome(mergedRequired, reagent.minStock, reagent.source) : null,
    };
  });

  const items: SaveItem[] = groupsOk
    ? [...sums.entries()].map(([reagent_id, s]) => ({ reagent_id, per_group: fromScaled(s.scaled), groups }))
    : [];
  const errorRowIds = views.filter((v) => v.status === "amount" || v.status === "unit" || v.status === "mismatch").map((v) => v.id);
  const skippedRowIds = views.filter((v) => v.status === "unlinked").map((v) => v.id);

  let blockReason: string | null = null;
  if (!groupsOk) blockReason = GROUPS_ERROR;
  else if (rows.length === 0) blockReason = SAVE_BLOCK.empty;
  else if (errorRowIds.length > 0) blockReason = SAVE_BLOCK.errors(errorRowIds.length);
  else if (items.length === 0) blockReason = SAVE_BLOCK.none;

  return { rows: views, items, errorRowIds, skippedRowIds, canSave: blockReason === null, blockReason };
}

/**
 * 기존 기준 보조 문구: 기준이 없으면(0) null.
 * 지금 기준이 자동(source = 'auto', d7 §11-1)이면 "자동 기준 N" — 저장하면 항상 바뀐다. 그 밖은 "기존 기준 N".
 */
export function existingBasisText(reagent: Pick<ManualReagent, "minStock" | "unit" | "source">): string | null {
  if (!(reagent.minStock > 0)) return null;
  const label = reagent.source === "auto" ? "자동 기준" : "기존 기준";
  return `${label} ${formatAmountText(reagent.minStock, reagent.unit)}`;
}

/** 기존 기준과 견준 안내: "저장하면 300 mL로 바뀌어요" / "기존 기준이 같거나 더 커서 그대로 둬요" (기준이 없으면 null) */
export function outcomeText(view: Pick<RowView, "outcome" | "mergedRequired" | "reagent">): string | null {
  if (!view.reagent || !(view.reagent.minStock > 0) || view.outcome === null || view.mergedRequired === null) return null;
  return view.outcome === "changed"
    ? `저장하면 ${formatAmountText(view.mergedRequired, view.reagent.unit)}로 바뀌어요`
    : "기존 기준이 같거나 더 커서 그대로 둬요";
}
