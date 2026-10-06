"use client";

import { useId, useState } from "react";
import { BadgeOverlay } from "@/components/badge-overlay";
import { Icon } from "@/components/icons";
import { MANUAL_FILE_ACCEPT } from "@/lib/manual-rules";
import type { ManualUploadFile } from "./file";
import styles from "./styles.module.css";

export type ManualUploadAreaProps = {
  /** 상단 안내 문구 (body-lg) */
  guide?: string;
  /** 고른 파일 (없으면 "파일을 선택하세요" 타일) */
  file: ManualUploadFile | null;
  /** 파일을 고르거나(누르기·끌어다 놓기) 지웠을 때. 검사는 부르는 쪽이 한다 (lib/manual-rules validateManualFile) */
  onFileChange?: (file: File | null) => void;
  /** 파일 오류 문구 (형식·4MB 초과) */
  error?: string | null;
  /** 처리 중: 진행 막대 + 문구, 파일 바꾸기·지우기 잠금 */
  processing?: boolean;
  processingLabel?: string;
  /** 파일 바꾸기·지우기 잠금 (저장 중 등) */
  disabled?: boolean;
  /** 파일 선택 전 타일 문구 */
  emptyTitle?: string;
  emptyHint?: string;
  accept?: string;
};

const DOC_LINES = ["l1", "l2", "l3", "l4", "l5", "l6"] as const;

/**
 * 화면 5 의 업로드 영역: 안내 문구 → 업로드/미리보기 타일(+ 파일 이름 badge-overlay) → 파일 바꾸기·지우기 → 오류 → 처리 중.
 * 파일은 실제 input[type=file] 로 고른다 (타일의 글자가 그 입력의 label — 키보드 Tab·Enter·Space 로도 열린다).
 */
export function ManualUploadArea({
  guide = "실험 매뉴얼을 올리면 시약별 사용량을 찾아드려요",
  file,
  onFileChange,
  error,
  processing = false,
  processingLabel = "사용량을 찾고 있어요",
  disabled = false,
  emptyTitle = "파일을 선택하세요",
  emptyHint = "PDF · JPG · PNG, 4MB 이하 · 끌어다 놓아도 돼요",
  accept = MANUAL_FILE_ACCEPT,
}: ManualUploadAreaProps) {
  const guideId = useId();
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const [dragging, setDragging] = useState(false);
  const locked = disabled || processing;
  const state = processing ? "processing" : file ? "selected" : "empty";
  const describedBy = [file ? "" : hintId, error ? errorId : ""].filter(Boolean).join(" ") || undefined;

  const pick = (files: FileList | null | undefined) => {
    const first = files?.[0];
    if (first) onFileChange?.(first);
  };

  return (
    <section
      data-component="manual-upload"
      data-variant="upload"
      data-state={state}
      className={styles.upload}
      aria-labelledby={guideId}
      aria-busy={processing ? true : undefined}
    >
      <h2 id={guideId} className={styles.uploadGuide}>
        {guide}
      </h2>
      <div
        className={styles.tile}
        data-dragging={dragging ? "" : undefined}
        data-locked={locked ? "" : undefined}
        onDragOver={(e) => {
          if (locked) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!locked) pick(e.dataTransfer?.files);
        }}
      >
        <input
          id={inputId}
          type="file"
          accept={accept}
          className={styles.fileInput}
          disabled={locked}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => {
            pick(e.target.files);
            // 같은 파일을 다시 골라도 change 가 나게 비운다
            e.target.value = "";
          }}
        />
        {file ? (
          <div className={styles.preview}>
            {file.kind === "image" && file.previewUrl ? (
              // 브라우저 안의 blob: 미리보기라 next/image 를 쓰지 않는다
              // eslint-disable-next-line @next/next/no-img-element
              <img src={file.previewUrl} alt="" className={styles.thumb} />
            ) : (
              <span className={styles.docPage} aria-hidden="true">
                {DOC_LINES.map((l) => (
                  <span key={l} className={[styles.docLine, styles[l]].join(" ")} />
                ))}
              </span>
            )}
            <BadgeOverlay>{file.name}</BadgeOverlay>
          </div>
        ) : (
          <label htmlFor={inputId} className={styles.drop}>
            <Icon name="upload" className={styles.uploadIcon} />
            <span className={styles.dropTitle}>{emptyTitle}</span>
            <span id={hintId} className={styles.dropHint}>
              {emptyHint}
            </span>
          </label>
        )}
      </div>
      {file ? (
        <div className={styles.fileActions}>
          <label htmlFor={inputId} className={styles.fileAction} data-disabled={locked ? "" : undefined}>
            다른 파일 선택
          </label>
          <button type="button" className={styles.fileAction} disabled={locked} onClick={() => onFileChange?.(null)}>
            지우기
          </button>
        </div>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className={styles.fileError}>
          {error}
        </p>
      ) : null}
      {processing ? (
        <div className={styles.progress}>
          <div role="progressbar" aria-label={processingLabel} className={styles.progressTrack}>
            <span className={styles.progressBar} />
          </div>
          <p className={styles.progressLabel} role="status">
            {processingLabel}
          </p>
        </div>
      ) : null}
    </section>
  );
}
