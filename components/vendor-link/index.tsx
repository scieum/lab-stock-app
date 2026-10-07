import { ButtonPillSoft } from "@/components/button-pill-soft";
import { ButtonPrimary } from "@/components/button-primary";
import { Icon } from "@/components/icons";
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
 * 시안 1.17 노드 구조 그대로 vendor-link(카드 폭) 가 내용 폭 button-primary 1개를 오른쪽에 감싼다.
 * 누르면 화면 쪽이 VendorLinkModal(ex-modal-card)을 띄운다.
 */
export function VendorLink({ children = "판매처 연결", expanded = false, ...rest }: Props) {
  return (
    <div data-component="vendor-link" className={styles.link}>
      <ButtonPrimary aria-haspopup="dialog" aria-expanded={expanded} {...rest}>
        {children}
      </ButtonPrimary>
    </div>
  );
}

type NewWindowNoteProps = {
  /** 연 판매처 이름 — 문장 앞에 붙인다 (어느 판매처를 열었는지) */
  vendorName: string;
  /** 새 창으로 연 주소 — "직접 열기" 가 같은 주소를 새 창으로 연다 */
  url: string;
};

/**
 * 판매처 "확인" 뒤 안내 줄 (시안 1.17 6 vendor-new-window, d7 §18): 그 알림 카드의 vendor-link 아래.
 * 바깥 링크 아이콘(회색 16) + "{판매처} 사이트를 새 창으로 열었어요. 열리지 않았다면"(13 회색) + 흰 테두리 pill "직접 열기".
 * 새 창은 noopener 로 열어 열렸는지 알 수 없어서(팝업 차단) 직접 누를 길을 남긴다.
 */
export function VendorNewWindowNote({ vendorName, url }: NewWindowNoteProps) {
  return (
    <div className={styles.newWindow} role="status">
      <Icon name="external" className={styles.newWindowIcon} />
      <p className={styles.newWindowText}>{vendorName} 사이트를 새 창으로 열었어요. 열리지 않았다면</p>
      <ButtonPillSoft tone="white" bordered href={url} external>
        직접 열기
      </ButtonPillSoft>
    </div>
  );
}
