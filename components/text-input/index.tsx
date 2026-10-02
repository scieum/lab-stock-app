import { useId } from "react";
import { Icon } from "@/components/icons";
import styles from "./styles.module.css";

type Props = {
  /** 위 라벨 (없으면 상자만) */
  label?: string;
  required?: boolean;
  /** 앞 아이콘(search) / 뒤 아이콘(calendar) */
  icon?: "search" | "calendar";
  /** 뒤 단위 칩 (예: g, mL) */
  unit?: string;
  /** 상자 안 뒤쪽 요소 (예: 비밀번호 보기 버튼) */
  trailing?: React.ReactNode;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "required">;

/** 입력 상자 (회색 바탕, radius 16). 라벨이 있으면 라벨 + 필수 표시 + 상자. */
export function TextInput({ label, required, icon, unit, trailing, id, className, ...rest }: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const cls = [styles.field, className ?? ""].join(" ").trim();
  return (
    <div data-component="text-input" className={cls}>
      {label ? (
        <div className={styles.labelRow}>
          <label htmlFor={inputId} className={styles.label}>
            {label}
          </label>
          {required ? <span className={styles.required}>필수</span> : null}
        </div>
      ) : null}
      <div className={styles.box}>
        {icon === "search" ? <Icon name="search" className={styles.icon} /> : null}
        <input
          id={inputId}
          className={styles.input}
          required={required}
          aria-label={label ? undefined : rest.placeholder}
          {...rest}
        />
        {icon === "calendar" ? <Icon name="calendar" className={styles.icon} /> : null}
        {unit ? <span className={styles.unit}>{unit}</span> : null}
        {trailing}
      </div>
    </div>
  );
}
