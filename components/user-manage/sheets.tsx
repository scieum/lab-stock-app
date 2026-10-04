"use client";

import { useId, useState } from "react";
import { ButtonOutline } from "@/components/button-outline";
import { ButtonPillSoft } from "@/components/button-pill-soft";
import { ButtonPrimary } from "@/components/button-primary";
import { ModalCard } from "@/components/ex-modal-card";
import { Icon } from "@/components/icons";
import { SegmentedControl } from "@/components/segmented-control";
import { TextInput } from "@/components/text-input";
import type { Role } from "@/lib/types";
import styles from "./styles.module.css";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "student", label: "학생" },
  { value: "teacher", label: "교사" },
  { value: "admin", label: "admin" },
];

const LAST_ADMIN_HINT = "admin이 최소 1명 있어야 해요";

type RoleOptionsProps = {
  value: Role;
  onChange?: (role: Role) => void;
  /** 전부 비활성 (마지막 admin) */
  disabled?: boolean;
  /** 라디오 묶음 이름 (접근성) */
  label?: string;
  /** 묶음을 설명하는 요소 id (비활성 안내) */
  describedBy?: string;
};

/** 역할 라디오 3행 (시안 role-options): 행 = 역할 이름 + 오른쪽 원형 라디오. 선택 행은 연하늘 바탕 + 하늘색 테두리 */
export function RoleOptions({ value, onChange, disabled, label = "역할", describedBy }: RoleOptionsProps) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label} aria-describedby={describedBy} className={styles.options}>
      {ROLE_OPTIONS.map((o) => {
        const checked = o.value === value;
        return (
          <label
            key={o.value}
            className={[styles.option, checked ? styles.optionSelected : "", disabled ? styles.optionDisabled : ""]
              .filter(Boolean)
              .join(" ")}
          >
            <input
              type="radio"
              className={styles.optionInput}
              name={name}
              value={o.value}
              checked={checked}
              disabled={disabled}
              onChange={() => onChange?.(o.value)}
            />
            <span className={styles.optionLabel}>{o.label}</span>
            <span className={styles.radio} aria-hidden="true">
              {checked ? <span className={styles.radioDot} /> : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}

type RoleChangeBodyProps = {
  /** 지금 역할 (처음 선택) */
  currentRole: Role;
  /** 본인 행 — "사용자 삭제" 숨김 */
  isSelf?: boolean;
  /** 학교의 마지막 admin — 라디오 비활성 + 안내, "변경" 비활성, "사용자 삭제" 숨김 */
  isLastAdmin?: boolean;
  /** 저장 중 — 버튼 비활성 */
  pending?: boolean;
  /** "변경" — 고른 역할을 넘긴다 (지금 역할과 같을 수 있다) */
  onSubmit?: (role: Role) => void;
  /** "사용자 삭제" — 삭제 확인을 띄운다 */
  onDelete?: () => void;
};

/** 역할 변경 시트 본문: 라디오 3행 + 전폭 "변경" + "사용자 삭제" */
export function RoleChangeBody({ currentRole, isSelf, isLastAdmin, pending, onSubmit, onDelete }: RoleChangeBodyProps) {
  const [role, setRole] = useState<Role>(currentRole);
  const hintId = useId();
  return (
    <form
      className={styles.body}
      onSubmit={(e) => {
        e.preventDefault();
        if (isLastAdmin || pending) return;
        onSubmit?.(role);
      }}
    >
      <RoleOptions value={role} onChange={setRole} disabled={isLastAdmin} describedBy={isLastAdmin ? hintId : undefined} />
      {isLastAdmin ? (
        <p id={hintId} className={styles.hint}>
          {LAST_ADMIN_HINT}
        </p>
      ) : null}
      <ButtonPrimary type="submit" className={styles.wide} disabled={isLastAdmin || pending}>
        변경
      </ButtonPrimary>
      {isSelf || isLastAdmin ? null : (
        <ButtonOutline className={styles.wide} disabled={pending} onClick={onDelete}>
          사용자 삭제
        </ButtonOutline>
      )}
    </form>
  );
}

export type InviteRole = Extract<Role, "student" | "teacher">;
export type InviteSubmit = { emails: string[]; role: InviteRole };

const INVITE_ROLE_OPTIONS: { value: InviteRole; label: string }[] = [
  { value: "student", label: "학생" },
  { value: "teacher", label: "교사" },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type InviteBodyProps = {
  /** 처음부터 담아 둘 이메일 */
  defaultEmails?: string[];
  defaultRole?: InviteRole;
  pending?: boolean;
  /** "초대 링크 복사" — 가입 주소를 복사한다 (메일은 보내지 않는다) */
  onCopyLink?: () => void;
  /** "N명 초대" */
  onSubmit?: (invite: InviteSubmit) => void;
};

/** 초대 시트 본문: 안내문 + "초대 링크 복사" + 이메일 입력(여러 개) + 역할 "학생 / 교사" + 전폭 "N명 초대" */
export function InviteBody({ defaultEmails = [], defaultRole = "student", pending, onCopyLink, onSubmit }: InviteBodyProps) {
  const [emails, setEmails] = useState<string[]>(defaultEmails);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [role, setRole] = useState<InviteRole>(defaultRole);

  const add = () => {
    const email = draft.trim().toLowerCase();
    if (email === "") return;
    if (!EMAIL_PATTERN.test(email)) {
      setError("이메일 주소를 확인하세요");
      return;
    }
    if (emails.includes(email)) {
      setError("이미 넣은 이메일이에요");
      return;
    }
    setEmails([...emails, email]);
    setDraft("");
    setError(undefined);
  };

  return (
    <form
      className={styles.body}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (emails.length === 0 || pending) return;
        onSubmit?.({ emails, role });
      }}
    >
      <p className={styles.guide}>초대 링크를 전달하세요. 아래 이메일로 가입하면 고른 역할이 붙어요</p>
      <div>
        <ButtonPillSoft icon="external" onClick={onCopyLink}>
          초대 링크 복사
        </ButtonPillSoft>
      </div>
      <div className={styles.emailRow}>
        <TextInput
          className={styles.emailInput}
          label="이메일"
          type="email"
          inputMode="email"
          autoComplete="off"
          placeholder="name@example.com"
          value={draft}
          error={error}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(undefined);
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            add();
          }}
        />
        <ButtonOutline className={styles.emailAdd} disabled={draft.trim() === ""} onClick={add}>
          추가
        </ButtonOutline>
      </div>
      {emails.length > 0 ? (
        <ul className={styles.emails} aria-label="초대 대상">
          {emails.map((email) => (
            <li key={email} className={styles.email}>
              <span className={styles.emailText}>{email}</span>
              <button
                type="button"
                className={styles.emailRemove}
                aria-label={`${email} 빼기`}
                onClick={() => setEmails(emails.filter((x) => x !== email))}
              >
                <Icon name="close" className={styles.emailRemoveIcon} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <SegmentedControl
        label="초대 역할"
        options={INVITE_ROLE_OPTIONS}
        value={role}
        onChange={(v) => setRole(v === "teacher" ? "teacher" : "student")}
      />
      <ButtonPrimary type="submit" className={styles.wide} disabled={emails.length === 0 || pending}>
        {emails.length}명 초대
      </ButtonPrimary>
    </form>
  );
}

type SheetProps = {
  /** Esc 로 부른다 */
  onClose?: () => void;
  /** true(기본) = 모바일에서 tab-bar 위에 붙는 하단 시트. false = 제자리(갤러리) */
  sheet?: boolean;
  modal?: boolean;
};

type RoleChangeSheetProps = SheetProps & {
  /** 대상 멤버 이름 — 제목 "{이름}의 역할" */
  name: string;
} & RoleChangeBodyProps;

/** ② 역할 변경 시트 (ex-modal-card) */
export function RoleChangeSheet({ name, onClose, sheet, modal, ...body }: RoleChangeSheetProps) {
  return (
    <ModalCard
      title={`${name}의 역할`}
      description="역할을 고르고 변경을 누르세요"
      hideClose
      onClose={onClose}
      sheet={sheet}
      modal={modal}
    >
      <RoleChangeBody {...body} />
    </ModalCard>
  );
}

/** ① 초대 시트 (ex-modal-card) */
export function InviteSheet({ onClose, sheet, modal, ...body }: SheetProps & InviteBodyProps) {
  return (
    <ModalCard title="사용자 초대" hideClose onClose={onClose} sheet={sheet} modal={modal}>
      <InviteBody {...body} />
    </ModalCard>
  );
}

type DeleteConfirmProps = SheetProps & {
  pending?: boolean;
  /** "취소" */
  onCancel?: () => void;
  /** "삭제" */
  onConfirm?: () => void;
};

/** ③ 삭제 확인 카드 (ex-modal-card): "이 사용자를 삭제할까요?" + "취소" + "삭제" */
export function DeleteConfirm({ pending, onCancel, onConfirm, onClose, sheet, modal }: DeleteConfirmProps) {
  return (
    <ModalCard title="이 사용자를 삭제할까요?" hideClose onClose={onClose ?? onCancel} sheet={sheet} modal={modal}>
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
