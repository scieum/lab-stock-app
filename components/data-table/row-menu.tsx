"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import styles from "./styles.module.css";

export type RowMenuItem = { label: string; onSelect: () => void; disabled?: boolean };

type Props = {
  /** 더보기 버튼 이름 ("{이름} 더보기") */
  label: string;
  items: RowMenuItem[];
  disabled?: boolean;
};

/**
 * 표 행 끝 더보기 (시안 more-cell · more-menu: 하늘색 점 3개 아이콘 20, 누름 영역 44) → 작은 메뉴.
 * 메뉴는 표 틀(모서리 자르기) 밖으로 나오도록 화면 기준(fixed)으로 버튼 아래 오른쪽 맞춤에 둔다.
 * 키보드: ↓↑ Home End 로 항목 이동, Esc 로 이 메뉴만 닫고 버튼으로 돌아간다. 바깥을 누르거나 스크롤하면 닫힌다.
 */
export function DataTableRowMenu({ label, items, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const buttonId = `${menuId}-button`;

  const place = () => {
    const r = buttonRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
  };

  useEffect(() => {
    if (!open) return;
    itemRefs.current.find((el) => el && !el.disabled)?.focus({ preventScroll: true });
    const outside = (e: Event) => {
      if (e.target instanceof Node && wrapRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const shut = () => setOpen(false);
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", outside);
      document.addEventListener("focusin", outside);
    }, 0);
    window.addEventListener("scroll", shut, true);
    window.addEventListener("resize", shut);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      window.removeEventListener("scroll", shut, true);
      window.removeEventListener("resize", shut);
    };
  }, [open]);

  const show = () => {
    place();
    setOpen(true);
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
    const list = itemRefs.current.filter((el): el is HTMLButtonElement => el !== null && !el.disabled);
    if (list.length === 0) return;
    const at = list.findIndex((el) => el === document.activeElement);
    let next = -1;
    if (e.key === "ArrowDown") next = at < 0 ? 0 : (at + 1) % list.length;
    else if (e.key === "ArrowUp") next = at < 0 ? list.length - 1 : (at - 1 + list.length) % list.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = list.length - 1;
    if (next < 0) return;
    e.preventDefault();
    list[next].focus({ preventScroll: true });
  };

  return (
    <span ref={wrapRef} className={styles.menuWrap} onKeyDown={onKeyDown} data-name="more-menu">
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        className={styles.moreButton}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
      >
        <Icon name="more" className={styles.moreIcon} />
      </button>
      {open && pos ? (
        <div
          id={menuId}
          role="menu"
          aria-labelledby={buttonId}
          className={styles.menu}
          style={{ top: pos.top, right: pos.right }}
        >
          {items.map((item, i) => (
            <button
              key={item.label}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              className={styles.menuItem}
              disabled={item.disabled}
              onClick={() => {
                close(true);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
}
