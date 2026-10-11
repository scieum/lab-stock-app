"use client";

import { useId, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ButtonPrimary } from "@/components/button-primary";
import { DetailDrawer } from "@/components/detail-drawer";
import type { LocationPickerCabinet } from "@/components/location-picker";
import { SensorForm, type SensorFormInitial, type SensorFormSlot } from "@/components/sensor-form";
import { DesktopOnly, MobileOnly } from "@/components/viewport-only";
import { clearFlashToast, setFlashToast } from "@/lib/flash-toast";
import { SENSOR_TEXT, type SensorField, type SensorInput } from "@/lib/sensor-rules";
import { upsertSensorAction } from "../actions";
import { sensorDetailHref, sensorListHref } from "./hrefs";
import styles from "./sensors.module.css";

type Props = {
  initial: SensorFormInitial;
  cabinets: LocationPickerCabinet[];
  slots: SensorFormSlot[];
};

/**
 * 화면 17 센서 등록 · 수정 (디자인 1.26 17-form): 모바일 = 전용 화면(sensor-form + 아래 save-bar "저장"),
 * 데스크톱 = 목록 옆 detail-drawer(제목 "센서 등록" · ×, 아래 drawer-foot "저장"). 저장하면 상세로 + 토스트 "센서를 저장했어요".
 */
export function SensorFormView({ initial, cabinets, slots }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{ message: string; field?: SensorField } | null>(null);
  const editing = initial.id !== null;
  const title = editing ? SENSOR_TEXT.formEdit : SENSOR_TEXT.formAdd;
  const cancelHref = editing && initial.id ? sensorDetailHref(initial.id, sp) : sensorListHref(sp);

  const save = (value: SensorInput) => {
    setError(null);
    setFlashToast(SENSOR_TEXT.saved);
    startTransition(async () => {
      const res = await upsertSensorAction(value);
      if (!res.ok) {
        clearFlashToast();
        setError({ message: res.error, field: res.field });
        return;
      }
      router.replace(sensorDetailHref(res.sensorId, sp));
    });
  };

  const form = (id: string) => (
    <SensorForm
      id={id}
      initial={initial}
      cabinets={cabinets}
      slots={slots}
      onSubmit={save}
      pending={pending}
      error={error?.message ?? null}
      errorField={error?.field}
    />
  );

  const submit = (id: string) => (
    <ButtonPrimary type="submit" form={id} fullWidth disabled={pending} aria-busy={pending || undefined}>
      저장
    </ButtonPrimary>
  );

  return (
    <>
      <MobileOnly>
        <div className={styles.screen}>
          {form(`${formId}-m`)}
          <div className={styles.bottomSpace} />
          <div className={styles.bottomBar} data-name="save-bar">
            {submit(`${formId}-m`)}
          </div>
        </div>
      </MobileOnly>
      <DesktopOnly>
        <DetailDrawer title={title} closeHref={cancelHref} actions={submit(`${formId}-d`)}>
          {form(`${formId}-d`)}
        </DetailDrawer>
      </DesktopOnly>
    </>
  );
}
