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
  /** 바깥 틀의 data-component (기본 reagent-more-menu). null = 붙이지 않음 (화면 17 센서 ⋯ — 바깥 sensor-delete 가 이름을 가진다) */
  component?: string | null;
  /** ⋯ 버튼 ref (확인 모달을 닫은 뒤 포커스를 돌려줄 곳) */
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
  /**
   * true = 메뉴를 화면 기준(fixed)으로 버튼 아래 오른쪽 맞춤에 둔다 — 모서리를 자르는 표 틀·목록 안(화면 8 초대 대기 행 invite-more-menu)에서
   * 메뉴가 잘리지 않게. 스크롤·창 크기가 바뀌면 닫힌다 (data-table 행 더보기와 같은 방식). 기본 false = 버튼 기준(absolute)
   */
  fixed?: boolean;
};

/**
 * 시약 더보기 (디자인 1.25 reagent-more-menu, 화면 3): 44 원형 버튼(⋯ 20, 열리면 highlight-soft 채움) → 아래 오른쪽 맞춤 작은 메뉴
 * (colors.canvas 바탕 · rounded.md · hairline-soft 테두리 · 그림자 없음). 교사·admin 에게만 그린다 (R5, 둘러보기 숨김).
 * 모바일 = reagent-detail-card 오른쪽 위, 데스크톱 = detail-drawer 머리 × 왼쪽.
 * 키보드: ↓↑ 로 항목 이동, Esc 로 메뉴만 닫고 버튼으로. 바깥을 누르면 닫힌다.
 */
export function ReagentMoreMenu({
  children,
  label = "더보기",
  defaultOpen = false,
  className,
  component = "reagent-more-menu",
  buttonRef: outerButtonRef,
  fixed = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerButtonRef = useRef<HTMLButtonElement>(null);
  const buttonRef = outerButtonRef ?? innerButtonRef;
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const buttonId = `${menuId}-button`;

  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      if (e.target instanceof Node && wrapRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const shut = () => setOpen(false);
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", outside);
      document.addEventListener("focusin", outside);
    }, 0);
    if (fixed) {
      window.addEventListener("scroll", shut, true);
      window.addEventListener("resize", shut);
    }
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      window.removeEventListener("scroll", shut, true);
      window.removeEventListener("resize", shut);
    };
  }, [open, fixed]);

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']:not([disabled])") ?? []);

  const show = () => {
    if (fixed) {
      const r = buttonRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
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

  const body = (
    <>
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
          className={[styles.menu, fixed ? styles.menuFixed : ""].filter(Boolean).join(" ")}
          style={fixed && pos ? { top: pos.top, right: pos.right } : undefined}
          onClick={(e) => {
            if ((e.target as Element).closest("[role='menuitem']")) setOpen(false);
          }}
        >
          {children}
        </div>
      ) : null}
    </>
  );
  const wrapClass = [styles.wrap, className ?? ""].filter(Boolean).join(" ");
  return component === "reagent-more-menu" ? (
    <div ref={wrapRef} data-component="reagent-more-menu" className={wrapClass} onKeyDown={onKeyDown}>
      {body}
    </div>
  ) : (
    <div ref={wrapRef} data-component={component ?? undefined} className={wrapClass} onKeyDown={onKeyDown}>
      {body}
    </div>
  );
}
