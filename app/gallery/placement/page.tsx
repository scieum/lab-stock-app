import type { Metadata } from "next";
import { LocationPicker } from "@/components/location-picker";
import { NavAccountMenu } from "@/components/nav-account-menu";
import { ReagentDetailCard } from "@/components/reagent-detail-card";
import { ReagentLocation } from "@/components/reagent-location";
import { ReorderThreshold } from "@/components/reorder-threshold";
import styles from "../gallery.module.css";
import { sampleCabinets, samplePickerCabinets as pickerCabinets } from "../cabinets/sample";
import { PlacementDemo } from "./demo";

export const metadata: Metadata = { title: "시약 칸 배치 컴포넌트 · Lab_Stock" };

const [first] = sampleCabinets;

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
 * 화면 3(시약 상세) 칸 배치·재주문 기준 상태 갤러리 (디자인 1.15, d7 §14):
 * reagent-location(배치 · 칸 없음, 교사 · 학생) · location-edit · location-picker(경고 2종 · 칸 고르기 전) ·
 * reorder-threshold(두 기준 문구 · 없음, 교사 · 학생) · threshold-edit(입력 중 · 오류) · 동작 데모.
 */
export default function GalleryPlacementPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>시약 칸 배치 · 재주문 기준 (화면 3)</h1>
      <p className={styles.lead}>
        reagent-detail-card · reagent-location · cabinet-number · location-edit · location-picker · cabinet-switcher · cabinet-slot · slot-count ·
        mix-warning · reorder-threshold · threshold-edit · text-input
      </p>

      <div className={styles.grid}>
        <Item id="teacher" name="시약 상세 카드 — 교사·admin (시안 3: 과산화수소, 1번 시약장 · 우 1단, 재주문 기준 3병)">
          <ReagentDetailCard
            name="과산화수소"
            stock={2}
            unit="병"
            lowStock
            intakeDate="2026-09-14"
            meta={
              <>
                <ReagentLocation cabinet={first} slot={{ side: "R", shelf: 1 }} canEdit />
                <ReorderThreshold minStock={3} unit="병" canEdit />
              </>
            }
          />
        </Item>

        <Item id="student" name="시약 상세 카드 — 학생 (위치 바꾸기 · 연필 없음)">
          <ReagentDetailCard
            name="과산화수소"
            stock={2}
            unit="병"
            lowStock
            intakeDate="2026-09-14"
            meta={
              <>
                <ReagentLocation cabinet={first} slot={{ side: "R", shelf: 1 }} />
                <ReorderThreshold minStock={3} unit="병" />
              </>
            }
          />
        </Item>

        <Item id="unassigned" name="보관 위치 — 칸 없음 · 재주문 기준 — 아직 없어요 (교사)">
          <ReagentDetailCard
            name="질산칼륨"
            stock={300}
            unit="g"
            intakeDate="2026-10-01"
            meta={
              <>
                <ReagentLocation cabinet={null} slot={null} canEdit />
                <ReorderThreshold minStock={null} unit="g" canEdit />
              </>
            }
          />
        </Item>

        <Item id="basis" name="재주문 기준 — 화면 5 근거 문구 (1반 1회 실험량 × 조 수)">
          <ReorderThreshold minStock={60} unit="g" perGroup={10} groups={6} canEdit />
        </Item>

        <Item id="threshold-editing" name="threshold-edit — 입력 중 (0 = 알림 없음 안내)">
          <ReorderThreshold minStock={3} unit="병" canEdit defaultEditing />
        </Item>

        <Item id="threshold-error" name="threshold-edit — 오류 (음수)">
          <ReorderThreshold minStock={3} unit="병" canEdit defaultEditing defaultValue="-1" error="0 이상 입력하세요" />
        </Item>

        <Item id="picker" name="location-picker — 섞으면 위험한 조합 (시안 3-location: 2번 시약장 좌 2단 유기 ← 과산화수소 산화제)">
          <LocationPicker
            sheet={false}
            reagentName="과산화수소"
            reagentClass="산화제"
            cabinets={pickerCabinets}
            current={{ cabinetId: first.id, side: "R", shelf: 1 }}
            defaultCabinetId="c-2"
            defaultSlot={{ side: "L", shelf: 2 }}
          />
        </Item>

        <Item id="picker-mismatch" name="location-picker — 분류 불일치 (1번 시약장 우 4단 기타 칸 ← 황산구리(II) 무기염, 칸 없음에서 처음 놓기)">
          <LocationPicker
            sheet={false}
            reagentName="황산구리(II)"
            reagentClass="무기염"
            cabinets={pickerCabinets}
            defaultCabinetId="c-1"
            defaultSlot={{ side: "R", shelf: 4 }}
          />
        </Item>

        <Item id="picker-empty" name="location-picker — 칸을 고르기 전 (저장 비활성)">
          <LocationPicker sheet={false} reagentName="과산화수소" reagentClass="산화제" cabinets={pickerCabinets} current={{ cabinetId: first.id, side: "R", shelf: 1 }} />
        </Item>

        <Item id="demo" name="동작 데모 — 위치 바꾸기 → 피커 → 저장 / 재주문 기준 고치기 → 저장">
          <PlacementDemo />
        </Item>

        <Item id="account-menu" name="nav-account-menu — 학교명 옆 ▾">
          <NavAccountMenu schoolName="샘플고등학교" />
        </Item>
      </div>
    </main>
  );
}
