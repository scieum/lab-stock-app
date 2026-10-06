import { useId } from "react";
import { Icon } from "@/components/icons";
import styles from "./styles.module.css";

type Props = {
  /** 경고 줄 문구 ("좌1단: 산과 염기는 섞이면 위험해요. 다른 칸에 나눠 보관하세요") — 0줄이면 아무것도 그리지 않는다 */
  lines: readonly string[];
  /** 목록 제목 (list 모양) */
  title?: string;
  /**
   * list(기본) = "주의사항" 제목 + 줄마다 경고 아이콘 (화면 11 배치도 아래).
   * inline = 제목 없이 아이콘 1개 + 문구 (디자인 1.15 칸 배치 경고 — 11-slot 칸 시트 · 3-location 위치 피커)
   */
  variant?: "list" | "inline";
  /**
   * inline 의 세기: mismatch = 분류 불일치(약한 문구 한 줄), incompatible = 섞으면 위험한 조합(첫 줄 굵게 + note).
   * 색은 둘 다 같다 (연핑크 바탕 · 핑크 아이콘 · 기본색 글자).
   */
  tone?: "mismatch" | "incompatible";
  /** inline 의 보조 줄 ("그래도 저장할 수 있어요") */
  note?: string;
};

/**
 * 혼재 경고 (화면 11 · 화면 3 위치 피커). 연핑크 바탕, 경고 아이콘만 진한 핑크, 글자는 기본색.
 * 보기 전용 — 학생 화면에도 같은 모양으로 보인다. 줄이 바뀌면 읽기 도구에 알린다. 저장·넣기를 막지 않는다(경고만).
 */
export function MixWarning({ lines, title = "주의사항", variant = "list", tone = "mismatch", note }: Props) {
  const titleId = useId();
  if (lines.length === 0) return null;
  if (variant === "inline") {
    return (
      <section data-component="mix-warning" data-tone={tone} className={[styles.box, styles.inline].join(" ")} aria-live="polite" aria-label="주의">
        <Icon name="warning" className={styles.icon} />
        <div className={styles.inlineText}>
          {lines.map((line) => (
            <p key={line} className={tone === "incompatible" ? styles.textStrong : styles.text}>
              {line}
            </p>
          ))}
          {note ? <p className={styles.text}>{note}</p> : null}
        </div>
      </section>
    );
  }
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
