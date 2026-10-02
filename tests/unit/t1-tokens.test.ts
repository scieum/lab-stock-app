// [T1] styles/tokens.css 가 design/rules.json 의 색·radius·폰트·간격 값을 모두 담고, 그 밖의 값은 없는지.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROOT, TOKENS_PATH, dev, normColor, px, resolveValue, rules, sameLength, tokenVars } from "./helpers";

const vars = existsSync(TOKENS_PATH) ? tokenVars() : new Map<string, string>();

/** prefix 로 시작하는 변수들의 (풀어낸) 값 */
function valuesWithPrefix(prefix: string): string[] {
  return [...vars.entries()]
    .filter(([k]) => k.startsWith(prefix))
    .map(([, v]) => resolveValue(v, vars).trim());
}

function hasLength(prefix: string, n: number): boolean {
  return valuesWithPrefix(prefix).some((v) => sameLength(v, px(n)));
}

function expectedColors(): string[] {
  const c = rules.colors;
  const list: string[] = [
    ...c.allowed,
    ...(c.allowed_rgba ?? []).map((r: { value: string }) => r.value),
    c.accent.value,
    c.accent_soft.value,
    c.on_primary.value,
    ...c.highlight.values,
  ];
  return [...new Set(list.map(normColor))];
}

describe("T1 tokens.css", () => {
  it("[T1][S*] styles/tokens.css 존재", () => {
    expect(existsSync(TOKENS_PATH)).toBe(true);
  });

  it("[T1][S*] gen-tokens --check: tokens.css = rules.json 생성 결과 (diff 0)", () => {
    const cmd: string = dev.commands.T1; // "node scripts/gen-tokens.mjs --check"
    const [bin, ...args] = cmd.split(/\s+/);
    let code = 0;
    try {
      execFileSync(bin === "node" ? process.execPath : bin, args, { cwd: ROOT, stdio: "pipe" });
    } catch (e) {
      code = (e as { status?: number }).status ?? 1;
    }
    expect(code).toBe(0);
  });

  it("[T1][S*] 색: rules.json colors(allowed·allowed_rgba·accent·accent_soft·on_primary·highlight) 값을 모두 담음", () => {
    const have = new Set(valuesWithPrefix("color-").map(normColor));
    const missing = expectedColors().filter((c) => !have.has(c));
    expect(missing).toEqual([]);
  });

  it("[T1][S*] 색: tokens.css 의 hex·rgb 값은 전부 rules.json 허용 색", () => {
    const allowed = new Set(
      [...rules.colors.allowed, ...(rules.colors.allowed_rgba ?? []).map((r: { value: string }) => r.value)].map(
        normColor,
      ),
    );
    const extra = valuesWithPrefix("color-")
      .map(normColor)
      .filter((v) => /^#|^rgba?\(/.test(v))
      .filter((v) => !allowed.has(v));
    expect(extra).toEqual([]);
  });

  it("[T1][S*] 색: allowed_rgba 는 only_in 이름의 토큰으로만 존재", () => {
    const wrong: string[] = [];
    for (const r of rules.colors.allowed_rgba ?? []) {
      for (const [k, v] of vars) {
        if (normColor(v) === normColor(r.value) && !k.includes(r.only_in)) wrong.push(`--${k}`);
      }
      const named = [...vars.keys()].some((k) => k.includes(r.only_in) && normColor(resolveValue(vars.get(k)!, vars)) === normColor(r.value));
      if (!named) wrong.push(`(없음) ${r.only_in}`);
    }
    expect(wrong).toEqual([]);
  });

  it("[T1][S*] radius: rules.json radius.allowed 값을 모두 담음", () => {
    const missing = (rules.radius.allowed as number[]).filter((r) => !hasLength("radius-", r));
    expect(missing).toEqual([]);
  });

  it("[T1][S*] radius: radius-* 토큰 값은 전부 radius.allowed 안", () => {
    const allowed = (rules.radius.allowed as number[]).map(px);
    const extra = valuesWithPrefix("radius-").filter((v) => !allowed.some((a) => sameLength(v, a)));
    expect(extra).toEqual([]);
  });

  it("[T1][S*] radius: button radius = radius.button, tab-bar radius = tab_bar.radius", () => {
    expect(sameLength(resolveValue(vars.get("radius-button") ?? "(없음)", vars), px(rules.radius.button))).toBe(true);
    expect(sameLength(resolveValue(vars.get("radius-tab-bar") ?? "(없음)", vars), px(rules.tab_bar.radius))).toBe(true);
  });

  it("[T1][S*] 폰트: font-family 에 typography.family 포함, figma_fallback_family 미포함", () => {
    const fam = vars.get("font-family") ?? "";
    expect(fam).toContain(`"${rules.typography.family}"`);
    expect(fam).not.toContain(rules.typography.figma_fallback_family);
  });

  it("[T1][S*] 폰트: typography.weights 를 모두 담고 그 밖의 weight 없음", () => {
    const have = valuesWithPrefix("font-weight-").map(Number);
    const want = rules.typography.weights as number[];
    expect(want.filter((w) => !have.includes(w))).toEqual([]);
    expect(have.filter((w) => !want.includes(w))).toEqual([]);
  });

  it("[T1][S*] 폰트: typography.sizes 를 모두 담고 그 밖의 size 없음", () => {
    const want = rules.typography.sizes as number[];
    expect(want.filter((s) => !hasLength("font-size-", s))).toEqual([]);
    const extra = valuesWithPrefix("font-size-").filter((v) => !want.some((s) => sameLength(v, px(s))));
    expect(extra).toEqual([]);
  });

  it("[T1][S*] 폰트: letter-spacing = typography.letter_spacing", () => {
    const ls = vars.get("letter-spacing");
    expect(ls).toBeDefined();
    expect(sameLength(resolveValue(ls!, vars), px(rules.typography.letter_spacing))).toBe(true);
  });

  it("[T1][S*] 간격: spacing.allowed 를 모두 담고 space-* 에 그 밖의 값 없음", () => {
    const want = rules.spacing.allowed as number[];
    expect(want.filter((s) => !hasLength("space-", s))).toEqual([]);
    const extra = valuesWithPrefix("space-").filter((v) => !want.some((s) => sameLength(v, px(s))));
    expect(extra).toEqual([]);
  });

  it("[T1][S*] 버튼: button-min-height = button.min_height", () => {
    const v = vars.get("button-min-height");
    expect(v).toBeDefined();
    expect(sameLength(resolveValue(v!, vars), px(rules.button.min_height))).toBe(true);
  });

  it("[T1][S*] 효과: none 이 아닌 shadow 토큰은 effects.exceptions 이름만", () => {
    const exceptions = rules.effects.exceptions as string[];
    const wrong = [...vars.entries()]
      .filter(([k]) => k.startsWith("shadow-"))
      .filter(([, v]) => resolveValue(v, vars).trim() !== "none")
      .map(([k]) => k)
      .filter((k) => !exceptions.includes(k.slice("shadow-".length)));
    expect(wrong).toEqual([]);
  });
});
