import { Fragment } from "react";
import styles from "./styles.module.css";

type Props = {
  /** 작은 머리말 (시안 hero-lead, 기본 "Lab_Stock") */
  lead?: string;
  /** 제목 (시안 hero-title). "\n" 은 모바일에서만 줄바꿈 (데스크톱 시안은 한 줄) */
  title?: string;
  /** 부제 (시안 hero-subtitle). "\n" 은 모바일에서만 줄바꿈 */
  subtitle?: string;
  className?: string;
};

/** "\n" 자리에 모바일 전용 <br> — 15-mobile 은 두 줄, 15-desktop 은 한 줄 */
function MobileLines({ text }: { text: string }) {
  const lines = text.split("\n");
  return lines.map((line, i) => (
    <Fragment key={i}>
      {/* 데스크톱은 br 숨김 → 뒤 공백만 남아 한 줄. 모바일은 줄머리 공백이 접힌다 */}
      {i > 0 ? <br className={styles.mobileBreak} /> : null}
      {i > 0 ? " " : null}
      {line}
    </Fragment>
  ));
}

/** 화면 15 랜딩 머리 영역 — 머리말 · 제목 · 부제 (시안 15 landing-hero). 데스크톱은 가운데 정렬. */
export function LandingHero({
  lead = "Lab_Stock",
  title = "과학실 시약,\n학교별로 한눈에 관리해요",
  subtitle = "시약 재고·사용 기록·MSDS를 QR로 연결하고,\n재고가 부족하면 판매처까지 이어 줘요",
  className,
}: Props) {
  return (
    <section data-component="landing-hero" className={[styles.hero, className ?? ""].join(" ").trim()} aria-label="소개">
      <p className={styles.lead}>{lead}</p>
      <h1 className={styles.title}>
        <MobileLines text={title} />
      </h1>
      <p className={styles.subtitle}>
        <MobileLines text={subtitle} />
      </p>
    </section>
  );
}
