import Link from "next/link";
import { Icon } from "@/components/icons";
import styles from "./styles.module.css";

type Props = {
  /** landing-tabs 가 가리키는 앵커 id */
  id: string;
  /** section-tag (꼬리표, 13/600) */
  tag: string;
  /** section-title (40/700 — typography.display_sizes, landing-section 안에서만) */
  title: string;
  /** point-list — 하늘색 점 + 15/400, 3줄 */
  points: string[];
  /** section-link (예: "둘러보기에서 보기" → /demo/...) */
  link?: { href: string; label: string };
  /** 화면 조각 — 뒤 큰 조각(화면 끝까지 닿는다) */
  shot: React.ReactNode;
  /** 화면 조각 — 앞에 겹치는 작은 조각 */
  overlay?: React.ReactNode;
  /** 글 쪽 (시안: 2·4번째 띠는 글 왼쪽, 3·5번째는 글 오른쪽 — 좌우 번갈아) */
  side?: "left" | "right";
  /** 띠 배경 (rules.json landing_rhythm.bands: 흰 ↔ gray-50 번갈아) — 꼬리표 바탕은 그 반대 */
  band?: "white" | "muted";
  /** 조각 배치 (시안 15-desktop section-band-2~5 의 shot 크기·겹침 위치) */
  shape?: "list" | "usage" | "reorder" | "cabinet";
};

/**
 * 랜딩 기능 섹션 (시안 15-desktop landing-section, 1440 × 480 전폭 띠): 글 묶음(480) = section-tag → section-title 40/700 →
 * point-list(점 3) → section-link, 반대쪽에 화면 조각 2개(뒤 큰 조각은 화면 끝까지, 앞 작은 조각이 겹친다).
 * 섹션 제목·조각은 화면에 들어올 때 한 번 떠오른다 (data-reveal — landing-motion).
 */
export function LandingSection({ id, tag, title, points, link, shot, overlay, side = "left", band = "white", shape = "list" }: Props) {
  const titleId = `${id}-title`;
  return (
    <section
      id={id}
      data-component="landing-section"
      data-landing-section=""
      aria-labelledby={titleId}
      data-shape={shape}
      className={[styles.band, band === "muted" ? styles.muted : styles.white, side === "right" ? styles.copyRight : styles.copyLeft].join(" ")}
    >
      <div className={styles.container}>
        <div className={styles.copy}>
          <div className={styles.head} data-reveal="">
            <span className={styles.tag}>{tag}</span>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
          </div>
          <ul className={styles.points} data-reveal="">
            {points.map((p) => (
              <li key={p} className={styles.point}>
                <span className={styles.dot} aria-hidden="true" />
                {p}
              </li>
            ))}
          </ul>
          {link ? (
            <Link href={link.href} className={styles.link}>
              {link.label}
              <Icon name="chevron-right" className={styles.linkIcon} />
            </Link>
          ) : null}
        </div>
      </div>
      <div className={styles.stage}>
        <div className={styles.back} data-reveal="">
          {shot}
        </div>
        {overlay ? (
          <div className={styles.front} data-reveal="">
            {overlay}
          </div>
        ) : null}
      </div>
    </section>
  );
}
