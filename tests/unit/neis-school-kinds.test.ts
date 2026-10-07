// 초·중·고 학교급 서버 규칙 (harness/d7-data.md §3·§19, design/rules.json 1.18 neis.school_kinds).
// 실제 NEIS 는 부르지 않는다 — fetch 를 가짜로 바꿔 SCHUL_KND_SC_NM 별 가짜 학교를 돌려준다.
// - 학교급 값 = rules.json neis.school_kinds (순서 포함)
// - 학교 목록은 고른 학교급만, 시/도·지역 목록은 세 학교급 전체
// - 가입 검증(verifyNeisSchool)은 세 학교급 학교 코드를 모두 받고, 그 밖(특수학교 등)·재외한국학교는 거부
// - 캐시 키 = 학교급 (같은 학교급을 다시 불러도 NEIS 요청이 늘지 않음)
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rules } from "./helpers";

vi.mock("server-only", () => ({}));
// lib/server/neis.ts 의 "@/lib/school-kinds" 별칭을 실제 파일로 잇는다 (vitest 설정에 별칭이 없다)
vi.mock("@/lib/school-kinds", async () => await import("../../lib/school-kinds"));

const KINDS: string[] = rules.neis.school_kinds;
const EXCLUDED: string[] = rules.neis.exclude_sido;

type Row = { ATPT_OFCDC_SC_CODE: string; SD_SCHUL_CODE: string; SCHUL_NM: string; LCTN_SC_NM: string; ORG_RDNMA: string };

// 학교급마다 가짜 학교: 같은 시/도·지역에 하나씩 + 학교급마다 다른 지역 하나 + 재외한국학교 하나
const SIDO = "가짜도";
const REGION = "가짜시";
const KIND_ONLY_REGION = (i: number) => `가짜${i}군`;
const codeOf = (i: number, n: number) => `T${i}${String(n).padStart(6, "0")}`;
function rowsOf(kind: string): Row[] {
  const i = KINDS.indexOf(kind);
  if (i < 0) return [];
  return [
    { ATPT_OFCDC_SC_CODE: "X10", SD_SCHUL_CODE: codeOf(i, 1), SCHUL_NM: `가나${kind}`, LCTN_SC_NM: SIDO, ORG_RDNMA: `${SIDO} ${REGION} 가나로 1` },
    { ATPT_OFCDC_SC_CODE: "X10", SD_SCHUL_CODE: codeOf(i, 2), SCHUL_NM: `다라${kind}`, LCTN_SC_NM: SIDO, ORG_RDNMA: `${SIDO} ${KIND_ONLY_REGION(i)} 다라로 2` },
    { ATPT_OFCDC_SC_CODE: "X99", SD_SCHUL_CODE: codeOf(i, 9), SCHUL_NM: `재외${kind}`, LCTN_SC_NM: EXCLUDED[0], ORG_RDNMA: "" },
  ];
}
// 특수학교(3종 밖) 코드 — NEIS 에 있어도 학교급 조회 대상이 아니라 가입할 수 없다
const SPECIAL_CODE = "T9000001";

const calls: string[] = [];

beforeEach(() => {
  calls.length = 0;
  vi.resetModules();
  vi.stubEnv("NEIS_API_KEY", "unit-test-dummy");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const u = new URL(String(input));
      const kind = u.searchParams.get("SCHUL_KND_SC_NM") ?? "";
      calls.push(kind);
      const rows =
        kind === "특수학교"
          ? [{ ATPT_OFCDC_SC_CODE: "X10", SD_SCHUL_CODE: SPECIAL_CODE, SCHUL_NM: "가짜특수학교", LCTN_SC_NM: SIDO, ORG_RDNMA: `${SIDO} ${REGION} 1` }]
          : rowsOf(kind);
      const body = rows.length
        ? { schoolInfo: [{ head: [{ list_total_count: rows.length }] }, { row: rows }] }
        : { RESULT: { CODE: "INFO-200", MESSAGE: "해당하는 데이터가 없습니다." } };
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const load = async () => {
  const neis = await import("../../lib/server/neis");
  const schools = await import("../../lib/server/schools");
  const kinds = await import("../../lib/school-kinds");
  return { ...neis, ...schools, ...kinds };
};

describe("[N1-d][S14] 학교급 값 = rules.json neis.school_kinds", () => {
  it("SCHOOL_KINDS 가 rules.json neis.school_kinds 와 같은 순서·값", async () => {
    const { SCHOOL_KINDS } = await load();
    expect([...SCHOOL_KINDS]).toEqual(KINDS);
  });

  it("isSchoolKind: 3종만 참, 그 밖·빈 값·대소문자 변형·공백 붙은 값은 거짓", async () => {
    const { isSchoolKind } = await load();
    for (const k of KINDS) expect(isSchoolKind(k), k).toBe(true);
    for (const bad of ["", "특수학교", "각종학교", "고등", `${KINDS[0]} `, null, undefined, 1]) {
      expect(isSchoolKind(bad), String(bad)).toBe(false);
    }
  });

  it("학교 0개 안내 문구는 학교급 이름을 넣는다 (시안 14-no-school: '이 지역에 {학교급}가 없어요 — …')", async () => {
    const { noSchoolText } = await load();
    for (const k of KINDS) {
      const t = noSchoolText(k as never);
      expect(t).toContain(k);
      expect(t).toContain("지역을 다시 골라 주세요");
    }
  });
});

describe("[N1-d][S14] NEIS 조회는 학교급별 (d7 §19)", () => {
  it("listSchools(sido, region, kind) 는 그 학교급 학교만, NEIS 요청 SCHUL_KND_SC_NM = kind", async () => {
    const { listSchools } = await load();
    for (const k of KINDS) {
      const list = await listSchools(SIDO, REGION, k as never);
      expect(list.map((s) => s.name), k).toEqual([`가나${k}`]);
      expect(list.every((s) => s.kind === k), `${k} kind 필드`).toBe(true);
    }
    expect(new Set(calls), "요청한 학교급").toEqual(new Set(KINDS));
  });

  it("listSido·listRegions 는 세 학교급 전체에서 (학교급마다 다른 지역이 모두 나온다), 재외한국학교 제외", async () => {
    const { listSido, listRegions } = await load();
    const sido = await listSido();
    expect(sido).toEqual([SIDO]);
    for (const ex of EXCLUDED) expect(sido).not.toContain(ex);
    const regions = await listRegions(SIDO);
    expect(new Set(regions)).toEqual(new Set([REGION, ...KINDS.map((_, i) => KIND_ONLY_REGION(i))]));
    expect(new Set(calls), "세 학교급 모두 조회").toEqual(new Set(KINDS));
  });

  it("캐시 키 = 학교급: 같은 학교급 재조회는 NEIS 요청을 늘리지 않고, 다른 학교급은 따로 부른다", async () => {
    const { listSchools } = await load();
    await listSchools(SIDO, REGION, KINDS[2] as never);
    const after1 = calls.length;
    expect(calls).toEqual([KINDS[2]]);
    await listSchools(SIDO, KIND_ONLY_REGION(2), KINDS[2] as never);
    expect(calls.length, "같은 학교급 두 번째 조회").toBe(after1);
    await listSchools(SIDO, REGION, KINDS[0] as never);
    expect(calls, "다른 학교급은 새로 조회").toEqual([KINDS[2], KINDS[0]]);
  });
});

describe("[N1-d][S14] 가입 검증 verifyNeisSchool 은 세 학교급 학교 코드를 모두 받는다", () => {
  for (const [i, k] of KINDS.entries()) {
    it(`${k} 코드 → 그 학교 (kind = ${k})`, async () => {
      const { verifyNeisSchool } = await load();
      const s = await verifyNeisSchool(codeOf(i, 1));
      expect(s.neis_code).toBe(codeOf(i, 1));
      expect(s.name).toBe(`가나${k}`);
      expect(s.kind).toBe(k);
      expect(s.sido).toBe(SIDO);
      expect(s.region).toBe(REGION);
    });
  }

  it("3종 밖(특수학교) 코드·재외한국학교 코드·없는 코드는 404 로 거부", async () => {
    const { verifyNeisSchool, NeisError } = await load();
    for (const code of [SPECIAL_CODE, codeOf(0, 9), codeOf(2, 9), "T0999999"]) {
      const err = await verifyNeisSchool(code).then(
        () => null,
        (e: unknown) => e,
      );
      expect(err, code).toBeInstanceOf(NeisError);
      expect((err as InstanceType<typeof NeisError>).status, code).toBe(404);
    }
    expect(calls, "특수학교는 조회하지 않는다").not.toContain("특수학교");
  });
});
