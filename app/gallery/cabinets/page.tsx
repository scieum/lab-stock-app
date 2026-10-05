import type { Metadata } from "next";
import { ButtonPrimary } from "@/components/button-primary";
import { CabinetDeleteConfirm, CabinetRenameSheet, CabinetSaveBar } from "@/components/cabinet-edit";
import { Toast } from "@/components/ex-toast";
import styles from "../gallery.module.css";
import local from "./cabinets.module.css";
import { CabinetsDemo, NavLogoutDemo } from "./demo";
import { sampleCabinets, sampleUnassigned } from "./sample";

export const metadata: Metadata = { title: "시약장 설정 컴포넌트 · Lab_Stock" };

const SAMPLE_SCHOOL = "샘플고등학교";

function Item({ id, name, children }: { id: string; name: string; children: React.ReactNode }) {
  return (
    <section className={styles.item} aria-labelledby={`g-${id}`}>
      <h2 id={`g-${id}`} className={styles.itemName}>
        {name}
      </h2>
      <div className={styles.stage}>{children}</div>
    </section>
  );
}

/**
 * 화면 11(시약장 설정) 상태 갤러리: 기본(교사) · 학생 보기 전용 · 빈 상태 · 삭제 확인 · 이름 시트 · 토스트
 * + nav-pill 학교명 메뉴(로그아웃, d7 §10). 시트는 제자리(sheet=false)로 그린다.
 */
export default function GalleryCabinetsPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>시약장 설정 (화면 11)</h1>
      <p className={styles.lead}>
        cabinet-switcher · cabinet-add · cabinet-edit · cabinet-door-select · cabinet-shelf-select · cabinet-slot · storage-class-chip ·
        mix-warning · ex-modal-card(이름 시트 · 삭제 확인) · ex-empty-state-card · nav-pill 로그아웃 메뉴
      </p>

      <div className={styles.grid}>
        <Item id="default" name="기본 — 교사·admin (시안 11: 시약장 2개, 1번 활성, 좌1단 산 + 염기 선택)">
          <CabinetsDemo role="teacher" cabinets={sampleCabinets} unassigned={sampleUnassigned} />
        </Item>

        <Item id="student" name="학생 — 보기 전용 (cabinet-add · cabinet-edit 없음)">
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
        </Item>

        <Item id="logout" name="nav-pill — 학교명 메뉴 (로그아웃)">
          <div className={local.menuStage}>
            <NavLogoutDemo schoolName={SAMPLE_SCHOOL} />
          </div>
        </Item>
      </div>
    </main>
  );
}
