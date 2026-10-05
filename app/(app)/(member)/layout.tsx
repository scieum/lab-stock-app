import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * 학교 소속이 있어야 열리는 화면(/reagents·/usage·/intake·/users …)의 문지기.
 * 본문이 흘러가기(loading 경계) 전에 여기서 판정을 끝내므로 리다이렉트가 HTTP 3xx 로 나간다.
 * - 세션 없음 → /login
 * - 프로필이 없는 세션(내보낸 계정, d7 §8) → `/` 의 "소속 학교가 없어요" 안내
 */
export default async function MemberLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const me = await getServerSession();
  if (me.kind === "no-school") redirect("/");
  if (me.kind !== "member") redirect("/login");
  return children;
}
