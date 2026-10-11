"use client";

import { useState } from "react";
import { ButtonPrimary } from "@/components/button-primary";
import { CabinetNumber } from "@/components/cabinet-number";
import { Icon } from "@/components/icons";
import { LocationPicker, type LocationChoice, type LocationPickerCabinet } from "@/components/location-picker";
import { SegmentedControl } from "@/components/segmented-control";
import { SensorMakerSelect } from "@/components/sensor-maker-select";
import { SensorTypeSelect } from "@/components/sensor-type-select";
import { TextInput } from "@/components/text-input";
import { locationText } from "@/lib/cabinet-rules";
import {
  SENSOR_LOCATION_MAX,
  SENSOR_MEMO_MAX,
  SENSOR_MODEL_MAX,
  SENSOR_NAME_MAX,
  SENSOR_TEXT,
  EMPTY_SENSOR_FORM,
  checkSensorInput,
  parseQuantity,
  type SensorField,
  type SensorInput,
  type SensorFormInitial,
  type SensorStatus,
  type SensorType,
} from "@/lib/sensor-rules";
import styles from "./styles.module.css";

export type { SensorFormInitial };

/** 시약장 칸 (고른 위치 → slot id) */
export type SensorFormSlot = { id: string; cabinetId: string; side: "L" | "R"; shelf: number };

const STATUS_OPTIONS = [
  { value: "ok", label: "정상" },
  { value: "check", label: "점검 필요" },
  { value: "broken", label: "고장" },
];

const LOCATION_OPTIONS = [
  { value: "text", label: "직접 입력" },
  { value: "slot", label: "시약장 칸" },
];

type Props = {
  /** form id — 저장 버튼을 폼 밖(모바일 save-bar · 데스크톱 drawer-foot)에 둘 때 form 속성으로 잇는다 */
  id: string;
  initial?: SensorFormInitial;
  /** 학교 시약장 (시약장 칸 고르기 — location-picker 재사용). 없으면 "시약장 칸"을 고를 수 없다 */
  cabinets?: readonly LocationPickerCabinet[];
  slots?: readonly SensorFormSlot[];
  onSubmit?: (value: SensorInput) => void;
  pending?: boolean;
  /** 서버 거절 안내 */
  error?: string | null;
  errorField?: SensorField;
  /** true = 폼 안 맨 아래에 "저장" (갤러리) */
  submitInside?: boolean;
};

/**
 * 센서 등록 · 수정 폼 (디자인 1.26 sensor.form, sensor-form): 이름 text-input → 종류 sensor-type-select → 회사 sensor-maker-select →
 * 모델명(선택) + 수량(숫자 + "개") → 보관 위치 segmented "직접 입력 | 시약장 칸"(시약장 칸 = location-picker) →
 * 상태 segmented-control 정상 · 점검 필요 · 고장(기본 정상) → 메모(선택). 저장 = button-primary.
 * 모바일 = 전용 화면 / 데스크톱 = detail-drawer(짧은 폼). 교사·admin 만.
 */
export function SensorForm({
  id,
  initial = EMPTY_SENSOR_FORM,
  cabinets = [],
  slots = [],
  onSubmit,
  pending = false,
  error,
  errorField,
  submitInside = false,
}: Props) {
  const [name, setName] = useState(initial.name);
  const [type, setType] = useState<SensorType | "">(initial.type);
  const [maker, setMaker] = useState(initial.maker);
  const [model, setModel] = useState(initial.model ?? "");
  const [quantity, setQuantity] = useState(initial.quantity === null ? "" : String(initial.quantity));
  const [mode, setMode] = useState<"text" | "slot">(initial.slotId ? "slot" : "text");
  const [place, setPlace] = useState(initial.locationText ?? "");
  const [slotId, setSlotId] = useState<string | null>(initial.slotId);
  const [status, setStatus] = useState<SensorStatus>(initial.status);
  const [memo, setMemo] = useState(initial.memo ?? "");
  const [picking, setPicking] = useState(false);
  const [local, setLocal] = useState<{ field?: SensorField; message: string } | null>(null);

  const slot = slotId ? slots.find((s) => s.id === slotId) : undefined;
  const cabinet = slot ? cabinets.find((c) => c.id === slot.cabinetId) : undefined;
  const canPickSlot = cabinets.length > 0;

  const fieldError = (f: SensorField): string | undefined => {
    if (local?.field === f) return local.message;
    if (errorField === f && error) return error;
    return undefined;
  };

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const checked = checkSensorInput({
      id: initial.id,
      name,
      type,
      maker,
      model,
      quantity: parseQuantity(quantity) ?? quantity,
      locationText: mode === "text" ? place : "",
      slotId: mode === "slot" ? slotId : null,
      status,
      memo,
    });
    if (!checked.ok) {
      setLocal({ field: checked.field, message: checked.error });
      return;
    }
    if (mode === "slot" && !slotId) {
      setLocal({ field: "location", message: "시약장 칸을 골라 주세요" });
      return;
    }
    setLocal(null);
    onSubmit?.(checked.value);
  };

  const choose = (choice: LocationChoice) => {
    if (!choice) {
      setSlotId(null);
      setPicking(false);
      return;
    }
    const s = slots.find((x) => x.cabinetId === choice.cabinetId && x.side === choice.side && x.shelf === choice.shelf);
    if (!s) {
      setLocal({ field: "location", message: "그 칸을 찾을 수 없어요. 시약장 설정에서 칸을 확인해 주세요" });
      setPicking(false);
      return;
    }
    setSlotId(s.id);
    setLocal(null);
    setPicking(false);
  };

  const generalError = error && !errorField ? error : local && !local.field ? local.message : null;

  return (
    <form id={id} data-component="sensor-form" className={styles.form} onSubmit={submit} noValidate>
      <TextInput
        label="이름"
        labelTone="strong"
        name="name"
        placeholder={SENSOR_TEXT.namePlaceholder}
        maxLength={SENSOR_NAME_MAX}
        autoComplete="off"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={fieldError("name")}
      />
      <SensorTypeSelect value={type} onChange={setType} error={fieldError("type")} />
      <SensorMakerSelect value={maker} onChange={setMaker} error={fieldError("maker")} />
      <div className={styles.pair}>
        <TextInput
          className={styles.model}
          label="모델명 (선택)"
          labelTone="strong"
          name="model"
          maxLength={SENSOR_MODEL_MAX}
          autoComplete="off"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          error={fieldError("model")}
        />
        <TextInput
          className={styles.quantity}
          label="수량"
          labelTone="strong"
          name="quantity"
          inputMode="numeric"
          unit="개"
          unitTone="plain"
          autoComplete="off"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          error={fieldError("quantity")}
        />
      </div>
      <div className={styles.group}>
        <span className={styles.label}>보관 위치</span>
        <SegmentedControl
          label="보관 위치 입력 방법"
          options={canPickSlot ? LOCATION_OPTIONS : LOCATION_OPTIONS.slice(0, 1)}
          value={mode}
          onChange={(v) => setMode(v === "slot" ? "slot" : "text")}
        />
        {mode === "text" ? (
          <TextInput
            aria-label="보관 위치"
            name="location"
            placeholder={SENSOR_TEXT.locationPlaceholder}
            maxLength={SENSOR_LOCATION_MAX}
            autoComplete="off"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            error={fieldError("location")}
          />
        ) : (
          <>
            <button type="button" className={styles.slotBox} onClick={() => setPicking(true)}>
              {slot && cabinet ? (
                <span className={styles.slotValue}>
                  <CabinetNumber number={cabinet.number} />
                  <span>{locationText(cabinet, slot)}</span>
                </span>
              ) : (
                <span className={styles.slotPlaceholder}>시약장 칸을 골라 주세요</span>
              )}
              <Icon name="chevron-right" className={styles.slotIcon} />
            </button>
            {fieldError("location") ? <p className={styles.error}>{fieldError("location")}</p> : null}
          </>
        )}
      </div>
      <div className={styles.group}>
        <span className={styles.label}>상태</span>
        <SegmentedControl label="상태" options={STATUS_OPTIONS} value={status} onChange={(v) => setStatus(v as SensorStatus)} />
      </div>
      <TextInput
        label="메모 (선택)"
        labelTone="strong"
        name="memo"
        placeholder={SENSOR_TEXT.memoPlaceholder}
        maxLength={SENSOR_MEMO_MAX}
        autoComplete="off"
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        error={fieldError("memo")}
      />
      {generalError ? (
        <p className={styles.error} role="alert">
          {generalError}
        </p>
      ) : null}
      {submitInside ? (
        <ButtonPrimary type="submit" fullWidth disabled={pending} aria-busy={pending || undefined}>
          저장
        </ButtonPrimary>
      ) : null}
      {picking ? (
        <LocationPicker
          reagentName={name.trim() || "센서"}
          cabinets={cabinets}
          current={slot ? { cabinetId: slot.cabinetId, side: slot.side, shelf: slot.shelf } : null}
          onSave={choose}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </form>
  );
}
