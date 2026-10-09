import type { Metadata } from "next";
import { ButtonPillSoft } from "@/components/button-pill-soft";
import { NavPill } from "@/components/nav-pill";
import { DesktopOnly, MobileOnly } from "@/components/viewport-only";
import { WebHeader } from "@/components/web-header";
import { AuthIntro } from "../auth-intro";
import { SignupForm } from "./signup-form";
import styles from "./signup.module.css";

export const metadata: Metadata = { title: "회원가입 · Lab_Stock" };

/**
 * 화면 14 — 회원가입 (시안 14-mobile · 14-desktop · 14-no-school). 로그인 전 화면이라 tab-bar 없음.
 * 로그인된 사용자는 proxy가 / 로 보낸다.
 * 모바일 = nav-pill(뒤로 · 워드마크 · "회원가입") + 폼 카드 + 하단 가입하기 바.
 * 데스크톱(d7 §23 run d) = web-header(오른쪽 로그인) + 왼쪽 폼(440) / 오른쪽 서비스 소개 패널 반 나눔,
 * 폼은 번호 섹션 "1 학교 선택"(시/도 → 지역 → 학교급 → 학교, 학교 목록 = 상자 아래 드롭다운) → "2 계정"(+ 약관 · 가입하기).
 */
export default function SignupPage() {
  return (
    <div className={styles.page}>
      <MobileOnly>
        <NavPill backHref="/login" endTitle="회원가입" />
      </MobileOnly>
      <DesktopOnly>
        <WebHeader actions="login" sticky />
      </DesktopOnly>
      <div className={styles.layout}>
        <main className={styles.main}>
          <SignupForm />
          <div className={styles.loginRow}>
            <span className={styles.loginPrompt}>이미 계정이 있으신가요?</span>
            <ButtonPillSoft href="/login" icon="chevron-right">
              로그인
            </ButtonPillSoft>
          </div>
        </main>
        <DesktopOnly>
          <AuthIntro />
        </DesktopOnly>
      </div>
    </div>
  );
}
