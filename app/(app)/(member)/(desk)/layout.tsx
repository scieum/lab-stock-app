import { Suspense } from "react";
import { headers } from "next/headers";
import { DesktopOnly } from "@/components/viewport-only";
import { getReagentList } from "@/lib/supabase/reagents-data";
import { DeskList, DeskListSkeleton } from "./_desk/desk-list";
import { DeskListGate } from "./_desk/desk-list-gate";
import styles from "./_desk/desk.module.css";

/**
 * 시약 목록 + 오른쪽 드로어 묶음 (d7 §23 run b — 2 /reagents · 3 /reagents/[id] · 16 /msds/[id] · 4 /usage/new).
 * 데스크톱(≥ 1024): 왼쪽 본문 = 시약 목록 data-table(이 레이아웃이 그린다 — 드로어를 여닫아도 목록이 다시 만들어지지 않는다),
 *   오른쪽 = 각 페이지가 그리는 detail-drawer(480). /reagents 는 드로어 없이 목록만.
 * 모바일: 목록 묶음은 그리지 않고(하이드레이션 뒤 DOM 에서도 빠진다) 페이지가 지금처럼 전용 화면을 그린다.
 *
 * 목록을 언제 그리는가:
 * - 앱 안 이동(RSC 요청): Suspense 안 — 다른 화면에서 들어오는 동안 자리 표시(목록 화면 전환 규칙, DeskListGate)가 먼저 보인다.
 * - 문서 요청(주소 직접 열기 · 새로고침): 목록 데이터를 먼저 기다려(요청당 1회 캐시 — DeskList 가 같은 값을 바로 받는다)
 *   Suspense 가 자리 표시 없이 첫 HTML 에 목록을 함께 넣게 한다 — 뒤늦게 흘러 들어온 목록은 브라우저가
 *   잠시 뒤(묶어서) 드러내므로, 같은 화면(예: 다른 학교 id · 없는 id 의 "시약을 찾을 수 없어요")이 열 때마다 목록이
 *   있다가 없다가 하지 않게 한다 (N1-ui: 두 경우의 화면이 같아야 존재 여부를 알 수 없다).
 *   페이지(드로어·모바일 화면)의 404 · 리다이렉트는 첫 HTML 이 나가기 전에 정해지므로 그대로 HTTP 상태로 나간다.
 *   트리 모양(Suspense)은 두 경우 같다 — 새로 고침(router.refresh)으로 레이아웃이 다시 와도 목록이 다시 만들어지지 않는다.
 */
export default async function DeskLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if ((await headers()).get("rsc") !== "1") await getReagentList();
  return (
    <div className={styles.frame} data-desk-frame="">
      <DesktopOnly>
        <DeskListGate>
          <Suspense fallback={<DeskListSkeleton />}>
            <DeskList />
          </Suspense>
        </DeskListGate>
      </DesktopOnly>
      {children}
    </div>
  );
}
