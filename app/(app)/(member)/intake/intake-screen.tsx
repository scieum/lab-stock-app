"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/ex-toast";
import { LocationSuggest } from "@/components/location-suggest";
import { ReagentRegister, type ReagentRegisterValues } from "@/components/reagent-register";
import { SegmentedControl } from "@/components/segmented-control";
import { StockIntake, type IntakeReagent, type StockIntakeValues } from "@/components/stock-intake";
import { INTAKE_UNITS, STORAGE_CLASSES } from "@/lib/intake-rules";
import type { LocationSuggestEntry } from "@/lib/supabase/location-suggest";
import { placeSuggestedAction, recordIntakeAction, registerReagentAction } from "./actions";
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
const PLACE_FAILED = "저장하지 못했어요. 잠시 후 다시 시도해 주세요";

/** 등록 직후 위치 추천 상태 (d7 §17) — 시약마다 추천 칸 + 넣었는지 */
type SuggestState = { items: (LocationSuggestEntry & { placed: boolean })[] };

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
 * 새 시약 등록 성공(디자인 1.17 7-suggest, d7 §17): 학교에 시약장이 있으면 화면 2 로 가지 않고 ex-toast + location-suggest
 * (시약마다 추천 위치 + [여기에 두기] = place_reagent, [다른 칸] = 화면 3 위치 피커). 모두 두면 토스트 뒤 화면 2,
 * "나중에" = 바로 화면 2. 시약장이 하나도 없으면(또는 추천을 읽지 못하면) 지금처럼 화면 2.
 */
export function IntakeScreen({ reagents, today, initialTab, initialReagentId }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [suggest, setSuggest] = useState<SuggestState | null>(null);
  const [placing, setPlacing] = useState<{ id: string | null; all: boolean } | null>(null);
  const [placeError, setPlaceError] = useState<string | null>(null);
  /** 토스트 뒤 화면 2 로 갈지 (위치 추천 중에는 가지 않는다) */
  const [leaving, setLeaving] = useState(false);
  const inFlight = useRef(false);
  // 저장이 끝나 화면 2로 넘어가는 동안에도 다시 제출하지 못하게 잠근다
  const busy = pending || toast !== null;

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => router.push(AFTER_SAVE), TOAST_MS);
    return () => clearTimeout(t);
  }, [leaving, router]);

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
      if (res.ok) {
        setToast("입고를 기록했어요");
        setLeaving(true);
      } else setError(res.error);
    });
  };

  const submitRegister = (values: ReagentRegisterValues) => {
    if (busy) return;
    setError(null);
    startTransition(async () => {
      const res = await registerReagentAction(values);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setToast("시약을 등록했어요");
      // 시약장이 있으면 위치 추천 (d7 §17), 없으면 지금처럼 화면 2
      if (res.suggest && res.suggest.hasCabinets && res.suggest.items.length > 0) {
        setSuggest({ items: res.suggest.items.map((i) => ({ ...i, placed: false })) });
      } else {
        setLeaving(true);
      }
    });
  };

  const place = (ids: string[], all: boolean) => {
    if (!suggest || inFlight.current || leaving) return;
    const targets = suggest.items.filter((i) => ids.includes(i.id) && i.suggestion && !i.placed);
    if (targets.length === 0) return;
    inFlight.current = true;
    setPlaceError(null);
    setPlacing({ id: all ? null : targets[0].id, all });
    startTransition(async () => {
      try {
        const res = await placeSuggestedAction({
          items: targets.map((t) => ({ reagentId: t.id, slotId: t.suggestion!.slotId })),
        }).catch(() => null);
        if (!res) {
          setPlaceError(PLACE_FAILED);
          return;
        }
        const next = suggest.items.map((i) => (res.placed.includes(i.id) ? { ...i, placed: true } : i));
        setSuggest({ items: next });
        if (res.error) setPlaceError(res.error);
        // 추천 칸이 있는 시약을 모두 뒀으면 토스트 뒤 화면 2
        if (next.every((i) => !i.suggestion || i.placed)) {
          setToast(next.filter((i) => i.placed).length > 1 ? "추천 위치에 모두 뒀어요" : "보관 위치를 정했어요");
          setLeaving(true);
        }
      } finally {
        inFlight.current = false;
        setPlacing(null);
      }
    });
  };

  if (suggest) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>입고·시약 등록</h1>
        {toast ? <Toast>{toast}</Toast> : null}
        <LocationSuggest
          items={suggest.items.map((i) => ({
            id: i.id,
            name: i.name,
            storageClass: i.storageClass,
            suggestion: i.suggestion ? { cabinetNumber: i.suggestion.cabinetNumber, text: i.suggestion.text } : null,
            placed: i.placed,
          }))}
          otherHref={(id) => `/reagents/${id}?pick=location`}
          onPlace={(id) => place([id], false)}
          onPlaceAll={() => place(suggest.items.map((i) => i.id), true)}
          onLater={() => router.push(AFTER_SAVE)}
          pendingId={placing && !placing.all ? placing.id : null}
          pendingAll={Boolean(placing?.all) || leaving}
          error={placeError}
        />
      </div>
    );
  }

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
