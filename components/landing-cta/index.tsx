import { ButtonOutline } from "@/components/button-outline";
import { ButtonPrimary } from "@/components/button-primary";
import styles from "./styles.module.css";

type Props = {
  /** 회원가입 버튼(button-primary) 경로 */
  signupHref?: string;
  /** 로그인 버튼(button-outline) 경로 */
  loginHref?: string;
  /** 회원가입 버튼 라벨 (15-mobile "회원가입", 15-desktop 히어로 "회원가입하고 시작하기") */
  signupLabel?: string;
  /** 두 버튼 아래 둘러보기 진입 (시안 15-mobile guest-entry — landing-cta 바 안) */
  guest?: React.ReactNode;
  /**
   * bar = 15-mobile 하단에 붙는 흰 바(위 테두리) 세로 3단 gap 8
   * inline = 15-desktop 히어로 안 한 줄(사이 12, 버튼 좌우 24) — 테두리·바탕 없음
   */
  layout?: "bar" | "inline";
  className?: string;
};

/**
 * 화면 15 랜딩 행동 영역 (시안 15 landing-cta): 회원가입(검정 pill) + 로그인(테두리 pill) + (선택) guest-entry.
 */
export function LandingCta({
  signupHref = "/signup",
  loginHref = "/login",
  signupLabel = "회원가입",
  guest,
  layout = "bar",
  className,
}: Props) {
  return (
    <div
      data-component="landing-cta"
      className={[layout === "inline" ? styles.inline : styles.cta, className ?? ""].join(" ").trim()}
    >
      <div className={styles.buttons}>
        <ButtonPrimary href={signupHref} className={styles.button}>
          {signupLabel}
        </ButtonPrimary>
        <ButtonOutline href={loginHref} className={styles.button}>
          로그인
        </ButtonOutline>
      </div>
      {guest ?? null}
    </div>
  );
}
