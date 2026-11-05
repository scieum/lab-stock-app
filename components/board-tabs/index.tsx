"use client";

import { SegmentedControl } from "@/components/segmented-control";
import { BOARD_CATEGORIES, type BoardCategory } from "@/lib/board";
import styles from "./styles.module.css";

type Props = {
  /** 제어 값. 없으면 SegmentedControl 이 스스로 쥔다 (defaultValue — 갤러리) */
  value?: BoardCategory;
  defaultValue?: BoardCategory;
  onChange?: (value: BoardCategory) => void;
};

/**
 * board-tabs (rules 1.32 board.tabs, 시안 20): segmented-control 3칸 FAQ(맨 앞, 고정) · 오류 문의 · 개선 제안, 전폭.
 * 탭을 바꾸면 부르는 쪽이 주소(?tab=)를 바꾼다.
 */
export function BoardTabs({ value, defaultValue = "faq", onChange }: Props) {
  return (
    <div data-component="board-tabs" className={styles.tabs}>
      <SegmentedControl
        label="게시판 분류"
        options={BOARD_CATEGORIES}
        value={value}
        defaultValue={defaultValue}
        onChange={(v) => onChange?.(v as BoardCategory)}
      />
    </div>
  );
}
