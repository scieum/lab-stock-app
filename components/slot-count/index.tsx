import styles from "./styles.module.css";

type Props = {
  /** 이 칸에 배치된 시약 수 — 0 이하이면 아무것도 그리지 않는다 */
  count: number;
};

/**
 * 칸 안 시약 수 (디자인 1.15 slot-count): cabinet-slot 안 작은 흰 pill "3" (12/600 기본색).
 * 무채색만 — 수는 결정 신호가 아니라 핑크·하늘색을 쓰지 않는다. 빈 칸에는 그리지 않는다.
 */
export function SlotCount({ count }: Props) {
  if (!(count > 0)) return null;
  return (
    <span data-component="slot-count" className={styles.count} aria-label={`시약 ${count}개`}>
      {count}
    </span>
  );
}
