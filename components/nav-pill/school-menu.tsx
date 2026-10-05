"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import styles from "./styles.module.css";

type Props = {
  /** 자기 학교 이름 — 버튼 글자로 한 번만 나온다 (메뉴 안에 되풀이하지 않는다) */
  schoolName: string;
  /** "로그아웃" 을 눌렀을 때. Promise 를 돌려주면 끝날 때까지 다시 누를 수 없고, 실패하면 안내를 보여 준다 */
  onLogout: () => void | Promise<void>;
};

/**
 * nav-pill 학교명 메뉴 (d7 §10): 학교명을 누르면 작은 메뉴가 열리고 "로그아웃" 1개가 있다.
 * 시안에 없는 요소라 새 data-component 이름을 만들지 않는다 — nav-pill 안의 일반 버튼·목록이다.
 * 학교 전환은 없다 (메뉴에 학교 목록 없음).
 */
export function SchoolMenu({ schoolName, onLogout }: Props) {
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
      await onLogout();
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
    <span ref={wrapRef} className={styles.schoolMenu} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        className={styles.schoolButton}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.schoolText}>{schoolName}</span>
        <Icon name={open ? "chevron-up" : "chevron-down"} className={styles.schoolChevron} />
      </button>
      {open ? (
        <div id={menuId} role="menu" aria-labelledby={buttonId} className={styles.menu}>
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
