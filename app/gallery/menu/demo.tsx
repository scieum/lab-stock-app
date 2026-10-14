"use client";

import { useState } from "react";
import { InviteCancel, InviteCancelConfirm } from "@/components/invite-cancel";
import { InviteMoreMenu } from "@/components/invite-more-menu";
import styles from "../gallery.module.css";

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
