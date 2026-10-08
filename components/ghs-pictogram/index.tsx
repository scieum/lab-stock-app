import { GHS_NAMES, type GhsCode } from "@/lib/msds-summary";
import styles from "./styles.module.css";

// GHS 그림문자 9종 — 흰 마름모 + 표준 빨강 테두리(이 컴포넌트에서만, --color-ghs-pictogram) + 검정 그림 (d7 §22, rules.json 1.21).
// 그림은 앱 안 SVG 로 단순하게 그린다 (viewBox 80 × 80, 시안 diamond-box 80 · diamond 76).
// s = 검정 채움, k = 검정 선, h = 흰 구멍(눈 등)
const SYMBOLS: Record<GhsCode, React.ReactNode> = {
  // 폭발성: 터지는 폭탄
  GHS01: (
    <>
      <circle className={styles.s} cx="37" cy="47" r="9" />
      <path className={styles.k} d="M43 40 46 35M50 29l4-4M51 34l6-1M47 28l1-6M54 39l5 3" />
    </>
  ),
  // 인화성: 불꽃
  GHS02: (
    <>
      <path
        className={styles.s}
        d="M40 23c6 8 10 12 8 20-1 6-5 9-8 9-5 0-9-4-8-10 1-5 5-7 4-13 3 3 4 6 4 8 2-4 2-9 0-14Z"
      />
      <rect className={styles.s} x="29" y="55" width="22" height="3" />
    </>
  ),
  // 산화성: 원 위의 불꽃
  GHS03: (
    <>
      <path className={styles.s} d="M40 22c4 4 6 8 4 12-1 2-3 3-4 3-2 0-4-2-3.5-4 .5-3 2.5-4 2-7 1.5 2 2 3 2 4 1-2 1-5-.5-8Z" />
      <circle className={styles.k} cx="40" cy="46" r="7" />
      <rect className={styles.s} x="29" y="56" width="22" height="3" />
    </>
  ),
  // 고압가스: 가스통
  GHS04: (
    <>
      <rect className={styles.s} x="34" y="27" width="12" height="27" rx="5" transform="rotate(-50 40 40.5)" />
      <rect className={styles.s} x="37.5" y="22" width="5" height="5" transform="rotate(-50 40 40.5)" />
    </>
  ),
  // 부식성: 두 시험관에서 떨어지는 액체 + 손·판
  GHS05: (
    <>
      <rect className={styles.s} x="28" y="24" width="5" height="13" transform="rotate(-35 30.5 30.5)" />
      <rect className={styles.s} x="46" y="24" width="5" height="13" transform="rotate(35 48.5 30.5)" />
      <circle className={styles.s} cx="33" cy="43" r="1.6" />
      <circle className={styles.s} cx="47" cy="43" r="1.6" />
      <path className={styles.s} d="M25 50h13v5H25zM42 50h13l-2 5H42z" />
    </>
  ),
  // 급성 독성: 해골과 뼈
  GHS06: (
    <>
      <circle className={styles.s} cx="40" cy="34" r="9" />
      <circle className={styles.h} cx="36.5" cy="33" r="2.2" />
      <circle className={styles.h} cx="43.5" cy="33" r="2.2" />
      <path className={styles.k} d="M30 46l20 10M50 46 30 56" />
    </>
  ),
  // 경고(자극성 등): 느낌표
  GHS07: (
    <>
      <rect className={styles.s} x="37.5" y="24" width="5" height="21" rx="2.5" />
      <circle className={styles.s} cx="40" cy="52" r="3" />
    </>
  ),
  // 건강 유해성: 가슴에 별 모양이 있는 사람
  GHS08: (
    <>
      <circle className={styles.s} cx="40" cy="27" r="4" />
      <path className={styles.s} d="M31 57l1-16c3-5 13-5 16 0l1 16Z" />
      <path className={styles.h} d="m40 41 1.5 4h4l-3.2 2.5 1.2 4-3.5-2.5-3.5 2.5 1.2-4-3.2-2.5h4Z" />
    </>
  ),
  // 수생환경 유해성: 마른 나무와 물고기
  GHS09: (
    <>
      <path className={styles.k} d="M30 54V30M30 38l-5-5M30 42l6-6M30 34l4-4M23 56h34" />
      <ellipse className={styles.s} cx="46" cy="50" rx="7" ry="3.5" />
      <path className={styles.s} d="m52 50 5-3.5v7Z" />
    </>
  ),
};

type Props = { code: GhsCode };

/** GHS 그림문자 한 개 — 마름모 그림 + 아래 이름 (화면 16 그림문자 줄) */
export function GhsPictogram({ code }: Props) {
  const name = GHS_NAMES[code];
  return (
    <figure data-component="ghs-pictogram" data-ghs={code} className={styles.pictogram}>
      <svg viewBox="0 0 80 80" className={styles.diamondBox} role="img" aria-label={`그림문자 ${name}`}>
        <polygon className={styles.diamond} points="40,3 77,40 40,77 3,40" />
        {SYMBOLS[code]}
      </svg>
      <figcaption className={styles.caption}>{name}</figcaption>
    </figure>
  );
}
