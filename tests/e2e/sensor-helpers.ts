// 무선 센서(화면 17) · 여러 개 삭제(화면 2·17) 테스트 공용 도우미.
// 기준(구현이 아니라 여기서 도출): harness/d7-data.md §25 "무선 센서 (화면 17)" · "센서 DB" · "여러 개 삭제" · "여러 개 삭제 DB",
//   design/rules.json 1.26 sensor · bulk_delete · roles R5 · guest · tab_bar.sensor_entry · variants["17"], harness/dev-rules.json 1.18
//   routes 17 · 17-guest · guest_screens, 새 프레임 design/frames/17-*.json.
// - 쓰기(센서 등록 · 보관)는 일회용 학교(service role 로 만든 admin · 교사 · 학생)에서만 — 준비는 그 학교 교사 세션의 DB 함수
//   upsert_sensor 로 한다(service role 로 대신하지 않는다). service role 은 준비(계정 · 학교) · 정리 · 대조 조회에만.
// - 정리: sensors 는 schools 를 참조하므로 일회용 학교의 센서를 먼저 지우고 나서 학교 · 계정을 지운다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { devRules, routeOf, rules, sel } from "./screen-helpers";
import { clientFor, service, tempSchoolLike } from "./screen-8-helpers";
import { NO_S11_RESIDUE, cleanup, makeFixture, type S11Fixture, type S11Residue } from "./screen-11-helpers";

export const SCREEN = 17;

// ---------- 기대값 원본 ----------
const ROOT = process.cwd();
export const D7 = readFileSync(join(ROOT, "harness", "d7-data.md"), "utf8");
export function d7Section(head: string): string {
  const s = D7.indexOf(head);
  if (s < 0) throw new Error(`d7 에 ${head} 없음`);
  const e = D7.indexOf("\n## ", s + 1);
  return D7.slice(s, e < 0 ? undefined : e);
}
/** d7 §25 (여러 개 삭제 · 앱 404 · 가입 오류 · 기록 추가 · 무선 센서 + QA 수정) */
export const D7_25 = d7Section("## 25.");
/** d7 §25 표의 한 줄 (항목 이름으로) */
export function d7Row(item: string): string {
  const line = D7_25.split(/\r?\n/).find((l) => l.startsWith(`| ${item}`));
  if (!line) throw new Error(`d7 §25 에 '${item}' 줄 없음`);
  return line;
}

export type SensorRules = {
  screen: number;
  entry: string;
  list: string;
  filter: string;
  detail: string;
  form: string;
  types: string[];
  makers: Record<string, string[] | string>;
  maker_select: string;
  status: string;
  empty: string;
  delete: string;
  home: string;
  roles: string;
};
export type BulkRules = { screens: number[]; roles: string[]; toggle: string; checkbox: string; select_all: string; row_tap: string; bar: string; confirm: string; after: string; max: number };

export const SENSOR = (rules as unknown as { sensor: SensorRules }).sensor;
export const BULK = (rules as unknown as { bulk_delete: BulkRules }).bulk_delete;

/** 작은따옴표 안 글자들 */
export const quotes = (s: string) => [...s.matchAll(/'([^']+)'/g)].map((m) => m[1]);
export const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const exact = (s: string) => new RegExp(`^\\s*${esc(s)}\\s*$`);

/** 회사 묶음 (rules sensor.makers — "source" 키 제외) */
export const MAKER_GROUPS: { title: string; makers: string[] }[] = Object.entries(SENSOR.makers)
  .filter(([, v]) => Array.isArray(v))
  .map(([title, v]) => ({ title, makers: v as string[] }));
export const MAKERS = MAKER_GROUPS.flatMap((g) => g.makers);
/** rules sensor.maker_select "맨 끝 '직접 입력'" */
export const MAKER_DIRECT = quotes(SENSOR.maker_select).find((q) => q === "직접 입력")!;

/** d7 §25 센서 DB: "status text 정상\|점검 필요\|고장 — DB 값은 ok\|check\|broken" → 화면 글자 ↔ DB 값 */
export const STATUS: { label: string; db: string }[] = (() => {
  const m = /status text (.+?) — DB 값은 ([a-z\\|]+)/.exec(D7_25);
  if (!m) throw new Error("d7 §25 에서 센서 상태 값을 읽지 못함");
  const labels = m[1].split(/\\?\|/).map((s) => s.trim());
  const dbs = m[2].split(/\\?\|/).map((s) => s.trim());
  if (labels.length !== dbs.length) throw new Error("d7 §25 상태 글자 · DB 값 수가 다름");
  return labels.map((label, i) => ({ label, db: dbs[i] }));
})();
export const statusLabel = (db: string) => STATUS.find((s) => s.db === db)!.label;
export const STATUS_OK = STATUS[0].db;

/** rules sensor.list "sensor-list = data-table 열 이름 · 종류 · 회사 · 모델 · 수량 · 보관 위치 · 상태" */
export const DESK_COLUMNS: string[] = (() => {
  const m = /data-table 열 (.+?), 행 =/.exec(SENSOR.list);
  if (!m) throw new Error("rules sensor.list 에서 표 열을 읽지 못함");
  return m[1].split(" · ").map((s) => s.trim());
})();

/** rules sensor.detail "'항목 | 값' 종류·회사·모델·수량·보관 위치·메모·등록일" */
export const DETAIL_KEYS: string[] = (() => {
  const m = /'항목 \| 값' ([^→]+?) →/.exec(SENSOR.detail);
  if (!m) throw new Error("rules sensor.detail 에서 항목을 읽지 못함");
  return m[1].split("·").map((s) => s.trim());
})();

/** rules sensor.empty 제목 · 본문 */
export const [EMPTY_TITLE, EMPTY_BODY] = quotes(SENSOR.empty);
/** rules sensor.detail "sensor-delete '센서 삭제'" · sensor-edit "'수정'" */
export const DELETE_ITEM = quotes(SENSOR.detail).find((q) => q === "센서 삭제")!;
export const EDIT_LABEL = quotes(SENSOR.detail).find((q) => q === "수정")!;
/** rules sensor.list sensor-add "'센서 등록'" */
export const ADD_LABEL = quotes(SENSOR.list).find((q) => q === "센서 등록")!;
/** 센서 삭제 모달 본문 (rules sensor.detail "'목록과 홈에서 사라져요'") — bulk_delete.confirm 의 센서 본문과 같은 글 */
export const SENSOR_DELETE_BODY = quotes(BULK.confirm).find((q) => q.startsWith("목록과 홈에서"))!;
/** reagent_delete 와 같은 모달: 제목 "'{이름}' 센서를 삭제할까요?" · muted · 버튼 · 완료 토스트 */
type ReagentDeleteRules = { confirm: string; after: string };
const RD = (rules as unknown as { reagent_delete: ReagentDeleteRules }).reagent_delete;
export const singleDeleteTitle = (name: string) =>
  ((/"('\{시약명\}' [^"]+)"/.exec(RD.confirm) ?? [])[1] ?? "").replace("{시약명}", name).replace("시약을", "센서를");
export const DELETE_NOTE = quotes(BULK.confirm).find((q) => q === "되돌릴 수 없어요.")!;
export const CANCEL = "취소";
export const CONFIRM = "삭제";
/** reagent_delete.after "'시약을 삭제했어요'" 의 센서판 */
export const SINGLE_DONE = quotes(RD.after)[0].replace("시약을", "센서를");

/** bulk_delete.confirm "'{시약|센서} N개를 삭제할까요?'" (따옴표 안 대신 rules 글에서 틀을 뽑는다) */
export function bulkTitle(kind: "시약" | "센서", n: number): string {
  const tpl = (/'\{시약\|센서\} N개를 삭제할까요\?'/.exec(BULK.confirm) ?? [])[0];
  if (!tpl) throw new Error("rules bulk_delete.confirm 제목 틀 없음");
  return tpl.slice(1, -1).replace("{시약|센서}", kind).replace("N", String(n));
}
export function bulkDone(kind: "시약" | "센서", n: number): string {
  const tpl = quotes(BULK.after)[0];
  return tpl.replace("{시약|센서}", kind).replace("N", String(n));
}
/** 확인 모달 이름 줄: "이름 3개 + '외 N개'" */
export function bulkNames(names: string[]): string {
  return names.length > 3 ? `${names.slice(0, 3).join(", ")} 외 ${names.length - 3}개` : names.join(", ");
}
/** bulk_delete.confirm 시약 본문 */
export const BULK_REAGENT_BODY = quotes(BULK.confirm).find((q) => q.startsWith("목록·시약장"))!;
/** bulk_delete.select_all caption */
export const CAPPED = quotes(BULK.select_all)[0];
/** bulk_delete.toggle "'선택'" · "'취소' · 'N개 선택됨' · '전체 선택'" */
export const SELECT_LABEL = quotes(BULK.toggle).find((q) => q === "선택")!;
export const SELECT_ALL = quotes(BULK.toggle).find((q) => q === "전체 선택")!;
export const selectedText = (n: number) => quotes(BULK.toggle).find((q) => /N개 선택됨/.test(q))!.replace("N", String(n));

// ---------- 경로 ----------
export const listPath = (q?: Record<string, string>) => {
  const p = new URLSearchParams(q ?? {}).toString();
  return p ? `${routeOf(SCREEN)}?${p}` : routeOf(SCREEN);
};
export const detailPath = (id: string, base: "" | "/demo" = "") => `${base}${routeOf(SCREEN)}/${id}`;
export const guestListPath = () => devRules.routes["17-guest"];

// ---------- 화면 요소 ----------
export const rowsOf = (page: Page): Locator => page.locator(`main ${sel("sensor-row")}`);
export const rowNamed = (page: Page, name: string): Locator => rowsOf(page).filter({ hasText: name });
export const isDesk = (page: Page) => (page.viewportSize()?.width ?? 0) >= devRules.viewports.desktop[0];

/** 센서 목록이 그려지고 하이드레이션 + 폭 정리까지 */
export async function waitSensorList(page: Page, state: "some" | "empty" = "some"): Promise<void> {
  if (state === "some") await expect(rowsOf(page).first(), "sensor-row 보임").toBeVisible({ timeout: 45_000 });
  else await expect(page.locator(`main ${sel("ex-empty-state-card")}`).first(), "빈 상태 카드 보임").toBeVisible({ timeout: 45_000 });
  await page.waitForLoadState("load");
  await page.waitForFunction(
    () => {
      const el = document.querySelector('main [data-component="list-filter-button"], main [data-component="ex-empty-state-card"]');
      return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
    },
    undefined,
    { timeout: 30_000 },
  );
  const gone = isDesk(page) ? ["nav-pill", "tab-bar"] : ["app-sidebar", "data-table", "detail-drawer"];
  for (const n of gone) await expect(page.locator(sel(n)), `폭 정리: ${n} 0`).toHaveCount(0, { timeout: 45_000 });
}

// ---------- 일회용 학교 + 센서 ----------
export type SensorSeed = {
  name: string;
  type: string;
  maker: string;
  model: string | null;
  quantity: number;
  location: string | null;
  status: string;
  memo: string | null;
};
export type MadeSensor = SensorSeed & { id: string };

/**
 * 시안 17 예시와 같은 모양의 센서 묶음 (종류 · 회사는 rules 목록에서, 상태는 d7 DB 값). 하나는 회사 '직접 입력'(목록 밖 이름).
 * 이름 끝에 꼬리표를 붙여 다른 테스트 · 다른 실행과 겹치지 않게 한다.
 */
export function sampleSensors(tag: string): SensorSeed[] {
  const T = (i: number) => SENSOR.types[i];
  const [ok, check, broken] = STATUS.map((s) => s.db);
  const sensorMakers = MAKER_GROUPS[0].makers;
  const scopeMakers = MAKER_GROUPS[1]?.makers ?? sensorMakers;
  return [
    { name: `무선 온도 센서 ${tag}`, type: T(0), maker: sensorMakers[0], model: "GDX-TMP", quantity: 3, location: "과학실 뒤 선반", status: ok, memo: null },
    { name: `무선 pH 센서 ${tag}`, type: T(1), maker: sensorMakers[0], model: "GDX-PH", quantity: 2, location: "준비실 서랍", status: check, memo: "전극 보관액 교체 필요" },
    { name: `운동 센서 ${tag}`, type: T(3), maker: sensorMakers[4], model: "PS-3219", quantity: 2, location: "준비실 서랍", status: broken, memo: "케이블 단자 고장" },
    { name: `무선 힘 센서 ${tag}`, type: T(2), maker: sensorMakers[4], model: "PS-3202", quantity: 4, location: "과학실 뒤 선반", status: ok, memo: null },
    { name: `디지털 현미경 ${tag}`, type: SENSOR.types[SENSOR.types.length - 1], maker: scopeMakers[2], model: null, quantity: 2, location: "생물 준비실", status: ok, memo: null },
    { name: `직접입력 센서 ${tag}`, type: T(4), maker: `임시제조사${tag}`.slice(0, 30), model: null, quantity: 1, location: null, status: ok, memo: null },
  ];
}

/** 교사 · admin 세션으로 upsert_sensor (준비) */
export async function makeSensor(c: SupabaseClient, s: SensorSeed): Promise<MadeSensor> {
  const args: Record<string, unknown> = { p_name: s.name, p_type: s.type, p_maker: s.maker, p_quantity: s.quantity, p_status: s.status };
  if (s.model) args.p_model = s.model;
  if (s.location) args.p_location_text = s.location;
  if (s.memo) args.p_memo = s.memo;
  const res = await c.rpc("upsert_sensor", args);
  expect(res.error, `준비: upsert_sensor ${s.name} (${res.error?.code} ${res.error?.message})`).toBeNull();
  const id = (res.data as { sensor_id?: string } | null)?.sensor_id;
  expect(typeof id, "upsert_sensor 반환 sensor_id").toBe("string");
  return { ...s, id: id as string };
}

export type SensorFixture = S11Fixture & { teacherClient: SupabaseClient; sensors: MadeSensor[]; tag: string };

/** 일회용 학교(admin · 교사 · 학생) + 교사가 등록한 센서 묶음 (withSensors=false 면 센서 0개) */
export async function sensorFixture(info: TestInfo, group: string, withSensors = true): Promise<SensorFixture> {
  const base = await makeFixture(info, group);
  const teacherClient = await clientFor(base.teacher);
  const tag = randomBytes(2).toString("hex");
  const sensors: MadeSensor[] = [];
  if (withSensors) for (const s of sampleSensors(tag)) sensors.push(await makeSensor(teacherClient, s));
  return { ...base, teacherClient, sensors, tag };
}

/** 대조(service role): 학교의 보관 안 된 센서 */
export async function liveSensors(schoolId: string): Promise<{ id: string; name: string; status: string; type: string; maker: string }[]> {
  const r = await service().from("sensors").select("id, name, status, type, maker").eq("school_id", schoolId).is("deleted_at", null).order("name");
  if (r.error) throw new Error(`대조 조회 실패: ${r.error.message}`);
  return (r.data ?? []) as { id: string; name: string; status: string; type: string; maker: string }[];
}

/** 대조(service role): 센서 1행 */
export async function sensorRow(id: string): Promise<Record<string, unknown> | null> {
  const r = await service().from("sensors").select("*").eq("id", id).maybeSingle();
  if (r.error) throw new Error(`대조 조회 실패: ${r.error.message}`);
  return (r.data as Record<string, unknown> | null) ?? null;
}

export type SensorResidue = S11Residue & { sensors: number };
export const NO_SENSOR_RESIDUE: SensorResidue = { ...NO_S11_RESIDUE, sensors: 0 };

/** 일회용 학교의 센서 → 기록 → 학교 · 계정 순으로 지우고 남은 수 */
export async function cleanupSensors(group: string, project: string): Promise<SensorResidue> {
  const sb = service();
  const schools = await sb.from("schools").select("id").like("neis_code", tempSchoolLike(group, project));
  const ids = (schools.data ?? []).map((s) => s.id as string);
  if (ids.length) {
    await sb.from("sensors").delete().in("school_id", ids);
    await sb.from("usage_logs").delete().in("school_id", ids);
    await sb.from("intake_logs").delete().in("school_id", ids);
  }
  const left = await cleanup(group, project);
  const s = ids.length ? await sb.from("sensors").select("id").in("school_id", ids) : { data: [] as unknown[] };
  return { ...left, sensors: (s.data ?? []).length };
}

/** 마이그레이션(sensors 표 · archive_* 함수)이 원격 DB 에 있는가 — 대조 조회(service role) */
export async function sensorsTableReady(): Promise<boolean> {
  const r = await service().from("sensors").select("id").limit(1);
  return !r.error;
}

/** 공용 학교 A·B·데모 센서 스냅숏 (service role) — 일회용 쓰기가 건드리지 않았는지 */
export async function sharedSensorSnapshot(): Promise<string[]> {
  const sb = service();
  const schools = await sb.from("schools").select("id").or("neis_code.like.TEST-SCHOOL-%,is_demo.eq.true");
  const ids = (schools.data ?? []).map((s) => s.id as string);
  const r = await sb.from("sensors").select("*").in("school_id", ids).order("id");
  if (r.error) throw new Error(`대조 조회 실패: ${r.error.message}`);
  return (r.data ?? []).map((x) => JSON.stringify(x));
}

/** "2026-10-11" (한국 날짜) */
export const KST = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
export const ymdKst = (d: Date = new Date()) => KST.format(d);
export const daysAgoKst = (n: number) => KST.format(new Date(Date.now() - n * 86_400_000));
