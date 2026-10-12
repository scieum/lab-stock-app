"use client";

import { ReagentMoreMenu } from "@/components/reagent-more-menu";
import styles from "./styles.module.css";

type Props = {
  /** 초대 이메일 — 버튼 이름 "{이메일} 초대 더보기" */
  email: string;
  /** 메뉴 항목 (invite-cancel) */
  children: React.ReactNode;
  /** 갤러리 — 처음부터 열린 메뉴 */
  defaultOpen?: boolean;
  /** ⋯ 버튼 ref (확인 모달을 닫은 뒤 포커스를 돌려줄 곳) */
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
  className?: string;
};

/**
 * 초대 대기 행 더보기 (rules 1.28 invite_cancel.entry, 시안 8 · 8-invite-cancel invite-more-menu):
 * reagent-more-menu 와 같은 44 원형 ⋯ 버튼(열리면 highlight-soft) + 작은 메뉴. admin 만.
 * 모바일 = 초대 카드 오른쪽 위, 데스크톱 = data-table 마지막 열.
 */
export function InviteMoreMenu({ email, children, defaultOpen, buttonRef, className }: Props) {
  return (
    <div data-component="invite-more-menu" className={[styles.wrap, className ?? ""].filter(Boolean).join(" ")}>
      <ReagentMoreMenu component={null} label={`${email} 초대 더보기`} defaultOpen={defaultOpen} buttonRef={buttonRef}>
        {children}
      </ReagentMoreMenu>
    </div>
  );
}
