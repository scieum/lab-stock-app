// 화면 17 센서 · 화면 2·17 여러 개 삭제 · 화면 14 가입 오류 · 화면 4 사용량 순수 규칙 (lib/sensor-rules · lib/auth/signup-rules · lib/usage-batch-rules).
// 기대값: design/rules.json 1.28 sensor(types · makers · status) · bulk_delete(max · select_all · confirm) · signup_error(summary),
//         harness/d7-data.md §25 (센서 DB 값 범위 · 상태 ok|check|broken · QA 4 사용량 0/음수 문구). 구현에서 기대값을 읽지 않는다.
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import {
  BULK_MAX,
  SENSOR_MAKERS,
  SENSOR_MAKER_GROUPS,
  SENSOR_STATUSES,
  SENSOR_STATUS_LABEL,
  SENSOR_TYPES,
  applySensorFilter,
  bulkNamesText,
  checkBulkIds,
  checkSensorInput,
  parseSensorFilter,
  selectAllIds,
} from "../../lib/sensor-rules";
import { signupFieldProblems } from "../../lib/auth/signup-rules";
import { checkAmount } from "../../lib/usage-batch-rules";
import { ROOT, read, rules } from "./helpers";

const D7 = read(join(ROOT, "harness/d7-data.md"));
const D7_25 = D7.slice(D7.indexOf("## 25."), D7.indexOf("\n## ", D7.indexOf("## 25.") + 1));
const row = (item: string) => D7_25.split("\n").find((l) => l.startsWith(`| ${item}`)) ?? "";
const SENSOR = rules.sensor as { types: string[]; makers: Record<string, string[] | string> };
const BULK = rules.bulk_delete as { max: number; select_all: string; confirm: string };
const quotes = (s: string) => [...s.matchAll(/'([^']+)'/g)].map((m) => m[1]);
const STATUS = (() => {
  const m = /status text (.+?) — DB 값은 ([a-z\\|]+)/.exec(D7_25)!;
  const labels = m[1].split(/\\?\|/).map((x) => x.trim());
  const dbs = m[2].split(/\\?\|/).map((x) => x.trim());
  return labels.map((label, i) => ({ label, db: dbs[i] }));
})();
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const base = { id: null, name: "무선 온도 센서", type: SENSOR.types[0], maker: (SENSOR.makers["센서"] as string[])[0], model: "", quantity: 3, locationText: "", slotId: null, status: "ok", memo: "" };

describe("[C1][S17] 센서 규칙 = rules sensor · d7 §25 센서 DB", () => {
  it(`종류 ${SENSOR.types.length}종(rules 1.28) · 회사 묶음(센서 · 현미경) · 상태 정상/점검 필요/고장 = ok/check/broken`, () => {
    expect([...SENSOR_TYPES]).toEqual(SENSOR.types);
    const groups = Object.entries(SENSOR.makers).filter(([, v]) => Array.isArray(v));
    expect(SENSOR_MAKER_GROUPS.map((g) => ({ title: g.title, makers: [...g.makers] }))).toEqual(groups.map(([title, makers]) => ({ title, makers })));
    expect(SENSOR_MAKERS.length).toBe(groups.reduce((a, [, v]) => a + (v as string[]).length, 0));
    expect([...SENSOR_STATUSES]).toEqual(STATUS.map((s) => s.db));
    for (const s of STATUS) expect(SENSOR_STATUS_LABEL[s.db as keyof typeof SENSOR_STATUS_LABEL]).toBe(s.label);
  });

  it("입력 검사: d7 §25 센서 DB 범위 (이름 1~40 · 종류 목록 · 회사 1~30(직접 입력 허용) · 수량 ≥0 정수 · 상태 목록)", () => {
    expect(row("센서 DB")).toMatch(/name 1~40자/);
    expect(row("센서 DB")).toMatch(/목록 또는 직접 입력 1~30자/);
    expect(checkSensorInput(base).ok).toBe(true);
    expect(checkSensorInput({ ...base, maker: "목록에 없는 회사" }).ok, "회사 직접 입력").toBe(true);
    expect(checkSensorInput({ ...base, quantity: 0 }).ok, "수량 0").toBe(true);
    for (const [what, patch] of [
      ["이름 0자", { name: "  " }],
      ["이름 41자", { name: "가".repeat(41) }],
      ["종류 목록 밖", { type: "무게" }],
      ["회사 0자", { maker: "" }],
      ["회사 31자", { maker: "나".repeat(31) }],
      ["수량 -1", { quantity: -1 }],
      ["수량 1.5", { quantity: 1.5 }],
      ["상태 목록 밖", { status: "lost" }],
    ] as const) {
      expect(checkSensorInput({ ...base, ...patch }).ok, what).toBe(false);
    }
  });

  it("필터: 종류 · 회사 · 상태 — 같은 묶음 OR · 묶음 사이 AND, 검색 = 이름 · 모델 (rules sensor.filter · list)", () => {
    const items = [
      { name: "온도 A", type: SENSOR.types[0], maker: "버니어", model: "GDX-TMP", status: "ok" as const },
      { name: "pH B", type: SENSOR.types[1], maker: "버니어", model: "GDX-PH", status: "check" as const },
      { name: "운동 C", type: SENSOR.types[3], maker: "파스코", model: null, status: "broken" as const },
    ];
    expect(applySensorFilter(items, "gdx-ph", { types: [], makers: [], statuses: [] }).map((s) => s.name)).toEqual(["pH B"]);
    expect(applySensorFilter(items, "", { types: [], makers: [], statuses: ["check", "broken"] }).map((s) => s.name)).toEqual(["pH B", "운동 C"]);
    expect(applySensorFilter(items, "", { types: [SENSOR_TYPES[0]], makers: [], statuses: ["broken"] })).toEqual([]);
    expect(parseSensorFilter(new URLSearchParams("type=온도,무게&status=ok,lost"))).toEqual({ types: ["온도"], makers: [], statuses: ["ok"] });
  });
});

describe("[C1][S2] [C1][S17] 여러 개 삭제 규칙 = rules bulk_delete", () => {
  it(`전체 선택 = 지금 결과 앞 ${BULK.max}개 · 넘으면 capped · id 목록 1~${BULK.max}(중복 하나)`, () => {
    expect(BULK_MAX).toBe(BULK.max);
    expect(BULK.select_all).toMatch(/최대 100개/);
    const ids = Array.from({ length: BULK.max + 1 }, (_, i) => uuid(i));
    expect(selectAllIds(ids)).toEqual({ ids: ids.slice(0, BULK.max), capped: true });
    expect(selectAllIds(ids.slice(0, 3))).toEqual({ ids: ids.slice(0, 3), capped: false });
    expect(checkBulkIds([])).toBeNull();
    expect(checkBulkIds(ids)).toBeNull();
    expect(checkBulkIds([ids[0], ids[0], ids[1]])).toEqual([ids[0], ids[1]]);
    expect(checkBulkIds(["not-a-uuid"])).toBeNull();
    expect(checkBulkIds(ids.slice(0, BULK.max))).toHaveLength(BULK.max);
  });

  it("확인 모달 이름 줄 = 이름 3개 + '외 N개' (rules bulk_delete.confirm, 프레임 2-bulk-delete 예시)", () => {
    expect(BULK.confirm).toMatch(/이름 3개 \+ '외 N개'/);
    expect(bulkNamesText(["과산화수소", "구리 가루", "글리세린", "나프탈렌", "녹말 가루"])).toBe("과산화수소, 구리 가루, 글리세린 외 2개");
    expect(bulkNamesText(["a", "b"])).toBe("a, b");
  });
});

describe("[C1][S14] 가입 오류 요약 = rules signup_error · d7 §25", () => {
  it("문제 칸은 화면 위에서 아래 순서 · 약관만 빠지면 요약 = 시안 '약관에 동의해 주세요'", () => {
    const [termsExample] = quotes(rules.signup_error.summary as string);
    const ok = { neisCode: "X", displayName: "김", email: "a@b.cd", password: "12345678", passwordConfirm: "12345678", agreeTerms: true, agreePrivacy: true, agreeAge: true };
    expect(signupFieldProblems(ok)).toEqual([]);
    const termsOnly = signupFieldProblems({ ...ok, agreeTerms: false });
    expect(termsOnly.map((p) => p.field)).toEqual(["terms"]);
    expect(termsOnly[0].summary).toBe(termsExample);
    expect(signupFieldProblems({ ...ok, agreeAge: false }).map((p) => p.field), "만 14세 확인만 빠짐").toEqual(["terms"]);
    const all = signupFieldProblems({ neisCode: "", displayName: "", email: "x", password: "1", passwordConfirm: "", agreeTerms: false, agreePrivacy: false, agreeAge: false });
    expect(all.map((p) => p.field)).toEqual(["school", "displayName", "email", "password", "terms"]);
  });
});

describe("[C1][S4] 사용량 0 · 음수 = d7 §25 QA (4)", () => {
  it("0 · 음수 = nonpositive(같은 문구), 빈 값 = empty, 숫자 아님 = invalid", () => {
    expect(row("QA 수정")).toMatch(/\(4\) 사용량 0 = "사용량은 0보다 커야 해요", 음수도 같은 문구/);
    expect(checkAmount("0", 10).kind).toBe("nonpositive");
    expect(checkAmount("-3", 10).kind).toBe("nonpositive");
    expect(checkAmount("", 10).kind).toBe("empty");
    expect(checkAmount("abc", 10).kind).toBe("invalid");
    expect(checkAmount("2", 10)).toEqual({ kind: "ok", value: 2 });
  });
});
