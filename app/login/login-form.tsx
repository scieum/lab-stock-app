"use client";

import { useEffect, useState } from "react";
import { ButtonPrimary } from "@/components/button-primary";
import { AuthFormCard } from "@/components/ex-auth-form-card";
import { SchoolSelectRegion } from "@/components/school-select-region";
import { SchoolSelectSchool } from "@/components/school-select-school";
import { SchoolSelectSido } from "@/components/school-select-sido";
import type { SelectOption } from "@/components/select-field";
import { TextInput } from "@/components/text-input";
import type { NeisSchool } from "@/lib/types";
import styles from "./login.module.css";

/** /api/neis 중계 응답만 쓴다 (N1-d). 실패하면 메시지를 던진다. */
async function neis<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? "학교 목록을 불러오지 못했어요.");
  return body;
}

const toOptions = (list: string[]): SelectOption[] => list.map((v) => ({ value: v, label: v }));

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [sidoList, setSidoList] = useState<string[]>([]);
  const [regionList, setRegionList] = useState<string[]>([]);
  const [schoolList, setSchoolList] = useState<NeisSchool[]>([]);
  const [sido, setSido] = useState("");
  const [region, setRegion] = useState("");
  const [school, setSchool] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 1단계: 시/도
  useEffect(() => {
    let alive = true;
    neis<{ sido: string[] }>("/api/neis/sido")
      .then((d) => alive && setSidoList(d.sido))
      .catch((e: Error) => alive && setLoadError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  // 2단계: 지역 (시/도를 고른 뒤)
  useEffect(() => {
    if (!sido) return;
    let alive = true;
    neis<{ regions: string[] }>(`/api/neis/regions?sido=${encodeURIComponent(sido)}`)
      .then((d) => alive && setRegionList(d.regions))
      .catch((e: Error) => alive && setLoadError(e.message));
    return () => {
      alive = false;
    };
  }, [sido]);

  // 3단계: 학교 (지역을 고른 뒤)
  useEffect(() => {
    if (!sido || !region) return;
    let alive = true;
    neis<{ schools: NeisSchool[] }>(
      `/api/neis/schools?sido=${encodeURIComponent(sido)}&region=${encodeURIComponent(region)}`,
    )
      .then((d) => alive && setSchoolList(d.schools))
      .catch((e: Error) => alive && setLoadError(e.message));
    return () => {
      alive = false;
    };
  }, [sido, region]);

  const chooseSido = (v: string) => {
    if (v === sido) return;
    setSido(v);
    setRegion("");
    setSchool("");
    setRegionList([]);
    setSchoolList([]);
    setLoadError(null);
  };

  const chooseRegion = (v: string) => {
    if (v === region) return;
    setRegion(v);
    setSchool("");
    setSchoolList([]);
    setLoadError(null);
  };

  const done = [sido, region, school].filter(Boolean).length;
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
        body: JSON.stringify({ email: email.trim(), password, neisCode: school || null }),
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
      subtitle="우리 학교를 선택하고 로그인하세요"
      steps={{ total: 3, done }}
      onSubmit={onSubmit}
      noValidate
      aria-label="로그인"
    >
      <div className={styles.fields}>
        <SchoolSelectSido
          options={toOptions(sidoList)}
          value={sido}
          onChange={chooseSido}
          placeholder={sidoList.length ? "시/도를 선택하세요" : "불러오는 중…"}
          disabled={sidoList.length === 0}
        />
        <SchoolSelectRegion
          options={toOptions(regionList)}
          value={region}
          onChange={chooseRegion}
          placeholder={sido ? "지역을 선택하세요" : "시/도를 먼저 선택하세요"}
          disabled={!sido || regionList.length === 0}
        />
        <SchoolSelectSchool
          options={schoolList.map((s) => ({ value: s.neis_code, label: s.name }))}
          value={school}
          onChange={setSchool}
          placeholder={region ? "학교를 선택하세요" : "지역을 먼저 선택하세요"}
          disabled={!region || schoolList.length === 0}
        />
        {loadError ? (
          <p className={styles.message} role="alert">
            {loadError}
          </p>
        ) : null}
      </div>
      <div className={styles.fields}>
        <TextInput
          type="email"
          name="email"
          placeholder="아이디(이메일)"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextInput
          type="password"
          name="password"
          placeholder="비밀번호"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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
    </AuthFormCard>
  );
}
