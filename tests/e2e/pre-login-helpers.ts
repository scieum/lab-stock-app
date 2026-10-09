// 로그인 전 화면(1 · 14 · 15) 데스크톱 재구성 run d 공용 도우미.
// 기준: harness/d7-data.md §23 "run d 세부", harness/d5-gates.md C3, design/rules.json 1.24 desktop_shell.pre_login · footer ·
//       landing_rhythm · typography.display_sizes · frames.tall, harness/dev-rules.json 1.14 (components web-header [1,14,15] 등).
// 기대값은 규칙 파일과 새 프레임(design/frames)에서만 읽는다 (구현에서 읽지 않는다).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";
import { NEW_FRAMES_DIR } from "../frames";
import { devRules, rules, sel, type ViewportName } from "./screen-helpers";

type PreLogin = {
  screens: number[];
  component: string;
  forbidden: string[];
  layout: string;
  desktop_required: Record<string, string[]>;
  landing_sections: string;
};
type Typo = { display_sizes: { sizes: number[]; only_within: string[] } };
type Extra = {
  desktop_shell: { pre_login: PreLogin };
  typography: Typo;
  footer: { text: string; layout: string };
  landing_rhythm: { bands: string; inverted_button: string; motion: string };
  frames: { tall: Record<string, { width: number; min_height: number; max_height: number }> };
  colors: Record<string, unknown>;
};

export const R = rules as unknown as typeof rules & Extra;
export const PRE: PreLogin = R.desktop_shell.pre_login;
/** web-header */
export const HEADER = PRE.component;
export const PRE_SCREENS = PRE.screens;

/** 화면이 로그인 전 데스크톱 재구성(pre_login) 대상인가 */
export const isPreLogin = (screen: number): boolean => PRE.screens.includes(screen);

/**
 * 로그인 전 화면에서 폭별 컴포넌트 기대값 (dev-rules components 대조용):
 * - 1440: pre_login.forbidden(nav-pill · app-sidebar) = 0
 * - 390: web-header · pre_login.desktop_required[화면] (데스크톱 랜딩 전용) = 0 — 폭 390 은 변경 없음(d7 §23)이고
 *   새 모바일 프레임(1·14·15-mobile)에 그 노드가 없다 (아래 assertFramesAgree 로 확인)
 * 반환 null = 폭별 0 규칙 없음 (시안 노드 수 이상으로 본다)
 */
export function preLoginZero(screen: number, vp: ViewportName, name: string): boolean {
  if (!isPreLogin(screen)) return false;
  if (vp === "desktop") return PRE.forbidden.includes(name);
  return name === HEADER || (PRE.desktop_required[String(screen)] ?? []).includes(name);
}

type FNode = {
  name: string;
  type: string;
  path: string[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fills?: string[] | null;
  strokes?: string[] | null;
  cornerRadius?: number | null;
  text?: { characters: string; fontSize?: number } | null;
  [k: string]: unknown;
};

/** 새 프레임 파일(design/frames/{name}.json) 첫 프레임 */
export function frameOf(name: string): { name: string; width: number; height: number; nodes: FNode[] } {
  const file = name.endsWith(".json") ? name : `${name}.json`;
  return (JSON.parse(readFileSync(join(NEW_FRAMES_DIR, file), "utf8")) as { frames: { name: string; width: number; height: number; nodes: FNode[] }[] }).frames[0];
}

/** 새 프레임에서 dev-rules components 에 있는 이름별 노드 수 */
export function frameComponentCounts(name: string): Record<string, number> {
  const known = new Set(Object.keys(devRules.components));
  const out: Record<string, number> = {};
  for (const n of frameOf(name).nodes) if (known.has(n.name)) out[n.name] = (out[n.name] ?? 0) + 1;
  return out;
}

/** 새 프레임에서 조상에 ancestor 가 있는 TEXT 글자 (문서 순서) */
export function frameTextsIn(name: string, ancestor: string): string[] {
  return frameOf(name)
    .nodes.filter((n) => n.type === "TEXT" && n.text && n.path.includes(ancestor))
    .map((n) => n.text!.characters.trim());
}

/** 새 프레임에서 이름이 name 인 노드들 */
export function frameNodes(frame: string, name: string): FNode[] {
  return frameOf(frame).nodes.filter((n) => n.name === name);
}

/**
 * 폭 정리 대기 + 셸 확인: 서버 HTML 에 두 폭이 함께 있을 수 있어 하이드레이션 뒤 개수를 본다.
 * 1440 = web-header 1 · nav-pill · app-sidebar 0 / 390 = web-header 0 · nav-pill 1 (모바일 그대로 — 새 모바일 프레임의 nav-pill 수)
 */
export async function expectPreLoginShell(page: Page, screen: number, vp: ViewportName, where = `화면 ${screen}`): Promise<void> {
  if (vp === "desktop") {
    await expect(page.locator(sel(HEADER)), `${where} 1440: ${HEADER} 1`).toHaveCount(1, { timeout: 30_000 });
    for (const f of PRE.forbidden) await expect(page.locator(sel(f)), `${where} 1440: ${f} 0 (pre_login.forbidden)`).toHaveCount(0, { timeout: 30_000 });
  } else {
    await expect(page.locator(sel(HEADER)), `${where} 390: ${HEADER} 0 (모바일 그대로)`).toHaveCount(0, { timeout: 30_000 });
    const nav = frameNodes(`${screen}-mobile`, "nav-pill").length;
    expect(nav, `새 프레임 ${screen}-mobile nav-pill`).toBeGreaterThanOrEqual(1);
    await expect(page.locator(sel("nav-pill")), `${where} 390: nav-pill = 시안 ${nav}`).toHaveCount(nav, { timeout: 30_000 });
  }
}

/** 스크롤해서 모든 [data-reveal] 이 나타나게 한다 (스크린샷·문구 읽기 전) */
export async function scrollThrough(page: Page): Promise<void> {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = page.viewportSize()?.height ?? 900;
  for (let y = 0; y <= h; y += Math.floor(vh / 2)) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(60);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

/** "#141414" 같은 hex → "rgb(20, 20, 20)" */
export function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

/** 문장에서 #rrggbb 를 순서대로 */
export const hexesIn = (s: string): string[] => (s.match(/#[0-9a-fA-F]{6}/g) ?? []).map((h) => h.toLowerCase());

/**
 * 시안 샘플 학교명: 새 프레임 {screen}-{폭} 의 product-shot 그림 안 글자 중 학교명 패턴(never.N1.school_name_pattern)에 맞는 것
 * (15-desktop 브라우저 주소줄 "샘플고등학교"). rules/시안의 샘플 표기라 랜딩 그림(앱 화면 조각)에서 허용 — 실제 학교명은 아니어야 한다.
 */
export function landingSampleNames(screen: number, vp: ViewportName): string[] {
  const re = new RegExp(rules.never.N1.school_name_pattern, "g");
  const file = `${screen}-${vp}`;
  const has = frameOf(file).nodes.some((n) => n.name === "product-shot");
  if (!has) return [];
  return [...new Set(frameTextsIn(file, "product-shot").flatMap((t) => t.match(re) ?? []))];
}
