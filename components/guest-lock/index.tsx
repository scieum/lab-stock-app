import styles from "./styles.module.css";

type Props = {
  className?: string;
  /** 스크린리더용 설명 (기본 "가입하면 쓸 수 있어요") */
  label?: string;
};

/**
 * 둘러보기 잠금 표시 (시안 13-guest · 3-guest guest-lock): icon-sm 크기 자물쇠 — 고리(선) + 몸통(채움), 회색.
 * 쓰기 동작·범위 밖 진입점(탭바 QR 스캔·기록, 사용 기록 입력 등) 옆에 붙인다.
 * 표시 전용 — 탭 시 ex-toast "가입하면 쓸 수 있어요" 는 감싸는 쪽(화면)에서 처리한다.
 */
export function GuestLock({ className, label = "가입하면 쓸 수 있어요" }: Props) {
  return (
    <span data-component="guest-lock" role="img" aria-label={label} className={[styles.lock, className ?? ""].join(" ").trim()}>
      <svg viewBox="0 0 16 16" className={styles.svg} aria-hidden="true" focusable="false">
        {/* shackle 6×5 (선) */}
        <path d="M5 7.5V5.5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        {/* lock-body 10×7 (채움) */}
        <rect x="3" y="7.5" width="10" height="7" rx="1" fill="currentColor" />
      </svg>
    </span>
  );
}
