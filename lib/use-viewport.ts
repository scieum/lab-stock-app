"use client";

import { useSyncExternalStore } from "react";
import { DESKTOP_MEDIA_QUERY } from "@/lib/breakpoints";

function subscribe(cb: () => void) {
  const mq = window.matchMedia(DESKTOP_MEDIA_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

const isDesktop = () => window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
const unknown = () => null;

/**
 * 데스크톱 폭(≥ 1024)인가. 서버 렌더·하이드레이션 첫 그림에서는 null(아직 모름) —
 * 그때는 두 폭의 셸을 모두 그리고 CSS(@media)로 한쪽만 보이게 해 깜빡임이 없고,
 * 하이드레이션 뒤에는 맞지 않는 쪽을 DOM 에서 뺀다 (data-component 개수 = 실제 폭 기준).
 */
export function useIsDesktop(): boolean | null {
  return useSyncExternalStore(subscribe, isDesktop, unknown);
}
