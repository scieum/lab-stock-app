"use client";

import { useState } from "react";
import { SegmentedControlActive } from "@/components/segmented-control-active";
import styles from "./styles.module.css";

export type SegmentOption = { value: string; label: string };

type Props = {
  options: SegmentOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** outline = 필터(시약 목록), indicator = 탭(시약 상세) */
  variant?: "outline" | "indicator";
  label?: string;
  /** true = 아직 고를 수 없는 단계 (화면 14 학교급: 지역을 고르기 전) */
  disabled?: boolean;
};

/** 세그먼트 컨트롤 (회색 stadium 트랙 + 흰 선택 항목) */
export function SegmentedControl({ options, value, defaultValue, onChange, variant = "outline", label, disabled }: Props) {
  const [inner, setInner] = useState(defaultValue ?? options[0]?.value ?? "");
  const current = value ?? inner;
  const select = (v: string) => {
    if (value === undefined) setInner(v);
    onChange?.(v);
  };
  return (
    <div data-component="segmented-control" role="tablist" aria-label={label} className={styles.track}>
      {options.map((o) =>
        o.value === current ? (
          <SegmentedControlActive key={o.value} variant={variant} disabled={disabled}>
            {o.label}
          </SegmentedControlActive>
        ) : (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected="false"
            disabled={disabled}
            className={styles.option}
            onClick={() => select(o.value)}
          >
            {o.label}
          </button>
        ),
      )}
    </div>
  );
}
