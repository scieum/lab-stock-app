import type { Metadata } from "next";
import { ButtonPillSoft } from "@/components/button-pill-soft";
import { NavPill } from "@/components/nav-pill";
import { SignupForm } from "./signup-form";
import styles from "./signup.module.css";

export const metadata: Metadata = { title: "회원가입 · Lab_Stock" };

/**
 * 화면 14 — 회원가입 (시안 14-mobile · 14-desktop · 14-no-school). 로그인 전 화면이라 tab-bar 없음.
 * 로그인된 사용자는 proxy가 / 로 보낸다.
 */
export default function SignupPage() {
  return (
    <div className={styles.page}>
      <NavPill backHref="/login" endTitle="회원가입" />
      <main className={styles.main}>
        <SignupForm />
        <div className={styles.loginRow}>
          <span className={styles.loginPrompt}>이미 계정이 있으신가요?</span>
          <ButtonPillSoft href="/login" icon="chevron-right">
            로그인
          </ButtonPillSoft>
        </div>
      </main>
    </div>
  );
}
