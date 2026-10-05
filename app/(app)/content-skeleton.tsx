import styles from "./content-skeleton.module.css";

type Props = {
  /** 위쪽 막대(검색·필터 자리) 수 */
  bars?: number;
  /** 아래쪽 블록(행·카드 자리) 수 */
  blocks?: number;
};

/**
 * 본문 자리 표시 (loading.tsx) — 서버 응답을 기다리는 동안 셸(nav-pill·tab-bar)은 그대로 두고 본문 자리에만 보인다.
 * 글자·데이터 없음(학교명 포함), 시안 컴포넌트가 아니라 data-component 를 붙이지 않는다. 색·크기는 토큰만.
 */
export function ContentSkeleton({ bars = 1, blocks = 4 }: Props) {
  return (
    <div className={styles.skeleton} aria-busy="true">
      {Array.from({ length: bars }, (_, i) => (
        <span key={`bar-${i}`} className={styles.bar} aria-hidden="true" />
      ))}
      {Array.from({ length: blocks }, (_, i) => (
        <span key={`block-${i}`} className={styles.block} aria-hidden="true" />
      ))}
    </div>
  );
}
