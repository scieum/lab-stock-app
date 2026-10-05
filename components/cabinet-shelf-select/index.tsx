import { OptionPillGroup } from "@/components/option-pill-group";
import { SHELF_COUNTS, shelfLabel, type ShelfCount } from "@/lib/cabinet-rules";
import styles from "./styles.module.css";

type Props = {
  value?: ShelfCount;
  defaultValue?: ShelfCount;
  onChange?: (value: ShelfCount) => void;
  disabled?: boolean;
  label?: string;
  /** 라디오 name (폼 전송용) */
  name?: string;
};

const OPTIONS = SHELF_COUNTS.map((n) => ({ value: n, label: shelfLabel(n) }));

/** 단 수 2옵션 pill "3단 / 4단" (화면 11, 교사·admin). 한 번에 하나만 선택 */
export function CabinetShelfSelect({ label = "단 수", ...rest }: Props) {
  return (
    <div data-component="cabinet-shelf-select" className={styles.field}>
      <OptionPillGroup<ShelfCount> label={label} options={OPTIONS} {...rest} />
    </div>
  );
}
