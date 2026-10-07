// 화면 10 사용 기록 내역 필터 규칙 + 화면 4 메모 규칙 (harness/d7-data.md §7).
// 순수 함수만 — 서버·클라이언트 어느 쪽에서도 import 할 수 있다.
// DB(usage_history · record_usage)가 같은 검사를 다시 한다 — 여기는 입력 정리와 사용자 안내용.

/** 기간 선택지: 최근 1개월(기본) · 3개월 · 6개월 · 전체 */
export const USAGE_PERIODS = ["1m", "3m", "6m", "all"] as const;
export type UsagePeriod = (typeof USAGE_PERIODS)[number];
export const DEFAULT_USAGE_PERIOD: UsagePeriod = "1m";

export const USAGE_PERIOD_OPTIONS: readonly { value: UsagePeriod; label: string }[] = [
  { value: "1m", label: "최근 1개월" },
  { value: "3m", label: "최근 3개월" },
  { value: "6m", label: "최근 6개월" },
  { value: "all", label: "전체" },
];

const PERIOD_MONTHS: Record<UsagePeriod, number | null> = { "1m": 1, "3m": 3, "6m": 6, all: null };

/** 시약명 검색어 최대 길이 (시약명 최대 80자) */
export const USAGE_QUERY_MAX = 80;
/** 한 번에 읽는 기록 수 (DB 함수 상한 500) */
export const USAGE_HISTORY_LIMIT = 200;
/** 메모 최대 길이 (usage_logs.memo check · record_usage) */
export const USAGE_MEMO_MAX = 200;

/** 알 수 없는 값(주소창에서 온 값 등)은 기본 기간으로 */
export function toUsagePeriod(v: unknown): UsagePeriod {
  return USAGE_PERIODS.find((p) => p === v) ?? DEFAULT_USAGE_PERIOD;
}

/**
 * 기간 → 조회 시작 시각(ISO). "all" 이면 null (제한 없음).
 * now 에서 달 수만큼 뺀 같은 시각. 그 달에 같은 날이 없으면 말일로 맞춘다 (3월 31일 − 1개월 = 2월 말일).
 */
export function usagePeriodSince(period: UsagePeriod, now: Date = new Date()): string | null {
  const months = PERIOD_MONTHS[period];
  if (months === null) return null;
  const d = new Date(now.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString();
}

/** 검색어 정리: 앞뒤 공백 제거, 비면 null, 최대 길이로 자른다 */
export function normalizeUsageQuery(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const q = v.trim();
  if (q === "") return null;
  return Array.from(q).slice(0, USAGE_QUERY_MAX).join("");
}

export type CheckedMemo = { ok: true; value: string | null } | { ok: false; error: string };

/** 메모(선택): 앞뒤 공백 제거, 비면 null, 200자 초과는 거부 (글자 수 = DB char_length 와 같이 코드 포인트 기준) */
export function checkUsageMemo(v: unknown): CheckedMemo {
  if (v === undefined || v === null) return { ok: true, value: null };
  if (typeof v !== "string") return { ok: false, error: "메모를 확인해 주세요" };
  const memo = v.trim();
  if (memo === "") return { ok: true, value: null };
  if (Array.from(memo).length > USAGE_MEMO_MAX) {
    return { ok: false, error: `메모는 ${USAGE_MEMO_MAX}자까지 쓸 수 있어요` };
  }
  return { ok: true, value: memo };
}

/* ───────── 사용일 (d7 §15) ───────── */

const SEOUL_YMD = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });

/** 한국 날짜 "YYYY-MM-DD" (기본 = 지금) */
export function seoulDate(d: Date = new Date()): string {
  return SEOUL_YMD.format(d);
}

export type CheckedUsedOn = { ok: true; value: string } | { ok: false; error: string };

/**
 * 사용일 검사: "YYYY-MM-DD" 형식의 실제 날짜, 오늘(한국 날짜) 이후 거부. 과거 하한 없음.
 * 비었으면 오늘. DB(record_usage)가 같은 검사를 다시 한다.
 */
export function checkUsedOn(v: unknown, today: string = seoulDate()): CheckedUsedOn {
  if (v === undefined || v === null || v === "") return { ok: true, value: today };
  if (typeof v !== "string") return { ok: false, error: "사용일을 확인해 주세요" };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return { ok: false, error: "사용일을 확인해 주세요" };
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d || y < 1900) {
    return { ok: false, error: "사용일을 확인해 주세요" };
  }
  const value = `${m[1]}-${m[2]}-${m[3]}`;
  if (value > today) return { ok: false, error: "오늘 이후 날짜는 고를 수 없어요" };
  return { ok: true, value };
}

/** "2026-10-03" → "10월 3일" */
export function monthDayLabel(ymd: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(ymd);
  return m ? `${Number(m[1])}월 ${Number(m[2])}일` : ymd;
}

/** 화면 4 past-date-note: "10월 3일 사용으로 기록해요" */
export function pastDateNoteText(usedOn: string): string {
  return `${monthDayLabel(usedOn)} 사용으로 기록해요`;
}

/** 화면 10 기록일 캡션: "10월 6일에 기록" */
export function recordedOnCaption(recordedOn: string): string {
  return `${monthDayLabel(recordedOn)}에 기록`;
}

/**
 * 화면 10 사용일 묶음 헤더 (디자인 1.17 10 group-label, d7 §15): "10월 7일 · 오늘" · "10월 6일".
 * 올해가 아닌 날은 연도를 앞에 붙인다: "2025년 12월 3일".
 */
export function usageDayLabel(usedOn: string, today: string = seoulDate()): string {
  const m = /^(\d{4})-\d{2}-\d{2}/.exec(usedOn);
  if (!m) return usedOn;
  const base = monthDayLabel(usedOn);
  if (usedOn.slice(0, 10) === today) return `${base} · 오늘`;
  return m[1] === today.slice(0, 4) ? base : `${m[1]}년 ${base}`;
}

/**
 * 화면 10 기록 행의 사용자 줄 (디자인 1.17 10 record-sub): 기록한 날 = 사용일이면 "학생 이OO · 14:05"(기록 시각),
 * 다르면 사용자만("교사 김OO") — 그때는 아래 캡션 "10월 7일에 기록" 이 붙는다.
 */
export function usageRowSubtitle(userName: string, usedOn: string, recordedOn: string, recordedTime: string): string {
  return usedOn === recordedOn ? `${userName} · ${recordedTime}` : userName;
}
