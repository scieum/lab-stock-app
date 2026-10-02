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
