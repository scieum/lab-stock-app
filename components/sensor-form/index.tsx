"use client";

import { useEffect, useId, useState } from "react";
import { ButtonPrimary } from "@/components/button-primary";
import { CabinetNumber } from "@/components/cabinet-number";
import { CatalogFillNote } from "@/components/catalog-fill-note";
import { Icon } from "@/components/icons";
import { LocationPicker, type LocationChoice, type LocationPickerCabinet } from "@/components/location-picker";
import { SegmentedControl } from "@/components/segmented-control";
import { SensorMakerSelect } from "@/components/sensor-maker-select";
import { SensorModelSuggest, suggestOptionId } from "@/components/sensor-model-suggest";
import { SensorTypeSelect } from "@/components/sensor-type-select";
import { TextInput } from "@/components/text-input";
import { locationText } from "@/lib/cabinet-rules";
import { catalogFill, findPascoModel, isPascoMaker, searchPascoCatalog, type PascoModel } from "@/lib/pasco-catalog";
import { useIsDesktop } from "@/lib/use-viewport";
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
 * 센서 등록 · 수정 폼 (디자인 1.28 sensor.form, sensor-form): 이름 text-input → 종류 sensor-type-select(box → sensor-type-sheet) →
 * 회사 sensor-maker-select → 모델명(선택, 회사 = 파스코면 sensor-model-suggest 자동완성 — 위아래 · Enter · Esc,
 * 고르면 모델 · 종류 · (빈) 이름 채우고 catalog-fill-note) + 수량(숫자 + "개") → 보관 위치 segmented "직접 입력 | 시약장 칸"(시약장 칸 = location-picker) →
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
  // 파스코 카탈로그 (rules 1.28 sensor.catalog): 후보 목록 · 키보드로 가리킨 줄 · 채운 칸(안내 문구) · 잠깐 highlight-soft
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [filled, setFilled] = useState<("type" | "name")[]>([]);
  const [flash, setFlash] = useState(false);
  const desktop = useIsDesktop();
  const listId = useId();

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(false), 1600);
    return () => clearTimeout(t);
  }, [flash]);

  const pasco = isPascoMaker(maker);
  const candidates = pasco ? searchPascoCatalog(model) : [];
  const showSuggest = pasco && suggestOpen && model.trim() !== "";

  const pickModel = (m: PascoModel) => {
    const f = catalogFill(m, { name });
    setModel(f.model);
    setType(f.type);
    setName(f.name);
    setFilled(f.filled);
    setFlash(true);
    setSuggestOpen(false);
    setActive(-1);
  };

  const onModelKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggest) {
      if (pasco && e.key === "ArrowDown" && model.trim() !== "") {
        e.preventDefault();
        setSuggestOpen(true);
        setActive(0);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (candidates.length === 0 ? -1 : (i + 1) % candidates.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (candidates.length === 0 ? -1 : i <= 0 ? candidates.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      // 가리킨 후보가 있으면 고르기 (폼 제출 아님)
      const m = active >= 0 ? candidates[active] : undefined;
      if (m) {
        e.preventDefault();
        pickModel(m);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setSuggestOpen(false);
      setActive(-1);
    }
  };

  const suggest = (floating: boolean) =>
    showSuggest ? (
      <SensorModelSuggest
        id={listId}
        query={model}
        selectedModel={findPascoModel(model)?.model ?? null}
        activeIndex={active}
        floating={floating}
        onPick={pickModel}
        onRaw={() => {
          setSuggestOpen(false);
          setActive(-1);
        }}
      />
    ) : null;

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
        edited={flash && filled.includes("name")}
        onChange={(e) => {
          setName(e.target.value);
          setFilled((f) => f.filter((x) => x !== "name"));
        }}
        error={fieldError("name")}
      />
      <SensorTypeSelect
        variant="box"
        value={type}
        filled={flash && filled.includes("type")}
        onChange={(t) => {
          setType(t);
          setFilled((f) => f.filter((x) => x !== "type"));
        }}
        error={fieldError("type")}
      />
      <SensorMakerSelect
        value={maker}
        onChange={(m) => {
          setMaker(m);
          if (!isPascoMaker(m)) setSuggestOpen(false);
        }}
        error={fieldError("maker")}
      />
      <div className={styles.pair}>
        <div className={styles.modelWrap}>
          <TextInput
            className={styles.model}
            label="모델명 (선택)"
            labelTone="strong"
            name="model"
            maxLength={SENSOR_MODEL_MAX}
            autoComplete="off"
            role={pasco ? "combobox" : undefined}
            aria-autocomplete={pasco ? "list" : undefined}
            aria-expanded={pasco ? showSuggest : undefined}
            aria-controls={showSuggest ? listId : undefined}
            aria-activedescendant={showSuggest && active >= 0 ? suggestOptionId(listId, active) : undefined}
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              setFilled([]);
              setSuggestOpen(true);
              setActive(-1);
            }}
            onFocus={() => setSuggestOpen(true)}
            onBlur={() => setSuggestOpen(false)}
            onKeyDown={onModelKey}
            error={fieldError("model")}
          />
          {desktop === true ? suggest(true) : null}
        </div>
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
      {filled.length > 0 ? <CatalogFillNote filled={filled} /> : null}
      {desktop === true ? null : suggest(false)}
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
