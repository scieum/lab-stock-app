// [N2-env] 게시판 운영자 이메일 환경변수 (harness/d7-data.md §30 '운영자', d5 N2-env):
//   BOARD_OPERATOR_EMAIL 은 서버에서만 읽는다(lib/server · app/api), NEXT_PUBLIC 금지, 값은 로그·응답에 쓰지 않는다.
//   화면(클라이언트) 코드에서 이름조차 나오지 않아야 번들(N2-bundle)에 실리지 않는다.
import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, read, rel, walk } from "./helpers";

const NAME = "BOARD_OPERATOR_EMAIL";
const ALLOWED = ["lib/server", "app/api"];
const CODE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".html", ".css"];
const SOURCE_DIRS = ["app", "components", "lib", "styles", "public", "src", "pages", "hooks", "utils"];

const allowed = (r: string) => ALLOWED.some((d) => r === d || r.startsWith(`${d}/`));

function rootFiles(): string[] {
  return readdirSync(ROOT)
    .map((name) => join(ROOT, name))
    .filter((p) => statSync(p).isFile() && CODE_EXTS.includes(extname(p)))
    .filter((p) => !/^(package-lock|tsconfig\.tsbuildinfo)/.test(rel(p)));
}

const files = [...walk(SOURCE_DIRS, CODE_EXTS), ...rootFiles()];

describe("[N2-env][S20] BOARD_OPERATOR_EMAIL 은 lib/server · app/api 에서만", () => {
  it("양성 대조: lib/server 의 운영자 확인 모듈이 실제로 읽는다", () => {
    const users = files.filter((p) => read(p).includes(NAME)).map(rel);
    expect(users).toContain("lib/server/board-operator.ts");
    expect(read(join(ROOT, "lib/server/board-operator.ts"))).toMatch(/process\.env\.BOARD_OPERATOR_EMAIL/);
  });

  it("lib/server · app/api 밖의 앱 소스·설정 파일에 이름이 없다", () => {
    const hits = files.filter((p) => !allowed(rel(p)) && read(p).includes(NAME)).map(rel);
    expect(hits).toEqual([]);
  });

  it("NEXT_PUBLIC_ 접두사로 쓰지 않는다 (소스 · scripts · tests · .env.example)", () => {
    const targets = [...files, ...walk(["scripts", "tests"], CODE_EXTS)];
    const env = join(ROOT, ".env.example");
    if (existsSync(env)) targets.push(env);
    const hits = targets.filter((p) => read(p).includes(`NEXT_PUBLIC_${NAME}`)).map(rel);
    expect(hits).toEqual([]);
  });

  it("'use client' 파일은 운영자 모듈(lib/server/board-operator)을 import 하지 않는다", () => {
    const hits = walk(["app", "components", "lib"], [".ts", ".tsx"])
      .filter((p) => /^\s*["']use client["']/m.test(read(p).slice(0, 400)))
      .filter((p) => /board-operator/.test(read(p)))
      .map(rel);
    expect(hits).toEqual([]);
  });

  it("운영자 이메일 값을 console 로그로 남기지 않는다 (process.env 값이 console.* 인자에 없음)", () => {
    const hits = files
      .filter((p) => allowed(rel(p)) && read(p).includes(NAME))
      .filter((p) => /console\.\w+\([^)]*(BOARD_OPERATOR_EMAIL|operatorEmail\(\))/.test(read(p)))
      .map(rel);
    expect(hits).toEqual([]);
  });

  it("lib/server/board-operator 는 server-only 를 import 한다 (클라이언트 번들 유입 차단)", () => {
    expect(read(join(ROOT, "lib/server/board-operator.ts"))).toMatch(/^import\s+["']server-only["']/m);
  });
});
