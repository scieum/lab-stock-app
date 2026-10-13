/**
 * 시약 전체 삭제 · 기록 삭제 (design/rules.json 1.29 wipe, d7 §29) — 문구와 순수 규칙.
 * admin 만 (R8 교사 0 · R5 학생 0 · 둘러보기 숨김). 서버(DB 함수 wipe_reagents · wipe_records)도 학교명을 다시 확인한다.
 */

/** 학교명 확인 (school-name-confirm): 앞뒤 공백만 정리한다 — 가운데 공백·대소문자·전각 문자는 그대로 */
export function normalizeSchoolName(value: string): string {
  return value.trim();
}

/** 입력한 학교명이 우리 학교명과 정확히 같은가 (앞뒤 공백만 정리) — 빈 칸은 늘 false */
export function schoolNameMatches(input: string, schoolName: string): boolean {
  const a = normalizeSchoolName(input);
  return a.length > 0 && a === normalizeSchoolName(schoolName);
}

/** 학교명 확인 상태: empty = 아직 안 씀 · match = 같음(확인 버튼 켜짐) · mismatch = 다름('학교 이름이 달라요') */
export type SchoolNameState = "empty" | "match" | "mismatch";

export function schoolNameState(input: string, schoolName: string): SchoolNameState {
  if (normalizeSchoolName(input) === "") return "empty";
  return schoolNameMatches(input, schoolName) ? "match" : "mismatch";
}

export const SCHOOL_NAME_TEXT = {
  mismatch: "학교 이름이 달라요",
} as const;

/**
 * 목적격 조사 을/를 — 끝 글자가 한글 음절이면 받침 있음 = '을', 없음 = '를'. 한글이 아니면(영문·숫자·괄호 등) '을(를)'.
 */
export function objectParticle(word: string): "을" | "를" | "을(를)" {
  const last = word.trim().slice(-1);
  const code = last ? last.charCodeAt(0) : 0;
  if (code < 0xac00 || code > 0xd7a3) return "을(를)";
  return (code - 0xac00) % 28 === 0 ? "를" : "을";
}

/** school-name-confirm 위 caption (시안 2-wipe · 10-record-wipe: 학교명을 작은따옴표로 감싸고 조사는 받침대로 — '샘플고등학교'를) */
export function schoolNameConfirmCaption(schoolName: string): string {
  const name = normalizeSchoolName(schoolName);
  return `확인을 위해 학교 이름 '${name}'${objectParticle(name)} 입력하세요`;
}

// ---------- 시약 전체 삭제 (화면 2) ----------

export const REAGENT_WIPE_TEXT = {
  item: "시약 전체 삭제",
  empty: "지울 시약이 없어요",
  body: "목록·시약장·홈·재주문 알림에서 사라지고 되돌릴 수 없어요.",
  note: "사용·입고 기록은 남아요.",
  close: "닫기",
  confirm: "전체 삭제",
} as const;

export function reagentWipeTitle(count: number): string {
  return `시약 ${count.toLocaleString("ko-KR")}종을 모두 삭제할까요?`;
}

export function reagentWipeDoneText(count: number): string {
  return `시약 ${count.toLocaleString("ko-KR")}종을 삭제했어요`;
}

/** 전체 삭제 버튼: 지울 시약이 있고 학교명이 같고 저장 중이 아닐 때만 켜진다 */
export function canWipeReagents(input: { count: number; schoolNameOk: boolean; pending?: boolean }): boolean {
  return input.count > 0 && input.schoolNameOk && !input.pending;
}

// ---------- 기록 삭제 (화면 10) ----------

export const RECORD_WIPE_TEXT = {
  item: "기록 삭제",
  empty: "지울 기록이 없어요",
  title: "기록 삭제",
  rangeLabel: "지울 기간",
  all: "전체",
  before: "이 날짜 이전",
  beforeNote: "이 날짜 기록은 남아요",
  previewNote: "지금 재고 수량은 그대로예요. 수업 정보도 함께 지워져요.",
  previewEmpty: "이 기간에 지울 기록이 없어요",
  futureDate: "오늘보다 뒤 날짜는 고를 수 없어요",
  invalidDate: "날짜를 골라 주세요",
} as const;

/** record-wipe-range: '전체 | 이 날짜 이전' (기본 '이 날짜 이전') */
export type RecordWipeRange = "all" | "before";
export const RECORD_WIPE_DEFAULT_RANGE: RecordWipeRange = "before";

export const RECORD_WIPE_RANGE_OPTIONS: { value: RecordWipeRange; label: string }[] = [
  { value: "all", label: RECORD_WIPE_TEXT.all },
  { value: "before", label: RECORD_WIPE_TEXT.before },
];

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "YYYY-MM-DD" 이고 달력에 있는 날인가 */
export function isValidYmd(value: string): boolean {
  const m = YMD.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/**
 * 날짜 칸 기본값 = 가장 최근에 지난 3월 1일 (한국 학년도 시작) — 오케스트레이터 결정 2026-10-13 (d7 §29 에는 없는 값).
 * today(한국 날짜 "YYYY-MM-DD")가 3월 1일 이후면 올해 3월 1일(3월 1일 당일 포함 — 미래 아님), 그 전이면 작년 3월 1일.
 */
export function defaultWipeBeforeDate(today: string): string {
  if (!isValidYmd(today)) return today;
  const year = Number(today.slice(0, 4));
  const y = today.slice(5) >= "03-01" ? year : year - 1;
  return `${String(y).padStart(4, "0")}-03-01`;
}

export type WipeDateCheck = { ok: true } | { ok: false; reason: "invalid" | "future" };

/** '이 날짜 이전' 날짜 확인: 미래 불가(오늘은 된다 — 그날은 미포함이라 어제까지 지운다) */
export function checkWipeBeforeDate(value: string, today: string): WipeDateCheck {
  if (!isValidYmd(value)) return { ok: false, reason: "invalid" };
  if (value > today) return { ok: false, reason: "future" };
  return { ok: true };
}

/**
 * DB 함수(count_wipe_records · wipe_records)에 넘길 p_before: '전체' = null, '이 날짜 이전' = 그 날짜(그날 미포함).
 * 날짜가 틀리면 undefined (부르지 않는다).
 */
export function wipeBeforeParam(range: RecordWipeRange, date: string, today: string): string | null | undefined {
  if (range === "all") return null;
  return checkWipeBeforeDate(date, today).ok ? date : undefined;
}

/** 기록 used_on/입고일(YYYY-MM-DD)이 지울 범위에 드는가 (p_before null = 전부, 아니면 그날 미포함 이전) */
export function inWipeRange(ymd: string, before: string | null): boolean {
  return before === null ? true : ymd < before;
}

export type WipeCounts = { usage: number; intake: number };

export function wipeTotal(c: WipeCounts): number {
  return c.usage + c.intake;
}

/** wipe-preview 본문: '사용 기록 {N}건 · 입고 기록 {M}건을 지워요', 둘 다 0 이면 '이 기간에 지울 기록이 없어요' */
export function wipePreviewText(c: WipeCounts): string {
  if (wipeTotal(c) === 0) return RECORD_WIPE_TEXT.previewEmpty;
  return `사용 기록 ${c.usage.toLocaleString("ko-KR")}건 · 입고 기록 ${c.intake.toLocaleString("ko-KR")}건을 지워요`;
}

/** 확인 버튼 글자: '기록 {N+M}건 삭제' */
export function recordWipeButtonLabel(c: WipeCounts): string {
  return `기록 ${wipeTotal(c).toLocaleString("ko-KR")}건 삭제`;
}

/** 실행 뒤 토스트: '기록 {N}건을 삭제했어요' (N = 지운 사용 + 입고 기록) */
export function recordWipeDoneText(c: WipeCounts): string {
  return `기록 ${wipeTotal(c).toLocaleString("ko-KR")}건을 삭제했어요`;
}

/** 기록 삭제 버튼: 지울 기록이 있고(미리보기 수 > 0) 날짜가 맞고 학교명이 같고 저장 중이 아닐 때만 켜진다 */
export function canWipeRecords(input: { counts: WipeCounts | null; dateOk: boolean; schoolNameOk: boolean; pending?: boolean }): boolean {
  return !!input.counts && wipeTotal(input.counts) > 0 && input.dateOk && input.schoolNameOk && !input.pending;
}
