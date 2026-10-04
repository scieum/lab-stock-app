import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database";
import { getSupabasePublicEnv } from "./env";

/** 로그인 없이 열리는 경로 (화면 1·14·비밀번호 찾기·확인 메일 링크·NEIS 중계·컴포넌트 갤러리·둘러보기 /demo) */
const PUBLIC_ROOTS = ["/login", "/signup", "/forgot-password", "/auth", "/api", "/gallery", "/demo"];

/**
 * 로그인된 사용자가 오면 홈(`/`)으로 보내는 경로 — 회원가입, 둘러보기 /demo·/demo/**
 * (dev-rules.json route_auth guest_note: 로그인 사용자가 /demo 에 오면 / 로)
 */
const GUEST_ONLY = ["/signup", "/demo"];

/** 화면 15 랜딩의 내부 세그먼트 (app/landing) — 주소창에는 드러나지 않는다 */
const LANDING_SEGMENT = "/landing";

export function isGuestOnlyPath(pathname: string): boolean {
  return GUEST_ONLY.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/**
 * 로그인 없이 열리는 경로. `/` 는 정확히 그 경로만 — 로그인 전이면 화면 15 랜딩, 로그인 후면 화면 13 홈
 * (dev-rules.json route_auth, 분기는 아래 updateSession 의 rewrite). /reagents 등 다른 보호 경로는 그대로 /login 으로 보낸다.
 */
export function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_ROOTS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/** proxy에서 세션 쿠키를 갱신하고, 로그인 안 된 사용자를 /login 으로 보낸다 (`/` 와 공개 경로 제외). */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = getSupabasePublicEnv();
  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims는 JWT를 검증한다 (쿠키 값을 그대로 믿지 않음)
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  if (!signedIn && pathname !== LANDING_SEGMENT && !isPublicPath(pathname)) {
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.search = "";
    to.searchParams.set("next", pathname + search);
    const redirect = NextResponse.redirect(to);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  // 화면 15 랜딩은 내부 세그먼트 /landing 에 있다 — 주소는 `/` 하나 (dev-rules.json route_auth).
  // 직접 연 /landing 은 `/` 로, 로그인 전 `/` 는 주소를 그대로 둔 채 /landing 을 보여 준다(rewrite).
  // 로그인 후 `/` 는 (app) 셸 아래의 홈(화면 13)으로 그대로 간다.
  if (pathname === LANDING_SEGMENT) {
    const to = request.nextUrl.clone();
    to.pathname = "/";
    to.search = "";
    const redirect = NextResponse.redirect(to);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  if (!signedIn && pathname === "/") {
    const to = request.nextUrl.clone();
    to.pathname = LANDING_SEGMENT;
    const rewrite = NextResponse.rewrite(to, { request });
    response.cookies.getAll().forEach((c) => rewrite.cookies.set(c));
    return rewrite;
  }

  if (signedIn && isGuestOnlyPath(pathname)) {
    const to = request.nextUrl.clone();
    to.pathname = "/";
    to.search = "";
    const redirect = NextResponse.redirect(to);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  return response;
}
