"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { SENSOR_DOC_TEXT, sensorLinkSummary, type SchoolSensor, type SensorDocLink } from "@/lib/sensor-doc-rules";
import styles from "./styles.module.css";

type Props = {
  /** 서류 품명 (읽기 도구 이름) */
  itemName: string;
  /** 서류 수량 (기존 센서에 더할 개수) */
  quantity: number;
  link: SensorDocLink;
  /** 우리 학교 센서 (바꾸기 선택지) */
  sensors: readonly SchoolSensor[];
  /** "새 센서로 등록" 행의 펼침 상태 (new-sensor-fields) */
  expanded?: boolean;
  onChange?: (link: SensorDocLink) => void;
  onToggleExpand?: () => void;
  disabled?: boolean;
  /** 바꾸기 시트 제자리(갤러리) */
  pickerOpen?: boolean;
  className?: string;
};

/**
 * 서류 품목 ↔ 우리 학교 센서 연결 줄 (rules 1.28 sensor.doc.link, 시안 17-doc-review sensor-link):
 * link-summary = icon-link 16(highlight) + 13 글자 — 기존 = "기존 센서에 더하기 · {이름} · 지금 3개 → 5개" + 조용한 '바꾸기'·'빼기'(13 muted, 44),
 * 새 센서 = "새 센서로 등록"(13/600) + 접기 chevron + '바꾸기'(우리 학교 센서가 있을 때)·'빼기', 뺌 = "등록하지 않아요" + '다시 넣기'.
 * 바꾸기 = 우리 학교 센서 고르기 목록 + "새 센서로 등록". 모바일 = 행 아래 줄(위 8), 데스크톱 = 표 행 아래 줄(좌우 16).
 */
export function SensorLink({
  itemName,
  quantity,
  link,
  sensors,
  expanded = false,
  onChange,
  onToggleExpand,
  disabled = false,
  pickerOpen = false,
  className,
}: Props) {
  const [picking, setPicking] = useState(pickerOpen);
  const sensor = link.kind === "sensor" ? (sensors.find((s) => s.id === link.sensorId) ?? null) : null;

  const pick = (next: SensorDocLink) => {
    setPicking(false);
    onChange?.(next);
  };

  return (
    <div
      data-component="sensor-link"
      data-link={link.kind}
      role="group"
      aria-label={`${itemName} 연결`}
      className={[styles.root, className ?? ""].filter(Boolean).join(" ")}
    >
      <div className={styles.line}>
        {link.kind === "new" ? (
          <button
            type="button"
            className={[styles.summary, styles.summaryButton].join(" ")}
            data-name="link-summary"
            aria-expanded={expanded}
            disabled={disabled}
            onClick={onToggleExpand}
          >
            <Icon name="link" className={styles.linkIcon} />
            <span className={styles.newLabel}>{SENSOR_DOC_TEXT.newSensor}</span>
            <Icon name={expanded ? "chevron-up" : "chevron-down"} className={styles.collapse} />
          </button>
        ) : (
          <span className={styles.summary} data-name="link-summary">
            <Icon name="link" className={styles.linkIcon} />
            <span className={link.kind === "none" ? styles.excluded : styles.label}>
              {link.kind === "none"
                ? SENSOR_DOC_TEXT.excluded
                : sensor
                  ? sensorLinkSummary(sensor.name, sensor.quantity, quantity)
                  : "찾을 수 없는 센서"}
            </span>
          </span>
        )}
        <span className={styles.actions} data-name="link-actions">
          {link.kind === "none" ? (
            <button type="button" className={styles.action} disabled={disabled} onClick={() => onChange?.({ kind: "new" })}>
              {SENSOR_DOC_TEXT.include}
            </button>
          ) : (
            <>
              {link.kind === "sensor" || sensors.length > 0 ? (
                <button
                  type="button"
                  className={styles.action}
                  aria-label={`${itemName} 연결 ${SENSOR_DOC_TEXT.change}`}
                  aria-expanded={picking}
                  disabled={disabled}
                  onClick={() => setPicking((p) => !p)}
                >
                  {SENSOR_DOC_TEXT.change}
                </button>
              ) : null}
              <button
                type="button"
                className={styles.action}
                aria-label={`${itemName} ${SENSOR_DOC_TEXT.exclude}`}
                disabled={disabled}
                onClick={() => pick({ kind: "none" })}
              >
                {SENSOR_DOC_TEXT.exclude}
              </button>
            </>
          )}
        </span>
      </div>
      {picking ? (
        <div className={styles.picker} role="listbox" aria-label={SENSOR_DOC_TEXT.pickTitle}>
          <p className={styles.pickerTitle} aria-hidden="true">
            {SENSOR_DOC_TEXT.pickTitle}
          </p>
          {sensors.map((s) => {
            const on = link.kind === "sensor" && link.sensorId === s.id;
            return (
              <button
                key={s.id}
                type="button"
                role="option"
                aria-selected={on}
                className={[styles.option, on ? styles.optionOn : ""].filter(Boolean).join(" ")}
                disabled={disabled}
                onClick={() => pick({ kind: "sensor", sensorId: s.id })}
              >
                <span className={styles.optionName}>{s.name}</span>
                <span className={styles.optionCaption}>{[s.maker, s.model, `${s.quantity}개`].filter(Boolean).join(" · ")}</span>
              </button>
            );
          })}
          <button
            type="button"
            role="option"
            aria-selected={link.kind === "new"}
            className={[styles.option, styles.optionNew, link.kind === "new" ? styles.optionOn : ""].filter(Boolean).join(" ")}
            disabled={disabled}
            onClick={() => pick({ kind: "new" })}
          >
            <span className={styles.optionName}>{SENSOR_DOC_TEXT.newSensor}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
