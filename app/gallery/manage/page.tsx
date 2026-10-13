import type { Metadata } from "next";
import Link from "next/link";
import { ManageBack } from "@/components/manage-back";
import { ManageGroup } from "@/components/manage-group";
import { ManageList } from "@/components/manage-list";
import { ManageRow } from "@/components/manage-row";
import { NavPill } from "@/components/nav-pill";
import { PageMoreMenu } from "@/components/page-more-menu";
import { ReagentWipeItem } from "@/components/reagent-wipe";
import { RecordWipeItem } from "@/components/record-wipe";
import { TabBar } from "@/components/tab-bar";
import { WipePreview } from "@/components/wipe-preview";
import { guestManageMenu, manageMenu, type ManageCounts } from "@/lib/manage-menu";
import styles from "../gallery.module.css";
import { RangePreviewDemo, ReagentWipeDemo, RecordWipeDemo, SchoolNameConfirmDemo } from "./demo";

export const metadata: Metadata = { title: "관리 탭 · 전체 삭제 갤러리 · Lab_Stock" };

/** 시안 18-mobile 요약 숫자 */
const COUNTS: ManageCounts = {
  reagents: { total: 42, low: 3 },
  sensors: { total: 7, broken: 1 },
  cabinets: 2,
  reorder: 3,
  users: { student: 3, teacher: 1, admin: 1 },
  vendors: 4,
};

/** 시안 18-guest-mobile 데모 값 */
const GUEST_COUNTS: ManageCounts = { reagents: { total: 24, low: 2 }, sensors: { total: 5, broken: 1 } };

function Item({ id, name, wide, children }: { id: string; name: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <section className={[styles.item, wide ? styles.wide : ""].filter(Boolean).join(" ")} aria-labelledby={`g-${id}`}>
      <h2 id={`g-${id}`} className={styles.itemName}>
        {name}
      </h2>
      <div className={styles.stage}>{children}</div>
    </section>
  );
}

/**
 * 디자인 1.29 (d7 §29) 모바일 관리 탭 · 시약 전체 삭제 · 기록 삭제 컴포넌트 예시
 * (시안 18-mobile · 18-guest-mobile · 2-wipe · 10-record-wipe). 관리 항목은 lib/manage-menu (사이드바와 같은 출처). 화면 연결은 D3.
 */
export default function ManageGalleryPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>관리 탭 · 전체 삭제</h1>
      <Link href="/gallery" className={styles.more}>
        컴포넌트 갤러리로
      </Link>
      <div className={styles.grid}>
        <Item id="manage-admin" name="manage-list · manage-group · manage-row — admin (시안 18-mobile: 재고 · 입고·주문 · 학교)">
          <ManageList groups={manageMenu("admin")} counts={COUNTS} />
        </Item>
        <Item id="manage-teacher" name="manage-list — 교사 (학교 묶음 없음)">
          <ManageList groups={manageMenu("teacher")} counts={COUNTS} />
        </Item>
        <Item id="manage-student" name="manage-list — 학생 (재고 묶음만)">
          <ManageList groups={manageMenu("student")} counts={COUNTS} />
        </Item>
        <Item id="manage-guest" name="manage-list — 둘러보기 (시안 18-guest-mobile: 시약 · 센서)">
          <ManageList groups={guestManageMenu()} counts={GUEST_COUNTS} />
        </Item>
        <Item id="manage-row" name="manage-group · manage-row (요약 없음 = 이름만)">
          <ManageGroup group={{ title: "입고·주문", items: [{ key: "intake", label: "입고", icon: "download", href: "/intake" }] }} />
          <ManageRow href="/reagents" label="시약" icon="flask" caption="시약 128종 · 재고 부족 3" />
        </Item>
        <Item id="manage-back" name="manage-back ‹ 관리 — nav-pill 왼쪽 (시안 2-mobile · 17-mobile)">
          <ManageBack href="/manage" />
          <NavPill schoolName="샘플고등학교" manageBackHref="/manage" />
        </Item>
        <Item id="tab-bar" name="tab-bar — 홈 · 관리 · QR 스캔 · 기록 (관리 활성, 둘러보기)">
          <TabBar active="manage" responsive={false} />
          <TabBar guest active="manage" responsive={false} />
        </Item>
        <Item id="page-more-menu" name="page-more-menu ⋯ → reagent-wipe · record-wipe 항목 (열림 · 0건 비활성)">
          <div className={styles.row}>
            <PageMoreMenu label="시약 목록 더보기" defaultOpen>
              <ReagentWipeItem count={42} />
            </PageMoreMenu>
          </div>
          <div className={styles.row}>
            <PageMoreMenu label="사용 기록 더보기" defaultOpen>
              <RecordWipeItem empty />
            </PageMoreMenu>
          </div>
        </Item>
        <Item id="reagent-wipe" name="reagent-wipe — 시약 전체 삭제 확인 (시안 2-wipe: 학교명 맞기 전엔 전체 삭제 꺼짐)">
          <ReagentWipeDemo />
        </Item>
        <Item id="school-name-confirm" name="school-name-confirm — 빈 칸 · 다름 · 같음(앞뒤 공백 정리)">
          <SchoolNameConfirmDemo />
          <SchoolNameConfirmDemo initial="샘플고교" />
          <SchoolNameConfirmDemo initial=" 샘플고등학교 " />
        </Item>
        <Item id="record-wipe-range" name="record-wipe-range · wipe-preview (전체 | 이 날짜 이전 · 0건)">
          <RangePreviewDemo />
          <WipePreview counts={{ usage: 0, intake: 0 }} />
        </Item>
        <Item id="record-wipe-sheet" name="record-wipe — 모바일 바텀시트 (시안 10-record-wipe-mobile)">
          <RecordWipeDemo variant="sheet" />
        </Item>
        <Item id="record-wipe-drawer" name="record-wipe — 데스크톱 detail-drawer (시안 10-record-wipe-desktop)" wide>
          <RecordWipeDemo variant="drawer" />
        </Item>
      </div>
    </main>
  );
}
