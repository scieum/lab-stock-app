"use client";

import { useState } from "react";
import { Toast } from "@/components/ex-toast";
import { SegmentedControl } from "@/components/segmented-control";
import { TextInput } from "@/components/text-input";
import {
  VendorCommonList,
  VendorDeleteConfirm,
  VendorRegister,
  type VendorCommonItem,
  type VendorFormState,
  type VendorRegisterVendor,
} from "@/components/vendor-register";
import { filterVendors, vendorNameKey, type VendorValue } from "@/lib/vendor-rules";
import local from "./vendors.module.css";

const TABS = [
  { value: "school", label: "우리 학교 판매처" },
  { value: "common", label: "공통 목록" },
];

type Props = {
  vendors: VendorRegisterVendor[];
  common: VendorCommonItem[];
  defaultTab?: "school" | "common";
  defaultQuery?: string;
  /** 처음부터 열어 둘 폼 */
  defaultForm?: VendorFormState | null;
  /** 더보기 메뉴를 처음부터 펼쳐 둘 행 */
  defaultMenuOpenId?: string | null;
  /** 방금 저장한 행 (연하늘 강조) */
  defaultHighlightId?: string | null;
  /** 처음부터 보여 줄 토스트 */
  defaultToast?: string | null;
};

/**
 * 화면 9 예시: 탭 → 검색 → "우리 학교 판매처" 블록(vendor-register) 또는 공통 목록 → 삭제 확인 → 토스트.
 * 저장·삭제는 이 예시 안의 상태만 바꾼다 (서버 없음). 고정 줄·시트는 제자리로 그린다.
 */
export function VendorsDemo({
  vendors: initial,
  common,
  defaultTab = "school",
  defaultQuery = "",
  defaultForm = null,
  defaultMenuOpenId = null,
  defaultHighlightId = null,
  defaultToast = null,
}: Props) {
  const [vendors, setVendors] = useState(initial);
  const [tab, setTab] = useState<string>(defaultTab);
  const [query, setQuery] = useState(defaultQuery);
  const [form, setForm] = useState<VendorFormState | null>(defaultForm);
  const [highlightId, setHighlightId] = useState<string | null>(defaultHighlightId);
  const [toast, setToast] = useState<string | null>(defaultToast);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<VendorRegisterVendor | null>(null);
  const [seq, setSeq] = useState(1);

  const save = (value: VendorValue, editingId: string | null) => {
    const taken = vendors.some((v) => v.id !== editingId && vendorNameKey(v.name) === vendorNameKey(value.name));
    if (taken) {
      setError("같은 이름의 판매처가 있어요");
      return;
    }
    const id = editingId ?? `new-${seq}`;
    if (editingId) setVendors(vendors.map((v) => (v.id === editingId ? { ...v, ...value } : v)));
    else {
      setVendors([{ id, ...value }, ...vendors]);
      setSeq(seq + 1);
    }
    setError(null);
    setForm(null);
    setHighlightId(id);
    setToast("판매처를 저장했어요");
  };

  const remove = () => {
    if (!deleting) return;
    setVendors(vendors.filter((v) => v.id !== deleting.id));
    if (form?.mode === "edit" && form.vendor.id === deleting.id) setForm(null);
    setDeleting(null);
    setHighlightId(null);
    setToast("판매처를 삭제했어요");
  };

  return (
    <div className={local.screen}>
      <div className={local.toolbar}>
        <SegmentedControl label="판매처 목록" variant="indicator" options={TABS} value={tab} onChange={setTab} />
        <TextInput
          icon="search"
          type="search"
          placeholder="판매처 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {tab === "common" ? (
        <VendorCommonList vendors={filterVendors(common, query)} />
      ) : (
        <VendorRegister
          sticky={false}
          vendors={filterVendors(vendors, query)}
          searching={query.trim() !== ""}
          highlightId={highlightId}
          form={form}
          onFormChange={(next) => {
            setError(null);
            setForm(next);
          }}
          onSubmit={save}
          onDelete={setDeleting}
          error={error}
          defaultMenuOpenId={defaultMenuOpenId}
        />
      )}
      {deleting ? (
        <VendorDeleteConfirm sheet={false} name={deleting.name} onCancel={() => setDeleting(null)} onConfirm={remove} />
      ) : null}
      {toast ? <Toast>{toast}</Toast> : null}
    </div>
  );
}
