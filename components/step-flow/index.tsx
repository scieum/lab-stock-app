"use client";

import { useId, useState } from "react";
import { Icon } from "@/components/icons";
import styles from "./styles.module.css";

export type Step = {
  /** 스테퍼 아래 이름 (13/600) */
  label: string;
  /** 카드 제목 (24/700) */
  title: string;
  /** 카드 설명 (15/400 gray-400) */
  description: string;
  /** 하늘색 체크 3줄 */
  checks: string[];
  /** 오른쪽 화면 조각 */
  shot: React.ReactNode;
};

type Props = {
  title: string;
  steps: Step[];
  /** 띠 id (탭 앵커가 필요하면) */
  id?: string;
};

/**
 * 시작 단계 (시안 15-desktop step-flow, gray-950 전폭 띠 — rules.json 1.24 landing_rhythm.bands 반전):
 * 제목 32/700 흰 글자 → stepper(점 44 다섯 개 + 사이 선 gray-600, 아래 이름 13/600 흰 글자) →
 * step-card(gray-900 · radius 24 · padding 32 · 사이 48) = 왼쪽 "STEP n / 5" · 제목 · 설명 · 체크 3 / 오른쪽 화면 조각.
 * 비활성 점 = gray-900 채움 + 회색 숫자, 지금 단계 = gray-950 채움 + 하늘색 링 + 흰 숫자. 점을 누르면 그 단계 카드로 바뀐다.
 */
export function StepFlow({ title, steps, id }: Props) {
  const [current, setCurrent] = useState(0);
  const baseId = useId();
  const step = steps[current];
  const total = steps.length;
  const panelId = `${baseId}-panel`;

  return (
    <section id={id} data-component="step-flow" className={styles.band} aria-labelledby={`${baseId}-title`}>
      <div className={styles.inner}>
        <h2 id={`${baseId}-title`} className={styles.title} data-reveal="">
          {title}
        </h2>
        <div className={styles.body}>
          <div className={styles.stepper} data-reveal="">
            <span className={styles.line} aria-hidden="true" />
            <ol className={styles.steps}>
            {steps.map((s, i) => {
              const on = i === current;
              return (
                <li key={s.label} className={styles.stepItem}>
                  <button
                    type="button"
                    className={styles.stepButton}
                    aria-current={on ? "step" : undefined}
                    aria-controls={panelId}
                    onClick={() => setCurrent(i)}
                  >
                    <span className={on ? styles.dotCurrent : styles.dot} data-name={on ? "step-dot-current" : "step-dot"}>
                      {i + 1}
                    </span>
                    <span className={styles.stepLabel}>{s.label}</span>
                  </button>
                </li>
              );
            })}
            </ol>
          </div>
          <div id={panelId} className={styles.card} data-reveal="" aria-live="polite">
            <div className={styles.copy}>
              <span className={styles.caption}>
                STEP {current + 1} / {total}
              </span>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.desc}>{step.description}</p>
              <ul className={styles.checks}>
                {step.checks.map((c) => (
                  <li key={c} className={styles.check}>
                    <Icon name="check" className={styles.checkIcon} />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
            <div className={styles.shot}>{step.shot}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
