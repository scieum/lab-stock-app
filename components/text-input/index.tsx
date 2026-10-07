import { useId } from "react";
import { Icon } from "@/components/icons";
import styles from "./styles.module.css";

type Props = {
  /** 위 라벨 (없으면 상자만) */
  label?: string;
  required?: boolean;
  /** 앞 아이콘(search) / 뒤 아이콘(calendar) */
  icon?: "search" | "calendar";
  /** 뒤 단위 (예: g, mL) */
  unit?: string;
  /** chip = 하늘색 칩(기본, 화면 4), plain = 회색 글자 suffix(화면 7) */
  unitTone?: "chip" | "plain";
  /** strong = 진한 라벨(화면 7 폼) */
  labelTone?: "default" | "strong";
  /** compact = 스테퍼 가운데 수량 칸 (좁은 여백, 굵은 값) · cell = 표 셀 안 작은 입력 (화면 5 사용량, 13 글자·안쪽 4·8) */
  density?: "default" | "compact" | "cell";
  /** 사용자가 고친 칸 = 연하늘 바탕 (화면 5 추출 결과) */
  edited?: boolean;
  /** 입력 아래 안내 문구 (오류) */
  error?: string;
  /** 상자 안 뒤쪽 요소 (예: 비밀번호 보기 버튼) */
  trailing?: React.ReactNode;
  /** 상자 아래 오른쪽 글자 수 ("6/20", caption 회색 — 화면 11 이름 시트). 세는 것은 부르는 쪽이 한다 */
  counter?: string;
  /**
   * 바깥 틀의 data-component (기본 "text-input"). 같은 모양을 쓰는 시안 컴포넌트(usage-date)가 자기 이름을 넘긴다.
   */
  "data-component"?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "required">;

/** 입력 상자 (회색 바탕, radius 16). 라벨이 있으면 라벨 + 필수 표시 + 상자. */
export function TextInput({
  label,
  required,
  icon,
  unit,
  unitTone = "chip",
  labelTone = "default",
  density = "default",
  error,
  trailing,
  counter,
  edited,
  id,
  className,
  "data-component": component = "text-input",
  ...rest
}: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;
  const counterId = `${inputId}-counter`;
  const describedBy = [error ? errorId : "", counter ? counterId : ""].filter(Boolean).join(" ") || undefined;
  const cls = [styles.field, labelTone === "strong" ? styles.strong : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <div data-component={component} data-edited={edited ? "" : undefined} className={cls}>
      {label ? (
        <div className={styles.labelRow}>
          <label htmlFor={inputId} className={styles.label}>
            {label}
          </label>
          {required ? <span className={styles.required}>필수</span> : null}
        </div>
      ) : null}
      <div
        className={[
          styles.box,
          density === "compact" ? styles.compact : "",
          density === "cell" ? styles.cell : "",
          edited ? styles.edited : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {icon === "search" ? <Icon name="search" className={styles.icon} /> : null}
        <input
          id={inputId}
          className={styles.input}
          required={required}
          aria-label={label ? undefined : rest.placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...rest}
        />
        {icon === "calendar" ? <Icon name="calendar" className={styles.icon} /> : null}
        {unit ? <span className={unitTone === "plain" ? styles.unitPlain : styles.unit}>{unit}</span> : null}
        {trailing}
      </div>
      {error ? (
        <p id={errorId} role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      {counter ? (
        <p id={counterId} className={styles.counter}>
          {counter}
        </p>
      ) : null}
    </div>
  );
}

export type TextInputSelectOption = { value: string; label: string };

type SelectProps = {
  /** 위 라벨 (없으면 상자만 — 이때는 aria-label 을 넘긴다) */
  label?: string;
  options: TextInputSelectOption[];
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children">;

/** 드롭다운 입력 상자 (화면 10 기간): 회색 상자 + 값 + 하늘색 펼침 아이콘 */
export function TextInputSelect({ label, options, id, className, ...rest }: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <div data-component="text-input" className={[styles.field, className ?? ""].filter(Boolean).join(" ")}>
      {label ? (
        <div className={styles.labelRow}>
          <label htmlFor={selectId} className={styles.label}>
            {label}
          </label>
        </div>
      ) : null}
      <div className={[styles.box, styles.selectBox].join(" ")}>
        <select id={selectId} className={styles.select} {...rest}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Icon name="chevron-down" className={[styles.icon, styles.selectIcon].join(" ")} />
      </div>
    </div>
  );
}
