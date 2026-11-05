import { PrivacyTable } from "@/components/privacy-table";
import { PrivacyToc } from "@/components/privacy-toc";
import { PRIVACY_EFFECTIVE_DATE, PRIVACY_SECTIONS, PRIVACY_TITLE, type PrivacySection } from "@/lib/privacy";
import styles from "./styles.module.css";

type Props = {
  title?: string;
  effectiveDate?: string;
  sections?: PrivacySection[];
  className?: string;
};

/**
 * privacy-doc (rules 1.32 privacy_page.doc, 시안 19): 제목 '개인정보 처리방침'(heading-2) → '시행일 …'(caption muted) → privacy-toc
 * → 번호 절(title 17/600 + body 15/400, 절 사이 24). 4절은 문단 뒤 privacy-table + 국외 이전 고지 문장.
 * 읽기 단 최대 폭 = 부르는 쪽(화면 19)이 정한다.
 */
export function PrivacyDoc({ title = PRIVACY_TITLE, effectiveDate = PRIVACY_EFFECTIVE_DATE, sections = PRIVACY_SECTIONS, className }: Props) {
  return (
    <article data-component="privacy-doc" className={[styles.doc, className ?? ""].filter(Boolean).join(" ")}>
      <header className={styles.head}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.date}>시행일 {effectiveDate}</p>
      </header>
      <PrivacyToc items={sections.map((s) => ({ id: s.id, label: s.title }))} />
      <div className={styles.sections}>
        {sections.map((s) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className={styles.section}>
            <h2 id={`${s.id}-title`} className={styles.sectionTitle}>
              {s.title}
            </h2>
            <div className={styles.content}>
              {s.paragraphs.map((p) => (
                <p key={p} className={styles.body}>
                  {p}
                </p>
              ))}
              {s.table ? <PrivacyTable /> : null}
              {s.after?.map((p) => (
                <p key={p} className={styles.body}>
                  {p}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}
