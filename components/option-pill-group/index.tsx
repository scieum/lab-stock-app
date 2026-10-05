import { useId } from "react";
import styles from "./styles.module.css";

export type OptionPillItem<T extends string | number> = { value: T; label: string };

export type OptionPillGroupProps<T extends string | number> = {
  /** 위 라벨 ("문 형태") — 라디오 묶음의 이름이 된다 */
  label: string;
  options: readonly OptionPillItem<T>[];
  /** 지정하면 부모가 값을 쥔다 (onChange 필요) */
  value?: T;
  /** 부모가 값을 쥐지 않을 때 처음 값 */
  defaultValue?: T;
  onChange?: (value: T) => void;
  disabled?: boolean;
  /** 라디오 name (폼 전송용 — 없으면 자동) */
  name?: string;
};

/**
 * 옵션 pill 단일 선택 묶음 (시안 11 option-group) — cabinet-door-select · cabinet-shelf-select 가 같이 쓴다.
 * 시안 컴포넌트 이름이 아니므로 data-component 를 붙이지 않는다 (부르는 쪽 루트가 붙인다).
 * 진짜 라디오 입력이라 방향키·폼 전송이 그대로 된다.
 */
export function OptionPillGroup<T extends string | number>({
  label,
  options,
  value,
  defaultValue,
  onChange,
  disabled,
  name,
}: OptionPillGroupProps<T>) {
  const autoId = useId();
  const labelId = `${autoId}-label`;
  const groupName = name ?? `${autoId}-option`;
  const controlled = value !== undefined;
  return (
    <>
      <span id={labelId} className={styles.label}>
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className={styles.group}>
        {options.map((o) => (
          <label key={String(o.value)} className={styles.option}>
            <input
              type="radio"
              className={styles.input}
              name={groupName}
              value={String(o.value)}
              disabled={disabled}
              {...(controlled
                ? { checked: o.value === value, onChange: () => onChange?.(o.value) }
                : { defaultChecked: o.value === defaultValue, onChange: onChange ? () => onChange(o.value) : undefined })}
            />
            <span className={styles.text}>{o.label}</span>
          </label>
        ))}
      </div>
    </>
  );
}
