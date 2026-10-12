// 센서 서류로 등록 (design/rules.json 1.28 sensor.doc, d7 §28) — 확인 표 문구·연결 규칙. 순수 함수 — 서버·클라이언트 공용.
// 저장(record_sensor_document)·추출 API 는 D2·D3 에서 붙인다.

import type { SensorStatus, SensorType } from "@/lib/sensor-rules";

export const SENSOR_DOC_TEXT = {
  entry: "서류로 등록",
  entryCaption: "품의서·영수증을 AI가 읽어요",
  direct: "직접 입력",
  review: "읽은 내용이 맞는지 확인해 주세요",
  addExisting: "기존 센서에 더하기",
  newSensor: "새 센서로 등록",
  change: "바꾸기",
  exclude: "빼기",
  include: "다시 넣기",
  excluded: "등록하지 않아요",
  pickTitle: "우리 학교 센서 고르기",
  catalogBadge: "카탈로그",
  modelPlaceholder: "모델명 (선택)",
} as const;

/** 표 머리 "읽은 센서 3개" */
export function sensorDocTitle(count: number): string {
  return `읽은 센서 ${count}개`;
}

/** 표 아래 접힌 묶음 "센서 아님 1개" */
export function notSensorText(count: number): string {
  return `센서 아님 ${count}개`;
}

/** 저장 버튼 "확인 후 등록 · 3개" */
export function sensorDocSaveText(count: number): string {
  return `확인 후 등록 · ${count}개`;
}

/** 저장 뒤 토스트 "센서 3개를 등록했어요" */
export function sensorDocDoneText(count: number): string {
  return `센서 ${count}개를 등록했어요`;
}

/** 연결 줄 "기존 센서에 더하기 · 무선 온도 센서 · 지금 3개 → 5개" */
export function sensorLinkSummary(name: string, current: number, add: number): string {
  return `${SENSOR_DOC_TEXT.addExisting} · ${name} · 지금 ${current}개 → ${current + add}개`;
}

/** 연결: 기존 센서에 더하기 · 새 센서 · 빼기 */
export type SensorDocLink = { kind: "sensor"; sensorId: string } | { kind: "new" } | { kind: "none" };

export type SchoolSensor = { id: string; name: string; maker: string; model: string | null; quantity: number };

function sameKey(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/\s/g, "");
}

/** 같은 회사 + 같은 모델(대소문자·공백 무시) 우리 학교 센서. 모델이 비었으면 맞추지 않는다 (d7 §28 센서 확인 표) */
export function matchSchoolSensor<T extends SchoolSensor>(item: { maker: string | null; model: string | null }, sensors: readonly T[]): T | null {
  const maker = sameKey(item.maker);
  const model = sameKey(item.model);
  if (!maker || !model) return null;
  return sensors.find((s) => sameKey(s.maker) === maker && sameKey(s.model) === model) ?? null;
}

/** 새 센서 칸 값 (new-sensor-fields) */
export type NewSensorDraft = {
  name: string;
  type: SensorType | "";
  maker: string;
  model: string;
  quantity: string;
  locationMode: "text" | "slot";
  locationText: string;
  slotId: string | null;
  status: SensorStatus;
  /** 카탈로그로 채운 칸 (옆에 caption "카탈로그") */
  catalogFilled?: readonly ("name" | "type")[];
};
