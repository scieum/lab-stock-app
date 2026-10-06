// N2: 키 환경변수 이름은 서버 전용 위치에서만 쓴다 (d5 N2-env · d7 §13 "키는 GEMINI_API_KEY(서버 env, NEXT_PUBLIC_ 금지)").
// 기대값은 harness/dev-rules.json scan.secret_env_names · secret_allowed_dirs 에서 읽는다.
// (judge 의 N2-env 와 같은 규칙을 npm test 에서도 바로 본다 — 화면 5 에서 GEMINI_API_KEY 를 처음 쓰기 시작했다.)
import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, dev, read, rel, walk } from "./helpers";

const NAMES: string[] = dev.scan.secret_env_names;
const ALLOWED_DIRS: string[] = dev.scan.secret_allowed_dirs;
const CODE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".json", ".html"];
/** 앱 소스 폴더 (허용 폴더 app/api · lib/server 를 품은 상위 폴더 포함) */
const SOURCE_DIRS = ["app", "components", "lib", "styles", "public", "src", "pages", "hooks", "utils"];

const allowed = (r: string) => ALLOWED_DIRS.some((d) => r === d || r.startsWith(`${d}/`));

/** 저장소 최상위의 설정·진입 파일 (next.config.*, proxy.ts, middleware.ts, instrumentation.ts …) */
function rootFiles(): string[] {
  return readdirSync(ROOT)
    .map((name) => join(ROOT, name))
    .filter((p) => statSync(p).isFile() && CODE_EXTS.includes(extname(p)))
    .filter((p) => !/^(package-lock|tsconfig\.tsbuildinfo)/.test(rel(p)));
}

const files = [...walk(SOURCE_DIRS, CODE_EXTS), ...rootFiles()];

describe("[N2][S5] 키 환경변수 이름은 서버 전용 위치에서만", () => {
  it("전제: 검사 대상 파일·키 이름·허용 폴더가 있다", () => {
    expect(NAMES).toContain("GEMINI_API_KEY");
    expect(ALLOWED_DIRS).toEqual(expect.arrayContaining(["app/api", "lib/server"]));
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((p) => rel(p).startsWith("lib/server/"))).toBe(true);
    expect(files.some((p) => rel(p).startsWith("components/"))).toBe(true);
  });

  for (const name of NAMES) {
    it(`${name}: ${ALLOWED_DIRS.join("·")} 밖의 소스에 없음`, () => {
      const hits = files.filter((p) => !allowed(rel(p)) && read(p).includes(name)).map(rel);
      expect(hits).toEqual([]);
    });

    it(`${name}: NEXT_PUBLIC_ 접두사로 쓰지 않음 (소스 전체 · .env.example)`, () => {
      const targets = [...files, ...walk(["scripts", "tests"], CODE_EXTS)];
      const env = join(ROOT, ".env.example");
      if (existsSync(env)) targets.push(env);
      const hits = targets.filter((p) => read(p).includes("NEXT_PUBLIC_" + name)).map(rel);
      expect(hits).toEqual([]);
    });
  }

  it("GEMINI_API_KEY 는 서버 전용 모듈에서 실제로 읽는다 (양성 대조군 — 이름이 바뀌어 검사가 비지 않게)", () => {
    const users = files.filter((p) => read(p).includes("GEMINI_API_KEY")).map(rel);
    expect(users.length).toBeGreaterThan(0);
    for (const u of users) expect(allowed(u), u).toBe(true);
  });

  it("클라이언트 컴포넌트('use client')는 lib/server 를 import 하지 않는다", () => {
    const hits = walk(["app", "components", "lib"], [".ts", ".tsx"])
      .filter((p) => /^\s*["']use client["']/m.test(read(p).slice(0, 400)))
      .filter((p) => /from\s+["'](?:@\/|(?:\.\.?\/)+)lib\/server\/|from\s+["']@\/lib\/server["']/.test(read(p)))
      .map(rel);
    expect(hits).toEqual([]);
  });
});
