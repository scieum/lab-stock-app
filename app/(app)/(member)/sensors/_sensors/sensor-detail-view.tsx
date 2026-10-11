"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DetailDrawer } from "@/components/detail-drawer";
import { SensorDelete, SensorDeleteConfirm } from "@/components/sensor-delete";
import { SensorDetail } from "@/components/sensor-detail";
import { SensorEdit } from "@/components/sensor-edit";
import { DesktopOnly, MobileOnly } from "@/components/viewport-only";
import { clearFlashToast, setFlashToast } from "@/lib/flash-toast";
import { SENSOR_TEXT } from "@/lib/sensor-rules";
import type { SensorItem } from "@/lib/supabase/sensors";
import { archiveSensorAction } from "../actions";
import { sensorEditHref, sensorListHref, type SensorBase } from "./hrefs";
import styles from "./sensors.module.css";

type Props = {
  sensor: SensorItem;
  canEdit: boolean;
  base?: SensorBase;
};

/** 센서 삭제 흐름: ⋯ → "센서 삭제" → 확인 → archive_sensor → 목록 + 토스트 "센서를 삭제했어요" */
function useSensorDelete(sensor: SensorItem, listHref: string) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  // 폭마다 ⋯ 버튼이 따로 있다 (MobileOnly · DesktopOnly) — 하이드레이션 뒤 맞지 않는 폭 쪽은 빠지므로 지금 문서에 남은 쪽으로 돌려준다
  const mobileMoreRef = useRef<HTMLButtonElement>(null);
  const deskMoreRef = useRef<HTMLButtonElement>(null);

  const cancel = () => {
    if (pending) return;
    setConfirming(false);
    setError(null);
    // 확인 모달을 닫으면(취소 · × · Esc) 포커스를 ⋯ 로 돌려준다
    window.requestAnimationFrame(() => {
      const target = [deskMoreRef.current, mobileMoreRef.current].find((el) => el && el.isConnected && el.getClientRects().length > 0);
      target?.focus({ preventScroll: true });
    });
  };

  const confirm = () => {
    if (pending || done) return;
    setError(null);
    setFlashToast(SENSOR_TEXT.deleteDone);
    startTransition(async () => {
      const res = await archiveSensorAction({ sensorId: sensor.id });
      if (!res.ok) {
        clearFlashToast();
        setError(res.error);
        return;
      }
      setDone(true);
      router.replace(listHref);
    });
  };

  return { confirming, open: () => setConfirming(true), cancel, confirm, pending, error, done, mobileMoreRef, deskMoreRef };
}

/**
 * 화면 17 센서 상세 (디자인 1.26 17-detail): 모바일 = 전용 화면(sensor-detail + 제목 줄 ⋯ sensor-delete, 아래 edit-bar sensor-edit),
 * 데스크톱 = 목록 옆 detail-drawer(머리 ⋯ + ×, 아래 drawer-foot sensor-edit). 수정 · 삭제는 교사·admin 만.
 */
export function SensorDetailView({ sensor, canEdit, base = "" }: Props) {
  const sp = useSearchParams();
  const listHref = sensorListHref(sp, base);
  const del = useSensorDelete(sensor, listHref);
  const editHref = sensorEditHref(sensor.id, sp);

  const deleteMenu = (ref: React.RefObject<HTMLButtonElement | null>) =>
    canEdit ? <SensorDelete name={sensor.name} onSelect={del.open} disabled={del.done} buttonRef={ref} /> : undefined;

  return (
    <>
      <MobileOnly>
        <div className={styles.screen}>
          <SensorDetail sensor={sensor} titleAction={deleteMenu(del.mobileMoreRef)} />
          {canEdit ? (
            <>
              <div className={styles.bottomSpace} />
              <div className={styles.bottomBar} data-name="edit-bar">
                <SensorEdit href={editHref} />
              </div>
            </>
          ) : null}
        </div>
      </MobileOnly>
      <DesktopOnly>
        <DetailDrawer
          key={sensor.id}
          focusKey={sensor.id}
          title={SENSOR_TEXT.detailTitle}
          closeHref={listHref}
          headActions={deleteMenu(del.deskMoreRef)}
          actions={canEdit ? <SensorEdit href={editHref} /> : undefined}
        >
          <SensorDetail sensor={sensor} />
        </DetailDrawer>
      </DesktopOnly>
      {canEdit && del.confirming ? (
        <div className={styles.deleteDialog}>
          <SensorDeleteConfirm
            name={sensor.name}
            pending={del.pending}
            error={del.error}
            modal={false}
            onCancel={del.cancel}
            onConfirm={del.confirm}
          />
        </div>
      ) : null}
    </>
  );
}
