import { Fragment } from "react";
import styles from "./styles.module.css";

type Props = {
  /** 작은 머리말 (시안 hero-lead / hero-eyebrow, 기본 "Lab_Stock") */
  lead?: string;
  /** 제목 (시안 hero-title). "\n" = 줄바꿈 — stack 은 모바일 폭에서만, split 은 늘 */
  title?: string;
  /** 부제 (시안 hero-subtitle). "\n" 규칙은 제목과 같다 */
  subtitle?: string;
  /**
   * stack = 15-mobile (머리말 · 제목 28 · 부제 세로 스택)
   * split = 15-desktop 긴 랜딩 (왼쪽 글 560 = 꼬리표 13/600 · 제목 48/700 두 줄 · 부제 · children(행동 · 특징 줄) / 오른쪽 aside = product-shot)
   */
  layout?: "stack" | "split";
  /** split: 제목·부제 아래 (landing-cta · guest-entry · 특징 한 줄) */
  children?: React.ReactNode;
  /** split: 오른쪽 그림 (product-shot) */
  aside?: React.ReactNode;
  className?: string;
};

/** "\n" 자리에 줄바꿈 — always=false 면 모바일 전용 <br> (15-mobile 두 줄 / 예전 데스크톱 한 줄) */
function Lines({ text, always }: { text: string; always: boolean }) {
  const lines = text.split("\n");
  return lines.map((line, i) => (
    <Fragment key={i}>
      {i > 0 ? <br className={always ? undefined : styles.mobileBreak} /> : null}
      {i > 0 && !always ? " " : null}
      {line}
    </Fragment>
  ));
}

/**
 * 화면 15 랜딩 머리 영역 (시안 15 landing-hero).
 * - stack(15-mobile): 머리말 15/400 회색 · 제목 28/700 · 부제 17/300 회색, 사이 8.
 * - split(15-desktop, rules.json 1.24): 전폭 1440 × 732 — 왼쪽 hero-copy(x 80, 560) = 꼬리표 → 제목 48/700 두 줄
 *   (typography.display_sizes — landing-hero 안에서만) → 부제 17/300 → children, 오른쪽 product-shot(화면 끝에서 잘림).
 */
export function LandingHero({
  lead = "Lab_Stock",
  title = "과학실 시약,\n학교별로 한눈에 관리해요",
  subtitle = "시약 재고·사용 기록·MSDS를 QR로 연결하고,\n재고가 부족하면 판매처까지 이어 줘요",
  layout = "stack",
  children,
  aside,
  className,
}: Props) {
  if (layout === "split") {
    return (
      <section data-component="landing-hero" className={[styles.split, className ?? ""].join(" ").trim()} aria-label="소개">
        <div className={styles.copy}>
          <div className={styles.text}>
            <div className={styles.heading}>
              <p className={styles.eyebrow}>{lead}</p>
              <h1 className={styles.display}>
                <Lines text={title} always />
              </h1>
            </div>
            <p className={styles.subtitle}>
              <Lines text={subtitle} always />
            </p>
          </div>
          {children}
        </div>
        {aside ? <div className={styles.aside}>{aside}</div> : null}
      </section>
    );
  }
  return (
    <section data-component="landing-hero" className={[styles.hero, className ?? ""].join(" ").trim()} aria-label="소개">
      <p className={styles.lead}>{lead}</p>
      <h1 className={styles.title}>
        <Lines text={title} always={false} />
      </h1>
      <p className={styles.subtitle}>
        <Lines text={subtitle} always={false} />
      </p>
    </section>
  );
}
