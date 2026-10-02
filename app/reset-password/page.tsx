import type { Metadata } from "next";
import { NavPill } from "@/components/nav-pill";
import { ResetPasswordForm } from "./reset-password-form";
import styles from "../forgot-password/recovery.module.css";

export const metadata: Metadata = { title: "새 비밀번호 · Lab_Stock" };

/**
 * 새 비밀번호 입력 (d7 §4-3). 재설정 메일 링크 → /auth/confirm 이 세션을 만든 뒤 여기로 온다.
 * 세션이 없으면 proxy가 /login 으로 보낸다. 시안 없음 — 기존 컴포넌트·토큰만.
 */
export default function ResetPasswordPage() {
  return (
    <div className={styles.page}>
      <NavPill backHref="/login" endTitle="새 비밀번호" />
      <main className={styles.main}>
        <ResetPasswordForm />
      </main>
    </div>
  );
}
