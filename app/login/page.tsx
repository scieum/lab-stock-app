import type { Metadata } from "next";
import { NavPill } from "@/components/nav-pill";
import { LoginForm } from "./login-form";
import styles from "./login.module.css";

export const metadata: Metadata = { title: "로그인 · Lab_Stock" };

type Props = { searchParams: Promise<{ next?: string | string[] }> };

/** 내부 경로만 허용 (열린 리다이렉트 방지) */
function safeNext(next: string | string[] | undefined): string {
  const v = Array.isArray(next) ? next[0] : next;
  return v && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/login") ? v : "/";
}

/** 화면 1 — 로그인 (시안 1-mobile · 1-desktop). 로그인 전 화면이라 tab-bar 없음. */
export default async function LoginPage({ searchParams }: Props) {
  const { next } = await searchParams;
  return (
    <div className={styles.page}>
      <NavPill />
      <main className={styles.layout}>
        <section className={styles.intro} aria-label="소개">
          <p className={styles.introTitle}>과학실 시약 재고를 학교별로 관리해요</p>
          <p className={styles.introBody}>시/도와 지역을 고른 뒤 우리 학교를 선택하면 우리 학교 재고만 보여요</p>
        </section>
        <LoginForm redirectTo={safeNext(next)} />
      </main>
    </div>
  );
}
