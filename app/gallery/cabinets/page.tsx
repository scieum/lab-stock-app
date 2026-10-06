import type { Metadata } from "next";
import Link from "next/link";
import { ButtonPrimary } from "@/components/button-primary";
import { CabinetDeleteConfirm, CabinetRenameSheet, CabinetSaveBar, CabinetUnsavedConfirm } from "@/components/cabinet-edit";
import { Toast } from "@/components/ex-toast";
import { QrLabel } from "@/components/qr-label";
import { QrPrintSheet } from "@/components/qr-print-sheet";
import { SlotAssign } from "@/components/slot-assign";
import { SlotSheet } from "@/components/slot-sheet";
import { cabinetQrUrl, slotTitle } from "@/lib/cabinet-rules";
import styles from "../gallery.module.css";
import local from "./cabinets.module.css";
import { CabinetsDemo, NavLogoutDemo } from "./demo";
import { SAMPLE_ORIGIN, sampleCabinets, sampleCandidates, sampleInSlot, sampleUnassigned } from "./sample";

export const metadata: Metadata = { title: "시약장 설정 컴포넌트 · Lab_Stock" };

const SAMPLE_SCHOOL = "샘플고등학교";
const printCabinets = sampleCabinets.map((c) => ({ id: c.id, number: c.number, label: c.label }));
const [first] = sampleCabinets;
/** 시안 11-slot: 1번 시약장 좌 2단(유기) — 에탄올 · 아세톤 · 메탄올 */
const slotL2 = sampleInSlot(first.id, "L2").map((r) => ({ id: r.id, name: r.name, amount: r.amount, storageClass: r.storageClass }));
const slotL1 = sampleInSlot(first.id, "L1").map((r) => ({ id: r.id, name: r.name, amount: r.amount, storageClass: r.storageClass }));

/** wide: 화면 11 전체 배치(CabinetScreen 2단)를 그리는 구역 — 데스크톱 2열 격자에서 전체 폭으로 펼쳐 실제 화면 폭과 맞춘다 */
function Item({ id, name, wide, children }: { id: string; name: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <section className={wide ? `${styles.item} ${styles.wide}` : styles.item} aria-labelledby={`g-${id}`}>
      <h2 id={`g-${id}`} className={styles.itemName}>
        {name}
      </h2>
      <div className={styles.stage}>{children}</div>
    </section>
  );
}

/**
 * 화면 11(시약장 설정) 상태 갤러리: 기본(교사) · 학생 보기 전용 · 빈 상태 · 삭제 확인 · 이름 시트 · 토스트 · 계정 메뉴
 * + 디자인 1.15: 칸 시트(교사·학생) · 시약 넣기 경고 2종 · QR 인쇄 시트(지금 시약장 · 모두) · QR 라벨 · 저장 안 한 편집 확인.
 * 시트는 제자리(sheet=false)로 그린다. 화면 3 칸 배치(보관 위치 · 위치 피커 · 재주문 기준)는 /gallery/placement.
 */
export default function GalleryCabinetsPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>시약장 설정 (화면 11)</h1>
      <p className={styles.lead}>
        cabinet-switcher · cabinet-number · cabinet-add · cabinet-edit · qr-print · cabinet-door-select · cabinet-shelf-select · cabinet-slot ·
        slot-count · storage-class-chip · mix-warning · slot-sheet · slot-assign · qr-print-sheet · qr-label · ex-modal-card(이름 시트 · 삭제 확인 ·
        저장 안 한 편집) · ex-empty-state-card · nav-account-menu
      </p>
      <p className={styles.lead}>
        <Link href="/gallery/placement" className={styles.more}>
          화면 3 칸 배치 보기 — 보관 위치 · 위치 피커 · 재주문 기준 (/gallery/placement)
        </Link>
      </p>

      <div className={styles.grid}>
        <Item id="default" wide name="기본 — 교사·admin (시안 11: 시약장 2개, 1번 활성, 좌1단 산 + 염기 선택 · 칸 안 시약 수)">
          <CabinetsDemo role="teacher" cabinets={sampleCabinets} unassigned={sampleUnassigned} />
        </Item>

        <Item id="student" wide name="학생 — 보기 전용 (cabinet-add · cabinet-edit · qr-print 없음, 칸을 누르면 목록만)">
          <CabinetsDemo role="student" cabinets={sampleCabinets} unassigned={sampleUnassigned} />
        </Item>

        <Item id="empty" name="빈 상태 — 교사·admin (시안 11-empty: 시약장 0개)">
          <CabinetsDemo role="teacher" cabinets={[]} />
        </Item>

        <Item id="empty-student" name="빈 상태 — 학생 (cabinet-add 없음)">
          <CabinetsDemo role="student" cabinets={[]} />
        </Item>

        <Item id="delete" name="ex-modal-card 삭제 확인 (시안 11-delete: 2번 시약장, 배치된 시약 6개)">
          <CabinetDeleteConfirm sheet={false} reagentCount={6} />
        </Item>

        <Item id="delete-none" name="ex-modal-card 삭제 확인 — 배치된 시약 0개">
          <CabinetDeleteConfirm sheet={false} reagentCount={0} />
        </Item>

        <Item id="rename" name="ex-modal-card 이름 바꾸기 시트">
          <CabinetRenameSheet sheet={false} defaultName="1번 시약장" />
        </Item>

        <Item id="save-notice" name="저장 줄 — 칸을 줄일 때 안내">
          <CabinetSaveBar sticky={false} notice="이 변경으로 시약 2종이 '칸 없음'이 돼요">
            <ButtonPrimary fullWidth>저장</ButtonPrimary>
          </CabinetSaveBar>
        </Item>

        <Item id="toast" name="ex-toast">
          <Toast>시약장 설정을 저장했어요</Toast>
          <Toast>이름을 바꿨어요</Toast>
          <Toast>3번 시약장을 추가했어요</Toast>
          <Toast>2번 시약장을 삭제했어요</Toast>
          <Toast>염산을 좌 2단에 넣었어요</Toast>
          <Toast>에탄올을 뺐어요(칸 없음)</Toast>
        </Item>

        <Item id="slot" name="slot-sheet + slot-assign — 교사 (시안 11-slot: 좌 2단에 염산(산)을 고름 → 분류 불일치 경고, 막지 않음)">
          <SlotSheet sheet={false} canEdit title={slotTitle({ side: "L", shelf: 2 }, first.doorType)} classes={["유기"]} reagents={slotL2}>
            <SlotAssign candidates={sampleCandidates.slice(0, 2)} slotClasses={["유기"]} slotReagentClasses={slotL2.map((r) => r.storageClass)} defaultSelectedId="u-1" />
          </SlotSheet>
        </Item>

        <Item id="slot-danger" name="slot-sheet + slot-assign — 섞으면 위험한 조합 (좌 2단 유기 칸에 과망가니즈산칼륨(산화제))">
          <SlotSheet sheet={false} canEdit title={slotTitle({ side: "L", shelf: 2 }, first.doorType)} classes={["유기"]} reagents={slotL2}>
            <SlotAssign candidates={sampleCandidates} slotClasses={["유기"]} slotReagentClasses={slotL2.map((r) => r.storageClass)} defaultSelectedId="u-3" />
          </SlotSheet>
        </Item>

        <Item id="slot-closed" name="slot-sheet — 교사, 시약 넣기 전 (고르기 목록 닫힘)">
          <SlotSheet sheet={false} canEdit title={slotTitle({ side: "L", shelf: 1 }, first.doorType)} classes={["산", "염기"]} reagents={slotL1}>
            <SlotAssign candidates={sampleCandidates} slotClasses={["산", "염기"]} slotReagentClasses={slotL1.map((r) => r.storageClass)} />
          </SlotSheet>
        </Item>

        <Item id="slot-student" name="slot-sheet — 학생 (목록만: 빼기 · 시약 넣기 없음)">
          <SlotSheet sheet={false} title={slotTitle({ side: "L", shelf: 2 }, first.doorType)} classes={["유기"]} reagents={slotL2} />
        </Item>

        <Item id="slot-empty" name="slot-sheet — 빈 칸 (분류 미지정)">
          <SlotSheet sheet={false} canEdit title={slotTitle({ side: "L", shelf: 3 }, "양문형")} classes={[]} reagents={[]}>
            <SlotAssign candidates={[]} slotClasses={[]} defaultOpen />
          </SlotSheet>
        </Item>

        <Item id="print" name="qr-print-sheet — 기본: 지금 시약장 (1번)">
          <QrPrintSheet sheet={false} schoolName={SAMPLE_SCHOOL} origin={SAMPLE_ORIGIN} cabinets={printCabinets} defaultTarget={first.id} />
        </Item>

        <Item id="print-all" name="qr-print-sheet — 모두 (시안 11-print: 라벨 2개)">
          <QrPrintSheet sheet={false} schoolName={SAMPLE_SCHOOL} origin={SAMPLE_ORIGIN} cabinets={printCabinets} defaultTarget="all" />
        </Item>

        <Item id="label" name="qr-label — 인쇄 라벨 1장 (QR = {origin}/scan?cabinet={id})">
          <QrLabel schoolName={SAMPLE_SCHOOL} number={first.number} name={first.label} content={cabinetQrUrl(SAMPLE_ORIGIN, first.id)} />
        </Item>

        <Item id="unsaved" name="ex-modal-card 저장 안 한 편집 확인 (시안 11-unsaved)">
          <CabinetUnsavedConfirm sheet={false} cabinetLabel={first.label} />
        </Item>

        <Item id="unsaved-flow" wide name="저장 안 한 편집 — 동작 (분류를 바꾼 채 2번 시약장을 누른 상태)">
          <CabinetsDemo role="teacher" cabinets={sampleCabinets} unassigned={sampleUnassigned} open="unsaved" dirty />
        </Item>

        <Item id="logout" name="nav-pill — 학교명 옆 ▾ nav-account-menu (로그아웃)">
          <div className={local.menuStage}>
            <NavLogoutDemo schoolName={SAMPLE_SCHOOL} />
          </div>
        </Item>
      </div>
    </main>
  );
}
