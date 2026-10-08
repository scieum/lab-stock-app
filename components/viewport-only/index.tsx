"use client";

import { useIsDesktop } from "@/lib/use-viewport";
import styles from "./styles.module.css";

/**
 * 폭 전용 묶음 (시안 컴포넌트 아님 — data-component 없음).
 * 서버 렌더·하이드레이션 첫 그림(폭 모름)에는 두 폭 모두 그리고 CSS(@media 1024)로 한쪽만 보이게 한 뒤,
 * 하이드레이션 뒤에는 맞지 않는 쪽을 DOM 에서 뺀다 (data-component 개수 = 실제 폭 기준, 셸 AppNav 와 같은 방식).
 * 묶음 자체는 display: contents — 안쪽 요소의 배치에 끼어들지 않는다.
 */
export function MobileOnly({ children }: { children: React.ReactNode }) {
  const desktop = useIsDesktop();
  if (desktop === true) return null;
  return <div className={styles.mobileOnly}>{children}</div>;
}

export function DesktopOnly({ children }: { children: React.ReactNode }) {
  const desktop = useIsDesktop();
  if (desktop === false) return null;
  return <div className={styles.desktopOnly}>{children}</div>;
}
