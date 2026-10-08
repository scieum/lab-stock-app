"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ButtonPillSoft } from "@/components/button-pill-soft";
import { ButtonPrimary } from "@/components/button-primary";
import {
  DataTable,
  DataTableCell,
  DataTableRow,
  DataTableRowMenu,
  type DataTableColumn,
  type DataTableSort,
} from "@/components/data-table";
import { EmptyStateCard } from "@/components/ex-empty-state-card";
import { Toast } from "@/components/ex-toast";
import { SegmentedControl } from "@/components/segmented-control";
import { TextInput } from "@/components/text-input";
import {
  DeleteConfirm,
  ROLE_LABEL,
  RoleChangeSheet,
  type InviteRole,
  type UserManageInvite,
  type UserManageMember,
} from "@/components/user-manage";
import type { Role } from "@/lib/types";
import { isValidEmail, normalizeEmails } from "@/lib/users-rules";
import { changeMemberRoleAction, inviteMembersAction, removeMemberAction } from "./actions";
import styles from "./users.module.css";

type Props = {
  schoolName: string;
  members: UserManageMember[];
  counts: { student: number; teacher: number; admin: number };
  invites: UserManageInvite[];
  /** "초대 링크 복사" (화면이 주소를 복사하고 결과 문구를 돌려준다) */
  onCopyLink: () => Promise<string>;
};

type SortKey = "name" | "role" | "joined";
type Modal = { kind: "role" | "delete"; id: string } | null;

const TOAST_MS = 4000;
const INVITE_ROLES = [
  { value: "student", label: "학생" },
  { value: "teacher", label: "교사" },
];
const ROLE_ORDER: Record<Role, number> = { admin: 0, teacher: 1, student: 2 };
const collator = new Intl.Collator("ko", { sensitivity: "base", numeric: true });

/* 시안 8-desktop 열 폭 (멤버 이메일은 읽지 않아 빼고 — d7 §8 — 나머지를 같은 비율로) */
const MEMBER_W = { name: "38%", role: "26%", joined: "28%", more: "8%" };
const INVITE_W = { email: "43.5%", role: "18%", invited: "18%", status: "20.5%" };

/**
 * 화면 8 사용자 — 데스크톱 (디자인 1.24 8-desktop, d7 §23 run b, admin 전용).
 * page-head(제목 "사용자" + "N명" · "학생 n · 교사 n · admin n" / 초대: 이메일 + 학생·교사 + "초대" + "초대 링크 복사") →
 * user-manage(이름 검색 → "멤버" data-table(이름 · 역할 · 가입일, 정렬 / 행 끝 더보기 "역할 바꾸기" · "삭제") →
 * "초대 대기 (N)" data-table(이메일 · 역할 · 초대일 · 상태) → 유의사항).
 * 역할 바꾸기 · 삭제 확인 = 본문 가운데 ex-modal-card (모달 = 확인 · 짧은 입력만 — rules.json desktop_shell.overlay).
 */
export function UsersDesk({ schoolName, members, counts, invites, onCopyLink }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("student");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [linkNotice, setLinkNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<{ key: number; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [leaving, setLeaving] = useState(false);
  const busy = pending || leaving;
  const emailId = useId();
  const membersId = useId();
  const invitesId = useId();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const target = modal ? (members.find((m) => m.id === modal.id) ?? null) : null;
  const total = counts.student + counts.teacher + counts.admin;

  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    const list = q === "" ? [...members] : members.filter((m) => m.name.toLowerCase().includes(q));
    if (!sort) return list;
    const sign = sort.dir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      let d = 0;
      if (sort.key === "name") d = collator.compare(a.name, b.name);
      else if (sort.key === "role") d = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
      else d = (a.joinedOn ?? "").localeCompare(b.joinedOn ?? "");
      return d * sign || collator.compare(a.name, b.name);
    });
  }, [members, q, sort]);

  const sortOf = (key: SortKey): DataTableSort => (sort?.key === key ? sort.dir : "none");
  const toggleSort = (key: SortKey) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const openModal = (kind: "role" | "delete", id: string) => {
    setError(null);
    setModal({ kind, id });
  };

  const close = () => {
    if (busy) return;
    setModal(null);
    setError(null);
  };

  const done = (text: string) => {
    setModal(null);
    setError(null);
    setToast({ key: Date.now(), text });
  };

  const submitInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const emails = normalizeEmails(email);
    if (emails.length === 0) {
      setInviteError("초대할 이메일을 넣어 주세요");
      return;
    }
    const bad = emails.filter((x) => !isValidEmail(x));
    if (bad.length > 0) {
      setInviteError(`이메일 주소를 확인해 주세요 (${bad.join(", ")})`);
      return;
    }
    setInviteError(null);
    startTransition(async () => {
      const res = await inviteMembersAction({ emails, role: inviteRole });
      if (res.ok) {
        setEmail("");
        setToast({ key: Date.now(), text: `${res.count}명을 초대했어요` });
      } else setInviteError(res.error);
    });
  };

  const submitRole = (role: Role) => {
    if (busy || !target) return;
    if (role === target.role) {
      close();
      return;
    }
    const selfLeaves = Boolean(target.isSelf) && role !== "admin";
    const userId = target.id;
    setError(null);
    startTransition(async () => {
      const res = await changeMemberRoleAction({ userId, role });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (selfLeaves) {
        // 더는 admin 이 아니다 — 이 화면에 있을 수 없으므로 홈으로
        setLeaving(true);
        router.replace("/");
        router.refresh();
        return;
      }
      done("역할을 바꿨어요");
    });
  };

  const confirmDelete = () => {
    if (busy || !target) return;
    const userId = target.id;
    setError(null);
    startTransition(async () => {
      const res = await removeMemberAction({ userId });
      if (res.ok) done("사용자를 삭제했어요");
      else setError(res.error);
    });
  };

  const memberColumns: DataTableColumn[] = [
    { key: "name", label: "이름", width: MEMBER_W.name, sort: sortOf("name"), onSort: () => toggleSort("name") },
    { key: "role", label: "역할", width: MEMBER_W.role, sort: sortOf("role"), onSort: () => toggleSort("role") },
    { key: "joined", label: "가입일", width: MEMBER_W.joined, sort: sortOf("joined"), onSort: () => toggleSort("joined") },
    { key: "more", label: "", width: MEMBER_W.more, align: "end" },
  ];
  const inviteColumns: DataTableColumn[] = [
    { key: "email", label: "이메일", width: INVITE_W.email },
    { key: "role", label: "역할", width: INVITE_W.role },
    { key: "invited", label: "초대일", width: INVITE_W.invited },
    { key: "status", label: "상태", width: INVITE_W.status },
  ];

  return (
    <div className={styles.deskPage}>
      <div className={styles.deskHead} data-name="page-head">
        <div className={styles.deskTitleBlock}>
          <div className={styles.deskTitleRow}>
            <h1 className={styles.deskTitle}>사용자</h1>
            <span className={styles.deskCount}>{total}명</span>
          </div>
          <p className={styles.deskCountLine}>
            학생 {counts.student} · 교사 {counts.teacher} · admin {counts.admin}
          </p>
        </div>
        <form className={styles.deskInvite} onSubmit={submitInvite} noValidate aria-label="사용자 초대">
          <TextInput
            id={emailId}
            className={styles.deskInviteEmail}
            type="email"
            inputMode="email"
            autoComplete="off"
            aria-label="초대할 이메일"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setInviteError(null);
            }}
          />
          <SegmentedControl
            label="초대 역할"
            size="sm"
            options={INVITE_ROLES}
            value={inviteRole}
            onChange={(v) => setInviteRole(v === "teacher" ? "teacher" : "student")}
          />
          <ButtonPrimary type="submit" disabled={busy}>
            초대
          </ButtonPrimary>
          <ButtonPillSoft
            onClick={() => {
              void onCopyLink().then(setLinkNotice);
            }}
          >
            초대 링크 복사
          </ButtonPillSoft>
        </form>
      </div>
      {inviteError || linkNotice ? (
        <p className={styles.deskNotice} role={inviteError ? "alert" : "status"}>
          {inviteError ?? linkNotice}
        </p>
      ) : null}

      <section data-component="user-manage" className={styles.deskManage} aria-label={`${schoolName} 사용자`} aria-busy={busy || undefined}>
        <div className={styles.deskToolbar} data-name="toolbar">
          <TextInput
            className={styles.deskSearch}
            icon="search"
            type="search"
            placeholder="이름 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <h2 id={membersId} className={styles.deskSection}>
          멤버
        </h2>
        <DataTable
          label="멤버"
          columns={memberColumns}
          empty={shown.length === 0 ? <EmptyStateCard variant="outlined" title="찾는 사용자가 없어요" /> : undefined}
        >
          {shown.map((m) => {
            const current = Boolean(m.isSelf) || target?.id === m.id;
            const items = [
              { label: "역할 바꾸기", onSelect: () => openModal("role", m.id) },
              ...(m.isSelf ? [] : [{ label: "삭제", onSelect: () => openModal("delete", m.id) }]),
            ];
            return (
              <DataTableRow key={m.id} selected={current}>
                <DataTableCell strong={current}>
                  <span className={styles.deskName}>
                    <span className={styles.deskNameText}>{m.name}</span>
                    {m.isSelf ? <span className={styles.deskMe}>나</span> : null}
                  </span>
                </DataTableCell>
                <DataTableCell>{ROLE_LABEL[m.role]}</DataTableCell>
                <DataTableCell tone={m.joinedOn ? "default" : "muted"}>{m.joinedOn ?? "-"}</DataTableCell>
                <DataTableCell align="end">
                  {/* 마지막 admin 은 역할도 삭제도 바꿀 수 없다 — 더보기 없음 (시안 본인 행 empty-cell) */}
                  {m.isLastAdmin ? null : <DataTableRowMenu label={`${m.name} 더보기`} items={items} disabled={busy} />}
                </DataTableCell>
              </DataTableRow>
            );
          })}
        </DataTable>

        {invites.length > 0 ? (
          <>
            <h2 id={invitesId} className={styles.deskSection}>
              초대 대기 ({invites.length})
            </h2>
            <DataTable label="초대 대기" columns={inviteColumns}>
              {invites.map((v) => (
                <DataTableRow key={v.id}>
                  <DataTableCell>{v.email}</DataTableCell>
                  <DataTableCell>{v.role ? ROLE_LABEL[v.role] : "-"}</DataTableCell>
                  <DataTableCell>{v.invitedAt}</DataTableCell>
                  <DataTableCell>대기</DataTableCell>
                </DataTableRow>
              ))}
            </DataTable>
          </>
        ) : null}

        <p className={styles.deskFootnote}>같은 학교({schoolName}) 계정만 초대할 수 있어요</p>
      </section>

      {target && modal ? (
        <div className={styles.deskModal}>
          {modal.kind === "role" ? (
            <RoleChangeSheet
              key={`${target.id}:${target.role}`}
              closeIcon
              onClose={close}
              name={target.name}
              currentRole={target.role}
              isSelf={target.isSelf}
              isLastAdmin={target.isLastAdmin}
              pending={busy}
              error={error}
              onSubmit={submitRole}
              onDelete={target.isSelf ? undefined : () => openModal("delete", target.id)}
            />
          ) : (
            <DeleteConfirm
              key={target.id}
              closeIcon
              name={target.name}
              pending={busy}
              error={error}
              onCancel={close}
              onConfirm={confirmDelete}
              onClose={close}
            />
          )}
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
