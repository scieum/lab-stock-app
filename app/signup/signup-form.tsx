"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ButtonPrimary } from "@/components/button-primary";
import { AuthFormCard } from "@/components/ex-auth-form-card";
import { Icon } from "@/components/icons";
import { SchoolSelectKind } from "@/components/school-select-kind";
import { SchoolSelectRegion } from "@/components/school-select-region";
import { SchoolSelectSchool } from "@/components/school-select-school";
import { SchoolSelectSido } from "@/components/school-select-sido";
import type { SelectOption } from "@/components/select-field";
import { TextInput } from "@/components/text-input";
import { DISPLAY_NAME_MAX, PASSWORD_MIN, signupProblem, type SignupFields } from "@/lib/auth/signup-rules";
import { KIND_FIRST_TEXT, noSchoolText } from "@/lib/school-kinds";
import { useSchoolSelect } from "./use-school-select";
import styles from "./signup.module.css";

const toOptions = (list: string[]): SelectOption[] => list.map((v) => ({ value: v, label: v }));

const TERMS = [
  {
    key: "terms",
    label: "서비스 이용약관 동의 (필수)",
    summary: "Lab_Stock은 학교 과학실 시약 재고를 학교별로 관리하는 서비스예요. 계정은 가입할 때 고른 학교에만 연결돼요.",
  },
  {
    key: "privacy",
    label: "개인정보 수집·이용 동의 (필수)",
    summary: "이름과 개인 이메일을 계정 확인과 학교 내 사용 기록 표시에만 써요. 탈퇴하면 지워요.",
  },
] as const;

type TermKey = (typeof TERMS)[number]["key"];

type Done = { email: string; needsEmailConfirm: boolean };

export function SignupForm() {
  const router = useRouter();
  const sel = useSchoolSelect();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agree, setAgree] = useState<Record<TermKey, boolean>>({ terms: false, privacy: false });
  const [openTerm, setOpenTerm] = useState<TermKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // 같은 프레임 안의 연속 클릭·Enter도 막는다 (state 갱신 전에 들어오는 두 번째 제출)
  const inFlight = useRef(false);
  const [done, setDone] = useState<Done | null>(null);

  const allAgreed = agree.terms && agree.privacy;
  const toggleAll = () => setAgree({ terms: !allAgreed, privacy: !allAgreed });

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (inFlight.current || submitting) return;
    const fields: SignupFields = {
      neisCode: sel.school,
      displayName,
      email,
      password,
      passwordConfirm,
      agreeTerms: agree.terms,
      agreePrivacy: agree.privacy,
    };
    const problem = signupProblem(fields);
    if (problem) {
      setError(problem);
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    const release = () => {
      inFlight.current = false;
      setSubmitting(false);
    };
    try {
      // 학교는 NEIS 학교 코드만 보낸다 (학교명·역할은 서버가 정한다)
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, displayName: displayName.trim(), email: email.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        needsEmailConfirm?: boolean;
      };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "회원가입에 실패했어요. 잠시 후 다시 시도하세요.");
        release();
        return;
      }
      if (!body.needsEmailConfirm) {
        // 세션 쿠키가 생겼으므로 홈으로 (서버 컴포넌트를 새 세션으로 다시 그린다)
        router.replace("/");
        router.refresh();
        return;
      }
      setDone({ email: email.trim(), needsEmailConfirm: true });
    } catch {
      setError("서버에 연결하지 못했어요. 잠시 후 다시 시도하세요.");
      release();
    }
  };

  if (done) {
    return (
      <AuthFormCard
        title="메일을 확인하세요"
        subtitle={`${done.email} 로 보낸 확인 메일의 링크를 누르면 가입이 끝나요`}
        aria-label="가입 확인 안내"
        variant="split"
        onSubmit={(e) => e.preventDefault()}
      >
        <p className={styles.note} role="status">
          메일이 보이지 않으면 스팸함을 확인하세요. 확인을 마친 뒤 개인 이메일과 비밀번호로 로그인하면 돼요.
        </p>
        <ButtonPrimary href="/login" fullWidth>
          로그인으로
        </ButtonPrimary>
      </AuthFormCard>
    );
  }

  return (
    <AuthFormCard
      title="회원가입"
      subtitle="우리 학교를 고르고 계정을 만드세요"
      onSubmit={onSubmit}
      noValidate
      aria-label="회원가입"
      variant="split"
      className={styles.card}
    >
      <section className={styles.schoolBlock} aria-labelledby="signup-school-title">
        {/* 모바일 "학교" (14-mobile) / 데스크톱 번호 섹션 "1 학교 선택" (14-desktop section-head) */}
        <h2 id="signup-school-title" className={styles.sectionTitle}>
          <span className={styles.sectionNumber}>1</span>
          <span className={styles.titleMobile}>학교</span>
          <span className={styles.titleDesktop}>학교 선택</span>
        </h2>
        <p className={styles.infoBox}>
          <Icon name="info" className={styles.infoIcon} aria-hidden="true" />
          <span>고른 학교의 시약·기록만 보여요. 가입한 뒤에는 바꿀 수 없어요</span>
        </p>
        <div
          className={styles.progress}
          role="progressbar"
          aria-label="학교 선택 단계"
          aria-valuemin={0}
          aria-valuemax={sel.steps}
          aria-valuenow={sel.done}
        >
          {Array.from({ length: sel.steps }, (_, i) => (
            <span key={i} className={i < sel.done ? styles.barDone : styles.bar} />
          ))}
        </div>
        <div className={styles.group}>
          <SchoolSelectSido
            options={toOptions(sel.sidoList)}
            value={sel.sido}
            onChange={sel.chooseSido}
            placeholder={sel.sidoList.length ? "시/도 선택" : "불러오는 중…"}
            disabled={sel.sidoList.length === 0}
          />
          <SchoolSelectRegion
            options={toOptions(sel.regionList)}
            value={sel.region}
            onChange={sel.chooseRegion}
            placeholder={sel.sido ? "지역 선택" : "시/도를 먼저 선택하세요"}
            disabled={!sel.sido || sel.regionList.length === 0}
          />
          <SchoolSelectKind value={sel.kind} onChange={sel.chooseKind} disabled={!sel.region} />
          <SchoolSelectSchool
            options={sel.schoolList.map((s) => ({ value: s.neis_code, label: s.name, sub: `${s.sido} ${s.region}` }))}
            value={sel.school}
            onChange={sel.chooseSchool}
            placeholder={!sel.region ? "지역을 먼저 선택하세요" : !sel.kind ? KIND_FIRST_TEXT : sel.schoolsLoaded ? "학교 선택" : "불러오는 중…"}
            disabled={!sel.region || !sel.kind || sel.schoolList.length === 0}
            context={sel.kind ? `${sel.sido} ${sel.region} · ${sel.kind} ${sel.schoolList.length}곳` : undefined}
            emptyNote={sel.noSchool && sel.kind ? noSchoolText(sel.kind) : undefined}
          />
          {sel.loadError ? (
            <p className={styles.message} role="alert">
              {sel.loadError}
            </p>
          ) : null}
        </div>
      </section>

      <hr className={styles.sectionDivider} />

      <section className={styles.accountBlock} aria-labelledby="signup-account-title">
        <h2 id="signup-account-title" className={styles.sectionTitle}>
          <span className={styles.sectionNumber}>2</span>
          계정
        </h2>
        <TextInput
          label="이름"
          required
          name="displayName"
          placeholder="이름을 입력하세요"
          autoComplete="name"
          maxLength={DISPLAY_NAME_MAX}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <TextInput
          label="개인 이메일"
          required
          type="email"
          name="email"
          placeholder="name@example.com"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextInput
          label="비밀번호"
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
          label="비밀번호 확인"
          required
          type={showPassword ? "text" : "password"}
          name="passwordConfirm"
          placeholder="비밀번호를 한 번 더 입력하세요"
          autoComplete="new-password"
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
        />
      </section>

      <fieldset className={styles.terms}>
        <legend className={styles.srOnly}>약관 동의</legend>
        <label className={styles.termAll}>
          <input type="checkbox" className={styles.checkInput} checked={allAgreed} onChange={toggleAll} />
          <span className={styles.checkHit} aria-hidden="true">
            <span className={styles.checkCircle}>
              <Icon name="check" className={styles.checkIcon} />
            </span>
          </span>
          <span className={styles.termAllLabel}>모두 동의</span>
        </label>
        <hr className={styles.divider} />
        {TERMS.map((t) => (
          <div key={t.key} className={styles.termItem}>
            <div className={styles.termRow}>
              <label className={styles.termLabelWrap}>
                <input
                  type="checkbox"
                  className={styles.checkInput}
                  checked={agree[t.key]}
                  onChange={(e) => setAgree((a) => ({ ...a, [t.key]: e.target.checked }))}
                />
                <span className={styles.checkHit} aria-hidden="true">
                  <span className={styles.checkCircle}>
                    <Icon name="check" className={styles.checkIcon} />
                  </span>
                </span>
                <span className={styles.termLabel}>{t.label}</span>
              </label>
              <button
                type="button"
                className={styles.termView}
                aria-expanded={openTerm === t.key}
                aria-controls={`term-${t.key}`}
                aria-label={`${t.label} 내용 보기`}
                onClick={() => setOpenTerm((k) => (k === t.key ? null : t.key))}
              >
                <Icon
                  name={openTerm === t.key ? "chevron-down" : "chevron-right"}
                  className={styles.termViewIcon}
                />
              </button>
            </div>
            {openTerm === t.key ? (
              <p id={`term-${t.key}`} className={styles.termSummary}>
                {t.summary}
              </p>
            ) : null}
          </div>
        ))}
      </fieldset>

      {error ? (
        <p className={styles.message} role="alert">
          {error}
        </p>
      ) : null}

      <div className={styles.actionBar}>
        <ButtonPrimary type="submit" fullWidth disabled={submitting} aria-busy={submitting}>
          {submitting ? "가입하는 중…" : "가입하기"}
        </ButtonPrimary>
      </div>
    </AuthFormCard>
  );
}
