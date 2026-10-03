import { ButtonPrimary } from "@/components/button-primary";
import styles from "./styles.module.css";

type Props = {
  /** 가입하기 버튼(button-primary) 경로 */
  signupHref?: string;
  className?: string;
};

/**
 * 둘러보기 상단 배너 (시안 13·2·3-guest guest-banner): 하늘색 연한 바탕, 안내 문구 + "가입하기" 검정 pill.
 * 모바일은 문구가 두 줄("둘러보는 중 — 가입하면 / 우리 학교 데이터로 시작해요"), 데스크톱은 한 줄.
 */
export function GuestBanner({ signupHref = "/signup", className }: Props) {
  return (
    <div data-component="guest-banner" role="note" className={[styles.banner, className ?? ""].join(" ").trim()}>
      <p className={styles.text}>
        둘러보는 중 — 가입하면
        <br className={styles.mobileBreak} /> 우리 학교 데이터로 시작해요
      </p>
      <ButtonPrimary href={signupHref} className={styles.button}>
        가입하기
      </ButtonPrimary>
    </div>
  );
}
