import { Suspense } from "react";
import { EmptyStateCard } from "@/components/ex-empty-state-card";
import { MsdsOriginalLink } from "@/components/msds-original-link";
import { MsdsSummary } from "@/components/msds-summary";
import { koshaChemIdFromUrl, MSDS_SUMMARY_TEXT, msdsTitle, type MsdsFrom } from "@/lib/msds-summary";
import { getMsdsSummary } from "@/lib/server/kosha-msds-detail";
import { DeskDrawer } from "../../_desk/desk-drawer";
import { MsdsAnchors } from "./msds-anchors";

const SECTION_PREFIX = "msds-drawer";

/** 공단 요약 (느린 외부 호출 — Suspense 안). 성공하면 항목 바로가기 + msds-summary, 실패면 ex-empty-state-card (16-fail) */
async function DeskSummaryBody({ chemId }: { chemId: string }) {
  const result = await getMsdsSummary(chemId);
  if (!result.ok) return <EmptyStateCard title={MSDS_SUMMARY_TEXT.fail} />;
  return (
    <>
      <MsdsAnchors prefix={SECTION_PREFIX} />
      <MsdsSummary summary={result.summary} sectionIdPrefix={SECTION_PREFIX} />
    </>
  );
}

type Props = {
  reagentId: string;
  name: string;
  msdsUrl: string;
  from: MsdsFrom;
};

/**
 * 화면 16 MSDS 요약 — 데스크톱 (디자인 1.24 16-desktop, d7 §23 run b): 시약 목록 옆 오른쪽 detail-drawer.
 * drawer-nav("‹ 시약 상세" — 기록에서 왔으면 "‹ 기록" + ×) → drawer-title("MSDS · 시약명" + 출처 줄) →
 * section-anchors → msds-summary(신호어 · 그림문자 · 항목 2·4·7·8) → drawer-actions(msds-original-link).
 * 16-loading = msds-summary 안 msds-skeleton, 16-fail = ex-empty-state-card, 16-no-summary(공단 주소 아님) = 출처 줄 없이 원문 보기만(본문 안).
 */
export function MsdsDesk({ reagentId, name, msdsUrl, from }: Props) {
  const chemId = koshaChemIdFromUrl(msdsUrl);
  return (
    <DeskDrawer
      reagentId={reagentId}
      title={msdsTitle(name)}
      caption={chemId ? MSDS_SUMMARY_TEXT.source : undefined}
      back={from === "usage" ? { href: "/usage", label: "기록" } : "detail"}
      focusKey={reagentId}
      actions={chemId ? <MsdsOriginalLink href={msdsUrl} /> : undefined}
    >
      {chemId ? (
        <Suspense fallback={<MsdsSummary loading />}>
          <DeskSummaryBody chemId={chemId} />
        </Suspense>
      ) : (
        <MsdsOriginalLink href={msdsUrl} />
      )}
    </DeskDrawer>
  );
}
