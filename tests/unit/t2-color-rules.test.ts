// [T2] 디자인 색·효과 규칙 정적 검사 (design/rules.json colors.highlight·accent·accent_soft·allowed_rgba, effects).
// 토큰 이름은 tokens.css 에서 값으로 역추적한다 (값은 rules.json 에서 읽음).
import { describe, expect, it } from "vitest";
import {
  aliasesIn,
  componentOf,
  read,
  refersTo,
  rel,
  resolveValue,
  rules,
  scanFiles,
  tokenVars,
  varsResolvingTo,
} from "./helpers";

const vars = tokenVars();
const files = scanFiles().map((f) => ({ path: rel(f), comp: componentOf(f), src: read(f) }));

const highlightVars = varsResolvingTo(vars, rules.colors.highlight.values);
const noTextVars = varsResolvingTo(vars, rules.colors.highlight.no_text);
const accentVars = varsResolvingTo(vars, [rules.colors.accent.value]);
const accentSoftVars = varsResolvingTo(vars, [rules.colors.accent_soft.value]);

/** 파일에서 names(+로컬 별칭) 를 참조하는 줄 */
function usages(src: string, names: Set<string>, prop?: RegExp): string[] {
  const all = aliasesIn(src, names);
  const out: string[] = [];
  src.split("\n").forEach((line, i) => {
    const targets = prop ? [...line.matchAll(prop)].map((m) => m[1]) : [line];
    if (targets.some((t) => [...all].some((n) => refersTo(t, n)))) out.push(`${i + 1}: ${line.trim()}`);
  });
  return out;
}

// 글자색 속성: color, -webkit-text-fill-color, text-decoration-color (CSS·인라인 style 모두)
const TEXT_COLOR_PROP =
  /(?<![\w-])(?:color|-webkit-text-fill-color|text-decoration-color|WebkitTextFillColor|textDecorationColor)\s*:\s*([^;}\n]+)/g;

/** CSS 규칙 블록: 선택자 · 본문 · 각 선택자의 주체(마지막 compound) 클래스 */
function cssRules(css: string): { selector: string; body: string; line: number; selectors: string[] }[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
  const out: { selector: string; body: string; line: number; selectors: string[] }[] = [];
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim();
    const line = clean.slice(0, m.index! + m[1].length).split("\n").length;
    // 주체 클래스: 쉼표로 나눈 각 선택자의 마지막 compound 에서 클래스 하나라도 없으면 "" (텍스트 가능으로 간주)
    const selectors = selector.split(",").map((s) => {
      const last = s.trim().split(/\s+|>|\+|~/).filter(Boolean).pop() ?? "";
      const cls = [...last.matchAll(/\.([\w-]+)/g)].map((c) => c[1]);
      return cls.length ? cls[cls.length - 1] : "";
    });
    out.push({ selector, body: m[2], line, selectors });
  }
  return out;
}

function siblingTsx(cssPath: string): string {
  const dir = cssPath.replace(/\/[^/]+$/, "");
  return files
    .filter((f) => f.path.startsWith(dir + "/") && /\.tsx$/.test(f.path))
    .map((f) => f.src)
    .join("\n");
}

/** styles.X 가 TSX 에서 <Icon> 에만, 또는 자식이 <Icon/> 뿐인 요소에만 붙는지 (글자 없음) */
function iconOnlyClass(tsx: string, cls: string): boolean {
  if (!cls) return false;
  const ref = new RegExp(`styles(?:\\.${cls}|\\[["']${cls}["']\\])(?![\\w-])`, "g");
  const occ = [...tsx.matchAll(ref)];
  if (occ.length === 0) return false;
  return occ.every((m) => {
    const open = tsx.lastIndexOf("<", m.index!);
    const tag = /^<([A-Za-z][\w.]*)/.exec(tsx.slice(open))?.[1];
    if (!tag) return false;
    if (tag === "Icon" || tag === "svg") return true;
    // 자식이 <Icon .../> 하나뿐인 요소
    const end = tsx.indexOf(">", m.index!);
    const close = tsx.indexOf(`</${tag}>`, end);
    if (end < 0 || close < 0) return false;
    const children = tsx.slice(end + 1, close).trim();
    return /^(?:<Icon\b[^>]*\/>\s*)+$/.test(children);
  });
}

describe("T2 색 규칙", () => {
  it("[T2][S*] tokens.css 에서 하늘색·핑크 토큰을 찾을 수 있음", () => {
    expect(highlightVars.size).toBeGreaterThan(0);
    expect(noTextVars.size).toBeGreaterThan(0);
    expect(accentVars.size).toBeGreaterThan(0);
    expect(accentSoftVars.size).toBeGreaterThan(0);
  });

  it("[T2][S*] 하늘색(colors.highlight.no_text) 토큰이 글자색(color) 속성에 쓰이지 않음 (아이콘 전용 클래스 제외)", () => {
    const bad: string[] = [];
    for (const f of files) {
      if (f.path.endsWith(".css")) {
        const tsx = siblingTsx(f.path);
        const aliases = aliasesIn(f.src, noTextVars);
        for (const r of cssRules(f.src)) {
          const hits = [...r.body.matchAll(TEXT_COLOR_PROP)].filter((m) => [...aliases].some((n) => refersTo(m[1], n)));
          if (hits.length === 0) continue;
          if (r.selectors.length > 0 && r.selectors.every((c) => iconOnlyClass(tsx, c))) continue;
          bad.push(`${f.path}:${r.line}: ${r.selector} { ${hits.map((h) => h[0].trim()).join("; ")} }`);
        }
      } else {
        for (const u of usages(f.src, noTextVars, TEXT_COLOR_PROP)) bad.push(`${f.path}:${u}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("[T2][S*] 하늘색 토큰은 colors.highlight.forbidden_within 컴포넌트에서 쓰이지 않음", () => {
    const forbidden = rules.colors.highlight.forbidden_within as string[];
    const bad = files
      .filter((f) => f.comp && forbidden.includes(f.comp))
      .flatMap((f) => usages(f.src, highlightVars).map((u) => `${f.path}:${u}`));
    expect(bad).toEqual([]);
  });

  it("[T2][S*] 핑크(colors.accent) 토큰은 accent.only_within 컴포넌트에서만", () => {
    const only = rules.colors.accent.only_within as string[];
    const bad = files
      .filter((f) => !(f.comp && only.includes(f.comp)))
      .flatMap((f) => usages(f.src, accentVars).map((u) => `${f.path}:${u}`));
    expect(bad).toEqual([]);
  });

  it("[T2][S*] 연핑크(colors.accent_soft) 토큰은 accent_soft.only_within 컴포넌트에서만", () => {
    const only = rules.colors.accent_soft.only_within as string[];
    const bad = files
      .filter((f) => !(f.comp && only.includes(f.comp)))
      .flatMap((f) => usages(f.src, accentSoftVars).map((u) => `${f.path}:${u}`));
    expect(bad).toEqual([]);
  });

  it("[T2][S*] colors.allowed_rgba 토큰은 only_in 컴포넌트에서만", () => {
    const bad: string[] = [];
    for (const r of rules.colors.allowed_rgba ?? []) {
      const names = varsResolvingTo(vars, [r.value]);
      for (const f of files) {
        if (f.comp === r.only_in) continue;
        for (const u of usages(f.src, names)) bad.push(`${f.path}:${u}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("[T2][S*] box-shadow·text-shadow 는 none 만 (effects.exceptions 컴포넌트 제외)", () => {
    const exceptions = rules.effects.exceptions as string[];
    const PROP = /(?<![\w-])(?:box-shadow|text-shadow|boxShadow|textShadow)\s*:\s*([^;}\n]+)/g;
    const bad: string[] = [];
    for (const f of files) {
      if (f.comp && exceptions.includes(f.comp)) continue;
      f.src.split("\n").forEach((line, i) => {
        for (const m of line.matchAll(PROP)) {
          const v = resolveValue(m[1].replace(/["'`]/g, "").trim(), vars).trim();
          if (v !== "none") bad.push(`${f.path}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(bad).toEqual([]);
  });

  it("[T2][S*] drop-shadow() 필터 사용 0 (effects.drop_shadow_max)", () => {
    const max = rules.effects.drop_shadow_max as number;
    const exceptions = rules.effects.exceptions as string[];
    const hits = files
      .filter((f) => !(f.comp && exceptions.includes(f.comp)))
      .flatMap((f) =>
        f.src
          .split("\n")
          .map((line, i) => (/drop-shadow\(/.test(line) ? `${f.path}:${i + 1}: ${line.trim()}` : null))
          .filter((x): x is string => x !== null),
      );
    expect(hits.length).toBeLessThanOrEqual(max);
  });

  it("[T2][S*] effects.exceptions 그림자 토큰은 그 컴포넌트에서만 참조", () => {
    const bad: string[] = [];
    for (const name of rules.effects.exceptions as string[]) {
      const tokenNames = new Set([...vars.keys()].filter((k) => k.startsWith("shadow-") && k.includes(name)));
      for (const f of files) {
        if (f.comp === name) continue;
        for (const u of usages(f.src, tokenNames)) bad.push(`${f.path}:${u}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
