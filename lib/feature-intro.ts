/**
 * 신기능 소개 팝업 (화면 13, design/rules.json 1.32 feature_intro · d7 §30) — 문구 상수.
 * 첫 소개 = AI 입고(화면 7 서류로 입고). 교사·admin, 홈에 들어올 때만.
 */
export const FEATURE_INTRO_TEXT = {
  tag: "새 기능",
  title: "거래명세서만 올리면 AI가 입고 목록을 채워요",
  steps: ["명세서·납품서 사진이나 PDF를 올려요", "AI가 시약 이름·규격·수량을 읽어요", "확인하고 한 번에 입고해요"],
  cta: "AI 입고 써 보기",
  dismissWeek: "일주일 동안 보지 않기",
  close: "닫기",
} as const;

/** 이 소개의 저장 키 (닫기 = sessionStorage, 일주일 = localStorage 만료 시각, 주 버튼 = localStorage 영구) */
export const FEATURE_INTRO_ID = "ai-intake-2026-10";
