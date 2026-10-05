"use client";

import { useEffect, useRef, useState } from "react";
import { EmptyStateCard } from "@/components/ex-empty-state-card";
import { Icon } from "@/components/icons";
import { ManualUpload } from "@/components/manual-upload";
import { ReorderAlertItemCard, ReorderAlertList, ReorderAlertListItem } from "@/components/reorder-alert-card";
import { VendorLink, VendorLinkModal, openVendorWebsite, type VendorLinkOption } from "@/components/vendor-link";
import { VendorRegisterEntry } from "@/components/vendor-register";
import { isOpenableWebsite } from "@/lib/vendor-rules";
import styles from "./reorder.module.css";

export type ReorderScreenAlert = {
  id: string;
  name: string;
  /** "필요량 60 g / 현재 재고 30 g" */
  amount: string;
  /** "1반 1회 실험량 10 g × 6조 기준" 또는 "재주문 기준 60 g" */
  basis: string;
  /** "2026.09.30 알림" (서버가 한국 시간으로 만든 글자). 없으면 null */
  date: string | null;
};

type Props = {
  /** admin 에게만 "판매처 등록"(vendor-register) 과 판매처 0개일 때의 판매처 설정 길을 그린다 (R3) */
  isAdmin: boolean;
  /** 재고가 필요량보다 적은 시약 (부족한 정도가 큰 순) */
  alerts: ReorderScreenAlert[];
  /** 판매처 연결 목록 (우리 학교 판매처 먼저, 그다음 공통 목록) */
  vendors: VendorLinkOption[];
};

/** 화면 5 실험 매뉴얼 (다음 run) */
const MANUAL_PATH = "/manual";
/** 화면 9 판매처 설정 (admin) */
const VENDORS_PATH = "/vendors";
/** 새 창 안내를 보여 주는 시간 */
const NOTICE_MS = 12000;

/**
 * 화면 6 재주문 알림 (교사·admin 전용).
 * 시안: (데스크톱 screen-title) → manual-upload(재주문 기준 안내 + "실험 매뉴얼 올리기") → 알림 카드 목록(또는 빈 상태)
 *       → (admin) vendor-register "판매처 등록". 데스크톱은 안내·등록 열(400) + 알림 열 2칸.
 * "판매처 연결" → ex-modal-card (모바일: tab-bar 위 하단 시트 / 데스크톱: 화면 오른쪽 아래 카드, 시안 6-desktop).
 * 판매처를 고르고 "확인" → 그 판매처 웹사이트를 새 창으로 연다. 아무것도 저장하지 않는다 (서버 요청 없음).
 * 카드는 비모달이다 — 뒤 목록을 계속 조작할 수 있다. 닫기: Esc · "취소" · 같은 카드의 "판매처 연결" 다시 누르기.
 */
export function ReorderScreen({ isAdmin, alerts, vendors }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  /** 방금 새 창으로 연 판매처 — 새 창이 막혔을 때 직접 누를 수 있는 링크를 남긴다 */
  const [opened, setOpened] = useState<{ name: string; website: string } | null>(null);

  const pageRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  /** 카드를 연 "판매처 연결" 버튼 — 닫으면 포커스를 돌려준다 */
  const opener = useRef<HTMLElement | null>(null);

  // 알림이 목록에서 사라졌으면(재고가 채워짐) 카드도 닫힌 것으로 본다
  const open = alerts.find((a) => a.id === openId) ?? null;
  const openKey = open?.id ?? null;

  useEffect(() => {
    if (!opened) return;
    const t = setTimeout(() => setOpened(null), NOTICE_MS);
    return () => clearTimeout(t);
  }, [opened]);

  // 모바일(하단 시트): 시트 높이만큼 본문 아래를 비워 마지막 카드까지 시트 위로 올릴 수 있게 하고,
  // 누른 카드의 버튼이 시트에 가려졌으면 시트 위로 올린다. 데스크톱(오른쪽 아래 카드)에서는 자리만 비운다.
  useEffect(() => {
    const page = pageRef.current;
    const card = dockRef.current?.firstElementChild;
    if (!page || !openKey || !(card instanceof HTMLElement)) return;
    const apply = () => page.style.setProperty("--reorder-sheet-space", `${Math.ceil(card.getBoundingClientRect().height)}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(card);
    window.addEventListener("resize", apply);
    const from = opener.current;
    if (getComputedStyle(card).position === "fixed" && from && from.isConnected) {
      const hidden = from.getBoundingClientRect().bottom - card.getBoundingClientRect().top;
      if (hidden > 0) window.scrollBy({ top: hidden + from.offsetHeight / 4 });
    }
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
      page.style.removeProperty("--reorder-sheet-space");
    };
  }, [openKey]);

  const close = () => {
    const el = opener.current;
    if (el && el.isConnected) el.focus({ preventScroll: true });
    setOpenId(null);
  };

  const toggle = (id: string, button: HTMLElement) => {
    if (openKey === id) {
      close();
      return;
    }
    opener.current = button;
    setOpened(null);
    setOpenId(id);
  };

  const confirm = (vendor: VendorLinkOption) => {
    // 새 창은 noopener 로 연다 — 그래서 열렸는지(팝업 차단)를 알 수 없다. 직접 누를 수 있는 링크를 같이 남긴다
    if (openVendorWebsite(vendor.website) && isOpenableWebsite(vendor.website)) {
      setOpened({ name: vendor.name, website: vendor.website });
    }
    close();
  };

  return (
    <div ref={pageRef} className={styles.page}>
      <h1 className={styles.title}>재주문 알림</h1>

      <div className={styles.layout} data-name="reorder-layout">
        <div className={styles.guide}>
          <ManualUpload href={MANUAL_PATH} />
        </div>

        <div className={styles.alerts}>
          {alerts.length === 0 ? (
            <EmptyStateCard title="재고가 부족한 시약이 없어요" />
          ) : (
            <ReorderAlertList>
              {alerts.map((a) => (
                <ReorderAlertListItem key={a.id}>
                  <ReorderAlertItemCard name={a.name} amount={a.amount} basis={a.basis} date={a.date}>
                    <VendorLink expanded={openKey === a.id} onClick={(e) => toggle(a.id, e.currentTarget)} />
                  </ReorderAlertItemCard>
                </ReorderAlertListItem>
              ))}
            </ReorderAlertList>
          )}
        </div>

        {isAdmin ? (
          <div className={styles.register}>
            <VendorRegisterEntry href={VENDORS_PATH} />
          </div>
        ) : null}
      </div>

      <div ref={dockRef} className={styles.dock}>
        {open ? (
          <VendorLinkModal
            key={open.id}
            modal={false}
            reagentName={open.name}
            vendors={vendors}
            registerHref={isAdmin ? VENDORS_PATH : undefined}
            onCancel={close}
            onConfirm={confirm}
          />
        ) : null}
      </div>

      {opened && !open ? (
        <div className={styles.notice} role="status">
          <p className={styles.noticeText}>
            {opened.name} 사이트를 새 창으로 열었어요. 열리지 않았다면{" "}
            <a className={styles.noticeLink} href={opened.website} target="_blank" rel="noopener noreferrer">
              직접 열기
            </a>
          </p>
          <button type="button" className={styles.noticeClose} aria-label="안내 닫기" onClick={() => setOpened(null)}>
            <Icon name="close" className={styles.noticeCloseIcon} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
