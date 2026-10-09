"use client";

import { useState } from "react";
import Link from "next/link";
import { ButtonPrimary } from "@/components/button-primary";
import { AuthFormCard } from "@/components/ex-auth-form-card";
import { Icon } from "@/components/icons";
import { TextInput } from "@/components/text-input";
import styles from "./login.module.css";

type Props = {
  redirectTo: string;
  /** 다른 화면에서 넘어온 안내 (비밀번호 변경 완료·메일 링크 만료 등) */
  notice?: string | null;
};

/** 화면 1 로그인 폼 — 개인 이메일·비밀번호만 (학교는 가입 때 정해진 프로필에서) */
export function LoginForm({ redirectTo, notice }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = email.trim() !== "" && password !== "" && !submitting;

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "로그인에 실패했어요. 잠시 후 다시 시도하세요.");
        setSubmitting(false);
        return;
      }
      // 세션 쿠키가 생겼으므로 전체 이동 (proxy가 새 세션을 본다)
      window.location.assign(redirectTo);
    } catch {
      setError("서버에 연결하지 못했어요. 잠시 후 다시 시도하세요.");
      setSubmitting(false);
    }
  };

  return (
    <AuthFormCard
      title="로그인"
      subtitle="개인 이메일로 로그인하세요"
      variant="split"
      onSubmit={onSubmit}
      noValidate
      aria-label="로그인"
    >
      {notice ? (
        <p className={styles.message} role="status">
          {notice}
        </p>
      ) : null}
      <div className={styles.fields}>
        <TextInput
          label="개인 이메일"
          type="email"
          name="email"
          placeholder="name@example.com"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextInput
          label="비밀번호"
          type={showPassword ? "text" : "password"}
          name="password"
          placeholder="비밀번호를 입력하세요"
          autoComplete="current-password"
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
      </div>
      {error ? (
        <p className={styles.message} role="alert">
          {error}
        </p>
      ) : null}
      <ButtonPrimary type="submit" fullWidth disabled={!canSubmit}>
        {submitting ? "로그인 중…" : "로그인"}
      </ButtonPrimary>
      <Link href="/forgot-password" className={styles.findPassword}>
        비밀번호 찾기
      </Link>
    </AuthFormCard>
  );
}
