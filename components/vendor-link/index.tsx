import { ButtonPrimary } from "@/components/button-primary";
import styles from "./styles.module.css";

export { VendorLinkModal, VendorOptions, openVendorWebsite } from "./modal";
export type { VendorLinkOption } from "./modal";
export { VendorFavoriteToggle } from "./favorite-toggle";

type Props = {
  /** 버튼 글자 (기본 "판매처 연결") */
  children?: React.ReactNode;
  /** 이 카드의 판매처 연결 모달이 열려 있음 */
  expanded?: boolean;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">;

/**
 * reorder-alert-card 맨 아래 "판매처 연결" (화면 6, 교사·admin 전용 — 학생 화면에는 0개, R2).
 * 시안 노드 구조 그대로 vendor-link(위 여백 8) 가 전폭 button-primary 1개를 감싼다.
 * 누르면 화면 쪽이 VendorLinkModal(ex-modal-card)을 띄운다.
 */
export function VendorLink({ children = "판매처 연결", expanded = false, ...rest }: Props) {
  return (
    <div data-component="vendor-link" className={styles.link}>
      <ButtonPrimary fullWidth aria-haspopup="dialog" aria-expanded={expanded} {...rest}>
        {children}
      </ButtonPrimary>
    </div>
  );
}
