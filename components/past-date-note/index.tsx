import { Icon } from "@/components/icons";
import styles from "./styles.module.css";

/**
 * 지난 날짜 안내 한 줄 (디자인 1.17 past-date-note, 화면 4 저장 버튼 위):
 * 무채색 달력 아이콘 16 + "10월 3일 사용으로 기록해요"(13 회색). 핑크·하늘색 없음.
 */
export function PastDateNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p data-component="past-date-note" role="status" className={[styles.note, className ?? ""].filter(Boolean).join(" ")}>
      <Icon name="calendar" className={styles.icon} />
      <span>{children}</span>
    </p>
  );
}
