"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { TextInputSelect } from "@/components/text-input";
import { DOC_TEXT, type DocLink, type DocReagent } from "@/lib/doc-intake-rules";
import styles from "./styles.module.css";

const NEW_VALUE = "__new__";

type Props = {
  /** 서류 품명 (읽기 도구 이름) */
  itemName: string;
  link: DocLink;
  /** 우리 학교 시약 (바꾸기 선택지) */
  reagents: readonly DocReagent[];
  /** "새 시약으로 등록" 이 골라진 행의 펼침 상태 */
  expanded?: boolean;
  /** 접힌 새 시약 요약 "새 시약 · 산 · 1,000 mL" */
  summary?: string | null;
  /** 연결 바꾸기 (시약 · 새 시약 · 빼기) */
  onChange?: (link: DocLink) => void;
  /** 뺀 행 "다시 넣기" */
  onInclude?: () => void;
  /** 새 시약 칸 펼치기·접기 */
  onToggleExpand?: () => void;
  disabled?: boolean;
  className?: string;
};

/**
 * 서류 품목 ↔ 우리 학교 시약 연결 줄 (디자인 1.17 reagent-link — 7-doc-review, d7 §21):
 * caption "우리 학교 시약" + (연결: 시약 이름 상자 · 바꾸기 · 빼기 / 새 시약: "새 시약으로 등록" 선택 pill(연하늘 + 하늘 테두리) · 바꾸기 · 빼기
 * / 뺌: "입고하지 않아요" · 다시 넣기). 바꾸기 = 우리 학교 시약 목록 + "새 시약으로 등록" 선택 상자.
 * 새 시약 행이 접혀 있으면 아래 "새 시약 · 산 · 1,000 mL" 요약(누르면 펼침).
 * 자동 연결은 lib/doc-intake-rules buildDocRows (matchReagent, §13 과 같은 규칙).
 */
export function ReagentLink({
  itemName,
  link,
  reagents,
  expanded = false,
  summary,
  onChange,
  onInclude,
  onToggleExpand,
  disabled = false,
  className,
}: Props) {
  const [picking, setPicking] = useState(false);
  const reagent = link.kind === "reagent" ? (reagents.find((r) => r.id === link.reagentId) ?? null) : null;
  const options = [
    ...reagents.map((r) => ({ value: r.id, label: `${r.name} (${r.unit})` })),
    { value: NEW_VALUE, label: DOC_TEXT.newReagent },
  ];

  return (
    <div
      data-component="reagent-link"
      data-link={link.kind}
      className={[styles.root, className ?? ""].filter(Boolean).join(" ")}
      role="group"
      aria-label={`${itemName} 연결`}
    >
      <div className={styles.row} data-name="link-row">
        <span className={styles.caption}>{DOC_TEXT.linkCaption}</span>
        {picking ? (
          <div className={styles.picker}>
            <TextInputSelect
              aria-label={`${itemName} 우리 학교 시약 고르기`}
              options={[{ value: "", label: "고르세요" }, ...options]}
              value=""
              autoFocus
              disabled={disabled}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") return;
                setPicking(false);
                onChange?.(v === NEW_VALUE ? { kind: "new" } : { kind: "reagent", reagentId: v });
              }}
            />
          </div>
        ) : link.kind === "reagent" ? (
          <span className={styles.value} data-name="text-input" title={reagent?.name}>
            {reagent ? reagent.name : "찾을 수 없는 시약"}
          </span>
        ) : link.kind === "new" ? (
          <button
            type="button"
            className={styles.newOption}
            data-name="new-reagent-option"
            aria-pressed="true"
            aria-expanded={expanded}
            disabled={disabled}
            onClick={onToggleExpand}
          >
            <Icon name="plus" className={styles.newIcon} />
            <span>{DOC_TEXT.newReagent}</span>
          </button>
        ) : (
          <span className={styles.excluded}>{DOC_TEXT.excluded}</span>
        )}

        {link.kind === "none" ? (
          <button type="button" className={styles.action} data-name="link-action" disabled={disabled} onClick={onInclude}>
            {DOC_TEXT.include}
          </button>
        ) : (
          <>
            {picking ? (
              <button type="button" className={styles.action} data-name="link-action" disabled={disabled} onClick={() => setPicking(false)}>
                닫기
              </button>
            ) : (
              <button
                type="button"
                className={styles.action}
                data-name="link-action"
                disabled={disabled}
                aria-label={`${itemName} 연결 ${DOC_TEXT.change}`}
                onClick={() => setPicking(true)}
              >
                {DOC_TEXT.change}
              </button>
            )}
            <button
              type="button"
              className={styles.action}
              data-name="link-action"
              disabled={disabled}
              aria-label={`${itemName} ${DOC_TEXT.exclude}`}
              onClick={() => {
                setPicking(false);
                onChange?.({ kind: "none" });
              }}
            >
              {DOC_TEXT.exclude}
            </button>
          </>
        )}
      </div>
      {link.kind === "new" && !expanded && summary ? (
        <button type="button" className={styles.summary} data-name="new-reagent-summary" disabled={disabled} onClick={onToggleExpand}>
          {summary}
        </button>
      ) : null}
    </div>
  );
}
