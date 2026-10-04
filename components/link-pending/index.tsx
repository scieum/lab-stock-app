"use client";

import { useLinkStatus } from "next/link";

/**
 * 누른 링크의 "이동 중" 표시용 숨은 표식 — 반드시 next/link 의 <Link> 안에 둔다.
 * 이동이 끝나기 전(서버 응답 대기)에는 data-pending 이 붙고, 각 컴포넌트 CSS 가 `:has([data-pending])` 로
 * 누른 즉시 모양을 바꾼다 (탭·nav 링크 = 활성 모양, 행·버튼 = 눌린 모양). 화면에 보이는 것·글자는 없다.
 * 시안 컴포넌트가 아니라 data-component 를 붙이지 않고, aria-current 도 건드리지 않는다 (활성 판정은 실제 경로 기준 그대로).
 */
export function LinkPending() {
  const { pending } = useLinkStatus();
  return <span hidden aria-hidden="true" data-pending={pending ? "true" : undefined} />;
}
