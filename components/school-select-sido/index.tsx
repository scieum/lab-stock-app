"use client";

import { SelectField, type SelectFieldProps } from "@/components/select-field";

type Props = Omit<SelectFieldProps, "label"> & { label?: string };

/** 학교 선택 단계: 시/도 (목록은 /api/neis 응답에서만 채운다) */
export function SchoolSelectSido({ label = "시/도", ...rest }: Props) {
  return (
    <div data-component="school-select-sido">
      <SelectField label={label} {...rest} />
    </div>
  );
}
