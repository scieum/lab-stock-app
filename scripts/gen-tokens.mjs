#!/usr/bin/env node
// design/rules.json -> styles/tokens.css (CSS 변수)
// 사용: node scripts/gen-tokens.mjs          (생성)
//       node scripts/gen-tokens.mjs --check  (다시 만든 결과가 파일과 다르면 exit 1)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RULES = resolve(ROOT, "design/rules.json");
const OUT = resolve(ROOT, "styles/tokens.css");

// 색 이름 (값은 rules.json colors.allowed 에서만 가져온다)
const COLOR_NAMES = {
  "#141414": "gray-950",
  "#262626": "gray-900",
  "#707070": "gray-600",
  "#adadad": "gray-400",
  "#e0e0e0": "gray-200",
  "#f0f0f0": "gray-100",
  "#f3f3f3": "gray-50",
  "#ffffff": "white",
};

// 시안 노드 크기 중 rules.json 에 목록이 없는 고정 치수 (design/frames 측정값)
const LAYOUT = [
  ["border-width", "1px"],
  ["icon-sm", "16px"],
  ["icon-md", "20px"],
  ["icon-lg", "24px"],
  ["icon-bg-size", "40px"],
  ["control-height", "48px"],
  ["tab-bar-height", "64px"],
  ["indicator-height", "4px"],
  ["nav-indicator-height", "2px"],
  ["progress-height", "4px"],
  ["status-bar-height", "8px"],
  ["qr-size", "126px"],
  ["side-column-width", "400px"],
];

// 줄 높이 (시안 텍스트 노드 높이 / 글자 크기)
const LINE_HEIGHTS = [
  ["tight", "1.3"],
  ["normal", "1.5"],
];

const WEIGHT_NAMES = { 300: "light", 400: "regular", 500: "medium", 600: "semibold", 700: "bold" };
const RADIUS_NAMES = { 0: "none", 16: "md", 24: "lg", 9999: "pill" };

function px(n) {
  return n === 0 ? "0" : `${n}px`;
}

function build(rules) {
  const lines = [];
  const add = (name, value) => lines.push(`  --${name}: ${value};`);
  const section = (title) => lines.push("", `  /* ${title} */`);

  section("color (rules.json colors.allowed)");
  const allowed = rules.colors.allowed.map((c) => c.toLowerCase());
  const roleValues = new Set(
    [rules.colors.accent.value, rules.colors.accent_soft.value, ...rules.colors.highlight.values].map((c) =>
      c.toLowerCase(),
    ),
  );
  for (const hex of allowed) {
    if (!COLOR_NAMES[hex] && roleValues.has(hex)) continue; // 아래 color roles 에서 이름으로 낸다
    add(`color-${COLOR_NAMES[hex] ?? hex.slice(1)}`, hex);
  }
  section("color roles");
  add("color-accent", rules.colors.accent.value.toLowerCase());
  add("color-accent-soft", rules.colors.accent_soft.value.toLowerCase());
  add("color-on-primary", rules.colors.on_primary.value.toLowerCase());
  const [hl, hlSoft] = rules.colors.highlight.values.map((c) => c.toLowerCase());
  add("color-highlight", hl);
  add("color-highlight-soft", hlSoft);
  for (const r of rules.colors.allowed_rgba ?? []) {
    add(`color-${r.only_in}`, r.value);
  }
  add("color-text", "var(--color-gray-950)");
  add("color-text-strong", "var(--color-gray-900)");
  add("color-text-muted", "var(--color-gray-600)");
  add("color-text-placeholder", "var(--color-gray-400)");
  add("color-surface", "var(--color-white)");
  add("color-surface-muted", "var(--color-gray-50)");
  add("color-surface-input", "var(--color-gray-100)");
  add("color-border", "var(--color-gray-100)");
  add("color-border-strong", "var(--color-gray-200)");
  add("color-primary", "var(--color-gray-950)");
  add("color-toast", "var(--color-gray-900)");

  section("radius (rules.json radius.allowed)");
  for (const r of rules.radius.allowed) {
    add(`radius-${RADIUS_NAMES[r] ?? r}`, px(r));
  }
  add("radius-button", px(rules.radius.button));
  add("radius-tab-bar", px(rules.tab_bar.radius));

  section("typography");
  add(
    "font-family",
    `"${rules.typography.family} Variable", "${rules.typography.family}", -apple-system, BlinkMacSystemFont, system-ui, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`,
  );
  for (const w of rules.typography.weights) {
    add(`font-weight-${WEIGHT_NAMES[w] ?? w}`, String(w));
  }
  for (const s of rules.typography.sizes) {
    add(`font-size-${s}`, px(s));
  }
  add("letter-spacing", px(rules.typography.letter_spacing));
  for (const [k, v] of LINE_HEIGHTS) add(`line-height-${k}`, v);

  section("spacing (rules.json spacing.allowed)");
  for (const s of rules.spacing.allowed) {
    add(`space-${s}`, px(s));
  }

  section("button");
  add("button-min-height", px(rules.button.min_height));

  section("effects (drop shadow는 exceptions 만)");
  add("shadow-none", "none");
  for (const name of rules.effects.exceptions) {
    add(`shadow-${name}`, "0 1px 3px rgba(20, 20, 20, 0.12)");
  }

  section("frames");
  add("frame-mobile-width", px(rules.frames.mobile[0]));
  add("frame-mobile-height", px(rules.frames.mobile[1]));
  add("frame-desktop-width", px(rules.frames.desktop[0]));
  add("frame-desktop-height", px(rules.frames.desktop[1]));
  add("tab-bar-items", String(rules.tab_bar.items));

  section("layout (design/frames 측정값)");
  for (const [k, v] of LAYOUT) add(k, v);

  if (rules.desktop_shell) {
    section("desktop shell (rules.json desktop_shell)");
    add("sidebar-width", px(rules.desktop_shell.width));
    add("radius-sidebar", px(rules.desktop_shell.radius));
    add("drawer-width", px(rules.desktop_shell.drawer_width));
    add("form-width", px(rules.desktop_shell.form_width));
  }

  return [
    "/* 자동 생성 파일 — 직접 고치지 않는다. */",
    "/* 원본: design/rules.json · 생성: node scripts/gen-tokens.mjs */",
    `/* rules.json version ${rules.version} */`,
    "",
    ":root {" + lines.join("\n").replace(/^\n/, "\n"),
    "}",
    "",
  ].join("\n");
}

const rules = JSON.parse(readFileSync(RULES, "utf8"));
const css = build(rules);
const norm = (s) => s.replace(/\r\n/g, "\n");

if (process.argv.includes("--check")) {
  if (!existsSync(OUT)) {
    console.error("styles/tokens.css 없음");
    process.exit(1);
  }
  const current = norm(readFileSync(OUT, "utf8"));
  if (current !== css) {
    console.error("styles/tokens.css 가 design/rules.json 생성 결과와 다릅니다. node scripts/gen-tokens.mjs 로 다시 만드세요.");
    process.exit(1);
  }
  console.log("tokens.css OK");
  process.exit(0);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, css, "utf8");
console.log("styles/tokens.css 생성");
