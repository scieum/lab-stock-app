// 게시판 글 입력 검사 (화면 20 board-form · 운영자 FAQ·답변) — harness/d7-data.md §30 '게시판 테이블':
//   title text(1~100자), body text(1~5000자). 답변(answer)도 본문과 같은 1~5000자(마이그레이션 board_posts_answer_len 과 같은 기준).
// 기대 한도는 d7 §30 문장에서 읽는다(숫자를 테스트에 박지 않는다). 글자 수 = 문자(코드 포인트) — DB char_length 와 같은 단위.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "./helpers";
import { checkBoardAnswer, checkBoardInput } from "../../lib/board";

const D7_TABLE_LINE = (() => {
  const line = readFileSync(join(ROOT, "harness", "d7-data.md"), "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("| 게시판 테이블"));
  if (!line) throw new Error("d7 §30 '게시판 테이블' 줄이 없습니다");
  return line;
})();
function d7Range(field: "title" | "body"): [number, number] {
  const m = D7_TABLE_LINE.match(new RegExp(`${field} text\\((\\d+)~(\\d+)자\\)`));
  if (!m) throw new Error(`d7 §30 에서 ${field} 길이를 찾지 못했습니다`);
  return [Number(m[1]), Number(m[2])];
}
const [TITLE_MIN, TITLE_MAX] = d7Range("title");
const [BODY_MIN, BODY_MAX] = d7Range("body");

const rep = (ch: string, n: number) => Array.from({ length: n }, () => ch).join("");

describe("[R-api][S20] checkBoardInput — 제목·본문 길이 (d7 §30)", () => {
  it("전제: d7 에서 읽은 한도", () => {
    expect([TITLE_MIN, TITLE_MAX, BODY_MIN, BODY_MAX].every((n) => Number.isInteger(n) && n >= 1)).toBe(true);
    expect(TITLE_MAX).toBeLessThan(BODY_MAX);
  });

  it("최소·최대 길이 경계는 통과, 정리한 값을 돌려준다", () => {
    for (const [t, b] of [
      [rep("가", TITLE_MIN), rep("나", BODY_MIN)],
      [rep("가", TITLE_MAX), rep("나", BODY_MAX)],
    ]) {
      expect(checkBoardInput(t, b)).toEqual({ ok: true, title: t, body: b });
    }
  });

  it(`제목 ${TITLE_MAX}+1자 = 제목 오류`, () => {
    const r = checkBoardInput(rep("가", TITLE_MAX + 1), "본문");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe("title");
  });

  it(`본문 ${BODY_MAX}+1자 = 본문 오류`, () => {
    const r = checkBoardInput("제목", rep("나", BODY_MAX + 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe("body");
  });

  it("빈 제목·공백만 있는 제목 = 제목 오류 (본문이 비어도 제목이 먼저)", () => {
    for (const t of ["", "   ", "\n\t "]) {
      const r = checkBoardInput(t, "");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.field).toBe("title");
    }
  });

  it("빈 본문·공백만 있는 본문 = 본문 오류", () => {
    for (const b of ["", "   ", "\n\n"]) {
      const r = checkBoardInput("제목", b);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.field).toBe("body");
    }
  });

  it("문자열이 아니면 빈 값으로 본다", () => {
    for (const v of [null, undefined, 123, {}, ["제목"]]) {
      const r = checkBoardInput(v, "본문");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.field).toBe("title");
      const r2 = checkBoardInput("제목", v);
      expect(r2.ok).toBe(false);
      if (!r2.ok) expect(r2.field).toBe("body");
    }
  });

  it("앞뒤 공백은 떼고 센다 (공백 포함 최대+2 → 뗀 뒤 최대 = 통과)", () => {
    const t = rep("가", TITLE_MAX);
    const b = rep("나", BODY_MAX);
    expect(checkBoardInput(` ${t} `, `\n${b}\n`)).toEqual({ ok: true, title: t, body: b });
  });

  it("글자 수는 문자(코드 포인트) 단위 — 이모지 최대 길이 통과, +1 거부 (DB char_length 와 같음)", () => {
    expect(checkBoardInput(rep("😀", TITLE_MAX), "본문").ok).toBe(true);
    expect(checkBoardInput(rep("😀", TITLE_MAX + 1), "본문").ok).toBe(false);
    expect(checkBoardInput("제목", rep("😀", BODY_MAX)).ok).toBe(true);
  });

  it("오류 문구는 사람이 읽을 문장 (빈 문자열 아님)", () => {
    const r = checkBoardInput("", "");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.trim().length).toBeGreaterThan(0);
  });
});

describe("[R-api][S20] checkBoardAnswer — 운영자 답변 1~본문 최대", () => {
  it("경계 통과 · 정리", () => {
    expect(checkBoardAnswer(" 답 ")).toEqual({ ok: true, answer: "답" });
    expect(checkBoardAnswer(rep("다", BODY_MAX))).toEqual({ ok: true, answer: rep("다", BODY_MAX) });
  });
  it("빈 값·공백·문자열 아님·최대+1 = 거부", () => {
    for (const v of ["", "   ", null, undefined, 1, rep("다", BODY_MAX + 1)]) expect(checkBoardAnswer(v).ok).toBe(false);
  });
});
