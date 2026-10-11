"use client";

import { useCallback, useState } from "react";
import { selectAllIds } from "@/lib/sensor-rules";

/**
 * 목록 선택 모드 상태 (디자인 1.26 bulk_delete — 화면 2·17). 고른 id 는 누른 순서가 아니라 부르는 쪽 목록 순서로 쓴다.
 * 전체 선택 = 지금 필터·검색 결과 전체(쪽을 넘어), 최대 100 — 넘으면 capped.
 */
export function useBulkSelect() {
  const [selecting, setSelecting] = useState(false);
  const [ids, setIds] = useState<ReadonlySet<string>>(new Set());
  const [capped, setCapped] = useState(false);

  const start = useCallback(() => {
    setSelecting(true);
    setIds(new Set());
    setCapped(false);
  }, []);

  const cancel = useCallback(() => {
    setSelecting(false);
    setIds(new Set());
    setCapped(false);
  }, []);

  const toggle = useCallback((id: string) => {
    setCapped(false);
    setIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** 지금 결과 전체(최대 100). 이미 전부 골랐으면 모두 풀기 */
  const selectAll = (visible: readonly string[]) => {
    const { ids: pick, capped: over } = selectAllIds(visible);
    const all = pick.length > 0 && pick.every((id) => ids.has(id)) && ids.size === pick.length;
    setCapped(!all && over);
    setIds(all ? new Set() : new Set(pick));
  };

  return { selecting, ids, capped, start, cancel, toggle, selectAll };
}

export type BulkSelect = ReturnType<typeof useBulkSelect>;
