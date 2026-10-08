"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import styles from "./styles.module.css";

type Props = {
  /** 자기 학교 이름 — 버튼 글자로 한 번만 나온다 (메뉴 안에 되풀이하지 않는다) */
  schoolName: string;
  /**
   * "로그아웃" 을 눌렀을 때. Promise 를 돌려주면 끝날 때까지 다시 누를 수 없고, 실패하면 안내를 보여 준다.
   * 없으면 메뉴만 열리고 닫힌다 (갤러리 정적 예시).
   */
  onLogout?: () => void | Promise<void>;
  /**
   * "nav"(기본) = nav-pill 학교명 옆 ▾, 메뉴는 아래로.
   * "sidebar" = 데스크톱 app-sidebar 맨 아래 계정 줄(시안 1.22 sidebar-account: 글자 13 + 오른쪽 끝 ▾ 20) — 줄 전체가 버튼, 메뉴는 위로.
   * 메뉴 내용·동작(로그아웃 1개, d7 §10)은 같다.
   */
  variant?: "nav" | "sidebar";
  /** 버튼 글자 (sidebar: "김OO · 교사"). 없으면 schoolName */
  label?: string;
};

/**
 * 계정 메뉴 (디자인 1.15 nav-account-menu, d7 §10 · rules.json app_exceptions): nav-pill 학교명 옆 작은 ▾.
 * 학교명 + ▾ 를 누르면 작은 메뉴가 열리고 "로그아웃" 1개가 있다. 학교 전환은 없다 (메뉴에 학교 목록 없음).
 *
 * data-component="nav-account-menu" 는 ▾ 자리에 붙인다 — 시안의 nav-account-menu 노드가 학교명 옆 ▾(icon-caret)만 감싸고
 * 닫힌 상태 프레임에도 1개 있다(늘 DOM 에 있는 요소). 누름 버튼(학교명 + ▾, aria-haspopup=menu)과 열린 메뉴(role=menu)는
 * 그 바깥 — 버튼의 가장 가까운 data-component 는 nav-pill 그대로다.
 */
export function NavAccountMenu({ schoolName, onLogout, variant = "nav", label }: Props) {
  const sidebar = variant === "sidebar";
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRef = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const menuId = useId();
  const buttonId = `${menuId}-button`;

  // 열리면 메뉴 항목으로 포커스
  useEffect(() => {
    if (open) itemRef.current?.focus({ preventScroll: true });
  }, [open]);

  // 바깥을 누르거나 포커스가 밖으로 나가면 닫는다 (포커스는 누른 곳에 그대로 둔다)
  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      if (e.target instanceof Node && wrapRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
    };
  }, [open]);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus({ preventScroll: true });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && open) {
      // 이 메뉴만 닫는다 (뒤에 열린 시트까지 같이 닫히지 않게)
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      close(true);
      return;
    }
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp") && e.target === buttonRef.current) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (open && ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
      // 항목이 하나뿐이라 늘 그 항목
      e.preventDefault();
      itemRef.current?.focus({ preventScroll: true });
    }
  };

  const logout = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setFailed(false);
    setPending(true);
    try {
      await onLogout?.();
      // 성공하면 보통 화면이 바뀐다. 남아 있는 경우에 대비해 메뉴를 닫고 학교명 버튼으로 돌아간다
      close(true);
    } catch {
      setFailed(true);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return (
    <span ref={wrapRef} className={sidebar ? styles.accountMenu : styles.schoolMenu} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        className={sidebar ? styles.accountButton : styles.schoolButton}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.schoolText}>{label ?? schoolName}</span>
        <span data-component="nav-account-menu" className={sidebar ? styles.accountCaret : styles.caret} aria-hidden="true">
          <Icon name="caret-down" className={styles.caretIcon} />
        </span>
      </button>
      {open ? (
        <div id={menuId} role="menu" aria-labelledby={buttonId} className={sidebar ? styles.menuUp : styles.menu}>
          <button
            ref={itemRef}
            type="button"
            role="menuitem"
            className={styles.menuItem}
            disabled={pending}
            aria-busy={pending || undefined}
            onClick={logout}
          >
            로그아웃
          </button>
          {failed ? (
            <p className={styles.menuError} role="alert">
              로그아웃하지 못했어요. 다시 시도하세요.
            </p>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}
