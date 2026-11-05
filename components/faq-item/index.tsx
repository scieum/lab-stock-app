"use client";

import { useId, useState } from "react";
import { Icon } from "@/components/icons";
import styles from "./styles.module.css";

type Props = {
  question: string;
  answer: string;
  defaultOpen?: boolean;
  /** 펼친 상자 아래 자리 (운영자만: '고치기 · 삭제' — d7 §30) */
  children?: React.ReactNode;
};

/**
 * faq-item (rules 1.32 board.faq, 시안 20): Q 한 줄(17/600 ink) + 오른쪽 › / 펼치면 ⌄, 아래 canvas-soft 상자(radius 24 · 안쪽 16)에
 * 답(body-sm). 글쓴이·상태 배지 없음. 여러 개 동시 펼침 허용(항목마다 스스로 펼친다).
 */
export function FaqItem({ question, answer, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const answerId = useId();
  return (
    <div data-component="faq-item" className={[styles.item, open ? styles.open : ""].filter(Boolean).join(" ")}>
      <button type="button" className={styles.question} aria-expanded={open} aria-controls={answerId} onClick={() => setOpen((o) => !o)}>
        <span className={styles.questionText}>{question}</span>
        <Icon name={open ? "chevron-down" : "chevron-right"} className={styles.chevron} />
      </button>
      {open ? (
        <div id={answerId} className={styles.answerWrap}>
          <p className={styles.answer}>{answer}</p>
          {children}
        </div>
      ) : null}
    </div>
  );
}
