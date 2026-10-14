"use client";

import { useState } from "react";
import { PageMoreMenu } from "@/components/page-more-menu";
import { ReagentWipeConfirm, ReagentWipeItem } from "@/components/reagent-wipe";
import { RecordWipe, RecordWipeItem } from "@/components/record-wipe";
import { RecordWipeRange } from "@/components/record-wipe-range";
import { SchoolNameConfirm } from "@/components/school-name-confirm";
import { WipePreview } from "@/components/wipe-preview";
import { inWipeRange, recordWipeDoneText, reagentWipeDoneText, type RecordWipeRange as Range, type WipeCounts } from "@/lib/wipe-rules";
import styles from "../gallery.module.css";

const SCHOOL = "샘플고등학교";
const TODAY = "2026-10-13";

/** 예시 기록 날짜 (사용 · 입고) — 미리보기 수를 범위대로 센다 */
const USAGE_DAYS = ["2026-08-20", "2026-08-28", "2026-09-03", "2026-09-15", "2026-10-02"];
const INTAKE_DAYS = ["2026-08-11", "2026-09-20"];

function countFor(before: string | null): WipeCounts {
  return {
    usage: USAGE_DAYS.filter((d) => inWipeRange(d, before)).length,
    intake: INTAKE_DAYS.filter((d) => inWipeRange(d, before)).length,
  };
}

/** ⋯ → 시약 전체 삭제 → 확인 카드 (학교명 맞아야 켜짐) → 실행 결과 글자 */
export function ReagentWipeDemo({ count = 42 }: { count?: number }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [done, setDone] = useState<string | null>(null);
  return (
    <div className={styles.stage}>
      <div className={styles.row}>
        <PageMoreMenu label="시약 목록 더보기">
          <ReagentWipeItem count={count} onSelect={() => setOpen(true)} />
        </PageMoreMenu>
        {done ? <span className={styles.more}>{done}</span> : null}
      </div>
      {open ? (
        <ReagentWipeConfirm
          count={count}
          schoolName={SCHOOL}
          value={name}
          onValueChange={setName}
          sheet={false}
          modal={false}
          onCancel={() => setOpen(false)}
          onConfirm={() => {
            setOpen(false);
            setName("");
            setDone(reagentWipeDoneText(count));
          }}
        />
      ) : null}
    </div>
  );
}

/** ⋯ → 기록 삭제 → 범위 · 미리보기 · 학교명 → 실행 */
export function RecordWipeDemo({ variant }: { variant: "sheet" | "drawer" }) {
  const [open, setOpen] = useState(true);
  const [counts, setCounts] = useState<WipeCounts | null>(null);
  const [done, setDone] = useState<string | null>(null);
  return (
    <div className={styles.stage}>
      <div className={styles.row}>
        <PageMoreMenu label="사용 기록 더보기">
          <RecordWipeItem empty={false} onSelect={() => setOpen(true)} />
        </PageMoreMenu>
        {done ? <span className={styles.more}>{done}</span> : null}
      </div>
      {open ? (
        <RecordWipe
          variant={variant}
          inline
          schoolName={SCHOOL}
          today={TODAY}
          initialDate="2026-09-01"
          counts={counts}
          onBeforeChange={(before) => setCounts(before === undefined ? { usage: 0, intake: 0 } : countFor(before))}
          onClose={() => setOpen(false)}
          onConfirm={({ before }) => {
            setOpen(false);
            setDone(recordWipeDoneText(countFor(before)));
          }}
        />
      ) : null}
    </div>
  );
}

/** school-name-confirm 단독 — 다르면 '학교 이름이 달라요' */
export function SchoolNameConfirmDemo({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <SchoolNameConfirm schoolName={SCHOOL} value={value} onChange={setValue} />;
}

/** record-wipe-range + wipe-preview 단독 */
export function RangePreviewDemo() {
  const [range, setRange] = useState<Range>("before");
  const [date, setDate] = useState("2026-09-01");
  const counts = countFor(range === "all" ? null : date);
  return (
    <>
      <RecordWipeRange range={range} date={date} today={TODAY} onRangeChange={setRange} onDateChange={setDate} />
      <WipePreview counts={counts} />
    </>
  );
}
