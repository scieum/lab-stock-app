import { CabinetNumber } from "@/components/cabinet-number";
import { LocationEdit } from "@/components/location-edit";
import { locationText, type DoorType, type SlotKey } from "@/lib/cabinet-rules";
import styles from "./styles.module.css";

export type ReagentLocationCabinet = {
  /** 시약장 번호 (cabinet-number) */
  number: number;
  /** 시약장 이름 */
  label: string;
  doorType: DoorType;
};

type Props = {
  /** 시약이 놓인 시약장 (칸이 없으면 null) */
  cabinet?: ReagentLocationCabinet | null;
  /** 시약이 놓인 칸 (없으면 "칸 없음") */
  slot?: SlotKey | null;
  /** true = 교사·admin — 오른쪽에 location-edit "위치 바꾸기". 학생에게는 false (R7) */
  canEdit?: boolean;
  /** "위치 바꾸기" — 위치 피커를 연다 */
  onEdit?: () => void;
  /** 피커가 열려 있는지 */
  editing?: boolean;
  editDisabled?: boolean;
  /** card = reagent-detail-card 안 줄(기본) · row = 데스크톱 detail-drawer 정보 줄 (라벨 104 칸 + 값, 위아래 12 · 아래 hairline — 시안 3-desktop) */
  layout?: "card" | "row";
};

/**
 * 보관 위치 줄 (디자인 1.15 reagent-location, d7 §14): reagent-detail-card 안 한 줄.
 * caption "보관 위치" + 값 "(1) 1번 시약장 · 우 1단"(cabinet-number + body) 또는 "칸 없음"(회색).
 * 교사·admin 은 오른쪽에 location-edit. 학생은 값만 본다.
 */
export function ReagentLocation({ cabinet, slot, canEdit = false, onEdit, editing, editDisabled, layout = "card" }: Props) {
  const placed = Boolean(cabinet && slot);
  return (
    <div data-component="reagent-location" className={[styles.row, layout === "row" ? styles.rowLayout : ""].filter(Boolean).join(" ")}>
      <div className={styles.field}>
        <span className={styles.label}>보관 위치</span>
        <span className={styles.value}>
          {placed && cabinet ? <CabinetNumber number={cabinet.number} /> : null}
          <span className={placed ? styles.text : styles.none}>{locationText(cabinet, slot)}</span>
        </span>
      </div>
      {canEdit ? <LocationEdit onClick={onEdit} expanded={editing} disabled={editDisabled} /> : null}
    </div>
  );
}
