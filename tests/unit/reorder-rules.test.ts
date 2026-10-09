// 화면 6 재주문 알림 순수 규칙 (lib/reorder-rules) · 한국 날짜 표기 (lib/format formatKoreanDate).
// 기대값: harness/d7-data.md §11(알림 대상 stock < min_stock · 카드 문구 틀 "재주문 기준 {min_stock}{unit} / 현재 재고 {stock}{unit}" ·
//         기준 문구 두 형태 · 알림 날짜 "M월 D일 알림"(한국 시간, 올해가 아니면 "YYYY년 M월 D일 알림") · 부족한 정도가 큰 순 — 2026-10-08 디자인 1.21 맞춤),
//         design/rules.json reorder.card_text('재주문 기준 N{단위}' · '10월 7일 알림'),
//         design/frames/6-desktop.json(새 프레임 — 데스크톱 재구성 run c, dev-rules 1.13 desktop_migrated_screens 에 6:
//         알림 카드 3건의 값·날짜 "M월 D일 알림"·자동 배지·캡션 2종 — 캡션 문구는 d7 §23 "자동 기준 표시" 행).
//         구현에서 읽지 않는다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { formatKoreanDate } from "../../lib/format";
import {
  REORDER_NEED_LABEL,
  isReorderNeeded,
  reorderAlertDateText,
  reorderAmountParts,
  reorderAmountText,
  reorderBasisText,
  shortageRatio,
  sortByShortage,
} from "../../lib/reorder-rules";
import { ROOT } from "./helpers";
import { framePath } from "../frames";

// ---------- 기대값: rules.json reorder.card_text · d7 §11 (1.21) ----------
const RULES = JSON.parse(readFileSync(join(ROOT, "design/rules.json"), "utf8")) as { reorder: { card_text: string } };
const D7 = readFileSync(join(ROOT, "harness/d7-data.md"), "utf8");
/** rules.json card_text 의 '재주문 기준 N{단위}' 앞말 */
const NEED = /'([^']+) N\{단위\}'/.exec(RULES.reorder.card_text)?.[1] ?? "";
/** rules.json card_text 의 날짜 예시 '10월 7일 알림' */
const RULES_DATE = /'(\d{1,2}월 \d{1,2}일 알림)'/.exec(RULES.reorder.card_text)?.[1] ?? "";
/** d7 §11 카드 행의 수량 줄 틀: "{NEED} {min_stock}{unit} / {STOCK} {stock}{unit}" */
const D7_AMOUNT = /"([^"{]+) \{min_stock\}\{unit\} \/ ([^"{]+) \{stock\}\{unit\}"/.exec(
  D7.split(/\r?\n/).find((l) => l.startsWith("| 카드 |") && l.includes("reorder-alert-card")) ?? "",
);
const STOCK = D7_AMOUNT?.[2] ?? "";
/** d7 §11 "재주문 기준" 행 (2026-10-08): 직접 입력(source=manual·근거 없음) 카드의 기준 문구 줄은 "직접 입력" */
const D7_MANUAL_BASIS =
  /기준 문구 줄은 "([^"]+)"/.exec(D7.split(/\r?\n/).find((l) => l.startsWith("| 재주문 기준 |")) ?? "")?.[1] ?? "";
/** d7 §11 수량 줄 (숫자·단위 붙여 씀) */
const amountOf = (min: number | string, stock: number | string, unit: string) => `${NEED} ${min}${unit} / ${STOCK} ${stock}${unit}`;
/** "올해" 를 정하는 기준 시각: 한국 시간 2026-10-08 12:00 */
const NOW_2026 = new Date("2026-10-08T03:00:00Z");

// ---------- 새 프레임 6-desktop (run c) 의 알림 카드 ----------
// 카드: badge-low-stock · reagent-name · stock-line · [auto-caption] · alert-date.
// 자동 기준 카드는 stock-line 이 threshold · auto-threshold-badge "자동" · stock 세 조각, 그 아래 auto-caption.
// 새 프레임 날짜는 올해 모양 "M월 D일 알림"(d7 §11 · rules card_text 와 같음). 수량 줄은 프레임이 "100 mL" 처럼 띄어 써서
// 문구 틀(숫자·단위 붙여 씀)은 d7·rules 가 기대값이고, 시안에서는 값(재고 < 기준, 날짜, 자동 배지·캡션)만 읽는다.
type FrameNode = { name: string; path: string[]; text: { characters: string } | null };
const frame = JSON.parse(readFileSync(framePath("6-desktop"), "utf8")) as { frames: { nodes: FrameNode[] }[] };
type FrameCard = { name: string; line: string; badge: string | null; caption: string | null; date: string };
const FRAME_CARDS: FrameCard[] = (() => {
  const out: FrameCard[] = [];
  let cur: FrameCard | null = null;
  for (const n of frame.frames[0].nodes) {
    if (n.name === "reorder-alert-card") { cur = { name: "", line: "", badge: null, caption: null, date: "" }; out.push(cur); continue; }
    if (!cur || !n.path.includes("reorder-alert-card") || !n.text) continue;
    const t = n.text.characters;
    if (n.name === "reagent-name") cur.name = t;
    else if (n.path.includes("stock-line") && n.path.includes("auto-threshold-badge")) cur.badge = t;
    else if (n.name === "stock-line" || n.name === "threshold" || n.name === "stock") cur.line = cur.line ? `${cur.line} ${t}` : t;
    else if (n.name === "auto-caption") cur.caption = t;
    else if (n.name === "alert-date") cur.date = t;
  }
  return out;
})();
const FRAME_LINE_RE = /^재주문 기준 (\d+) (\S+) \/ 현재 재고 (\d+) (\S+)$/;
/** 새 프레임 날짜 = 올해 모양 (해 없음) */
const FRAME_DATE_RE = /^(\d{1,2})월 (\d{1,2})일 알림$/;
/** 새 프레임의 '오늘' 해 = NOW_2026 의 해 (13-desktop subtitle "오늘 10월 7일" 과 같은 해로 본다) */
const FRAME_YEAR = 2026;
/** d7 §23 "자동 기준 표시 (화면 3·6)" 행의 캡션 두 문구 (사용 기록 근거 · 입고량 근거) */
const D7_AUTO_CAPTIONS = [...(D7.split(/\r?\n/).find((l) => l.startsWith("| 자동 기준 표시")) ?? "").matchAll(/\*\*"([^"]+)"\*\*/g)].map((m) => m[1]);
/** 시안 카드 중 수량 줄이 "숫자 단위 / 숫자 단위" 꼴인 것 (1병(50 mL 남음) 같은 병 표기는 제외) */
const FRAME_SIMPLE = FRAME_CARDS.filter((c) => FRAME_LINE_RE.test(c.line)).map((c) => {
  const m = FRAME_LINE_RE.exec(c.line)!;
  return { ...c, minStock: Number(m[1]), unit: m[2], stock: Number(m[3]) };
});

// d7 §11 문구 틀 (1.21)
const AMOUNT_RE = new RegExp(String.raw`^${NEED} (\d+)([^\d\s]\S*) \/ ${STOCK} (\d+)([^\d\s]\S*)$`);
const BASIS_RE = /^1반 1회 실험량 (\d+) (\S+) × (\d+)조 기준$/;
const DATE_RE = /^(?:(\d{4})년 )?(\d{1,2})월 (\d{1,2})일 알림$/;

// d7 §11 틀로 만든 카드 예시 (시안 1.17 에는 근거 문구 카드가 없다): 필요량 = 1조 사용량 × 조 수
const CARDS = [
  { minStock: 60, stock: 30, unit: "g", perGroup: 10, groups: 6 },
  { minStock: 40, stock: 15, unit: "g", perGroup: 5, groups: 8 },
  ...FRAME_SIMPLE.map((c) => ({ minStock: c.minStock, stock: c.stock, unit: c.unit, perGroup: c.minStock, groups: 1 })),
].map((c) => ({
  ...c,
  amount: amountOf(c.minStock, c.stock, c.unit),
  basis: `1반 1회 실험량 ${c.perGroup} ${c.unit} × ${c.groups}조 기준`,
}));

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe("reorder rules: 기대값 원본", () => {
  it("[K1][S6] 기대값 원본: 새 프레임 6-desktop 알림 카드 3건 — 재고 < 기준, 날짜 \"M월 D일 알림\", 자동 카드 2건(배지 \"자동\" + d7 §23 캡션 두 형태)", () => {
    expect(FRAME_CARDS.length).toBe(3);
    for (const c of FRAME_CARDS) {
      expect(c.name, "시약명").not.toBe("");
      expect(c.date, `${c.name} 날짜`).toMatch(FRAME_DATE_RE);
      expect(c.date, `${c.name} 날짜 = d7 §11 모양`).toMatch(DATE_RE);
    }
    expect(FRAME_SIMPLE.length, "숫자 단위 / 숫자 단위 꼴 카드 (새 프레임은 3건 모두)").toBe(FRAME_CARDS.length);
    for (const c of FRAME_SIMPLE) expect(c.stock, `${c.name}: 재고 < 기준`).toBeLessThan(c.minStock);
    expect(D7_AUTO_CAPTIONS, "d7 §23 자동 기준 캡션 두 문구").toHaveLength(2);
    const autos = FRAME_CARDS.filter((c) => c.badge !== null);
    expect(autos.length).toBe(2);
    for (const a of autos) expect(a.badge).toBe("자동");
    expect(autos.map((a) => a.caption), "자동 카드 캡션 = d7 §23 두 형태 (사용 기록 근거 · 입고량 근거)").toEqual(D7_AUTO_CAPTIONS);
    for (const c of FRAME_CARDS.filter((x) => x.badge === null)) expect(c.caption, `${c.name}: 자동 아니면 캡션 없음`).toBeNull();
  });

  it("[K1][S6] 1.21 문구 틀: rules.json reorder.card_text 앞말 = d7 §11 카드 행 앞말, 날짜 예시 = d7 §11 날짜 모양", () => {
    expect(NEED, "rules.json card_text '… N{단위}'").toBe("재주문 기준");
    expect(D7_AMOUNT, "d7 §11 카드 행 수량 줄 틀").not.toBeNull();
    expect(D7_AMOUNT![1], "d7 앞말 = rules 앞말").toBe(NEED);
    expect(STOCK).toBe("현재 재고");
    expect(RULES_DATE, "rules.json card_text 날짜 예시").toBe("10월 7일 알림");
    expect(RULES_DATE).toMatch(DATE_RE);
    expect(D7, "d7 §11 날짜 모양").toContain('"M월 D일 알림"(한국 시간, 올해가 아니면 "YYYY년 M월 D일 알림"');
    expect(REORDER_NEED_LABEL, "구현 앞말 = rules.json card_text 앞말").toBe(NEED);
  });

  it("[K1][S6] d7 §11 틀: 카드 예시가 틀과 맞고, 필요량 = 1조 사용량 × 조 수, 재고 < 필요량", () => {
    for (const c of CARDS) {
      expect(c.amount).toMatch(AMOUNT_RE);
      expect(c.basis).toMatch(BASIS_RE);
      expect(c.perGroup * c.groups).toBe(c.minStock);
      expect(c.stock).toBeLessThan(c.minStock);
    }
  });
});

describe("reorder rules: 알림 대상 (stock < min_stock)", () => {
  it("[K1][S6] 재고가 필요량보다 적으면 알림", () => {
    for (const c of CARDS) expect(isReorderNeeded(c.stock, c.minStock)).toBe(true);
    expect(isReorderNeeded(0, 1)).toBe(true);
    expect(isReorderNeeded(59, 60)).toBe(true);
    expect(isReorderNeeded(9.9, 10)).toBe(true);
  });

  it("[K1][S6] 재고가 필요량과 같으면 알림이 아니다", () => {
    expect(isReorderNeeded(60, 60)).toBe(false);
    expect(isReorderNeeded(1, 1)).toBe(false);
    expect(isReorderNeeded(0.5, 0.5)).toBe(false);
  });

  it("[K1][S6] 재고가 필요량보다 많으면 알림이 아니다", () => {
    expect(isReorderNeeded(61, 60)).toBe(false);
    expect(isReorderNeeded(500, 60)).toBe(false);
  });

  it("[K1][S6] min_stock = 0 (재주문 알림 없음, d7 §6) 이면 재고가 0 이어도 알림이 아니다", () => {
    expect(isReorderNeeded(0, 0)).toBe(false);
    expect(isReorderNeeded(10, 0)).toBe(false);
  });
});

describe('reorder rules: "재주문 기준 {min_stock}{unit} / 현재 재고 {stock}{unit}" (d7 §11 · rules 1.21)', () => {
  it("[K1][S6] 카드 예시(d7 §11 틀 · 시안 카드 값) → amount 문구", () => {
    for (const c of CARDS) expect(reorderAmountText({ minStock: c.minStock, stock: c.stock, unit: c.unit })).toBe(c.amount);
  });

  it.each(["g", "mL", "병"])("[K1][S6] 단위 %s: 재주문 기준·현재 재고 양쪽에 같은 단위, 숫자와 붙여 씀", (unit) => {
    expect(reorderAmountText({ minStock: 5, stock: 2, unit })).toBe(amountOf(5, 2, unit));
  });

  it("[K1][S6] 현재 재고 0 도 그대로 적는다", () => {
    expect(reorderAmountText({ minStock: 40, stock: 0, unit: "g" })).toBe(amountOf(40, 0, "g"));
  });

  it("[K1][S6] 시안 1.17 예시 값: 재주문 기준 60g / 현재 재고 30g", () => {
    expect(reorderAmountText({ minStock: 60, stock: 30, unit: "g" })).toBe(`${NEED} 60g / ${STOCK} 30g`);
  });

  it("[K1][S6] 자동 기준 카드 조각(reorderAmountParts): need = \"재주문 기준 Nu\", stock = \"현재 재고 Mu\" — 이어 붙이면 수량 줄", () => {
    for (const c of CARDS) {
      const p = reorderAmountParts({ minStock: c.minStock, stock: c.stock, unit: c.unit });
      expect(p).toEqual({ need: `${NEED} ${c.minStock}${c.unit}`, stock: `${STOCK} ${c.stock}${c.unit}` });
      expect(`${p.need} / ${p.stock}`).toBe(c.amount);
    }
  });
});

describe("reorder rules: 기준 문구 두 형태", () => {
  it('[K1][S6] 1조 사용량·조 수가 있으면 "1반 1회 실험량 {per_group} {unit} × {groups}조 기준" (d7 §11 틀)', () => {
    for (const c of CARDS) {
      expect(reorderBasisText({ minStock: c.minStock, unit: c.unit, perGroup: c.perGroup, groups: c.groups })).toBe(c.basis);
    }
  });

  it.each([
    ["둘 다 null", null, null],
    ["둘 다 없음", undefined, undefined],
    ["1조 사용량만 있음", 10, null],
    ["조 수만 있음", null, 6],
  ])('[K1][S6] %s → 직접 입력 기준 문구 (d7 §11 2026-10-08: 수량 줄이 이미 "재주문 기준 N" 이라 "직접 입력")', (_label, perGroup, groups) => {
    expect(D7_MANUAL_BASIS, "d7 §11 '재주문 기준' 행에서 직접 입력 기준 문구를 읽음").not.toBe("");
    expect(reorderBasisText({ minStock: 60, unit: "g", perGroup, groups })).toBe(D7_MANUAL_BASIS);
    expect(reorderBasisText({ minStock: 60, unit: "g", perGroup, groups }), "같은 말 두 번 금지").not.toContain(NEED);
  });

  it.each(["g", "mL", "병"])("[K1][S6] 단위 %s 로 두 형태 모두", (unit) => {
    expect(reorderBasisText({ minStock: 500, unit, perGroup: null, groups: null })).toBe(D7_MANUAL_BASIS);
    expect(reorderBasisText({ minStock: 40, unit, perGroup: 5, groups: 8 })).toBe(`1반 1회 실험량 5 ${unit} × 8조 기준`);
  });
});

describe('reorder rules: 알림 날짜 "M월 D일 알림" · 올해가 아니면 "YYYY년 M월 D일 알림" (한국 시간, d7 §11 · rules 1.21)', () => {
  it("[K1][S6] 새 프레임 날짜(alert-date \"M월 D일 알림\")의 한국 날짜 낮 → 같은 글자 (올해), rules.json 예시 모양 \"10월 7일 알림\"", () => {
    for (const c of FRAME_CARDS) {
      const [, m, d] = FRAME_DATE_RE.exec(c.date)!;
      const day = `${FRAME_YEAR}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      expect(reorderAlertDateText(`${day}T02:10:00Z`, NOW_2026), `${c.name}`).toBe(c.date);
      expect(reorderAlertDateText(`${day}T11:10:00+09:00`, NOW_2026), `${c.name} (+09:00)`).toBe(c.date);
      expect(reorderAlertDateText(`${day}T02:10:00Z`, new Date(`${FRAME_YEAR + 1}-01-02T03:00:00Z`)), `${c.name} 다음 해에 보면 해 붙임`).toBe(`${FRAME_YEAR}년 ${c.date}`);
    }
    // 새 프레임 첫 카드 날짜 = rules.json card_text 예시
    expect(FRAME_CARDS[0].date).toBe(RULES_DATE);
  });

  it.each([
    ["UTC 14:59:59 = 한국 23:59:59 → 같은 날", "2026-09-29T14:59:59Z", "9월 29일 알림"],
    ["UTC 15:00:00 = 한국 다음 날 00:00 → 다음 날", "2026-09-29T15:00:00Z", "9월 30일 알림"],
    ["UTC 23:59:59 → 한국은 다음 날", "2026-09-29T23:59:59Z", "9월 30일 알림"],
    ["UTC 00:00:00 → 한국 09:00 같은 날", "2026-09-30T00:00:00Z", "9월 30일 알림"],
    ["UTC 9월 30일 15:00 → 한국 10월 1일 (달 넘김)", "2026-09-30T15:00:00Z", "10월 1일 알림"],
    ["한 자리 월·일은 0 을 채우지 않는다", "2026-03-05T03:00:00Z", "3월 5일 알림"],
    ["두 자리 월·일", "2026-10-12T03:00:00Z", "10월 12일 알림"],
    ["소수 초·+00:00 표기 (timestamptz)", "2026-09-29T15:00:00.123456+00:00", "9월 30일 알림"],
    ["올해 첫날 한국 00:00 (UTC 전년 12월 31일 15:00) → 올해", "2025-12-31T15:00:00Z", "1월 1일 알림"],
  ])("[K1][S6] 올해(한국 2026): %s", (_label, iso, want) => {
    expect(reorderAlertDateText(iso, NOW_2026)).toBe(want);
  });

  it.each([
    ["전년 한국 12월 31일 23:59:59 (UTC 14:59:59) → 해 붙임", "2025-12-31T14:59:59Z", "2025년 12월 31일 알림"],
    ["전년 10월 7일 → 해 붙임", "2025-10-07T03:00:00Z", "2025년 10월 7일 알림"],
    ["UTC 12월 31일 15:00 → 한국 새해 1월 1일 (해 넘김) — 기준이 2026 이면 2027년", "2026-12-31T15:00:00Z", "2027년 1월 1일 알림"],
    ["두 해 전 한 자리 월·일", "2024-03-05T03:00:00Z", "2024년 3월 5일 알림"],
  ])("[K1][S6] 다른 해(한국 2026 기준): %s", (_label, iso, want) => {
    expect(reorderAlertDateText(iso, NOW_2026)).toBe(want);
  });

  it("[K1][S6] 올해는 '지금' 의 한국 날짜로 가른다 — 지금이 한국 새해 첫 순간이면 전날(12월 31일)은 다른 해", () => {
    const since = "2026-12-31T14:00:00Z"; // 한국 2026-12-31 23:00
    expect(reorderAlertDateText(since, new Date("2026-12-31T14:59:59Z")), "지금 = 한국 2026-12-31 23:59:59").toBe("12월 31일 알림");
    expect(reorderAlertDateText(since, new Date("2026-12-31T15:00:00Z")), "지금 = 한국 2027-01-01 00:00").toBe("2026년 12월 31일 알림");
    // UTC 로는 아직 2026 이지만 한국은 2027
    expect(reorderAlertDateText("2026-12-31T15:30:00Z", new Date("2026-12-31T16:00:00Z")), "알림·지금 모두 한국 2027-01-01").toBe("1월 1일 알림");
  });

  it("[K1][S6] Date 객체도 같은 결과", () => {
    expect(reorderAlertDateText(new Date("2026-09-29T15:00:00Z"), NOW_2026)).toBe("9월 30일 알림");
    expect(reorderAlertDateText(new Date("2026-09-29T14:59:59Z"), NOW_2026)).toBe("9월 29일 알림");
    expect(reorderAlertDateText(new Date("2025-09-29T14:59:59Z"), NOW_2026)).toBe("2025년 9월 29일 알림");
  });

  it("[K1][S6] now 를 주지 않으면 지금을 기준으로 — 지금 막 부족해진 시약은 해 없이 \"M월 D일 알림\"", () => {
    const t = reorderAlertDateText(new Date());
    expect(t).toMatch(DATE_RE);
    expect(t, "올해 날짜에는 해를 붙이지 않는다").not.toMatch(/년/);
  });

  it.each(["UTC", "America/Los_Angeles", "Asia/Seoul", "Pacific/Kiritimati"])("[K1][S6] 실행 환경 시간대(TZ=%s)와 무관하게 한국 날짜·한국 해", (tz) => {
    process.env.TZ = tz;
    expect(reorderAlertDateText("2026-09-29T15:00:00Z", NOW_2026)).toBe("9월 30일 알림");
    expect(reorderAlertDateText("2026-09-29T14:59:59Z", NOW_2026)).toBe("9월 29일 알림");
    expect(reorderAlertDateText(new Date("2026-12-31T15:00:00Z"), NOW_2026)).toBe("2027년 1월 1일 알림");
    expect(reorderAlertDateText("2026-12-31T14:00:00Z", new Date("2026-12-31T15:00:00Z"))).toBe("2026년 12월 31일 알림");
  });

  it.each([["null", null], ["undefined", undefined], ["빈 문자열", ""], ["날짜가 아닌 글자", "알 수 없음"]])("[K1][S6] 날짜 %s → 표시 없음(null)", (_label, v) => {
    expect(reorderAlertDateText(v, NOW_2026)).toBeNull();
    expect(reorderAlertDateText(v)).toBeNull();
  });
});

describe("formatKoreanDate (d7 §11 날짜 표기 · rules 1.21 '화면 3 용어·사용일 안내와 같은 표기')", () => {
  it.each([
    ["올해 → 해 없이", "2026-10-07T03:00:00Z", NOW_2026, "10월 7일"],
    ["올해 한 자리 월·일", "2026-03-05T03:00:00Z", NOW_2026, "3월 5일"],
    ["다른 해 → 해 붙임", "2025-10-07T03:00:00Z", NOW_2026, "2025년 10월 7일"],
    ["다음 해 → 해 붙임", "2027-01-02T03:00:00Z", NOW_2026, "2027년 1월 2일"],
    ["한국 자정 경계: UTC 15:00 = 한국 다음 날", "2026-10-06T15:00:00Z", NOW_2026, "10월 7일"],
    ["한국 자정 직전: UTC 14:59:59 = 한국 같은 날", "2026-10-06T14:59:59Z", NOW_2026, "10월 6일"],
    ["해 경계: 한국 새해 00:00 의 날짜, 지금도 새해", "2026-12-31T15:00:00Z", new Date("2027-01-01T00:00:00Z"), "1월 1일"],
    ["해 경계: 한국 12월 31일, 지금은 한국 새해", "2026-12-31T14:59:59Z", new Date("2026-12-31T15:00:00Z"), "2026년 12월 31일"],
  ])("[K1][S6] %s", (_label, iso, now, want) => {
    expect(formatKoreanDate(new Date(iso), now)).toBe(want);
  });

  it("[K1][S6] 알림 날짜 = formatKoreanDate + \" 알림\" (같은 표기)", () => {
    for (const iso of ["2026-10-07T03:00:00Z", "2025-12-31T14:59:59Z", "2026-12-31T15:00:00Z"]) {
      expect(reorderAlertDateText(iso, NOW_2026)).toBe(`${formatKoreanDate(new Date(iso), NOW_2026)} 알림`);
    }
  });

  it.each(["UTC", "America/Los_Angeles", "Pacific/Kiritimati"])("[K1][S6] 실행 환경 시간대(TZ=%s)와 무관", (tz) => {
    process.env.TZ = tz;
    expect(formatKoreanDate(new Date("2026-10-06T15:00:00Z"), NOW_2026)).toBe("10월 7일");
    expect(formatKoreanDate(new Date("2026-12-31T14:59:59Z"), new Date("2026-12-31T15:00:00Z"))).toBe("2026년 12월 31일");
  });
});

describe("reorder rules: 부족한 정도가 큰 순", () => {
  it("[K1][S6] shortageRatio: 부족하지 않으면 0, 부족하면 0 보다 크고 1 이하, 재고 0 이 가장 크다", () => {
    expect(shortageRatio(60, 60)).toBe(0);
    expect(shortageRatio(100, 60)).toBe(0);
    expect(shortageRatio(0, 0)).toBe(0);
    expect(shortageRatio(10, 0)).toBe(0);
    for (const c of CARDS) {
      const r = shortageRatio(c.stock, c.minStock);
      expect(r).toBeGreaterThan(0);
      expect(r).toBeLessThanOrEqual(1);
      expect(shortageRatio(0, c.minStock)).toBeGreaterThan(r);
    }
  });

  it("[K1][S6] shortageRatio: 필요량이 같으면 재고가 적을수록 크다", () => {
    const stocks = [59, 45, 30, 15, 1, 0];
    const ratios = stocks.map((s) => shortageRatio(s, 60));
    for (let i = 1; i < ratios.length; i++) expect(ratios[i]).toBeGreaterThan(ratios[i - 1]);
  });

  it("[K1][S6] sortByShortage: 필요량이 같은 시약은 재고가 적은 것부터", () => {
    const items = [
      { name: "가", stock: 50, minStock: 60 },
      { name: "나", stock: 0, minStock: 60 },
      { name: "다", stock: 30, minStock: 60 },
      { name: "라", stock: 10, minStock: 60 },
    ];
    expect(sortByShortage(items).map((r) => r.name)).toEqual(["나", "라", "다", "가"]);
  });

  it("[K1][S6] sortByShortage: 더 많이 모자라고 비율로도 더 모자란 시약이 앞 (단위가 달라도)", () => {
    // 가: 100 중 90 모자람(90%) · 나: 50 중 10 모자람(20%) · 다: 20 중 1 모자람(5%)
    const items = [
      { name: "다", stock: 19, minStock: 20 },
      { name: "가", stock: 10, minStock: 100 },
      { name: "나", stock: 40, minStock: 50 },
    ];
    expect(sortByShortage(items).map((r) => r.name)).toEqual(["가", "나", "다"]);
  });

  it("[K1][S6] sortByShortage: 넣은 시약이 그대로 다 나오고 원본 배열 순서는 바뀌지 않는다", () => {
    const items = [
      { name: "가", stock: 50, minStock: 60 },
      { name: "나", stock: 0, minStock: 60 },
      { name: "다", stock: 30, minStock: 60 },
    ];
    const copy = items.map((r) => ({ ...r }));
    const out = sortByShortage(items);
    expect(items).toEqual(copy);
    expect(out).toHaveLength(items.length);
    expect(out.map((r) => r.name).sort()).toEqual(["가", "나", "다"]);
    expect(out).not.toBe(items);
  });

  it("[K1][S6] sortByShortage: 0건·1건", () => {
    expect(sortByShortage([])).toEqual([]);
    expect(sortByShortage([{ name: "가", stock: 1, minStock: 2 }]).map((r) => r.name)).toEqual(["가"]);
  });
});
