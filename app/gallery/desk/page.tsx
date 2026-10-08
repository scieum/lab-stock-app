import type { Metadata } from "next";
import { DetailDrawerDemo, EmptyTableDemo, FormDrawerDemo, GroupTableDemo, ReagentTableDemo } from "./demo";
import styles from "../gallery.module.css";

export const metadata: Metadata = { title: "데스크톱 목록 표 · 드로어 컴포넌트 · Lab_Stock" };

function Item({ id, name, wide = false, children }: { id: string; name: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <section className={[styles.item, wide ? styles.wide : ""].filter(Boolean).join(" ")} aria-labelledby={`g-${id}`}>
      <h2 id={`g-${id}`} className={styles.itemName}>
        {name}
      </h2>
      <div className={styles.stage}>{children}</div>
    </section>
  );
}

/** 데스크톱 재구성 run b 갤러리 (rules.json 1.24 desktop_shell desktop_required, d7 §23): data-table · detail-drawer */
export default function GalleryDeskPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>데스크톱 목록 표 · 오른쪽 드로어</h1>
      <p className={styles.lead}>
        data-table(머리행 · 정렬 표시 · 선택 행 · 묶음 머리 · 더보기 · 빈 상태 · 쪽 번호) · detail-drawer(폭 480, 제목 + × · 뒤로 링크 · 정보 줄 · 입력 줄 ·
        아래 버튼 줄)
      </p>
      <div className={styles.grid}>
        <Item id="table" name="data-table — 시약 목록 (시안 2-desktop: 시약명 정렬, 선택 행 연하늘, 재고 부족 배지, 칸 없음 · 없음 회색)" wide>
          <ReagentTableDemo />
        </Item>
        <Item id="group" name="data-table — 묶음 머리 행 + 기록 캡션 (시안 10-desktop) · 행 끝 더보기 (시안 9-desktop)">
          <GroupTableDemo />
        </Item>
        <Item id="empty" name="data-table — 빈 상태 (시안 2-filter-empty)">
          <EmptyTableDemo />
        </Item>
        <Item id="drawer" name="detail-drawer — drawer-head + 상태 칩 + 정보 줄 + 버튼 2개 (시안 3-desktop)">
          <DetailDrawerDemo />
        </Item>
        <Item id="drawer-form" name="detail-drawer — drawer-nav(시약 상세로) + drawer-title + 입력 줄 (시안 4-desktop)">
          <FormDrawerDemo />
        </Item>
      </div>
    </main>
  );
}
