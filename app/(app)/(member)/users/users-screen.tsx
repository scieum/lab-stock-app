"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/ex-toast";
import {
  DeleteConfirm,
  InviteSheet,
  RoleChangeSheet,
  UserManage,
  type InviteSubmit,
  type UserManageInvite,
  type UserManageMember,
} from "@/components/user-manage";
import type { Role } from "@/lib/types";
import { changeMemberRoleAction, inviteMembersAction, removeMemberAction } from "./actions";
import styles from "./users.module.css";

type Props = {
  schoolName: string;
  /** 같은 학교 멤버 (가입순) */
  members: UserManageMember[];
  counts: { student: number; teacher: number; admin: number };
  /** 대기 중인 초대 (초대일은 서버가 만든 글자) */
  invites: UserManageInvite[];
};

/** 열려 있는 시트 — 한 번에 하나 */
type Sheet = { kind: "invite" } | { kind: "role"; id: string } | { kind: "delete"; id: string } | null;

/** 저장 후 토스트를 보여 주는 시간 */
const TOAST_MS = 4000;
/** "초대 링크 복사" 가 복사하는 주소 = 회원가입(화면 14) */
const SIGNUP_PATH = "/signup";

/** navigator.clipboard 를 못 쓰는 환경(권한 거부·보안 컨텍스트 아님)의 대체 복사 */
function copyWithSelection(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.setAttribute("aria-hidden", "true");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  try {
    area.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

/**
 * 화면 8 사용자 관리 (admin 전용).
 * 시안: (데스크톱 screen-title) → manage-layout = user-manage + 누른 행의 ex-modal-card
 *       (모바일: tab-bar 위 하단 시트 / 데스크톱: 본문 옆 열).
 * 초대·역할 변경·삭제 → 서버 액션 → ex-toast → 목록으로(서버가 목록을 다시 내려 준다).
 * 시트는 비모달이다 — 뒤 목록을 계속 조작할 수 있다. 닫기: Esc · 같은 행(또는 "초대") 다시 누르기 · 시트의 닫기(×).
 * 학교·호출자 역할 값은 보내지 않는다.
 */
export function UsersScreen({ schoolName, members, counts, invites }: Props) {
  const router = useRouter();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkNotice, setLinkNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<{ key: number; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  // 본인 역할을 바꿔 / 로 옮겨 가는 동안에도 다시 누르지 못하게 잠근다
  const [leaving, setLeaving] = useState(false);
  const busy = pending || leaving;

  const pageRef = useRef<HTMLDivElement>(null);
  const sideRef = useRef<HTMLDivElement>(null);
  /** 시트를 연 요소 (멤버 행 · "초대") — 닫으면 포커스를 돌려준다 */
  const opener = useRef<HTMLElement | null>(null);

  // 시트 대상 멤버 — 목록에서 사라졌으면(삭제됨 등) 시트도 닫힌 것으로 본다
  const target = sheet && sheet.kind !== "invite" ? (members.find((m) => m.id === sheet.id) ?? null) : null;
  const open: Sheet = sheet && sheet.kind !== "invite" && !target ? null : sheet;
  const openKey = open ? (open.kind === "invite" ? "invite" : `${open.kind}:${open.id}`) : null;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  // 모바일(하단 시트): 시트 높이만큼 본문 아래를 비워 마지막 행·유의사항까지 시트 위로 올릴 수 있게 하고,
  // 누른 행이 시트에 가려졌으면 시트 위로 올린다. 데스크톱(옆 열)에서는 아무것도 하지 않는다.
  useEffect(() => {
    const page = pageRef.current;
    const card = sideRef.current?.firstElementChild;
    if (!page || !openKey || !(card instanceof HTMLElement)) return;
    const isSheet = () => getComputedStyle(card).position === "fixed";
    const apply = () => {
      if (isSheet()) page.style.setProperty("--users-sheet-space", `${Math.ceil(card.getBoundingClientRect().height)}px`);
      else page.style.removeProperty("--users-sheet-space");
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(card);
    window.addEventListener("resize", apply);
    const from = opener.current;
    if (isSheet() && from && from.isConnected) {
      const hidden = from.getBoundingClientRect().bottom - card.getBoundingClientRect().top;
      if (hidden > 0) window.scrollBy({ top: hidden + from.offsetHeight / 4 });
    }
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
      page.style.removeProperty("--users-sheet-space");
    };
  }, [openKey]);

  const rememberOpener = () => {
    const el = document.activeElement;
    // 시트 안에서 넘어온 경우(삭제 확인 등)는 처음 연 요소를 그대로 둔다
    if (el instanceof HTMLElement && el !== document.body && !sideRef.current?.contains(el)) opener.current = el;
  };

  const close = () => {
    if (busy) return;
    const el = opener.current;
    if (el && el.isConnected) el.focus({ preventScroll: true });
    setSheet(null);
    setError(null);
  };

  const toggleInvite = () => {
    if (busy) return;
    if (open?.kind === "invite") {
      close();
      return;
    }
    rememberOpener();
    setError(null);
    setLinkNotice(null);
    setSheet({ kind: "invite" });
  };

  const toggleMember = (m: UserManageMember) => {
    if (busy) return;
    if (open && open.kind !== "invite" && open.id === m.id) {
      close();
      return;
    }
    rememberOpener();
    setError(null);
    setSheet({ kind: "role", id: m.id });
  };

  const copyLink = async () => {
    const url = `${window.location.origin}${SIGNUP_PATH}`;
    let copied = false;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch {
      copied = copyWithSelection(url);
    }
    setLinkNotice(copied ? "링크를 복사했어요" : `복사하지 못했어요. 이 주소를 전달하세요: ${url}`);
  };

  const done = (text: string) => {
    const el = opener.current;
    if (el && el.isConnected) el.focus({ preventScroll: true });
    setSheet(null);
    setError(null);
    setToast({ key: Date.now(), text });
  };

  const submitInvite = (invite: InviteSubmit) => {
    if (busy) return;
    setError(null);
    startTransition(async () => {
      const res = await inviteMembersAction({ emails: invite.emails, role: invite.role });
      if (res.ok) done(`${res.count}명을 초대했어요`);
      else setError(res.error);
    });
  };

  const submitRole = (role: Role) => {
    if (busy || !target) return;
    // 같은 역할이면 요청 없이 닫는다
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
        // 더는 admin 이 아니다 — 이 화면에 있을 수 없으므로 홈으로 (새 역할의 nav·홈을 서버에서 다시 받는다)
        setLeaving(true);
        router.replace("/");
        router.refresh();
        return;
      }
      done("역할을 바꿨어요");
    });
  };

  const askDelete = () => {
    if (busy || !target) return;
    setError(null);
    setSheet({ kind: "delete", id: target.id });
  };

  const cancelDelete = () => {
    if (busy || !target) return;
    setError(null);
    setSheet({ kind: "role", id: target.id });
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

  return (
    <div ref={pageRef} className={styles.page}>
      <h1 className={styles.title}>사용자 관리</h1>

      <div className={styles.layout} data-name="manage-layout">
        <div className={styles.main} aria-busy={pending ? true : undefined}>
          <UserManage
            schoolName={schoolName}
            members={members}
            invites={invites}
            counts={counts}
            selectedId={target && open ? target.id : null}
            onInvite={toggleInvite}
            onSelectMember={toggleMember}
          />
        </div>

        <div ref={sideRef} className={styles.side}>
          {open?.kind === "invite" ? (
            <InviteSheet
              modal={false}
              closeIcon
              onClose={close}
              pending={busy}
              error={error}
              onCopyLink={copyLink}
              linkNotice={linkNotice}
              onSubmit={submitInvite}
            />
          ) : null}
          {open?.kind === "role" && target ? (
            <RoleChangeSheet
              key={`${target.id}:${target.role}`}
              modal={false}
              closeIcon
              onClose={close}
              name={target.name}
              currentRole={target.role}
              isSelf={target.isSelf}
              isLastAdmin={target.isLastAdmin}
              pending={busy}
              error={error}
              onSubmit={submitRole}
              onDelete={askDelete}
            />
          ) : null}
          {open?.kind === "delete" && target ? (
            <DeleteConfirm
              key={target.id}
              modal={false}
              closeIcon
              name={target.name}
              pending={busy}
              error={error}
              onCancel={cancelDelete}
              onConfirm={confirmDelete}
              onClose={close}
            />
          ) : null}
        </div>
      </div>

      {toast ? (
        <Toast key={toast.key} floating>
          {toast.text}
        </Toast>
      ) : null}
    </div>
  );
}
