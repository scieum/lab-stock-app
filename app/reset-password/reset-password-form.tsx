"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ButtonPrimary } from "@/components/button-primary";
import { AuthFormCard } from "@/components/ex-auth-form-card";
import { Icon } from "@/components/icons";
import { TextInput } from "@/components/text-input";
import { newPasswordProblem } from "@/lib/auth/password-rules";
import { PASSWORD_MIN } from "@/lib/auth/signup-rules";
import styles from "../forgot-password/recovery.module.css";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    const problem = newPasswordProblem(password, passwordConfirm);
    if (problem) {
      setError(problem);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/password-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, passwordConfirm }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "비밀번호를 바꾸지 못했어요. 잠시 후 다시 시도하세요.");
        setSubmitting(false);
        return;
      }
      // 서버가 세션을 지웠다 — 새 비밀번호로 다시 로그인
      router.replace("/login?reset=done");
      router.refresh();
    } catch {
      setError("서버에 연결하지 못했어요. 잠시 후 다시 시도하세요.");
      setSubmitting(false);
    }
  };

  return (
    <AuthFormCard
      title="새 비밀번호"
      subtitle="앞으로 로그인할 때 쓸 비밀번호를 정하세요"
      onSubmit={onSubmit}
      noValidate
      aria-label="새 비밀번호"
    >
      <div className={styles.fields}>
        <TextInput
          label="새 비밀번호"
          required
          type={showPassword ? "text" : "password"}
          name="password"
          placeholder={`${PASSWORD_MIN}자 이상 입력하세요`}
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          trailing={
            <button
              type="button"
              className={styles.eye}
              aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((v) => !v)}
            >
              <Icon name={showPassword ? "eye-off" : "eye"} className={styles.eyeIcon} />
            </button>
          }
        />
        <TextInput
          label="새 비밀번호 확인"
          required
          type={showPassword ? "text" : "password"}
          name="passwordConfirm"
          placeholder="비밀번호를 한 번 더 입력하세요"
          autoComplete="new-password"
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
        />
      </div>
      {error ? (
        <p className={styles.message} role="alert">
          {error}
        </p>
      ) : null}
      <ButtonPrimary type="submit" fullWidth disabled={submitting}>
        {submitting ? "저장하는 중…" : "비밀번호 바꾸기"}
      </ButtonPrimary>
    </AuthFormCard>
  );
}
