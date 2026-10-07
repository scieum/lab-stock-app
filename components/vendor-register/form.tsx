"use client";

import { useId, useState } from "react";
import { ButtonOutline } from "@/components/button-outline";
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
  /** 부가 정보 — 폼에 입력 칸이 없다(시안 1.17 9, d7 §18). 저장 값에 넣지 않는다(수정해도 DB 값 유지) */
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
  /** 서버가 알려 준 문제 칸 — 있으면 error 를 그 입력 아래에 보여 준다 (입력을 고치면 사라진다) */
  errorField?: VendorField | null;
  /** "저장" — 검사를 통과한 값만 넘긴다 (빈 값은 null, 웹사이트는 https:// 보정). note 는 없다(부가 정보 칸 없음) */
  onSubmit?: (value: Omit<VendorValue, "note">) => void;
  /** 닫기(×) · "취소" — 폼을 닫고 목록으로 돌아가는 길. 없으면 두 버튼을 그리지 않는다 */
  onClose?: () => void;
  /** true(기본) = 모바일에서 "저장" 을 tab-bar 바로 위에 고정. false = 항상 제자리(갤러리) */
  sticky?: boolean;
  /** 열릴 때 판매처명 입력으로 포커스 */
  autoFocus?: boolean;
};

/**
 * 판매처 등록·수정 폼 (화면 9, 시안 1.17 9 등록 시트): 제목 + 오른쪽 위 × → "우리 학교에서만 보여요"
 * → "판매처명"(필수) · "연락처" · "웹사이트 주소" → "취소" · "저장". 부가 정보(note) 칸은 없다(d7 §18).
 * 판매처명이 비면 "저장" 비활성. data-component 는 없다 — vendor-register 안의 하위 요소다.
 */
export function VendorForm({
  mode = "create",
  defaultValues,
  pending = false,
  error,
  errorField,
  onSubmit,
  onClose,
  sticky = true,
  autoFocus = false,
}: Props) {
  const [name, setName] = useState(defaultValues?.name ?? "");
  const [contact, setContact] = useState(defaultValues?.contact ?? "");
  const [website, setWebsite] = useState(defaultValues?.website ?? "");
  const [fieldError, setFieldError] = useState<{ field: VendorField; error: string } | null>(null);
  // 서버 필드 오류는 입력을 고치면 접는다 (다시 저장하면 새 결과를 보여 준다)
  const [edited, setEdited] = useState(false);
  const titleId = useId();

  const onField = errorField === "name" || errorField === "contact" || errorField === "website" ? errorField : null;
  const serverFieldError = error && onField && !edited ? error : null;
  const generalError = error && !onField ? error : null;
  const errorOf = (field: VendorField) =>
    fieldError?.field === field ? fieldError.error : serverFieldError && onField === field ? serverFieldError : undefined;
  const title = mode === "edit" ? "판매처 수정" : "판매처 등록";

  return (
    <form
      className={styles.form}
      data-sticky={sticky ? "true" : undefined}
      aria-labelledby={titleId}
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
        onSubmit?.({ name: checked.value.name, contact: checked.value.contact, website: checked.value.website });
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
      <p className={styles.formHelper}>우리 학교에서만 보여요</p>
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
          setEdited(true);
        }}
      />
      <TextInput
        label="연락처"
        labelTone="strong"
        type="tel"
        inputMode="tel"
        autoComplete="off"
        maxLength={VENDOR_CONTACT_MAX}
        placeholder="예: 043-123-4567"
        value={contact}
        error={errorOf("contact")}
        onChange={(e) => {
          setContact(e.target.value);
          setFieldError(null);
          setEdited(true);
        }}
      />
      <TextInput
        label="웹사이트 주소"
        labelTone="strong"
        inputMode="url"
        autoComplete="off"
        maxLength={VENDOR_WEBSITE_MAX}
        placeholder="예: www.example.co.kr"
        value={website}
        error={errorOf("website")}
        onChange={(e) => {
          setWebsite(e.target.value);
          setFieldError(null);
          setEdited(true);
        }}
      />
      {generalError || errorOf("note") ? (
        <p className={styles.error} role="alert">
          {generalError || errorOf("note")}
        </p>
      ) : null}
      <div className={styles.formActions}>
        {onClose ? (
          <ButtonOutline className={styles.formCancel} onClick={onClose}>
            취소
          </ButtonOutline>
        ) : null}
        <ButtonPrimary type="submit" className={styles.formSave} disabled={name.trim() === "" || pending}>
          저장
        </ButtonPrimary>
      </div>
    </form>
  );
}
