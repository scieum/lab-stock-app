"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { LinkPending } from "@/components/link-pending";
import { linkPrefetch } from "@/lib/link-prefetch";
import styles from "./styles.module.css";

export type CabinetSwitcherItem = {
  id: string;
  /** 시약장 이름 ("1번 시약장") */
  label: string;
  /** 있으면 링크(`/cabinets?c={id}`), 없으면 버튼(onSelect) */
  href?: string;
};

type Props = {
  items: CabinetSwitcherItem[];
  /** 지금 보고 있는 시약장 (한 번에 하나만 활성) */
  activeId?: string;
  /** href 가 없는 pill 을 눌렀을 때 */
  onSelect?: (id: string) => void;
  /** 줄 끝에 고정되는 자리 (cabinet-add — 학생 화면에는 넘기지 않는다) */
  children?: React.ReactNode;
  /** 읽기 도구용 이름 */
  label?: string;
};

/**
 * 시약장 전환 pill 한 줄 (화면 11). 시약장마다 pill 1개, 넘치면 가로 스크롤, 끝에 cabinet-add 자리.
 * 활성 pill 은 aria-current="true" — 누르는 동안·이동 중인 pill 은 모양만 먼저 활성으로 바뀐다.
 */
export function CabinetSwitcher({ items, activeId, onSelect, children, label = "시약장" }: Props) {
  const listRef = useRef<HTMLUListElement>(null);

  // 활성 pill 이 스크롤 밖에 있으면 줄 안에서만 옮겨 보여 준다 (페이지 세로 스크롤은 건드리지 않는다)
  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!list || !active) return;
    const l = list.getBoundingClientRect();
    const a = active.getBoundingClientRect();
    if (a.left < l.left) list.scrollLeft -= l.left - a.left;
    else if (a.right > l.right) list.scrollLeft += a.right - l.right;
  }, [activeId, items.length]);

  return (
    <nav data-component="cabinet-switcher" className={styles.switcher} aria-label={label}>
      <ul ref={listRef} className={styles.list}>
        {items.map((item) => {
          const active = item.id === activeId;
          const cls = active ? styles.pillActive : styles.pill;
          return (
            <li key={item.id} className={styles.item}>
              {item.href ? (
                <Link
                  href={item.href}
                  prefetch={linkPrefetch(item.href)}
                  scroll={false}
                  className={cls}
                  aria-current={active ? "true" : undefined}
                >
                  <span className={styles.label}>{item.label}</span>
                  <LinkPending />
                </Link>
              ) : (
                <button
                  type="button"
                  className={cls}
                  aria-current={active ? "true" : undefined}
                  onClick={onSelect ? () => onSelect(item.id) : undefined}
                >
                  <span className={styles.label}>{item.label}</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {children ? <div className={styles.end}>{children}</div> : null}
    </nav>
  );
}
