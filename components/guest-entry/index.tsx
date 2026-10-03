import { ButtonPillSoft } from "@/components/button-pill-soft";
import styles from "./styles.module.css";

type Props = {
  /** 둘러보기 경로 (dev-rules.json routes 13-guest) */
  href?: string;
  className?: string;
};

/**
 * 랜딩(15) 둘러보기 진입 (시안 15 guest-entry): 회색 pill "둘러보기" + 하늘색 chevron → /demo.
 * 모바일은 358 폭 컨테이너 가운데, 데스크톱은 버튼 폭만.
 */
export function GuestEntry({ href = "/demo", className }: Props) {
  return (
    <div data-component="guest-entry" className={[styles.entry, className ?? ""].join(" ").trim()}>
      <ButtonPillSoft href={href} icon="chevron-right" className={styles.button}>
        둘러보기
      </ButtonPillSoft>
    </div>
  );
}
