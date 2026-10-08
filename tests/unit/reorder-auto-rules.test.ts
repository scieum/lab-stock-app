// 재주문 기준 자동 (d7 §11-1) 의 표시 규칙 (lib/reorder-rules: autoBasisText · thresholdSourceText · reorderBasisText 의 source 인자).
// 기대값: harness/d7-data.md §11-1 "표시"(자동 근거 세 형태: "최근 4주 사용량 기준" / "마지막 입고량의 20%" / 0 이면 "아직 없어요"
//         + 화면 6 카드는 그 세 형태 + 기존 두 형태) · §11 카드 기준 문구 두 형태("1반 1회 실험량 … × …조 기준" / "재주문 기준 N").
//         문구는 d7 문장에서 읽는다 — 구현 상수는 읽은 값과 같은지 비교만 한다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AUTO_CAPTION_INTAKE_TEXT,
  AUTO_CAPTION_USAGE_TEXT,
  autoCaptionText,
  AUTO_BASIS_INTAKE_TEXT,
  AUTO_BASIS_USAGE_TEXT,
  AUTO_LABEL,
  MANUAL_SOURCE_TEXT,
  THRESHOLD_NONE_LABEL,
  autoBasisText,
  reorderBasisText,
  thresholdSourceText,
  toAutoBasis,
  toThresholdSource,
} from "../../lib/reorder-rules";
import { ROOT } from "./helpers";

const D7 = readFileSync(join(ROOT, "harness/d7-data.md"), "utf8");
const AUTO_SECTION = (() => {
  const start = D7.indexOf("### 11-1.");
  const rest = D7.slice(start + 1);
  const end = rest.search(/\n##/);
  return start < 0 ? "" : D7.slice(start, end < 0 ? undefined : start + 1 + end);
})();
const line = (head: string) => AUTO_SECTION.split(/\r?\n/).find((l) => l.startsWith(`| ${head} |`)) ?? "";

/** "표시" 줄의 따옴표 문구: "자동" · "최근 4주 사용량 기준" · "마지막 입고량의 20%" · "아직 없어요" */
const SHOW = [...line("표시").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const [D7_AUTO, D7_USAGE, D7_INTAKE, D7_NONE] = SHOW;
/** "자동 값" 줄: 마지막 입고량 × N% */
const INTAKE_PCT = Number(/마지막 입고량 × (\d+)%/.exec(line("자동 값"))?.[1] ?? Number.NaN);

const SOURCES = ["auto", "basis", "manual"] as const;

/** d7 §18 "자동 기준 표시" 줄의 굵은 따옴표 문구: 사용 기록 캡션 · 입고량 캡션 (값 0 은 §11-1 "아직 없어요" 그대로) */
const S18_LINE = D7.split(/\r?\n/).find((l) => l.startsWith("| 자동 기준 표시")) ?? "";
const [S18_USAGE, S18_INTAKE] = [...S18_LINE.matchAll(/\*\*"([^"]+)"\*\*/g)].map((m) => m[1]);

/** d7 §11 "재주문 기준" 행 (2026-10-08): 직접 입력(근거 없음) 카드의 기준 문구 줄 = "직접 입력" (수량 줄과 같은 말 두 번 금지) */
const D7_MANUAL_BASIS = /기준 문구 줄은 "([^"]+)"/.exec(D7.split(/\r?\n/).find((l) => l.startsWith("| 재주문 기준 |")) ?? "")?.[1] ?? "";

describe("재주문 기준 자동 표시: 기대값 원본 (d7 §11-1)", () => {
  it("[K1][S3] d7 §11-1 '표시' 에서 자동 표시·근거 세 형태를 읽고, '자동 값' 의 입고 비율이 근거 문구와 같다", () => {
    expect(SHOW.length, `표시 줄의 따옴표 문구: ${JSON.stringify(SHOW)}`).toBeGreaterThanOrEqual(4);
    expect(D7_USAGE).toMatch(/사용량/);
    expect(D7_INTAKE).toMatch(/입고량/);
    expect(D7_INTAKE, "근거 문구의 % = 자동 값의 %").toContain(`${INTAKE_PCT}%`);
    expect(line("기준의 출처"), "출처 세 값").toMatch(/'auto'.*'basis'.*'manual'/);
  });

  it("[K1][S3] 구현 상수 = d7 문구 (자동 · 사용량 근거 · 입고 근거 · 없음)", () => {
    expect(AUTO_LABEL).toBe(D7_AUTO);
    expect(AUTO_BASIS_USAGE_TEXT).toBe(D7_USAGE);
    expect(AUTO_BASIS_INTAKE_TEXT).toBe(D7_INTAKE);
    expect(THRESHOLD_NONE_LABEL).toBe(D7_NONE);
    expect([D7_AUTO, D7_USAGE, D7_INTAKE, D7_NONE], "직접 입력 문구는 자동 문구와 겹치지 않는다").not.toContain(MANUAL_SOURCE_TEXT);
  });
});

describe("autoBasisText (d7 §11-1 표시: 자동 근거 한 줄)", () => {
  it("[K1][S3] 값 > 0: 'usage' → 사용량 근거, 'intake' → 입고 근거", () => {
    expect(autoBasisText({ minStock: 4.5, autoBasis: "usage" })).toBe(D7_USAGE);
    expect(autoBasisText({ minStock: 0.001, autoBasis: "usage" })).toBe(D7_USAGE);
    expect(autoBasisText({ minStock: 20, autoBasis: "intake" })).toBe(D7_INTAKE);
    expect(autoBasisText({ minStock: 0.2, autoBasis: "intake" })).toBe(D7_INTAKE);
  });

  it("[K1][S3] 값이 0·없음·음수·숫자 아님이면 근거와 상관없이 '아직 없어요'", () => {
    for (const minStock of [0, null, undefined, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      for (const autoBasis of ["usage", "intake", null, undefined] as const) {
        expect(autoBasisText({ minStock, autoBasis }), `minStock ${minStock} · ${autoBasis}`).toBe(D7_NONE);
      }
    }
  });

  it("[K1][S3] 값 > 0 인데 근거를 모르면(null) '자동' — 사용량·입고 근거로 지어내지 않는다", () => {
    expect(autoBasisText({ minStock: 3, autoBasis: null })).toBe(D7_AUTO);
    expect(autoBasisText({ minStock: 3, autoBasis: undefined })).toBe(D7_AUTO);
  });
});

describe("thresholdSourceText (화면 3 reorder-threshold 근거 한 줄, 출처별)", () => {
  it("[K1][S3] auto → 자동 근거 세 형태 (autoBasisText 와 같다)", () => {
    expect(thresholdSourceText({ source: "auto", autoBasis: "usage", minStock: 5, unit: "mL" })).toBe(D7_USAGE);
    expect(thresholdSourceText({ source: "auto", autoBasis: "intake", minStock: 5, unit: "mL" })).toBe(D7_INTAKE);
    expect(thresholdSourceText({ source: "auto", autoBasis: null, minStock: 0, unit: "mL" })).toBe(D7_NONE);
    expect(thresholdSourceText({ source: "auto", minStock: 0, unit: "g" }), "autoBasis 생략").toBe(D7_NONE);
    // auto 이면 남아 있는 근거 열이 있어도 매뉴얼 문구를 쓰지 않는다
    expect(thresholdSourceText({ source: "auto", autoBasis: "usage", minStock: 5, unit: "g", perGroup: 10, groups: 6 })).toBe(D7_USAGE);
  });

  it("[K1][S3] basis → '1반 1회 실험량 {per_group} {unit} × {groups}조 기준' (d7 §11), 근거 열이 비면 직접 입력과 같은 문구", () => {
    expect(thresholdSourceText({ source: "basis", minStock: 60, unit: "g", perGroup: 10, groups: 6 })).toBe("1반 1회 실험량 10 g × 6조 기준");
    expect(thresholdSourceText({ source: "basis", minStock: 0.3, unit: "mL", perGroup: 0.1, groups: 3 })).toBe("1반 1회 실험량 0.1 mL × 3조 기준");
    for (const [perGroup, groups] of [[null, 6], [10, null], [null, null], [0, 6], [10, 0]] as const) {
      expect(thresholdSourceText({ source: "basis", minStock: 60, unit: "g", perGroup, groups }), `${perGroup} × ${groups}`).toBe(MANUAL_SOURCE_TEXT);
    }
  });

  it("[K1][S3] manual → 직접 입력 문구 (근거 열이 남아 있어도 자동·매뉴얼 문구 아님)", () => {
    expect(thresholdSourceText({ source: "manual", minStock: 5, unit: "g" })).toBe(MANUAL_SOURCE_TEXT);
    expect(thresholdSourceText({ source: "manual", minStock: 0, unit: "g" })).toBe(MANUAL_SOURCE_TEXT);
    expect(thresholdSourceText({ source: "manual", minStock: 60, unit: "g", perGroup: 10, groups: 6, autoBasis: "usage" })).toBe(MANUAL_SOURCE_TEXT);
  });
});

describe("reorderBasisText (화면 6 카드 기준 문구: 자동 세 형태 + 기존 두 형태, d7 §11-1 표시)", () => {
  it("[K1][S6] source auto → 자동 근거 세 형태 (근거 열이 남아 있어도)", () => {
    expect(reorderBasisText({ source: "auto", autoBasis: "usage", minStock: 4.5, unit: "g" })).toBe(D7_USAGE);
    expect(reorderBasisText({ source: "auto", autoBasis: "intake", minStock: 20, unit: "mL" })).toBe(D7_INTAKE);
    expect(reorderBasisText({ source: "auto", autoBasis: null, minStock: 0, unit: "mL" })).toBe(D7_NONE);
    expect(reorderBasisText({ source: "auto", autoBasis: "usage", minStock: 4.5, unit: "g", perGroup: 10, groups: 6 })).toBe(D7_USAGE);
  });

  it("[K1][S6] source basis·manual·없음 → 근거 열 둘 다 있으면 '1반 1회 …', 아니면 d7 §11 직접 입력 기준 문구 (2026-10-08)", () => {
    expect(D7_MANUAL_BASIS, "d7 §11 '재주문 기준' 행의 직접 입력 기준 문구").not.toBe("");
    for (const source of ["basis", "manual", undefined] as const) {
      expect(reorderBasisText({ source, minStock: 60, unit: "g", perGroup: 10, groups: 6 }), `${source}`).toBe("1반 1회 실험량 10 g × 6조 기준");
      expect(reorderBasisText({ source, minStock: 60, unit: "g", perGroup: null, groups: null }), `${source}`).toBe(D7_MANUAL_BASIS);
      expect(reorderBasisText({ source, minStock: 1000, unit: "mL" }), `${source}`).toBe(D7_MANUAL_BASIS);
    }
  });

  it("[K1][S6] 자동 문구는 auto 일 때만 — 다른 출처의 문구에 자동 근거가 섞이지 않는다", () => {
    for (const source of SOURCES.filter((s) => s !== "auto")) {
      const text = reorderBasisText({ source, autoBasis: "usage", minStock: 5, unit: "g" });
      for (const t of [D7_USAGE, D7_INTAKE, D7_NONE]) expect(text, `${source}`).not.toContain(t);
    }
  });
});

describe("DB 값 → 출처·근거 (toThresholdSource · toAutoBasis)", () => {
  it("[K1][S3] 알려진 값은 그대로, 모르는 값은 근거·기준으로 추정 (d7 §11-1 '기존 행' 분류와 같다)", () => {
    for (const s of SOURCES) expect(toThresholdSource(s)).toBe(s);
    expect(toThresholdSource(null, { minStock: 60, perGroup: 10, groups: 6 })).toBe("basis");
    expect(toThresholdSource(undefined, { minStock: 5, perGroup: null, groups: null })).toBe("manual");
    expect(toThresholdSource("x", { minStock: 0 })).toBe("auto");
    expect(toThresholdSource(undefined)).toBe("auto");
    expect(toAutoBasis("usage")).toBe("usage");
    expect(toAutoBasis("intake")).toBe("intake");
    for (const v of [null, undefined, "", "auto", 1]) expect(toAutoBasis(v), String(v)).toBeNull();
  });
});

describe("autoCaptionText (d7 §18: auto-threshold-badge 아래 캡션 한 줄, 화면 3·6)", () => {
  it("[K1][S3] 기대값 원본: d7 §18 에서 캡션 두 문구를 읽었고 구현 상수와 같다", () => {
    expect(S18_USAGE).toMatch(/사용량/);
    expect(S18_INTAKE).toMatch(/입고량/);
    expect(S18_INTAKE, "입고 캡션의 % = §11-1 자동 값의 %").toContain(`${INTAKE_PCT}%`);
    expect(S18_LINE, "값 0 은 지금처럼 '아직 없어요'").toContain(`"${D7_NONE}"`);
    expect(AUTO_CAPTION_USAGE_TEXT).toBe(S18_USAGE);
    expect(AUTO_CAPTION_INTAKE_TEXT).toBe(S18_INTAKE);
  });

  it("[K1][S3] 값 > 0: 'usage' → 사용 기록 캡션, 'intake' → 입고량 캡션", () => {
    expect(autoCaptionText({ minStock: 4.5, autoBasis: "usage" })).toBe(S18_USAGE);
    expect(autoCaptionText({ minStock: 0.001, autoBasis: "usage" })).toBe(S18_USAGE);
    expect(autoCaptionText({ minStock: 20, autoBasis: "intake" })).toBe(S18_INTAKE);
  });

  it("[K1][S3] 값이 0·없음·음수·숫자 아님이면 근거와 상관없이 '아직 없어요'", () => {
    for (const minStock of [0, null, undefined, -1, Number.NaN]) {
      for (const autoBasis of ["usage", "intake", undefined] as const) {
        expect(autoCaptionText({ minStock, autoBasis }), `minStock ${minStock} · ${autoBasis}`).toBe(D7_NONE);
      }
    }
  });

  it("[K1][S3] 값 > 0 인데 근거를 모르면 캡션 없음(null) — §11-1 옛 근거 문구로 돌아가지 않는다", () => {
    const out = autoCaptionText({ minStock: 3, autoBasis: undefined });
    expect(out).toBeNull();
    for (const old of [D7_USAGE, D7_INTAKE]) {
      expect(autoCaptionText({ minStock: 3, autoBasis: "usage" })).not.toBe(old);
      expect(autoCaptionText({ minStock: 3, autoBasis: "intake" })).not.toBe(old);
    }
  });
});
