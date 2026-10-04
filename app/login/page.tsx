import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMembership } from "@/lib/supabase/my-school";
import { ButtonPillSoft } from "@/components/button-pill-soft";
import { NavPill } from "@/components/nav-pill";
import { LoginForm } from "./login-form";
import styles from "./login.module.css";

export const metadata: Metadata = { title: "로그인 · Lab_Stock" };

type Query = { next?: string | string[]; confirm?: string | string[]; reset?: string | string[] };
type Props = { searchParams: Promise<Query> };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** 내부 경로만 허용 (열린 리다이렉트 방지) */
function safeNext(next: string | string[] | undefined): string {
  const v = first(next);
  return v && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/login") ? v : "/";
}

/** 다른 흐름에서 돌아왔을 때의 안내 (고정 문구만 — 쿼리 값을 그대로 보여주지 않는다) */
function noticeOf(q: Query): string | null {
  if (first(q.reset) === "done") return "비밀번호를 바꿨어요. 새 비밀번호로 로그인하세요.";
  if (first(q.confirm) === "failed") return "메일 링크가 만료됐거나 이미 사용됐어요. 다시 시도하세요.";
  return null;
}

/** 화면 1 — 로그인 (시안 1-mobile · 1-desktop). 로그인 전 화면이라 tab-bar 없음. 학교 선택 없음(d7 §4-2). */
export default async function LoginPage({ searchParams }: Props) {
  const q = await searchParams;
  // 프로필이 없는 세션(내보낸 계정)이 앱 화면에서 밀려 여기로 오면 / 의 "소속 학교가 없어요" 안내로 보낸다
  // (그 안내의 로그아웃을 거쳐야 다시 로그인·가입할 수 있다). 그 밖의 경우는 그대로 로그인 화면.
  if ((await getMembership()).kind === "no-school") redirect("/");
  return (
    <div className={styles.page}>
      <NavPill />
      <main className={styles.layout}>
        <section className={styles.intro} aria-label="소개">
          <p className={styles.introTitle}>과학실 시약 재고를 학교별로 관리해요</p>
          <p className={styles.introBody}>개인 이메일로 로그인하면 소속 학교의 재고만 보여요</p>
        </section>
        <div className={styles.formColumn}>
          <LoginForm redirectTo={safeNext(q.next)} notice={noticeOf(q)} />
          <div className={styles.signupRow}>
            <span className={styles.signupPrompt}>아직 회원이 아니신가요?</span>
            <ButtonPillSoft href="/signup" icon="chevron-right">
              회원가입
            </ButtonPillSoft>
          </div>
        </div>
      </main>
    </div>
  );
}
