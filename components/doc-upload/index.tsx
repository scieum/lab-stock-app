"use client";

import { useId, useRef, useState } from "react";
import { BadgeOverlay } from "@/components/badge-overlay";
import { ButtonOutline } from "@/components/button-outline";
import { ButtonPillSoft } from "@/components/button-pill-soft";
import { ButtonPrimary } from "@/components/button-primary";
import { Icon } from "@/components/icons";
import type { ManualUploadFile } from "@/components/manual-upload/file";
import { DOC_TEXT } from "@/lib/doc-intake-rules";
import { useIsDesktop } from "@/lib/use-viewport";
import { MANUAL_FILE_ACCEPT } from "@/lib/manual-rules";
import styles from "./styles.module.css";

export type DocUploadFile = ManualUploadFile;

type Props = {
  /** 고른 파일 (이름 · 종류 · 이미지 미리보기 주소) — 없으면 안내 + 촬영하기·파일 선택 */
  file: DocUploadFile | null;
  /** 파일을 고르거나 끌어다 놓았을 때. 검사는 부르는 쪽이 한다 (lib/manual-rules validateManualFile) */
  onFileChange?: (file: File) => void;
  /** "AI로 읽기" */
  onRead?: () => void;
  /** 처리 중 "취소" */
  onCancel?: () => void;
  /** 처리 중: 미리보기 + 진행 막대 + "읽는 중이에요" + 취소 */
  processing?: boolean;
  /** 파일 오류·추출 실패 문구 */
  error?: string | null;
  /** 안내 제목 (기본 "품의서·영수증·거래명세서를 올려 주세요", 실패 뒤 "다른 파일 올리기") */
  heading?: string;
  /** 저장 중 등 잠금 */
  disabled?: boolean;
  /**
   * true = 데스크톱(≥ 1024)에서 시안 7-desktop 모양 (d7 §23 run c): 위 icon-upload · 가운데 정렬 · "파일 선택" 1개(촬영하기 없음) ·
   * 아래 drop-hint "여기에 끌어다 놓아도 돼요". "AI로 읽기"는 카드 안에 두지 않고 부르는 쪽이 bottom-bar 에 둔다. 모바일은 그대로.
   */
  desktopBar?: boolean;
  className?: string;
};

const DOC_LINES = ["l1", "l2", "l3", "l4", "l5", "l6"] as const;

/**
 * 서류 올리기 (디자인 1.17 doc-upload — 7 · 7-doc-upload · 7-doc-fail, d7 §21. 교사·admin 만 — R5 학생 0).
 * 흰 카드(테두리 hairline-strong, radius 24, 안쪽 24, 사이 16):
 * - 처음: 제목 "품의서·영수증·거래명세서를 올려 주세요" + "PDF·JPG·PNG, 4MB까지" → [촬영하기][파일 선택](button-pill-soft) → "AI로 읽기"(button-primary, 파일 전 비활성)
 * - 파일 고름: 미리보기(문서 자리 · 이미지 썸네일 + 파일 이름 띠) 추가, "AI로 읽기" 활성
 * - 처리 중(7-doc-upload): 미리보기 → 진행 막대(연하늘 트랙 + 하늘색) → "읽는 중이에요" · "품목·규격·수량을 찾고 있어요" · "잠시만 기다려 주세요" → [취소] → "AI로 읽기"(비활성)
 * 파일은 실제 input[type=file] 로 고른다(촬영하기 = capture 카메라). 파일을 어디에도 저장하지 않는다 — 부르는 쪽이 추출 요청에만 싣는다.
 */
export function DocUpload({
  file,
  onFileChange,
  onRead,
  onCancel,
  processing = false,
  error,
  heading = DOC_TEXT.uploadHeading,
  disabled = false,
  desktopBar = false,
  className,
}: Props) {
  const desktop = useIsDesktop();
  // 데스크톱 bottom-bar 모양: 하이드레이션 뒤 데스크톱이면 촬영하기 · 카드 안 "AI로 읽기"를 DOM 에서 뺀다 (첫 그림은 CSS 로 숨김)
  const barMode = desktopBar && desktop === true;
  const headingId = useId();
  const errorId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const locked = disabled || processing;
  const state = processing ? "processing" : file ? "selected" : "empty";

  const pick = (files: FileList | null | undefined) => {
    const first = files?.[0];
    if (first) onFileChange?.(first);
  };

  return (
    <section
      data-component="doc-upload"
      data-state={state}
      data-dragging={dragging ? "" : undefined}
      data-desktop-bar={desktopBar ? "" : undefined}
      className={[styles.root, className ?? ""].filter(Boolean).join(" ")}
      aria-labelledby={headingId}
      aria-busy={processing ? true : undefined}
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
        ref={fileRef}
        type="file"
        accept={MANUAL_FILE_ACCEPT}
        className={styles.fileInput}
        tabIndex={-1}
        aria-hidden="true"
        disabled={locked}
        data-testid="doc-file-input"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        className={styles.fileInput}
        tabIndex={-1}
        aria-hidden="true"
        disabled={locked}
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />

      {desktopBar && !processing && !file ? (
        <Icon name="upload" className={styles.topIcon} aria-hidden="true" data-name="icon-upload" />
      ) : null}

      {processing ? null : (
        <div className={styles.text} data-name="upload-text">
          <h2 id={headingId} className={styles.heading}>
            {heading}
          </h2>
          <p className={styles.caption}>{DOC_TEXT.uploadCaption}</p>
        </div>
      )}

      {file ? (
        <div className={styles.preview} data-name="doc-preview">
          {file.kind === "image" && file.previewUrl ? (
            // 브라우저 안의 blob: 미리보기라 next/image 를 쓰지 않는다
            // eslint-disable-next-line @next/next/no-img-element
            <img src={file.previewUrl} alt="" className={styles.thumb} />
          ) : (
            <span className={styles.docPage} aria-hidden="true" data-name="doc-page">
              {DOC_LINES.map((l) => (
                <span key={l} className={[styles.docLine, styles[l]].join(" ")} />
              ))}
            </span>
          )}
          {/* 시안 7-doc-upload 의 badge-overlay (파일 이름) */}
          <BadgeOverlay className={styles.fileName}>{file.name}</BadgeOverlay>
        </div>
      ) : null}

      {processing ? (
        <>
          <div role="progressbar" aria-label={DOC_TEXT.readingBody} className={styles.track} data-name="progress-track">
            <span className={styles.fill} />
          </div>
          <div className={styles.reading} data-name="reading-text" role="status">
            <h2 id={headingId} className={styles.heading}>
              {DOC_TEXT.readingTitle}
            </h2>
            <p className={styles.body}>{DOC_TEXT.readingBody}</p>
            <p className={styles.caption}>{DOC_TEXT.readingCaption}</p>
          </div>
          <div className={styles.cancel}>
            <ButtonOutline onClick={onCancel}>{DOC_TEXT.cancel}</ButtonOutline>
          </div>
        </>
      ) : (
        <div className={styles.actions} data-name="upload-actions">
          {barMode ? null : (
            <ButtonPillSoft fullWidth className={[styles.pick, styles.camera].join(" ")} disabled={locked} onClick={() => cameraRef.current?.click()}>
              <span className={styles.pickLabel}>
                <Icon name="qr" className={styles.pickIcon} />
                {DOC_TEXT.camera}
              </span>
            </ButtonPillSoft>
          )}
          <ButtonPillSoft fullWidth className={styles.pick} disabled={locked} onClick={() => fileRef.current?.click()}>
            <span className={styles.pickLabel}>
              <Icon name={desktopBar ? "file" : "upload"} className={styles.pickIcon} />
              {file ? "다른 파일 선택" : DOC_TEXT.pickFile}
            </span>
          </ButtonPillSoft>
        </div>
      )}

      {desktopBar && !processing ? (
        <p className={styles.dropHint} data-name="drop-hint">
          여기에 끌어다 놓아도 돼요
        </p>
      ) : null}

      {error ? (
        <p id={errorId} role="alert" className={styles.error}>
          <Icon name="warning" className={styles.errorIcon} />
          <span>{error}</span>
        </p>
      ) : null}

      {barMode ? null : (
        <ButtonPrimary
          fullWidth
          className={styles.read}
          disabled={!file || locked}
          onClick={onRead}
          aria-describedby={error ? errorId : undefined}
        >
          {DOC_TEXT.read}
        </ButtonPrimary>
      )}
    </section>
  );
}
