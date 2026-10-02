"use client";

import { useState } from "react";
import Link from "next/link";
import { ButtonPrimary } from "@/components/button-primary";
import { AuthFormCard } from "@/components/ex-auth-form-card";
import { TextInput } from "@/components/text-input";
import { RESET_SENT_MESSAGE, resetRequestProblem } from "@/lib/auth/password-rules";
import styles from "./recovery.module.css";

/** 재설정 메일 요청 — 이메일 존재 여부와 상관없이 같은 안내를 보여준다 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    const problem = resetRequestProblem(email);
    if (problem) {
      setError(problem);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "요청에 실패했어요. 잠시 후 다시 시도하세요.");
        setSubmitting(false);
        return;
      }
      setSent(true);
    } catch {
      setError("서버에 연결하지 못했어요. 잠시 후 다시 시도하세요.");
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <AuthFormCard
        title="메일을 확인하세요"
        subtitle="링크를 누르면 새 비밀번호를 정할 수 있어요"
        aria-label="재설정 메일 안내"
        onSubmit={(e) => e.preventDefault()}
      >
        <p className={styles.message} role="status">
          {RESET_SENT_MESSAGE}
        </p>
        <ButtonPrimary href="/login" fullWidth>
          로그인으로
        </ButtonPrimary>
      </AuthFormCard>
    );
  }

  return (
    <AuthFormCard
      title="비밀번호 찾기"
      subtitle="가입한 개인 이메일로 재설정 링크를 보내요"
      onSubmit={onSubmit}
      noValidate
      aria-label="비밀번호 찾기"
    >
      <div className={styles.fields}>
        <TextInput
          label="개인 이메일"
          type="email"
          name="email"
          placeholder="name@example.com"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      {error ? (
        <p className={styles.message} role="alert">
          {error}
        </p>
      ) : null}
      <ButtonPrimary type="submit" fullWidth disabled={submitting || email.trim() === ""}>
        {submitting ? "보내는 중…" : "재설정 메일 보내기"}
      </ButtonPrimary>
      <Link href="/login" className={styles.backLink}>
        로그인으로 돌아가기
      </Link>
    </AuthFormCard>
  );
}
