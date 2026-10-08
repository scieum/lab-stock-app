import { ButtonOutline } from "@/components/button-outline";
import { Icon } from "@/components/icons";
import { MSDS_SUMMARY_TEXT } from "@/lib/msds-summary";
import styles from "./styles.module.css";

type Props = {
  /** 시약의 MSDS 주소 (공단 상세 주소 또는 직접 입력한 주소) */
  href: string;
};

/** 화면 16 맨 아래 전폭 button-outline "원문 MSDS 보기 ↗" — 새 창(noopener) (시안 16 bottom-actions) */
export function MsdsOriginalLink({ href }: Props) {
  return (
    <div data-component="msds-original-link" className={styles.wrap}>
      <ButtonOutline href={href} external className={styles.button}>
        {MSDS_SUMMARY_TEXT.original}
        <Icon name="external" className={styles.icon} />
      </ButtonOutline>
    </div>
  );
}
