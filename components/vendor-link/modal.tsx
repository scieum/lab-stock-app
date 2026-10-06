"use client";

import { useId, useState } from "react";
import { ButtonOutline } from "@/components/button-outline";
import { ButtonPillSoft } from "@/components/button-pill-soft";
import { ButtonPrimary } from "@/components/button-primary";
import { ModalCard } from "@/components/ex-modal-card";
import { Icon } from "@/components/icons";
import { isOpenableUrl, isOpenableWebsite, vendorInfo, visibleVendors } from "@/lib/vendor-rules";
import { VendorFavoriteToggle } from "./favorite-toggle";
import styles from "./styles.module.css";

/** 판매처 연결 목록의 한 줄 (우리 학교 판매처 먼저, 그다음 공통 목록 — 순서는 넘기는 쪽이 정한다) */
export type VendorLinkOption = {
  id: string;
  name: string;
  contact?: string | null;
  website?: string | null;
  /** 검색 주소 틀 (vendors.search_url) — "확인" 때 화면 쪽이 vendorSearchUrl 로 시약 이름 검색 주소를 만든다 */
  searchUrl?: string | null;
  note?: string | null;
  /** 우리 학교 즐겨찾기 (d7 §12-1) */
  favorite?: boolean;
};

/**
 * 판매처 주소(웹사이트 또는 vendorSearchUrl 로 만든 검색 결과 주소)를 새 창으로 연다 (d7 §11 — 아무것도 저장하지 않는다).
 * http(s) 주소가 아니면 열지 않고 false. 검색 주소는 인코딩한 시약 이름 때문에 300자를 넘을 수 있어 길이는 보지 않는다
 * (웹사이트 300자 제한은 테이블 제약이 지킨다).
 */
export function openVendorWebsite(url: string | null | undefined): boolean {
  if (!isOpenableUrl(url)) return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

type OptionsProps = {
  vendors: VendorLinkOption[];
  value: string | null;
  onChange?: (id: string) => void;
  /** 묶음 이름이 되는 요소 id ("판매처 · {시약명}") */
  labelledBy?: string;
  /** 묶음을 설명하는 요소 id (웹사이트 없음 안내) */
  describedBy?: string;
  /** 있으면 행마다 즐겨찾기 별표(vendor-favorite-toggle)를 그린다 (d7 §12-1 — 교사·admin) */
  onToggleFavorite?: (id: string, next: boolean) => void;
};

/**
 * 판매처 행 radiogroup (시안 vendor-option): 왼쪽 선택 표시 + 판매처명 + 오른쪽 부가 정보.
 * 선택 행 = 연하늘 바탕 + 하늘색 테두리 + 하늘색 체크 원.
 */
export function VendorOptions({ vendors, value, onChange, labelledBy, describedBy, onToggleFavorite }: OptionsProps) {
  const name = useId();
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} aria-describedby={describedBy} className={styles.options}>
      {vendors.map((v) => {
        const checked = v.id === value;
        const info = vendorInfo(v);
        const option = (
          <label
            key={onToggleFavorite ? undefined : v.id}
            className={[styles.option, checked ? styles.optionSelected : ""].filter(Boolean).join(" ")}
          >
            <input
              type="radio"
              className={styles.optionInput}
              name={name}
              value={v.id}
              checked={checked}
              onChange={() => onChange?.(v.id)}
            />
            {checked ? (
              <span className={styles.selectedMark} aria-hidden="true">
                <Icon name="check" className={styles.selectedCheck} />
              </span>
            ) : (
              <span className={styles.radio} aria-hidden="true" />
            )}
            <span className={styles.optionName}>{v.name}</span>
            {info ? <span className={styles.optionMeta}>{info}</span> : null}
          </label>
        );
        if (!onToggleFavorite) return option;
        // 별표는 라벨 밖(형제)에 둔다 — 누르면 즐겨찾기만 바뀌고 행 선택은 그대로
        return (
          <div key={v.id} className={styles.optionRow}>
            {option}
            <VendorFavoriteToggle name={v.name} favorite={v.favorite === true} onToggle={(next) => onToggleFavorite(v.id, next)} />
          </div>
        );
      })}
    </div>
  );
}

type ModalProps = {
  /** 알림 카드의 시약명 — 목록 위 "판매처 · {시약명}" */
  reagentName: string;
  vendors: VendorLinkOption[];
  /** 처음 고른 판매처 (없으면 첫 줄) */
  defaultSelectedId?: string | null;
  /** 판매처가 0개일 때 admin 에게 보여 줄 판매처 설정(화면 9) 경로. 교사에게는 넘기지 않는다 */
  registerHref?: string;
  /** "취소" */
  onCancel?: () => void;
  /** "확인" — 웹사이트가 있는 판매처를 골랐을 때만 불린다. 화면 쪽이 openVendorWebsite 로 새 창을 열고 닫는다 */
  onConfirm?: (vendor: VendorLinkOption) => void;
  /** Esc (없으면 onCancel) */
  onClose?: () => void;
  /** true(기본) = 모바일에서 tab-bar 위에 붙는 하단 시트. false = 제자리(갤러리) */
  sheet?: boolean;
  modal?: boolean;
  /** 있으면 행마다 즐겨찾기 별표 — 화면 쪽이 바로 저장하고 vendors 의 favorite 를 바꿔 다시 넘긴다 (d7 §12-1) */
  onToggleFavorite?: (id: string, next: boolean) => void;
  /** 처음부터 전체를 펼쳐 둔다 (갤러리) */
  defaultShowAll?: boolean;
  /** 즐겨찾기 저장 실패 안내 (화면 쪽이 되돌린 뒤 넘긴다) */
  favoriteError?: string | null;
};

/**
 * 판매처 연결 모달 (화면 6, ex-modal-card): 제목 "판매처 연결" → "판매처 · {시약명}" → 판매처 행 → "취소" · "확인".
 * 웹사이트가 없는 판매처를 고르면 "확인" 비활성 + 연락처 안내. 판매처가 하나도 없으면 안내 문구.
 */
export function VendorLinkModal({
  reagentName,
  vendors,
  defaultSelectedId,
  registerHref,
  onCancel,
  onConfirm,
  onClose,
  sheet,
  modal,
  onToggleFavorite,
  defaultShowAll = false,
  favoriteError = null,
}: ModalProps) {
  const [picked, setPicked] = useState<string | null>(defaultSelectedId ?? null);
  /**
   * 보이는 행(id 순서) — 모달을 열 때 정한다 (d7 §12-1): 즐겨찾기가 1곳 이상이면 즐겨찾기만, 없으면 전체.
   * 열린 동안 별표를 누르거나 풀어도 행 목록·순서·선택은 그대로(별표 모양만 바뀐다). 다음에 열 때 새 즐겨찾기 기준.
   * "모든 판매처 보기" 를 누르면 그때의 즐겨찾기 먼저 + 기존 순서로 전체를 펼친다.
   */
  const [rowIds, setRowIds] = useState<string[]>(() => visibleVendors(vendors, defaultShowAll).map((v) => v.id));
  const [expanded, setExpanded] = useState(defaultShowAll);
  const labelId = useId();
  const hintId = useId();

  const byId = new Map(vendors.map((v) => [v.id, v]));
  // 지금 값(별표 상태)은 vendors 에서, 행 목록·순서는 열 때 정한 것으로. 목록에서 사라진(삭제된) 판매처만 빠진다
  const shown = rowIds.flatMap((id) => {
    const v = byId.get(id);
    return v ? [v] : [];
  });
  const canShowAll = !expanded && shown.length < vendors.length;
  const showAll = () => {
    // 펼쳐도 지금 고른 행은 그대로 (아직 안 골랐으면 지금 보이는 첫 줄을 고른 것으로 남긴다)
    if (selected) setPicked(selected.id);
    setExpanded(true);
    setRowIds(visibleVendors(vendors, true).map((v) => v.id));
  };
  // 고른 판매처가 보이는 목록에서 사라졌으면(또는 아직 안 골랐으면) 첫 줄
  const selected = shown.find((v) => v.id === picked) ?? shown[0] ?? null;
  const canOpen = selected !== null && isOpenableWebsite(selected.website);
  const contact = selected?.contact?.trim() ?? "";
  const hint =
    selected !== null && !canOpen
      ? contact
        ? `웹사이트가 없는 판매처예요. 연락처 ${contact} 로 문의하세요`
        : "웹사이트가 없는 판매처예요"
      : null;

  return (
    <ModalCard title="판매처 연결" hideClose density="tight" onClose={onClose ?? onCancel} sheet={sheet} modal={modal}>
      <form
        className={styles.body}
        onSubmit={(e) => {
          e.preventDefault();
          if (selected && canOpen) onConfirm?.(selected);
        }}
      >
        <div className={styles.vendorList}>
          <p id={labelId} className={styles.fieldLabel}>
            판매처 · {reagentName}
          </p>
          {shown.length > 0 ? (
            <VendorOptions
              vendors={shown}
              value={selected?.id ?? null}
              onChange={setPicked}
              labelledBy={labelId}
              describedBy={hint ? hintId : undefined}
              onToggleFavorite={onToggleFavorite}
            />
          ) : (
            <div className={styles.none}>
              <p className={styles.noneText}>
                {registerHref
                  ? "연결할 판매처가 없어요. 판매처를 먼저 등록하세요"
                  : "연결할 판매처가 없어요. admin 에게 판매처 등록을 요청하세요"}
              </p>
              {registerHref ? (
                <ButtonPillSoft tone="white" href={registerHref} icon="chevron-right">
                  판매처 설정
                </ButtonPillSoft>
              ) : null}
            </div>
          )}
          {canShowAll ? (
            <button
              type="button"
              data-testid="vendor-show-all"
              className={styles.showAll}
              aria-expanded={false}
              onClick={showAll}
            >
              모든 판매처 보기
            </button>
          ) : null}
          {favoriteError ? (
            <p className={styles.hint} role="alert" data-testid="vendor-favorite-error">
              {favoriteError}
            </p>
          ) : null}
          <p id={hintId} className={styles.hint} role="status">
            {hint ?? ""}
          </p>
        </div>
        <div className={styles.actions}>
          <ButtonOutline onClick={onCancel}>취소</ButtonOutline>
          <ButtonPrimary type="submit" className={styles.confirm} disabled={!canOpen}>
            확인
          </ButtonPrimary>
        </div>
      </form>
    </ModalCard>
  );
}
