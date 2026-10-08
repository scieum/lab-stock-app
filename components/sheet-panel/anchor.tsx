"use client";

import { useLayoutEffect, useRef } from "react";
import { DESKTOP_MEDIA_QUERY } from "@/lib/breakpoints";
import styles from "./styles.module.css";

/** 화면 가장자리·아래 고정 줄과 띄우는 거리 · 누른 곳과 창 사이 */
const EDGE = 16;
const GAP = 8;

type Placement = "above" | "side";

type Props = {
  /** 창을 붙일 요소 (누른 버튼 · 칸). 없으면 화면 가운데(시트 기본 자리) */
  anchor: () => HTMLElement | null;
  /**
   * above = 누른 것 위(왼쪽 끝 맞춤, 자리가 없으면 아래) — 시안 7-msds-desktop (MSDS 찾기 버튼 위 후보 창).
   * side = 누른 것 오른쪽(자리가 없으면 왼쪽), 세로는 가운데 맞춤 — 시안 11-slot-desktop (칸 옆 칸 시트).
   */
  placement: Placement;
  /** 아래 고정 줄(bottom-bar 80)이 있으면 그만큼 아래를 피한다 */
  avoidBottomBar?: boolean;
  /** 바뀌면 다시 잰다 (다른 칸을 눌러 같은 자리의 창 내용·붙일 곳이 바뀔 때) */
  positionKey?: string;
  children: React.ReactNode;
};

/**
 * 데스크톱 고르기 창 = 팝오버 (rules.json 1.24 desktop_shell.overlay — 모바일 바텀시트는 데스크톱 드롭다운·팝오버).
 * 안쪽 SheetPanel(시트)을 누른 요소 옆에 띄운다 — 위치는 화면 좌표(fixed)로 재서 CSS 변수로 넘긴다 (스크롤·창 크기·창 높이가 바뀌면 다시 잰다).
 * 모바일(< 1024)은 아무것도 하지 않는다 — 시트는 지금처럼 tab-bar 위 하단 시트.
 * 묶음 자체는 display: contents (배치에 끼어들지 않는다). 시안 컴포넌트가 아니라 data-component 는 없다.
 */
export function SheetAnchor({ anchor, placement, avoidBottomBar = false, positionKey, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const anchorRef = useRef(anchor);
  useLayoutEffect(() => {
    anchorRef.current = anchor;
  });

  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const mq = window.matchMedia(DESKTOP_MEDIA_QUERY);
    let frame = 0;

    const place = () => {
      frame = 0;
      const panel = box.querySelector<HTMLElement>("[role='dialog']");
      const target = anchorRef.current();
      if (!mq.matches || !panel) {
        box.removeAttribute("data-placed");
        return;
      }
      const p = panel.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      // 붙일 곳을 잃었으면(다시 그려지는 중 등) 화면 가운데
      const a =
        target && target.isConnected
          ? target.getBoundingClientRect()
          : new DOMRect((vw - p.width) / 2, (vh - p.height) / 2, p.width, p.height);
      const bar = avoidBottomBar ? document.querySelector<HTMLElement>("[data-name='bottom-bar']:not([data-inline])") : null;
      const bottomLimit = (bar && bar.getClientRects().length > 0 ? bar.getBoundingClientRect().top : vh) - EDGE;
      const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max));

      let top: number;
      let left: number;
      if (!target || !target.isConnected) {
        top = a.top;
        left = a.left;
      } else if (placement === "above") {
        top = a.top - GAP - p.height;
        if (top < EDGE) top = a.bottom + GAP;
        left = a.left;
      } else {
        left = a.right + GAP;
        if (left + p.width > vw - EDGE) left = a.left - GAP - p.width;
        top = a.top + a.height / 2 - p.height / 2;
      }
      top = clamp(top, EDGE, Math.max(EDGE, bottomLimit - p.height));
      left = clamp(left, EDGE, Math.max(EDGE, vw - EDGE - p.width));
      box.style.setProperty("--popover-top", `${Math.round(top)}px`);
      box.style.setProperty("--popover-left", `${Math.round(left)}px`);
      box.style.setProperty("--popover-max-height", `${Math.max(0, Math.round(bottomLimit - EDGE))}px`);
      box.setAttribute("data-placed", "");
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(place);
    };

    place();
    const panel = box.querySelector<HTMLElement>("[role='dialog']");
    const ro = new ResizeObserver(schedule);
    if (panel) ro.observe(panel);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    mq.addEventListener("change", schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      mq.removeEventListener("change", schedule);
    };
  }, [placement, avoidBottomBar, positionKey]);

  return (
    <div ref={ref} className={styles.anchor} data-sheet-placement="anchor">
      {children}
    </div>
  );
}
