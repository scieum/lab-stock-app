"use client";

import { useEffect, useRef, useState } from "react";
import { ButtonPrimary } from "@/components/button-primary";
import { DetailDrawer } from "@/components/detail-drawer";
import { ModalCard } from "@/components/ex-modal-card";
import { PageMoreMenuItem } from "@/components/page-more-menu";
import { WipeHeading } from "@/components/reagent-wipe";
import { RecordWipeRange } from "@/components/record-wipe-range";
import { SchoolNameConfirm } from "@/components/school-name-confirm";
import { WipePreview } from "@/components/wipe-preview";
import {
  RECORD_WIPE_DEFAULT_RANGE,
  RECORD_WIPE_TEXT,
  canWipeRecords,
  checkWipeBeforeDate,
  defaultWipeBeforeDate,
  recordWipeButtonLabel,
  schoolNameMatches,
  wipeBeforeParam,
  type RecordWipeRange as Range,
  type WipeCounts,
} from "@/lib/wipe-rules";
import styles from "./styles.module.css";

/** page-more-menu 안 '기록 삭제' — 지울 기록이 0건이면 비활성 + '지울 기록이 없어요' */
export function RecordWipeItem({ empty, onSelect }: { empty: boolean; onSelect?: () => void }) {
  return (
    <PageMoreMenuItem
      data-component="record-wipe"
      label={RECORD_WIPE_TEXT.item}
      disabled={empty}
      disabledCaption={RECORD_WIPE_TEXT.empty}
      onSelect={onSelect}
    />
  );
}

export type RecordWipeRequest = { before: string | null; schoolName: string };

type Props = {
  /** sheet = 모바일 바텀시트(ex-modal-card) · drawer = 데스크톱 detail-drawer(짧은 폼) */
  variant: "sheet" | "drawer";
  schoolName: string;
  /** 오늘 (한국 날짜 YYYY-MM-DD) */
  today: string;
  /** 미리보기 수 (count_wipe_records) — null = 세는 중 */
  counts: WipeCounts | null;
  /** 범위·날짜가 바뀔 때 (p_before: null = 전체, 날짜 = 그날 미포함 이전, undefined = 날짜가 틀려 셀 수 없음) */
  onBeforeChange?: (before: string | null | undefined) => void;
  pending?: boolean;
  error?: string | null;
  onClose?: () => void;
  onConfirm?: (req: RecordWipeRequest) => void;
  initialRange?: Range;
  initialDate?: string;
  /** 갤러리 예시 — 제자리 상자 */
  inline?: boolean;
  /** 갤러리 예시 — 학교명 칸 처음 값 */
  initialName?: string;
};

/**
 * 기록 삭제 (rules 1.29 wipe.record, 시안 10-record-wipe-mobile · 10-record-wipe-desktop):
 * 제목 record-wipe(경고 아이콘 + '기록 삭제') + × → record-wipe-range → wipe-preview → school-name-confirm →
 * button-primary '기록 {N+M}건 삭제'(검정, 0건·학교명 다름·날짜 틀림이면 꺼짐). 묶음 사이 24.
 */
export function RecordWipe({
  variant,
  schoolName,
  today,
  counts,
  onBeforeChange,
  pending = false,
  error,
  onClose,
  onConfirm,
  initialRange = RECORD_WIPE_DEFAULT_RANGE,
  initialDate,
  inline = false,
  initialName = "",
}: Props) {
  const [range, setRange] = useState<Range>(initialRange);
  const [date, setDate] = useState(initialDate ?? defaultWipeBeforeDate(today));
  const [name, setName] = useState(initialName);
  const before = wipeBeforeParam(range, date, today);
  const notify = useRef(onBeforeChange);
  useEffect(() => {
    notify.current = onBeforeChange;
  });
  useEffect(() => {
    notify.current?.(before);
  }, [before]);

  const dateOk = range === "all" || checkWipeBeforeDate(date, today).ok;
  const shown = dateOk ? counts : { usage: 0, intake: 0 };
  const enabled = canWipeRecords({ counts: shown, dateOk, schoolNameOk: schoolNameMatches(name, schoolName), pending });
  const confirm = () => {
    if (!enabled || before === undefined) return;
    onConfirm?.({ before, schoolName: name.trim() });
  };
  const title = <WipeHeading data-component="record-wipe">{RECORD_WIPE_TEXT.title}</WipeHeading>;

  const body = (
    <div className={styles.body} data-name="sheet-body">
      <RecordWipeRange range={range} date={date} today={today} onRangeChange={setRange} onDateChange={setDate} disabled={pending} />
      <WipePreview counts={shown} />
      <SchoolNameConfirm schoolName={schoolName} value={name} onChange={setName} disabled={pending} />
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
  const action = (
    <ButtonPrimary fullWidth disabled={!enabled} aria-busy={pending || undefined} onClick={confirm}>
      {recordWipeButtonLabel(shown ?? { usage: 0, intake: 0 })}
    </ButtonPrimary>
  );

  if (variant === "drawer") {
    return (
      <DetailDrawer title={title} onClose={onClose} inline={inline} actions={action}>
        {body}
      </DetailDrawer>
    );
  }
  return (
    <ModalCard title={title} hideClose closeIcon onClose={onClose} density="roomy" sheet={!inline} modal={!inline}>
      {body}
      <div className={styles.actions} data-name="sheet-actions">
        {action}
      </div>
    </ModalCard>
  );
}
