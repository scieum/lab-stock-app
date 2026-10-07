"use client";

import { useId, useState } from "react";
import { ButtonOutline } from "@/components/button-outline";
import { ButtonPrimary } from "@/components/button-primary";
import { EmptyStateCard } from "@/components/ex-empty-state-card";
import { VendorFavoriteToggle } from "@/components/vendor-link/favorite-toggle";
import { vendorContactInfo, type VendorField, type VendorValue } from "@/lib/vendor-rules";
import { VendorForm, type VendorFormValues } from "./form";
import { VendorRowMenu } from "./row-menu";
import styles from "./styles.module.css";

export { VendorForm } from "./form";
export type { VendorFormValues } from "./form";
export { VendorRowMenu } from "./row-menu";
export { VendorCommonList, VendorDeleteConfirm } from "./sheets";
export type { VendorCommonItem } from "./sheets";

type EntryProps = {
  /** 판매처 설정(화면 9) 경로 */
  href: string;
  children?: React.ReactNode;
};

/**
 * 화면 6 의 "판매처 등록" 진입 (시안 6: vendor-register 가 전폭 button-outline 1개를 감싼다).
 * admin 에게만 그린다 (R3) — 교사 화면에는 넘기지 않는다.
 */
export function VendorRegisterEntry({ href, children = "판매처 등록" }: EntryProps) {
  return (
    <div data-component="vendor-register" data-variant="entry" className={styles.entry}>
      <ButtonOutline href={href} className={styles.entryButton}>
        {children}
      </ButtonOutline>
    </div>
  );
}

export type VendorRegisterVendor = {
  id: string;
  name: string;
  contact?: string | null;
  website?: string | null;
  note?: string | null;
  /** 우리 학교 즐겨찾기 (d7 §12-1) */
  favorite?: boolean;
};

/** 열려 있는 폼: 등록 또는 어떤 판매처의 수정 */
export type VendorFormState =
  | { mode: "create"; /** 처음 입력값 (갤러리 — 시안 1.17 9 "과학나라" 입력 중) */ draft?: VendorFormValues }
  | { mode: "edit"; vendor: VendorRegisterVendor };

type Props = {
  /** 보여 줄 우리 학교 판매처 (검색은 화면 쪽이 lib/vendor-rules filterVendors 로 거른 뒤 넘긴다) */
  vendors: VendorRegisterVendor[];
  /** true = 검색어가 있어서 0건 → "찾는 판매처가 없어요". false(기본) 0건 → "등록한 판매처가 없어요" */
  searching?: boolean;
  /** 방금 등록·수정한 행 (연하늘 강조) */
  highlightId?: string | null;
  /**
   * 열려 있는 폼. null = 닫힘 (목록만 — 폼은 DOM 에 없다).
   * 넘기지 않으면 컴포넌트가 스스로 관리한다 (defaultForm 에서 시작).
   */
  form?: VendorFormState | null;
  defaultForm?: VendorFormState | null;
  /** "판매처 등록" · 더보기 "수정" · 폼 닫기(×) 로 폼 상태가 바뀔 때 */
  onFormChange?: (next: VendorFormState | null) => void;
  /** 폼 "저장" — editingId 가 null 이면 새 판매처. note 는 없다(부가 정보 칸 없음, d7 §18) */
  onSubmit?: (value: Omit<VendorValue, "note">, editingId: string | null) => void;
  /** 더보기 "삭제" — 화면 쪽이 VendorDeleteConfirm 을 띄운다 */
  onDelete?: (vendor: VendorRegisterVendor) => void;
  /** 있으면 행마다 즐겨찾기 별표(vendor-favorite-toggle) — 화면 쪽이 바로 저장한다 (d7 §12-1) */
  onToggleFavorite?: (vendor: VendorRegisterVendor, next: boolean) => void;
  /** 저장 중 */
  pending?: boolean;
  /** 저장 실패 안내 (서버 문구) */
  error?: string | null;
  /** 서버가 알려 준 문제 칸 — 있으면 error 를 폼의 그 입력 아래에 보여 준다 */
  errorField?: VendorField | null;
  /** 바꾸면 열려 있는 폼의 입력을 처음 값으로 되돌린다 (같은 폼을 연 채로 다시 시작할 때) */
  resetKey?: string | number;
  /** 더보기 메뉴를 처음부터 펼쳐 둘 행 (갤러리) */
  defaultMenuOpenId?: string | null;
  /** true(기본) = 모바일에서 "판매처 등록"·"저장" 을 tab-bar 바로 위에 고정. false = 항상 제자리(갤러리) */
  sticky?: boolean;
};

/**
 * "우리 학교 판매처" 블록 (화면 9, admin 전용 — R3).
 * 목록(행 = 판매처명 + 연락처 + 더보기 "수정"·"삭제") + "판매처 등록" + 등록·수정 폼.
 * 폼은 열렸을 때만 그린다 (시안 1.17 9): 모바일은 tab-bar 위 하단 시트, 데스크탑은 목록 위 가운데 카드(폭 480). 목록은 뒤에 그대로.
 * 삭제 확인(VendorDeleteConfirm)·토스트·검색·탭은 화면 쪽이 이 블록 밖에 둔다.
 */
export function VendorRegister({
  vendors,
  searching = false,
  highlightId = null,
  form,
  defaultForm = null,
  onFormChange,
  onSubmit,
  onDelete,
  onToggleFavorite,
  pending = false,
  error,
  errorField,
  resetKey,
  defaultMenuOpenId = null,
  sticky = true,
}: Props) {
  const [inner, setInner] = useState<VendorFormState | null>(defaultForm);
  // 사용자가 연 폼만 판매처명 입력으로 포커스를 옮긴다 (처음부터 열린 예시는 그대로 둔다)
  const [opened, setOpened] = useState(false);
  const current = form !== undefined ? form : inner;
  const headingId = useId();

  const change = (next: VendorFormState | null) => {
    setOpened(next !== null);
    if (form === undefined) setInner(next);
    onFormChange?.(next);
  };

  const editing = current?.mode === "edit" ? current.vendor : null;
  const formKey = `${editing ? `edit-${editing.id}` : "create"}-${resetKey ?? ""}`;

  return (
    <section
      data-component="vendor-register"
      className={[styles.root, sticky ? styles.sticky : "", current ? styles.formOpen : ""].filter(Boolean).join(" ")}
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className={styles.srOnly}>
        우리 학교 판매처
      </h2>
      <div className={styles.listColumn}>
        {vendors.length === 0 ? (
          searching ? (
            <EmptyStateCard title="찾는 판매처가 없어요" />
          ) : (
            <EmptyStateCard
              title="등록한 판매처가 없어요"
              description="자주 주문하는 판매처를 등록해 두세요"
            >
              {/* 화면 9 의 버튼은 button-primary·button-outline 뿐이다 (dev-rules components) — 카드 기본 pill 버튼을 쓰지 않는다 */}
              <ButtonOutline onClick={() => change({ mode: "create" })}>판매처 등록</ButtonOutline>
            </EmptyStateCard>
          )
        ) : (
          <ul className={styles.list} aria-labelledby={headingId}>
            {vendors.map((v) => {
              // 우리 학교 행의 부가 정보 = 연락처만 (d7 §18 — note 는 보여 주지 않는다)
              const info = vendorContactInfo(v);
              const fresh = v.id === highlightId;
              return (
                <li
                  key={v.id}
                  className={[styles.row, fresh ? styles.rowFresh : ""].filter(Boolean).join(" ")}
                  data-highlighted={fresh ? "true" : undefined}
                >
                  <div className={styles.rowBody}>
                    <span className={styles.rowName}>{v.name}</span>
                    {info ? <span className={styles.rowInfo}>{info}</span> : null}
                  </div>
                  {onToggleFavorite ? (
                    <VendorFavoriteToggle
                      name={v.name}
                      favorite={v.favorite === true}
                      className={styles.favorite}
                      onToggle={(next) => onToggleFavorite(v, next)}
                    />
                  ) : null}
                  <VendorRowMenu
                    name={v.name}
                    defaultOpen={defaultMenuOpenId === v.id}
                    onEdit={() => change({ mode: "edit", vendor: v })}
                    onDelete={() => onDelete?.(v)}
                  />
                </li>
              );
            })}
          </ul>
        )}
        <div className={styles.listActions}>
          <ButtonPrimary className={styles.registerButton} onClick={() => change({ mode: "create" })}>
            판매처 등록
          </ButtonPrimary>
        </div>
      </div>
      {current ? (
        // 시안 1.17 9: 등록·수정 시트는 ex-modal-card (모바일 하단 시트 · 데스크톱 가운데 카드)
        <div data-component="ex-modal-card" className={styles.formColumn}>
          <VendorForm
            key={formKey}
            mode={editing ? "edit" : "create"}
            defaultValues={editing ?? (current.mode === "create" ? current.draft : undefined)}
            pending={pending}
            error={error}
            errorField={errorField}
            sticky={sticky}
            autoFocus={opened}
            onClose={() => change(null)}
            onSubmit={(value) => onSubmit?.(value, editing?.id ?? null)}
          />
        </div>
      ) : null}
    </section>
  );
}
