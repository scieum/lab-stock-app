"use client";

import { useEffect, useEffectEvent } from "react";

type Options = {
  /** true 인 동안만 가로챈다 (저장하지 않은 편집이 있을 때) */
  active: boolean;
  /** 앱 안 링크 이동을 막았을 때 — 막은 주소(경로 + 쿼리 + 해시)를 넘긴다. 확인 뒤 router.push 로 이어 간다 */
  onBlocked: (href: string) => void;
  /** true 를 돌려주는 주소는 막지 않는다 (예: 지금 보고 있는 시약장 pill — 편집이 그대로 남는 이동) */
  allow?: (url: URL) => boolean;
};

/**
 * 저장하지 않은 편집 지키기 (rules.json cabinet.unsaved_confirm, d7 §14).
 * - 앱 안 링크(nav-pill · tab-bar · 뒤로가기 · 목록 행 · 시약장 pill)를 누르면: window 캡처 단계에서 클릭을 먼저 받아
 *   기본 동작과 전파를 멈춘다 — Next Link 의 클릭 처리(라우터 이동)까지 가지 않는다. 부르는 쪽이 확인 카드를 띄우고
 *   "버리고 이동"이면 router.push(href) 로 이어 간다.
 * - 새로고침·창 닫기·주소 직접 입력: beforeunload 기본 확인(브라우저 문구).
 * 새 탭 열기(보조키·가운데 버튼)·다른 사이트·target 이 있는 링크·같은 주소(해시만 다른 것 포함)는 그대로 둔다.
 */
export function useUnsavedGuard({ active, onBlocked, allow }: Options) {
  const blocked = useEffectEvent((href: string) => onBlocked(href));
  const allowed = useEffectEvent((url: URL) => (allow ? allow(url) : false));

  useEffect(() => {
    if (!active) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target instanceof Element ? e.target : null;
      const a = target?.closest("a[href]");
      if (!(a instanceof HTMLAnchorElement)) return;
      if ((a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (allowed(url)) return;
      e.preventDefault();
      e.stopPropagation();
      blocked(`${url.pathname}${url.search}${url.hash}`);
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // 예전 브라우저용 (문구는 브라우저가 정한다)
      e.returnValue = "";
    };
    window.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [active]);
}
