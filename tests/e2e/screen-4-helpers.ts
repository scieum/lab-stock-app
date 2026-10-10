// 화면 4 (사용 기록, dev-rules.json routes["4"]) 테스트 공용 도우미 — 디자인 1.25 여러 시약 사용 기록 (d7 §24, rules usage_batch).
// - 모바일 = 전용 화면: usage-batch-list 카드(usage-item-row) + reagent-add "시약 추가" → 바텀시트 reagent-picker(체크 → "{N}개 담기")
// - 데스크톱 = 본문 페이지(rules desktop_shell.heavy_pages 4): reagent-add 검색 칸 + 아래 드롭다운 reagent-picker + data-table(usage-batch-list 안)
// - 공통 칸 순서 사용일(usage-date) → 수업(class-select) → 메모, 맨 아래 고정 바 "사용 기록 저장 · N개" (rules usage_batch.save)
// 문구는 rules.json usage_batch 문장에서 읽는다 (구현에서 읽지 않는다).
// - 시약 id 는 seed.sql 에서 고르고(보기 전용 테스트), DB 값은 그 계정의 브라우저 세션(publishable 키 + RLS)으로 읽는다.
import { expect, type Locator, type Page } from "@playwright/test";
import type { Role } from "./db-helpers";
import { browserClient, routeOf, rules, sel } from "./screen-helpers";
import { isDeskPage, waitWidthSettled } from "./desk-helpers";
import { seedReagents, seedSchoolOf } from "./screen-3-helpers";

export const SCREEN = 4;
export const TOAST = "ex-toast";
export const LIST = "usage-batch-list";
export const ITEM = "usage-item-row";
export const PICKER = "reagent-picker";
export const ADD = "reagent-add";
export const OVER = "usage-over-stock";
export const CLASS_SELECT = "class-select";
export const RECENT_CHIP = "recent-class-chip";
export const DATE = "usage-date";
export const PAST_NOTE = "past-date-note";
export const EMPTY = "ex-empty-state-card";

// ---------- 기대값: rules.json usage_batch · class_info ----------
type UsageBatchRules = Record<"picker" | "list" | "row" | "common" | "save" | "errors" | "empty" | "after_save" | "entry" | "roles", string>;
export const UB = (rules as unknown as { usage_batch: UsageBatchRules }).usage_batch;
export const CI = (rules as unknown as {
  class_info: { field: string; grades: Record<string, number[]>; classes: [number, number]; subject_max: number; recent: string; label: string };
}).class_info;
const quotes = (s: string) => [...s.matchAll(/'([^']+)'/g)].map((m) => m[1]);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** 예시 문장의 숫자 자리를 N 으로: "'사용 기록 저장 · N개'" */
const withN = (tpl: string, n: number) => tpl.replace(/\{?N\}?/, String(n));

/** usage_batch.save "'사용 기록 저장 · N개'" */
export const SAVE_TPL = quotes(UB.save)[0];
export const saveLabel = (n: number) => withN(SAVE_TPL, n);
/** 0개일 때의 저장 버튼 글자 — 틀에서 " · N개" 를 뺀 것 (시안 4-empty "사용 기록 저장") */
export const SAVE_EMPTY = SAVE_TPL.replace(/\s*·\s*N개$/, "");
/** usage_batch.picker "'{N}개 담기'" */
export const PICK_TPL = quotes(UB.picker).find((q) => /개 담기$/.test(q))!;
export const pickLabel = (n: number) => PICK_TPL.replace("{N}", String(n));
/** usage_batch.picker "'담음'" · "'+ 시약 추가'" */
export const ADDED = quotes(UB.picker).find((q) => q === "담음")!;
export const ADD_LABEL = quotes(UB.picker).find((q) => /시약 추가/.test(q))!.replace(/^\+\s*/, "");
/** usage_batch.list "'담은 시약 N개'" */
export const HEADING_TPL = quotes(UB.list)[0];
export const heading = (n: number) => withN(HEADING_TPL, n);
/** usage_batch.row "'현재 120 mL'" (예시) → 틀 */
export const ROW_STOCK_EXAMPLE = quotes(UB.row).find((q) => /^현재 /.test(q))!;
/** usage_batch.errors: 재고 초과 "'재고 120 mL보다 많아요'" · 빈 값 "'사용량을 적어 주세요'" · 서버 거절 토스트 */
export const OVER_EXAMPLE = quotes(UB.errors).find((q) => /^재고 .+보다 많아요$/.test(q))!;
export const EMPTY_AMOUNT = quotes(UB.errors).find((q) => /사용량을 적어/.test(q))!;
export const SERVER_FAIL = quotes(UB.errors).find((q) => /저장하지 못했어요/.test(q))!;
/** usage_batch.empty "'시약을 골라 주세요'" */
export const EMPTY_TITLE = quotes(UB.empty)[0];
/** usage_batch.after_save "'N개 시약 사용을 기록했어요'" */
export const DONE_TPL = quotes(UB.after_save)[0];
export const doneText = (n: number) => withN(DONE_TPL, n);
/** 숫자 표기 (예시 "1,200 mL" 와 같은 천 단위 쉼표) */
const fmt = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 3 });
export const stockText = (stock: number, unit: string) => `${fmt.format(stock)} ${unit}`;
export const overText = (stock: number, unit: string) => OVER_EXAMPLE.replace(/재고 .+보다/, `재고 ${stockText(stock, unit)}보다`);
export const rowStockText = (stock: number, unit: string) => ROW_STOCK_EXAMPLE.replace(/^현재 .+$/, `현재 ${stockText(stock, unit)}`);
/** class_info.label "{학년}학년 {반}반 · {수업명}", 있는 것만 */
export const classText = (g: number | null, n: number | null, subject: string | null) =>
  [[g ? `${g}학년` : "", n ? `${n}반` : ""].filter(Boolean).join(" "), subject ?? ""].filter(Boolean).join(" · ");
/** class_info.recent "최대 3개" */
export const RECENT_MAX = Number((/최대 (\d+)개/.exec(CI.recent) ?? [])[1]);
export const exact = (s: string) => new RegExp(`^\\s*${esc(s)}\\s*$`);

/** routes["4"] + ?reagent={id} (+ 다른 쿼리) */
export const usagePath = (id?: string, extra: Record<string, string> = {}) => {
  const p = new URLSearchParams();
  if (id !== undefined) p.set("reagent", id);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  const q = p.toString();
  return q ? `${routeOf(SCREEN)}?${q}` : routeOf(SCREEN);
};

/** 이 역할 계정 학교의 seed 시약 (id 순) */
export function seedOwnReagents(role: Role) {
  const school = seedSchoolOf(role);
  const own = seedReagents()
    .filter((r) => r.school_id === school.id)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (own.length === 0) throw new Error(`seed.sql 에 학교 ${school.name} 시약 없음`);
  return { school, own };
}

// ---------- locator ----------
export const list = (page: Page) => page.locator(`main ${sel(LIST)}`);
export const items = (page: Page) => page.locator(`main ${sel(ITEM)}`);
export const itemNamed = (page: Page, name: string) => items(page).filter({ hasText: name });
export const amountOf = (page: Page, name: string) => page.locator("main").getByLabel(`${name} 사용량`, { exact: true });
export const removeOf = (page: Page, name: string) => page.locator("main").getByRole("button", { name: `${name} 빼기`, exact: true });
/** 맨 아래 고정 바 (모바일 = 탭바 위 · 데스크톱 = 본문 아래) */
export const saveBar = (page: Page) => page.locator('main [data-name="bottom-bar"]');
export const saveButton = (page: Page) => saveBar(page).locator(`button[type="submit"]${sel("button-primary")}`);
export const dateInput = (page: Page) => page.locator(`main ${sel(DATE)} input`);
export const classSelect = (page: Page) => page.locator(`main ${sel(CLASS_SELECT)}`);
export const gradeSelect = (page: Page) => classSelect(page).locator("select").nth(0);
export const classNoSelect = (page: Page) => classSelect(page).locator("select").nth(1);
export const subjectInput = (page: Page) => classSelect(page).getByLabel("수업명", { exact: true });
export const memoInput = (page: Page) => page.locator('main input[name="memo"]');
export const picker = (page: Page) => page.locator(sel(PICKER));
export const toast = (page: Page) => page.locator(sel(TOAST));

/** 화면 4 가 그려지고 하이드레이션될 때까지 (+ 맞지 않는 폭 사본이 빠질 때까지) */
export async function waitUsage(page: Page): Promise<void> {
  await expect(list(page).first(), `${LIST} 보임`).toBeVisible({ timeout: 45_000 });
  await page.waitForLoadState("load");
  await page.waitForFunction(
    () => {
      const f = document.querySelector("main form");
      return !!f && Object.keys(f).some((k) => k.startsWith("__reactProps"));
    },
    undefined,
    { timeout: 30_000 },
  );
  await waitWidthSettled(page);
  await expect(list(page), `${LIST} 1`).toHaveCount(1);
}

/** 시약 고르기를 연다: 모바일 = "시약 추가" 버튼 → 바텀시트 / 데스크톱 = 검색 칸 → 드롭다운 */
export async function openPicker(page: Page): Promise<Locator> {
  if (isDeskPage(page)) {
    const input = page.locator(`main ${sel(ADD)} input`);
    await expect(async () => {
      await input.click();
      await expect(picker(page)).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
  } else {
    const btn = page.locator(`main ${sel(ADD)}`).getByRole("button", { name: exact(ADD_LABEL) });
    await expect(async () => {
      await btn.first().click();
      await expect(picker(page)).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
  }
  return picker(page);
}

/** 고르기의 행 (시약명으로) */
export const pickerRow = (page: Page, name: string) => picker(page).locator('[data-name="picker-row"]').filter({ hasText: name });
/** 고르기의 행 이름 순서 */
export async function pickerNames(page: Page): Promise<string[]> {
  return picker(page)
    .locator('[data-name="picker-row"]')
    .evaluateAll((els, added) =>
      els.map((e) =>
        (e as HTMLElement).innerText
          .split("\n")
          .map((t) => t.trim())
          .filter((t) => t !== "" && t !== added && !/^현재 /.test(t))[0] ?? "",
      ),
      ADDED,
    );
}

/** 시약을 담는다: 모바일 = 시트에서 체크 → "{N}개 담기" / 데스크톱 = 드롭다운 행 누르기 → 닫기 */
export async function addReagents(page: Page, names: string[]): Promise<void> {
  await openPicker(page);
  for (const n of names) await pickerRow(page, n).first().click();
  if (isDeskPage(page)) {
    // 검색 칸에서 Esc ("닫기" 링크 동작은 screen-4-batch 고르기 테스트에서 본다)
    await page.keyboard.press("Escape");
  } else {
    await picker(page).getByRole("button", { name: exact(pickLabel(names.length)) }).click();
  }
  await expect(picker(page), "고르기 닫힘").toHaveCount(0);
  for (const n of names) await expect(itemNamed(page, n), `담은 시약 ${n}`).toHaveCount(1);
}

/** 자기 세션(RLS)으로 시약 stock·unit 읽기 */
export async function dbStock(page: Page, id: string): Promise<{ stock: number; unit: string } | null> {
  const { client } = await browserClient(page);
  const { data, error } = await client.from("reagents").select("stock, unit").eq("id", id).maybeSingle();
  expect(error, "자기 세션 reagents 조회").toBeNull();
  return data ? { stock: Number(data.stock), unit: data.unit as string } : null;
}

/** 세로 순서: 위에서 아래로 */
export async function topOf(l: Locator): Promise<number> {
  const b = await l.boundingBox();
  if (!b) throw new Error("요소 위치 없음");
  return b.y;
}
