"use client";

import { useState } from "react";
import { EmptyStateCard } from "@/components/ex-empty-state-card";
import { ManualUpload } from "@/components/manual-upload";
import { REORDER_GUIDE_TEXT } from "@/lib/reorder-rules";
import { ReorderAlertItemCard, ReorderAlertList, ReorderAlertListItem } from "@/components/reorder-alert-card";
import { VendorLink, VendorLinkModal, VendorNewWindowNote, type VendorLinkOption } from "@/components/vendor-link";
import { VendorRegisterEntry } from "@/components/vendor-register";
import local from "./reorder.module.css";
import type { SampleAlert } from "./sample";

type Props = {
  /** admin 에게만 "판매처 등록"(vendor-register) 이 보인다 */
  role: "teacher" | "admin";
  alerts: SampleAlert[];
  vendors: VendorLinkOption[];
  /** 판매처 연결 모달을 처음부터 열어 둘 알림 */
  defaultOpenId?: string | null;
  /** 처음부터 새 창 안내 줄을 보여 줄 알림 (시안 1.17 6: 염산 카드) */
  defaultOpened?: { alertId: string; name: string; url: string } | null;
};

/** 화면 6 예시: 안내 박스 → 알림 목록(또는 빈 상태) → "판매처 등록"(admin) → 판매처 연결 모달(제자리) */
export function ReorderDemo({ role, alerts, vendors, defaultOpenId = null, defaultOpened = null }: Props) {
  const [openId, setOpenId] = useState<string | null>(defaultOpenId);
  const [opened, setOpened] = useState<{ alertId: string; name: string; url: string } | null>(defaultOpened);
  const open = alerts.find((a) => a.id === openId) ?? null;

  return (
    <div className={local.screen}>
      <div className={local.layout}>
        <ManualUpload href="/manual" description={REORDER_GUIDE_TEXT} />
        <div className={local.alertColumn}>
          {alerts.length === 0 ? (
            <EmptyStateCard title="재고가 부족한 시약이 없어요" />
          ) : (
            <ReorderAlertList>
              {alerts.map((a) => (
                <ReorderAlertListItem key={a.id}>
                  <ReorderAlertItemCard name={a.name} amount={a.amount} basis={a.basis} auto={a.auto} date={a.date}>
                    <VendorLink
                      expanded={openId === a.id}
                      onClick={() => {
                        setOpened(null);
                        setOpenId(a.id);
                      }}
                    />
                    {opened && opened.alertId === a.id && openId !== a.id ? (
                      <VendorNewWindowNote vendorName={opened.name} url={opened.url} />
                    ) : null}
                  </ReorderAlertItemCard>
                </ReorderAlertListItem>
              ))}
            </ReorderAlertList>
          )}
        </div>
        {role === "admin" ? <VendorRegisterEntry href="/vendors" /> : null}
      </div>
      {open ? (
        <VendorLinkModal
          key={open.id}
          sheet={false}
          reagentName={open.name}
          vendors={vendors}
          registerHref={role === "admin" ? "/vendors" : undefined}
          onCancel={() => setOpenId(null)}
          onConfirm={(v) => {
            // 갤러리에서는 새 창을 열지 않고 그 카드에 안내 줄만 남긴다
            setOpened({ alertId: open.id, name: v.name, url: v.website ?? "" });
            setOpenId(null);
          }}
        />
      ) : null}
    </div>
  );
}
