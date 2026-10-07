// [N2][S*] · [R-ui][S*] · [N2-bundle][S*] — GET /api/msds/search (harness/d7-data.md §20 서버 API).
// 실제 안전보건공단(KOSHA) 은 부르지 않는다: 이 환경에는 KOSHA_MSDS_API_KEY 가 없어 검사 순서의 끝이 503(키 없음)이다.
// d7 §20: 로그인 + 교사·admin + 자기 학교(데모·학생·anon 거부, 401/403) → q 1~60자(400) → 키 없음 503 "MSDS 찾기를 쓸 수 없어요(서버 설정)".
//         응답에 키·외부 요청 주소 노출 금지 (N2).
// 공용 계정(학교 A 학생·교사·admin, 학교 B 교사)은 읽기 전용 요청만 한다 — 데이터 변경 없음.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type APIResponse } from "@playwright/test";
import { ROLE_LABEL, type Role } from "./db-helpers";
import { openAs } from "./auth-state";
import { anonContext } from "./screen-8-helpers";
import { rules } from "./screen-helpers";

const API = "/api/msds/search";
const D7 = readFileSync(join(process.cwd(), "harness", "d7-data.md"), "utf8");
const S20 = D7.slice(D7.indexOf("## 20."), D7.indexOf("\n## ", D7.indexOf("## 20.") + 5));
const Q_MAX = Number((/q 1~(\d+)자/.exec(S20) ?? [])[1]);
const NO_KEY_TEXT = (/키 없음 503 "([^"]+)"/.exec(S20) ?? [])[1] ?? "";
/** d7 §20 외부 API 주소의 호스트·경로 조각 — 응답·번들에 나오면 안 된다 */
const EXTERNAL = (/`(https:\/\/[^`]+)`/.exec(S20) ?? [])[1] ?? "";
const EXTERNAL_HOST = EXTERNAL ? new URL(EXTERNAL).hostname : "";
const EXTERNAL_PATH = EXTERNAL ? new URL(EXTERNAL).pathname.split("/").filter(Boolean) : [];
const KEY_NAME = "KOSHA_MSDS_API_KEY";
const N2 = (rules as unknown as { never: { N2: { banned_terms: string[]; key_value_pattern: string } } }).never.N2;
const KEY_LIKE = new RegExp(N2.key_value_pattern);

const q = (v: string | null) => (v === null ? API : `${API}?q=${encodeURIComponent(v)}`);

async function expectSafeBody(res: APIResponse, what: string): Promise<Record<string, unknown>> {
  const text = await res.text();
  for (const s of [EXTERNAL_HOST, ...EXTERNAL_PATH, KEY_NAME, "serviceKey", "data.go.kr"]) expect(text, `${what}: 응답에 "${s}" 없음`).not.toContain(s);
  expect(N2.banned_terms.filter((t) => text.toLowerCase().includes(t.toLowerCase())), `${what}: N2 금지어 0`).toEqual([]);
  expect(KEY_LIKE.test(text), `${what}: 키 꼴(32자리 16진수) 없음`).toBe(false);
  const key = process.env[KEY_NAME];
  if (key) expect(text).not.toContain(key);
  expect(res.headers()["cache-control"] ?? "", `${what}: no-store`).toContain("no-store");
  return JSON.parse(text) as Record<string, unknown>;
}

test("[N2][S*] 전제: d7 §20 에서 검색어 한도 · 키 없음 문구 · 외부 주소를 읽었다", () => {
  expect(Q_MAX).toBeGreaterThan(1);
  expect(NO_KEY_TEXT).toContain("MSDS");
  expect(EXTERNAL_HOST).toMatch(/\./);
});

test(`[N2][S*] anon ${API}: 검색어와 상관없이 401 (signed-out) · 키·외부 주소 없음`, async ({ browser }, info) => {
  const ctx = await anonContext(browser, info);
  try {
    for (const v of [null, "", "질산 은", "가".repeat(Q_MAX + 1)]) {
      const res = await ctx.request.get(q(v), { maxRedirects: 0 });
      expect(res.status(), `anon q=${JSON.stringify(v)} → 401`).toBe(401);
      const body = await expectSafeBody(res, `anon ${v}`);
      expect(body.code).toBe("signed-out");
      expect(body.candidates, "후보 없음").toBeUndefined();
    }
  } finally {
    await ctx.close();
  }
});

test(`[N2][R-ui][S*] ${ROLE_LABEL.student} ${API}: 검색어와 상관없이 403 (forbidden — 입력 검사·키 검사보다 먼저) · 키·외부 주소 없음`, async ({ browser }, info) => {
  const { context } = await openAs(browser, info, "student", 2);
  try {
    for (const v of [null, "", "질산 은", "7761-88-8", "가".repeat(Q_MAX + 1)]) {
      const res = await context.request.get(q(v));
      expect(res.status(), `학생 q=${JSON.stringify(v)} → 403`).toBe(403);
      const body = await expectSafeBody(res, `학생 ${v}`);
      expect(body.code).toBe("forbidden");
    }
  } finally {
    await context.close();
  }
});

for (const role of ["teacher", "admin", "schoolB"] as Role[]) {
  test(`[N2][S*] ${ROLE_LABEL[role]} ${API}: q 없음·빈 값·공백·${Q_MAX + 1}자·제어 문자 → 400 (bad-request) · 1~${Q_MAX}자 → 키 없음 503 (no-key, "${NO_KEY_TEXT}") · 키·외부 주소 없음`, async ({ browser }, info) => {
    test.skip(Boolean(process.env[KEY_NAME]?.trim()), `${KEY_NAME} 가 있는 환경 — 실제 KOSHA 호출이 되므로 이 순서 검사(키 없음 503)는 키 없는 환경에서만`);
    const { context } = await openAs(browser, info, role, 2);
    try {
      for (const v of [null, "", "   ", "가".repeat(Q_MAX + 1), "질산\u0001은"]) {
        const res = await context.request.get(q(v));
        expect(res.status(), `q=${JSON.stringify(v)} → 400`).toBe(400);
        const body = await expectSafeBody(res, `400 ${JSON.stringify(v)}`);
        expect(body.code).toBe("bad-request");
      }
      for (const v of ["질산 은", "7761-88-8", "가".repeat(Q_MAX), "  a  "]) {
        const res = await context.request.get(q(v));
        expect(res.status(), `q=${JSON.stringify(v)} → 503 (키 없음)`).toBe(503);
        const body = await expectSafeBody(res, `503 ${JSON.stringify(v)}`);
        expect(body).toEqual({ error: NO_KEY_TEXT, code: "no-key" });
      }
    } finally {
      await context.close();
    }
  });
}

/** .next/static 아래 모든 파일 */
function staticFiles(dir: string): string[] {
  const out: string[] = [];
  const visit = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) visit(p);
      else out.push(p);
    }
  };
  visit(dir);
  return out;
}

test(`[N2-bundle][S*] 클라이언트 번들(.next/static)에 ${KEY_NAME} · 외부 MSDS API 주소(${EXTERNAL_HOST}/${EXTERNAL_PATH.join("/")}) 없음 · 화면 쪽은 ${API} 만 부른다`, () => {
  const dir = join(process.cwd(), ".next", "static");
  expect(existsSync(dir), "npm run build 뒤에 실행 (.next/static)").toBe(true);
  const files = staticFiles(dir).filter((p) => /\.(js|css|html|json|txt)$/.test(p));
  expect(files.length).toBeGreaterThan(0);
  const hits: string[] = [];
  let usesApi = false;
  for (const p of files) {
    const text = readFileSync(p, "utf8");
    for (const s of [KEY_NAME, EXTERNAL_HOST, EXTERNAL_PATH[0], "getChemList001"]) if (s && text.includes(s)) hits.push(`${p.slice(dir.length)}: ${s}`);
    if (text.includes(API)) usesApi = true;
  }
  expect(hits).toEqual([]);
  expect(usesApi, `양성 대조: 번들에 ${API} 호출이 있다`).toBe(true);
});
