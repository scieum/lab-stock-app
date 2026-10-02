// 화면 3 (시약 상세, dev-rules.json routes["3"]) 테스트 공용 도우미.
// - 시약 id 는 seed.sql 에서 고르고, 표시값 비교용 DB 값은 그 계정의 브라우저 세션(publishable 키 + RLS)으로 읽는다.
// - service role 미사용. 계정 값은 db-helpers.ts 의 환경변수 로딩만 쓴다.
import { expect, type Page } from "@playwright/test";
import type { Role } from "./db-helpers";
import { browserClient, routeOf, sel, seedRows } from "./screen-helpers";

export const SCREEN = 3;
export const USAGE_SCREEN = 4;

/** routes["3"] 의 [id] 를 실제 id 로 바꾼 경로 */
export const detailPath = (id: string) => routeOf(SCREEN).replace(/\[[^\]]+\]/, id);

export type SeedReagent = { id: string; school_id: string; name: string; low: boolean };

/**
 * seed.sql schools 중 이 역할 계정이 속할 학교 (학교 A 계정 = neis_code …-A, 학교 B 계정 = …-B).
 * 호출부는 화면을 연 뒤 browserSession 의 학교명과 같은지 반드시 확인한다.
 */
export function seedSchoolOf(role: Role): Record<string, string> {
  const schools = seedRows("schools");
  const suffix = role === "schoolB" ? "B" : "A";
  const s = schools.find((x) => (x.neis_code ?? "").endsWith(`-${suffix}`));
  if (!s) throw new Error(`seed.sql 에 학교 ${suffix} 없음`);
  return s;
}

/** seed.sql 시약 (재고 부족 = stock < min_stock) */
export function seedReagents(): SeedReagent[] {
  return seedRows("reagents").map((r) => ({
    id: r.id,
    school_id: r.school_id,
    name: r.name,
    low: Number(r.stock) < Number(r.min_stock),
  }));
}

export type DbDetail = {
  id: string;
  name: string;
  cas_no: string | null;
  unit: string;
  stock: number;
  min_stock: number;
  low: boolean;
  cabinet: string | null;
  shelf: number | null;
  storage_class: string | null;
};

/** 자기 세션(RLS)으로 시약 1건 + 보관 칸·시약장 읽기 (없으면 null) */
export async function dbDetail(page: Page, id: string): Promise<DbDetail | null> {
  const { client } = await browserClient(page);
  const { data, error } = await client
    .from("reagents")
    .select("id, name, cas_no, unit, stock, min_stock, slot:cabinet_slots(shelf, storage_class, cabinet:cabinets(label))")
    .eq("id", id)
    .maybeSingle();
  expect(error, "자기 세션 reagents 조회").toBeNull();
  if (!data) return null;
  const slot = (Array.isArray(data.slot) ? data.slot[0] : data.slot) as
    | { shelf: number; storage_class: string; cabinet: { label: string } | { label: string }[] | null }
    | null;
  const cab = slot ? (Array.isArray(slot.cabinet) ? slot.cabinet[0] : slot.cabinet) : null;
  return {
    id: data.id as string,
    name: data.name as string,
    cas_no: (data.cas_no as string | null) ?? null,
    unit: data.unit as string,
    stock: Number(data.stock),
    min_stock: Number(data.min_stock),
    low: Number(data.stock) < Number(data.min_stock),
    cabinet: cab?.label ?? null,
    shelf: slot ? Number(slot.shelf) : null,
    storage_class: slot?.storage_class ?? null,
  };
}

/** 상세 화면이 그려질 때까지 (reagent-detail-card 보임) */
export async function waitDetail(page: Page): Promise<void> {
  await expect(page.locator(sel("reagent-detail-card")).first()).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("load");
}

/**
 * main 안의 segmented-control 탭을 하나씩 눌러 각 탭 패널 글자를 모은다 (어느 탭에 값이 있든 찾도록).
 * 누른 탭이 선택 상태(aria-selected=true)가 될 때까지 기다린다 (하이드레이션 전 클릭 무시 방지).
 */
export async function textAcrossTabs(page: Page): Promise<string> {
  const main = page.locator("main");
  const tabs = main.locator(`${sel("segmented-control")} [role="tab"]`);
  const labels = (await tabs.allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  const parts = [await main.innerText()];
  for (const label of labels) {
    const tab = main.locator(`${sel("segmented-control")} [role="tab"]`, { hasText: label }).first();
    await expect(async () => {
      if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    parts.push(await main.innerText());
  }
  return parts.join("\n");
}

/** 공백·천 단위 쉼표 제거 (재고 2,000 mL ↔ 2000mL 비교용) */
export const squash = (s: string) => s.replace(/[\s,]/g, "");
