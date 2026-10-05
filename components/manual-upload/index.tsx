import { useId } from "react";
import { ButtonPillSoft } from "@/components/button-pill-soft";
import { Icon } from "@/components/icons";
import styles from "./styles.module.css";

type Props = {
  /**
   * guide = 화면 6 의 재주문 기준 안내 박스 + "실험 매뉴얼 올리기" 진입 (지금은 이것만).
   * 화면 5 의 업로드 영역은 다음 run 에서 이 자리에 변형으로 더한다.
   */
  variant?: "guide";
  /** 안내 제목 (body-sm 굵게) */
  title?: string;
  /** 안내 본문 (body) */
  description?: string;
  /** "실험 매뉴얼 올리기" 가 가는 곳 (화면 5). 없으면 버튼을 그리지 않는다 */
  href?: string;
  actionLabel?: string;
  /** 안내와 버튼 사이·아래에 더 둘 내용 (변형용 자리) */
  children?: React.ReactNode;
};

/**
 * 재주문 기준 안내 박스 + 실험 매뉴얼 진입 (화면 6, 교사·admin 전용 — 학생 화면에는 0개, R1).
 * 연하늘 바탕 + 하늘색 정보 아이콘, 글자는 기본 글자색.
 */
export function ManualUpload({
  variant = "guide",
  title = "재주문 기준",
  description = "필요량 = 1반 1회 실험량 × 조 수",
  href,
  actionLabel = "실험 매뉴얼 올리기",
  children,
}: Props) {
  const titleId = useId();
  return (
    <section data-component="manual-upload" data-variant={variant} className={styles.box} aria-labelledby={titleId}>
      <div className={styles.guide}>
        <Icon name="info" className={styles.icon} />
        <div className={styles.text}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <p className={styles.body}>{description}</p>
        </div>
      </div>
      {children}
      {href ? (
        <div className={styles.action}>
          <ButtonPillSoft href={href} icon="chevron-right">
            {actionLabel}
          </ButtonPillSoft>
        </div>
      ) : null}
    </section>
  );
}
