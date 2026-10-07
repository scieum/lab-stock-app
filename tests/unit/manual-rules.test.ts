// 화면 5 실험 매뉴얼 순수 규칙 (lib/manual-rules).
// 기대값: harness/d7-data.md §13 — 파일(PDF·JPG·PNG 1개, 4MB 이하) · 조 수(1~20 정수) · 단위(병·mL·g, L→mL·kg→g·mg→g 환산, 그 밖은 사용자가 고침)
//         · 시약 연결(공백·대소문자·괄호 농도 표기 무시, 포함 관계, 미연결은 저장 제외, 한 시약 두 행은 합산)
//         · 저장(항목 {reagent_id, per_group, groups}, 필요량 = per_group × groups, 기존 min_stock 보다 클 때만 바뀜),
//         design/frames/5-mobile.json(시안 4행의 사용량·단위·필요량, 조 수).
//         구현에서 읽지 않는다 — 구현 상수는 d7 문장에서 읽은 값과 같은지 비교만 한다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GROUPS_MAX,
  GROUPS_MIN,
  MANUAL_FILE_MAX_BYTES,
  MANUAL_UNITS,
  basisOutcome,
  checkGroups,
  formatAmountText,
  isAmountEdited,
  matchReagent,
  normalizeExtraction,
  normalizeUnit,
  parseAmount,
  planSave,
  reagentNameKey,
  requiredAmount,
  validateManualFile,
  type ExtractionRow,
  type ManualReagent,
} from "../../lib/manual-rules";
import { ROOT } from "./helpers";

const D7 = readFileSync(join(ROOT, "harness/d7-data.md"), "utf8");
const section = (() => {
  const start = D7.indexOf("## 13. 실험 매뉴얼");
  const rest = D7.slice(start + 1);
  const end = rest.search(/\n## /);
  return start < 0 ? "" : D7.slice(start, end < 0 ? undefined : start + 1 + end);
})();
const line = (head: string) => section.split(/\r?\n/).find((l) => l.startsWith(`| ${head} |`)) ?? "";

// ---------- d7 §13 에서 읽은 값 ----------
const FILE_LINE = line("파일");
const MAX_MB = Number(/(\d+)MB 이하/.exec(FILE_LINE)?.[1] ?? Number.NaN);
const MAX_BYTES = MAX_MB * 1024 * 1024;
const FILE_KINDS = (/^\| 파일 \| ([^,]+?) 1개/.exec(FILE_LINE)?.[1] ?? "").split("·").map((s) => s.trim());
const GROUPS_RANGE = /(\d+)~(\d+) 정수/.exec(line("조 수"));
const G_MIN = Number(GROUPS_RANGE?.[1] ?? Number.NaN);
const G_MAX = Number(GROUPS_RANGE?.[2] ?? Number.NaN);
const UNITS = (/추출 단위는 (\S+) 중 하나로 정리/.exec(line("단위"))?.[1] ?? "").split("·");

// ---------- 시안 5 (design/frames/5-mobile.json) 의 표 ----------
type FrameNode = { name: string; path: string[]; text: { characters: string } | null };
const frame = (JSON.parse(readFileSync(join(ROOT, "design/frames/5-mobile.json"), "utf8")) as { frames: { nodes: FrameNode[] }[] }).frames[0].nodes;
// 시안 1.17: 조 수 = manual-upload/group-count/text-input/value, 행 = extraction-row 카드
// (row-head: reagent-name·needed-amount "1반 1회 {필요량}", usage-line: text-input value 2개 = 사용량·단위,
//  link-row: "우리 학교 시약" 선택 값).
const FRAME_GROUPS = Number(frame.find((n) => n.name === "value" && n.path.includes("group-count"))?.text?.characters);
const FRAME_NEED_PREFIX = "1반 1회 ";
/** 추출 행: [시약명, 1조 사용량, 단위, 1반 1회 필요량] */
const FRAME_ROWS: string[][] = (() => {
  const out: string[][] = [];
  let cur: string[] | null = null;
  for (const n of frame) {
    if (!n.path.includes("extraction-row")) continue;
    if (n.name === "extraction-row") { cur = []; out.push(cur); continue; }
    if (!cur || !n.text) continue;
    if (n.name === "reagent-name") cur[0] = n.text.characters;
    else if (n.name === "needed-amount") cur[3] = n.text.characters.replace(FRAME_NEED_PREFIX, "");
    else if (n.name === "value" && n.path.includes("usage-line")) cur[cur[1] === undefined ? 1 : 2] = n.text.characters;
  }
  return out;
})();
/** 각 행의 "우리 학교 시약" 연결 값 */
const FRAME_LINKED: string[] = frame.filter((n) => n.name === "value" && n.path.includes("link-row")).map((n) => n.text!.characters);

const MB = 1024 * 1024;
const file = (name: string, type: string, size = 1000) => ({ name, type, size });
const R = (id: string, name: string, unit = "mL", minStock = 0): ManualReagent => ({ id, name, unit, minStock });
const names = (list: string[]) => list.map((n, i) => ({ id: `r-${i + 1}`, name: n }));
const linkedName = (name: string, list: string[]) => matchReagent(name, names(list))?.name ?? null;
let seq = 0;
const row = (name: string, perGroup: string, unit: ExtractionRow["unit"], reagentId: string | null): ExtractionRow => {
  seq += 1;
  const n = Number(perGroup);
  return { id: `t-${seq}`, name, perGroup, extractedPerGroup: Number.isFinite(n) && n > 0 ? n : null, unit, reagentId };
};

describe("기대값 원본 (d7 §13 · 시안 5)", () => {
  it("[K1][S5] d7 §13 에서 파일 형식·크기, 조 수 범위, 단위를 읽을 수 있고 구현 상수와 같다", () => {
    expect(FILE_KINDS).toEqual(["PDF", "JPG", "PNG"]);
    expect(MAX_MB).toBe(4);
    expect(MANUAL_FILE_MAX_BYTES, "구현의 크기 한도 = d7 4MB").toBe(MAX_BYTES);
    expect([G_MIN, G_MAX]).toEqual([1, 20]);
    expect([GROUPS_MIN, GROUPS_MAX], "구현의 조 수 범위 = d7").toEqual([G_MIN, G_MAX]);
    expect(UNITS).toEqual(["병", "mL", "g"]);
    expect([...MANUAL_UNITS].sort(), "구현의 단위 = d7").toEqual([...UNITS].sort());
    expect(section).toContain("{reagent_id, per_group, groups}");
    expect(section).toContain("기존 min_stock 보다 클 때만");
  });

  it("[K1][S5] 시안 5 추출 행은 4개이고 조 수는 4, 필요량 글자 = 사용량 × 조 수 + 단위", () => {
    expect(FRAME_GROUPS).toBe(4);
    expect(FRAME_ROWS).toEqual([
      ["염산", "20", "mL", "80 mL"],
      ["수산화나트륨", "5", "g", "20 g"],
      ["페놀프탈레인 용액", "2", "mL", "8 mL"],
      ["증류수", "150", "mL", "600 mL"],
    ]);
    expect(FRAME_LINKED, "각 행은 같은 이름의 우리 학교 시약에 연결").toEqual(FRAME_ROWS.map((r) => r[0]));
  });
});

describe("파일 검사 validateManualFile (d7 §13 파일)", () => {
  it.each([
    ["매뉴얼.pdf", "application/pdf"],
    ["사진.jpg", "image/jpeg"],
    ["사진.jpeg", "image/jpeg"],
    ["사진.png", "image/png"],
    ["MANUAL.PDF", "application/pdf"],
    ["PHOTO.JPG", "image/jpeg"],
  ])("[K1][S5] 허용: %s (%s)", (name, type) => {
    expect(validateManualFile(file(name, type))).toBeNull();
  });

  it.each([
    ["매뉴얼.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["매뉴얼.hwp", "application/x-hwp"],
    ["매뉴얼.hwp", ""],
    ["움짤.gif", "image/gif"],
    ["매뉴얼", "application/pdf"],
    ["매뉴얼", ""],
    ["매뉴얼.txt", "text/plain"],
    ["매뉴얼.pdf.exe", "application/pdf"],
  ])("[K1][S5] 거부(형식): %s (%s)", (name, type) => {
    const error = validateManualFile(file(name, type));
    expect(typeof error).toBe("string");
    expect(error).not.toBe("");
    for (const kind of FILE_KINDS) expect(error, `오류 문구에 허용 형식 ${kind}`).toContain(kind);
  });

  it.each([
    ["매뉴얼.pdf", "image/png"],
    ["사진.png", "application/pdf"],
    ["사진.jpg", "image/png"],
    ["사진.png", "image/gif"],
    ["매뉴얼.pdf", "application/msword"],
  ])("[K1][S5] 거부(MIME 과 확장자 불일치): %s 인데 %s", (name, type) => {
    expect(validateManualFile(file(name, type))).not.toBeNull();
  });

  it("[K1][S5] 크기: 정확히 4MB 는 허용, 1바이트라도 넘으면 거부(문구에 4MB), 형식마다 같다", () => {
    for (const [name, type] of [["a.pdf", "application/pdf"], ["a.jpg", "image/jpeg"], ["a.png", "image/png"]]) {
      expect(validateManualFile(file(name, type, MAX_BYTES)), `${name} 4MB`).toBeNull();
      expect(validateManualFile(file(name, type, 1)), `${name} 1바이트`).toBeNull();
      const over = validateManualFile(file(name, type, MAX_BYTES + 1));
      expect(over, `${name} 4MB + 1`).not.toBeNull();
      expect(over).toContain(`${MAX_MB}MB`);
      expect(validateManualFile(file(name, type, 10 * MB)), `${name} 10MB`).not.toBeNull();
    }
  });

  it("[K1][S5] 빈 파일(0바이트) 거부, 형식 오류·크기 오류와 다른 문구", () => {
    const empty = validateManualFile(file("a.pdf", "application/pdf", 0));
    expect(empty).not.toBeNull();
    expect(empty).not.toBe(validateManualFile(file("a.pdf", "application/pdf", MAX_BYTES + 1)));
    expect(empty).not.toBe(validateManualFile(file("a.gif", "image/gif")));
  });
});

describe("조 수 checkGroups (d7 §13 조 수: 1~20 정수)", () => {
  it.each([1, 2, 6, 19, 20, "1", "6", "20", " 6 "])("[K1][S5] 허용: %j", (v) => {
    const r = checkGroups(v);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(Number(v));
  });

  it.each([0, 21, -1, -6, 1.5, 6.5, 100, Number.NaN, Number.POSITIVE_INFINITY, "", " ", "0", "21", "-1", "1.5", "6.5", "abc", "여섯", "6조", "1e1", null, undefined, true, [6]])(
    "[K1][S5] 거부: %j",
    (v) => {
      const r = checkGroups(v);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error).toContain(String(G_MIN));
        expect(r.error).toContain(String(G_MAX));
      }
    },
  );
});

describe("단위 정리 normalizeUnit (d7 §13 단위)", () => {
  it.each([
    [1, "L", 1000, "mL"],
    [0.05, "L", 50, "mL"],
    [0.3, "L", 300, "mL"],
    [0.01, "l", 10, "mL"],
    [2, "kg", 2000, "g"],
    [1.1, "kg", 1100, "g"],
    [0.25, "KG", 250, "g"],
    [500, "mg", 0.5, "g"],
    [1, "mg", 0.001, "g"],
    [300, "mg", 0.3, "g"],
    [50, "ml", 50, "mL"],
    [50, "ML", 50, "mL"],
    [50, "mL", 50, "mL"],
    [50, "㎖", 50, "mL"],
    [50, " mL ", 50, "mL"],
    [12, "g", 12, "g"],
    [12, "G", 12, "g"],
    [2, "병", 2, "병"],
  ])("[K1][S5] %s %s → %s %s", (amount, unit, wantAmount, wantUnit) => {
    expect(normalizeUnit(amount, unit)).toEqual({ amount: wantAmount, unit: wantUnit });
  });

  it.each([
    [3, "방울"],
    [1, "스푼"],
    [2, "개"],
    [5, ""],
    [5, null],
    [5, undefined],
  ])("[K1][S5] 알 수 없는 단위 %s %j → 미확정(병·mL·g 아님), 수량은 그대로", (amount, unit) => {
    const r = normalizeUnit(amount, unit);
    expect(UNITS).not.toContain(r.unit);
    expect(r.unit).toBe("");
    expect(r.amount).toBe(amount);
  });

  it("[K1][S5] 수량을 못 읽으면(null·0·음수·문자) 수량은 null, 단위는 정리한다", () => {
    for (const bad of [null, undefined, 0, -5, "많이", Number.NaN]) {
      expect(normalizeUnit(bad, "L"), `${String(bad)} L`).toEqual({ amount: null, unit: "mL" });
    }
  });
});

describe("필요량 requiredAmount · formatAmountText (d7 §13: 1조 사용량 × 조 수)", () => {
  it.each([
    [0.1, 3, 0.3],
    [2.5, 6, 15],
    [0.7, 3, 2.1],
    [1.1, 3, 3.3],
    [0.001, 20, 0.02],
    [0.3, 6, 1.8],
    [50, 6, 300],
    [1, 1, 1],
    [50, 20, 1000],
  ])("[K1][S5] %s × %s = %s (부동소수 오차 없음)", (per, groups, want) => {
    expect(requiredAmount(per, groups)).toBe(want);
  });

  it("[K1][S5] 시안 5 의 4행: 사용량 × 조 수 = 필요량, 표기가 시안 글자와 같다", () => {
    expect(FRAME_ROWS.length).toBe(4);
    for (const [name, per, unit, text] of FRAME_ROWS) {
      const amount = parseAmount(per);
      expect(amount, `${name} 사용량`).toBe(Number(per));
      expect(formatAmountText(requiredAmount(amount!, FRAME_GROUPS), unit), `${name} 필요량`).toBe(text);
    }
  });

  it("[K1][S5] 표기: 숫자 + 공백 + 단위, 소수는 오차 없이", () => {
    expect(formatAmountText(300, "mL")).toBe("300 mL");
    expect(formatAmountText(12, "g")).toBe("12 g");
    expect(formatAmountText(requiredAmount(0.1, 3), "g")).toBe("0.3 g");
    expect(formatAmountText(requiredAmount(2.5, 6), "mL")).toBe("15 mL");
    expect(formatAmountText(2, "병")).toBe("2 병");
  });

  it("[K1][S5] 사용량 입력: 0보다 큰 숫자만 (빈 값·0·음수·문자·단위 붙은 값은 null)", () => {
    expect(parseAmount("50")).toBe(50);
    expect(parseAmount("0.5")).toBe(0.5);
    expect(parseAmount(" 2 ")).toBe(2);
    for (const bad of ["", " ", "0", "-5", "abc", "50mL", "1,000", "1e3", null, undefined]) {
      expect(parseAmount(bad), `"${String(bad)}"`).toBeNull();
    }
  });

  it("[K1][S5] 고친 칸: 추출값과 숫자가 다를 때만 (표기만 다른 50.0 은 고친 것이 아님), 되돌리면 사라진다", () => {
    expect(isAmountEdited({ perGroup: "50", extractedPerGroup: 50 })).toBe(false);
    expect(isAmountEdited({ perGroup: "50.0", extractedPerGroup: 50 })).toBe(false);
    expect(isAmountEdited({ perGroup: "5", extractedPerGroup: 50 })).toBe(true);
    expect(isAmountEdited({ perGroup: "50.5", extractedPerGroup: 50 })).toBe(true);
    expect(isAmountEdited({ perGroup: "", extractedPerGroup: 50 })).toBe(true);
    expect(isAmountEdited({ perGroup: "", extractedPerGroup: null })).toBe(false);
    expect(isAmountEdited({ perGroup: "3", extractedPerGroup: null })).toBe(true);
  });
});

describe("시약 자동 연결 matchReagent (d7 §13 시약 연결)", () => {
  it.each([
    ["수산화나트륨", "수산화나트륨"],
    ["수산화 나트륨", "수산화나트륨"],
    ["수산화나트륨", "수산화 나트륨"],
    [" 수산화나트륨  ", "수산화나트륨"],
    ["Ethanol", "ethanol"],
    ["ETHANOL", "Ethanol"],
    ["BTB 용액", "btb용액"],
  ])("[K1][S5] 같은 이름(공백·대소문자 차이): %j ↔ %j 연결", (extracted, ours) => {
    expect(linkedName(extracted, ["증류수", ours, "아세톤"])).toBe(ours);
  });

  it.each([
    ["염산 0.1M", "염산"],
    ["염산", "염산 0.1M"],
    ["에탄올 95%", "에탄올"],
    ["에탄올", "에탄올 95%"],
    ["염산(0.1M)", "염산"],
    ["염산", "염산(0.1M)"],
    ["염산 (0.1 M)", "염산"],
    ["염산 0.1M", "염산 1M"],
    ["염산(1M)", "염산 0.1M"],
  ])("[K1][S5] 농도 표기만 다른 이름: %j ↔ %j 연결", (extracted, ours) => {
    expect(linkedName(extracted, ["증류수", ours, "아세톤"])).toBe(ours);
  });

  it.each([
    ["염산", "묽은 염산"],
    ["묽은 염산", "염산"],
    ["묽은 염산(0.1M)", "염산 0.1M"],
    ["황산", "묽은 황산"],
  ])("[K1][S5] 포함 관계: %j ↔ %j 연결", (extracted, ours) => {
    expect(linkedName(extracted, ["증류수", ours, "아세톤"])).toBe(ours);
  });

  it.each([
    ["황산", "황산구리(II) 오수화물"],
    ["황산구리(II) 오수화물", "황산"],
    ["염화나트륨", "수산화나트륨"],
    ["수산화나트륨", "염화나트륨"],
    ["에탄올", "메탄올"],
    ["염산", "황산"],
    ["아세트산", "증류수"],
  ])("[K1][S5] 서로 다른 시약: %j ↔ %j 는 연결하지 않는다(null)", (extracted, ours) => {
    expect(linkedName(extracted, [ours])).toBeNull();
  });

  it("[K1][S5] 후보가 없으면 null (빈 목록 · 빈 이름)", () => {
    expect(matchReagent("염산", [])).toBeNull();
    expect(linkedName("", ["염산"])).toBeNull();
    expect(linkedName("   ", ["염산"])).toBeNull();
  });

  it("[K1][S5] 완전 일치가 포함 관계보다 우선 (목록 순서와 무관)", () => {
    expect(linkedName("염산", ["묽은 염산", "염산"])).toBe("염산");
    expect(linkedName("염산", ["염산", "묽은 염산"])).toBe("염산");
    expect(linkedName("염산 0.1M", ["묽은 염산", "염산"])).toBe("염산");
    expect(linkedName("묽은 염산", ["염산", "묽은 염산"])).toBe("묽은 염산");
    expect(linkedName("수산화 나트륨", ["수산화나트륨 수용액 진한 것", "수산화나트륨"])).toBe("수산화나트륨");
  });

  it('[K1][S5] 로마 숫자 괄호 "(II)" 는 농도 표기가 아니라 이름의 일부: 황산구리(II) 와 황산구리(I) 를 구분한다', () => {
    expect(reagentNameKey("황산구리(II)")).not.toBe(reagentNameKey("황산구리(I)"));
    expect(reagentNameKey("황산구리(II)")).not.toBe(reagentNameKey("황산구리"));
    expect(linkedName("황산구리(II)", ["황산구리(I)", "황산구리(II)"])).toBe("황산구리(II)");
    expect(linkedName("황산구리(I)", ["황산구리(II)", "황산구리(I)"])).toBe("황산구리(I)");
    expect(linkedName("황산구리(II) 오수화물", ["황산구리(I)", "황산구리(II) 오수화물"])).toBe("황산구리(II) 오수화물");
    expect(linkedName("산화철(III)", ["산화철(II)", "산화철(III)"])).toBe("산화철(III)");
  });

  // d7 §13 이 무시한다고 한 것은 공백·대소문자·괄호 "농도" 표기뿐이다. 산화수 괄호는 농도가 아니므로
  // "황산구리(I)" 은 "황산구리(II)" 와 같은 이름도, 포함 관계도 아니다 (서로 다른 시약).
  it.each([
    ["황산구리(II)", "황산구리(I)"],
    ["황산구리(I)", "황산구리(II)"],
    ["염화철(III)", "염화철(II)"],
    ["염화철(II)", "염화철(III)"],
  ])("[K1][S5] 산화수만 다른 시약: %j 는 %j 하나뿐일 때 연결하지 않는다(null)", (extracted, ours) => {
    expect(linkedName(extracted, [ours])).toBeNull();
  });

  it("[K1][S5] 농도 표기를 지워도 농도까지 같은 시약이 있으면 그것을 고른다", () => {
    expect(linkedName("염산 0.1M", ["염산 1M", "염산 0.1M"])).toBe("염산 0.1M");
    expect(linkedName("염산 1M", ["염산 0.1M", "염산 1M"])).toBe("염산 1M");
  });

  it("[K1][S5] 연결 결과는 넘긴 시약 객체 그대로 (id 로 저장 항목을 만든다)", () => {
    const list = [R("a", "증류수", "병"), R("b", "염산 0.1M")];
    expect(matchReagent("염산", list)).toBe(list[1]);
  });
});

describe("추출 결과 정리 normalizeExtraction (d7 §13 단위 · 시약 연결)", () => {
  // 시안 1.17 의 link-row 값(같은 이름의 우리 학교 시약)과 그 단위
  const reagents = FRAME_ROWS.map(([, , unit], i) => R(`m-${i + 1}`, FRAME_LINKED[i], unit));

  it("[K1][S5] 시안 4행: 사용량·단위가 그대로이고 4행 모두 같은 이름의 시약에 연결, 고친 칸 없음", () => {
    const rows = normalizeExtraction(
      FRAME_ROWS.map(([name, per, unit]) => ({ name, amount: Number(per), unit })),
      reagents,
    );
    expect(rows.map((r) => [r.name, r.perGroup, r.unit])).toEqual(FRAME_ROWS.map(([name, per, unit]) => [name, per, unit]));
    expect(rows.map((r) => r.reagentId)).toEqual(reagents.map((r) => r.id));
    expect(new Set(rows.map((r) => r.id)).size, "행 id 는 서로 다르다").toBe(rows.length);
    expect(rows.filter(isAmountEdited)).toEqual([]);
    const plan = planSave(rows, reagents, FRAME_GROUPS);
    expect(plan.rows.map((v) => v.requiredText)).toEqual(FRAME_ROWS.map((r) => r[3]));
  });

  it("[K1][S5] 환산(L·kg·mg) · 미연결 · 미확정 단위 · 이름 없는 줄", () => {
    const rows = normalizeExtraction(
      [
        { name: "염산", amount: 0.05, unit: "L" },
        { name: "수산화나트륨", amount: 2000, unit: "mg" },
        { name: "아세트산", amount: 10, unit: "mL" },
        { name: "페놀프탈레인 용액", amount: 2, unit: "방울" },
        { name: "", amount: 1, unit: "mL" },
        { name: "   ", amount: 1, unit: "mL" },
        { amount: 1, unit: "mL" },
      ],
      reagents,
    );
    expect(rows.map((r) => [r.name, r.perGroup, r.unit, r.reagentId])).toEqual([
      ["염산", "50", "mL", "m-1"],
      ["수산화나트륨", "2", "g", "m-2"],
      ["아세트산", "10", "mL", null],
      ["페놀프탈레인 용액", "2", "", "m-3"],
    ]);
  });
});

describe("저장 계획 planSave (d7 §13 시약 연결 · 저장)", () => {
  const reagents = [R("hcl", "염산", "mL"), R("naoh", "수산화나트륨", "g"), R("water", "증류수", "병")];

  it("[K1][S5] 연결된 행만 항목이 된다: 미연결 행은 건너뜀 목록, 항목 형태 = {reagent_id, per_group, groups}", () => {
    const rows = [row("염산", "50", "mL", "hcl"), row("아세트산", "10", "mL", null), row("수산화나트륨", "2", "g", "naoh")];
    const plan = planSave(rows, reagents, 6);
    expect(plan.canSave).toBe(true);
    expect(plan.blockReason).toBeNull();
    expect(plan.items).toEqual([
      { reagent_id: "hcl", per_group: 50, groups: 6 },
      { reagent_id: "naoh", per_group: 2, groups: 6 },
    ]);
    for (const item of plan.items) expect(Object.keys(item).sort()).toEqual(["groups", "per_group", "reagent_id"]);
    expect(plan.skippedRowIds).toEqual([rows[1].id]);
    expect(plan.errorRowIds).toEqual([]);
    expect(plan.rows.map((v) => v.status)).toEqual(["ok", "unlinked", "ok"]);
    expect(plan.rows[1].message, "미연결 안내").toContain("등록되지 않은 시약");
  });

  it("[K1][S5] 미연결 행은 사용량·단위가 비어 있어도 저장을 막지 않는다 (저장에서 빠질 뿐)", () => {
    const rows = [row("염산", "50", "mL", "hcl"), row("모르는 것", "", "", null)];
    const plan = planSave(rows, reagents, 6);
    expect(plan.canSave).toBe(true);
    expect(plan.items).toEqual([{ reagent_id: "hcl", per_group: 50, groups: 6 }]);
    expect(plan.skippedRowIds).toEqual([rows[1].id]);
  });

  it("[K1][S5] 목록에 없는 시약 id 는 미연결로 본다 (다른 학교·삭제된 시약으로 저장하지 않는다)", () => {
    const rows = [row("염산", "50", "mL", "other-school-reagent")];
    const plan = planSave(rows, reagents, 6);
    expect(plan.items).toEqual([]);
    expect(plan.canSave).toBe(false);
    expect(plan.skippedRowIds).toEqual([rows[0].id]);
  });

  it("[K1][S5] 같은 시약에 두 행: 1조 사용량을 합쳐 1항목 (소수 오차 없음)", () => {
    const a = planSave([row("염산", "50", "mL", "hcl"), row("묽은 염산", "10", "mL", "hcl"), row("수산화나트륨", "2", "g", "naoh")], reagents, 6);
    expect(a.items).toEqual([
      { reagent_id: "hcl", per_group: 60, groups: 6 },
      { reagent_id: "naoh", per_group: 2, groups: 6 },
    ]);
    expect(a.canSave).toBe(true);
    const b = planSave([row("수산화나트륨", "0.1", "g", "naoh"), row("가성소다", "0.2", "g", "naoh")], reagents, 3);
    expect(b.items).toEqual([{ reagent_id: "naoh", per_group: 0.3, groups: 3 }]);
    expect(requiredAmount(b.items[0].per_group, b.items[0].groups)).toBe(0.9);
  });

  it("[K1][S5] 단위가 연결 시약의 단위와 다른 행이 있으면 저장 불가 + 이유, 그 행에 시약 단위 안내", () => {
    const rows = [row("염산", "50", "mL", "hcl"), row("수산화나트륨 수용액", "20", "mL", "naoh")];
    const plan = planSave(rows, reagents, 6);
    expect(plan.canSave).toBe(false);
    expect(typeof plan.blockReason).toBe("string");
    expect(plan.blockReason).not.toBe("");
    expect(plan.errorRowIds).toEqual([rows[1].id]);
    expect(plan.rows[1].status).toBe("mismatch");
    expect(plan.rows[1].message, "우리 학교 시약 단위(g) 안내").toMatch(/단위.*g|g.*단위/);
    // 단위를 시약 단위로 맞추면 저장할 수 있다
    const fixed = planSave([rows[0], { ...rows[1], unit: "g" }], reagents, 6);
    expect(fixed.canSave).toBe(true);
    expect(fixed.items).toContainEqual({ reagent_id: "naoh", per_group: 20, groups: 6 });
  });

  it.each([
    ["사용량 없음", "", "mL"],
    ["사용량 0", "0", "mL"],
    ["사용량 음수", "-5", "mL"],
    ["사용량이 문자", "조금", "mL"],
    ["단위 미확정", "3", ""],
  ] as const)("[K1][S5] 연결된 행에 %s → 저장 불가 + 이유, 오류 행으로 표시", (_what, perGroup, unit) => {
    const rows = [row("수산화나트륨", "2", "g", "naoh"), row("염산", perGroup, unit, "hcl")];
    const plan = planSave(rows, reagents, 6);
    expect(plan.canSave).toBe(false);
    expect(plan.blockReason).toEqual(expect.any(String));
    expect(plan.blockReason).not.toBe("");
    expect(plan.errorRowIds).toEqual([rows[1].id]);
    expect(plan.rows[1].status).not.toBe("ok");
    expect(plan.rows[1].message).toEqual(expect.any(String));
    expect(plan.items.map((i) => i.reagent_id), "오류 행은 항목이 아니다").not.toContain("hcl");
  });

  it("[K1][S5] 항목이 0 이면 저장 불가 + 이유 (전부 미연결 · 0행)", () => {
    const allUnlinked = planSave([row("아세트산", "10", "mL", null), row("BTB 용액", "3", "", null)], reagents, 6);
    expect(allUnlinked.items).toEqual([]);
    expect(allUnlinked.canSave).toBe(false);
    expect(allUnlinked.blockReason).toEqual(expect.any(String));
    expect(allUnlinked.errorRowIds, "미연결은 오류가 아니다").toEqual([]);
    const none = planSave([], reagents, 6);
    expect(none.items).toEqual([]);
    expect(none.canSave).toBe(false);
    expect(none.blockReason).toEqual(expect.any(String));
  });

  it.each([0, 21, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("[K1][S5] 조 수가 %s 이면 저장 불가 + 이유, 항목 0", (groups) => {
    const plan = planSave([row("염산", "50", "mL", "hcl")], reagents, groups);
    expect(plan.canSave).toBe(false);
    expect(plan.blockReason).toEqual(expect.any(String));
    expect(plan.items).toEqual([]);
  });

  it("[K1][S5] 조 수 경계 1·20 은 저장 가능, 필요량 = 사용량 × 조 수", () => {
    for (const groups of [G_MIN, G_MAX]) {
      const plan = planSave([row("염산", "50", "mL", "hcl")], reagents, groups);
      expect(plan.canSave).toBe(true);
      expect(plan.items).toEqual([{ reagent_id: "hcl", per_group: 50, groups }]);
      expect(plan.rows[0].required).toBe(50 * groups);
      expect(plan.rows[0].requiredText).toBe(`${(50 * groups).toLocaleString("ko-KR")} mL`);
    }
  });

  it("[K1][S5] 기존 기준과 견준 예측은 합친 필요량으로 한다 (각 행은 작아도 합이 크면 바뀜)", () => {
    const withBasis = [R("hcl", "염산", "mL", 55), R("naoh", "수산화나트륨", "g", 12)];
    const plan = planSave([row("염산", "30", "mL", "hcl"), row("묽은 염산", "30", "mL", "hcl"), row("수산화나트륨", "2", "g", "naoh")], withBasis, 1);
    expect(plan.rows.map((v) => v.outcome)).toEqual(["changed", "changed", "kept"]);
    const six = planSave([row("수산화나트륨", "2", "g", "naoh")], withBasis, 6);
    expect(six.rows[0].outcome, "2 g × 6 = 12 = 기존 12 → 유지").toBe("kept");
  });
});

describe("기준 비교 basisOutcome (d7 §13 저장: 기존 min_stock 보다 클 때만 바꾼다)", () => {
  it.each([
    [300, 100, "changed"],
    [300, 299.999, "changed"],
    [300, 300, "kept"],
    [300, 500, "kept"],
    [0.3, 0.3, "kept"],
    [12, 0, "changed"],
    [0.001, 0, "changed"],
  ] as const)("[K1][S5] 새 필요량 %s · 기존 %s → %s", (required, minStock, want) => {
    expect(basisOutcome(required, minStock)).toBe(want);
  });

  it("[K1][S5] 부동소수 오차로 '같은 값'이 '더 큼'이 되지 않는다 (0.1 × 3 과 기존 0.3)", () => {
    expect(basisOutcome(requiredAmount(0.1, 3), 0.3)).toBe("kept");
    expect(basisOutcome(0.1 * 3, 0.3)).toBe("kept");
  });
});
