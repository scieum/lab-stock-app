// 화면 6 재주문 알림 순수 규칙 (lib/reorder-rules).
// 기대값: harness/d7-data.md §11(알림 대상 stock < min_stock · 카드 문구 틀 · 기준 문구 두 형태 · 알림 날짜 "YYYY.MM.DD 알림"(한국 시간) ·
//         부족한 정도가 큰 순), design/frames/6-desktop.json(시안 1.17 알림 카드 3건의 값·자동 배지·캡션 — 문구 틀은 d7).
//         구현에서 읽지 않는다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  isReorderNeeded,
  reorderAlertDateText,
  reorderAmountText,
  reorderBasisText,
  shortageRatio,
  sortByShortage,
} from "../../lib/reorder-rules";
import { ROOT } from "./helpers";

// ---------- 시안 프레임 6-desktop (1.17) 의 알림 카드 ----------
// 시안 1.17 카드: alert-info(badge-low-stock · reagent-name · stock-line · [auto-caption] · alert-date).
// 자동 기준 카드는 stock-line 이 threshold · auto-threshold-badge "자동" · stock 세 조각, 그 아래 auto-caption.
// 시안의 수량 줄 문구("재주문 기준 … / 현재 재고 …")와 날짜 모양("YYYY-MM-DD 알림")은 d7 §11 의 틀
// ("필요량 … / 현재 재고 …", "YYYY.MM.DD 알림")과 다르다 — d7 §18 이 바꾸지 않았으므로 문구 틀은 d7 §11 이 기대값이고,
// 시안에서는 값(재고 < 기준, 날짜 숫자, 자동 배지·캡션)만 읽는다.
type FrameNode = { name: string; path: string[]; text: { characters: string } | null };
const frame = JSON.parse(readFileSync(join(ROOT, "design/frames/6-desktop.json"), "utf8")) as { frames: { nodes: FrameNode[] }[] };
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
const FRAME_DATE_RE = /^(\d{4})-(\d{2})-(\d{2}) 알림$/;
/** 시안 카드 중 수량 줄이 "숫자 단위 / 숫자 단위" 꼴인 것 (1병(50 mL 남음) 같은 병 표기는 제외) */
const FRAME_SIMPLE = FRAME_CARDS.filter((c) => FRAME_LINE_RE.test(c.line)).map((c) => {
  const m = FRAME_LINE_RE.exec(c.line)!;
  return { ...c, minStock: Number(m[1]), unit: m[2], stock: Number(m[3]) };
});

// d7 §11 문구 틀
const AMOUNT_RE = /^필요량 (\d+) (\S+) \/ 현재 재고 (\d+) (\S+)$/;
const BASIS_RE = /^1반 1회 실험량 (\d+) (\S+) × (\d+)조 기준$/;
const DATE_RE = /^(\d{4})\.(\d{2})\.(\d{2}) 알림$/;

// d7 §11 틀로 만든 카드 예시 (시안 1.17 에는 근거 문구 카드가 없다): 필요량 = 1조 사용량 × 조 수
const CARDS = [
  { minStock: 60, stock: 30, unit: "g", perGroup: 10, groups: 6 },
  { minStock: 40, stock: 15, unit: "g", perGroup: 5, groups: 8 },
  ...FRAME_SIMPLE.map((c) => ({ minStock: c.minStock, stock: c.stock, unit: c.unit, perGroup: c.minStock, groups: 1 })),
].map((c) => ({
  ...c,
  amount: `필요량 ${c.minStock} ${c.unit} / 현재 재고 ${c.stock} ${c.unit}`,
  basis: `1반 1회 실험량 ${c.perGroup} ${c.unit} × ${c.groups}조 기준`,
}));

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

describe("reorder rules: 기대값 원본", () => {
  it("[K1][S6] 기대값 원본: 프레임 6-desktop(1.17) 알림 카드 3건 — 재고 < 기준, 날짜, 자동 카드 1건(배지 \"자동\" + 캡션)", () => {
    expect(FRAME_CARDS.length).toBe(3);
    for (const c of FRAME_CARDS) {
      expect(c.name, "시약명").not.toBe("");
      expect(c.date, `${c.name} 날짜`).toMatch(FRAME_DATE_RE);
    }
    expect(FRAME_SIMPLE.length, "숫자 단위 / 숫자 단위 꼴 카드").toBe(2);
    for (const c of FRAME_SIMPLE) expect(c.stock, `${c.name}: 재고 < 기준`).toBeLessThan(c.minStock);
    const autos = FRAME_CARDS.filter((c) => c.badge !== null);
    expect(autos.length).toBe(1);
    expect(autos[0].badge).toBe("자동");
    expect(autos[0].caption).toBe("최근 사용량으로 계산했어요");
    for (const c of FRAME_CARDS.filter((x) => x.badge === null)) expect(c.caption, `${c.name}: 자동 아니면 캡션 없음`).toBeNull();
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

describe('reorder rules: "필요량 {min_stock} {unit} / 현재 재고 {stock} {unit}"', () => {
  it("[K1][S6] 카드 예시(d7 §11 틀 · 시안 카드 값) → amount 문구", () => {
    for (const c of CARDS) expect(reorderAmountText({ minStock: c.minStock, stock: c.stock, unit: c.unit })).toBe(c.amount);
  });

  it.each(["g", "mL", "병"])("[K1][S6] 단위 %s: 필요량·현재 재고 양쪽에 같은 단위", (unit) => {
    expect(reorderAmountText({ minStock: 5, stock: 2, unit })).toBe(`필요량 5 ${unit} / 현재 재고 2 ${unit}`);
  });

  it("[K1][S6] 현재 재고 0 도 그대로 적는다", () => {
    expect(reorderAmountText({ minStock: 40, stock: 0, unit: "g" })).toBe("필요량 40 g / 현재 재고 0 g");
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
  ])('[K1][S6] %s → "재주문 기준 {min_stock} {unit}"', (_label, perGroup, groups) => {
    expect(reorderBasisText({ minStock: 60, unit: "g", perGroup, groups })).toBe("재주문 기준 60 g");
  });

  it.each(["g", "mL", "병"])("[K1][S6] 단위 %s 로 두 형태 모두", (unit) => {
    expect(reorderBasisText({ minStock: 500, unit, perGroup: null, groups: null })).toBe(`재주문 기준 500 ${unit}`);
    expect(reorderBasisText({ minStock: 40, unit, perGroup: 5, groups: 8 })).toBe(`1반 1회 실험량 5 ${unit} × 8조 기준`);
  });
});

describe('reorder rules: 알림 날짜 "YYYY.MM.DD 알림" (한국 시간)', () => {
  it("[K1][S6] 시안 날짜(alert-date)의 한국 날짜 낮 → 같은 날짜 숫자, d7 §11 모양 \"YYYY.MM.DD 알림\"", () => {
    const [, y, m, d] = FRAME_DATE_RE.exec(FRAME_CARDS[0].date)!;
    const want = `${y}.${m}.${d} 알림`;
    expect(want).toMatch(DATE_RE);
    expect(reorderAlertDateText(`${y}-${m}-${d}T02:10:00Z`)).toBe(want);
    expect(reorderAlertDateText(`${y}-${m}-${d}T11:10:00+09:00`)).toBe(want);
  });

  it.each([
    ["UTC 14:59:59 = 한국 23:59:59 → 같은 날", "2026-09-29T14:59:59Z", "2026.09.29 알림"],
    ["UTC 15:00:00 = 한국 다음 날 00:00 → 다음 날", "2026-09-29T15:00:00Z", "2026.09.30 알림"],
    ["UTC 23:59:59 → 한국은 다음 날", "2026-09-29T23:59:59Z", "2026.09.30 알림"],
    ["UTC 00:00:00 → 한국 09:00 같은 날", "2026-09-30T00:00:00Z", "2026.09.30 알림"],
    ["UTC 9월 30일 15:00 → 한국 10월 1일 (달 넘김)", "2026-09-30T15:00:00Z", "2026.10.01 알림"],
    ["UTC 12월 31일 15:00 → 한국 새해 1월 1일 (해 넘김)", "2026-12-31T15:00:00Z", "2027.01.01 알림"],
    ["한 자리 월·일은 0 을 채운다", "2026-03-05T03:00:00Z", "2026.03.05 알림"],
    ["소수 초·+00:00 표기 (timestamptz)", "2026-09-29T15:00:00.123456+00:00", "2026.09.30 알림"],
  ])("[K1][S6] %s", (_label, iso, want) => {
    expect(reorderAlertDateText(iso)).toBe(want);
  });

  it("[K1][S6] Date 객체도 같은 결과", () => {
    expect(reorderAlertDateText(new Date("2026-09-29T15:00:00Z"))).toBe("2026.09.30 알림");
    expect(reorderAlertDateText(new Date("2026-09-29T14:59:59Z"))).toBe("2026.09.29 알림");
  });

  it.each(["UTC", "America/Los_Angeles", "Asia/Seoul", "Pacific/Kiritimati"])("[K1][S6] 실행 환경 시간대(TZ=%s)와 무관하게 한국 날짜", (tz) => {
    process.env.TZ = tz;
    expect(reorderAlertDateText("2026-09-29T15:00:00Z")).toBe("2026.09.30 알림");
    expect(reorderAlertDateText("2026-09-29T14:59:59Z")).toBe("2026.09.29 알림");
    expect(reorderAlertDateText(new Date("2026-12-31T15:00:00Z"))).toBe("2027.01.01 알림");
  });

  it.each([["null", null], ["undefined", undefined], ["빈 문자열", ""], ["날짜가 아닌 글자", "알 수 없음"]])("[K1][S6] 날짜 %s → 표시 없음(null)", (_label, v) => {
    expect(reorderAlertDateText(v)).toBeNull();
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
