"use client";

import { useId, useState } from "react";
import { ButtonPrimary } from "@/components/button-primary";
import { DataInviteRow, DataMemberRow } from "@/components/ex-data-table-cell";
import { EmptyStateCard } from "@/components/ex-empty-state-card";
import { TextInput } from "@/components/text-input";
import type { Role } from "@/lib/types";
import styles from "./styles.module.css";

export { DeleteConfirm, InviteBody, InviteSheet, RoleChangeBody, RoleChangeSheet, RoleOptions } from "./sheets";
export type { InviteRole, InviteSubmit } from "./sheets";

/** 역할 표시 글자 (시안: 학생 · 교사 · admin) */
export const ROLE_LABEL: Record<Role, string> = { student: "학생", teacher: "교사", admin: "admin" };

export type UserManageMember = {
  id: string;
  name: string;
  role: Role;
  /** 로그인한 admin 본인 */
  isSelf?: boolean;
  /** 학교의 마지막 admin (다른 역할로 못 바꾸고 삭제도 못 한다) */
  isLastAdmin?: boolean;
  /** 가입일 "2026-03-02" (데스크톱 표) */
  joinedOn?: string | null;
};

export type UserManageInvite = {
  id: string;
  email: string;
  /** 표시용 초대일 (예: "2026.09.28") */
  invitedAt: string;
  /** 초대 역할 (데스크톱 표) */
  role?: "student" | "teacher";
};

type Props = {
  schoolName: string;
  /** 같은 학교 멤버 전체 (검색은 이 안에서 이름 부분 일치로 거른다) */
  members: UserManageMember[];
  /** 대기 중인 초대 */
  invites?: UserManageInvite[];
  /** 헤더 인원. 없으면 members 에서 센다 */
  counts?: { student: number; teacher: number; admin: number };
  /** 처음 검색어 */
  defaultQuery?: string;
  /** 역할 변경 시트가 열려 있는 멤버 id */
  selectedId?: string | null;
  /** 헤더 "초대" */
  onInvite?: () => void;
  /** 멤버 행을 눌렀을 때 (역할 변경 시트를 연다) */
  onSelectMember?: (member: UserManageMember) => void;
};

function memberNote(m: UserManageMember): string | undefined {
  const parts = [m.isSelf ? "본인" : "", m.isLastAdmin ? "마지막 admin" : ""].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/**
 * 사용자 관리 본문 (화면 8, admin 전용).
 * 헤더(학교명·인원·초대) → 이름 검색 → "멤버" → "초대 대기 (N)" → 유의사항.
 * 초대·역할 변경·삭제 확인은 ex-modal-card(./sheets)로 화면 쪽에서 띄운다.
 */
export function UserManage({
  schoolName,
  members,
  invites = [],
  counts,
  defaultQuery = "",
  selectedId = null,
  onInvite,
  onSelectMember,
}: Props) {
  const [query, setQuery] = useState(defaultQuery);
  const headingId = useId();
  const membersId = useId();
  const invitesId = useId();

  const c = counts ?? {
    student: members.filter((m) => m.role === "student").length,
    teacher: members.filter((m) => m.role === "teacher").length,
    admin: members.filter((m) => m.role === "admin").length,
  };
  const total = c.student + c.teacher + c.admin;

  const q = query.trim().toLowerCase();
  const shown = q === "" ? members : members.filter((m) => m.name.toLowerCase().includes(q));
  const searchEmpty = q !== "" && shown.length === 0;
  const nobodyElse = q === "" && invites.length === 0 && members.every((m) => m.isSelf);

  return (
    <section data-component="user-manage" className={styles.root} aria-labelledby={headingId}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h2 id={headingId} className={styles.heading}>
            {schoolName} 사용자 {total}명
          </h2>
          <p className={styles.counts}>
            학생 {c.student} · 교사 {c.teacher} · admin {c.admin}
          </p>
        </div>
        <div className={styles.search}>
          <TextInput
            icon="search"
            type="search"
            placeholder="이름 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <ButtonPrimary className={styles.invite} onClick={onInvite}>
          초대
        </ButtonPrimary>
      </div>

      <div className={styles.section}>
        <h3 id={membersId} className={styles.sectionTitle}>
          멤버
        </h3>
        {searchEmpty ? (
          <EmptyStateCard title="찾는 사용자가 없어요" />
        ) : (
          <div className={styles.list}>
            <div className={styles.tableHeader} aria-hidden="true">
              <span>이름</span>
              <span>역할</span>
              <span>역할 변경</span>
            </div>
            <ul className={styles.rows} aria-labelledby={membersId}>
              {shown.map((m) => (
                <li key={m.id} className={styles.item}>
                  <DataMemberRow
                    name={m.name}
                    role={ROLE_LABEL[m.role]}
                    self={m.isSelf}
                    note={memberNote(m)}
                    chevron={!m.isLastAdmin}
                    selected={selectedId === m.id}
                    onClick={() => onSelectMember?.(m)}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {nobodyElse ? <EmptyStateCard title="아직 초대한 사용자가 없어요" /> : null}

      {invites.length > 0 ? (
        <div className={styles.section}>
          <h3 id={invitesId} className={styles.sectionTitle}>
            초대 대기 ({invites.length})
          </h3>
          <div className={styles.list}>
            <ul className={styles.rows} aria-labelledby={invitesId}>
              {invites.map((v) => (
                <li key={v.id} className={styles.item}>
                  <DataInviteRow email={v.email} caption={`${v.invitedAt} 초대`} status="대기" />
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <p className={styles.note}>같은 학교({schoolName}) 계정만 초대할 수 있어요</p>
    </section>
  );
}
