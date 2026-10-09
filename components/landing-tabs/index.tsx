"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./styles.module.css";

export type LandingTab = { id: string; label: string };

type Props = {
  tabs: LandingTab[];
  className?: string;
};

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

/** 탭이 가리키는 섹션 중 지금 화면 위쪽(web-header + 탭 아래)을 지난 마지막 섹션 — 없으면 첫 탭 */
function currentTab(tabs: LandingTab[], bar: HTMLElement | null): string {
  const line = (bar?.getBoundingClientRect().bottom ?? 0) + 1;
  let current = tabs[0]?.id ?? "";
  for (const t of tabs) {
    const el = document.getElementById(t.id);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.top <= line + window.innerHeight / 3) current = t.id;
  }
  // 맨 아래까지 내려오면 마지막 탭
  if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
    const last = [...tabs].reverse().find((t) => document.getElementById(t.id));
    if (last) current = last.id;
  }
  return current;
}

/**
 * 랜딩 섹션 탭 (시안 15-desktop landing-tabs, rules.json 1.24 landing_rhythm.motion): 히어로 아래 접는 선 자리의 전폭 줄(높이 64,
 * 흰 바탕 + 위아래 hairline), 가운데 탭(15/600, 사이 32). 스크롤하면 web-header 바로 아래에 붙고(sticky),
 * 지금 보이는 섹션의 탭은 검정 글자 + 하늘색 밑줄 2, 나머지는 회색 글자. 탭을 누르면 그 섹션으로 (동작 줄이기면 바로 이동).
 */
export function LandingTabs({ tabs, className }: Props) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const barRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    let frame = 0;
    const update = () => {
      frame = 0;
      setActive(currentTab(tabs, bar));
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    frame = window.requestAnimationFrame(update);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [tabs]);

  const go = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    const reduce = window.matchMedia(REDUCE_QUERY).matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    window.history.replaceState(null, "", `#${id}`);
    setActive(id);
  };

  return (
    <nav ref={barRef} data-component="landing-tabs" aria-label="랜딩 섹션" className={[styles.bar, className ?? ""].filter(Boolean).join(" ")}>
      <ul className={styles.row}>
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <li key={t.id}>
              <a
                href={`#${t.id}`}
                className={on ? styles.tabActive : styles.tab}
                aria-current={on ? "true" : undefined}
                data-name={on ? "landing-tab-active" : "landing-tab"}
                onClick={(e) => go(e, t.id)}
              >
                {t.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
