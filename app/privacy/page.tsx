import type { Metadata } from "next";
import { NavPill } from "@/components/nav-pill";
import { PrivacyDoc } from "@/components/privacy-doc";
import { DesktopOnly, MobileOnly } from "@/components/viewport-only";
import { WebFooter } from "@/components/web-footer";
import { WebHeader } from "@/components/web-header";
import { PRIVACY_TITLE } from "@/lib/privacy";
import styles from "./privacy.module.css";

// d7 §30: 정적 생성 — 세션·학교 데이터를 읽지 않는다 (로그인 전·후 같은 문서)
export const dynamic = "force-static";

export const metadata: Metadata = { title: `${PRIVACY_TITLE} · Lab_Stock` };

/**
 * 화면 19 — 개인정보 처리방침 `/privacy` (rules 1.32 privacy_page, 시안 19-mobile · 19-desktop). 로그인 전·후 모두 공개.
 * 모바일 = top-bar(nav-pill 워드마크) → page-body(privacy-doc) → web-footer 두 줄.
 * 데스크톱 = web-header(로그인 · 회원가입) → 가운데 읽기 단(최대 720) → web-footer 한 줄. tab-bar·app-sidebar 없음.
 */
export default function PrivacyPage() {
  return (
    <div className={styles.page}>
      <MobileOnly>
        <div className={styles.top}>
          <NavPill />
        </div>
      </MobileOnly>
      <DesktopOnly>
        <WebHeader actions="both" />
      </DesktopOnly>
      <main className={styles.body}>
        <PrivacyDoc className={styles.doc} />
      </main>
      <WebFooter compact />
    </div>
  );
}
