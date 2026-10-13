// 시약 전체 삭제 · 기록 삭제 규칙 (lib/wipe-rules) — 학교명 확인 · 문구 · 범위 · 날짜 · 미리보기 · 버튼 켜짐.
// 기준(구현이 아니라 여기서 도출): harness/d7-data.md §29(school-name-confirm · 시약 전체 삭제 · 기록 삭제 · 기록 삭제 DB),
//   design/rules.json wipe(entry · empty · school_name_confirm · reagent · record), design/frames 2-wipe-* · 10-record-wipe-* 글자.
// 문구 기대값은 rules 따옴표 글자 · 프레임 글자에서 읽는다 (구현 상수를 기대값으로 쓰지 않는다).
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  RECORD_WIPE_DEFAULT_RANGE,
  RECORD_WIPE_RANGE_OPTIONS,
  RECORD_WIPE_TEXT,
  REAGENT_WIPE_TEXT,
  SCHOOL_NAME_TEXT,
  canWipeReagents,
  canWipeRecords,
  checkWipeBeforeDate,
  defaultWipeBeforeDate,
  inWipeRange,
  reagentWipeDoneText,
  reagentWipeTitle,
  recordWipeButtonLabel,
  recordWipeDoneText,
  schoolNameConfirmCaption,
  schoolNameMatches,
  schoolNameState,
  wipeBeforeParam,
  wipePreviewText,
  wipeTotal,
} from "../../lib/wipe-rules";
import { ROOT, read, rules } from "./helpers";

type FrameNode = { name: string; path: string[]; text?: { characters: string } | null };
const frame = (name: string): FrameNode[] =>
  (JSON.parse(read(join(ROOT, "design/frames", `${name}.json`))) as { frames: { nodes: FrameNode[] }[] }).frames[0].nodes;
const texts = (nodes: FrameNode[], under: string, name?: string) =>
  nodes.filter((n) => n.text && n.path.slice(0, -1).includes(under) && (!name || n.name === name)).map((n) => n.text!.characters);
/** 조상 경로에 under 와 also 가 모두 있는 글자 */
const textsIn = (nodes: FrameNode[], under: string, also: string, name?: string) =>
  nodes.filter((n) => n.text && n.path.slice(0, -1).includes(under) && n.path.slice(0, -1).includes(also) && (!name || n.name === name)).map((n) => n.text!.characters);
const one = (xs: string[], what: string) => {
  if (xs.length < 1) throw new Error(`프레임에서 ${what} 를 읽지 못함`);
  return xs[0];
};

const W = rules.wipe as { entry: string; empty: string; school_name_confirm: string; reagent: string; record: string; roles: string[] };
const q = (s: string) => [...s.matchAll(/'([^']+)'/g)].map((m) => m[1]);
const pick = (s: string, pred: (x: string) => boolean, what: string) => {
  const v = q(s).find(pred);
  if (!v) throw new Error(`rules 에서 ${what} 를 읽지 못함`);
  return v;
};

const F2W = frame("2-wipe-mobile");
const F2WD = frame("2-wipe-desktop");
const F10W = frame("10-record-wipe-mobile");
const F10WD = frame("10-record-wipe-desktop");

/** 시안 school-name-confirm: caption · placeholder(= 학교명) */
const SNC = {
  caption: one(texts(F2W, "school-name-confirm", "caption"), "school-name-confirm caption"),
  school: one(texts(F2W, "school-name-confirm", "placeholder"), "school-name-confirm placeholder"),
};
/** 시안 2-wipe: 제목 · 본문 2줄 · 닫기 · 전체 삭제 */
const REAGENT = {
  heading: one(texts(F2W, "reagent-wipe", "heading"), "reagent-wipe heading"),
  bodies: texts(F2W, "ex-modal-card", "body"),
  close: one(texts(F2W, "button-outline", "label"), "닫기"),
  confirm: one(texts(F2W, "button-primary", "label"), "전체 삭제"),
};
/** 시안 10-record-wipe: 제목 · 라벨 · 구간 · 날짜 · caption · 미리보기 · 버튼 */
const RECORD = {
  title: one(texts(F10W, "record-wipe", "title"), "record-wipe title"),
  label: one(F10W.filter((n) => n.text && n.name === "label" && n.path[n.path.length - 2] === "record-wipe-range").map((n) => n.text!.characters), "지울 기간"),
  segments: textsIn(F10W, "record-wipe-range", "segmented-control", "label"),
  active: one(textsIn(F10W, "record-wipe-range", "segmented-control-active", "label"), "기본 구간"),
  date: one(texts(F10W, "text-input", "value").filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t)), "날짜"),
  caption: one(texts(F10W, "record-wipe-range", "caption"), "이 날짜 caption"),
  preview: one(texts(F10W, "wipe-preview", "body"), "wipe-preview body"),
  previewNote: one(texts(F10W, "wipe-preview", "body-sm"), "wipe-preview body-sm"),
  button: one(texts(F10W, "sheet-actions", "label"), "기록 N건 삭제"),
};
const nums = (s: string) => [...s.matchAll(/\d+/g)].map((m) => Number(m[0]));
const PREVIEW_COUNTS = { usage: nums(RECORD.preview)[0], intake: nums(RECORD.preview)[1] };

describe("[C1][S*] 학교명 확인 school-name-confirm (rules wipe.school_name_confirm · d7 §29)", () => {
  it("[C1][S*] 기대값 원본: rules '앞뒤 공백만 정리하고 정확히 같아야' (d7) · '학교 이름이 달라요' · 시안 caption · placeholder = 학교명 · 두 폭 같은 글자", () => {
    expect(read(join(ROOT, "harness/d7-data.md"))).toContain("앞뒤 공백만 정리하고 정확히 같아야 확인 버튼 켜짐");
    expect(q(W.school_name_confirm)).toContain("학교 이름이 달라요");
    expect(SNC.caption).toContain(SNC.school);
    expect(texts(F2WD, "school-name-confirm", "caption")).toEqual([SNC.caption]);
    expect(texts(F10W, "school-name-confirm", "caption")).toEqual([SNC.caption]);
    expect(texts(F10WD, "school-name-confirm", "caption")).toEqual([SNC.caption]);
  });

  it("[C1][S*] 같음 = true · 앞뒤 공백(스페이스 · 탭 · 줄바꿈 · 전각 공백) 정리 = true", () => {
    const s = SNC.school;
    expect(schoolNameMatches(s, s)).toBe(true);
    for (const v of [` ${s}`, `${s} `, `  ${s}  `, `\t${s}\n`, `　${s}　`]) expect(schoolNameMatches(v, s), JSON.stringify(v)).toBe(true);
    expect(schoolNameMatches(s, ` ${s} `), "우리 학교명 쪽 앞뒤 공백도 정리").toBe(true);
  });

  it("[C1][S*] 가운데 공백 · 대소문자 · 비슷한 이름 · 일부 · 덧붙임 = false", () => {
    const s = SNC.school;
    const similar = [
      `${s.slice(0, 2)} ${s.slice(2)}`, // 가운데 공백
      s.slice(0, -1), // 한 글자 빠짐
      `${s}교`, // 덧붙임
      s.replace("고등학교", "고교"), // 줄임말
      s.replace("고등", "중"), // 다른 학교급
      "데모 학교",
    ];
    for (const v of similar) expect(schoolNameMatches(v, s), v).toBe(false);
    expect(schoolNameMatches("Lab High School", "lab high school"), "대소문자 다름").toBe(false);
    expect(schoolNameMatches("LAB 고등학교", "Lab 고등학교"), "대소문자 다름").toBe(false);
    expect(schoolNameMatches("Lab 고등학교", "Lab 고등학교")).toBe(true);
  });

  it("[C1][S*] 빈 칸 · 공백만 = false (학교명이 비어 있어도 켜지지 않음)", () => {
    for (const v of ["", " ", "\t\n"]) expect(schoolNameMatches(v, SNC.school), JSON.stringify(v)).toBe(false);
    expect(schoolNameMatches("", ""), "둘 다 빈 칸").toBe(false);
    expect(schoolNameMatches(" ", " "), "둘 다 공백").toBe(false);
  });

  it("[C1][S*] 상태: 빈 칸 = empty(안내 없음) · 다름 = mismatch · 같음 = match · '다름' 문구 = rules '학교 이름이 달라요'", () => {
    expect(schoolNameState("", SNC.school)).toBe("empty");
    expect(schoolNameState("   ", SNC.school)).toBe("empty");
    expect(schoolNameState(SNC.school.slice(0, 2), SNC.school)).toBe("mismatch");
    expect(schoolNameState(` ${SNC.school} `, SNC.school)).toBe("match");
    expect(SCHOOL_NAME_TEXT.mismatch).toBe(pick(W.school_name_confirm, (x) => x.includes("달라요"), "다름 문구"));
  });

  it(`[C1][S*] caption = 시안 글자 그대로 ('${SNC.caption}')`, () => {
    expect(schoolNameConfirmCaption(SNC.school)).toBe(SNC.caption);
    expect(schoolNameConfirmCaption(` ${SNC.school} `), "앞뒤 공백은 caption 에도 없음").toBe(SNC.caption);
  });
});

describe("[C1][S2] 시약 전체 삭제 문구 · 버튼 (rules wipe.reagent · entry · empty, 시안 2-wipe)", () => {
  const N = nums(REAGENT.heading)[0];

  it("[C1][S2] 기대값 원본: 시안 2-wipe 두 폭 글자 같음 · rules reagent 문구 = 시안", () => {
    expect(texts(F2WD, "reagent-wipe", "heading")).toEqual([REAGENT.heading]);
    expect(texts(F2WD, "ex-modal-card", "body")).toEqual(REAGENT.bodies);
    expect(REAGENT.bodies).toHaveLength(2);
    expect(q(W.reagent)).toEqual(expect.arrayContaining([REAGENT.close, REAGENT.confirm, REAGENT.heading.replace(String(N), "{N}")]));
    expect(q(W.reagent).join(" ")).toContain(REAGENT.bodies.join(" "));
  });

  it("[C1][S2] 메뉴 항목 '시약 전체 삭제' · 0건 caption '지울 시약이 없어요' (rules entry · empty)", () => {
    expect(REAGENT_WIPE_TEXT.item).toBe(pick(W.entry, (x) => x.startsWith("시약"), "시약 전체 삭제"));
    expect(REAGENT_WIPE_TEXT.empty).toBe(pick(W.empty, (x) => x.includes("시약"), "지울 시약이 없어요"));
  });

  it(`[C1][S2] 제목 '${REAGENT.heading}' · 본문 2줄 · '${REAGENT.close}' · '${REAGENT.confirm}' = 시안 · 토스트 = rules '시약 {N}종을 삭제했어요'`, () => {
    expect(reagentWipeTitle(N)).toBe(REAGENT.heading);
    expect(reagentWipeTitle(3)).toBe(REAGENT.heading.replace(String(N), "3"));
    expect([REAGENT_WIPE_TEXT.body, REAGENT_WIPE_TEXT.note]).toEqual(REAGENT.bodies);
    expect(REAGENT_WIPE_TEXT.close).toBe(REAGENT.close);
    expect(REAGENT_WIPE_TEXT.confirm).toBe(REAGENT.confirm);
    const toast = pick(W.reagent, (x) => x.endsWith("삭제했어요"), "시약 삭제 토스트");
    expect(reagentWipeDoneText(N)).toBe(toast.replace("{N}", String(N)));
  });

  it("[C1][S2] '전체 삭제' 켜짐 = 지울 시약 > 0 · 학교명 같음 · 저장 중 아님 (하나라도 아니면 꺼짐)", () => {
    expect(canWipeReagents({ count: N, schoolNameOk: true })).toBe(true);
    expect(canWipeReagents({ count: N, schoolNameOk: true, pending: false })).toBe(true);
    expect(canWipeReagents({ count: N, schoolNameOk: false })).toBe(false);
    expect(canWipeReagents({ count: 0, schoolNameOk: true })).toBe(false);
    expect(canWipeReagents({ count: N, schoolNameOk: true, pending: true })).toBe(false);
  });
});

describe("[C1][S10] 기록 삭제 범위 · 날짜 · 미리보기 (rules wipe.record · d7 §29 기록 삭제 · 기록 삭제 DB, 시안 10-record-wipe)", () => {
  const TODAY = "2026-10-13";

  it("[C1][S10] 기대값 원본: rules '전체 | 이 날짜 이전'(기본 '이 날짜 이전') · 미래 불가 · 그날 미포함 = 시안 구간 · 활성 · caption", () => {
    const seg = pick(W.record, (x) => x.includes("|"), "segmented 구간").split("|").map((s) => s.trim());
    expect(RECORD.segments).toEqual(seg);
    expect(RECORD.active).toBe(pick(W.record, (x) => x.startsWith("이 날짜") && !x.includes("|"), "기본 구간"));
    expect(W.record).toContain("미래 불가");
    expect(W.record).toContain("그날 미포함");
    expect(textsIn(F10WD, "record-wipe-range", "segmented-control", "label")).toEqual(RECORD.segments);
  });

  it("[C1][S10] 구간 글자 · 순서 = 시안 · 기본 = '이 날짜 이전' · 제목 · 라벨 · caption = 시안", () => {
    expect(RECORD_WIPE_RANGE_OPTIONS.map((o) => o.label)).toEqual(RECORD.segments);
    expect(RECORD_WIPE_RANGE_OPTIONS.find((o) => o.value === RECORD_WIPE_DEFAULT_RANGE)!.label).toBe(RECORD.active);
    expect(RECORD_WIPE_TEXT.title).toBe(RECORD.title);
    expect(RECORD_WIPE_TEXT.item).toBe(pick(W.entry, (x) => x.startsWith("기록"), "기록 삭제"));
    expect(RECORD_WIPE_TEXT.empty).toBe(pick(W.empty, (x) => x.includes("기록"), "지울 기록이 없어요"));
    expect(RECORD_WIPE_TEXT.rangeLabel).toBe(RECORD.label);
    expect(RECORD_WIPE_TEXT.beforeNote).toBe(RECORD.caption);
  });

  it("[C1][S10] 날짜: 오늘 · 과거 = 됨 · 내일 이후 = future · 달력에 없는 날 · 틀린 모양 = invalid", () => {
    expect(checkWipeBeforeDate(TODAY, TODAY)).toEqual({ ok: true });
    expect(checkWipeBeforeDate(RECORD.date, TODAY)).toEqual({ ok: true });
    expect(checkWipeBeforeDate("2020-01-01", TODAY)).toEqual({ ok: true });
    for (const d of ["2026-10-14", "2026-11-01", "2027-01-01"]) expect(checkWipeBeforeDate(d, TODAY), d).toEqual({ ok: false, reason: "future" });
    for (const d of ["2026-02-30", "2026-13-01", "2026-9-1", "2026/09/01", "", "어제"]) expect(checkWipeBeforeDate(d, TODAY), d).toEqual({ ok: false, reason: "invalid" });
    expect(checkWipeBeforeDate("2024-02-29", TODAY), "윤년 2월 29일").toEqual({ ok: true });
  });

  it("[C1][S10] 날짜 칸 처음 값 = 달력에 있는 날 · 오늘보다 뒤 아님 (미래 불가)", () => {
    for (const today of [TODAY, "2026-01-01", "2026-03-31", "2024-02-29"]) {
      const d = defaultWipeBeforeDate(today);
      expect(checkWipeBeforeDate(d, today), `${today} → ${d}`).toEqual({ ok: true });
    }
  });

  it(`[C1][S10] 범위: '이 날짜 이전' ${RECORD.date} = 그 전날까지 (그날 · 뒤 미포함) · '전체' = 전부`, () => {
    const day = RECORD.date;
    const prev = new Date(`${day}T00:00:00Z`);
    prev.setUTCDate(prev.getUTCDate() - 1);
    const prevDay = prev.toISOString().slice(0, 10);
    expect(inWipeRange(prevDay, day), `${prevDay} 지움`).toBe(true);
    expect(inWipeRange("2020-01-01", day)).toBe(true);
    expect(inWipeRange(day, day), "그날은 남김").toBe(false);
    expect(inWipeRange(TODAY, day), "뒤 날짜 남김").toBe(false);
    for (const d of [prevDay, day, TODAY]) expect(inWipeRange(d, null), `전체 ${d}`).toBe(true);
  });

  it("[C1][S10] DB 에 넘길 p_before: '전체' = null · '이 날짜 이전' = 그 날짜 · 미래 · 틀린 날짜 = 부르지 않음(undefined)", () => {
    const all = RECORD_WIPE_RANGE_OPTIONS.find((o) => o.label === RECORD.segments[0])!.value;
    const before = RECORD_WIPE_RANGE_OPTIONS.find((o) => o.label === RECORD.active)!.value;
    expect(wipeBeforeParam(all, RECORD.date, TODAY)).toBeNull();
    expect(wipeBeforeParam(all, "2099-01-01", TODAY), "전체는 날짜 칸을 보지 않음").toBeNull();
    expect(wipeBeforeParam(before, RECORD.date, TODAY)).toBe(RECORD.date);
    expect(wipeBeforeParam(before, TODAY, TODAY), "오늘 = 어제까지").toBe(TODAY);
    expect(wipeBeforeParam(before, "2026-10-14", TODAY)).toBeUndefined();
    expect(wipeBeforeParam(before, "2026-02-30", TODAY)).toBeUndefined();
  });

  it(`[C1][S10] 미리보기 '${RECORD.preview}' · 안내 = 시안 · 0건 = rules '이 기간에 지울 기록이 없어요'`, () => {
    expect(wipePreviewText(PREVIEW_COUNTS)).toBe(RECORD.preview);
    expect(RECORD_WIPE_TEXT.previewNote).toBe(RECORD.previewNote);
    expect(q(W.record)).toContain(RECORD.previewNote);
    const empty = pick(W.record, (x) => x.includes("지울 기록이 없어요"), "0건 문구");
    expect(wipePreviewText({ usage: 0, intake: 0 })).toBe(empty);
    expect(RECORD_WIPE_TEXT.previewEmpty).toBe(empty);
    expect(wipePreviewText({ usage: 0, intake: 3 }), "한쪽만 0 = 0건도 그대로 적음").toBe(RECORD.preview.replace(/\d+/, "0").replace(/(입고 기록 )\d+/, "$13"));
    expect(wipePreviewText({ usage: 5, intake: 0 })).toBe(RECORD.preview.replace(/\d+/, "5").replace(/(입고 기록 )\d+/, "$10"));
  });

  it(`[C1][S10] 버튼 '${RECORD.button}' = 사용 + 입고 합 · 토스트 = rules '기록 {N}건을 삭제했어요' (N = 지운 합)`, () => {
    expect(wipeTotal(PREVIEW_COUNTS)).toBe(nums(RECORD.button)[0]);
    expect(recordWipeButtonLabel(PREVIEW_COUNTS)).toBe(RECORD.button);
    const toast = pick(W.record, (x) => x.endsWith("삭제했어요"), "기록 삭제 토스트");
    expect(recordWipeDoneText(PREVIEW_COUNTS)).toBe(toast.replace("{N}", String(wipeTotal(PREVIEW_COUNTS))));
  });

  it("[C1][S10] 기록 삭제 버튼 켜짐 = 미리보기 수 > 0 · 날짜 맞음 · 학교명 같음 · 저장 중 아님 (세는 중 null = 꺼짐)", () => {
    const ok = { counts: PREVIEW_COUNTS, dateOk: true, schoolNameOk: true };
    expect(canWipeRecords(ok)).toBe(true);
    expect(canWipeRecords({ ...ok, counts: { usage: 0, intake: 1 } })).toBe(true);
    expect(canWipeRecords({ ...ok, counts: null }), "세는 중").toBe(false);
    expect(canWipeRecords({ ...ok, counts: { usage: 0, intake: 0 } }), "0건").toBe(false);
    expect(canWipeRecords({ ...ok, dateOk: false }), "날짜 틀림").toBe(false);
    expect(canWipeRecords({ ...ok, schoolNameOk: false }), "학교명 다름").toBe(false);
    expect(canWipeRecords({ ...ok, pending: true }), "저장 중").toBe(false);
  });
});
