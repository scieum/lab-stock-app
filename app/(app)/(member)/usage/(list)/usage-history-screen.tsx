"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DataRecordRow } from "@/components/ex-data-table-cell";
import { EmptyStateCard } from "@/components/ex-empty-state-card";
import { ModalCard } from "@/components/ex-modal-card";
import { MsdsEntry } from "@/components/msds-entry";
import { RecordGroup, RecordList } from "@/components/record-group";
import { SegmentedControl } from "@/components/segmented-control";
import { TextInput, TextInputSelect } from "@/components/text-input";
import {
  DEFAULT_USAGE_PERIOD,
  USAGE_HISTORY_LIMIT,
  USAGE_PERIOD_OPTIONS,
  USAGE_QUERY_MAX,
  normalizeUsageQuery,
  toUsagePeriod,
  type UsagePeriod,
} from "@/lib/usage-history-rules";
import styles from "./usage-history.module.css";

export type UsageHistoryItem = {
  id: string;
  /** 사용일 "10.02" */
  date: string;
  /** 사용일 "2026-10-02" (d7 §15) */
  usedOn: string;
  /** 기록한 시각 "2026-10-02 14:20" (한국 시간) */
  recordedAt: string;
  /** 기록한 날이 사용일과 다를 때만 "10월 6일에 기록" */
  recordedCaption: string | null;
  reagentName: string;
  userName: string;
  /** 행의 사용자 줄: 기록한 날 = 사용일이면 "학생 이OO · 14:05", 다르면 "교사 김OO" */
  subtitle: string;
  /** "5" */
  amount: string;
  unit: string;
  /** "5 g" */
  amountLabel: string;
  memo: string | null;
  msdsUrl: string | null;
};

export type UsageHistoryGroup = {
  /** 사용일 "2026-10-07" */
  key: string;
  /** "10월 7일 · 오늘" · "10월 6일" */
  label: string;
  records: UsageHistoryItem[];
};

type Filter = { onlyMine: boolean; period: UsagePeriod; query: string };

type Props = {
  /** 서버가 실제로 적용한 필터 */
  filter: Filter;
  /** 사용일 최신순(같은 날은 기록 시각 최신순), 사용일별 묶음 */
  groups: UsageHistoryGroup[];
  /** 상한(200건)에 닿아 더 있을 수 있음 */
  truncated: boolean;
};

const SCOPES = [
  { value: "all", label: "전체" },
  { value: "mine", label: "내 기록" },
];
const PERIOD_OPTIONS = USAGE_PERIOD_OPTIONS.map((o) => ({ value: o.value, label: o.label }));
/** 검색어 입력이 멈춘 뒤 조회까지 기다리는 시간 */
const SEARCH_DELAY_MS = 350;

function hrefOf(f: Filter): string {
  const p = new URLSearchParams();
  if (f.onlyMine) p.set("mine", "1");
  if (f.period !== DEFAULT_USAGE_PERIOD) p.set("period", f.period);
  if (f.query) p.set("q", f.query);
  const qs = p.toString();
  return qs ? `/usage?${qs}` : "/usage";
}

/**
 * 화면 10 사용 기록 내역.
 * 시안: (데스크톱 screen-title) → filter-row(전체/내 기록 · 기간 · 시약명 검색) → record-list(사용일별 묶음 "10월 7일 · 오늘")
 *       + 누른 기록의 ex-modal-card (모바일: tab-bar 위 하단 시트 / 데스크톱: history-layout 의 목록 옆 열).
 * 필터는 주소(?mine · ?period · ?q)에 두고 서버가 다시 조회한다. 학교·사용자 값은 보내지 않는다.
 */
export function UsageHistoryScreen({ filter, groups, truncated }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // 눌렀을 때 바로 바뀌어 보이고, 서버 응답이 오면 서버 값으로 맞춰진다
  const [shown, setShown] = useOptimistic(filter);

  // 검색어: 입력 값은 여기서 들고, 멈추면 주소로 보낸다
  const [text, setText] = useState(filter.query);
  // 보냈지만 아직 서버 응답으로 돌아오지 않은 검색어 — 내가 보낸 값의 응답이면 입력 중인 글자를 덮지 않는다
  const [sent, setSent] = useState<string[]>([]);
  const [seenQuery, setSeenQuery] = useState(filter.query);
  if (filter.query !== seenQuery) {
    setSeenQuery(filter.query);
    const i = sent.indexOf(filter.query);
    if (i >= 0) {
      setSent(sent.slice(i + 1));
    } else {
      // 밖에서 바뀐 주소 (탭바 "기록" 을 다시 누름 등)
      setSent([]);
      setText(filter.query);
    }
  }

  const go = (next: Filter) => {
    startTransition(() => {
      setShown(next);
      router.replace(hrefOf(next), { scroll: false });
    });
  };

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const sendQuery = (raw: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const query = normalizeUsageQuery(raw) ?? "";
    if (query === shown.query) return;
    setSent((s) => [...s, query]);
    go({ ...shown, query });
  };

  const changeText = (raw: string) => {
    setText(raw);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => sendQuery(raw), SEARCH_DELAY_MS);
  };

  const changeScope = (value: string) => {
    // 기다리는 검색어가 있으면 같이 보낸다
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const query = normalizeUsageQuery(text) ?? "";
    if (query !== shown.query) setSent((s) => [...s, query]);
    go({ ...shown, query, onlyMine: value === "mine" });
  };

  const changePeriod = (value: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const query = normalizeUsageQuery(text) ?? "";
    if (query !== shown.query) setSent((s) => [...s, query]);
    go({ ...shown, query, period: toUsagePeriod(value) });
  };

  // ---- 상세 ----
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const all = groups.flatMap((g) => g.records);
  // 필터가 바뀌어 목록에서 빠진 기록의 상세는 닫힌다
  const selected = selectedId ? (all.find((r) => r.id === selectedId) ?? null) : null;
  const rows = useRef(new Map<string, HTMLButtonElement>());
  const detailRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);

  const closeDetail = () => {
    // 포커스를 누른 행으로 돌려준다
    if (selectedId) rows.current.get(selectedId)?.focus({ preventScroll: true });
    setSelectedId(null);
  };

  const openId = selected?.id ?? null;
  // 모바일(하단 시트): 시트 높이만큼 목록 아래를 비워 마지막 행까지 시트 위로 올릴 수 있게 하고,
  // 누른 행이 시트에 가려졌으면 시트 위로 올린다. 데스크톱(옆 열)에서는 아무것도 하지 않는다.
  useEffect(() => {
    const page = pageRef.current;
    const card = detailRef.current?.firstElementChild;
    if (!page || !openId || !(card instanceof HTMLElement)) return;
    const isSheet = () => getComputedStyle(card).position === "fixed";
    const apply = () => {
      if (isSheet()) page.style.setProperty("--usage-sheet-space", `${Math.ceil(card.getBoundingClientRect().height)}px`);
      else page.style.removeProperty("--usage-sheet-space");
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(card);
    window.addEventListener("resize", apply);
    if (isSheet()) {
      const row = rows.current.get(openId);
      if (row) {
        const hidden = row.getBoundingClientRect().bottom - card.getBoundingClientRect().top;
        if (hidden > 0) window.scrollBy({ top: hidden + row.offsetHeight / 4 });
      }
    }
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
      page.style.removeProperty("--usage-sheet-space");
    };
  }, [openId]);

  const total = all.length;

  return (
    <div ref={pageRef} className={styles.page}>
      <h1 className={styles.title}>사용 기록 내역</h1>

      <div className={styles.filters} role="search" aria-label="사용 기록 필터">
        <div className={styles.scope}>
          <SegmentedControl
            label="기록 범위"
            options={SCOPES}
            value={shown.onlyMine ? "mine" : "all"}
            onChange={changeScope}
          />
        </div>
        <TextInputSelect
          className={styles.period}
          aria-label="기간"
          name="period"
          options={PERIOD_OPTIONS}
          value={shown.period}
          onChange={(e) => changePeriod(e.target.value)}
        />
        <TextInput
          className={styles.search}
          inputMode="search"
          name="q"
          icon="search"
          placeholder="시약명 검색"
          autoComplete="off"
          enterKeyHint="search"
          maxLength={USAGE_QUERY_MAX}
          value={text}
          onChange={(e) => changeText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              sendQuery(text);
            }
          }}
        />
      </div>

      <div className={styles.layout} data-name="history-layout">
        <div className={styles.listColumn} aria-busy={pending ? true : undefined}>
          {total === 0 ? (
            <EmptyStateCard title="아직 사용 기록이 없어요" />
          ) : (
            <RecordList label="사용 기록">
              {groups.map((g) => (
                <RecordGroup key={g.key} label={g.label}>
                  {g.records.map((r) => (
                    <DataRecordRow
                      key={r.id}
                      ref={(el) => {
                        if (el) rows.current.set(r.id, el);
                        else rows.current.delete(r.id);
                      }}
                      title={r.reagentName}
                      subtitle={r.subtitle}
                      caption={r.recordedCaption ?? undefined}
                      amount={r.amountLabel}
                      selected={r.id === openId}
                      onClick={() => {
                        if (r.id === openId) closeDetail();
                        else setSelectedId(r.id);
                      }}
                    />
                  ))}
                </RecordGroup>
              ))}
            </RecordList>
          )}
          {truncated ? (
            <p className={styles.more}>
              최근 {USAGE_HISTORY_LIMIT}건까지만 보여요. 기간을 줄이거나 시약명으로 검색해 보세요
            </p>
          ) : null}
        </div>

        <div ref={detailRef} className={styles.detail}>
          {selected ? (
            <ModalCard
              key={selected.id}
              modal={false}
              title={selected.reagentName}
              amount={selected.amount}
              unit={selected.unit}
              fields={[
                { label: "사용자", value: selected.userName },
                { label: "사용일", value: selected.usedOn },
                { label: "기록한 날", value: selected.recordedAt },
                { label: "메모", value: selected.memo ?? "-" },
              ]}
              onClose={closeDetail}
            >
              <MsdsEntry
                variant="button"
                href={selected.msdsUrl ?? undefined}
                notice="MSDS 링크가 아직 등록되지 않았어요"
              />
            </ModalCard>
          ) : null}
        </div>
      </div>
    </div>
  );
}
