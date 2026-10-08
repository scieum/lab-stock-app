"use client";

import { useId, useState } from "react";
import { Icon } from "@/components/icons";
import { MSDS_SUMMARY_PREVIEW_LINES, MSDS_SUMMARY_TEXT } from "@/lib/msds-summary";
import styles from "./styles.module.css";

type Props = {
  title: string;
  /** 줄 목록 — null(불러오지 못함)·빈 목록이면 "내용이 없어요" */
  lines: string[] | null;
  /** 바로가기 대상 id (데스크톱 드로어 section-anchors) */
  id?: string;
};

/** 항목 카드 (시안 msds-section): 제목 + 3줄 + "더 보기"(펼침) */
export function MsdsSection({ title, lines, id }: Props) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const all = lines ?? [];
  const hasMore = all.length > MSDS_SUMMARY_PREVIEW_LINES;
  const shown = open ? all : all.slice(0, MSDS_SUMMARY_PREVIEW_LINES);
  return (
    <section id={id} className={styles.section} data-section-empty={all.length === 0 ? "" : undefined}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {all.length === 0 ? (
        <p className={styles.empty}>{MSDS_SUMMARY_TEXT.empty}</p>
      ) : (
        <ul id={listId} className={styles.lines}>
          {shown.map((line, i) => (
            <li key={i} className={styles.line}>
              <span className={styles.bullet} aria-hidden="true">
                ·
              </span>
              <span className={styles.lineText}>{line}</span>
            </li>
          ))}
        </ul>
      )}
      {hasMore ? (
        <button
          type="button"
          className={styles.more}
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((v) => !v)}
        >
          <span>{open ? MSDS_SUMMARY_TEXT.less : MSDS_SUMMARY_TEXT.more}</span>
          <Icon name={open ? "chevron-up" : "chevron-down"} className={styles.moreIcon} />
        </button>
      ) : null}
    </section>
  );
}
