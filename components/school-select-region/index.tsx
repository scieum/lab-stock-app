"use client";

import { SelectField, type SelectFieldProps } from "@/components/select-field";

type Props = Omit<SelectFieldProps, "label"> & { label?: string };

/** 학교 선택 단계: 지역(시/군/구) (목록은 /api/neis 응답에서만 채운다) */
export function SchoolSelectRegion({ label = "지역(시/군/구)", ...rest }: Props) {
  return (
    <div data-component="school-select-region">
      <SelectField label={label} {...rest} />
    </div>
  );
}
