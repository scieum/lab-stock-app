// 화면 4·10 사용일 순수 규칙 (lib/usage-history-rules — d7 §15, 디자인 1.17 usage_date).
// 기대값: harness/d7-data.md §15 (한국 날짜 · 기본 오늘 · 오늘 이후 거부 · 과거 하한 없음 · 캡션은 다를 때만),
//         design/rules.json usage_date.past_note "'10월 3일 사용으로 기록해요'" · usage_date.history "'10월 6일에 기록'",
//         design/frames/4-past-date-mobile.json(past-date-note 글자) · 10-mobile.json(record-caption 글자).
//         문구 틀은 rules·프레임 예시 문장에서 읽는다 (구현에서 읽지 않는다).
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { checkUsedOn, pastDateNoteText, recordedOnCaption, seoulDate, usageDayLabel, usageRowSubtitle } from "../../lib/usage-history-rules";
import { ROOT, read, rules } from "./helpers";

const UD = rules.usage_date as Record<string, string>;
const D7 = read(join(ROOT, "harness/d7-data.md"));
const D7_15 = D7.slice(D7.indexOf("## 15."), D7.indexOf("\n## ", D7.indexOf("## 15.") + 1));
type FrameNode = { name: string; text: { characters: string } | null };
const frameTexts = (file: string, name: string) =>
  (JSON.parse(read(join(ROOT, "design/frames", file))) as { frames: { nodes: FrameNode[] }[] }).frames[0].nodes
    .filter((n) => n.name === name && n.text)
    .map((n) => n.text!.characters);

/** "'10월 3일 사용으로 기록해요'" → 예시 문장 */
const quoted = (s: string) => (/'([^']+)'/.exec(s) ?? [])[1] ?? "";
const PAST_NOTE = quoted(UD.past_note);
const CAPTION = quoted(UD.history);
/** 예시 문장의 "M월 D일" 을 다른 날짜로 바꾼 기대 문장 */
const md = (ymd: string) => `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일`;
const withDate = (example: string, ymd: string) => example.replace(/\d{1,2}월 \d{1,2}일/, md(ymd));

describe("기대값 원본", () => {
  it("[K1][S4] rules usage_date 예시 문장 = 프레임 4-past-date · 10 의 글자, d7 §15 규칙 문장이 있다", () => {
    expect(PAST_NOTE).toBe("10월 3일 사용으로 기록해요");
    expect(CAPTION).toBe("10월 6일에 기록");
    expect(frameTexts("4-past-date-mobile.json", "note-text"), "4-past-date past-date-note 글자").toEqual([PAST_NOTE]);
    expect(frameTexts("10-mobile.json", "record-caption").every((t) => /^\d{1,2}월 \d{1,2}일에 기록$/.test(t)), "10 record-caption 틀").toBe(true);
    expect(D7_15).toMatch(/오늘\(한국 날짜\) 이후는 거부/);
    expect(D7_15).toMatch(/과거 하한은 두지 않는다/);
    expect(D7_15).toMatch(/기본 = 오늘 한국 날짜/);
  });
});

describe("seoulDate: 한국 날짜 (d7 §15 사용일 = 한국 날짜)", () => {
  it("[K1][S4] 한국 자정 경계: UTC 14:59:59.999 = 그날, 15:00 = 다음 날", () => {
    expect(seoulDate(new Date("2026-10-06T14:59:59.999Z"))).toBe("2026-10-06");
    expect(seoulDate(new Date("2026-10-06T15:00:00.000Z"))).toBe("2026-10-07");
    expect(seoulDate(new Date("2026-12-31T15:00:00.000Z")), "해 넘김").toBe("2027-01-01");
    expect(seoulDate(new Date("2028-02-28T15:30:00.000Z")), "윤년 2월 29일").toBe("2028-02-29");
  });

  it("[K1][S4] 형식 YYYY-MM-DD (두 자리 월·일), 인자 없으면 지금", () => {
    expect(seoulDate(new Date("2026-01-04T00:00:00.000Z"))).toBe("2026-01-04");
    const now = seoulDate();
    expect(now).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
    expect([fmt.format(new Date(Date.now() - 1000)), fmt.format(new Date())]).toContain(now);
  });
});

describe("checkUsedOn: 사용일 검사 (기본 오늘 · 오늘 이후 거부 · 과거 하한 없음)", () => {
  const TODAY = "2026-10-07";

  it("[K1][S4] 비었으면 오늘 (undefined · null · 빈 문자열)", () => {
    for (const v of [undefined, null, ""]) expect(checkUsedOn(v, TODAY), String(v)).toEqual({ ok: true, value: TODAY });
  });

  it("[K1][S4] 오늘 · 어제 · 지난달 · 아주 오래전(하한 없음)은 그대로", () => {
    for (const v of [TODAY, "2026-10-06", "2026-09-30", "2026-02-28", "2020-02-29", "1999-12-31"]) {
      expect(checkUsedOn(v, TODAY), v).toEqual({ ok: true, value: v });
    }
  });

  it("[K1][S4] 오늘 이후(내일 · 다음 달 · 내년)는 거부", () => {
    for (const v of ["2026-10-08", "2026-11-01", "2027-01-01"]) {
      const r = checkUsedOn(v, TODAY);
      expect(r.ok, v).toBe(false);
      if (!r.ok) expect(r.error.length, `${v} 안내 문구`).toBeGreaterThan(0);
    }
  });

  it("[K1][S4] 날짜가 아닌 값은 거부 (없는 날 · 형식 · 숫자)", () => {
    for (const v of ["2026-02-30", "2026-13-01", "2026-00-10", "2026-10-32", "2026-10-7", "20261007", "2026/10/07", "10월 3일", "abc", "2025-02-29"]) {
      expect(checkUsedOn(v, TODAY).ok, v).toBe(false);
    }
    for (const v of [20261007, true, {}, []]) expect(checkUsedOn(v, TODAY).ok, JSON.stringify(v)).toBe(false);
  });

  it("[K1][S4] 기준 오늘이 바뀌면 경계도 바뀐다 (한국 날짜 기준)", () => {
    expect(checkUsedOn("2026-10-08", "2026-10-08").ok).toBe(true);
    expect(checkUsedOn("2026-10-08", "2026-10-07").ok).toBe(false);
  });
});

describe("문구 (rules usage_date 예시 문장의 틀)", () => {
  it(`[K1][S4] past-date-note: "${PAST_NOTE}" 틀 (월·일 앞 0 없음)`, () => {
    expect(pastDateNoteText("2026-10-03")).toBe(PAST_NOTE);
    for (const d of ["2026-01-09", "2026-12-31", "2025-07-01"]) expect(pastDateNoteText(d), d).toBe(withDate(PAST_NOTE, d));
  });

  it(`[K1][S10] 기록일 캡션: "${CAPTION}" 틀 (월·일 앞 0 없음)`, () => {
    expect(recordedOnCaption("2026-10-06")).toBe(CAPTION);
    for (const d of ["2026-01-09", "2026-12-31", "2025-07-01"]) expect(recordedOnCaption(d), d).toBe(withDate(CAPTION, d));
  });
});

// ---------- 화면 10 사용일 묶음 헤더 · 행 사용자 줄 (d7 §15 정정 2026-10-07 — 시안 10(1.17) 그대로) ----------
// 기대 틀: design/frames/10-mobile.json group-label "10월 7일 · 오늘" · "10월 6일", record-sub "학생 이OO · 14:05"(같은 날) · "교사 김OO"(+ record-caption, 다른 날).
// 올해가 아닌 사용일은 연도를 붙인다 ("2025년 12월 3일") — 시안은 올해만 보여 주므로 연도가 없으면 해가 섞일 때 구분이 안 된다.
describe("usageDayLabel · usageRowSubtitle (화면 10 시안 1.17)", () => {
  const groupLabels = frameTexts("10-mobile.json", "group-label");
  const subs = frameTexts("10-mobile.json", "record-sub");
  const captions = frameTexts("10-mobile.json", "record-caption");
  const FRAME_TODAY = "2026-10-07"; // 시안의 "오늘"(10월 7일 · 오늘)

  it("[K1][S10] 시안 group-label 글자 = usageDayLabel (오늘 = 2026-10-07)", () => {
    expect(groupLabels.length, "시안 묶음 헤더").toBeGreaterThanOrEqual(2);
    const want = groupLabels.map((l) => {
      const m = /^(\d{1,2})월 (\d{1,2})일/.exec(l)!;
      return `2026-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    });
    expect(want.map((d) => usageDayLabel(d, FRAME_TODAY))).toEqual(groupLabels);
    expect(groupLabels[0]).toMatch(/ · 오늘$/);
  });

  it("[K1][S10] 오늘만 \" · 오늘\", 어제·지난달은 \"M월 D일\"(앞 0 없음), 다른 해는 \"YYYY년 M월 D일\"", () => {
    expect(usageDayLabel("2026-10-07", "2026-10-07")).toBe("10월 7일 · 오늘");
    expect(usageDayLabel("2026-10-06", "2026-10-07")).toBe("10월 6일");
    expect(usageDayLabel("2026-01-09", "2026-10-07")).toBe("1월 9일");
    expect(usageDayLabel("2025-12-03", "2026-10-07")).toBe("2025년 12월 3일");
    expect(usageDayLabel("2025-10-07", "2026-10-07"), "작년 같은 날은 오늘이 아님").toBe("2025년 10월 7일");
    expect(usageDayLabel("2027-01-01", "2027-01-01")).toBe("1월 1일 · 오늘");
    expect(usageDayLabel("2026-12-31", "2027-01-01"), "해 넘김 어제").toBe("2026년 12월 31일");
  });

  it("[K1][S10] 기본 오늘 = 한국 날짜 (seoulDate)", () => {
    const today = seoulDate();
    const label = usageDayLabel(today);
    // 자정 경계에서 한 번 더 확인
    expect([`${md(today)} · 오늘`, usageDayLabel(today, seoulDate())]).toContain(label);
  });

  it("[K1][S10] 사용자 줄: 기록한 날 = 사용일이면 \"이름 · HH:mm\", 다르면 이름만 — 시안 record-sub 틀", () => {
    expect(subs.some((s) => / · \d{2}:\d{2}$/.test(s)), "시안: 시각 붙은 사용자 줄").toBe(true);
    expect(subs.some((s) => !/ · /.test(s)), "시안: 이름만인 사용자 줄").toBe(true);
    expect(captions.length, "시안: 이름만인 줄 수 = 캡션 수").toBe(subs.filter((s) => !/ · /.test(s)).length);
    for (const s of subs) {
      const m = /^(.*) · (\d{2}:\d{2})$/.exec(s);
      if (m) expect(usageRowSubtitle(m[1], "2026-10-07", "2026-10-07", m[2]), s).toBe(s);
      else expect(usageRowSubtitle(s, "2026-10-03", "2026-10-07", "09:12"), s).toBe(s);
    }
    expect(usageRowSubtitle("학생 이OO", "2026-10-07", "2026-10-07", "09:05")).toBe("학생 이OO · 09:05");
    expect(usageRowSubtitle("학생 이OO", "2026-10-06", "2026-10-07", "00:10")).toBe("학생 이OO");
  });
});
