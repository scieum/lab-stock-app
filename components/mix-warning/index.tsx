import { useId } from "react";
import { Icon } from "@/components/icons";
import styles from "./styles.module.css";

type Props = {
  /** 경고 줄 문구 ("좌1단: 산과 염기는 섞이면 위험해요. 다른 칸에 나눠 보관하세요") — 0줄이면 아무것도 그리지 않는다 */
  lines: readonly string[];
  title?: string;
};

/**
 * 혼재 "주의사항" 목록 (화면 11). 연핑크 바탕, 경고 아이콘만 진한 핑크, 글자는 기본색.
 * 보기 전용 — 학생 화면에도 같은 모양으로 보인다. 줄이 바뀌면 읽기 도구에 알린다.
 */
export function MixWarning({ lines, title = "주의사항" }: Props) {
  const titleId = useId();
  if (lines.length === 0) return null;
  return (
    <section data-component="mix-warning" className={styles.box} aria-labelledby={titleId} aria-live="polite">
      <h3 id={titleId} className={styles.title}>
        {title}
      </h3>
      <ul className={styles.list}>
        {lines.map((line) => (
          <li key={line} className={styles.line}>
            <Icon name="warning" className={styles.icon} />
            <span className={styles.text}>{line}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
