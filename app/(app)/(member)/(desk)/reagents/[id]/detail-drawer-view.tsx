"use client";

import { useState } from "react";
import { BadgeLowStock } from "@/components/badge-low-stock";
import { ButtonOutline } from "@/components/button-outline";
import { ButtonPrimary } from "@/components/button-primary";
import { DrawerActionRow } from "@/components/detail-drawer";
import { GuestLockedButton } from "@/components/guest-lock/locked-button";
import { MsdsEntry } from "@/components/msds-entry";
import { SegmentedControl, type SegmentOption } from "@/components/segmented-control";
import { StorageClassChip } from "@/components/storage-class-chip";
import { MSDS_TEXT } from "@/lib/msds-rules";
import type { ReagentDetail } from "@/lib/supabase/reagent-detail";
import { DeskDrawer, useDeskHrefs } from "../../_desk/desk-drawer";
import { DetailSummary } from "./detail-summary";
import { ReagentDeleteFlow } from "./reagent-delete-flow";
import { UsagePanel } from "./detail-tabs";
import styles from "./detail.module.css";

const TABS: SegmentOption[] = [
  { value: "info", label: "정보" },
  { value: "usage", label: "사용 기록" },
];

type Props = {
  data: Omit<ReagentDetail, "role">;
  /** 교사·admin — 위치 바꾸기 · 기준 입력 · 입고 · MSDS 찾기 (R5·R7) */
  staff: boolean;
  /** 둘러보기(/demo) — "사용 기록"은 guest-lock 버튼(누르면 ex-toast), 주소 앞머리는 DeskBaseProvider 가 /demo 로 */
  guest?: boolean;
  /** 위치 피커를 연 채로 시작 (?pick=location) */
  openPicker: boolean;
  /** MSDS QR (서버가 만든 SVG) */
  qr: React.ReactNode;
  /** MSDS 없는 시약의 "MSDS 찾기" (교사·admin) — 학생은 null */
  missingAction: React.ReactNode;
  /** 정보 줄 끝에 덧붙이는 줄 (CAS 번호 · 분류 · 칸 보관 분류) */
  extraRows: { label: string; value: string }[];
};

/**
 * 화면 3 시약 상세 — 데스크톱 오른쪽 detail-drawer (디자인 1.24 3-desktop, d7 §23 run b).
 * drawer-head(시약명 + ×) → status-chips(badge-low-stock · storage-class-chip) → segmented-control 정보/사용 기록 →
 * 정보: info-rows(현재 재고 · 입고일 · reagent-location · reorder-threshold · CAS · 분류) / 사용 기록: 최근 사용 기록 표 →
 * msds-entry(QR + "MSDS 보기" = 같은 목록 옆 MSDS 드로어) → drawer-actions("사용 기록" + "입고"(교사·admin)).
 * 위치 바꾸기 · MSDS 찾기는 드로어 왼쪽 팝오버(3-location · 3-msds). × · Esc = 목록 주소(목록 쿼리 유지).
 */
export function ReagentDetailDrawer({ data, staff, guest = false, openPicker, qr, missingAction, extraRows }: Props) {
  const { reagent, placement, threshold, picker, suggestion, usage } = data;
  const hrefs = useDeskHrefs(reagent.id);
  const [tab, setTab] = useState<"info" | "usage">("info");

  return (
    <DeskDrawer
      reagentId={reagent.id}
      title={reagent.name}
      focusKey={reagent.id}
      // d7 §24: 시약 삭제(보관) — 머리 × 왼쪽 ⋯, 교사·admin 만 (R5 · 둘러보기 숨김). 삭제 뒤 = 지금 목록 쿼리 그대로 화면 2
      headActions={staff && !guest ? <ReagentDeleteFlow reagentId={reagent.id} name={reagent.name} listHref={hrefs.list} /> : undefined}
      actions={
        <DrawerActionRow>
          {guest ? (
            <GuestLockedButton variant="primary">사용 기록</GuestLockedButton>
          ) : (
            <ButtonPrimary href={hrefs.usage}>사용 기록</ButtonPrimary>
          )}
          {/* 입고(stock-intake)는 교사·admin만 (rules.json R5) */}
          {staff ? (
            <span data-component="stock-intake" className={styles.drawerIntake}>
              <ButtonOutline href={`/intake?mode=direct&reagent=${reagent.id}`}>입고</ButtonOutline>
            </span>
          ) : null}
        </DrawerActionRow>
      }
    >
      {reagent.lowStock || reagent.storageClass ? (
        <div className={styles.statusChips} data-name="status-chips">
          {reagent.lowStock ? <BadgeLowStock /> : null}
          {reagent.storageClass ? <StorageClassChip readOnly label={reagent.storageClass} /> : null}
        </div>
      ) : null}
      <div className={styles.drawerTabs}>
        <SegmentedControl
          options={TABS}
          value={tab}
          onChange={(v) => setTab(v === "usage" ? "usage" : "info")}
          variant="indicator"
          label="시약 상세 탭"
        />
      </div>
      {tab === "info" ? (
        <div role="tabpanel" aria-label="정보">
          <DetailSummary
            layout="drawer"
            reagent={{
              id: reagent.id,
              name: reagent.name,
              stock: reagent.stock,
              unit: reagent.unit,
              lowStock: reagent.lowStock,
              intakeDate: reagent.intakeDate,
              storageClass: reagent.storageClass,
            }}
            placement={placement}
            threshold={threshold}
            picker={staff ? picker : null}
            suggestion={staff ? suggestion : null}
            initialPicking={staff && picker !== null && openPicker}
            extraRows={extraRows}
          />
        </div>
      ) : (
        <UsagePanel usage={usage} />
      )}
      <MsdsEntry
        href={reagent.msdsUrl ?? undefined}
        summaryHref={hrefs.msds}
        summaryIcon="chevron-right"
        layout="row"
        caption={reagent.msdsUrl ? "QR로 MSDS 열기" : "QR로 이 시약 정보 열기"}
        notice={MSDS_TEXT.missing}
        missingAction={missingAction}
        qr={qr}
      />
    </DeskDrawer>
  );
}
