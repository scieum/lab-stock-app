"use client";

import { ButtonOutline } from "@/components/button-outline";
import { ButtonPrimary } from "@/components/button-primary";
import { DataTable, DataTableRow } from "@/components/ex-data-table";
import { DataTableCell } from "@/components/ex-data-table-cell";
import { ModalCard } from "@/components/ex-modal-card";
import { vendorInfo, type VendorLike } from "@/lib/vendor-rules";
import styles from "./styles.module.css";

type DeleteProps = {
  /** 지울 판매처 이름 — 제목 아래 한 줄 */
  name?: string;
  pending?: boolean;
  /** 삭제 실패 안내 (서버 문구) */
  error?: string | null;
  /** "취소" */
  onCancel?: () => void;
  /** "삭제" */
  onConfirm?: () => void;
  /** Esc (없으면 onCancel) */
  onClose?: () => void;
  /** true(기본) = 모바일에서 tab-bar 위에 붙는 하단 시트. false = 제자리(갤러리) */
  sheet?: boolean;
  modal?: boolean;
};

/** 삭제 확인 카드 (화면 9, ex-modal-card): "이 판매처를 삭제할까요?" + "취소" + "삭제". 하늘색 없음 */
export function VendorDeleteConfirm({ name, pending, error, onCancel, onConfirm, onClose, sheet, modal }: DeleteProps) {
  return (
    <ModalCard
      title="이 판매처를 삭제할까요?"
      description={name}
      hideClose
      onClose={onClose ?? onCancel}
      sheet={sheet}
      modal={modal}
    >
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.confirm}>
        <ButtonOutline className={styles.confirmButton} disabled={pending} onClick={onCancel}>
          취소
        </ButtonOutline>
        <ButtonPrimary className={styles.confirmButton} disabled={pending} onClick={onConfirm}>
          삭제
        </ButtonPrimary>
      </div>
    </ModalCard>
  );
}

export type VendorCommonItem = VendorLike & { id: string };

/**
 * "공통 목록" 탭 (화면 9): 서비스 공통 판매처, 보기 전용 2열(판매처명 · 부가 정보) — 셀은 ex-data-table-cell.
 * 수정·삭제 버튼이 없다. vendor-register 바깥에 둔다.
 */
export function VendorCommonList({ vendors, label = "공통 목록" }: { vendors: VendorCommonItem[]; label?: string }) {
  return (
    <DataTable
      label={label}
      head={
        <>
          <DataTableCell variant="header">판매처명</DataTableCell>
          <DataTableCell variant="header">부가 정보</DataTableCell>
        </>
      }
    >
      {vendors.map((v) => (
        <DataTableRow key={v.id}>
          <DataTableCell strong>{v.name}</DataTableCell>
          <DataTableCell>{vendorInfo(v) || "-"}</DataTableCell>
        </DataTableRow>
      ))}
    </DataTable>
  );
}
