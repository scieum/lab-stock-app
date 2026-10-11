import styles from "./styles.module.css";

/** 아직 없는 화면의 탭 아래 작은 글자 (디자인 1.26 tab_bar.qr_pending, tab-soon): caption 12/400 · text-faint "준비 중" */
export function TabSoon({ className }: { className?: string }) {
  return (
    <span data-component="tab-soon" className={[styles.soon, className ?? ""].filter(Boolean).join(" ")}>
      준비 중
    </span>
  );
}

/** 누르면 띄우는 토스트 문구 */
export const TAB_SOON_TOAST = "준비 중이에요";
