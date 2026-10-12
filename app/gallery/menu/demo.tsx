"use client";

import { useState } from "react";
import { InviteCancel, InviteCancelConfirm } from "@/components/invite-cancel";
import { InviteMoreMenu } from "@/components/invite-more-menu";
import { MobileMenuButton } from "@/components/mobile-menu-button";
import { MobileMenuSheet } from "@/components/mobile-menu-sheet";
import { mobileMenu, sidebarAccountLabel } from "@/lib/sidebar-menu";
import styles from "../gallery.module.css";

/** ☰ 를 누르면 제자리 시트가 열리고 닫힘 (시안 13-mobile → 13-menu-mobile, admin) */
export function MobileMenuDemo() {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.stage}>
      <div className={styles.row}>
        <MobileMenuButton open={open} onClick={() => setOpen((o) => !o)} />
      </div>
      {open ? (
        <MobileMenuSheet
          schoolName="샘플고등학교"
          account={sidebarAccountLabel("정OO", "admin")}
          groups={mobileMenu("admin")}
          active="home"
          floating={false}
          onClose={() => setOpen(false)}
          onLogout={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

/** 초대 대기 행 ⋯ → 초대 취소 → 확인 카드 (시안 8-invite-cancel) */
export function InviteCancelDemo() {
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState(false);
  const email = "han@example.com";
  return (
    <div className={styles.stage}>
      {done ? null : (
        <div className={styles.row}>
          <span>{email}</span>
          <InviteMoreMenu email={email}>
            <InviteCancel onSelect={() => setConfirm(true)} />
          </InviteMoreMenu>
        </div>
      )}
      {confirm ? (
        <InviteCancelConfirm
          email={email}
          sheet={false}
          modal={false}
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false);
            setDone(true);
          }}
        />
      ) : null}
    </div>
  );
}
