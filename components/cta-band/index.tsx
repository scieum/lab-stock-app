import { ButtonOutline } from "@/components/button-outline";
import { ButtonPrimary } from "@/components/button-primary";
import styles from "./styles.module.css";

type Action = { href: string; label: string };

type Props = {
  title: string;
  description?: string;
  /** 주 행동 — gray-950 띠 안 반전 button-primary (흰 채움 + 검정 라벨) */
  primary: Action;
  /** 보조 행동 — 반전 button-outline (흰 테두리 · 흰 라벨) */
  secondary?: Action;
  className?: string;
};

/**
 * 랜딩 끝 행동 띠 (시안 15-desktop cta-band, rules.json 1.24 landing_rhythm): 전폭 gray-950 띠 · 위아래 64 · 사이 32, 가운데 정렬.
 * cta-title 40/700 흰 글자(typography.display_sizes — cta-band 안에서만) · cta-desc 17/300 gray-400 →
 * cta-actions(사이 12): 검정 띠 안에서만 버튼을 반전한다 (landing_rhythm.inverted_button).
 */
export function CtaBand({ title, description, primary, secondary, className }: Props) {
  return (
    <section data-component="cta-band" className={[styles.band, className ?? ""].filter(Boolean).join(" ")} aria-label={title}>
      <div className={styles.text} data-reveal="">
        <h2 className={styles.title}>{title}</h2>
        {description ? <p className={styles.desc}>{description}</p> : null}
      </div>
      <div className={styles.actions} data-reveal="">
        <ButtonPrimary href={primary.href} className={styles.primary}>
          {primary.label}
        </ButtonPrimary>
        {secondary ? (
          <ButtonOutline href={secondary.href} className={styles.secondary}>
            {secondary.label}
          </ButtonOutline>
        ) : null}
      </div>
    </section>
  );
}
