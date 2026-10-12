import "server-only";
import { cache } from "react";
import { createAnonClient } from "./anon";
import { createClient, getServerClient, getServerSession } from "./server";
import { DEMO_SCHOOL_ID } from "./demo-data";
import { buildPicker, type PickerCabinet } from "./reagent-detail";
import { isDoorType, locationText, type DoorType } from "@/lib/cabinet-rules";
import {
  checkBulkIds,
  checkSensorInput,
  isSensorStatus,
  isUuid,
  type SensorField,
  type SensorStatus,
} from "@/lib/sensor-rules";
import { checkSensorDocInput, type SchoolSensor } from "@/lib/sensor-doc-rules";
import type { Json } from "@/lib/types/database";
import type { Role } from "@/lib/types";

/** 화면 17 센서 한 개 (목록 · 상세 · 폼 공용, 화면 글자는 컴포넌트가 만든다) */
export type SensorItem = {
  id: string;
  name: string;
  type: string;
  maker: string;
  model: string | null;
  quantity: number;
  /** 직접 입력한 보관 위치 */
  locationText: string | null;
  /** 시약장 칸 (있으면 보관 위치 = 번호 원 + "1번 시약장 · 좌 1단") */
  slot: { id: string; cabinetId: string; cabinetNumber: number; side: "L" | "R"; shelf: number; text: string } | null;
  status: SensorStatus;
  memo: string | null;
  /** 등록일 "2026-09-02" (한국 날짜) */
  createdOn: string;
};

/** 시약장 칸 (폼의 "시약장 칸" 고르기 → slot id) */
export type SensorSlotRef = { id: string; cabinetId: string; side: "L" | "R"; shelf: number };

export type SensorListData = {
  role: Role;
  items: SensorItem[];
  /** 폼 "시약장 칸" 피커 (교사·admin 만) */
  picker: PickerCabinet[] | null;
  slots: SensorSlotRef[];
};

const SEOUL_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });

export const SENSOR_COLUMNS =
  "id, name, type, maker, model, quantity, location_text, slot_id, status, memo, created_at, slot:cabinet_slots(id, side, shelf, cabinet_id, cabinet:cabinets(id, number, label, door_type))";

type CabinetJoin = { id: string; number: number | null; label: string; door_type: string } | null;
type SlotJoin = { id: string; side: string; shelf: number; cabinet_id: string; cabinet: CabinetJoin | CabinetJoin[] } | null;

export type SensorRow = {
  id: string;
  name: string;
  type: string;
  maker: string;
  model: string | null;
  quantity: number;
  location_text: string | null;
  slot_id: string | null;
  status: string;
  memo: string | null;
  created_at: string;
  slot: SlotJoin | SlotJoin[] | unknown;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  return (Array.isArray(v) ? v[0] : v) ?? null;
}

/** DB 행 → 화면 값 (로그인 · 둘러보기 공용) */
export function toSensorItem(r: SensorRow): SensorItem {
  const slot = one(r.slot as SlotJoin | SlotJoin[]);
  const cab = slot ? one(slot.cabinet) : null;
  const doorType: DoorType = cab && isDoorType(cab.door_type) ? cab.door_type : "양문형";
  const side = slot?.side === "R" ? "R" : "L";
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    maker: r.maker,
    model: r.model,
    quantity: Number(r.quantity),
    locationText: r.location_text,
    slot:
      slot && cab
        ? {
            id: slot.id,
            cabinetId: cab.id,
            cabinetNumber: typeof cab.number === "number" ? cab.number : 0,
            side,
            shelf: slot.shelf,
            text: locationText({ label: cab.label, doorType }, { side, shelf: slot.shelf }),
          }
        : null,
    status: isSensorStatus(r.status) ? r.status : "ok",
    memo: r.memo,
    createdOn: SEOUL_DATE.format(new Date(r.created_at)),
  };
}

/**
 * 화면 17 센서 목록 — 로그인 세션(RLS: 자기 학교 · 보관 제외). 교사·admin 은 폼의 시약장 칸 피커도 함께.
 * 요청당 한 번만 읽는다 (데스크톱 목록(레이아웃)과 모바일 화면이 같은 결과를 쓴다). 세션이 없으면 null.
 */
export const getSensorList = cache(async function getSensorList(): Promise<SensorListData | null> {
  const supabase = await getServerClient();
  const [me, sensors, cabinets, slots, placed] = await Promise.all([
    getServerSession(),
    supabase.from("sensors").select(SENSOR_COLUMNS).order("name").order("id"),
    supabase.from("cabinets").select("*").order("number").order("created_at").order("id"),
    supabase.from("cabinet_slots").select("*"),
    supabase.from("reagents").select("id, slot_id, storage_class").not("slot_id", "is", null),
  ]);
  if (me.kind !== "member") return null;
  const staff = me.role === "teacher" || me.role === "admin";
  const slotRows = slots.data ?? [];
  return {
    role: me.role,
    items: ((sensors.data ?? []) as unknown as SensorRow[]).map(toSensorItem),
    picker: staff ? buildPicker("", cabinets.data ?? [], slotRows, placed.data ?? []) : null,
    slots: staff
      ? slotRows.map((s) => ({ id: s.id, cabinetId: s.cabinet_id, side: s.side === "R" ? ("R" as const) : ("L" as const), shelf: s.shelf }))
      : [],
  };
});

/** 홈 센서 알림 수 (교사·admin) — 고장 · 점검 필요 */
export async function getSensorAlertCounts(): Promise<{ broken: number; check: number }> {
  const supabase = await getServerClient();
  const { data } = await supabase.from("sensors").select("status").in("status", ["broken", "check"]);
  const rows = data ?? [];
  return { broken: rows.filter((r) => r.status === "broken").length, check: rows.filter((r) => r.status === "check").length };
}

/** 둘러보기 센서 (anon, 데모 학교만 — 읽기 전용) */
export async function getDemoSensorList(): Promise<SensorItem[]> {
  const supabase = createAnonClient();
  const { data } = await supabase.from("sensors").select(SENSOR_COLUMNS).eq("school_id", DEMO_SCHOOL_ID).order("name").order("id");
  return ((data ?? []) as unknown as SensorRow[]).map(toSensorItem);
}

/* ───────── 센서 서류로 등록 — 확인 표 (d7 §28) ───────── */

/** 확인 표의 우리 학교 센서 (회사+모델 자동 연결 · "기존 센서에 더하기 · 지금 3개 → 5개" · 바꾸기 목록) */
export type SensorDocSensor = SchoolSensor & { type: string };

export type SensorDocEntry =
  | { kind: "signed-out" }
  | { kind: "no-school" }
  | { kind: "forbidden" }
  | {
      kind: "ok";
      data: {
        role: Role;
        /** 우리 학교 센서 (보관 제외, 이름순) — lib/sensor-doc-rules matchSchoolSensor 로 회사+모델 일치를 찾는다 */
        sensors: SensorDocSensor[];
        /** 새 센서 행의 보관 위치 "시약장 칸" 피커 */
        picker: PickerCabinet[];
        slots: SensorSlotRef[];
      };
    };

/**
 * 센서 서류로 등록 화면 데이터 (교사·admin 만 — 학생은 forbidden, 데모 학교 계정도 forbidden).
 * 로그인 세션(RLS: 자기 학교 · 보관 제외)으로 읽는다. 학교·역할은 입력에서 받지 않는다.
 */
export async function getSensorDocEntry(): Promise<SensorDocEntry> {
  const me = await getServerSession();
  if (me.kind === "signed-out" || me.kind === "unavailable") return { kind: "signed-out" };
  if (me.kind === "no-school") return { kind: "no-school" };
  if (me.role !== "teacher" && me.role !== "admin") return { kind: "forbidden" };
  if (me.school.id === DEMO_SCHOOL_ID) return { kind: "forbidden" };
  const list = await getSensorList();
  if (!list) return { kind: "signed-out" };
  return {
    kind: "ok",
    data: {
      role: list.role,
      sensors: list.items.map((s) => ({ id: s.id, name: s.name, type: s.type, maker: s.maker, model: s.model, quantity: s.quantity })),
      picker: list.picker ?? [],
      slots: list.slots,
    },
  };
}

/* ───────── 쓰기 (DB 함수만) ───────── */

const SIGNED_OUT = "다시 로그인해 주세요";
const STAFF_ONLY = "교사·관리자만 센서를 바꿀 수 있어요";
const SENSOR_NOT_FOUND = "센서를 찾을 수 없어요";

export type UpsertSensorResult = { ok: true; sensorId: string } | { ok: false; error: string; field?: SensorField };

function staffError(message: string): string {
  return message === "not authenticated" ? SIGNED_OUT : STAFF_ONLY;
}

/**
 * 센서 등록 · 수정 — DB 함수 public.upsert_sensor 하나만 (교사·admin · 자기 학교 · 데모 거부 · 칸은 자기 학교 것만).
 * 입력은 lib/sensor-rules checkSensorInput 으로 다시 맞춘다.
 */
export async function upsertSensor(input: unknown): Promise<UpsertSensorResult> {
  const checked = checkSensorInput(input);
  if (!checked.ok) return checked;
  const v = checked.value;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false, error: SIGNED_OUT };

  const { data, error } = await supabase.rpc("upsert_sensor", {
    p_name: v.name,
    p_type: v.type,
    p_maker: v.maker,
    p_quantity: v.quantity,
    p_status: v.status,
    ...(v.id ? { p_id: v.id } : {}),
    ...(v.model ? { p_model: v.model } : {}),
    ...(v.locationText ? { p_location_text: v.locationText } : {}),
    ...(v.slotId ? { p_slot_id: v.slotId } : {}),
    ...(v.memo ? { p_memo: v.memo } : {}),
  });
  if (error) {
    switch (error.code) {
      case "P0002":
        return error.message === "slot not found"
          ? { ok: false, error: "시약장 칸을 다시 골라 주세요", field: "location" }
          : { ok: false, error: SENSOR_NOT_FOUND };
      case "22023":
        return { ok: false, error: "입력한 값을 확인해 주세요" };
      case "42501":
        return { ok: false, error: staffError(error.message) };
      default:
        return { ok: false, error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요" };
    }
  }
  const obj = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  const id = typeof obj.sensor_id === "string" ? obj.sensor_id : v.id;
  if (!id) return { ok: false, error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요" };
  return { ok: true, sensorId: id };
}

export type ArchiveResult = { ok: true; count: number } | { ok: false; error: string };

/** 센서 하나 삭제(보관) — DB 함수 archive_sensor */
export async function archiveSensor(input: { sensorId: unknown }): Promise<ArchiveResult> {
  if (!isUuid(input.sensorId)) return { ok: false, error: SENSOR_NOT_FOUND };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false, error: SIGNED_OUT };
  const { error } = await supabase.rpc("archive_sensor", { p_sensor_id: input.sensorId });
  if (error) {
    if (error.code === "P0002") return { ok: false, error: SENSOR_NOT_FOUND };
    if (error.code === "42501") return { ok: false, error: staffError(error.message) };
    return { ok: false, error: "삭제하지 못했어요. 잠시 후 다시 시도해 주세요" };
  }
  return { ok: true, count: 1 };
}

/**
 * 여러 개 삭제(보관) — DB 함수 archive_sensors · archive_reagents (1~100, 한 트랜잭션, 하나라도 틀리면 전부 취소).
 */
export async function archiveMany(kind: "sensor" | "reagent", raw: unknown): Promise<ArchiveResult> {
  const notFound = kind === "sensor" ? "고른 센서 중 찾을 수 없는 것이 있어요. 화면을 새로 고친 뒤 다시 시도해 주세요" : "고른 시약 중 찾을 수 없는 것이 있어요. 화면을 새로 고친 뒤 다시 시도해 주세요";
  const ids = checkBulkIds(raw);
  if (!ids) return { ok: false, error: "1개에서 100개까지 고를 수 있어요" };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false, error: SIGNED_OUT };
  const { data, error } =
    kind === "sensor"
      ? await supabase.rpc("archive_sensors", { p_sensor_ids: ids })
      : await supabase.rpc("archive_reagents", { p_reagent_ids: ids });
  if (error) {
    if (error.code === "P0002") return { ok: false, error: notFound };
    if (error.code === "42501") {
      return {
        ok: false,
        error: error.message === "not authenticated" ? SIGNED_OUT : kind === "sensor" ? STAFF_ONLY : "교사·관리자만 시약을 삭제할 수 있어요",
      };
    }
    if (error.code === "22023") return { ok: false, error: "1개에서 100개까지 고를 수 있어요" };
    return { ok: false, error: "삭제하지 못했어요. 잠시 후 다시 시도해 주세요" };
  }
  return { ok: true, count: typeof data === "number" ? data : ids.length };
}

export type RecordSensorDocumentResult =
  | { ok: true; addedCount: number; newSensorIds: string[] }
  | { ok: false; error: string; index?: number };

/**
 * 센서 서류 저장 (d7 §28) — DB 함수 public.record_sensor_document 하나만 (한 트랜잭션: 기존 센서 수량 더하기 + 새 센서 등록).
 * 입력은 lib/sensor-doc-rules checkSensorDocInput 으로 다시 맞춘다. 교사·admin · 자기 학교 · 데모 · 9999 상한 · 칸 학교 검사는 DB 가 한다.
 */
export async function recordSensorDocument(input: unknown): Promise<RecordSensorDocumentResult> {
  const checked = checkSensorDocInput(input);
  if (!checked.ok) return checked;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { ok: false, error: SIGNED_OUT };

  const { data, error } = await supabase.rpc("record_sensor_document", { p_items: checked.items as unknown as Json });
  if (error) {
    switch (error.code) {
      case "P0002":
        return error.message === "slot not found"
          ? { ok: false, error: "시약장 칸을 다시 골라 주세요" }
          : { ok: false, error: "더할 센서를 찾을 수 없어요. 화면을 새로 고친 뒤 다시 시도해 주세요" };
      case "22023":
        return error.message === "invalid quantity"
          ? { ok: false, error: `수량은 ${SENSOR_QUANTITY_LIMIT_TEXT}` }
          : { ok: false, error: "입력한 값을 확인해 주세요" };
      case "42501":
        return { ok: false, error: error.message === "not authenticated" ? SIGNED_OUT : "교사·관리자만 센서를 등록할 수 있어요" };
      default:
        return { ok: false, error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요" };
    }
  }
  const obj = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  const ids = Array.isArray(obj.new_sensor_ids) ? obj.new_sensor_ids.filter((x): x is string => typeof x === "string") : [];
  const added = typeof obj.added_count === "number" ? obj.added_count : checked.items.length;
  return { ok: true, addedCount: added, newSensorIds: ids };
}

const SENSOR_QUANTITY_LIMIT_TEXT = "더해서 9,999개까지 적을 수 있어요";
