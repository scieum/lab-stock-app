"use client";

import { createContext, useContext } from "react";
import type { DeskBase } from "@/lib/reagent-desk";

const DeskBaseContext = createContext<DeskBase>("");

/**
 * 데스크톱 시약 목록 + 드로어 주소 앞머리 (lib/reagent-desk DeskBase).
 * 로그인 화면은 감싸지 않는다(기본 ""). 둘러보기 데스크톱(/demo, d7 §23 run d)은 "/demo" 로 감싼다.
 */
export function DeskBaseProvider({ base, children }: { base: DeskBase; children: React.ReactNode }) {
  return <DeskBaseContext.Provider value={base}>{children}</DeskBaseContext.Provider>;
}

export function useDeskBase(): DeskBase {
  return useContext(DeskBaseContext);
}
