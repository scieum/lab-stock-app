/**
 * 게시판 (화면 20, design/rules.json 1.32 board · d7 §30) — 분류·문구 상수. 화면 컴포넌트는 이 값을 표시만 한다.
 * 상태는 따로 저장하지 않는다: answer 가 있으면 '답변 완료', 없으면 '접수'. FAQ 는 상태 배지 없음.
 */
export const BOARD_HREF = "/board";
export const BOARD_LABEL = "게시판";

export type BoardCategory = "faq" | "bug" | "idea";

/** board-tabs 순서 = FAQ(맨 앞, 고정) · 오류 문의 · 개선 제안 */
export const BOARD_CATEGORIES: { value: BoardCategory; label: string }[] = [
  { value: "faq", label: "FAQ" },
  { value: "bug", label: "오류 문의" },
  { value: "idea", label: "개선 제안" },
];

/** 교사가 쓸 수 있는 분류 (board-form — FAQ 없음) */
export const BOARD_POST_CATEGORIES = BOARD_CATEGORIES.filter((c) => c.value !== "faq");

export function boardCategoryLabel(category: BoardCategory): string {
  return BOARD_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

export function isBoardCategory(v: unknown): v is BoardCategory {
  return v === "faq" || v === "bug" || v === "idea";
}

/** 글 제목·본문 길이 (d7 §30 board_posts check) */
export const BOARD_TITLE_MAX = 100;
export const BOARD_BODY_MAX = 5000;

/** 글쓴이 표시 = 학교명 + ' 선생님' (이름·이메일·역할은 다른 학교에 보이지 않는다) */
export function boardAuthorLabel(schoolName: string | null | undefined): string {
  return schoolName ? `${schoolName} 선생님` : "운영자";
}

export const BOARD_TEXT = {
  write: "글쓰기",
  submit: "등록",
  privacyNote: "학생 이름·연락처 같은 개인정보는 쓰지 마세요",
  statusReceived: "접수",
  statusAnswered: "답변 완료",
  answerHead: "운영자 답변",
  empty: "아직 올라온 글이 없어요",
  edit: "수정",
  delete: "삭제",
  editLocked: "답변이 달린 글은 고칠 수 없어요",
  hidden: "숨긴 글",
  categoryField: "분류",
  titleField: "제목",
  bodyField: "본문",
  titlePlaceholder: "제목을 입력하세요",
  bodyPlaceholder: "어떤 화면에서 어떤 일이 있었는지 적어 주세요",
  faqTitleField: "질문",
  faqBodyField: "답",
  posted: "글을 올렸어요",
  deleted: "글을 삭제했어요",
} as const;

/** 관리 탭 board-link 요약 caption (rules manage.guide 예: '답변 완료 1') — 0 이면 caption 없음 */
export function boardAnsweredCaption(count: number): string | null {
  return count > 0 ? `${BOARD_TEXT.statusAnswered} ${count}` : null;
}

/** 목록 한 번에 보이는 글 수 ('더 보기' 단위, d7 §30) */
export const BOARD_PAGE_SIZE = 20;

export type BoardInputField = "title" | "body";
export type BoardInputCheck =
  | { ok: true; title: string; body: string }
  | { ok: false; field: BoardInputField; error: string };

export const BOARD_INPUT_ERRORS = {
  titleEmpty: "제목을 입력하세요",
  titleLong: `제목은 ${BOARD_TITLE_MAX}자까지 쓸 수 있어요`,
  bodyEmpty: "본문을 입력하세요",
  bodyLong: `본문은 ${BOARD_BODY_MAX}자까지 쓸 수 있어요`,
} as const;

/**
 * 글 제목·본문 검사 (d7 §30 board_posts check 와 같은 기준) — 앞뒤 공백을 뗀 값으로 1~100자 · 1~5000자.
 * 통과하면 정리한 값을 돌려준다. FAQ(질문·답)와 운영자 답변(본문 기준)에도 같은 검사를 쓴다.
 */
export function checkBoardInput(title: unknown, body: unknown): BoardInputCheck {
  const t = typeof title === "string" ? title.trim() : "";
  const b = typeof body === "string" ? body.trim() : "";
  if (!t) return { ok: false, field: "title", error: BOARD_INPUT_ERRORS.titleEmpty };
  if ([...t].length > BOARD_TITLE_MAX) return { ok: false, field: "title", error: BOARD_INPUT_ERRORS.titleLong };
  if (!b) return { ok: false, field: "body", error: BOARD_INPUT_ERRORS.bodyEmpty };
  if ([...b].length > BOARD_BODY_MAX) return { ok: false, field: "body", error: BOARD_INPUT_ERRORS.bodyLong };
  return { ok: true, title: t, body: b };
}

/** 운영자 답변 검사 — 1~5000자 */
export function checkBoardAnswer(answer: unknown): { ok: true; answer: string } | { ok: false; error: string } {
  const a = typeof answer === "string" ? answer.trim() : "";
  if (!a) return { ok: false, error: "답변을 입력하세요" };
  if ([...a].length > BOARD_BODY_MAX) return { ok: false, error: `답변은 ${BOARD_BODY_MAX}자까지 쓸 수 있어요` };
  return { ok: true, answer: a };
}
