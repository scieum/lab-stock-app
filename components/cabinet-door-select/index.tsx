import { OptionPillGroup } from "@/components/option-pill-group";
import { DOOR_TYPES, type DoorType } from "@/lib/cabinet-rules";
import styles from "./styles.module.css";

type Props = {
  value?: DoorType;
  defaultValue?: DoorType;
  onChange?: (value: DoorType) => void;
  disabled?: boolean;
  label?: string;
  /** 라디오 name (폼 전송용) */
  name?: string;
};

const OPTIONS = DOOR_TYPES.map((d) => ({ value: d, label: d }));

/** 문 형태 2옵션 pill "양문형 / 단문형" (화면 11, 교사·admin). 한 번에 하나만 선택 */
export function CabinetDoorSelect({ label = "문 형태", ...rest }: Props) {
  return (
    <div data-component="cabinet-door-select" className={styles.field}>
      <OptionPillGroup<DoorType> label={label} options={OPTIONS} {...rest} />
    </div>
  );
}
