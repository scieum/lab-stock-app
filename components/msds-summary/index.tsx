import { GhsPictogram } from "@/components/ghs-pictogram";
import { MsdsSkeleton } from "@/components/msds-skeleton";
import { MSDS_SECTION_KEYS, MSDS_SECTION_TITLES, MSDS_SUMMARY_TEXT, type MsdsSummary as Summary } from "@/lib/msds-summary";
import { MsdsSection } from "./section";
import styles from "./styles.module.css";

type Props =
  | { summary: Summary; loading?: false }
  /** 16-loading: 안에 msds-skeleton 만 */
  | { summary?: undefined; loading: true };

/**
 * 화면 16 MSDS 요약 (시안 16 msds-summary): 신호어 pill → 그림문자 줄(ghs-pictogram) → 항목 2·4·7·8 카드.
 * 신호어가 없으면 그 줄을, 그림문자가 없으면 그림문자 줄을 그리지 않는다. 항목이 비면 "내용이 없어요".
 */
export function MsdsSummary(props: Props) {
  if (props.loading) {
    return (
      <section data-component="msds-summary" className={styles.summary} aria-label="MSDS 요약" aria-busy="true">
        <MsdsSkeleton />
      </section>
    );
  }
  const { signalWord, pictograms, sections } = props.summary;
  return (
    <section data-component="msds-summary" className={styles.summary} aria-label="MSDS 요약">
      {signalWord ? (
        <div className={styles.signalRow}>
          <span className={styles.signalCaption}>{MSDS_SUMMARY_TEXT.signalCaption}</span>
          <span className={[styles.signal, signalWord === "위험" ? styles.danger : styles.warning].join(" ")} data-signal-word={signalWord}>
            {signalWord}
          </span>
        </div>
      ) : null}
      {pictograms.length > 0 ? (
        <div className={styles.pictograms}>
          {pictograms.map((code) => (
            <GhsPictogram key={code} code={code} />
          ))}
        </div>
      ) : null}
      {MSDS_SECTION_KEYS.map((key) => (
        <MsdsSection key={key} title={MSDS_SECTION_TITLES[key]} lines={sections[key]} />
      ))}
    </section>
  );
}
