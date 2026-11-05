import { PrivacyLink } from "@/components/privacy-link";
import { PRIVACY_CONSENT_ITEMS } from "@/lib/privacy";
import styles from "./styles.module.css";

type Props = {
  /** 펼침 버튼의 aria-controls 대상 */
  id?: string;
  /** 항목 (기본 = lib/privacy PRIVACY_CONSENT_ITEMS — 목적 → 항목 → 보유 기간 → 위탁·국외 이전 → 거부 권리 → 보호책임자) */
  items?: { title: string; body: string }[];
  className?: string;
};

/**
 * privacy-consent-detail (rules 1.32 privacy_consent.detail, 시안 14-consent): '개인정보 수집·이용 동의' 행 아래
 * canvas-soft 상자(rounded 24 · 안쪽 16 · 사이 16). 항목마다 작은 제목(caption muted) 위 + 본문(body-sm ink), 항목 사이 12.
 * 표 아님, 상자 안 스크롤 없음. 마지막 줄 privacy-link.
 */
export function PrivacyConsentDetail({ id, items = PRIVACY_CONSENT_ITEMS, className }: Props) {
  return (
    <div data-component="privacy-consent-detail" id={id} className={[styles.box, className ?? ""].filter(Boolean).join(" ")}>
      <dl className={styles.items}>
        {items.map((it) => (
          <div key={it.title} className={styles.item}>
            <dt className={styles.title}>{it.title}</dt>
            <dd className={styles.body}>{it.body}</dd>
          </div>
        ))}
      </dl>
      <PrivacyLink />
    </div>
  );
}
