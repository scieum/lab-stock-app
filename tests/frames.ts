// 시안 프레임 경로 고르기 (unit · e2e 공용).
//
// 기준: harness/dev-rules.json desktop_migrated_screens · desktop_migrated_note, harness/d5-gates.md C3, harness/d7-data.md §23.
// - 데스크톱 재구성(design/rules.json 1.22 desktop_shell)이 끝난 화면(desktop_migrated_screens)만 새 프레임(design/frames)으로 본다.
// - 아직 이전하지 않은 화면은 예전 프레임(tests/fixtures/frames-pre-desktop = main 3c69402 의 design/frames 그대로)으로 본다
//   — 화면 본문은 아직 예전 구조라서 (모바일·데스크톱 모두).
// - 화면이 desktop_migrated_screens 에 들어오면 이 함수가 자동으로 design/frames 를 고른다 (테스트 수정 없이).
// - 예전 프레임에 없는 파일(예: 16-loading-* 처럼 1.22 에서 처음 그려진 상태 프레임)은 예전판이 없으므로 design/frames 를 쓴다.
// - 셸(app-sidebar·sidebar-item) 대조는 화면 이전 여부와 상관없이 새 프레임에서 읽는다 → shellFramePath / loadShellFrameNodes.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
export const NEW_FRAMES_DIR = join(ROOT, "design", "frames");
export const PRE_DESKTOP_FRAMES_DIR = join(ROOT, "tests", "fixtures", "frames-pre-desktop");

type DevRulesMigration = { desktop_migrated_screens?: number[] };

/** dev-rules.json desktop_migrated_screens (화면 번호) */
export function desktopMigratedScreens(): number[] {
  const d = JSON.parse(readFileSync(join(ROOT, "harness", "dev-rules.json"), "utf8")) as DevRulesMigration;
  if (!Array.isArray(d.desktop_migrated_screens)) throw new Error("dev-rules.json desktop_migrated_screens 없음");
  return d.desktop_migrated_screens;
}

/** 프레임 파일 이름("10-desktop", "7-doc-review-mobile.json") → 화면 번호 */
export function frameScreen(name: string): number {
  const m = /^(\d+)-/.exec(name.replace(/^.*[\\/]/, ""));
  if (!m) throw new Error(`프레임 이름에서 화면 번호를 읽지 못함: ${name}`);
  return Number(m[1]);
}

/** 그 화면이 데스크톱 재구성을 마쳤는가 (새 프레임으로 대조) */
export function isDesktopMigrated(screen: number): boolean {
  return desktopMigratedScreens().includes(screen);
}

const withJson = (name: string) => (name.endsWith(".json") ? name : `${name}.json`);

/**
 * 화면 본문 대조용 프레임 경로: 이전된 화면 = design/frames, 아니면 tests/fixtures/frames-pre-desktop
 * (예전판이 없는 새 상태 프레임은 design/frames).
 */
export function framePath(name: string): string {
  const file = withJson(name.replace(/^.*[\\/]/, ""));
  if (isDesktopMigrated(frameScreen(file))) return join(NEW_FRAMES_DIR, file);
  const old = join(PRE_DESKTOP_FRAMES_DIR, file);
  return existsSync(old) ? old : join(NEW_FRAMES_DIR, file);
}

/** 셸(app-sidebar · sidebar-item) 대조용 프레임 경로 — 늘 새 프레임 (desktop_shell_done) */
export function shellFramePath(name: string): string {
  return join(NEW_FRAMES_DIR, withJson(name.replace(/^.*[\\/]/, "")));
}

/** 프레임 파일 전체 JSON (framePath 로 고른 것) */
export function loadFrameFile<T = { figma_file?: unknown; frames: { name: string; width: number; height: number; nodes: unknown[] }[] }>(
  name: string,
): T {
  return JSON.parse(readFileSync(framePath(name), "utf8")) as T;
}

/** 프레임 첫 프레임의 nodes (framePath 로 고른 것) */
export function loadFrameNodes<N = Record<string, unknown>>(name: string): N[] {
  return (loadFrameFile<{ frames: { nodes: N[] }[] }>(name)).frames[0].nodes;
}

/** 새 프레임(design/frames)의 nodes — 셸 대조 전용 */
export function loadShellFrameNodes<N = Record<string, unknown>>(name: string): N[] {
  return (JSON.parse(readFileSync(shellFramePath(name), "utf8")) as { frames: { nodes: N[] }[] }).frames[0].nodes;
}
