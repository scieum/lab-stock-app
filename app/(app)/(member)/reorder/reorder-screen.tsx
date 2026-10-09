"use client";

import { useEffect, useRef, useState } from "react";
import { EmptyStateCard } from "@/components/ex-empty-state-card";
import { ManualUpload } from "@/components/manual-upload";
import { PageColumn, PageHead } from "@/components/page-frame";
import { ReorderAlertItemCard, ReorderAlertList, ReorderAlertListItem } from "@/components/reorder-alert-card";
import {
  VendorLink,
  VendorLinkModal,
  VendorNewWindowNote,
  openVendorWebsite,
  type VendorLinkOption,
} from "@/components/vendor-link";
import { VendorRegisterEntry } from "@/components/vendor-register";
import { REORDER_GUIDE_TEXT } from "@/lib/reorder-rules";
import { isOpenableUrl, vendorSearchUrl } from "@/lib/vendor-rules";
import { toggleVendorFavoriteAction } from "./actions";
import styles from "./reorder.module.css";

export type ReorderScreenAlert = {
  id: string;
  name: string;
  /** "재주문 기준 60g / 현재 재고 30g" */
  amount: string;
  /** "1반 1회 실험량 10 g × 6조 기준" 또는 "재주문 기준 60 g" */
  basis: string;
  /** 자동 기준이면 수량 줄 조각 + 캡션 (카드가 auto-threshold-badge 를 끼운다, d7 §18). 아니면 null */
  auto: { need: string; stock: string; caption: string | null } | null;
  /** "10월 7일 알림" (올해가 아니면 "2025년 10월 7일 알림", 서버가 한국 시간으로 만든 글자). 없으면 null */
  date: string | null;
};

type Props = {
  /** admin 에게만 "판매처 등록"(vendor-register) 과 판매처 0개일 때의 판매처 설정 길을 그린다 (R3) */
  isAdmin: boolean;
  /** 재고가 필요량보다 적은 시약 (부족한 정도가 큰 순) */
  alerts: ReorderScreenAlert[];
  /** 판매처 연결 목록 (우리 학교 판매처 먼저, 그다음 공통 목록). favorite = 우리 학교 즐겨찾기 */
  vendors: VendorLinkOption[];
};

/** 화면 5 실험 매뉴얼 (다음 run) */
const MANUAL_PATH = "/manual";
/** 화면 9 판매처 설정 (admin) */
const VENDORS_PATH = "/vendors";

/**
 * 화면 6 재주문 알림 (교사·admin 전용).
 * 시안 6: (데스크톱 page-head "재주문 알림" + "N건") → manual-upload(재주문 기준 안내 + "실험 매뉴얼 올리기") → 알림 카드 목록(또는 빈 상태)
 *       → (admin) vendor-register "판매처 등록". 데스크톱은 가운데 한 열(page-column 640, 사이 12, d7 §23 run c), 카드는 위아래(정보 → 동작).
 * "확인" 뒤에는 그 카드의 vendor-link 아래에 새 창 안내 줄(vendor-new-window, d7 §18)이 남는다.
 * "판매처 연결" → ex-modal-card (모바일: tab-bar 위 하단 시트 / 데스크톱: 화면 오른쪽 아래 카드, 시안 6-desktop).
 * 판매처를 고르고 "확인" → 그 판매처 웹사이트(공통 목록 4곳은 시약 이름 검색 결과 주소)를 새 창으로 연다. 아무것도 저장하지 않는다 (서버 요청 없음).
 * 카드는 비모달이다 — 뒤 목록을 계속 조작할 수 있다. 닫기: Esc · "취소" · 같은 카드의 "판매처 연결" 다시 누르기.
 */
export function ReorderScreen({ isAdmin, alerts, vendors: initialVendors }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  /** 즐겨찾기를 누르면 바로 바꿔 보여 준다(저장 실패 시 되돌림). 서버가 새 목록을 내려 주면 그것으로 맞춘다 */
  const [vendors, setVendors] = useState(initialVendors);
  const [seen, setSeen] = useState(initialVendors);
  if (seen !== initialVendors) {
    setSeen(initialVendors);
    setVendors(initialVendors);
  }
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  /** 판매처마다 마지막 요청 번호 — 늦게 온 이전 응답이 새 상태를 되돌리지 않게 */
  const favoriteSeq = useRef(new Map<string, number>());
  /** 방금 새 창으로 연 판매처 — 그 알림 카드 안에 새 창이 막혔을 때 직접 누를 수 있는 안내 줄을 남긴다 (시안 6 vendor-new-window) */
  const [opened, setOpened] = useState<{ alertId: string; name: string; url: string } | null>(null);

  const pageRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  /** 카드를 연 "판매처 연결" 버튼 — 닫으면 포커스를 돌려준다 */
  const opener = useRef<HTMLElement | null>(null);

  // 알림이 목록에서 사라졌으면(재고가 채워짐) 카드도 닫힌 것으로 본다
  const open = alerts.find((a) => a.id === openId) ?? null;
  const openKey = open?.id ?? null;

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
    setFavoriteError(null);
    setOpenId(id);
  };

  const setFavorite = (id: string, favorite: boolean) =>
    setVendors((list) => list.map((v) => (v.id === id ? { ...v, favorite } : v)));

  // 별표: 바로 바꿔 보이고 저장(서버 액션). 실패하면 되돌리고 모달 안에 안내 (d7 §12-1)
  const toggleFavorite = (id: string, next: boolean) => {
    const seq = (favoriteSeq.current.get(id) ?? 0) + 1;
    favoriteSeq.current.set(id, seq);
    setFavoriteError(null);
    setFavorite(id, next);
    toggleVendorFavoriteAction({ vendorId: id, favorite: next })
      .then((res) => {
        if (favoriteSeq.current.get(id) !== seq || res.ok) return;
        setFavorite(id, !next);
        setFavoriteError(res.error);
      })
      .catch(() => {
        if (favoriteSeq.current.get(id) !== seq) return;
        setFavorite(id, !next);
        setFavoriteError("즐겨찾기를 저장하지 못했어요. 잠시 후 다시 시도해 주세요");
      });
  };

  const confirm = (vendor: VendorLinkOption) => {
    // 검색 주소가 있는 판매처(공통 목록 4곳)는 그 카드의 시약 이름으로 검색한 결과 주소, 아니면 웹사이트 (d7 §11)
    const url = vendorSearchUrl(vendor, open?.name);
    // 새 창은 noopener 로 연다 — 그래서 열렸는지(팝업 차단)를 알 수 없다. 직접 누를 수 있는 링크를 같이 남긴다
    if (open && openVendorWebsite(url) && isOpenableUrl(url)) {
      setOpened({ alertId: open.id, name: vendor.name, url });
    }
    close();
  };

  return (
    <div ref={pageRef} className={styles.page}>
      <PageHead title="재주문 알림" count={`${alerts.length}건`} />

      <PageColumn gap="tight">
        <div className={styles.layout} data-name="reorder-layout">
          <div className={styles.guide}>
            <ManualUpload href={MANUAL_PATH} description={REORDER_GUIDE_TEXT} />
          </div>

          <div className={styles.alerts}>
            {alerts.length === 0 ? (
              <EmptyStateCard title="재고가 부족한 시약이 없어요" />
            ) : (
              <ReorderAlertList>
                {alerts.map((a) => (
                  <ReorderAlertListItem key={a.id}>
                    <ReorderAlertItemCard
                      name={a.name}
                      amount={a.amount}
                      basis={a.basis}
                      auto={a.auto ?? undefined}
                      date={a.date}
                    >
                      <VendorLink expanded={openKey === a.id} onClick={(e) => toggle(a.id, e.currentTarget)} />
                      {opened && opened.alertId === a.id && openKey !== a.id ? (
                        <VendorNewWindowNote vendorName={opened.name} url={opened.url} />
                      ) : null}
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
      </PageColumn>

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
            onToggleFavorite={toggleFavorite}
            favoriteError={favoriteError}
          />
        ) : null}
      </div>

    </div>
  );
}
