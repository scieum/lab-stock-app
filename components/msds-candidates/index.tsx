"use client";

import { useId, useState } from "react";
import { ButtonPrimary } from "@/components/button-primary";
import { Icon } from "@/components/icons";
import { SheetNote, SheetPanel, SheetTextAction } from "@/components/sheet-panel";
import { TextInput } from "@/components/text-input";
import { searchedAsNote } from "@/lib/msds-aliases";
import { MSDS_TEXT, checkMsdsUrl, type MsdsCandidate } from "@/lib/msds-rules";
import styles from "./styles.module.css";

export type MsdsCandidatesStatus = "idle" | "loading" | "ready" | "error";

const NO_CANDIDATES: readonly MsdsCandidate[] = [];

type Props = {
  /** 시트 제목 — "MSDS 찾기"(화면 3·7) / 시약 이름(화면 2 일괄) */
  title?: string;
  /** 제목 옆 진행 ("1 / 4", 화면 2 일괄) */
  progress?: string;
  /** 제목 아래 한 줄 — 시약 이름(화면 3·7) / "알맞은 MSDS를 골라 주세요"(일괄) */
  caption?: string;
  /** 검색 상자 값. onQueryChange 가 없으면 검색 상자를 그리지 않는다 (시안 2-msds-bulk) */
  query?: string;
  onQueryChange?: (value: string) => void;
  /** 검색 상자에서 Enter */
  onSearch?: () => void;
  status: MsdsCandidatesStatus;
  candidates?: readonly MsdsCandidate[];
  /**
   * 실제로 결과가 나온 검색어(응답 searchedAs)와 그때 보낸 검색어 — 다르면 후보 위에 무채색 한 줄
   * "{원래 이름} → {찾은 이름}으로 찾았어요" / "CAS 7647-01-0 으로 찾았어요" (d7 §20 검색 보강)
   */
  searchedAs?: string | null;
  searchedQuery?: string;
  /** status = error 일 때 문구 */
  message?: string;
  /** "이 MSDS로" — 고른 후보 */
  onConfirm?: (candidate: MsdsCandidate) => void;
  /**
   * "직접 입력" — 있으면 부른다(화면 7: 시트를 닫고 MSDS 주소 칸으로).
   * 없으면 시트 안에서 주소 입력으로 바뀌고 onSubmitUrl 로 넘긴다(화면 3·2).
   */
  onDirect?: () => void;
  onSubmitUrl?: (url: string) => void;
  /** "건너뛰기" (화면 2 일괄) — 있으면 버튼 줄에 둔다 */
  onSkip?: () => void;
  /** "다시 찾기" (오류 뒤) */
  onRetry?: () => void;
  onClose?: () => void;
  /** 저장 중 — 버튼 비활성 */
  pending?: boolean;
  /** 저장 실패 문구 */
  error?: string | null;
  /** 시작 화면 = 직접 주소 입력 (갤러리) */
  initialDirect?: boolean;
  /** false = 제자리(갤러리) */
  sheet?: boolean;
};

/**
 * MSDS 후보 시트 (디자인 1.17 3-msds · 7-msds · 2-msds-bulk msds-candidates, d7 §20):
 * 제목(+ 진행) · × → 캡션 → (검색 상자) → 후보 행(물질명 17/600 + "CAS …" 12 회색; 고른 행 = 연하늘 + 하늘색 체크,
 * 나머지 = 회색) → "찾는 게 없어요 — 직접 입력"(0개면 "찾지 못했어요 — 직접 입력") → button-primary "이 MSDS로"
 * (일괄: "건너뛰기" + "이 MSDS로"). 결과가 오면 첫 후보를 고른 상태로 둔다. 모바일 = 하단 시트, 데스크톱 = 가운데 카드 480.
 */
export function MsdsCandidates({
  title = MSDS_TEXT.find,
  progress,
  caption,
  query,
  onQueryChange,
  onSearch,
  status,
  candidates = NO_CANDIDATES,
  searchedAs,
  searchedQuery,
  message,
  onConfirm,
  onDirect,
  onSubmitUrl,
  onSkip,
  onRetry,
  onClose,
  pending = false,
  error,
  initialDirect = false,
  sheet = true,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(candidates[0]?.chemId ?? null);
  const [direct, setDirect] = useState(initialDirect);
  const [url, setUrl] = useState("");
  const [touched, setTouched] = useState(false);
  const listLabel = useId();

  // 새 결과가 오면 첫 후보를 고른 상태로 (시안: 첫 행 선택) — 렌더 중에 맞춘다
  const [shown, setShown] = useState(candidates);
  if (shown !== candidates) {
    setShown(candidates);
    setSelectedId(candidates[0]?.chemId ?? null);
  }

  const selected = candidates.find((c) => c.chemId === selectedId) ?? null;
  const ready = status === "ready";
  const empty = ready && candidates.length === 0;
  const note = ready && candidates.length > 0 ? searchedAsNote(searchedQuery ?? query ?? "", searchedAs) : null;
  const checkedUrl = checkMsdsUrl(url);
  const urlError = touched && url.trim() !== "" && !checkedUrl.ok ? MSDS_TEXT.urlError : undefined;

  const openDirect = () => {
    if (onDirect) onDirect();
    else setDirect(true);
  };

  const confirmDirect = () => {
    setTouched(true);
    if (checkedUrl.ok && !pending) onSubmitUrl?.(checkedUrl.value);
  };

  const titleAddon = progress ? <span className={styles.progress}>{progress}</span> : undefined;

  if (direct) {
    return (
      <SheetPanel
        data-component="msds-candidates"
        title={title}
        titleAddon={titleAddon}
        caption={caption}
        onClose={onClose}
        sheet={sheet}
        size="sm"
        className={styles.panel}
        footer={
          <>
            {error ? <SheetNote role="alert" tone="strong">{error}</SheetNote> : null}
            <div className={styles.actions}>
              <SheetTextAction onClick={() => setDirect(false)} disabled={pending}>
                {MSDS_TEXT.backToList}
              </SheetTextAction>
              {onSkip ? (
                <SheetTextAction onClick={onSkip} disabled={pending}>
                  {MSDS_TEXT.skip}
                </SheetTextAction>
              ) : null}
              <ButtonPrimary className={styles.confirm} onClick={confirmDirect} disabled={pending || !checkedUrl.ok}>
                {pending ? "저장 중…" : MSDS_TEXT.directConfirm}
              </ButtonPrimary>
            </div>
          </>
        }
      >
        <form
          className={styles.directForm}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            confirmDirect();
          }}
        >
          <TextInput
            label={MSDS_TEXT.directLabel}
            labelTone="strong"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => setTouched(true)}
            error={urlError}
            autoFocus
          />
        </form>
      </SheetPanel>
    );
  }

  return (
    <SheetPanel
      data-component="msds-candidates"
      title={title}
      titleAddon={titleAddon}
      caption={caption}
      onClose={onClose}
      sheet={sheet}
      size="sm"
      className={styles.panel}
      footer={
        <>
          {error ? <SheetNote role="alert" tone="strong">{error}</SheetNote> : null}
          <div className={styles.actions}>
            {onSkip ? (
              <SheetTextAction onClick={onSkip} disabled={pending}>
                {MSDS_TEXT.skip}
              </SheetTextAction>
            ) : null}
            <ButtonPrimary
              className={styles.confirm}
              disabled={pending || !selected}
              onClick={() => {
                if (selected && !pending) onConfirm?.(selected);
              }}
            >
              {pending ? "저장 중…" : MSDS_TEXT.confirm}
            </ButtonPrimary>
          </div>
        </>
      }
    >
      {onQueryChange ? (
        <form
          role="search"
          className={styles.searchForm}
          onSubmit={(e) => {
            e.preventDefault();
            onSearch?.();
          }}
        >
          <TextInput
            type="search"
            icon="search"
            aria-label="물질명 또는 CAS 번호"
            placeholder="물질명 또는 CAS 번호"
            autoComplete="off"
            enterKeyHint="search"
            value={query ?? ""}
            onChange={(e) => onQueryChange(e.target.value)}
          />
        </form>
      ) : null}

      {status === "loading" ? (
        <div className={styles.state} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <span>{MSDS_TEXT.loading}</span>
        </div>
      ) : null}

      {status === "error" ? (
        <div className={styles.errorBox} role="alert">
          <p className={styles.errorText}>{message ?? MSDS_TEXT.upstream}</p>
          {onRetry ? <SheetTextAction onClick={onRetry}>다시 찾기</SheetTextAction> : null}
        </div>
      ) : null}

      {note ? (
        <p data-name="msds-searched-as" className={styles.searchedAs}>
          {note}
        </p>
      ) : null}

      {ready && candidates.length > 0 ? (
        <div role="radiogroup" aria-labelledby={listLabel} className={styles.list}>
          <span id={listLabel} className={styles.srOnly}>
            MSDS 후보
          </span>
          {candidates.map((c) => {
            const on = c.chemId === selectedId;
            return (
              <button
                key={c.chemId}
                type="button"
                role="radio"
                aria-checked={on}
                data-name={on ? "candidate-row-selected" : "candidate-row"}
                className={[styles.row, on ? styles.rowOn : ""].filter(Boolean).join(" ")}
                onClick={() => setSelectedId(c.chemId)}
              >
                <span className={styles.rowBody}>
                  <span className={styles.name}>{c.name}</span>
                  <span className={styles.cas}>{c.cas ? `CAS ${c.cas}` : "CAS 없음"}</span>
                </span>
                {on ? <Icon name="check" className={styles.check} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {status !== "loading" ? (
        <button type="button" data-name="msds-direct" className={styles.direct} onClick={openDirect} disabled={pending}>
          <span>{empty ? MSDS_TEXT.noResult : MSDS_TEXT.moreDirect}</span>
          <Icon name="chevron-right" className={styles.chevron} />
        </button>
      ) : null}
    </SheetPanel>
  );
}
