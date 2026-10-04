"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ButtonPrimary } from "@/components/button-primary";
import { AuthFormCard } from "@/components/ex-auth-form-card";
import { NavPill } from "@/components/nav-pill";
import styles from "./no-school.module.css";

/** 로그아웃한 뒤 가는 곳 — 로그인 화면(다른 계정 로그인 · "회원가입" 으로 다시 가입) */
const AFTER_LOGOUT = "/login";

/**
 * 프로필이 없는 세션(학교에서 내보낸 계정, d7 §8)에 앱 화면 대신 보여 주는 안내.
 * 안내 문구 + 로그아웃만 — 학교명·업무 데이터·앱 내비게이션(tab-bar·섹션 링크)은 두지 않는다.
 * 로그인된 채로는 /signup 이 / 로 되돌아오므로(proxy), 다시 가입하려면 먼저 로그아웃해야 한다.
 */
export function NoSchoolScreen() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const logout = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) throw new Error("logout failed");
      // 세션 쿠키가 지워졌으므로 로그인 화면으로 (서버 컴포넌트를 새 상태로 다시 그린다)
      router.replace(AFTER_LOGOUT);
      router.refresh();
    } catch {
      setError("로그아웃하지 못했어요. 잠시 후 다시 시도하세요.");
      inFlight.current = false;
      setPending(false);
    }
  };

  return (
    <div className={styles.page}>
      <NavPill />
      <main className={styles.main}>
        <AuthFormCard
          title="소속 학교가 없어요"
          subtitle="학교 관리자가 내보냈거나 가입이 끝나지 않았어요"
          aria-label="소속 학교 안내"
          onSubmit={logout}
        >
          <p className={styles.note}>다시 가입하려면 로그아웃한 뒤 회원가입을 하세요.</p>
          {error ? (
            <p className={styles.message} role="alert">
              {error}
            </p>
          ) : null}
          <ButtonPrimary type="submit" fullWidth disabled={pending} aria-busy={pending}>
            {pending ? "로그아웃하는 중…" : "로그아웃"}
          </ButtonPrimary>
        </AuthFormCard>
      </main>
    </div>
  );
}
