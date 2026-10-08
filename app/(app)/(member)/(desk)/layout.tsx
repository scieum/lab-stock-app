import { Suspense } from "react";
import { DesktopOnly } from "@/components/viewport-only";
import { DeskList, DeskListSkeleton } from "./_desk/desk-list";
import styles from "./_desk/desk.module.css";

/**
 * 시약 목록 + 오른쪽 드로어 묶음 (d7 §23 run b — 2 /reagents · 3 /reagents/[id] · 16 /msds/[id] · 4 /usage/new).
 * 데스크톱(≥ 1024): 왼쪽 본문 = 시약 목록 data-table(이 레이아웃이 그린다 — 드로어를 여닫아도 목록이 다시 만들어지지 않는다),
 *   오른쪽 = 각 페이지가 그리는 detail-drawer(480). /reagents 는 드로어 없이 목록만.
 * 모바일: 목록 묶음은 그리지 않고(하이드레이션 뒤 DOM 에서도 빠진다) 페이지가 지금처럼 전용 화면을 그린다.
 * 목록은 Suspense 안 — 페이지(드로어·모바일 화면)는 그 밖이라 404 · 리다이렉트가 HTTP 상태로 나간다.
 */
export default function DeskLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={styles.frame}>
      <DesktopOnly>
        <div className={styles.list}>
          <Suspense fallback={<DeskListSkeleton />}>
            <DeskList />
          </Suspense>
        </div>
      </DesktopOnly>
      {children}
    </div>
  );
}
