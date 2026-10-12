"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Toast } from "@/components/ex-toast";
import { DENIED_PARAM, NO_ACCESS_TEXT, parseDenied, type DeniedKind } from "@/lib/no-access";

const TOAST_MS = 4000;

/**
 * 권한 없는 주소 (d7 §28 · rules 1.28 no_access, 시안 13-no-access): 관리 화면 가드가 보낸 `/?denied=staff|admin` 을 읽어
 * ex-toast 를 한 번 보이고 주소에서 값을 지운다 (router.replace — 새로고침·뒤로가기로 다시 뜨지 않는다). 두 폭 공용.
 */
export function DeniedToast() {
  const params = useSearchParams();
  const router = useRouter();
  const kind = parseDenied(params.get(DENIED_PARAM));
  const [toast, setToast] = useState<{ key: number; kind: DeniedKind } | null>(null);
  // 같은 주소 값으로 두 번 띄우지 않는다 (개발 모드 이중 실행 · 주소를 지우기 전 다시 그림)
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!kind) {
      handled.current = null;
      return;
    }
    if (handled.current === kind) return;
    handled.current = kind;
    // 주소 값(외부)을 한 번 보일 토스트 상태로 옮긴다
    setToast({ key: Date.now(), kind });
    const next = new URLSearchParams(params.toString());
    next.delete(DENIED_PARAM);
    const qs = next.toString();
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
  }, [kind, params, router]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  return toast ? (
    <Toast key={toast.key} floating tone="info" onClose={() => setToast(null)}>
      {NO_ACCESS_TEXT[toast.kind]}
    </Toast>
  ) : null;
}
