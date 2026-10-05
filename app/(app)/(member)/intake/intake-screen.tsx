"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/ex-toast";
import { ReagentRegister, type ReagentRegisterValues } from "@/components/reagent-register";
import { SegmentedControl } from "@/components/segmented-control";
import { StockIntake, type IntakeReagent, type StockIntakeValues } from "@/components/stock-intake";
import { INTAKE_UNITS, STORAGE_CLASSES } from "@/lib/intake-rules";
import { recordIntakeAction, registerReagentAction } from "./actions";
import styles from "./intake.module.css";

type Tab = "intake" | "register";

const TABS: { value: Tab; label: string }[] = [
  { value: "intake", label: "기존 시약 입고" },
  { value: "register", label: "새 시약 등록" },
];
const STORAGE_CLASS_OPTIONS = [...STORAGE_CLASSES];
const UNIT_OPTIONS = [...INTAKE_UNITS];
/** 저장 후 토스트를 보여 주는 시간 — 지나면 화면 2(/reagents)로 간다 */
const TOAST_MS = 1500;
const AFTER_SAVE = "/reagents";

type Props = {
  /** 자기 학교 시약 (이름순) */
  reagents: IntakeReagent[];
  /** 입고일 기본값 (Asia/Seoul, YYYY-MM-DD) */
  today: string;
  initialTab: Tab;
  /** ?reagent 로 들어온 자기 학교 시약 */
  initialReagentId?: string;
};

/**
 * 화면 7 입고·시약 등록.
 * 시안: (데스크톱 screen-title) → segmented-control(기존 시약 입고 / 새 시약 등록) → 고른 갈래 하나만.
 * 저장 성공 → ex-toast → 화면 2. 실패 → 폼의 error 문구, 화면 유지.
 */
export function IntakeScreen({ reagents, today, initialTab, initialReagentId }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // 저장이 끝나 화면 2로 넘어가는 동안에도 다시 제출하지 못하게 잠근다
  const busy = pending || toast !== null;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => router.push(AFTER_SAVE), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast, router]);

  const changeTab = (next: Tab) => {
    if (busy) return;
    setError(null);
    setTab(next);
  };

  const submitIntake = (values: StockIntakeValues) => {
    if (busy) return;
    setError(null);
    startTransition(async () => {
      const res = await recordIntakeAction(values);
      if (res.ok) setToast("입고를 기록했어요");
      else setError(res.error);
    });
  };

  const submitRegister = (values: ReagentRegisterValues) => {
    if (busy) return;
    setError(null);
    startTransition(async () => {
      const res = await registerReagentAction(values);
      if (res.ok) setToast("시약을 등록했어요");
      else setError(res.error);
    });
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>입고·시약 등록</h1>
      <div className={styles.segment}>
        <SegmentedControl
          label="입고 방법"
          options={TABS}
          value={tab}
          onChange={(v) => changeTab(v === "register" ? "register" : "intake")}
        />
      </div>
      {tab === "intake" ? (
        <StockIntake
          reagents={reagents}
          defaultIntakeDate={today}
          defaultSelectedId={initialReagentId}
          onSubmit={submitIntake}
          pending={busy}
          error={error}
          onRegisterNew={() => changeTab("register")}
        />
      ) : (
        <ReagentRegister
          storageClasses={STORAGE_CLASS_OPTIONS}
          units={UNIT_OPTIONS}
          defaultIntakeDate={today}
          onSubmit={submitRegister}
          pending={busy}
          error={error}
        />
      )}
      {toast ? <Toast floating>{toast}</Toast> : null}
    </div>
  );
}
