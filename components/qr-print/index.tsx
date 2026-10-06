import { ButtonOutline } from "@/components/button-outline";
import { Icon } from "@/components/icons";
import styles from "./styles.module.css";

type Props = {
  /** 누르면 QR 인쇄 시트(qr-print-sheet)를 연다 */
  onClick?: () => void;
  disabled?: boolean;
  /** 시트가 열려 있는지 (읽기 도구) */
  expanded?: boolean;
};

/**
 * QR 인쇄 버튼 (디자인 1.15 qr-print): 화면 11 cabinet-edit 관리 줄 "이름 바꾸기" 옆 button-outline "QR 인쇄".
 * 교사·admin 만 (R7: 학생 0개 — 학생 화면에는 그리지 않는다). 인쇄 아이콘만 하늘색, 글자는 기본색.
 */
export function QrPrint({ onClick, disabled, expanded }: Props) {
  return (
    <span data-component="qr-print" className={styles.wrap}>
      <ButtonOutline className={styles.button} disabled={disabled} aria-haspopup="dialog" aria-expanded={expanded} onClick={onClick}>
        <Icon name="print" className={styles.icon} />
        <span>QR 인쇄</span>
      </ButtonOutline>
    </span>
  );
}
