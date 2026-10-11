import { AppShell } from "@/app/(app)/app-shell";
import { NavPill } from "@/components/nav-pill";
import { DesktopOnly, MobileOnly } from "@/components/viewport-only";
import { WebHeader } from "@/components/web-header";
import { getServerSession } from "@/lib/supabase/server";
import { NotFoundCard } from "./not-found-card";
import styles from "./not-found.module.css";

export const metadata = { title: "페이지를 찾을 수 없어요 · Lab_Stock" };

/**
 * 없는 주소 (디자인 1.26 not_found, d7 §25).
 * - 로그인 후(소속 학교 있음) = 앱 셸 안(모바일 nav-pill · tab-bar, 데스크톱 app-sidebar — 현재 메뉴 없음) + 카드 "홈으로" · "뒤로" (프레임 13-not-found)
 * - 로그인 전 = 데스크톱 web-header / 모바일 nav-pill(워드마크), 탭바 · 사이드바 없음 + "처음으로"(→ /) (프레임 1-not-found)
 */
export default async function NotFound() {
  const me = await getServerSession();
  if (me.kind === "member") {
    return (
      <AppShell schoolName={me.school.name} role={me.role} displayName={me.displayName}>
        <div className={styles.appMain}>
          <NotFoundCard kind="app" />
        </div>
      </AppShell>
    );
  }
  return (
    <div className={styles.pre}>
      <MobileOnly>
        <div className={styles.preNav}>
          <NavPill />
        </div>
      </MobileOnly>
      <DesktopOnly>
        <WebHeader actions="both" />
      </DesktopOnly>
      <main className={styles.preMain}>
        <NotFoundCard kind="pre" />
      </main>
    </div>
  );
}
