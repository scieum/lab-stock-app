"use client";

import { useEffect, useId, useRef } from "react";
import { ButtonPrimary } from "@/components/button-primary";
import { FeatureIntroDismiss } from "@/components/feature-intro-dismiss";
import { Icon } from "@/components/icons";
import { FEATURE_INTRO_TEXT } from "@/lib/feature-intro";
import styles from "./styles.module.css";

type Props = {
  /** 주 버튼 'AI 입고 써 보기' — 화면 7 서류로 입고로 이동 + 다시 안 띄움 (저장·이동은 부르는 쪽) */
  onPrimary?: () => void;
  /** '닫기' · 데스크톱 ✕ · Esc — 이번 접속에서만 숨김 */
  onClose?: () => void;
  /** '일주일 동안 보지 않기' */
  onDismissWeek?: () => void;
  /** true(기본) = 화면 위에 띄움(모바일 바텀시트 + 딤, 데스크톱 가운데 모달). false = 제자리(갤러리) */
  overlay?: boolean;
};

/** 그림: 화면 7 서류 올리기 → 확인 표 조각 (canvas-soft 패널 안 흰 조각 두 장, 장식) */
function IntroFigure() {
  return (
    <div className={styles.figure} aria-hidden="true">
      <div className={styles.shot}>
        <span className={styles.shotDoc}>
          <Icon name="file" className={styles.shotIcon} />
        </span>
        <span className={styles.shotLines}>
          <span className={styles.lineLong} />
          <span className={styles.lineShort} />
        </span>
        <Icon name="upload" className={styles.shotIcon} />
      </div>
      <Icon name="arrow-down" className={styles.arrow} />
      <div className={[styles.shot, styles.shotTable].join(" ")}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={styles.tableRow}>
            <span className={styles.lineLong} />
            <span className={styles.lineShort} />
            <span className={styles.check}>
              <Icon name="check" className={styles.checkIcon} />
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * feature-intro-popup (rules 1.32 feature_intro, 시안 13-feature-intro-mobile · desktop): 교사·admin 홈(13)에서만, 한 번에 하나.
 * 모바일 = 바텀시트(위 모서리 rounded 24, 배경 딤, ✕ 없음) · 데스크톱 = 가운데 모달 560(오른쪽 위 ✕ = 닫기).
 * 순서 = 꼬리표 '새 기능'(canvas-soft 알약) → 제목 heading → 그림 → 단계 3줄 → 전폭 button-primary → feature-intro-dismiss.
 * 그림자 없음, 핑크 없음. 표시 여부(저장소)는 부르는 쪽이 정한다.
 */
export function FeatureIntroPopup({ onPrimary, onClose, onDismissWeek, overlay = true }: Props) {
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  // 열 때 팝업으로, 닫힐 때 원래 자리로 (sheet-panel 과 같은 방식)
  useEffect(() => {
    if (!overlay) return;
    const before = document.activeElement;
    rootRef.current?.focus({ preventScroll: true });
    return () => {
      const now = document.activeElement;
      if (now && now !== document.body) return;
      if (before instanceof HTMLElement && before !== document.body && before.isConnected) before.focus({ preventScroll: true });
    };
  }, [overlay]);

  useEffect(() => {
    if (!overlay) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose?.();
      if (e.key !== "Tab" || !rootRef.current) return;
      // 포커스 트랩: 보이는 버튼·링크 사이에서 Tab·Shift+Tab 순환
      const items = Array.from(rootRef.current.querySelectorAll<HTMLElement>("button, a[href]")).filter(
        (el) => el.getClientRects().length > 0,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = rootRef.current.contains(active);
      if (e.shiftKey && (!inside || active === first || active === rootRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || active === last)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [overlay, onClose]);

  const card = (
    <div
      ref={rootRef}
      data-component="feature-intro-popup"
      role="dialog"
      aria-modal={overlay || undefined}
      aria-labelledby={titleId}
      tabIndex={-1}
      className={[styles.popup, overlay ? styles.floating : ""].filter(Boolean).join(" ")}
    >
      <button type="button" className={styles.close} aria-label={FEATURE_INTRO_TEXT.close} onClick={onClose}>
        <Icon name="close" className={styles.closeIcon} />
      </button>
      <div className={styles.head}>
        <span className={styles.tag}>{FEATURE_INTRO_TEXT.tag}</span>
        <h2 id={titleId} className={styles.title}>
          {FEATURE_INTRO_TEXT.title}
        </h2>
      </div>
      <IntroFigure />
      <div className={styles.body}>
        <ol className={styles.steps}>
          {FEATURE_INTRO_TEXT.steps.map((s, i) => (
            <li key={s} className={styles.step}>
              <span className={styles.stepNumber} aria-hidden="true">
                {i + 1}
              </span>
              <span className={styles.stepText}>{s}</span>
            </li>
          ))}
        </ol>
        <div className={styles.actions}>
          <ButtonPrimary fullWidth onClick={onPrimary}>
            {FEATURE_INTRO_TEXT.cta}
          </ButtonPrimary>
          <FeatureIntroDismiss onDismissWeek={onDismissWeek} onClose={onClose} />
        </div>
      </div>
    </div>
  );

  if (!overlay) return card;
  return (
    <div className={styles.overlay}>
      <div className={styles.scrim} aria-hidden="true" onClick={onClose} />
      {card}
    </div>
  );
}
