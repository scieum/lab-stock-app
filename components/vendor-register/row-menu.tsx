"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import styles from "./styles.module.css";

type Props = {
  /** 판매처명 — 더보기 버튼 이름 "{판매처명} 더보기" */
  name: string;
  /** 처음부터 펼쳐 둔다 (갤러리) */
  defaultOpen?: boolean;
  disabled?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
};

/**
 * 판매처 행 더보기 메뉴 ("수정" · "삭제"). 시안에는 아이콘만 있어 새 data-component 이름을 만들지 않는다 —
 * nav-pill 계정 메뉴(components/nav-account-menu)와 같은 접근성 패턴의 일반 버튼·목록이다.
 */
export function VendorRowMenu({ name, defaultOpen = false, disabled, onEdit, onDelete }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  // 처음부터 펼친 예시(defaultOpen)는 포커스를 가져가지 않는다
  const focusOnOpen = useRef(false);
  const menuId = useId();
  const buttonId = `${menuId}-button`;

  useEffect(() => {
    if (open && focusOnOpen.current) {
      // 마지막 행의 메뉴가 하단 고정 줄·tab-bar 뒤에 가려지지 않게 (여유는 .menu 의 scroll-margin)
      menuRef.current?.scrollIntoView({ block: "nearest" });
      itemRefs.current[0]?.focus({ preventScroll: true });
    }
    focusOnOpen.current = false;
  }, [open]);

  // 바깥을 누르거나 포커스가 밖으로 나가면 닫는다 (포커스는 누른 곳에 그대로 둔다)
  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      if (e.target instanceof Node && wrapRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    // 다음 틱부터 듣는다 — 같은 순간에 뜬 다른 요소(카드)가 포커스를 가져가는 것으로는 닫히지 않게
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

  const show = () => {
    focusOnOpen.current = true;
    setOpen(true);
  };

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus({ preventScroll: true });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && open) {
      // 이 메뉴만 닫는다 (뒤에 열린 카드까지 같이 닫히지 않게)
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
    const items = itemRefs.current.filter((el): el is HTMLButtonElement => el !== null);
    if (items.length === 0) return;
    const at = items.findIndex((el) => el === document.activeElement);
    let next = -1;
    if (e.key === "ArrowDown") next = at < 0 ? 0 : (at + 1) % items.length;
    else if (e.key === "ArrowUp") next = at < 0 ? items.length - 1 : (at - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    if (next < 0) return;
    e.preventDefault();
    items[next].focus({ preventScroll: true });
  };

  const run = (action?: () => void) => {
    close(true);
    action?.();
  };

  return (
    <span ref={wrapRef} className={styles.menuWrap} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        className={styles.moreButton}
        aria-label={`${name} 더보기`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
      >
        <Icon name="more" className={styles.moreIcon} />
      </button>
      {open ? (
        <div ref={menuRef} id={menuId} role="menu" aria-labelledby={buttonId} className={styles.menu}>
          <button
            ref={(el) => {
              itemRefs.current[0] = el;
            }}
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => run(onEdit)}
          >
            수정
          </button>
          <button
            ref={(el) => {
              itemRefs.current[1] = el;
            }}
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => run(onDelete)}
          >
            삭제
          </button>
        </div>
      ) : null}
    </span>
  );
}
