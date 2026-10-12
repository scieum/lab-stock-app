"use client";

import { usePathname } from "next/navigation";
import { useId, useRef, useState } from "react";
import { MobileMenuButton } from "@/components/mobile-menu-button";
import { guestMobileMenu, guestSidebarActiveKey, mobileMenu, sidebarActiveKey, type SidebarRole } from "@/lib/sidebar-menu";
import { MOBILE_MENU_TEXT, MobileMenuSheet } from "./index";

type Props =
  | {
      /** 로그인 후 */
      role: SidebarRole;
      schoolName: string;
      account?: string;
      onLogout?: () => void | Promise<void>;
      guest?: undefined;
    }
  | {
      /** 둘러보기: 데모 학교 · 잠금 · 가입하기 */
      guest: { signupHref: string };
      role?: undefined;
      schoolName?: string;
      account?: undefined;
      onLogout?: undefined;
    };

/**
 * nav-pill 맨 왼쪽 ☰ + 전체 메뉴 시트 묶음 (rules 1.28 mobile_menu). 메뉴 항목·활성 = lib/sidebar-menu (데스크톱 사이드바와 같은 출처).
 * 화면 연결(nav-pill 에 넣기)은 D3.
 */
export function MobileMenu(props: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() ?? "/";
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const close = () => {
    setOpen(false);
    buttonRef.current?.focus({ preventScroll: true });
  };
  const guest = props.guest;
  return (
    <>
      <MobileMenuButton ref={buttonRef} open={open} controls={id} onClick={() => setOpen((o) => !o)} />
      {open ? (
        <MobileMenuSheet
          id={id}
          schoolName={guest ? (props.schoolName ?? MOBILE_MENU_TEXT.guestSchool) : props.schoolName}
          account={props.account}
          groups={guest ? guestMobileMenu() : mobileMenu(props.role)}
          active={guest ? guestSidebarActiveKey(pathname) : sidebarActiveKey(pathname)}
          onClose={close}
          onLogout={props.onLogout}
          guest={guest}
        />
      ) : null}
    </>
  );
}
