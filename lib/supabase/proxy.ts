import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database";
import { getSupabasePublicEnv } from "./env";

/** 로그인 없이 열리는 경로 (화면 1·NEIS 중계·컴포넌트 갤러리) */
const PUBLIC_ROOTS = ["/login", "/api", "/gallery"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_ROOTS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/** proxy에서 세션 쿠키를 갱신하고, 로그인 안 된 사용자를 /login 으로 보낸다. */
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

  if (!signedIn && !isPublicPath(pathname)) {
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.search = "";
    if (pathname !== "/") to.searchParams.set("next", pathname + search);
    const redirect = NextResponse.redirect(to);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  return response;
}
