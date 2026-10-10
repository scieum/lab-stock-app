"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import styles from "./styles.module.css";

type Props = {
  /** 메뉴 항목 (reagent-delete 등) — 항목을 누르면 메뉴는 닫힌다 */
  children: React.ReactNode;
  /** 버튼 이름 ("{시약명} 더보기") */
  label?: string;
  /** 갤러리 예시 — 처음부터 열린 메뉴 */
  defaultOpen?: boolean;
  className?: string;
};

/**
 * 시약 더보기 (디자인 1.25 reagent-more-menu, 화면 3): 44 원형 버튼(⋯ 20, 열리면 highlight-soft 채움) → 아래 오른쪽 맞춤 작은 메뉴
 * (colors.canvas 바탕 · rounded.md · hairline-soft 테두리 · 그림자 없음). 교사·admin 에게만 그린다 (R5, 둘러보기 숨김).
 * 모바일 = reagent-detail-card 오른쪽 위, 데스크톱 = detail-drawer 머리 × 왼쪽.
 * 키보드: ↓↑ 로 항목 이동, Esc 로 메뉴만 닫고 버튼으로. 바깥을 누르면 닫힌다.
 */
export function ReagentMoreMenu({ children, label = "더보기", defaultOpen = false, className }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const buttonId = `${menuId}-button`;

  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      if (e.target instanceof Node && wrapRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", outside);
      document.addEventListener("focusin", outside);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
    };
  }, [open]);

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']:not([disabled])") ?? []);

  const show = () => {
    setOpen(true);
    window.requestAnimationFrame(() => items()[0]?.focus({ preventScroll: true }));
  };

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus({ preventScroll: true });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      close(true);
      return;
    }
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp") && e.target === buttonRef.current) {
      e.preventDefault();
      show();
      return;
    }
    if (!open) return;
    const list = items();
    if (list.length === 0) return;
    const at = list.findIndex((el) => el === document.activeElement);
    let next = -1;
    if (e.key === "ArrowDown") next = at < 0 ? 0 : (at + 1) % list.length;
    else if (e.key === "ArrowUp") next = at < 0 ? list.length - 1 : (at - 1 + list.length) % list.length;
    if (next < 0) return;
    e.preventDefault();
    list[next].focus({ preventScroll: true });
  };

  return (
    <div ref={wrapRef} data-component="reagent-more-menu" className={[styles.wrap, className ?? ""].filter(Boolean).join(" ")} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        className={[styles.button, open ? styles.buttonOpen : ""].filter(Boolean).join(" ")}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(false) : show())}
      >
        <Icon name="more" className={styles.icon} />
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-labelledby={buttonId}
          className={styles.menu}
          onClick={(e) => {
            if ((e.target as Element).closest("[role='menuitem']")) setOpen(false);
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
