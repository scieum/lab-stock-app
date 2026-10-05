/**
 * next/link 의 prefetch 값 정하기.
 * - 본문 자리 표시(loading.tsx)가 있는 화면(`/`·/reagents·/usage)과 로그인 전 화면은 기본값(undefined) —
 *   미리 받아 둔 자리 표시로 누른 즉시 넘어간다.
 * - 아직 없는 화면(/cabinets·/scan·/reorder)은 미리 받기가 404 요청만 만든다 → false.
 * - 매번 서버에서 그리고 loading 경계가 없는 화면(시약 상세·사용 기록 입력·입고·사용자 관리)은
 *   미리 받아도 쓸 것이 없고 행 수만큼 요청이 생긴다 → false (누른 즉시 반응은 LinkPending 표시가 맡는다).
 */
const NO_PREFETCH = [/^\/cabinets(\/|$)/, /^\/scan(\/|$)/, /^\/reorder(\/|$)/, /^\/reagents\/[^/]+/, /^\/usage\/new(\/|$)/, /^\/intake(\/|$)/, /^\/users(\/|$)/];

export function linkPrefetch(href: string): false | undefined {
  const path = href.split(/[?#]/, 1)[0];
  return NO_PREFETCH.some((re) => re.test(path)) ? false : undefined;
}
