import { Icon } from "@/components/icons";
import styles from "./styles.module.css";

/** "약관에 동의해 주세요" · 여럿이면 "약관에 동의해 주세요 외 2개" */
export function signupErrorSummaryText(first: string, total: number): string {
  return total > 1 ? `${first} 외 ${total - 1}개` : first;
}

type Props = {
  /** 첫 오류 문구 */
  message: string;
  /** 오류 칸 수 (2 이상이면 "… 외 N개") */
  total?: number;
  className?: string;
};

/**
 * 가입 오류 요약 (디자인 1.26 signup_error, signup-error-summary): 화면 14 가입하기 버튼 바로 위 한 줄 —
 * 작은 안내 아이콘(text-muted) + ink 글자 13. 핑크 없음. 두 폭 같은 줄.
 */
export function SignupErrorSummary({ message, total = 1, className }: Props) {
  return (
    <p data-component="signup-error-summary" role="alert" className={[styles.summary, className ?? ""].filter(Boolean).join(" ")}>
      <Icon name="info" className={styles.icon} />
      <span>{signupErrorSummaryText(message, total)}</span>
    </p>
  );
}
