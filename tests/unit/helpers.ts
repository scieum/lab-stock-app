// 규칙 파일 읽기 + 소스 스캔 도우미. 기대값은 전부 design/rules.json · harness/dev-rules.json 에서 읽는다.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";

export const ROOT = resolve(__dirname, "..", "..");

/* eslint-disable @typescript-eslint/no-explicit-any */
export const rules: any = JSON.parse(readFileSync(join(ROOT, "design/rules.json"), "utf8"));
export const dev: any = JSON.parse(readFileSync(join(ROOT, "harness/dev-rules.json"), "utf8"));
/* eslint-enable @typescript-eslint/no-explicit-any */

export const TOKENS_PATH = join(ROOT, "styles/tokens.css");

export function rel(p: string): string {
  return relative(ROOT, p).split(sep).join("/");
}

export function read(p: string): string {
  return readFileSync(p, "utf8").replace(/\r\n/g, "\n");
}

/** dirs 아래 exts 확장자 파일 (skip_dirs 제외) */
export function walk(dirs: string[], exts: string[], skip: string[] = dev.scan.skip_dirs): string[] {
  const out: string[] = [];
  const visit = (d: string) => {
    if (!existsSync(d)) return;
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) {
        if (!skip.includes(name)) visit(p);
      } else if (exts.includes(extname(name))) {
        out.push(p);
      }
    }
  };
  for (const d of dirs) visit(join(ROOT, d));
  return out.sort();
}

/** T2 스캔 대상 (dev-rules.json scan) */
export function scanFiles(): string[] {
  const sc = dev.scan;
  const exempt = new Set<string>(sc.T2_exempt_files);
  return walk(sc.T2_dirs, sc.T2_exts).filter((p) => !exempt.has(rel(p)));
}

/** tokens.css 의 --이름: 값 */
export function parseVars(css: string): Map<string, string> {
  const map = new Map<string, string>();
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of noComments.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    map.set(m[1], m[2].trim());
  }
  return map;
}

export const tokenVars = (): Map<string, string> => parseVars(read(TOKENS_PATH));

/** var(--x) 를 끝까지 풀어낸 값 */
export function resolveValue(value: string, vars: Map<string, string>, depth = 0): string {
  if (depth > 20) return value;
  const next = value.replace(/var\(\s*--([\w-]+)\s*(?:,\s*([^)]*))?\)/g, (_all, name: string, fb?: string) => {
    const v = vars.get(name);
    return v !== undefined ? v : (fb ?? `var(--${name})`);
  });
  return next === value ? value : resolveValue(next, vars, depth + 1);
}

export const normColor = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/** 풀어낸 값이 targets 중 하나인 변수 이름 */
export function varsResolvingTo(vars: Map<string, string>, targets: string[]): Set<string> {
  const t = new Set(targets.map(normColor));
  const out = new Set<string>();
  for (const name of vars.keys()) {
    if (t.has(normColor(resolveValue(`var(--${name})`, vars)))) out.add(name);
  }
  return out;
}

/** 파일 안의 로컬 커스텀 프로퍼티까지 포함해, names 를 가리키는 변수 이름 전부 */
export function aliasesIn(src: string, names: Set<string>): Set<string> {
  const all = new Set(names);
  const decls = [...src.matchAll(/--([\w-]+)\s*:\s*([^;}\n]+)/g)].map((m) => [m[1], m[2]] as const);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [n, v] of decls) {
      if (all.has(n)) continue;
      if ([...all].some((a) => refersTo(v, a))) {
        all.add(n);
        changed = true;
      }
    }
  }
  return all;
}

export function refersTo(text: string, varName: string): boolean {
  const esc = varName.replace(/[-]/g, "\\-");
  return new RegExp(`var\\(\\s*--${esc}(?![\\w-])`).test(text);
}

/** components/{이름}/ 아래 파일인지 */
export function componentOf(p: string): string | null {
  const r = rel(p);
  const m = /^components\/([^/]+)\//.exec(r);
  return m ? m[1] : null;
}

export function px(n: number): string {
  return n === 0 ? "0" : `${n}px`;
}

/** 0 과 0px 를 같게 */
export function sameLength(a: string, b: string): boolean {
  const z = (s: string) => (/^0(px)?$/.test(s.trim()) ? "0" : s.trim());
  return z(a) === z(b);
}
