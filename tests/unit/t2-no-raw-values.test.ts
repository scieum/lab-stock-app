// [T2] app/·components/ 소스에 hex·px·rgb() 직접 사용 0 (dev-rules.json scan, @media 줄 예외, tokens.css 예외).
import { describe, expect, it } from "vitest";
import { dev, read, rel, scanFiles } from "./helpers";

const sc = dev.scan;
const files = scanFiles();

function violations(pattern: RegExp): string[] {
  const out: string[] = [];
  for (const f of files) {
    read(f)
      .split("\n")
      .forEach((line, i) => {
        if (line.includes(sc.T2_allow_line)) return;
        const g = new RegExp(pattern.source, "g");
        for (const m of line.matchAll(g)) out.push(`${rel(f)}:${i + 1} ${m[0]}`);
      });
  }
  return out;
}

describe("T2 직접 값 금지", () => {
  it("[T2][S*] 스캔 대상 파일이 있음 (app/·components/)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(Object.entries(sc.T2_patterns as Record<string, string>))(
    "[T2][S*] %s 직접 사용 0",
    (_name, src) => {
      expect(violations(new RegExp(src))).toEqual([]);
    },
  );

  it("[T2][S*] border-radius / borderRadius 에 숫자 직접 사용 0 (0 제외, var() 만)", () => {
    const out: string[] = [];
    for (const f of files) {
      read(f)
        .split("\n")
        .forEach((line, i) => {
          if (line.includes(sc.T2_allow_line)) return;
          for (const m of line.matchAll(/(?:border(?:-[a-z]+)*-radius|border\w*Radius)\s*:\s*([^;,}\n]+)/g)) {
            const value = m[1].replace(/var\([^)]*\)/g, "").replace(/["'`]/g, "");
            if (/\d/.test(value.replace(/\b0\b/g, ""))) out.push(`${rel(f)}:${i + 1} ${m[0].trim()}`);
          }
        });
    }
    expect(out).toEqual([]);
  });
});
