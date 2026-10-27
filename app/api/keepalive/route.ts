import { NextResponse, type NextRequest } from "next/server";
import { createAnonClient } from "@/lib/supabase/anon";

export const dynamic = "force-dynamic";

/**
 * GET /api/keepalive — Supabase 무료 플랜 무활동 일시정지(7일) 방지 (Vercel Cron 매일 1회, vercel.json).
 * 쿠키 없는 anon 클라이언트(publishable 키)로 가벼운 조회 1건만 보낸다 — RLS 로 0행이어도 DB 요청이면 충분.
 * service role 은 쓰지 않는다 (N2). CRON_SECRET 이 설정돼 있으면 Authorization: Bearer 를 검사한다.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const supabase = createAnonClient();
    const { error } = await supabase.from("schools").select("id", { count: "exact", head: true }).limit(1);
    if (error) throw error;
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[keepalive] supabase query failed:", err instanceof Error ? err.message : (err as { message?: string })?.message ?? String(err));
    return NextResponse.json({ ok: false }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
