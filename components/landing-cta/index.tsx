import { ButtonOutline } from "@/components/button-outline";
import { ButtonPrimary } from "@/components/button-primary";
import styles from "./styles.module.css";

type Props = {
  /** 회원가입 버튼(button-primary) 경로 */
  signupHref?: string;
  /** 로그인 버튼(button-outline) 경로 */
  loginHref?: string;
  className?: string;
};

/**
 * 화면 15 랜딩 행동 영역 (시안 15 landing-cta): 회원가입(검정 pill) + 로그인(테두리 pill).
 * 모바일은 하단에 붙는 흰 바(위 테두리), 데스크톱은 가운데 두 버튼 한 줄.
 */
export function LandingCta({ signupHref = "/signup", loginHref = "/login", className }: Props) {
  return (
    <div data-component="landing-cta" className={[styles.cta, className ?? ""].join(" ").trim()}>
      <ButtonPrimary href={signupHref} className={styles.button}>
        회원가입
      </ButtonPrimary>
      <ButtonOutline href={loginHref} className={styles.button}>
        로그인
      </ButtonOutline>
    </div>
  );
}
