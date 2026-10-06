import "server-only";
import { headers } from "next/headers";

/**
 * 요청 기준 앱 주소 ("https://host") — QR 내용(시약장 QR · MSDS 대체 주소)에 쓴다.
 * 배포(Vercel)는 x-forwarded-host·proto, 로컬은 host 헤더. 환경변수·설정 값을 읽지 않는다.
 */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}

/** 요청 기준 절대 주소 (path 는 "/" 로 시작) */
export async function absoluteUrl(path: string): Promise<string> {
  return `${await requestOrigin()}${path}`;
}
