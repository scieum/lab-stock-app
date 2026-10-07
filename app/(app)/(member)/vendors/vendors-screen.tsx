"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { EmptyStateCard } from "@/components/ex-empty-state-card";
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
import { filterVendors, type VendorField, type VendorValue } from "@/lib/vendor-rules";
import { deleteVendorAction, saveVendorAction, toggleVendorFavoriteAction } from "./actions";
import styles from "./vendors.module.css";

type Props = {
  /** 우리 학교 판매처 (이름순) */
  vendors: VendorRegisterVendor[];
  /** 공통 목록 (보기 전용) */
  common: VendorCommonItem[];
};

type Tab = "school" | "common";

const TABS: { value: Tab; label: string }[] = [
  { value: "school", label: "우리 학교 판매처" },
  { value: "common", label: "공통 목록" },
];

/** 저장 후 토스트를 보여 주는 시간 */
const TOAST_MS = 4000;

/**
 * 화면 9 판매처 설정 (admin 전용).
 * 시안: (데스크톱 screen-title) → toolbar(segmented-control "우리 학교 판매처 / 공통 목록" + 검색)
 *       → 우리 학교 탭: vendor-register(목록 · 더보기 "수정"·"삭제" · "판매처 등록" · 폼) / 공통 목록 탭: 보기 전용 2열.
 * 등록·수정·삭제 → 서버 액션 → ex-toast → 목록(서버가 다시 내려 준다), 방금 저장한 행 강조.
 * 저장 뒤 폼: 모바일은 목록으로 돌아간다 / 데스크톱은 시안 9-desktop 처럼 방금 저장한 판매처의 "판매처 수정" 으로 남는다.
 * 삭제 확인(ex-modal-card)은 비모달이다 — 닫기: Esc · "취소". 학교·호출자 역할 값은 보내지 않는다.
 */
export function VendorsScreen({ vendors: serverVendors, common: serverCommon }: Props) {
  const [tab, setTab] = useState<Tab>("school");
  /**
   * 즐겨찾기 (d7 §12-1): 별표를 누르면 바로 바꿔 보여 주고 저장한다. 실패하면 되돌리고 토스트.
   * 판매처 id → 누른 뒤의 값. 서버가 새 목록을 내려 주면 비운다(서버 값이 맞다).
   */
  const [favoriteOverride, setFavoriteOverride] = useState<Map<string, boolean>>(() => new Map());
  const [seenLists, setSeenLists] = useState({ serverVendors, serverCommon });
  if (seenLists.serverVendors !== serverVendors || seenLists.serverCommon !== serverCommon) {
    setSeenLists({ serverVendors, serverCommon });
    setFavoriteOverride(new Map());
  }
  const withFavorite = <T extends { id: string; favorite?: boolean }>(list: T[]): T[] =>
    favoriteOverride.size === 0
      ? list
      : list.map((v) => (favoriteOverride.has(v.id) ? { ...v, favorite: favoriteOverride.get(v.id) } : v));
  const vendors = withFavorite(serverVendors);
  const common = withFavorite(serverCommon);
  /** 판매처마다 마지막 요청 번호 — 늦게 온 이전 응답이 새 상태를 되돌리지 않게 */
  const favoriteSeq = useRef(new Map<string, number>());
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<VendorFormState | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ key: number; text: string } | null>(null);
  const [formError, setFormError] = useState<{ text: string; field: VendorField | null } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  /** 같은 요청을 두 번 보내지 않게 (pending 이 화면에 닿기 전의 연속 누름까지 막는다) */
  const sending = useRef(false);

  const pageRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);

  // 지울 판매처 — 목록에서 사라졌으면(삭제됨) 확인 카드도 닫힌 것으로 본다
  const deleting = deletingId ? (vendors.find((v) => v.id === deletingId) ?? null) : null;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  // 삭제 확인 카드 높이만큼 본문 아래를 비운다 — 카드가 떠 있어도 마지막 행까지 그 위로 올릴 수 있다
  const deletingKey = deleting?.id ?? null;
  useEffect(() => {
    const page = pageRef.current;
    const card = dockRef.current?.firstElementChild;
    if (!page || !deletingKey || !(card instanceof HTMLElement)) return;
    const apply = () => page.style.setProperty("--vendors-sheet-space", `${Math.ceil(card.getBoundingClientRect().height)}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(card);
    return () => {
      ro.disconnect();
      page.style.removeProperty("--vendors-sheet-space");
    };
  }, [deletingKey]);

  const changeTab = (next: string) => {
    if (pending) return;
    setTab(next === "common" ? "common" : "school");
    // 탭을 떠나면 열려 있던 삭제 확인은 닫는다 (보이지 않는 행을 지우지 않게)
    setDeletingId(null);
    setDeleteError(null);
  };

  const changeForm = (next: VendorFormState | null) => {
    if (pending) return;
    setFormError(null);
    setForm(next);
  };

  const save = (value: Omit<VendorValue, "note">, editingId: string | null) => {
    if (pending || sending.current) return;
    sending.current = true;
    setFormError(null);
    startTransition(async () => {
      try {
        // note 는 보내지 않는다 — 부가 정보 칸이 없어(d7 §18) 수정해도 기존 note 를 그대로 둔다
        const res = await saveVendorAction({
          name: value.name,
          contact: value.contact,
          website: value.website,
          id: editingId ?? undefined,
        });
        if (!res.ok) {
          setFormError({ text: res.error, field: res.field ?? null });
          return;
        }
        const saved = res.vendor;
        // 등록 시트·카드(시안 1.17 9)를 닫고 목록으로 — 방금 저장한 행을 강조하고 토스트
        setForm(null);
        setResetKey((k) => k + 1);
        setHighlightId(saved.id);
        // 방금 저장한 행이 검색에 걸러져 안 보이면 검색을 푼다
        if (filterVendors([saved], query).length === 0) setQuery("");
        setToast({ key: Date.now(), text: "판매처를 저장했어요" });
      } finally {
        sending.current = false;
      }
    });
  };

  const askDelete = (vendor: VendorRegisterVendor) => {
    if (pending) return;
    setDeleteError(null);
    setDeletingId(vendor.id);
  };

  const cancelDelete = () => {
    if (pending) return;
    setDeletingId(null);
    setDeleteError(null);
  };

  const confirmDelete = () => {
    if (pending || sending.current || !deleting) return;
    const id = deleting.id;
    sending.current = true;
    setDeleteError(null);
    startTransition(async () => {
      try {
        const res = await deleteVendorAction({ id });
        if (!res.ok) {
          setDeleteError(res.error);
          return;
        }
        setDeletingId(null);
        setForm((f) => (f?.mode === "edit" && f.vendor.id === id ? null : f));
        setFormError(null);
        setHighlightId(null);
        setToast({ key: Date.now(), text: "판매처를 삭제했어요" });
      } finally {
        sending.current = false;
      }
    });
  };

  const setFavorite = (id: string, favorite: boolean) =>
    setFavoriteOverride((m) => new Map(m).set(id, favorite));

  const toggleFavorite = (vendor: { id: string }, next: boolean) => {
    const id = vendor.id;
    const seq = (favoriteSeq.current.get(id) ?? 0) + 1;
    favoriteSeq.current.set(id, seq);
    setFavorite(id, next);
    const fail = (text: string) => {
      if (favoriteSeq.current.get(id) !== seq) return;
      setFavorite(id, !next);
      setToast({ key: Date.now(), text });
    };
    toggleVendorFavoriteAction({ vendorId: id, favorite: next })
      .then((res) => {
        if (!res.ok) fail(res.error);
      })
      .catch(() => fail("즐겨찾기를 저장하지 못했어요. 잠시 후 다시 시도해 주세요"));
  };

  const searching = query.trim() !== "";
  const shownCommon = filterVendors(common, query);

  return (
    <div ref={pageRef} className={styles.page}>
      <h1 className={styles.title}>판매처 설정</h1>

      <div className={styles.toolbar} data-name="toolbar">
        <div className={styles.tabs}>
          <SegmentedControl label="판매처 목록" variant="indicator" options={TABS} value={tab} onChange={changeTab} />
        </div>
        <div className={styles.search}>
          <TextInput
            icon="search"
            type="search"
            aria-label="판매처 검색"
            placeholder="판매처 검색"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div aria-busy={pending ? true : undefined}>
        {tab === "common" ? (
          shownCommon.length > 0 ? (
            <VendorCommonList vendors={shownCommon} onToggleFavorite={toggleFavorite} />
          ) : (
            <EmptyStateCard title={searching ? "찾는 판매처가 없어요" : "공통 판매처가 없어요"} />
          )
        ) : (
          <VendorRegister
            vendors={filterVendors(vendors, query)}
            searching={searching}
            highlightId={highlightId}
            form={form}
            onFormChange={changeForm}
            onSubmit={save}
            onDelete={askDelete}
            onToggleFavorite={toggleFavorite}
            pending={pending}
            error={formError?.text ?? null}
            errorField={formError?.field ?? null}
            resetKey={resetKey}
          />
        )}
      </div>

      <div ref={dockRef} className={styles.dock}>
        {deleting && tab === "school" ? (
          <VendorDeleteConfirm
            key={deleting.id}
            modal={false}
            name={deleting.name}
            pending={pending}
            error={deleteError}
            onCancel={cancelDelete}
            onConfirm={confirmDelete}
          />
        ) : null}
      </div>

      {toast ? (
        <Toast key={toast.key} floating>
          {toast.text}
        </Toast>
      ) : null}
    </div>
  );
}
