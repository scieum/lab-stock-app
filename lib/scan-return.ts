"use client";

// 화면 12 nav-close "들어온 화면, 없으면 /" (d7 §26 화면 12 모양).
// 로그인 셸이 화면을 옮길 때마다 /scan 이 아닌 마지막 주소를 탭 세션(sessionStorage)에 적어 두고, /scan 의 × 가 그 주소로 간다.
// 주소창에서 바로 연 QR 링크(새 탭)처럼 적힌 것이 없으면 "/".
import { useEffect, useSyncExternalStore } from "react";

const KEY = "labstock:scan-return";
const SCAN_PATH = "/scan";

function isScanPath(path: string): boolean {
  return path === SCAN_PATH || path.startsWith(`${SCAN_PATH}?`) || path.startsWith(`${SCAN_PATH}/`);
}

/** 같은 앱 안 경로만 ("/" 로 시작, "//"·역슬래시 없음, /scan 아님) */
export function safeReturnPath(raw: unknown): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  if (isScanPath(raw)) return "/";
  return raw;
}

/** 셸이 부른다 — /scan 이 아닌 화면에 들어올 때마다 그 주소(쿼리 포함)를 기억한다 */
export function useRememberScanReturn(pathname: string): void {
  useEffect(() => {
    if (isScanPath(pathname)) return;
    try {
      window.sessionStorage.setItem(KEY, `${window.location.pathname}${window.location.search}`);
    } catch {
      // 저장소를 못 쓰면 × 는 "/" 로 간다
    }
  }, [pathname]);
}

function readStored(): string {
  try {
    return safeReturnPath(window.sessionStorage.getItem(KEY));
  } catch {
    return "/";
  }
}

const noSubscribe = () => () => {};
const serverHref = () => "/";

/** /scan 의 nav-close 주소 — 서버·첫 그림은 "/", 하이드레이션 뒤 기억한 주소 */
export function useScanReturnHref(enabled: boolean): string {
  const href = useSyncExternalStore(noSubscribe, readStored, serverHref);
  return enabled ? href : "/";
}
