import { ButtonPillSoft } from "@/components/button-pill-soft";
import styles from "./styles.module.css";

type Props = {
  /** 누르면 위치 피커(location-picker)를 연다 */
  onClick?: () => void;
  disabled?: boolean;
  /** 피커가 열려 있는지 (읽기 도구) */
  expanded?: boolean;
};

/**
 * 위치 바꾸기 (디자인 1.15 location-edit): 화면 3 reagent-location 줄 오른쪽 button-pill-soft "위치 바꾸기".
 * 교사·admin 만 (R7: 학생 0개 — 학생 화면에는 그리지 않는다).
 */
export function LocationEdit({ onClick, disabled, expanded }: Props) {
  return (
    <span data-component="location-edit" className={styles.wrap}>
      <ButtonPillSoft className={styles.button} disabled={disabled} aria-haspopup="dialog" aria-expanded={expanded} onClick={onClick}>
        위치 바꾸기
      </ButtonPillSoft>
    </span>
  );
}
