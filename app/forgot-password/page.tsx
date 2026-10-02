import type { Metadata } from "next";
import { NavPill } from "@/components/nav-pill";
import { ForgotPasswordForm } from "./forgot-password-form";
import styles from "./recovery.module.css";

export const metadata: Metadata = { title: "비밀번호 찾기 · Lab_Stock" };

/** 비밀번호 찾기 (화면 1의 "비밀번호 찾기" 진입, d7 §4-3). 시안 없음 — 기존 컴포넌트·토큰만. */
export default function ForgotPasswordPage() {
  return (
    <div className={styles.page}>
      <NavPill backHref="/login" endTitle="비밀번호 찾기" />
      <main className={styles.main}>
        <ForgotPasswordForm />
      </main>
    </div>
  );
}
