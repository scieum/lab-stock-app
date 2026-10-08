// 데스크톱 셸 기대값 (unit · e2e 공용) — design/rules.json 1.22 desktop_shell, harness/dev-rules.json 1.11, d7 §23, d5 C3.
// 기대값은 규칙 파일과 새 프레임(design/frames/*-desktop, 셸 대조는 늘 새 프레임)에서만 읽는다.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { NEW_FRAMES_DIR, isDesktopMigrated, loadShellFrameNodes } from "./frames";

type DesktopShell = {
  component: string;
  item: string;
  min_items: number;
  width: number;
  radius: number;
  screens: number[];
  forbidden_on_desktop: string[];
  desktop_required: Record<string, string[]>;
  menu: { all: string[]; teacher_admin: string[]; admin: string[] };
};

const ROOT = process.cwd();
const rules = JSON.parse(readFileSync(join(ROOT, "design", "rules.json"), "utf8")) as { desktop_shell: DesktopShell };
const dev = JSON.parse(readFileSync(join(ROOT, "harness", "dev-rules.json"), "utf8")) as {
  desktop_shell_done?: boolean;
  desktop_migrated_screens?: number[];
  mvp_screens: number[];
};

export const DESKTOP_SHELL: DesktopShell = rules.desktop_shell;

/** 데스크톱 셸 컴포넌트 이름 (app-sidebar · sidebar-item) — 갤러리 화면별 페이지에는 없고 /gallery/sidebar 에 있다 */
export const DESKTOP_SHELL_NAMES: string[] = [DESKTOP_SHELL.component, DESKTOP_SHELL.item];

export type ShellRole = "student" | "teacher" | "admin";

/** desktop_shell.menu 의 역할별 메뉴 문구 (순서 = all → teacher_admin → admin) */
export function sidebarMenuOf(role: ShellRole): string[] {
  const m = DESKTOP_SHELL.menu;
  return [...m.all, ...(role === "student" ? [] : m.teacher_admin), ...(role === "admin" ? m.admin : [])];
}

/** dev-rules desktop_shell_done */
export const desktopShellDone = (): boolean => dev.desktop_shell_done === true;

/**
 * C3 셸 검사 대상 화면: desktop_shell_done 이면 desktop_shell.screens 중 이 하네스가 만든 화면(dev-rules mvp_screens).
 * (화면 12 QR 찾기는 아직 없다 — 화면 12 run 에서 들어온다)
 */
export function shellScreens(): { screens: number[]; pending: number[] } {
  if (!desktopShellDone()) return { screens: [], pending: DESKTOP_SHELL.screens };
  const mvp = new Set(dev.mvp_screens);
  return {
    screens: DESKTOP_SHELL.screens.filter((s) => mvp.has(s)),
    pending: DESKTOP_SHELL.screens.filter((s) => !mvp.has(s)),
  };
}

/**
 * 예전 프레임(tests/fixtures/frames-pre-desktop) 의 컴포넌트 개수를 지금 셸에 맞춘다 — 데스크톱 프레임만.
 * 셸 run a(d7 §23, desktop_shell_done)로 로그인 후 화면의 데스크톱 셸은 nav-pill → app-sidebar 로 바뀌었고(forbidden_on_desktop),
 * 화면 본문은 아직 예전 프레임 그대로다. 그래서 예전 데스크톱 프레임의 nav-pill n 개는 app-sidebar 1 로 읽는다
 * (본문 비교는 그대로, 셸 개수는 rules desktop_shell 로). 이전된 화면(새 프레임)·모바일 프레임은 바꾸지 않는다.
 */
export function adjustPreDesktopShell(frame: string, counts: Record<string, number>): Record<string, number> {
  const file = frame.replace(/^.*[\\/]/, "").replace(/\.json$/, "");
  if (!file.endsWith("-desktop") || !desktopShellDone()) return counts;
  const screen = Number(/^(\d+)-/.exec(file)?.[1]);
  if (!DESKTOP_SHELL.screens.includes(screen) || isDesktopMigrated(screen)) return counts;
  const out = { ...counts };
  let had = false;
  for (const f of DESKTOP_SHELL.forbidden_on_desktop) {
    if (out[f]) had = true;
    delete out[f];
  }
  if (had) out[DESKTOP_SHELL.component] = 1;
  return out;
}

type Node = { name: string; type: string; path: string[]; fills?: string[] | null; text?: { characters: string } | null; width?: number };

/** 새 프레임 {screen}-desktop 의 sidebar-item 별 글자 + 활성(바탕 채움) 여부 */
export function frameSidebarItems(frame: string): { label: string; active: boolean; fill: string | null }[] {
  const nodes = loadShellFrameNodes<Node>(frame);
  const out: { label: string; active: boolean; fill: string | null }[] = [];
  nodes.forEach((n, i) => {
    if (n.name !== DESKTOP_SHELL.item) return;
    // 이 sidebar-item 다음에 오는 첫 TEXT (프레임 노드는 문서 순서)
    const t = nodes.slice(i + 1).find((x) => x.type === "TEXT" && x.path.includes(DESKTOP_SHELL.item));
    if (!t?.text) throw new Error(`${frame} sidebar-item 글자 없음`);
    const fill = n.fills && n.fills.length > 0 ? n.fills[0] : null;
    out.push({ label: t.text.characters, active: fill !== null, fill });
  });
  return out;
}

/** 새 프레임 {screen}-desktop 의 활성 sidebar-item 글자 (활성 판정표 — 시안이 정답) */
export function frameActiveLabel(screen: number): string {
  const act = frameSidebarItems(`${screen}-desktop`).filter((i) => i.active);
  if (act.length !== 1) throw new Error(`${screen}-desktop 활성 sidebar-item ${act.length}개`);
  return act[0].label;
}

/** 새 프레임 {frame} 의 이름이 name 인 첫 노드 */
export function frameNode(frame: string, name: string): Node & Record<string, unknown> {
  const n = loadShellFrameNodes<Node & Record<string, unknown>>(frame).find((x) => x.name === name);
  if (!n) throw new Error(`${frame} 에 ${name} 노드 없음`);
  return n;
}

/** 새 프레임에서 조상 경로에 ancestor 가 있는 TEXT 글자 */
export function frameTexts(frame: string, ancestor: string): string[] {
  return loadShellFrameNodes<Node>(frame)
    .filter((n) => n.type === "TEXT" && n.path.includes(ancestor) && n.text)
    .map((n) => n.text!.characters);
}

/**
 * 데스크톱 전용 본문 컴포넌트 (run b: data-table · detail-drawer) — rules desktop_shell.desktop_required 에 있고
 * 새 프레임의 어느 모바일 프레임(design/frames/*-mobile)에도 없는 이름. d7 §23 "모바일은 지금처럼 전용 화면" 이라 폭 390 에서는 0.
 * (msds-summary 처럼 모바일 프레임에도 있는 것은 빠진다)
 */
export function deskOnlyComponents(): string[] {
  const req = [...new Set(Object.values(DESKTOP_SHELL.desktop_required).flat())];
  const mobileNames = new Set<string>();
  for (const f of readdirSync(NEW_FRAMES_DIR).filter((x) => x.endsWith("-mobile.json"))) {
    const j = JSON.parse(readFileSync(join(NEW_FRAMES_DIR, f), "utf8")) as { frames: { nodes: { name: string }[] }[] };
    for (const n of j.frames[0].nodes) mobileNames.add(n.name);
  }
  return req.filter((n) => !mobileNames.has(n));
}
