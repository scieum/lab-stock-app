"use client";

import { useId, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ButtonOutline } from "@/components/button-outline";
import { ButtonPrimary } from "@/components/button-primary";
import {
  DataTable,
  DataTableCell,
  DataTableRow,
  DataTableRowMenu,
  type DataTableColumn,
} from "@/components/data-table";
import { DetailDrawer, DrawerActionRow, DrawerField, DrawerRows } from "@/components/detail-drawer";
import { EmptyStateCard } from "@/components/ex-empty-state-card";
import { Toast } from "@/components/ex-toast";
import { SegmentedControl } from "@/components/segmented-control";
import { TextInput } from "@/components/text-input";
import { VendorDeleteConfirm, type VendorCommonItem, type VendorRegisterVendor } from "@/components/vendor-register";
import { VendorFavoriteToggle } from "@/components/vendor-link";
import {
  VENDOR_CONTACT_MAX,
  VENDOR_NAME_MAX,
  VENDOR_WEBSITE_MAX,
  checkVendor,
  vendorInfo,
  type VendorField,
  type VendorValue,
} from "@/lib/vendor-rules";
import styles from "./vendors.module.css";

type Tab = "school" | "common";

const TABS: { value: Tab; label: string }[] = [
  { value: "school", label: "우리 학교 판매처" },
  { value: "common", label: "공통 목록" },
];

/* 시안 9-desktop 열 폭 (표 안쪽 624 기준 비율) */
const SCHOOL_W = { name: "57.7%", contact: "32%", more: "10.3%" };
const COMMON_W = { name: "45%", info: "45%", favorite: "10%" };

const collator = new Intl.Collator("ko", { sensitivity: "base", numeric: true });

type Props = {
  tab: Tab;
  onTabChange: (tab: string) => void;
  query: string;
  onQueryChange: (q: string) => void;
  /** 검색으로 거른 우리 학교 판매처 */
  vendors: VendorRegisterVendor[];
  /** 우리 학교 판매처 전부 (수정 드로어 대상 찾기) */
  allVendors: VendorRegisterVendor[];
  /** 검색으로 거른 공통 목록 */
  common: VendorCommonItem[];
  searching: boolean;
  highlightId: string | null;
  pending: boolean;
  formError: { text: string; field: VendorField | null } | null;
  onClearFormError: () => void;
  onSave: (value: Omit<VendorValue, "note">, editingId: string | null, after?: () => void) => void;
  deleting: VendorRegisterVendor | null;
  deleteError: string | null;
  onAskDelete: (vendor: VendorRegisterVendor) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (after?: () => void) => void;
  onToggleFavorite: (vendor: { id: string }, next: boolean) => void;
  toast: { key: number; text: string } | null;
};

/** 드로어 상태 = 주소창 ?form=new(등록) · ?form={판매처 id}(수정). push = 뒤로가기로 되돌릴 수 있게 */
function setFormParam(value: string | null) {
  const url = new URL(window.location.href);
  if (value) url.searchParams.set("form", value);
  else url.searchParams.delete("form");
  window.history.pushState(null, "", url);
}

/**
 * 화면 9 판매처 — 데스크톱 (디자인 1.24 9-desktop, d7 §23 run b, admin 전용).
 * page-head(제목 "판매처" + "N곳" / vendor-register "판매처 등록") → toolbar(segmented-control 우리 학교 판매처 · 공통 목록 + 검색) →
 * data-table(판매처명↑ · 연락처 · 더보기 "수정"·"삭제", 즐겨찾기 별표는 그대로 — d7 §12-1).
 * 등록·수정 = 오른쪽 detail-drawer(모달 대신): "판매처 등록/수정" + × → "우리 학교에서만 보여요" → vendor-form(판매처명 필수 · 연락처 · 웹사이트 주소)
 * → drawer-actions("취소" · "저장"). 삭제 확인 = 가운데 ex-modal-card.
 */
export function VendorsDesk(props: Props) {
  const { tab, onTabChange, query, onQueryChange, vendors, allVendors, common, searching, highlightId, pending, toast } = props;
  const sp = useSearchParams();
  const formParam = sp.get("form");
  const editing = formParam && formParam !== "new" ? (allVendors.find((v) => v.id === formParam) ?? null) : null;
  const formOpen = tab === "school" && (formParam === "new" || editing !== null);
  const [nameDir, setNameDir] = useState<"asc" | "desc">("asc");

  const sorted = [...vendors].sort((a, b) => collator.compare(a.name, b.name) * (nameDir === "asc" ? 1 : -1));
  const total = tab === "school" ? allVendors.length : common.length;

  const schoolColumns: DataTableColumn[] = [
    { key: "name", label: "판매처명", width: SCHOOL_W.name, sort: nameDir, onSort: () => setNameDir((d) => (d === "asc" ? "desc" : "asc")) },
    { key: "contact", label: "연락처", width: SCHOOL_W.contact },
    { key: "more", label: "", width: SCHOOL_W.more, align: "end" },
  ];
  const commonColumns: DataTableColumn[] = [
    { key: "name", label: "판매처명", width: COMMON_W.name },
    { key: "info", label: "부가 정보", width: COMMON_W.info },
    { key: "favorite", label: "즐겨찾기", width: COMMON_W.favorite, align: "end" },
  ];

  const closeForm = () => {
    if (pending) return;
    props.onClearFormError();
    setFormParam(null);
  };

  return (
    <div className={styles.deskFrame}>
      <div className={styles.deskList} aria-busy={pending ? true : undefined}>
        <div className={styles.deskHead} data-name="page-head">
          <div className={styles.deskTitleRow}>
            <h1 className={styles.deskTitle}>판매처</h1>
            <span className={styles.deskCount}>{total}곳</span>
          </div>
          <div data-component="vendor-register" className={styles.deskRegister}>
            <ButtonPrimary
              onClick={() => {
                props.onClearFormError();
                if (tab !== "school") onTabChange("school");
                setFormParam("new");
              }}
            >
              판매처 등록
            </ButtonPrimary>
          </div>
        </div>

        <div className={styles.deskToolbar} data-name="toolbar">
          <SegmentedControl size="sm" label="판매처 목록" options={TABS} value={tab} onChange={onTabChange} />
          <TextInput
            className={styles.deskSearch}
            icon="search"
            type="search"
            aria-label="판매처 검색"
            placeholder="판매처 검색"
            autoComplete="off"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
          />
        </div>

        {tab === "school" ? (
          <DataTable
            label="우리 학교 판매처"
            columns={schoolColumns}
            empty={
              sorted.length === 0 ? (
                <EmptyStateCard
                  variant="outlined"
                  title={searching ? "찾는 판매처가 없어요" : "등록한 판매처가 없어요"}
                  description={searching ? undefined : "자주 주문하는 판매처를 등록해 두세요"}
                />
              ) : undefined
            }
          >
            {sorted.map((v) => {
              const current = editing?.id === v.id || highlightId === v.id;
              return (
                <DataTableRow key={v.id} selected={current}>
                  <DataTableCell strong={editing?.id === v.id}>
                    <span className={styles.deskName}>
                      <VendorFavoriteToggle
                        name={v.name}
                        favorite={v.favorite === true}
                        className={styles.deskFavorite}
                        onToggle={(next) => props.onToggleFavorite(v, next)}
                      />
                      <span className={styles.deskNameText}>{v.name}</span>
                    </span>
                  </DataTableCell>
                  <DataTableCell tone={v.contact ? "default" : "muted"}>{v.contact || "-"}</DataTableCell>
                  <DataTableCell align="end">
                    <DataTableRowMenu
                      label={`${v.name} 더보기`}
                      disabled={pending}
                      items={[
                        {
                          label: "수정",
                          onSelect: () => {
                            props.onClearFormError();
                            setFormParam(v.id);
                          },
                        },
                        { label: "삭제", onSelect: () => props.onAskDelete(v) },
                      ]}
                    />
                  </DataTableCell>
                </DataTableRow>
              );
            })}
          </DataTable>
        ) : (
          <DataTable
            label="공통 목록"
            columns={commonColumns}
            empty={
              common.length === 0 ? (
                <EmptyStateCard variant="outlined" title={searching ? "찾는 판매처가 없어요" : "공통 판매처가 없어요"} />
              ) : undefined
            }
          >
            {common.map((v) => (
              <DataTableRow key={v.id}>
                <DataTableCell strong>{v.name}</DataTableCell>
                <DataTableCell tone={vendorInfo(v) ? "default" : "muted"}>{vendorInfo(v) || "-"}</DataTableCell>
                <DataTableCell align="end">
                  <VendorFavoriteToggle
                    name={v.name}
                    favorite={v.favorite === true}
                    className={styles.deskFavorite}
                    onToggle={(next) => props.onToggleFavorite(v, next)}
                  />
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTable>
        )}
      </div>

      {formOpen ? (
        <VendorDrawer
          key={editing ? `edit-${editing.id}` : "create"}
          vendor={editing}
          pending={pending}
          error={props.formError}
          onClose={closeForm}
          onSubmit={(value) => props.onSave(value, editing?.id ?? null, () => setFormParam(null))}
        />
      ) : null}

      {props.deleting ? (
        <div className={styles.deskModal}>
          <VendorDeleteConfirm
            key={props.deleting.id}
            name={props.deleting.name}
            pending={pending}
            error={props.deleteError}
            onCancel={props.onCancelDelete}
            onConfirm={() =>
              props.onConfirmDelete(() => {
                if (editing && editing.id === props.deleting?.id) setFormParam(null);
              })
            }
          />
        </div>
      ) : null}

      {toast ? (
        <Toast key={toast.key} floating>
          {toast.text}
        </Toast>
      ) : null}
    </div>
  );
}

type DrawerProps = {
  vendor: VendorRegisterVendor | null;
  pending: boolean;
  error: { text: string; field: VendorField | null } | null;
  onClose: () => void;
  onSubmit: (value: Omit<VendorValue, "note">) => void;
};

/** 판매처 등록·수정 드로어 (시안 9-desktop detail-drawer · vendor-form) */
function VendorDrawer({ vendor, pending, error, onClose, onSubmit }: DrawerProps) {
  const [name, setName] = useState(vendor?.name ?? "");
  const [contact, setContact] = useState(vendor?.contact ?? "");
  const [website, setWebsite] = useState(vendor?.website ?? "");
  const [fieldError, setFieldError] = useState<{ field: VendorField; error: string } | null>(null);
  const [edited, setEdited] = useState(false);
  const formId = useId();
  const ids = { name: useId(), contact: useId(), website: useId() };

  const onField = error?.field === "name" || error?.field === "contact" || error?.field === "website" ? error.field : null;
  const serverFieldError = error && onField && !edited ? error.text : null;
  const generalError = error && !onField ? error.text : null;
  const errorOf = (field: VendorField) =>
    fieldError?.field === field ? fieldError.error : serverFieldError && onField === field ? serverFieldError : undefined;
  const change = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    set(e.target.value);
    setFieldError(null);
    setEdited(true);
  };

  return (
    <DetailDrawer
      title={vendor ? "판매처 수정" : "판매처 등록"}
      onClose={onClose}
      focusKey={vendor?.id ?? "create"}
      actions={
        <DrawerActionRow wideLast>
          <ButtonOutline onClick={onClose}>취소</ButtonOutline>
          <ButtonPrimary type="submit" form={formId} disabled={name.trim() === "" || pending}>
            저장
          </ButtonPrimary>
        </DrawerActionRow>
      }
    >
      <p className={styles.deskHelper}>우리 학교에서만 보여요</p>
      <form
        id={formId}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (pending) return;
          const checked = checkVendor({ name, contact, website });
          if (!checked.ok) {
            setFieldError({ field: checked.field, error: checked.error });
            return;
          }
          setFieldError(null);
          setEdited(false);
          onSubmit({ name: checked.value.name, contact: checked.value.contact, website: checked.value.website });
        }}
      >
        <DrawerRows name="vendor-form">
          <DrawerField label="판매처명" required htmlFor={ids.name}>
            <TextInput
              id={ids.name}
              aria-label="판매처명"
              required
              autoComplete="off"
              maxLength={VENDOR_NAME_MAX}
              value={name}
              error={errorOf("name")}
              onChange={change(setName)}
            />
          </DrawerField>
          <DrawerField label="연락처" htmlFor={ids.contact}>
            <TextInput
              id={ids.contact}
              aria-label="연락처"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              maxLength={VENDOR_CONTACT_MAX}
              placeholder="예: 043-123-4567"
              value={contact}
              error={errorOf("contact")}
              onChange={change(setContact)}
            />
          </DrawerField>
          <DrawerField label="웹사이트 주소" htmlFor={ids.website}>
            <TextInput
              id={ids.website}
              aria-label="웹사이트 주소"
              inputMode="url"
              autoComplete="off"
              maxLength={VENDOR_WEBSITE_MAX}
              placeholder="예: www.example.co.kr"
              value={website}
              error={errorOf("website")}
              onChange={change(setWebsite)}
            />
          </DrawerField>
        </DrawerRows>
        {generalError || errorOf("note") ? (
          <p className={styles.deskError} role="alert">
            {generalError || errorOf("note")}
          </p>
        ) : null}
      </form>
    </DetailDrawer>
  );
}
