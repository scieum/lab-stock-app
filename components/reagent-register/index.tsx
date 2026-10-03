"use client";

import { useState } from "react";
import { ButtonPillSoft } from "@/components/button-pill-soft";
import { ButtonPrimary } from "@/components/button-primary";
import { SelectField } from "@/components/select-field";
import { TextInput } from "@/components/text-input";
import styles from "./styles.module.css";

export type ReagentRegisterValues = {
  name: string;
  /** 종류 = 보관 분류 (design/rules.json cabinet.storage_classes) */
  storageClass: string;
  stock: number;
  /** 병 · mL · g */
  unit: string;
  /** YYYY-MM-DD */
  intakeDate: string;
  /** 비우면 null */
  msdsUrl: string | null;
};

type Props = {
  /** "종류" 드롭다운 항목 (보관 분류 8종 — 화면에서 rules 값을 넘긴다) */
  storageClasses: string[];
  /** 입고일 기본값 = 오늘 (YYYY-MM-DD) */
  defaultIntakeDate: string;
  /** 단위 선택지 */
  units?: string[];
  defaultUnit?: string;
  onSubmit?: (values: ReagentRegisterValues) => void;
  /** 저장 중 (버튼 비활성) */
  pending?: boolean;
  /** 저장 실패 안내 */
  error?: string | null;
  /** 모바일에서 하단 버튼 줄을 tab-bar 바로 위에 고정 (갤러리에서는 false) */
  stickyActions?: boolean;
};

const DEFAULT_UNITS = ["병", "mL", "g"];
const STOCK_ERROR = "1 이상 입력하세요";
const URL_ERROR = "http:// 또는 https:// 로 시작하는 주소를 입력하세요";

function parseStock(text: string): number | null {
  const t = text.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * 화면 7 "새 시약 등록" 갈래. 라벨 위 · 입력 아래 세로 폼.
 * 시약명 · 종류 · 재고량(+단위) · 입고일 · MSDS 연결 주소 → "시약 등록".
 * 저장은 하지 않는다 — onSubmit 으로 값만 넘긴다.
 */
export function ReagentRegister({
  storageClasses,
  defaultIntakeDate,
  units = DEFAULT_UNITS,
  defaultUnit,
  onSubmit,
  pending,
  error,
  stickyActions = true,
}: Props) {
  const [name, setName] = useState("");
  const [storageClass, setStorageClass] = useState("");
  const [stock, setStock] = useState("");
  const [unit, setUnit] = useState(defaultUnit ?? units[0] ?? "");
  const [intakeDate, setIntakeDate] = useState(defaultIntakeDate);
  const [msdsUrl, setMsdsUrl] = useState("");

  const amount = parseStock(stock);
  const stockValid = amount !== null && amount >= 1;
  const url = msdsUrl.trim();
  const urlValid = url === "" || /^https?:\/\/\S+$/i.test(url);
  const canSubmit =
    name.trim() !== "" && storageClass !== "" && stockValid && unit !== "" && intakeDate !== "" && urlValid && !pending;

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSubmit || amount === null) return;
    onSubmit?.({
      name: name.trim(),
      storageClass,
      stock: amount,
      unit,
      intakeDate,
      msdsUrl: url === "" ? null : url,
    });
  };

  return (
    <form
      data-component="reagent-register"
      className={[styles.root, stickyActions ? styles.sticky : ""].join(" ").trim()}
      onSubmit={submit}
      noValidate
    >
      <div className={styles.fields}>
        <TextInput
          label="시약명"
          labelTone="strong"
          required
          name="name"
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <SelectField
          label="종류"
          tone="form"
          required
          name="storage_class"
          options={storageClasses.map((c) => ({ value: c, label: c }))}
          value={storageClass}
          onChange={setStorageClass}
        />
        <div className={styles.stockField}>
          <TextInput
            label="재고량"
            labelTone="strong"
            required
            name="stock"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            unit={unit}
            unitTone="plain"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            error={stock !== "" && !stockValid ? STOCK_ERROR : undefined}
          />
          <div className={styles.units} role="group" aria-label="단위">
            {units.map((u) => (
              <ButtonPillSoft key={u} selected={u === unit} onClick={() => setUnit(u)}>
                {u}
              </ButtonPillSoft>
            ))}
          </div>
        </div>
        <TextInput
          label="입고일"
          labelTone="strong"
          required
          icon="calendar"
          type="date"
          name="intake_date"
          value={intakeDate}
          onChange={(e) => setIntakeDate(e.target.value)}
        />
        <TextInput
          label="MSDS 연결 주소"
          labelTone="strong"
          type="url"
          name="msds_url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://"
          value={msdsUrl}
          onChange={(e) => setMsdsUrl(e.target.value)}
          error={urlValid ? undefined : URL_ERROR}
        />
      </div>

      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}

      <div className={styles.actions} data-name="bottom-actions">
        <ButtonPrimary type="submit" className={styles.primary} disabled={!canSubmit}>
          {pending ? "저장 중…" : "시약 등록"}
        </ButtonPrimary>
      </div>
    </form>
  );
}
