"use client";

import { forwardRef } from "react";
import { Icon } from "@/components/icons";
import styles from "./styles.module.css";

type Props = {
  /** 메뉴 시트가 열려 있음 (열림 = highlight-soft 채움, 시안 13-menu-mobile) */
  open?: boolean;
  /** mobile-menu-sheet 의 id */
  controls?: string;
  onClick?: () => void;
  className?: string;
};

/**
 * 모바일 전체 메뉴 버튼 (rules 1.28 mobile_menu.button, 시안 13-mobile · 13-menu-mobile mobile-menu-button):
 * 로그인 후 모바일 nav-pill 맨 왼쪽 ☰ — 44×44 동그란 아이콘 버튼, 글자 없음, 아이콘 20 ink. 화면 2~13·16·17 모바일 기본 화면만.
 * 데스크톱(사이드바가 있는 폭)에서는 그리지 않는다.
 */
export const MobileMenuButton = forwardRef<HTMLButtonElement, Props>(function MobileMenuButton({ open = false, controls, onClick, className }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      data-component="mobile-menu-button"
      className={[styles.button, open ? styles.open : "", className ?? ""].filter(Boolean).join(" ")}
      aria-label="전체 메뉴"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={open ? controls : undefined}
      onClick={onClick}
    >
      <Icon name="menu" className={styles.icon} />
    </button>
  );
});
