"use client";

import { useEffect, useState } from "react";
import { SENSOR_HIGHLIGHT_MS, clearSensorHighlight, readSensorHighlight } from "@/lib/sensor-highlight";

/** 서류로 등록 뒤 잠깐 강조할 센서 id (처음 그린 뒤 읽고, SENSOR_HIGHLIGHT_MS 뒤 지운다) */
export function useSensorHighlight(): ReadonlySet<string> {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    const found = readSensorHighlight();
    if (found.length === 0) return;
    const show = window.setTimeout(() => setIds(new Set(found)), 0);
    const hide = window.setTimeout(() => {
      setIds(new Set());
      clearSensorHighlight();
    }, SENSOR_HIGHLIGHT_MS);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, []);
  return ids;
}
