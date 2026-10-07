import styles from "./styles.module.css";

type Props = {
  className?: string;
};

/**
 * 추천 배지 (디자인 1.17 suggest-badge, d7 §17): 작은 pill "추천" — 연하늘(highlight-soft) 채움 + 하늘색(highlight) 한 줄 테두리,
 * 글자는 기본색(ink, 12/600). 핑크 금지(결정 신호가 아니라 안내). 위치 피커의 추천 칸·추천 줄, 칸 시트의 시약 넣기 목록,
 * 등록 직후 location-suggest 의 추천 위치 줄에 쓴다.
 */
export function SuggestBadge({ className }: Props) {
  return (
    <span data-component="suggest-badge" className={[styles.badge, className ?? ""].filter(Boolean).join(" ")}>
      추천
    </span>
  );
}
