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
  /**
   * sm = 데스크톱 목록 머리 줄 (시안 1.24 2·8·9·10-desktop toolbar: 트랙 44 · 항목 높이 36 · 좌우 16 · 글자 13, 줄바꿈 없음).
   * 기본은 지금 크기 (항목 44 · 글자 15)
   */
  size?: "default" | "sm";
};

/** 세그먼트 컨트롤 (회색 stadium 트랙 + 흰 선택 항목) */
export function SegmentedControl({ options, value, defaultValue, onChange, variant = "outline", label, disabled, size = "default" }: Props) {
  const [inner, setInner] = useState(defaultValue ?? options[0]?.value ?? "");
  const current = value ?? inner;
  const select = (v: string) => {
    if (value === undefined) setInner(v);
    onChange?.(v);
  };
  return (
    <div data-component="segmented-control" role="tablist" aria-label={label} className={[styles.track, size === "sm" ? styles.sm : ""].filter(Boolean).join(" ")}>
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
