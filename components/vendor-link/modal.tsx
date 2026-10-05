"use client";

import { useId, useState } from "react";
import { ButtonOutline } from "@/components/button-outline";
import { ButtonPillSoft } from "@/components/button-pill-soft";
import { ButtonPrimary } from "@/components/button-primary";
import { ModalCard } from "@/components/ex-modal-card";
import { Icon } from "@/components/icons";
import { isOpenableWebsite, vendorInfo } from "@/lib/vendor-rules";
import styles from "./styles.module.css";

/** 판매처 연결 목록의 한 줄 (우리 학교 판매처 먼저, 그다음 공통 목록 — 순서는 넘기는 쪽이 정한다) */
export type VendorLinkOption = {
  id: string;
  name: string;
  contact?: string | null;
  website?: string | null;
  note?: string | null;
};

/**
 * 판매처 웹사이트를 새 창으로 연다 (d7 §11 — 아무것도 저장하지 않는다).
 * http(s) 주소가 아니면 열지 않고 false.
 */
export function openVendorWebsite(website: string | null | undefined): boolean {
  if (!isOpenableWebsite(website)) return false;
  window.open(website, "_blank", "noopener,noreferrer");
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
};

/**
 * 판매처 행 radiogroup (시안 vendor-option): 왼쪽 선택 표시 + 판매처명 + 오른쪽 부가 정보.
 * 선택 행 = 연하늘 바탕 + 하늘색 테두리 + 하늘색 체크 원.
 */
export function VendorOptions({ vendors, value, onChange, labelledBy, describedBy }: OptionsProps) {
  const name = useId();
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} aria-describedby={describedBy} className={styles.options}>
      {vendors.map((v) => {
        const checked = v.id === value;
        const info = vendorInfo(v);
        return (
          <label key={v.id} className={[styles.option, checked ? styles.optionSelected : ""].filter(Boolean).join(" ")}>
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
}: ModalProps) {
  const [picked, setPicked] = useState<string | null>(defaultSelectedId ?? null);
  const labelId = useId();
  const hintId = useId();

  // 고른 판매처가 목록에서 사라졌으면(또는 아직 안 골랐으면) 첫 줄
  const selected = vendors.find((v) => v.id === picked) ?? vendors[0] ?? null;
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
          {vendors.length > 0 ? (
            <VendorOptions
              vendors={vendors}
              value={selected?.id ?? null}
              onChange={setPicked}
              labelledBy={labelId}
              describedBy={hint ? hintId : undefined}
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
