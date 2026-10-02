// 화면 14 가입 API (/api/auth/signup) 입력 검증 — 거부 경로만 본다.
// - 실제 auth 사용자가 만들어지는 성공 경로는 테스트하지 않는다.
// - 거부 응답에는 세션 쿠키(sb-*-auth-token)가 붙지 않아야 한다.
// - 클라이언트가 보낸 학교명·시/도·지역·역할·school_id 는 학교를 정하는 데 쓰이지 않는다 (neisCode 만).
// - 프로필·역할을 정하는 DB 함수 register_profile 은 anon·로그인 사용자가 직접 부를 수 없다 (service role 전용).
import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";
import { PASSWORD_MIN, DISPLAY_NAME_MAX } from "../../lib/auth/signup-rules";
import { anonClient } from "./db-helpers";
import { openAs } from "./auth-state";
import { browserClient, rules, seedRows } from "./screen-helpers";
import { SCREEN, SIGNUP_API } from "./screen-14-helpers";

// 형식은 모두 맞고 neisCode 만 NEIS 에 없는 가짜인 기본 본문 (기본 본문 자체도 서버가 거부해야 한다)
const FAKE_NEIS = "E2E0000000";
const PASSWORD = `e2e-Reject-${"9".repeat(PASSWORD_MIN)}`;
const base = () => ({
  neisCode: FAKE_NEIS,
  displayName: "e2e 거부",
  email: `e2e-signup-reject-${Date.now()}@example.com`,
  password: PASSWORD,
  passwordConfirm: PASSWORD,
  agreeTerms: true,
  agreePrivacy: true,
});

type Body = { ok?: boolean; error?: string; needsEmailConfirm?: boolean; role?: string };

async function post(request: APIRequestContext, data: unknown): Promise<{ res: APIResponse; body: Body }> {
  const res = await request.post(SIGNUP_API, { data, failOnStatusCode: false, maxRedirects: 0 });
  const body = (await res.json().catch(() => ({}))) as Body;
  return { res, body };
}

function expectNoSession(res: APIResponse, what: string) {
  const cookies = res
    .headersArray()
    .filter((h) => h.name.toLowerCase() === "set-cookie")
    .map((h) => h.value.split("=")[0]);
  expect(cookies.filter((n) => /^sb-.*-auth-token/.test(n)), `${what}: 세션 쿠키`).toEqual([]);
}

async function expect400(request: APIRequestContext, data: unknown, what: string): Promise<Body> {
  const { res, body } = await post(request, data);
  expect(res.status(), `${what}: HTTP`).toBe(400);
  expect(body.ok, `${what}: ok`).toBe(false);
  expect(typeof body.error === "string" && body.error.length > 0, `${what}: 오류 문구`).toBe(true);
  expectNoSession(res, what);
  return body;
}

/** 가입 거부 (상태 코드는 4xx/5xx 어느 것이든, 성공 본문·세션 없음) */
async function expectRejected(request: APIRequestContext, data: unknown, what: string): Promise<void> {
  const { res, body } = await post(request, data);
  expect(res.ok(), `${what}: 2xx 아님 (HTTP ${res.status()})`).toBe(false);
  expect(res.status(), `${what}: HTTP`).toBeGreaterThanOrEqual(400);
  expect(body.ok, `${what}: ok`).not.toBe(true);
  expect(body.role, `${what}: 역할 응답`).toBeUndefined();
  expectNoSession(res, what);
}

// ---------- C1: 입력 형식 검증 (400) ----------
test(`[C1][S${SCREEN}] 가입 API: JSON 아닌 본문 400`, async ({ request }) => {
  const res = await request.post(SIGNUP_API, {
    data: "not json",
    headers: { "Content-Type": "application/json" },
    failOnStatusCode: false,
  });
  expect(res.status()).toBe(400);
  expect(((await res.json()) as Body).ok).toBe(false);
  expectNoSession(res, "JSON 아님");
});

test(`[C1][S${SCREEN}] 가입 API: 이메일 형식 오류 400`, async ({ request }) => {
  for (const email of ["", "not-an-email", "a@b", "a b@example.com", "@example.com"]) {
    await expect400(request, { ...base(), email }, `이메일 '${email}'`);
  }
});

test(`[C1][S${SCREEN}] 가입 API: 비밀번호 ${PASSWORD_MIN}자 미만·확인 불일치 400`, async ({ request }) => {
  const short = "a".repeat(PASSWORD_MIN - 1);
  await expect400(request, { ...base(), password: short, passwordConfirm: short }, `비밀번호 ${PASSWORD_MIN - 1}자`);
  await expect400(request, { ...base(), password: "", passwordConfirm: "" }, "비밀번호 빈 값");
  await expect400(request, { ...base(), passwordConfirm: PASSWORD + "x" }, "비밀번호 확인 불일치");
});

test(`[C1][S${SCREEN}] 가입 API: 이름 빈 값·${DISPLAY_NAME_MAX}자 초과 · 필수 약관 미동의 400`, async ({ request }) => {
  await expect400(request, { ...base(), displayName: "   " }, "이름 공백");
  await expect400(request, { ...base(), displayName: "가".repeat(DISPLAY_NAME_MAX + 1) }, "이름 길이 초과");
  await expect400(request, { ...base(), agreeTerms: false }, "이용약관 미동의");
  await expect400(request, { ...base(), agreePrivacy: false }, "개인정보 미동의");
  await expect400(request, { ...base(), agreeTerms: "true", agreePrivacy: "true" }, "동의 값이 문자열");
});

// ---------- N1-d: 학교는 neisCode 로만 ----------
test(`[N1-d][S${SCREEN}] 가입 API: neisCode 누락·빈 값 400`, async ({ request }) => {
  const { neisCode: _drop, ...noCode } = base();
  void _drop;
  await expect400(request, noCode, "neisCode 누락");
  await expect400(request, { ...base(), neisCode: "   " }, "neisCode 공백");
  await expect400(request, { ...base(), neisCode: 7010000 }, "neisCode 숫자형");
});

test(`[N1-d][S${SCREEN}] 가입 API: 학교명·시/도·지역·school_id·역할을 보내도 neisCode 없이는 400 (같은 오류)`, async ({ request }) => {
  const schools = seedRows("schools");
  expect(schools.length, "seed 학교").toBeGreaterThan(0);
  const s = schools[0];
  const { neisCode: _drop, ...noCode } = base();
  void _drop;
  const plain = await expect400(request, noCode, "neisCode 없음");
  const withClientSchool = await expect400(
    request,
    {
      ...noCode,
      schoolName: s.name,
      school_name: s.name,
      school: s.name,
      schoolId: s.id,
      school_id: s.id,
      sido: s.sido ?? rules.neis.default_sido,
      region: s.region ?? rules.neis.default_region,
      officeCode: s.office_code,
      role: "admin",
    },
    "neisCode 없음 + 클라이언트 학교·역할",
  );
  expect(withClientSchool.error, "클라이언트 학교·역할 값이 검증 결과를 바꾸지 않음").toBe(plain.error);
});

test(`[N1-d][S${SCREEN}] 가입 API: NEIS 에 없는 가짜·잘못된 neisCode 는 (학교명·역할을 함께 보내도) 가입 거부`, async ({ request }) => {
  const s = seedRows("schools")[0];
  await expectRejected(request, base(), `가짜 neisCode ${FAKE_NEIS}`);
  await expectRejected(request, { ...base(), neisCode: "../sido" }, "경로 문자 neisCode");
  await expectRejected(request, { ...base(), neisCode: "' or 1=1 --" }, "SQL 문자 neisCode");
  await expectRejected(
    request,
    { ...base(), schoolName: s.name, school_id: s.id, role: "admin" },
    "가짜 neisCode + 클라이언트 학교명·school_id·역할",
  );
  // DB 에 이미 있는 학교(seed)의 neis_code 라도 NEIS 에 없는 코드면 그 학교로 가입할 수 없다
  for (const row of seedRows("schools")) {
    await expectRejected(request, { ...base(), neisCode: row.neis_code }, `seed 학교 코드 ${row.neis_code}`);
  }
});

// ---------- R-db: 역할·학교를 정하는 DB 함수는 클라이언트가 직접 못 부른다 ----------
const RPC_ARGS = {
  p_user_id: "00000000-0000-4000-8000-000000000000",
  p_neis_code: FAKE_NEIS,
  p_office_code: "E2E",
  p_school_name: "e2e가짜고등학교",
  p_sido: "e2e",
  p_region: "e2e",
  p_display_name: "e2e",
};

test(`[R-db][S${SCREEN}] anon 은 register_profile(학교 upsert·역할 결정) 호출 거부`, async () => {
  const { data, error } = await anonClient().rpc("register_profile", RPC_ARGS);
  expect(data, "결과 행").toBeNull();
  expect(error?.code, `권한 거부 (${error?.message})`).toBe("42501");
});

test(`[R-db][S${SCREEN}] 로그인한 학생이 자기 user_id 로 register_profile(역할 admin 가능) 호출 거부`, async ({ browser }, info) => {
  test.setTimeout(120_000);
  const { context, page } = await openAs(browser, info, "student", 13);
  try {
    const { client, userId } = await browserClient(page);
    const { data, error } = await client.rpc("register_profile", { ...RPC_ARGS, p_user_id: userId });
    expect(data, "결과 행").toBeNull();
    expect(error?.code, `권한 거부 (${error?.message})`).toBe("42501");
  } finally {
    await context.close();
  }
});
