"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./desk.module.css";

/**
 * 데스크톱 목록 자리 (레이아웃). 다른 화면에서 /reagents 로 들어오는 동안(목록 자리 표시가 떠 있는 동안)은
 * 목록을 숨기고 자리 표시만 보인다 — 응답 전 본문에 학교 데이터 0 · 자리 표시 하나 (셸 전환 규칙).
 * 한 번 보인 뒤(data-shown)에는 드로어를 닫아 /reagents 로 돌아와도 목록을 그대로 두고 자리 표시를 숨긴다 (깜빡임 없음).
 */
export function DeskListGate({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (shown) return;
    const frame = ref.current?.closest("[data-desk-frame]");
    if (!frame) return;
    const check = () => {
      if (!frame.querySelector("[data-desk-loading]")) setShown(true);
    };
    check();
    const mo = new MutationObserver(check);
    mo.observe(frame, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [shown]);

  return (
    <div ref={ref} className={styles.list} data-shown={shown ? "true" : undefined}>
      {children}
    </div>
  );
}
