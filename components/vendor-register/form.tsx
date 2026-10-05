"use client";

import { useId, useState } from "react";
import { ButtonPrimary } from "@/components/button-primary";
import { Icon } from "@/components/icons";
import { TextInput } from "@/components/text-input";
import {
  VENDOR_CONTACT_MAX,
  VENDOR_NAME_MAX,
  VENDOR_WEBSITE_MAX,
  checkVendor,
  type VendorField,
  type VendorValue,
} from "@/lib/vendor-rules";
import styles from "./styles.module.css";

export type VendorFormValues = {
  name?: string | null;
  contact?: string | null;
  website?: string | null;
  /** 부가 정보 — 폼에 입력 칸이 없어(시안) 수정할 때 그대로 돌려준다 */
  note?: string | null;
};

type Props = {
  /** create = "판매처 등록", edit = "판매처 수정" */
  mode?: "create" | "edit";
  /** 처음 값 (수정할 판매처) */
  defaultValues?: VendorFormValues;
  /** 저장 중 — "저장" 비활성 */
  pending?: boolean;
  /** 저장 실패 안내 (서버 문구 — 예: 같은 이름의 판매처가 있어요) */
  error?: string | null;
  /** "저장" — 검사를 통과한 값만 넘긴다 (빈 값은 null, 웹사이트는 https:// 보정) */
  onSubmit?: (value: VendorValue) => void;
  /** 닫기(×) — 폼을 닫고 목록으로 돌아가는 길. 없으면 버튼을 그리지 않는다 */
  onClose?: () => void;
  /** true(기본) = 모바일에서 "저장" 을 tab-bar 바로 위에 고정. false = 항상 제자리(갤러리) */
  sticky?: boolean;
  /** 열릴 때 판매처명 입력으로 포커스 */
  autoFocus?: boolean;
};

/**
 * 판매처 등록·수정 폼 (화면 9, 시안 9-desktop vendor-form): 제목 → "판매처명"(필수) · "연락처" · "웹사이트 주소" → 전폭 "저장".
 * 판매처명이 비면 "저장" 비활성. data-component 는 없다 — vendor-register 안의 하위 요소다.
 */
export function VendorForm({
  mode = "create",
  defaultValues,
  pending = false,
  error,
  onSubmit,
  onClose,
  sticky = true,
  autoFocus = false,
}: Props) {
  const [name, setName] = useState(defaultValues?.name ?? "");
  const [contact, setContact] = useState(defaultValues?.contact ?? "");
  const [website, setWebsite] = useState(defaultValues?.website ?? "");
  const [fieldError, setFieldError] = useState<{ field: VendorField; error: string } | null>(null);
  const titleId = useId();

  const errorOf = (field: VendorField) => (fieldError?.field === field ? fieldError.error : undefined);
  const title = mode === "edit" ? "판매처 수정" : "판매처 등록";

  return (
    <form
      className={[styles.form, sticky ? styles.formSticky : ""].filter(Boolean).join(" ")}
      aria-labelledby={titleId}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const checked = checkVendor({ name, contact, website, note: defaultValues?.note ?? null });
        if (!checked.ok) {
          setFieldError({ field: checked.field, error: checked.error });
          return;
        }
        setFieldError(null);
        onSubmit?.(checked.value);
      }}
    >
      <div className={styles.formHeader}>
        <h2 id={titleId} className={styles.formTitle}>
          {title}
        </h2>
        {onClose ? (
          <button type="button" className={styles.formClose} aria-label="닫기" onClick={onClose}>
            <Icon name="close" className={styles.formCloseIcon} />
          </button>
        ) : null}
      </div>
      <TextInput
        label="판매처명"
        labelTone="strong"
        required
        autoComplete="off"
        maxLength={VENDOR_NAME_MAX}
        autoFocus={autoFocus}
        value={name}
        error={errorOf("name")}
        onChange={(e) => {
          setName(e.target.value);
          setFieldError(null);
        }}
      />
      <TextInput
        label="연락처"
        labelTone="strong"
        type="tel"
        inputMode="tel"
        autoComplete="off"
        maxLength={VENDOR_CONTACT_MAX}
        value={contact}
        error={errorOf("contact")}
        onChange={(e) => {
          setContact(e.target.value);
          setFieldError(null);
        }}
      />
      <TextInput
        label="웹사이트 주소"
        labelTone="strong"
        inputMode="url"
        autoComplete="off"
        maxLength={VENDOR_WEBSITE_MAX}
        value={website}
        error={errorOf("website")}
        onChange={(e) => {
          setWebsite(e.target.value);
          setFieldError(null);
        }}
      />
      {error || errorOf("note") ? (
        <p className={styles.error} role="alert">
          {error || errorOf("note")}
        </p>
      ) : null}
      <div className={styles.formActions}>
        <ButtonPrimary type="submit" fullWidth disabled={name.trim() === "" || pending}>
          저장
        </ButtonPrimary>
      </div>
    </form>
  );
}
