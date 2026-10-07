import { Icon } from "@/components/icons";
import { MSDS_TEXT } from "@/lib/msds-rules";
import styles from "./styles.module.css";

type Props = {
  /** md = 15/600 (화면 3 msds-entry 안), sm = 13/600 (화면 7 MSDS 칸 옆) */
  size?: "md" | "sm";
  children?: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * "MSDS 찾기" 버튼 (디자인 1.17 3-msds · 7-msds msds-search): 회색 stadium pill, 높이 44, 안쪽 0 16 0 12,
 * 하늘색 돋보기 16 + 글자(기본색). 누르면 부르는 쪽이 후보 시트(msds-candidates)를 연다. 교사·admin 에게만 둔다(R5).
 */
export function MsdsSearch({ size = "md", children = MSDS_TEXT.find, className, type = "button", ...rest }: Props) {
  return (
    <button
      data-component="msds-search"
      type={type}
      aria-haspopup="dialog"
      className={[styles.button, size === "sm" ? styles.sm : "", className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    >
      <Icon name="search" className={styles.icon} />
      <span>{children}</span>
    </button>
  );
}
