// 재주문 기준 자동 (harness/d7-data.md §11-1, 2026-10-06) — 테스트가 기대값을 만들 때 쓰는 규칙.
// 숫자(28일 · ÷ 2 · 20% · 소수 3자리)는 d7 §11-1 "자동 값" 문장에서 읽는다 — 테스트 파일에 숫자를 따로 적지 않는다.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const D7 = readFileSync(join(process.cwd(), "harness", "d7-data.md"), "utf8");
const AUTO_SECTION = (() => {
  const start = D7.indexOf("### 11-1.");
  if (start < 0) throw new Error("harness/d7-data.md 에서 §11-1 을 찾지 못했습니다");
  const rest = D7.slice(start + 1);
  const end = rest.search(/\n##/);
  return D7.slice(start, end < 0 ? undefined : start + 1 + end);
})();
const autoLine = AUTO_SECTION.split(/\r?\n/).find((l) => l.startsWith("| 자동 값 |")) ?? "";

function need(re: RegExp, what: string): number {
  const m = re.exec(autoLine);
  if (!m) throw new Error(`harness/d7-data.md §11-1 '자동 값' 에서 ${what} 를 읽지 못했습니다`);
  return Number(m[1]);
}

/** 최근 N일 사용 기록 */
export const AUTO_WINDOW_DAYS = need(/최근 (\d+)일 사용 기록/, "사용 기록 기간");
/** 28일 합 ÷ N */
export const AUTO_USAGE_DIVISOR = need(/\d+일 합 ÷ (\d+)/, "사용량 나누기 수");
/** 마지막 입고량 × N% */
export const AUTO_INTAKE_PERCENT = need(/마지막 입고량 × (\d+)%/, "입고 비율");
/** 소수 N자리 반올림 */
export const AUTO_DECIMALS = need(/소수 (\d+)자리 반올림/, "소수 자리");

const SCALE = 10 ** AUTO_DECIMALS;
/** 소수 자리까지 정수로 (부동소수 오차 없이 견주려고) */
const scaled = (n: number) => Math.round(n * SCALE);

/** 자동 값: 사용량 근거 = 최근 기간 사용량 합 ÷ N (소수 자리 반올림) */
export function autoFromUsage(amountsInWindow: number[]): number {
  const sum = amountsInWindow.reduce((a, b) => a + scaled(b), 0);
  return Math.round(sum / AUTO_USAGE_DIVISOR) / SCALE;
}

/** 자동 값: 입고 근거 = 마지막 입고량 × N% (소수 자리 반올림) */
export function autoFromIntake(lastIntake: number): number {
  return Math.round((scaled(lastIntake) * AUTO_INTAKE_PERCENT) / 100) / SCALE;
}

export type ThresholdSource = "auto" | "basis" | "manual";
export type AutoBasis = "usage" | "intake" | null;

/**
 * 공용 학교(A·B·데모) 스냅숏에서 다른 스펙의 사용 기록으로 움직일 수 있는 값을 뺀다:
 * 출처가 'auto' 인 시약은 다른 스펙의 record_usage·record_intake 가 min_stock·근거·low_stock_since 를 정당하게 다시 계산한다(d7 §11-1).
 * 출처 자체(min_stock_source)는 남겨 두고 견준다 — 출처가 바뀌면 여전히 잡힌다.
 */
export function withoutAutoDrift<T extends Record<string, unknown>>(row: T): T {
  if (row.min_stock_source !== "auto") return row;
  const out: Record<string, unknown> = { ...row };
  delete out.min_stock;
  delete out.min_stock_auto_basis;
  delete out.low_stock_since;
  return out as T;
}
