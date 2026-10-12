import Link from "next/link";
import { forwardRef } from "react";
import { Icon } from "@/components/icons";
import { LinkPending } from "@/components/link-pending";
import { linkPrefetch } from "@/lib/link-prefetch";
import styles from "./styles.module.css";

type Props = {
  href: string;
  /** 글자 — 데스크톱 머리 · 빈 상태 "센서 등록" */
  label?: string;
  /** 빈 상태 카드 안 — 전폭 48 */
  fullWidth?: boolean;
  className?: string;
};

/**
 * 센서 등록 진입 (디자인 1.26 sensor.list · empty, sensor-add): button-primary + plus 아이콘. 교사·admin 만 (R5 — 학생 · 둘러보기 0).
 */
export function SensorAdd({ href, label = "센서 등록", fullWidth = false, className }: Props) {
  return (
    <div data-component="sensor-add" className={[styles.wrap, fullWidth ? styles.full : "", className ?? ""].filter(Boolean).join(" ")}>
      <Link data-component="button-primary" href={href} prefetch={linkPrefetch(href)} className={styles.button}>
        <Icon name="plus" className={styles.icon} />
        <span>{label}</span>
        <LinkPending />
      </Link>
    </div>
  );
}

type MenuProps = {
  /** 글자 — 모바일 머리 "등록" */
  label?: string;
  /** 시트가 열려 있는가 */
  expanded?: boolean;
  onClick?: () => void;
  className?: string;
};

/**
 * 모바일 목록 머리 sensor-add (rules 1.28 sensor.add_mobile, 시안 17-mobile): button-pill-soft "+ 등록" →
 * 작은 바텀시트 "서류로 등록 / 직접 입력"(SensorAddChoiceSheet)을 연다. 교사·admin 만.
 */
export const SensorAddMenuButton = forwardRef<HTMLButtonElement, MenuProps>(function SensorAddMenuButton(
  { label = "등록", expanded = false, onClick, className },
  ref,
) {
  return (
    <div data-component="sensor-add" className={[styles.wrap, className ?? ""].filter(Boolean).join(" ")}>
      <button
        ref={ref}
        type="button"
        data-component="button-pill-soft"
        className={styles.soft}
        aria-haspopup="dialog"
        aria-expanded={expanded}
        onClick={onClick}
      >
        <Icon name="plus" className={styles.softIcon} />
        <span>{label}</span>
      </button>
    </div>
  );
});
