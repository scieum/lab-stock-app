// 파스코 센서 카탈로그 (lib/pasco-catalog — d7 §28 "파스코 카탈로그", rules 1.28 sensor.catalog).
// 기대값: 디자인 요청 8 부록 "부록 — 파스코 카탈로그 요약"(../디자인하네스-요청서-2026-10-11-8.md — d7 §28 이 가리키는 원본),
//         design/rules.json sensor.catalog(maker · suggest 최대 줄 · fill 문구) · sensor.types · makers,
//         design/frames/17-model-mobile(후보 행 "PS-321" → 모델번호 순 · caption "이름 · 종류").
// 부록의 종류 "심박" · "생체" 는 rules 27종의 "심박·생체" 로 맞춘다 (d7 §28: 기존 "심박" = "심박·생체").
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  PASCO_CATALOG,
  PASCO_MAKER,
  PASCO_SUGGEST_MAX,
  catalogFill,
  catalogFillNote,
  findPascoModel,
  isPascoMaker,
  pascoCaption,
  searchPascoCatalog,
} from "../../lib/pasco-catalog";
import { ROOT, read, rules } from "./helpers";

const REQUEST8 = join(ROOT, "..", "디자인하네스-요청서-2026-10-11-8.md");
const TYPES: string[] = rules.sensor.types;
const CATALOG = rules.sensor.catalog as { maker: string; suggest: string; fill: string };
const MAX = Number(/최대 (\d+)줄/.exec(CATALOG.suggest)?.[1]);
const FILL_NOTE = /'(카탈로그에서[^']+)'/.exec(CATALOG.fill)?.[1] ?? "";
const MAKERS: string[] = Object.values(rules.sensor.makers as Record<string, unknown>).filter(Array.isArray).flat() as string[];

/** 부록 종류 이름 → rules 27종 ("심박" · "생체" → "심박·생체") */
const toType = (s: string): string | null => {
  const t = s.trim();
  if (TYPES.includes(t)) return t;
  return TYPES.find((x) => x.split("·").includes(t)) ?? null;
};

type Want = { model: string; type: string; name: string | null; discontinued: boolean };
/** 부록 표: | 종류 | PS-3201 무선 온도 · PS-2141/2142 힘 측정판 · … | + "판매 중단: PS-2110(PASPORT CO₂) · …" */
const APPENDIX: { rows: Want[]; rawTypes: string[] } = (() => {
  if (!existsSync(REQUEST8)) return { rows: [], rawTypes: [] };
  const src = read(REQUEST8);
  const part = src.slice(src.indexOf("## 부록 — 파스코 카탈로그 요약"));
  const rows: Want[] = [];
  const rawTypes: string[] = [];
  for (const line of part.split("\n")) {
    const m = /^\| ([^|]+) \| ([^|]+) \|$/.exec(line.trim());
    if (!m || m[1].includes("종류(제안)") || m[1].startsWith("---")) continue;
    rawTypes.push(m[1].trim());
    const type = toType(m[1]) ?? `?${m[1]}`;
    for (const item of m[2].split(" · ")) {
      const im = /^([A-Z]{2})-(\d{4})((?:\/\d{4})*)\s*(.*)$/.exec(item.trim());
      if (!im) continue;
      const nums = [im[2], ...im[3].split("/").filter(Boolean)];
      let name: string | null = im[4].trim() || null;
      // 줄 끝 설명 "(이온 선택성 전극)" 처럼 이름 뒤에 붙은 괄호는 줄 전체 설명 → 이름은 괄호 앞
      if (name && / \(/.test(name) && !name.startsWith("(")) name = name.slice(0, name.indexOf(" (")).trim();
      for (const n of nums) rows.push({ model: `${im[1]}-${n}`, type, name, discontinued: false });
    }
  }
  const stop = /판매 중단: ([^\n]+?)\./.exec(part)?.[1] ?? "";
  for (const m of stop.matchAll(/([A-Z]{2}-\d{4})\(([^)]+)\)/g)) {
    const kind = m[2].replace(/^PASPORT\s*/, "");
    rows.push({ model: m[1], type: toType(kind) ?? `?${kind}`, name: null, discontinued: true });
  }
  return { rows, rawTypes };
})();
const squash = (s: string) => s.replace(/\s/g, "");

describe("[C1][S17] 파스코 카탈로그 = 디자인 요청 8 부록 (d7 §28)", () => {
  it("[C1][S17] 기대값 원본: 요청 8 부록이 있고 · 종류 줄은 모두 27종(심박·생체 합침)에 들어감 · rules catalog maker 파스코 · 최대 6줄 · 채움 문구", () => {
    expect(existsSync(REQUEST8), `요청 8 원본 ${REQUEST8}`).toBe(true);
    expect(APPENDIX.rows.length, "부록 모델 수").toBeGreaterThan(0);
    for (const r of APPENDIX.rows) expect(r.type, `${r.model} 종류가 27종 안`).not.toMatch(/^\?/);
    expect(APPENDIX.rawTypes, "부록에 심박 · 생체 줄").toEqual(expect.arrayContaining(["심박", "생체"]));
    expect(new Set(APPENDIX.rows.map((r) => r.model)).size, "부록 모델번호 중복 없음").toBe(APPENDIX.rows.length);
    expect(CATALOG.maker).toBe("파스코");
    expect(MAKERS, "파스코는 rules 회사 목록 안").toContain(CATALOG.maker);
    expect(MAX).toBe(6);
    expect(FILL_NOTE).toBe("카탈로그에서 종류·이름을 채웠어요");
  });

  it("[C1][S17] 모델 수 = 부록 모델 수 · 모델번호 집합이 같음 (빠짐 · 덧붙임 · 중복 없음)", () => {
    const got = PASCO_CATALOG.map((m) => m.model);
    expect(new Set(got).size, "카탈로그 중복 없음").toBe(got.length);
    expect(got.length, "모델 수").toBe(APPENDIX.rows.length);
    expect([...got].sort()).toEqual(APPENDIX.rows.map((r) => r.model).sort());
  });

  it("[C1][S17] 모델마다 종류 = 부록 줄 종류(27종 안) · 판매 중단 = 부록 '판매 중단' 2개만 · 한국어 이름 있음(부록 이름을 품음)", () => {
    const byModel = new Map(APPENDIX.rows.map((r) => [r.model, r]));
    for (const m of PASCO_CATALOG) {
      const w = byModel.get(m.model);
      expect(w, `${m.model} 부록에 있음`).toBeTruthy();
      if (!w) continue;
      expect(TYPES, `${m.model} 종류 27종 안`).toContain(m.type);
      expect(m.type, `${m.model} 종류`).toBe(w.type);
      expect(Boolean(m.discontinued), `${m.model} 판매 중단`).toBe(w.discontinued);
      expect(m.nameKo.trim().length, `${m.model} 이름`).toBeGreaterThan(0);
      expect(m.nameKo.length, `${m.model} 이름 40자 이하 (센서 이름 칸)`).toBeLessThanOrEqual(40);
      if (w.name) expect(squash(m.nameKo), `${m.model} 이름이 부록 '${w.name}' 을 품음`).toContain(squash(w.name));
    }
    expect(PASCO_CATALOG.filter((m) => m.discontinued).map((m) => m.model).sort()).toEqual(APPENDIX.rows.filter((r) => r.discontinued).map((r) => r.model).sort());
    // 분광 · 편광 포함 (d7 §28 데모 시드 종류 다양하게 — 카탈로그에 그 종류가 있어야 한다)
    for (const t of ["분광", "편광"]) expect(PASCO_CATALOG.some((m) => m.type === t), `카탈로그에 ${t}`).toBe(true);
  });

  it("[C1][S17] PASCO_MAKER = rules catalog.maker · 후보 최대 = rules 6줄 · 파스코 계열 회사 이름(PASCO · Pasco Scientific · 파스코) 알아봄", () => {
    expect(PASCO_MAKER).toBe(CATALOG.maker);
    expect(PASCO_SUGGEST_MAX).toBe(MAX);
    for (const m of ["파스코", "PASCO", "pasco", "Pasco Scientific", " PASCO "]) expect(isPascoMaker(m), m).toBe(true);
    for (const m of ["버니어", "Vernier", "", null, undefined]) expect(isPascoMaker(m), String(m)).toBe(false);
  });
});

describe("[C1][S17] 모델 후보 검색 (rules sensor.catalog.suggest)", () => {
  const modelKey = (s: string) => s.toLowerCase().replace(/[\s-]/g, "");

  it(`[C1][S17] 최대 ${MAX}개 · 빈 글자 = 0개 · 아무 글자나 넣어도 ${MAX}개를 넘지 않음`, () => {
    expect(searchPascoCatalog("")).toEqual([]);
    expect(searchPascoCatalog("   ")).toEqual([]);
    for (const q of ["PS", "ps-", "3", "무선", "온도", "센서", "PS-32", "2", "-"]) {
      const r = searchPascoCatalog(q);
      expect(r.length, `'${q}'`).toBeLessThanOrEqual(MAX);
    }
    expect(searchPascoCatalog("PS").length, "후보가 많으면 딱 6개").toBe(MAX);
    expect(searchPascoCatalog("무선").length).toBe(MAX);
    expect(searchPascoCatalog("zzzz")).toEqual([]);
  });

  it("[C1][S17] 하이픈 · 대소문자 · 공백 무시: 'ps3215' · 'PS 3215' · 'Ps-3215' → PS-3215 가 첫 줄", () => {
    for (const q of ["ps3215", "PS 3215", "Ps-3215", "PS-3215", " ps-3215 "]) {
      expect(searchPascoCatalog(q)[0]?.model, `'${q}'`).toBe("PS-3215");
    }
    expect(searchPascoCatalog("ci6605")[0]?.model).toBe("CI-6605");
  });

  it("[C1][S17] 모델번호 일치가 먼저 · 앞부분 일치는 모델번호 순 — 시안 17-model 'PS-321' 후보 = 3210 · 3211 · 3212 · 3213 … (시안 행이 이 순서로 들어 있음)", () => {
    const nodes = (JSON.parse(read(join(ROOT, "design/frames/17-model-mobile.json"))) as { frames: { nodes: { name: string; text?: { characters: string } | null }[] }[] }).frames[0].nodes;
    const matches = nodes.filter((n) => n.name === "match").map((n) => n.text!.characters);
    const rests = nodes.filter((n) => n.name === "rest").map((n) => n.text!.characters);
    const captions = nodes.filter((n) => n.name === "caption" && n.text && n.text.characters.includes(" · ")).map((n) => n.text!.characters);
    const query = matches[0];
    expect(new Set(matches).size, "시안 행 모두 같은 검색어").toBe(1);
    const frameModels = rests.map((r) => `${query}${r}`);
    expect(frameModels.length).toBeGreaterThan(0);
    const got = searchPascoCatalog(query);
    expect(got.length).toBe(MAX);
    const startsWith = PASCO_CATALOG.filter((m) => modelKey(m.model).startsWith(modelKey(query)))
      .map((m) => m.model)
      .sort();
    expect(got.map((m) => m.model), "앞부분 일치 → 모델번호 순").toEqual(startsWith.slice(0, MAX));
    expect(got.slice(0, 4).map((m) => m.model), "시안 첫 4줄").toEqual(frameModels.slice(0, 4));
    // 시안 행은 결과 안에 같은 순서로 (부분열)
    let i = 0;
    for (const m of got) if (m.model === frameModels[i]) i++;
    expect(i, `시안 행 ${frameModels.join(" · ")} 이 결과 안에 순서대로`).toBe(frameModels.length);
    // caption = "이름 · 종류" (시안 caption 과 같은 글자)
    for (const [k, fm] of frameModels.entries()) {
      const m = PASCO_CATALOG.find((x) => x.model === fm)!;
      expect(pascoCaption(m), `${fm} caption`).toBe(captions[k]);
    }
  });

  it("[C1][S17] 모델번호 일치 → 이름 · 종류 일치 순: 모델번호에 맞는 후보가 이름에만 맞는 후보보다 앞", () => {
    for (const q of ["32", "3", "21", "PS-2", "온도", "편광", "센서", "전"]) {
      const r = searchPascoCatalog(q);
      const isModel = r.map((m) => modelKey(m.model).includes(modelKey(q)));
      const firstName = isModel.indexOf(false);
      if (firstName >= 0) expect(isModel.slice(firstName).every((v) => !v), `'${q}': 이름 일치 뒤에 모델번호 일치 없음`).toBe(true);
      for (const m of r) {
        const hit = modelKey(m.model).includes(modelKey(q)) || squash(m.nameKo).toLowerCase().includes(squash(q).toLowerCase()) || m.type.includes(q);
        expect(hit, `'${q}' → ${m.model} 맞는 후보`).toBe(true);
      }
    }
  });

  it("[C1][S17] 이름 검색 '편광' → PS-3237 '무선 편광계 · 편광' 첫 줄 (rules suggest 예시) · 같은 순위에서 판매 중단은 뒤로", () => {
    const r = searchPascoCatalog("편광");
    expect(r[0]?.model).toBe("PS-3237");
    expect(pascoCaption(r[0])).toBe("무선 편광계 · 편광");
    expect(CATALOG.suggest).toContain("'무선 편광계 · 편광'");
    const co2 = searchPascoCatalog("이산화탄소").map((m) => m.model);
    expect(co2.indexOf("PS-3208"), "판매 중이 앞").toBeLessThan(co2.indexOf("PS-2110"));
    expect(co2).toContain("PS-2110");
  });
});

describe("[C1][S17] 카탈로그 채움 (rules sensor.catalog.fill)", () => {
  const m = PASCO_CATALOG.find((x) => x.model === "PS-3237")!;

  it("[C1][S17] findPascoModel: 정확 일치만 (대소문자 · 하이픈 · 공백 무시) · 없음 · 빈 값 = null", () => {
    expect(findPascoModel("PS-3237")).toBe(m);
    for (const q of ["ps3237", "PS 3237", " ps-3237 ", "Ps-3237"]) expect(findPascoModel(q)?.model, q).toBe("PS-3237");
    for (const q of ["PS-323", "PS-32377", "PS-9999", "편광", "", "   ", null, undefined]) expect(findPascoModel(q), String(q)).toBeNull();
    for (const x of PASCO_CATALOG) expect(findPascoModel(x.model), x.model).toBe(x);
  });

  it("[C1][S17] catalogFill: 모델명 = 모델번호 · 종류 = 카탈로그 종류 · 이름은 빈 칸(공백뿐 포함)일 때만 한국어 이름", () => {
    for (const name of ["", "   "]) {
      const f = catalogFill(m, { name });
      expect(f, `이름 '${name}'`).toMatchObject({ model: "PS-3237", type: "편광", name: m.nameKo });
      expect([...f.filled].sort()).toEqual(["name", "type"]);
    }
    const kept = catalogFill(m, { name: "3반 편광계" });
    expect(kept).toMatchObject({ model: "PS-3237", type: "편광", name: "3반 편광계" });
    expect(kept.filled).toEqual(["type"]);
  });

  it("[C1][S17] catalog-fill-note 문구: 채운 칸만 이름 — 종류·이름 = rules 문구 '카탈로그에서 종류·이름을 채웠어요' · 종류만 = 이름 빠짐 · 없음 = 빈 글자", () => {
    expect(catalogFillNote(["type", "name"])).toBe(FILL_NOTE);
    expect(catalogFillNote(["name", "type"])).toBe(FILL_NOTE);
    const typeOnly = catalogFillNote(["type"]);
    expect(typeOnly).toContain("종류");
    expect(typeOnly).not.toContain("이름");
    expect(typeOnly.startsWith("카탈로그에서")).toBe(true);
    expect(catalogFillNote([])).toBe("");
    expect(catalogFillNote(catalogFill(m, { name: "" }).filled)).toBe(FILL_NOTE);
    expect(catalogFillNote(catalogFill(m, { name: "있음" }).filled)).toBe(typeOnly);
  });
});
