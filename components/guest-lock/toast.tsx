"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Toast } from "@/components/ex-toast";

/** 둘러보기 잠금을 눌렀을 때 보여 주는 문구 (harness/d7-data.md §5) */
export const GUEST_LOCK_MESSAGE = "가입하면 쓸 수 있어요";
const TOAST_MS = 3000;

type GuestToastApi = { show: () => void };

const GuestToastContext = createContext<GuestToastApi | null>(null);

/**
 * 둘러보기(/demo) 셸에서 한 번 감싼다. guest-lock 이 붙은 버튼·탭·링크는 useGuestToast().show() 만 부르고
 * 네트워크 요청·이동은 하지 않는다 (GM-ui: 쓰기 요청 0건).
 */
export function GuestToastProvider({ children }: { children: React.ReactNode }) {
  const [shownAt, setShownAt] = useState(0);
  const show = useCallback(() => setShownAt(Date.now()), []);
  const api = useMemo(() => ({ show }), [show]);

  useEffect(() => {
    if (!shownAt) return;
    const t = setTimeout(() => setShownAt(0), TOAST_MS);
    return () => clearTimeout(t);
  }, [shownAt]);

  return (
    <GuestToastContext.Provider value={api}>
      {children}
      {shownAt ? (
        <Toast key={shownAt} floating>
          {GUEST_LOCK_MESSAGE}
        </Toast>
      ) : null}
    </GuestToastContext.Provider>
  );
}

/** 셸 밖(컴포넌트 갤러리 등)에서는 아무 일도 하지 않는다. */
export function useGuestToast(): GuestToastApi {
  const ctx = useContext(GuestToastContext);
  return ctx ?? NOOP;
}

const NOOP: GuestToastApi = { show: () => undefined };
