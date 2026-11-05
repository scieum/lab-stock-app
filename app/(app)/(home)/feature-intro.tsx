"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FeatureIntroPopup } from "@/components/feature-intro-popup";
import { FEATURE_INTRO_ID } from "@/lib/feature-intro";

const KEY = `lab-stock:feature-intro:${FEATURE_INTRO_ID}`;
const NEVER = `${KEY}:never`; // localStorage — 주 버튼을 누름(영구)
const UNTIL = `${KEY}:until`; // localStorage — 일주일 동안 보지 않기(만료 시각 ms)
const CLOSED = `${KEY}:closed`; // sessionStorage — 닫기·✕(이번 접속)
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** 화면 7 서류로 입고 (intake 페이지의 ?mode=doc 진입) */
const CTA_HREF = "/intake?mode=doc";

/** 저장소를 못 읽으면 false — 다시 안 보이게 할 수 없으니 띄우지 않는다 (d7 §30) */
function shouldShow(): boolean {
  try {
    if (localStorage.getItem(NEVER)) return false;
    if (Number(localStorage.getItem(UNTIL) ?? 0) > Date.now()) return false;
    return !sessionStorage.getItem(CLOSED);
  } catch {
    return false;
  }
}

function save(store: "local" | "session", key: string, value: string) {
  try {
    (store === "local" ? localStorage : sessionStorage).setItem(key, value);
  } catch {
    // 저장 실패 = 이번 화면에서만 닫힘
  }
}

/**
 * 화면 13 신기능 소개 팝업 (rules 1.32 feature_intro · d7 §30). 홈 page 가 교사·admin 에게만 그린다(학생·둘러보기 0).
 * 서버 렌더에는 없고, 마운트 뒤 저장소를 보고 띄운다.
 */
export function FeatureIntro() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // 브라우저 저장소(외부)를 읽어 표시 여부로 옮긴다
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOpen(shouldShow()), []);

  if (!open) return null;
  return (
    <FeatureIntroPopup
      onClose={() => {
        save("session", CLOSED, "1");
        setOpen(false);
      }}
      onDismissWeek={() => {
        save("local", UNTIL, String(Date.now() + WEEK_MS));
        setOpen(false);
      }}
      onPrimary={() => {
        save("local", NEVER, "1");
        setOpen(false);
        router.push(CTA_HREF);
      }}
    />
  );
}
