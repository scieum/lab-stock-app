import { TextInput } from "@/components/text-input";

type Props = {
  /** "YYYY-MM-DD" */
  value: string;
  /** 고를 수 있는 마지막 날 = 오늘 (한국 날짜, "YYYY-MM-DD") */
  max: string;
  /** 없으면 처음 값만 보여 주는 예시 (갤러리 정적 예시) */
  onChange?: (value: string) => void;
  label?: string;
  name?: string;
  disabled?: boolean;
  error?: string;
  id?: string;
  className?: string;
};

/**
 * 사용일 (디자인 1.17 usage-date, 화면 4 수량 아래): 화면 7 입고일과 같은 모양 —
 * 라벨 "사용일" + "필수" + 회색 상자 안 날짜 + 하늘색 달력 아이콘. 기본 오늘, 날짜 고르기의 최댓값 = 오늘.
 * 겉모양은 text-input 과 같고 data-component 만 usage-date 다.
 */
export function UsageDate({ value, max, onChange, label = "사용일", name = "used_on", disabled, error, id, className }: Props) {
  return (
    <TextInput
      data-component="usage-date"
      label={label}
      required
      icon="calendar"
      type="date"
      name={name}
      id={id}
      className={className}
      max={max}
      {...(onChange ? { value, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value) } : { defaultValue: value })}
      disabled={disabled}
      error={error}
    />
  );
}
