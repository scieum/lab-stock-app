"use client";

import { SelectField, type SelectFieldProps } from "@/components/select-field";

type Props = Omit<SelectFieldProps, "label"> & { label?: string };

/** 학교 선택 단계: 학교 (목록은 /api/neis 응답에서만 채운다) */
export function SchoolSelectSchool({ label = "학교", ...rest }: Props) {
  return (
    <div data-component="school-select-school">
      <SelectField label={label} {...rest} />
    </div>
  );
}
