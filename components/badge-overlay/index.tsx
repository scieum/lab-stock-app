import styles from "./styles.module.css";

type Props = {
  /** 태그 글자 (예: 파일 이름). 길면 한 줄로 말줄임하고 전체 글자는 title 로 남긴다 */
  children: string;
  className?: string;
};

/** 이미지·미리보기 위에 얹는 태그 (반투명 회색 pill + 흰 글자, 시안 5 파일 이름) */
export function BadgeOverlay({ children, className }: Props) {
  return (
    <span data-component="badge-overlay" title={children} className={[styles.badge, className ?? ""].filter(Boolean).join(" ")}>
      <span className={styles.label}>{children}</span>
    </span>
  );
}
