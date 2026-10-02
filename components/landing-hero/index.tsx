import styles from "./styles.module.css";

type Props = {
  /** 작은 머리말 (시안 hero-lead, 기본 "Lab_Stock") */
  lead?: string;
  /** 제목 (시안 hero-title) */
  title?: string;
  /** 부제 (시안 hero-subtitle) */
  subtitle?: string;
  className?: string;
};

/** 화면 15 랜딩 머리 영역 — 머리말 · 제목 · 부제 (시안 15 landing-hero). 데스크톱은 가운데 정렬. */
export function LandingHero({
  lead = "Lab_Stock",
  title = "과학실 시약, 학교별로 한눈에 관리해요",
  subtitle = "시약 재고·사용 기록·MSDS를 QR로 연결하고, 재고가 부족하면 판매처까지 이어 줘요",
  className,
}: Props) {
  return (
    <section data-component="landing-hero" className={[styles.hero, className ?? ""].join(" ").trim()} aria-label="소개">
      <p className={styles.lead}>{lead}</p>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.subtitle}>{subtitle}</p>
    </section>
  );
}
