"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Toast } from "@/components/ex-toast";
import { takeFlashToast } from "@/lib/flash-toast";

const TOAST_MS = 3000;

/**
 * 화면을 옮긴 뒤 한 번 보여 줄 토스트 (lib/flash-toast). 로그인 셸에 하나 — 페이지가 바뀌어도 사라지지 않는다.
 * 주소가 바뀔 때(그리고 처음 그릴 때) 남은 글자가 있으면 ex-toast 로 3초 보여 준다. 예: 시약 삭제 → 화면 2 "시약을 삭제했어요".
 */
export function FlashToast() {
  const pathname = usePathname();
  const [toast, setToast] = useState<{ key: number; text: string } | null>(null);

  useEffect(() => {
    const text = takeFlashToast();
    if (!text) return;
    // 외부 저장소(sessionStorage)에서 읽은 값을 화면 상태로 옮긴다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToast({ key: Date.now(), text });
  }, [pathname]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  return toast ? (
    <Toast key={toast.key} floating>
      {toast.text}
    </Toast>
  ) : null;
}
