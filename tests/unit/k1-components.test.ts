// [K1] dev-rules.json components 이름마다 components/{이름}/ + data-component="{이름}" + 갤러리에 등장.
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, dev, read, walk } from "./helpers";

const names = Object.keys(dev.components as Record<string, number[]>);
const GALLERY = join(ROOT, "app/gallery/page.tsx");

function marker(name: string): RegExp {
  const esc = name.replace(/[-]/g, "\\-");
  // data-component="name" / 'name' / {"name"}
  return new RegExp(`data-component=(?:"${esc}"|'${esc}'|\\{\\s*["'\`]${esc}["'\`]\\s*\\})`);
}

describe("K1 components", () => {
  it("[K1][S*] dev-rules.json components 목록이 비어 있지 않음", () => {
    expect(names.length).toBeGreaterThan(0);
  });

  it.each(names)("[K1][S*] components/%s/ 폴더 존재", (name) => {
    const dir = join(ROOT, "components", name);
    expect(existsSync(dir) && statSync(dir).isDirectory()).toBe(true);
  });

  it.each(names)('[K1][S*] components/%s/ 소스에 data-component="이름" 존재', (name) => {
    const files = walk([`components/${name}`], [".tsx", ".ts", ".jsx", ".js"]);
    const found = files.some((f) => marker(name).test(read(f)));
    expect(found).toBe(true);
  });

  it("[K1][S*] 갤러리 페이지 app/gallery/page.tsx 존재", () => {
    expect(existsSync(GALLERY)).toBe(true);
  });

  it.each(names)("[K1][S*] 갤러리 페이지가 components/%s 를 가져와 씀", (name) => {
    const src = existsSync(GALLERY) ? read(GALLERY) : "";
    const esc = name.replace(/[-]/g, "\\-");
    const imp = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*["'](?:@/|\\.\\./\\.\\./)components/${esc}["']`).exec(src);
    expect(imp, `components/${name} import 없음`).not.toBeNull();
    const used = imp![1]
      .split(",")
      .map((s) => s.trim().split(/\s+as\s+/).pop()!.trim())
      .filter(Boolean)
      .some((id) => new RegExp(`<${id}[\\s/>]`).test(src));
    expect(used, `components/${name} 를 JSX 로 렌더하지 않음`).toBe(true);
  });
});
