"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { LinkPending } from "@/components/link-pending";
import { SegmentedControlActive } from "@/components/segmented-control-active";
import styles from "./styles.module.css";

export type InventoryKind = "reagents" | "sensors";

const STORAGE_KEY = "lab-stock.inventory";
const EVENT = "lab-stock-inventory";

function read(): InventoryKind {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "sensors" ? "sensors" : "reagents";
  } catch {
    return "reagents";
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** 마지막으로 고른 쪽을 기억한다 (rules tab_bar.sensor_entry "마지막 고른 쪽 기억") */
export function rememberInventory(kind: InventoryKind) {
  try {
    window.localStorage.setItem(STORAGE_KEY, kind);
  } catch {
    // 저장소를 못 쓰면 기억하지 않는다
  }
  window.dispatchEvent(new Event(EVENT));
}

/** 마지막으로 고른 쪽 (서버 렌더 · 첫 그림 = 시약) */
export function useLastInventory(): InventoryKind {
  return useSyncExternalStore(subscribe, read, () => "reagents");
}

/** 시약 탭이 갈 곳 — 마지막으로 고른 쪽 (base "/demo" = 둘러보기) */
export function inventoryHref(kind: InventoryKind, base: "" | "/demo" = ""): string {
  return `${base}/${kind}`;
}

type Props = {
  /** 지금 화면 */
  active: InventoryKind;
  /** 주소 앞머리 (둘러보기 "/demo") */
  base?: "" | "/demo";
  className?: string;
};

/**
 * 모바일 "시약" 탭 안 전환 (디자인 1.26 tab_bar.sensor_entry, inventory-switch): 화면 2·17 맨 위 segmented-control 모양
 * "시약 | 센서". 누르면 그 화면으로 가고, 마지막으로 고른 쪽을 기억해 하단 "시약" 탭이 그쪽으로 연다.
 */
export function InventorySwitch({ active, base = "", className }: Props) {
  // 지금 보고 있는 쪽을 기억한다 (다음에 "시약" 탭을 누르면 이쪽으로)
  useEffect(() => {
    rememberInventory(active);
  }, [active]);
  const items: { kind: InventoryKind; label: string }[] = [
    { kind: "reagents", label: "시약" },
    { kind: "sensors", label: "센서" },
  ];
  return (
    <nav
      data-component="inventory-switch"
      aria-label="시약 · 센서 전환"
      className={[styles.track, className ?? ""].filter(Boolean).join(" ")}
    >
      {items.map((it) =>
        it.kind === active ? (
          <SegmentedControlActive key={it.kind} role="link" aria-current="page" aria-selected={undefined} onClick={() => rememberInventory(it.kind)}>
            {it.label}
          </SegmentedControlActive>
        ) : (
          <Link
            key={it.kind}
            href={inventoryHref(it.kind, base)}
            className={styles.option}
            onClick={() => rememberInventory(it.kind)}
          >
            {it.label}
            <LinkPending />
          </Link>
        ),
      )}
    </nav>
  );
}
