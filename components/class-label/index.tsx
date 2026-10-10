import { classLabelText, type ClassInfo } from "@/lib/class-info";
import styles from "./styles.module.css";

type Props = {
  value: Partial<ClassInfo> | null | undefined;
  /**
   * caption = 모바일 기록 행 caption (12 회색) · cell = 데스크톱 표 열 "수업" (13 기본색, 없으면 "—" 옅은 회색) ·
   * value = 드로어 "수업 | 값" (15 기본색, 없으면 "—")
   */
  variant?: "caption" | "cell" | "value";
  className?: string;
};

/**
 * 수업 표기 (디자인 1.25 class-label): "{학년}학년 {반}반 · {수업명}", 있는 것만 ("1학년", "통합과학").
 * caption 은 값이 없으면 아무것도 그리지 않는다. cell · value 는 "—".
 */
export function ClassLabel({ value, variant = "caption", className }: Props) {
  const text = classLabelText(value);
  if (!text && variant === "caption") return null;
  return (
    <span
      data-component="class-label"
      data-empty={text ? undefined : ""}
      className={[styles.label, styles[variant], text ? "" : styles.empty, className ?? ""].filter(Boolean).join(" ")}
    >
      {text || "—"}
    </span>
  );
}
