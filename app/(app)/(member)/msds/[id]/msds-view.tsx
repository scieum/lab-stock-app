import { Suspense } from "react";
import Link from "next/link";
import { EmptyStateCard } from "@/components/ex-empty-state-card";
import { Icon } from "@/components/icons";
import { MsdsOriginalLink } from "@/components/msds-original-link";
import { MsdsSummary } from "@/components/msds-summary";
import { linkPrefetch } from "@/lib/link-prefetch";
import { koshaChemIdFromUrl, MSDS_SUMMARY_TEXT, msdsTitle } from "@/lib/msds-summary";
import { getMsdsSummary } from "@/lib/server/kosha-msds-detail";
import styles from "./msds.module.css";

type Props = {
  /** 맨 위 nav-pill (로그인 AppNav · 둘러보기 DemoNav) */
  nav: React.ReactNode;
  name: string;
  msdsUrl: string;
  backHref: string;
};

/** 공단 요약 읽기 — 느린 외부 호출이라 Suspense 안 (불러오는 동안 msds-skeleton) */
async function SummaryBody({ chemId }: { chemId: string }) {
  const result = await getMsdsSummary(chemId);
  if (!result.ok) return <EmptyStateCard title={MSDS_SUMMARY_TEXT.fail} />;
  return <MsdsSummary summary={result.summary} />;
}

/**
 * 화면 16 MSDS 요약 (d7 §22, 시안 16-mobile) — 로그인 /msds/[id] · 둘러보기 /demo/msds/[id] 공용.
 * ‹ "MSDS · {시약명}"(nav) → 출처 줄 → msds-summary(신호어 · 그림문자 · 항목 2·4·7·8) → msds-original-link.
 * - 공단 상세 주소가 아니면(직접 입력 다른 주소) 요약 없이 원문 보기만 (16-no-summary)
 * - 불러오는 중 = msds-summary 안 msds-skeleton (16-loading), 실패·키 없음 = ex-empty-state-card + 원문 보기 (16-fail)
 * 모바일: 원문 보기 버튼 줄은 tab-bar 바로 위 고정. 데스크톱: 가운데 한 열(드로어 배치는 데스크톱 재구성 run).
 */
export function MsdsView({ nav, name, msdsUrl, backHref }: Props) {
  const chemId = koshaChemIdFromUrl(msdsUrl);
  const title = msdsTitle(name);
  return (
    <div className={styles.page}>
      {nav}
      <div className={styles.column}>
        {/* 데스크톱 page-header (모바일은 nav-pill 이 뒤로가기 + 제목) */}
        <div className={styles.pageHeader}>
          <Link href={backHref} prefetch={linkPrefetch(backHref)} className={styles.back} aria-label="뒤로">
            <Icon name="back" className={styles.backIcon} />
          </Link>
          <h1 className={styles.pageTitle}>{title}</h1>
        </div>
        {chemId ? (
          <>
            <p className={styles.source}>{MSDS_SUMMARY_TEXT.source}</p>
            <Suspense fallback={<MsdsSummary loading />}>
              <SummaryBody chemId={chemId} />
            </Suspense>
          </>
        ) : null}
        <div className={styles.actions}>
          <MsdsOriginalLink href={msdsUrl} />
        </div>
      </div>
    </div>
  );
}
