import styles from "./styles.module.css";

type Props = {
  /** 학교 안 고정 번호 1, 2, 3 … (d7 §14 cabinets.number — 이름과 별개, 바뀌지 않음) */
  number: number;
  className?: string;
  /**
   * true = data-component 를 붙이지 않는다 (인쇄용 사본 — 화면에는 보이지 않는 인쇄 전용 라벨 안).
   * 화면의 시약장 번호는 늘 false.
   */
  bare?: boolean;
};

/**
 * 시약장 번호 원 (디자인 1.15 cabinet-number): 흰 원 + 회색 테두리 한 줄 안 숫자(12/600 기본색).
 * 전환 pill 이름 앞 · 시약장 제목 앞 · 화면 3 보관 위치 · QR 라벨에 쓴다. 핑크·하늘색 글자 없음.
 * 숫자 원 자체는 읽기 도구에서 숨긴다(aria-hidden) — 번호가 필요한 자리는 부르는 쪽이 이름에 "N번" 을 넣는다
 * (예: cabinet-switcher pill 의 aria-label).
 */
export function CabinetNumber({ number, className, bare = false }: Props) {
  const cls = [styles.number, className ?? ""].filter(Boolean).join(" ");
  if (bare) {
    return (
      <span className={cls} aria-hidden="true">
        {number}
      </span>
    );
  }
  return (
    <span data-component="cabinet-number" className={cls} aria-hidden="true">
      {number}
    </span>
  );
}
