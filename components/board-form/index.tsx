"use client";

import { useId, useState } from "react";
import { BoardPrivacyNote } from "@/components/board-privacy-note";
import { ButtonPrimary } from "@/components/button-primary";
import { SegmentedControl } from "@/components/segmented-control";
import { TextInput, TextInputArea } from "@/components/text-input";
import { BOARD_BODY_MAX, BOARD_POST_CATEGORIES, BOARD_TEXT, BOARD_TITLE_MAX, type BoardCategory } from "@/lib/board";
import styles from "./styles.module.css";

export type BoardFormValues = { category: BoardCategory; title: string; body: string };

type Props = {
  /** post = 교사 글(분류 오류 문의 · 개선 제안) · faq = 운영자 FAQ(분류 고정, 제목 = 질문 · 본문 = 답) */
  mode?: "post" | "faq";
  defaultValues?: Partial<BoardFormValues>;
  /** 등록 버튼 글자 (기본 '등록') */
  submitLabel?: string;
  submitting?: boolean;
  /** 버튼 위 오류 한 줄 */
  error?: string | null;
  onSubmit?: (values: BoardFormValues) => void;
};

/**
 * board-form (rules 1.32 board.form, 시안 20-new): 분류 segmented(오류 문의 · 개선 제안) → 제목 text-input → board-privacy-note
 * → 본문(여러 줄) → button-primary '등록'(전폭). 빈 제목·본문이면 버튼 꺼짐. 묶음 사이 16. 저장은 부르는 쪽(onSubmit).
 */
export function BoardForm({ mode = "post", defaultValues, submitLabel = BOARD_TEXT.submit, submitting = false, error, onSubmit }: Props) {
  const [category, setCategory] = useState<BoardCategory>(mode === "faq" ? "faq" : (defaultValues?.category ?? "bug"));
  const [title, setTitle] = useState(defaultValues?.title ?? "");
  const [body, setBody] = useState(defaultValues?.body ?? "");
  const noteId = useId();
  const ready = title.trim().length > 0 && body.trim().length > 0 && !submitting;
  const isFaq = mode === "faq";

  return (
    <form
      data-component="board-form"
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        onSubmit?.({ category: isFaq ? "faq" : category, title: title.trim(), body: body.trim() });
      }}
    >
      {isFaq ? null : (
        <div className={styles.field}>
          <span className={styles.fieldLabel} id={`${noteId}-category`}>
            {BOARD_TEXT.categoryField}
          </span>
          <SegmentedControl
            label={BOARD_TEXT.categoryField}
            options={BOARD_POST_CATEGORIES}
            value={category}
            onChange={(v) => setCategory(v as BoardCategory)}
          />
          <input type="hidden" name="category" value={category} />
        </div>
      )}
      <TextInput
        label={isFaq ? BOARD_TEXT.faqTitleField : BOARD_TEXT.titleField}
        name="title"
        value={title}
        maxLength={BOARD_TITLE_MAX}
        placeholder={isFaq ? undefined : BOARD_TEXT.titlePlaceholder}
        autoComplete="off"
        onChange={(e) => setTitle(e.target.value)}
        aria-describedby={isFaq ? undefined : noteId}
      />
      {isFaq ? null : <BoardPrivacyNote id={noteId} />}
      <TextInputArea
        label={isFaq ? BOARD_TEXT.faqBodyField : BOARD_TEXT.bodyField}
        name="body"
        value={body}
        maxLength={BOARD_BODY_MAX}
        placeholder={isFaq ? undefined : BOARD_TEXT.bodyPlaceholder}
        onChange={(e) => setBody(e.target.value)}
      />
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      <ButtonPrimary type="submit" fullWidth className={styles.submit} disabled={!ready} aria-busy={submitting || undefined}>
        {submitLabel}
      </ButtonPrimary>
    </form>
  );
}
