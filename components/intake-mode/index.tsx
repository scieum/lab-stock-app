"use client";

import { SegmentedControl } from "@/components/segmented-control";
import { DOC_TEXT } from "@/lib/doc-intake-rules";
import styles from "./styles.module.css";

export type IntakeMode = "direct" | "doc";

const OPTIONS: { value: IntakeMode; label: string }[] = [
  { value: "direct", label: DOC_TEXT.modeDirect },
  { value: "doc", label: DOC_TEXT.modeDoc },
];

type Props = {
  value: IntakeMode;
  onChange?: (mode: IntakeMode) => void;
  /** 저장·처리 중 잠금 */
  disabled?: boolean;
  className?: string;
};

/**
 * 화면 7 맨 위 입고 방법 (디자인 1.17 intake-mode, d7 §21): segmented-control 2칸 "직접 입력 / 서류로 입고"(시안 순서),
 * 기본 = 서류로 입고. 전폭 (모바일 358 · 데스크톱 page-column 720).
 * "직접 입력" = 기존 갈래(기존 시약 입고 · 새 시약 등록) 그대로.
 */
export function IntakeMode({ value, onChange, disabled, className }: Props) {
  return (
    <div data-component="intake-mode" data-mode={value} className={[styles.root, className ?? ""].filter(Boolean).join(" ")}>
      <SegmentedControl
        label="입고 방법"
        options={OPTIONS}
        value={value}
        disabled={disabled}
        onChange={(v) => onChange?.(v === "direct" ? "direct" : "doc")}
      />
    </div>
  );
}
