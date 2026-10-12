import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "node_modules/**",
    "runs/**",
    "harness/**",
    "design/**",
    "test-results/**",
    "playwright-report/**",
    // 에이전트 작업 트리 (다른 브랜치 사본)
    ".claude/**",
  ]),
]);
