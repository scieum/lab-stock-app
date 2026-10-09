"use client";

import { useEffect, useRef } from "react";
import styles from "./landing-motion.module.css";

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * 랜딩 스크롤 동작 (rules.json 1.24 landing_rhythm.motion, d7 §23 run d 세부):
 * 안쪽의 [data-reveal] 요소(섹션 제목·카드·화면 조각)가 화면에 들어오면 16 아래에서 0.4초 동안 떠오르며 한 번 나타난다.
 * - IntersectionObserver 만 쓴다 (새 의존성 없음). 한 번 나타난 요소는 다시 숨기지 않는다.
 * - 처음 그릴 때 이미 화면 안에 있는 요소는 움직이지 않고 그대로 둔다 (깜빡임 없음).
 * - 자바스크립트가 돌기 전(서버 HTML)·동작 줄이기(prefers-reduced-motion) 설정이면 숨기지도 움직이지도 않는다 —
 *   숨김은 이 컴포넌트가 data-motion="on" 을 붙인 뒤에만 걸린다.
 */
export function LandingMotion({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const reduce = window.matchMedia(REDUCE_QUERY);
    if (reduce.matches) return;

    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    const viewH = window.innerHeight;
    for (const el of targets) {
      if (el.getBoundingClientRect().top < viewH) el.setAttribute("data-revealed", "");
    }
    root.setAttribute("data-motion", "on");

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.setAttribute("data-revealed", "");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0% 0% -8% 0%", threshold: 0 },
    );
    for (const el of targets) if (!el.hasAttribute("data-revealed")) io.observe(el);

    // 보는 도중 동작 줄이기를 켜면 남은 요소를 모두 바로 보인다
    const onReduce = () => {
      if (!reduce.matches) return;
      io.disconnect();
      root.removeAttribute("data-motion");
    };
    reduce.addEventListener("change", onReduce);
    return () => {
      io.disconnect();
      reduce.removeEventListener("change", onReduce);
    };
  }, []);

  return (
    <div ref={ref} className={[styles.root, className ?? ""].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}
