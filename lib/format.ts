// 화면 표시용 포맷 (시간대는 학교 기준 Asia/Seoul 고정 — 서버가 UTC 여도 같은 결과)
const TIME_ZONE = "Asia/Seoul";

const numberFmt = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });

/** 120 + "g" → "120g" */
export function formatAmount(value: number, unit: string): string {
  return `${numberFmt.format(value)}${unit}`;
}

function ymd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function hm(d: Date): string {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

/** "오늘 10:20" · "어제 15:40" · "9월 30일 08:10" */
export function formatUsedAt(d: Date, now: Date = new Date()): string {
  const day = ymd(d);
  if (day === ymd(now)) return `오늘 ${hm(d)}`;
  if (day === ymd(new Date(now.getTime() - 86_400_000))) return `어제 ${hm(d)}`;
  const md = new Intl.DateTimeFormat("ko-KR", { timeZone: TIME_ZONE, month: "long", day: "numeric" }).format(d);
  return `${md} ${hm(d)}`;
}

/** 500 + "mL" → "500 mL" (시약 목록 재고량 — 숫자와 단위 사이 공백) */
export function formatStock(value: number, unit: string): string {
  return `${numberFmt.format(value)} ${unit}`;
}

/** "2026-08-20" → "2026.08.20" (date 열은 시간대 변환 없이 그대로) */
export function formatDateDots(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : isoDate;
}

function parts(d: Date): Record<"year" | "month" | "day" | "hour" | "minute", string> {
  const out = { year: "", month: "", day: "", hour: "", minute: "" };
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  for (const p of fmt.formatToParts(d)) {
    if (p.type in out) out[p.type as keyof typeof out] = p.value;
  }
  return out;
}

/** 화면 10 기록 행의 기록 시각: "14:05" (한국 시간, 24시간) */
export function formatTimeHm(d: Date): string {
  const p = parts(d);
  return `${p.hour}:${p.minute}`;
}

/** 화면 10 기록 행 날짜: "10.02" (한국 시간) */
export function formatMonthDay(d: Date): string {
  const p = parts(d);
  return `${p.month}.${p.day}`;
}

/** 화면 10 월 그룹: "2026년 10월" (한국 시간). key 는 그룹을 가르는 값 "2026-10" */
export function formatYearMonth(d: Date): { key: string; label: string } {
  const p = parts(d);
  return { key: `${p.year}-${p.month}`, label: `${p.year}년 ${Number(p.month)}월` };
}

/** 화면 10 기록 상세 일시: "2026.10.02 14:20" (한국 시간) */
export function formatDateTimeDots(d: Date): string {
  const p = parts(d);
  return `${p.year}.${p.month}.${p.day} ${p.hour}:${p.minute}`;
}

/** 화면 10 기록 상세 "기록한 날": "2026-10-07 09:12" (한국 시간, 시안 10-desktop) */
export function formatDateTimeDashes(d: Date): string {
  const p = parts(d);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** date 열 "2026-10-03" → 행 날짜 "10.03" (시간대 변환 없음) */
export function formatMonthDayOf(ymd: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(ymd);
  return m ? `${m[1]}.${m[2]}` : ymd;
}

/** date 열 "2026-10-03" → 월 그룹 { key "2026-10", label "2026년 10월" } (시간대 변환 없음) */
export function formatYearMonthOf(ymd: string): { key: string; label: string } {
  const m = /^(\d{4})-(\d{2})/.exec(ymd);
  return m ? { key: `${m[1]}-${m[2]}`, label: `${m[1]}년 ${Number(m[2])}월` } : { key: ymd, label: ymd };
}

/**
 * 한국 시간 날짜 "10월 7일" — 올해(한국 시간 기준)가 아니면 "2025년 10월 7일".
 * 화면 6 알림 날짜(d7 §11, 디자인 1.21 reorder.card_text) · 사용일 안내와 같은 표기.
 */
export function formatKoreanDate(d: Date, now: Date = new Date()): string {
  const p = parts(d);
  const md = `${Number(p.month)}월 ${Number(p.day)}일`;
  return p.year === parts(now).year ? md : `${p.year}년 ${md}`;
}
