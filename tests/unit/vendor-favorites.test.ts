// 화면 6 판매처 연결 즐겨찾기 순수 규칙 (lib/vendor-rules: favoritesFirst · countFavorites · visibleVendors).
// 기대값: harness/d7-data.md §12-1 "화면 6 판매처 연결" —
//   즐겨찾기가 1곳 이상이면 목록에는 즐겨찾기만, "모든 판매처 보기"로 전체를 펼친다(펼친 뒤에는 즐겨찾기가 맨 위).
//   즐겨찾기가 없으면 처음부터 전체(지금 순서 = §11 우리 학교 먼저, 그다음 공통).
// 판매처 이름은 d7 §12·§12-1 공통 seed 에서 읽는다 (구현에서 읽지 않는다).
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { countFavorites, favoritesFirst, orderVendorsForLink, visibleVendors } from "../../lib/vendor-rules";
import { ROOT, read } from "./helpers";

const D7 = read(join(ROOT, "harness/d7-data.md"));
const lineOf = (head: string): string => {
  const l = D7.split(/\r?\n/).find((x) => x.startsWith(head));
  if (!l) throw new Error(`d7-data.md 에서 '${head}' 행을 찾지 못함`);
  return l;
};
const seed12 = (() => {
  const line = lineOf("| 공통 목록 |");
  const tail = line.slice(line.indexOf("처음 seed"));
  return [...tail.slice(tail.indexOf("):") + 2).matchAll(/([^\s,()|]+)\((https?:\/\/[^)\s]+)\)/g)].map((m) => m[1]);
})();
const seed121 = [...lineOf("| 공통 목록 추가 seed |").matchAll(/([^\s,()|:`]+)\((https?:\/\/[^,\s)]+)/g)].map((m) => m[1]);
const TOTAL = Number(/공통 목록은 모두 (\d+)곳/.exec(lineOf("| 공통 목록 추가 seed |"))?.[1]);
const COMMON = [...seed12, ...seed121.filter((n) => !seed12.includes(n))];

type V = { id: string; name: string; schoolId: string | null; favorite?: boolean };
const school: V[] = ["우리 판매처 가", "우리 판매처 나"].map((name, i) => ({ id: `s-${i}`, name, schoolId: "school-a" }));
const common: V[] = COMMON.map((name, i) => ({ id: `c-${i}`, name, schoolId: null }));
/** §11 순서 (우리 학교 먼저, 그다음 공통) */
const base = orderVendorsForLink([...common, ...school]);
const ids = (list: { id: string }[]) => list.map((v) => v.id);
const withFav = (list: V[], favIds: string[]): V[] => list.map((v) => ({ ...v, favorite: favIds.includes(v.id) }));

describe("vendor favorites: 전제 (d7 §12·§12-1 공통 seed)", () => {
  it("[K1][S6] 공통 seed 수 = d7 §12-1 '공통 목록은 모두 N곳'", () => {
    expect(TOTAL).toBeGreaterThan(0);
    expect(COMMON).toHaveLength(TOTAL);
  });
});

describe("vendor favorites: countFavorites", () => {
  it("[K1][S6] favorite === true 인 판매처만 센다 (false·없음은 0)", () => {
    expect(countFavorites([])).toBe(0);
    expect(countFavorites(base)).toBe(0);
    expect(countFavorites(withFav(base, []))).toBe(0);
    expect(countFavorites(withFav(base, [common[0].id]))).toBe(1);
    expect(countFavorites(withFav(base, [school[1].id, common[3].id, common[COMMON.length - 1].id]))).toBe(3);
    expect(countFavorites(withFav(base, ids(base)))).toBe(base.length);
  });

  it("[K1][S6] true 가 아닌 값(문자열·1)은 즐겨찾기가 아니다", () => {
    const odd = [{ favorite: "true" }, { favorite: 1 }, { favorite: null }] as unknown as { favorite?: boolean }[];
    expect(countFavorites(odd)).toBe(0);
  });
});

describe("vendor favorites: favoritesFirst (펼친 뒤 즐겨찾기 맨 위)", () => {
  it("[K1][S6] 즐겨찾기가 맨 위, 각 묶음 안은 넘겨받은 순서 그대로 · 수·원소 그대로", () => {
    const favIds = [common[COMMON.length - 1].id, school[1].id, common[2].id];
    const input = withFav(base, favIds);
    const out = favoritesFirst(input);
    const wantFav = ids(input).filter((id) => favIds.includes(id));
    const wantRest = ids(input).filter((id) => !favIds.includes(id));
    expect(ids(out)).toEqual([...wantFav, ...wantRest]);
    expect(out).toHaveLength(input.length);
    expect(out.slice(0, favIds.length).every((v) => v.favorite === true)).toBe(true);
    expect(out.slice(favIds.length).every((v) => v.favorite !== true)).toBe(true);
  });

  it("[K1][S6] 즐겨찾기 0개·전부·빈 목록 → 순서 그대로", () => {
    expect(ids(favoritesFirst(base))).toEqual(ids(base));
    expect(ids(favoritesFirst(withFav(base, ids(base))))).toEqual(ids(base));
    expect(favoritesFirst([])).toEqual([]);
  });

  it("[K1][S6] 원본 배열을 바꾸지 않는다", () => {
    const input = withFav(base, [common[1].id]);
    const copy = input.map((v) => ({ ...v }));
    favoritesFirst(input);
    expect(input).toEqual(copy);
  });
});

describe("vendor favorites: visibleVendors (화면 6 모달에 보일 판매처)", () => {
  it("[K1][S6] 즐겨찾기 0개 → 펼침 여부와 상관없이 전체, 지금 순서(§11) 그대로", () => {
    for (const showAll of [false, true]) {
      expect(ids(visibleVendors(base, showAll))).toEqual(ids(base));
      expect(ids(visibleVendors(withFav(base, []), showAll))).toEqual(ids(base));
    }
    expect(visibleVendors([], false)).toEqual([]);
    expect(visibleVendors([], true)).toEqual([]);
  });

  it("[K1][S6] 즐겨찾기 ≥1 · 펼치지 않음 → 즐겨찾기만 (넘겨받은 순서)", () => {
    const favIds = [common[4].id, school[0].id];
    const input = withFav(base, favIds);
    const out = visibleVendors(input, false);
    expect(ids(out)).toEqual(ids(input).filter((id) => favIds.includes(id)));
    expect(out.every((v) => v.favorite === true)).toBe(true);
    // 공통 판매처 하나만 즐겨찾기 → 그 하나만
    expect(ids(visibleVendors(withFav(base, [common[0].id]), false))).toEqual([common[0].id]);
  });

  it("[K1][S6] 즐겨찾기 ≥1 · 펼침 → 전체 · 즐겨찾기 먼저 + 나머지는 지금 순서", () => {
    const favIds = [common[COMMON.length - 1].id, common[1].id];
    const input = withFav(base, favIds);
    const out = visibleVendors(input, true);
    expect(out).toHaveLength(input.length);
    expect(ids(out)).toEqual([...ids(input).filter((id) => favIds.includes(id)), ...ids(input).filter((id) => !favIds.includes(id))]);
  });

  it("[K1][S6] 모두 즐겨찾기 → 펼치지 않아도 전체", () => {
    const all = withFav(base, ids(base));
    expect(ids(visibleVendors(all, false))).toEqual(ids(base));
    expect(ids(visibleVendors(all, true))).toEqual(ids(base));
  });

  it("[K1][S6] 원본 배열을 바꾸지 않는다", () => {
    const input = withFav(base, [school[1].id]);
    const copy = input.map((v) => ({ ...v }));
    visibleVendors(input, false);
    visibleVendors(input, true);
    expect(input).toEqual(copy);
  });
});
