// [R-db][S8] · [N1-db][S8] · [R-db][S14] · [GM-db][S*] 사용자 관리 (화면 8) + 가입의 초대 역할 반영 — DB 권한.
// 실제 RLS·함수 (publishable/anon 키 + 각 계정 로그인)로 판정한다.
// 기준: harness/d7-data.md §2·§4·§5·§8, harness/d5-gates.md R-db·N1-db·GM-db.
//
// 절대 규칙: 공용 테스트 계정 4개(학교A 학생·교사·admin, 학교B 교사)의 프로필·역할을 바꾸지 않는다.
// - 공용 계정에는 "거부되어야 하는 호출"과 읽기만 한다. 거부 호출은 가능한 한 먼저 "성공해도 아무것도 안 바뀌는" 호출
//   (없는 사용자 id·같은 역할)로 확인한 뒤에 실제 대상을 겨눈다.
// - 혹시 구현 결함으로 공용 계정의 역할이 바뀌면(테스트는 실패) admin 계정의 change_member_role 로 되돌린다 (비상 복구).
// - 성공 경로(역할 변경·내보내기·초대·초대 수락)는 일회용 계정 + 일회용 학교(neis_code `S8-TEST-…`)에서만 한다.
//   학교 A 에 두 번째 admin 이나 임시 멤버·대기 초대를 만들면 "마지막 admin" 거부 테스트와 화면 8 e2e(멤버 수·초대 목록)가
//   병렬 실행에서 경쟁하므로 학교 A·B 에는 성공하는 쓰기를 하지 않는다.
// - 일회용 계정·학교를 만들려면 service role 이 필요하다 (auth admin createUser + register_profile).
//   SUPABASE_SERVICE_ROLE_KEY 가 없으면 성공 경로는 skip 한다. service role 은 준비·정리·대조 조회에만 쓰고
//   판정 대상 호출(권한 검사)은 항상 로그인 세션(publishable 키)으로 한다.
// - 일회용 계정은 사용 기록(usage_logs)을 만들지 않는다 (계정 삭제가 FK 로 막히지 않게).
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type TestInfo } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ROLE_LABEL, anonClient, signIn, type Role, type Session } from "./db-helpers";

test.describe.configure({ mode: "default" });

/** d7 §8: 멤버 역할 3종, 초대 역할에는 admin 이 없다 */
const MEMBER_ROLES = ["student", "teacher", "admin"] as const;
const INVITE_ROLES = ["student", "teacher"] as const;
/** d7 §8 "한 번에 여러 명 초대" 한도 (마이그레이션 머리말: too many emails = 50 초과) */
const INVITE_MAX = 50;

/** 공용 계정의 기대 역할 (seed-test-users.mjs) — 비상 복구·불변 확인용 */
const SHARED_ROLE: Record<Role, string> = { student: "student", teacher: "teacher", admin: "admin", schoolB: "teacher" };

const EMAIL_PREFIX = "s8-test-";
const SCHOOL_PREFIX = "S8-TEST-";
const PROFILE_COLS = "user_id, school_id, role, display_name";

/** 데모 학교 고정 id — lib/supabase/demo-data.ts (server-only 모듈이라 소스 텍스트에서 읽는다) */
const DEMO_SCHOOL_ID = (() => {
  const src = readFileSync(join(process.cwd(), "lib", "supabase", "demo-data.ts"), "utf8");
  const m = src.match(/export const DEMO_SCHOOL_ID\s*=\s*"([0-9a-f-]{36})"/);
  if (!m) throw new Error("lib/supabase/demo-data.ts 에서 DEMO_SCHOOL_ID 를 찾지 못했습니다");
  return m[1];
})();

const HAS_SERVICE = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
const NO_SERVICE_REASON =
  "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정·학교를 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)";

type Row = Record<string, unknown>;
type RpcError = { code?: string; message: string; details?: string | null };
type RpcResult = { data: unknown; error: RpcError | null };
type Actor = Role | "anon";

const labelOf = (who: Actor) => (who === "anon" ? "anon" : ROLE_LABEL[who]);

async function clientOf(who: Actor): Promise<{ client: SupabaseClient; session: Session | null }> {
  if (who === "anon") return { client: anonClient(), session: null };
  const session = await signIn(who);
  return { client: session.client, session };
}

function rand(): string {
  return randomBytes(4).toString("hex");
}

/** 이 스펙이 만드는 이메일 (실제 발송 없음: example.test, 초대는 메일을 보내지 않는다) */
function tempEmail(info: TestInfo, tag = ""): string {
  return `${EMAIL_PREFIX}${info.project.name}-${tag}${Date.now()}-${rand()}@example.test`;
}

function firstRow(data: unknown): Row | null {
  if (Array.isArray(data)) return (data[0] as Row | undefined) ?? null;
  return (data as Row | null) ?? null;
}

function rowsOf(data: unknown): Row[] {
  if (Array.isArray(data)) return data as Row[];
  return data ? [data as Row] : [];
}

async function rpc(client: SupabaseClient, fn: string, args: Row): Promise<RpcResult> {
  const res = await client.rpc(fn, args);
  return { data: res.data, error: res.error };
}

const inviteArgs = (emails: unknown, role: unknown): Row => ({ p_emails: emails, p_role: role });
const changeArgs = (userId: unknown, role: unknown): Row => ({ p_user_id: userId, p_role: role });
const removeArgs = (userId: unknown): Row => ({ p_user_id: userId });

/**
 * DB 가 거부했는지: 오류가 있고, PostgREST 의 "함수·인자 못 찾음"(PGRST…)이 아니며, 반환 행이 없다.
 * code·message 를 주면 그 값과 정확히 같아야 한다.
 */
function expectRejected(res: RpcResult, what: string, code?: string, message?: string): void {
  expect(res.error, `${what} 는 오류여야 함`).not.toBeNull();
  expect(String(res.error?.code ?? ""), `${what}: ${res.error?.message}`).not.toMatch(/^PGRST/);
  expect(rowsOf(res.data), `${what} 반환 행`).toHaveLength(0);
  if (code) expect(res.error?.code, `${what} errcode (${res.error?.message})`).toBe(code);
  if (message) expect(res.error?.message, `${what} message`).toBe(message);
}

/** 존재 여부 비노출 비교용: 오류의 겉모습 */
function errorShape(res: RpcResult): Row {
  return { code: res.error?.code ?? null, message: res.error?.message ?? null, details: res.error?.details ?? null };
}

/** 바뀐 행 수: RLS 로 안 보이면 error 없이 0행, 권한이 없으면 오류 — 어느 쪽이든 0 이어야 한다 */
function changed(res: { error: unknown; data: unknown[] | null }): number {
  return res.error ? 0 : (res.data ?? []).length;
}

/** 공용 계정이 자기 세션으로 읽은 자기 프로필 (자기 행 select 는 모든 역할 허용 — d7 §2) */
async function ownProfile(s: Session): Promise<Row | null> {
  const r = await s.client.from("profiles").select(PROFILE_COLS).eq("user_id", s.userId).maybeSingle();
  expect(r.error, `${ROLE_LABEL[s.role]} 자기 프로필 조회: ${r.error?.message}`).toBeNull();
  return (r.data as Row | null) ?? null;
}

/** 공용 계정 프로필이 그대로인지 (행이 있고 학교·역할이 seed 와 같다) */
async function expectSharedUnchanged(s: Session, before?: Row | null): Promise<void> {
  const now = await ownProfile(s);
  expect(now, `${ROLE_LABEL[s.role]} 프로필 행이 있어야 함`).not.toBeNull();
  expect(now?.role, `${ROLE_LABEL[s.role]} 역할`).toBe(SHARED_ROLE[s.role]);
  expect(now?.school_id, `${ROLE_LABEL[s.role]} 학교`).toBe(s.schoolId);
  if (before) expect(now).toEqual(before);
}

/**
 * 비상 복구: 구현 결함으로 학교 A 공용 계정(학생·교사)의 역할이 바뀌었으면 admin 의 change_member_role 로 되돌린다.
 * 정상이라면 아무 호출도 하지 않는다 (역할이 그대로면 쓰기 없음).
 */
async function restoreSharedRole(role: "student" | "teacher"): Promise<void> {
  try {
    const s = await signIn(role);
    const now = await s.client.from("profiles").select("role").eq("user_id", s.userId).maybeSingle();
    if (now.data && now.data.role !== SHARED_ROLE[role]) {
      const admin = await signIn("admin");
      await admin.client.rpc("change_member_role", changeArgs(s.userId, SHARED_ROLE[role]));
    }
  } catch {
    // 복구 실패는 테스트 실패 메시지와 뒤따르는 스펙의 실패로 드러난다
  }
}

/** 학교 A admin 이 보는 초대 중 이메일이 패턴과 맞는 것 */
async function adminInvites(pattern: string): Promise<Row[]> {
  const admin = await signIn("admin");
  const r = await admin.client.from("invites").select("*").like("email", pattern);
  expect(r.error, `admin invites 조회: ${r.error?.message}`).toBeNull();
  return (r.data ?? []) as Row[];
}

async function expectNoInvite(email: string, what: string): Promise<void> {
  expect(await adminInvites(email.trim().toLowerCase()), `${what}: 생긴 초대`).toHaveLength(0);
  if (HAS_SERVICE) {
    const r = await service().from("invites").select("id").eq("email", email.trim().toLowerCase());
    expect(r.error).toBeNull();
    expect(r.data ?? [], `${what}: 생긴 초대 (전체 학교)`).toHaveLength(0);
  }
}

function sharedEmail(role: Role): string {
  const key = { student: "TEST_STUDENT", teacher: "TEST_TEACHER", admin: "TEST_ADMIN", schoolB: "TEST_SCHOOL_B" }[role];
  const v = process.env[`${key}_EMAIL`];
  if (!v) throw new Error(`환경변수 ${key}_EMAIL 이 없습니다`);
  return v;
}

// ---------- service role (준비·정리·대조 조회 전용) ----------

let serviceCache: SupabaseClient | null = null;
function service(): SupabaseClient {
  if (!serviceCache) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("service role 준비 불가 (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
    serviceCache = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return serviceCache;
}

interface TempUser {
  id: string;
  email: string;
  password: string;
}

interface TempSchool {
  id: string;
  neis: string;
  admin: TempUser & { client: SupabaseClient };
}

/** 성공 경로 테스트 한 건의 시간 한도 (Auth 요청 한도에 걸리면 기다렸다 다시 로그인하므로 넉넉히) */
const SUCCESS_TIMEOUT = 420_000;
/** 로그인 재시도: 한도(IP 당 5분 창)가 다시 찰 때까지 기다리는 간격·총 한도 */
const LOGIN_RETRY_WAIT_MS = 11_000;
const LOGIN_RETRY_TOTAL_MS = 300_000;

type AuthErr = { status?: number; code?: string; message?: string } | null;
const isRateLimited = (e: AuthErr): boolean =>
  Boolean(e) && (e?.status === 429 || e?.code === "over_request_rate_limit" || /rate limit/i.test(e?.message ?? ""));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 비밀번호 로그인 (한도에 걸리면 기다렸다 다시 — 다른 오류는 그대로 돌려준다) */
async function passwordLogin(email: string, password: string): Promise<{ client: SupabaseClient; error: AuthErr }> {
  const deadline = Date.now() + LOGIN_RETRY_TOTAL_MS;
  for (;;) {
    const client = anonClient();
    const signed = await client.auth.signInWithPassword({ email, password });
    if (!signed.error) return { client, error: null };
    if (!isRateLimited(signed.error) || Date.now() > deadline) return { client, error: signed.error };
    await sleep(LOGIN_RETRY_WAIT_MS);
  }
}

/**
 * 일회용 계정의 로그인 세션 (publishable 키 클라이언트 — 판정 대상 호출은 이 세션으로 한다).
 * 이 스펙은 일회용 계정을 수십 개 만들기 때문에 비밀번호 로그인만 쓰면 Supabase Auth 의 로그인 요청 한도
 * (IP 당 5분 창)를 넘기고, 같은 한도를 쓰는 공용 계정 로그인·다른 스펙까지 실패시킨다. 그래서
 * 1) service role 이 만든 일회용 로그인 토큰(generateLink — 메일을 보내지 않는다)을 verifyOtp 로 바꿔 세션을 얻고
 *    (토큰 확인 한도는 로그인 한도와 따로 센다),
 * 2) 그것이 안 되면 비밀번호 로그인, 둘 다 한도에 걸리면 기다렸다 다시 한다.
 * 어느 쪽이든 결과는 그 사용자의 authenticated 세션이다 (service role 권한이 섞이지 않는다).
 */
const sessions = new Map<string, SupabaseClient>();
async function sessionOf(u: TempUser): Promise<SupabaseClient> {
  const cached = sessions.get(u.id);
  if (cached) return cached;
  const deadline = Date.now() + LOGIN_RETRY_TOTAL_MS;
  let last: AuthErr = null;
  for (;;) {
    const client = anonClient();
    const link = await service().auth.admin.generateLink({ type: "magiclink", email: u.email });
    const tokenHash = link.data?.properties?.hashed_token;
    if (!link.error && tokenHash) {
      const v = await client.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
      if (!v.error && v.data.user?.id === u.id) {
        sessions.set(u.id, client);
        return client;
      }
      last = v.error;
    } else {
      last = link.error;
    }
    const pw = anonClient();
    const signed = await pw.auth.signInWithPassword({ email: u.email, password: u.password });
    if (!signed.error && signed.data.user?.id === u.id) {
      sessions.set(u.id, pw);
      return pw;
    }
    if (!isRateLimited(signed.error) || Date.now() > deadline) {
      throw new Error(`일회용 계정 로그인 실패: 토큰 확인 = ${last?.message ?? "-"}, 비밀번호 = ${signed.error?.message ?? "-"}`);
    }
    await sleep(LOGIN_RETRY_WAIT_MS);
  }
}

/** 일회용 계정 (admin createUser + email_confirm — signUp 을 부르지 않아 메일이 나가지 않는다). 로그인은 sessionOf 로 필요할 때만. */
async function tempUser(info: TestInfo, email = tempEmail(info)): Promise<TempUser> {
  const password = randomBytes(18).toString("base64url");
  const made = await service().auth.admin.createUser({ email, password, email_confirm: true });
  expect(made.error, `일회용 계정 생성: ${made.error?.message}`).toBeNull();
  return { id: made.data.user!.id, email, password };
}

/** 가입의 학교 연결 단계와 같은 호출 (lib/server/onboard → register_profile, service_role 전용) */
async function registerProfile(userId: string, neis: string, name: string): Promise<RpcResult> {
  return rpc(service(), "register_profile", {
    p_user_id: userId,
    p_neis_code: neis,
    p_office_code: "S8T",
    p_school_name: `S8 테스트 임시학교 ${neis.slice(-8)}`,
    p_sido: "테스트",
    p_region: "테스트",
    p_display_name: name,
  });
}

/** 일회용 학교 + 첫 가입자(admin) */
async function tempSchool(info: TestInfo): Promise<TempSchool> {
  const neis = `${SCHOOL_PREFIX}${info.project.name}-${Date.now()}-${rand()}`;
  const admin = await tempUser(info, tempEmail(info, "adm-"));
  const res = await registerProfile(admin.id, neis, "S8 임시 admin");
  expect(res.error, `일회용 학교 첫 가입: ${res.error?.message}`).toBeNull();
  const prof = firstRow(res.data);
  expect(prof?.role, "학교의 첫 가입자는 admin (d7 §4)").toBe("admin");
  return { id: prof!.school_id as string, neis, admin: { ...admin, client: await sessionOf(admin) } };
}

/** 일회용 학교에 멤버 추가 (초대 없음 → student) */
async function addMember(school: TempSchool, info: TestInfo, name = "S8 임시 멤버"): Promise<TempUser> {
  const u = await tempUser(info);
  const res = await registerProfile(u.id, school.neis, name);
  expect(res.error, `일회용 멤버 등록: ${res.error?.message}`).toBeNull();
  expect(firstRow(res.data)?.role, "초대 없는 두 번째 이후 가입자는 student").toBe("student");
  expect(firstRow(res.data)?.school_id).toBe(school.id);
  return u;
}

async function profileByService(userId: string): Promise<Row | null> {
  const r = await service().from("profiles").select(PROFILE_COLS).eq("user_id", userId).maybeSingle();
  expect(r.error, `프로필 대조 조회: ${r.error?.message}`).toBeNull();
  return (r.data as Row | null) ?? null;
}

async function invitesByService(schoolId: string): Promise<Row[]> {
  const r = await service().from("invites").select("*").eq("school_id", schoolId).order("invited_at").order("email");
  expect(r.error, `초대 대조 조회: ${r.error?.message}`).toBeNull();
  return (r.data ?? []) as Row[];
}

/** 이 프로젝트 접두사의 잔여물(초대·시약·프로필·계정·학교)을 지우고, 남은 수를 돌려준다 */
async function sweep(project: string): Promise<{ users: number; schools: number; invites: number; profiles: number }> {
  const sb = service();
  const emailLike = `${EMAIL_PREFIX}${project}-%`;
  const schools = await sb.from("schools").select("id").like("neis_code", `${SCHOOL_PREFIX}${project}-%`);
  const schoolIds = (schools.data ?? []).map((s) => s.id as string);

  await sb.from("invites").delete().like("email", emailLike);
  if (schoolIds.length) {
    await sb.from("invites").delete().in("school_id", schoolIds);
    await sb.from("reagents").delete().in("school_id", schoolIds);
    await sb.from("profiles").delete().in("school_id", schoolIds);
  }

  const leftUsers: string[] = [];
  for (let page = 1; page <= 20; page++) {
    const list = await sb.auth.admin.listUsers({ page, perPage: 200 });
    const users = list.data?.users ?? [];
    for (const u of users) {
      if (!u.email?.startsWith(`${EMAIL_PREFIX}${project}-`)) continue;
      await sb.from("profiles").delete().eq("user_id", u.id);
      const del = await sb.auth.admin.deleteUser(u.id);
      if (del.error) leftUsers.push(u.id);
    }
    if (users.length < 200) break;
  }
  if (schoolIds.length) await sb.from("schools").delete().in("id", schoolIds);

  const leftSchools = await sb.from("schools").select("id").like("neis_code", `${SCHOOL_PREFIX}${project}-%`);
  const leftInvites = await sb.from("invites").select("id").like("email", emailLike);
  const leftProfiles = schoolIds.length
    ? await sb.from("profiles").select("user_id").in("school_id", schoolIds)
    : { data: [] as unknown[] };
  return {
    users: leftUsers.length,
    schools: (leftSchools.data ?? []).length,
    invites: (leftInvites.data ?? []).length,
    profiles: (leftProfiles.data ?? []).length,
  };
}

test.afterAll(async ({}, info) => {
  info.setTimeout(300_000);
  // 정리가 먼저다: 아래 확인(공용 계정 로그인)이 실패해도 일회용 계정·학교가 남지 않게 한다.
  // 거부 테스트는 초대를 만들지 않아야 한다 — 정리 전에 학교 A 에 남은 이 프로젝트 접두사 초대를 세어 둔다 (0 이어야 함).
  let leakedBeforeSweep: Row[] | null = null;
  let left: Awaited<ReturnType<typeof sweep>> | null = null;
  if (HAS_SERVICE) {
    const admin = await signIn("admin").catch(() => null);
    if (admin) {
      const r = await service()
        .from("invites")
        .select("id, email")
        .eq("school_id", admin.schoolId)
        .like("email", `${EMAIL_PREFIX}${info.project.name}-%`);
      if (!r.error) leakedBeforeSweep = (r.data ?? []) as Row[];
    }
    left = await sweep(info.project.name);
  }
  const leaked = leakedBeforeSweep ?? (await adminInvites(`${EMAIL_PREFIX}${info.project.name}-%`));
  if (left) expect(left, "일회용 계정·학교·초대 잔여물").toEqual({ users: 0, schools: 0, invites: 0, profiles: 0 });
  expect(leaked, "거부되어야 하는 초대가 학교 A 에 남음").toHaveLength(0);
  // 공용 계정 4개는 그대로
  for (const role of ["student", "teacher", "admin", "schoolB"] as Role[]) {
    await expectSharedUnchanged(await signIn(role));
  }
});

// ======================================================================
// R-db: 학생·교사는 세 함수 모두 거부 (d7 §8 권한 = admin 만)
// ======================================================================

for (const role of ["student", "teacher", "schoolB"] as Role[]) {
  test(`[R-db][S8] ${ROLE_LABEL[role]} invite_members 거부 42501 (초대 행 없음)`, async ({}, info) => {
    const s = await signIn(role);
    expect(s.profileRole, "호출자는 admin 이 아님").not.toBe("admin");
    for (const inviteRole of INVITE_ROLES) {
      const email = tempEmail(info);
      const res = await rpc(s.client, "invite_members", inviteArgs([email], inviteRole));
      expectRejected(res, `${ROLE_LABEL[role]} invite_members(${inviteRole})`, "42501");
      await expectNoInvite(email, `${ROLE_LABEL[role]} invite_members`);
      // 호출자 자신에게도 초대가 보이지 않는다
      const own = await s.client.from("invites").select("id").eq("email", email);
      expect(own.error ? [] : own.data ?? []).toHaveLength(0);
    }
  });
}

for (const role of ["student", "teacher"] as const) {
  const other = role === "student" ? "teacher" : "student";

  test(`[R-db][S8] ${ROLE_LABEL[role]} change_member_role 거부 42501 (자기 승격·다른 멤버 변경 모두, 역할 그대로)`, async () => {
    const s = await signIn(role);
    const o = await signIn(other);
    const admin = await signIn("admin");
    expect(s.schoolId).toBe(o.schoolId);
    const before = { s: await ownProfile(s), o: await ownProfile(o), admin: await ownProfile(admin) };
    try {
      // 1) 없는 사용자 id — admin 검사가 대상 조회보다 먼저여야 한다 (42501, P0002 아님). 통과해야 실제 대상을 겨눈다.
      expectRejected(
        await rpc(s.client, "change_member_role", changeArgs(randomUUID(), "teacher")),
        `${ROLE_LABEL[role]} change_member_role(없는 id)`,
        "42501",
      );
      // 2) 자기 자신을 admin·다른 역할로
      for (const target of MEMBER_ROLES.filter((r) => r !== role)) {
        expectRejected(
          await rpc(s.client, "change_member_role", changeArgs(s.userId, target)),
          `${ROLE_LABEL[role]} 자기 역할 → ${target}`,
          "42501",
        );
      }
      // 3) 같은 학교 다른 멤버·admin
      expectRejected(
        await rpc(s.client, "change_member_role", changeArgs(o.userId, role)),
        `${ROLE_LABEL[role]} → ${ROLE_LABEL[other]} 역할 변경`,
        "42501",
      );
      expectRejected(
        await rpc(s.client, "change_member_role", changeArgs(admin.userId, "admin")),
        `${ROLE_LABEL[role]} → admin 역할 변경(같은 역할)`,
        "42501",
      );
      await expectSharedUnchanged(s, before.s);
      await expectSharedUnchanged(o, before.o);
      await expectSharedUnchanged(admin, before.admin);
    } finally {
      await restoreSharedRole("student");
      await restoreSharedRole("teacher");
    }
  });

  test(`[R-db][S8] ${ROLE_LABEL[role]} remove_member 거부 42501 (프로필 행 그대로)`, async () => {
    const s = await signIn(role);
    const o = await signIn(other);
    const before = { s: await ownProfile(s), o: await ownProfile(o) };
    // 없는 사용자 id 로 먼저: admin 검사가 먼저면 42501. 여기서 실패하면 실제 멤버를 겨누지 않는다.
    expectRejected(
      await rpc(s.client, "remove_member", removeArgs(randomUUID())),
      `${ROLE_LABEL[role]} remove_member(없는 id)`,
      "42501",
    );
    expectRejected(
      await rpc(s.client, "remove_member", removeArgs(o.userId)),
      `${ROLE_LABEL[role]} → ${ROLE_LABEL[other]} remove_member`,
      "42501",
    );
    expectRejected(
      await rpc(s.client, "remove_member", removeArgs(s.userId)),
      `${ROLE_LABEL[role]} 자기 자신 remove_member`,
      "42501",
    );
    await expectSharedUnchanged(s, before.s);
    await expectSharedUnchanged(o, before.o);
  });
}

// ======================================================================
// R-db: admin 이어도 거부되는 것 (본인 내보내기·마지막 admin·잘못된 값)
// ======================================================================

test(`[R-db][S8] admin 자기 자신 remove_member 거부 (프로필 그대로)`, async () => {
  const admin = await signIn("admin");
  const before = await ownProfile(admin);
  const res = await rpc(admin.client, "remove_member", removeArgs(admin.userId));
  expectRejected(res, "admin 자기 자신 remove_member", "22023", "cannot remove self");
  await expectSharedUnchanged(admin, before);
});

test(`[R-db][S8] 학교의 마지막 admin 은 다른 역할로 바꿀 수 없다 (last admin 23514, 역할 그대로)`, async () => {
  const admin = await signIn("admin");
  const before = await ownProfile(admin);
  for (const target of MEMBER_ROLES.filter((r) => r !== "admin")) {
    // 전제: 학교 A 의 admin 은 이 계정 1명 (admin 은 같은 학교 프로필을 볼 수 있다). 호출 직전에 매번 확인한다.
    const admins = await admin.client.from("profiles").select("user_id").eq("role", "admin");
    expect(admins.error).toBeNull();
    expect((admins.data ?? []).map((r) => r.user_id), "학교 A admin = 공용 admin 1명 (전제)").toEqual([admin.userId]);

    const res = await rpc(admin.client, "change_member_role", changeArgs(admin.userId, target));
    expectRejected(res, `마지막 admin → ${target}`, "23514", "last admin");
    await expectSharedUnchanged(admin, before);
  }
});

const BAD_MEMBER_ROLES: [string, unknown][] = [
  ["owner", "owner"],
  ["null", null],
  ["빈 문자열", ""],
  ["대문자 ADMIN", "ADMIN"],
  ["공백 붙은 'teacher '", "teacher "],
];

test(`[R-db][S8] admin change_member_role 잘못된 역할 거부 22023 (대상 역할 그대로)`, async () => {
  const admin = await signIn("admin");
  const st = await signIn("student");
  const before = await ownProfile(st);
  try {
    for (const [label, bad] of BAD_MEMBER_ROLES) {
      const res = await rpc(admin.client, "change_member_role", changeArgs(st.userId, bad));
      expectRejected(res, `change_member_role 역할 ${label}`, "22023", "invalid role");
      await expectSharedUnchanged(st, before);
    }
  } finally {
    await restoreSharedRole("student");
  }
});

test(`[R-db][S8] admin change_member_role·remove_member 없는 사용자 id·null → member not found (P0002)`, async () => {
  const admin = await signIn("admin");
  expectRejected(
    await rpc(admin.client, "change_member_role", changeArgs(randomUUID(), "teacher")),
    "change_member_role(없는 id)",
    "P0002",
    "member not found",
  );
  expectRejected(await rpc(admin.client, "remove_member", removeArgs(randomUUID())), "remove_member(없는 id)", "P0002", "member not found");
  const nullChange = await rpc(admin.client, "change_member_role", changeArgs(null, "teacher"));
  expectRejected(nullChange, "change_member_role(null id)");
  const nullRemove = await rpc(admin.client, "remove_member", removeArgs(null));
  expectRejected(nullRemove, "remove_member(null id)");
  for (const role of ["student", "teacher", "admin"] as Role[]) await expectSharedUnchanged(await signIn(role));
});

const BAD_INVITE_ROLES: [string, unknown][] = [
  ["admin (초대 역할에 admin 은 없다)", "admin"],
  ["owner", "owner"],
  ["null", null],
  ["빈 문자열", ""],
  ["대문자 TEACHER", "TEACHER"],
];

for (const [label, bad] of BAD_INVITE_ROLES) {
  test(`[R-db][S8] admin invite_members 역할 ${label} 거부 22023 (초대 행 없음)`, async ({}, info) => {
    const admin = await signIn("admin");
    const email = tempEmail(info);
    const res = await rpc(admin.client, "invite_members", inviteArgs([email], bad));
    expectRejected(res, `invite_members 역할 ${label}`, "22023", "invalid role");
    await expectNoInvite(email, `invite_members 역할 ${label}`);
  });
}

const EMPTY_EMAILS: [string, unknown][] = [
  ["빈 배열", []],
  ["null", null],
  ["빈 문자열·공백만", ["", "   "]],
];

for (const [label, emails] of EMPTY_EMAILS) {
  test(`[R-db][S8] admin invite_members 이메일 ${label} 거부 22023 no emails`, async ({}, info) => {
    const admin = await signIn("admin");
    const before = await adminInvites(`${EMAIL_PREFIX}${info.project.name}-%`);
    const res = await rpc(admin.client, "invite_members", inviteArgs(emails, "student"));
    expectRejected(res, `invite_members 이메일 ${label}`, "22023", "no emails");
    expect(await adminInvites(`${EMAIL_PREFIX}${info.project.name}-%`)).toEqual(before);
    const blank = await admin.client.from("invites").select("id").eq("email", "");
    expect(blank.error).toBeNull();
    expect(blank.data ?? [], "이메일이 빈 초대").toHaveLength(0);
  });
}

/** 잘못된 형식 (접두사 뒤에 붙여 이 스펙의 것으로 식별된다) */
const BAD_EMAIL_SUFFIXES: [string, string][] = [
  ["@ 없음", "no-at.example.test"],
  ["도메인 없음", "user@"],
  ["점 없는 도메인", "user@localhost"],
  ["가운데 공백", "us er@example.test"],
  ["@ 두 개", "a@b@example.test"],
  ["쉼표로 이은 두 이메일을 한 항목으로", "a@example.test,b@example.test "],
];

test(`[R-db][S8] admin invite_members 잘못된 이메일 형식 거부 22023 (detail = 문제 이메일, 초대 행 없음)`, async ({}, info) => {
  const admin = await signIn("admin");
  for (const [label, suffix] of BAD_EMAIL_SUFFIXES) {
    const bad = `${EMAIL_PREFIX}${info.project.name}-${Date.now()}-${rand()}-${suffix}`;
    const res = await rpc(admin.client, "invite_members", inviteArgs([bad], "student"));
    expectRejected(res, `invite_members ${label}`, "22023", "invalid email");
    expect(String(res.error?.details ?? ""), `${label}: detail 에 문제 이메일`).toContain(bad.trim().toLowerCase());
  }
  expect(await adminInvites(`${EMAIL_PREFIX}${info.project.name}-%`), "형식 오류로 생긴 초대").toHaveLength(0);
});

test(`[R-db][S8] admin invite_members 하나라도 형식 오류면 전체 거부 (맞는 이메일도 초대되지 않음)`, async ({}, info) => {
  const admin = await signIn("admin");
  const good1 = tempEmail(info);
  const good2 = tempEmail(info);
  const bad = `${EMAIL_PREFIX}${info.project.name}-${Date.now()}-${rand()}-not-an-email`;
  const res = await rpc(admin.client, "invite_members", inviteArgs([good1, bad, good2], "teacher"));
  expectRejected(res, "invite_members 일부 형식 오류", "22023", "invalid email");
  const detail = String(res.error?.details ?? "");
  expect(detail).toContain(bad);
  expect(detail, "detail 에는 문제 이메일만").not.toContain(good1);
  await expectNoInvite(good1, "일부 형식 오류");
  await expectNoInvite(good2, "일부 형식 오류");
});

test(`[R-db][S8] admin invite_members 한 번에 ${INVITE_MAX}명 초과 거부 22023 too many emails (초대 행 없음)`, async ({}, info) => {
  const admin = await signIn("admin");
  const tag = `${Date.now()}-${rand()}`;
  const emails = Array.from({ length: INVITE_MAX + 1 }, (_, i) => `${EMAIL_PREFIX}${info.project.name}-${tag}-${i}@example.test`);
  expect(new Set(emails).size).toBe(INVITE_MAX + 1);
  const res = await rpc(admin.client, "invite_members", inviteArgs(emails, "student"));
  expectRejected(res, `invite_members ${INVITE_MAX + 1}명`, "22023", "too many emails");
  expect(await adminInvites(`${EMAIL_PREFIX}${info.project.name}-${tag}-%`), "한도 초과로 생긴 초대").toHaveLength(0);
});

for (const member of ["student", "teacher", "admin"] as Role[]) {
  test(`[R-db][S8] admin 이 이미 멤버인 이메일(${ROLE_LABEL[member]}) 초대 거부 23505 already member`, async ({}, info) => {
    const admin = await signIn("admin");
    const email = sharedEmail(member);
    const lower = email.trim().toLowerCase();
    // 그대로 · 대문자+앞뒤 공백 (소문자·trim 으로 비교해야 한다)
    for (const variant of [email, `  ${email.toUpperCase()} `]) {
      const res = await rpc(admin.client, "invite_members", inviteArgs([variant], "student"));
      expectRejected(res, `이미 멤버 초대 (${variant === email ? "그대로" : "대문자·공백"})`, "23505", "already member");
      expect(String(res.error?.details ?? ""), "detail 에 문제 이메일").toContain(lower);
      await expectNoInvite(lower, "이미 멤버 초대");
    }
    // 새 이메일과 섞어도 전체 거부
    const fresh = tempEmail(info);
    const mixed = await rpc(admin.client, "invite_members", inviteArgs([fresh, email], "teacher"));
    expectRejected(mixed, "새 이메일 + 이미 멤버", "23505", "already member");
    expect(String(mixed.error?.details ?? ""), "detail 에는 문제 이메일만").not.toContain(fresh);
    await expectNoInvite(fresh, "새 이메일 + 이미 멤버");
    await expectNoInvite(lower, "새 이메일 + 이미 멤버");
  });
}

// ======================================================================
// R-db: profiles 직접 변경 차단 (역할·학교는 함수로만 — d7 §8)
// ======================================================================

for (const target of ["student", "teacher"] as const) {
  test(`[R-db][S8] admin 이 profiles 직접 update 로 ${ROLE_LABEL[target]}의 role 변경 거부 (값 그대로)`, async () => {
    const admin = await signIn("admin");
    const t = await signIn(target);
    const before = await ownProfile(t);
    // 대조군: admin 은 같은 학교 프로필 행을 볼 수 있다 (거부 사유가 "안 보여서"가 아님)
    const seen = await admin.client.from("profiles").select("user_id").eq("user_id", t.userId);
    expect(seen.error).toBeNull();
    expect(seen.data ?? [], "admin 이 보는 대상 행").toHaveLength(1);
    try {
      for (const role of MEMBER_ROLES.filter((r) => r !== SHARED_ROLE[target])) {
        const res = await admin.client.from("profiles").update({ role }).eq("user_id", t.userId).select("user_id");
        expect(res.error, `admin 직접 update role=${role} 는 오류여야 함`).not.toBeNull();
        expect(changed(res)).toBe(0);
        await expectSharedUnchanged(t, before);
      }
      // 다른 열과 함께 바꿔도 거부 (display_name 도 바뀌지 않는다)
      const both = await admin.client
        .from("profiles")
        .update({ role: "admin", display_name: "R-db-S8-침범" })
        .eq("user_id", t.userId)
        .select("user_id");
      expect(both.error, "role + display_name 직접 update 는 오류여야 함").not.toBeNull();
      await expectSharedUnchanged(t, before);
    } finally {
      await restoreSharedRole(target);
    }
  });
}

test(`[N1-db][S8] admin 이 profiles 직접 update 로 멤버·자신의 school_id 변경 거부 (학교 B·없는 학교, 값 그대로)`, async () => {
  const admin = await signIn("admin");
  const st = await signIn("student");
  const b = await signIn("schoolB");
  const before = { st: await ownProfile(st), admin: await ownProfile(admin) };
  for (const schoolId of [b.schoolId, randomUUID()]) {
    const res = await admin.client.from("profiles").update({ school_id: schoolId }).eq("user_id", st.userId).select("user_id");
    expect(changed(res), "admin 의 멤버 school_id 변경으로 바뀐 행").toBe(0);
    expect(res.error, "멤버 school_id 직접 update 는 오류여야 함").not.toBeNull();
    const self = await admin.client.from("profiles").update({ school_id: schoolId }).eq("user_id", admin.userId).select("user_id");
    expect(changed(self), "admin 의 자기 school_id 변경으로 바뀐 행").toBe(0);
    await expectSharedUnchanged(st, before.st);
    await expectSharedUnchanged(admin, before.admin);
  }
  // 학교 B 교사에게 학교 A 멤버가 보이지 않는다
  const seen = await b.client.from("profiles").select("user_id").in("user_id", [st.userId, admin.userId]);
  expect(seen.error).toBeNull();
  expect(seen.data ?? []).toHaveLength(0);
});

for (const role of ["student", "teacher"] as const) {
  const other = role === "student" ? "teacher" : "student";

  test(`[R-db][S8] ${ROLE_LABEL[role]} profiles 직접 update 거부 (자기 승격·다른 멤버·이름, 값 그대로)`, async () => {
    const s = await signIn(role);
    const o = await signIn(other);
    const admin = await signIn("admin");
    const before = { s: await ownProfile(s), o: await ownProfile(o), admin: await ownProfile(admin) };
    try {
      const patches: Row[] = [{ role: "admin" }, { role: other }, { display_name: "R-db-S8-침범" }, { school_id: s.schoolId, role: "admin" }];
      for (const patch of patches) {
        for (const targetId of [s.userId, o.userId, admin.userId]) {
          const res = await s.client.from("profiles").update(patch).eq("user_id", targetId).select("user_id");
          expect(changed(res), `${ROLE_LABEL[role]} update ${JSON.stringify(patch)} 로 바뀐 행`).toBe(0);
        }
        // 필터 없이 학교 전체를 겨눠도 0행
        const all = await s.client.from("profiles").update(patch).eq("school_id", s.schoolId).select("user_id");
        expect(changed(all), `${ROLE_LABEL[role]} 학교 전체 update 로 바뀐 행`).toBe(0);
      }
      await expectSharedUnchanged(s, before.s);
      await expectSharedUnchanged(o, before.o);
      await expectSharedUnchanged(admin, before.admin);
    } finally {
      await restoreSharedRole("student");
      await restoreSharedRole("teacher");
    }
  });
}

for (const who of ["student", "teacher", "admin", "schoolB", "anon"] as Actor[]) {
  const rule = who === "schoolB" || who === "anon" ? "N1-db" : "R-db";
  test(`[${rule}][S8] ${labelOf(who)} profiles 직접 insert·delete 거부 (학교 A 프로필 그대로)`, async () => {
    const { client, session } = await clientOf(who);
    const st = await signIn("student");
    const t = await signIn("teacher");
    const admin = await signIn("admin");
    const before = { st: await ownProfile(st), t: await ownProfile(t), admin: await ownProfile(admin) };

    // insert: 없는 user_id · 자기 user_id(이미 프로필 있음) — 어느 쪽이든 오류
    for (const userId of [randomUUID(), session?.userId ?? st.userId]) {
      for (const role of MEMBER_ROLES) {
        const ins = await client
          .from("profiles")
          .insert({ user_id: userId, school_id: st.schoolId, role, display_name: "R-db-S8-침범" })
          .select("user_id");
        expect(ins.error, `${labelOf(who)} profiles insert(role=${role}) 는 오류여야 함`).not.toBeNull();
      }
    }

    // delete: 없는 id 로 먼저 (권한이 회수돼 있으면 여기서도 오류 또는 0행), 그 다음 실제 멤버
    const ghost = await client.from("profiles").delete().eq("user_id", randomUUID()).select("user_id");
    expect(changed(ghost)).toBe(0);
    const victims = who === "admin" ? [st.userId, t.userId] : [st.userId, t.userId, admin.userId];
    for (const targetId of victims) {
      const del = await client.from("profiles").delete().eq("user_id", targetId).select("user_id");
      expect(del.error, `${labelOf(who)} profiles delete 는 오류여야 함 (delete 권한 없음)`).not.toBeNull();
      expect(changed(del), `${labelOf(who)} delete 로 지워진 행`).toBe(0);
    }
    await expectSharedUnchanged(st, before.st);
    await expectSharedUnchanged(t, before.t);
    await expectSharedUnchanged(admin, before.admin);
    // 침범 이름의 프로필이 생기지 않았다 (admin 이 보는 학교 A 전체)
    const leaked = await admin.client.from("profiles").select("user_id").eq("display_name", "R-db-S8-침범");
    expect(leaked.error).toBeNull();
    expect(leaked.data ?? []).toHaveLength(0);
  });
}

for (const who of ["schoolB", "anon"] as Actor[]) {
  test(`[N1-db][S8] ${labelOf(who)} 학교 A 프로필 select 0행·직접 update 0행 (값 그대로)`, async () => {
    const { client } = await clientOf(who);
    const targets = [await signIn("student"), await signIn("teacher"), await signIn("admin")];
    const before = await Promise.all(targets.map((t) => ownProfile(t)));
    const ids = targets.map((t) => t.userId);

    const seen = await client.from("profiles").select("user_id").in("user_id", ids);
    expect(seen.error ? [] : seen.data ?? [], `${labelOf(who)} 가 보는 학교 A 프로필`).toHaveLength(0);
    const bySchool = await client.from("profiles").select("user_id").eq("school_id", targets[0].schoolId);
    expect(bySchool.error ? [] : bySchool.data ?? []).toHaveLength(0);

    for (const patch of [{ role: "student" }, { role: "admin" }, { display_name: "N1-db-S8-침범" }] as Row[]) {
      const upd = await client.from("profiles").update(patch).in("user_id", ids).select("user_id");
      expect(changed(upd), `${labelOf(who)} update ${JSON.stringify(patch)} 로 바뀐 행`).toBe(0);
    }
    for (let i = 0; i < targets.length; i++) await expectSharedUnchanged(targets[i], before[i]);
  });
}

// ======================================================================
// invites: 직접 쓰기는 모든 역할 거부, 읽기는 같은 학교 admin 만 (d7 §8 invites RLS)
// ======================================================================

for (const who of ["student", "teacher", "admin", "schoolB", "anon"] as Actor[]) {
  const rule = who === "schoolB" || who === "anon" ? "N1-db" : "R-db";
  test(`[${rule}][S8] ${labelOf(who)} invites 직접 insert·update·delete 거부 (함수로만 쓰기)`, async ({}, info) => {
    const { client, session } = await clientOf(who);
    const admin = await signIn("admin");
    const like = `${EMAIL_PREFIX}${info.project.name}-direct-%`;

    // insert: 학교 A · (로그인 사용자는) 자기 학교, 역할 2종
    const schoolIds = Array.from(new Set([admin.schoolId, session?.schoolId ?? admin.schoolId]));
    for (const schoolId of schoolIds) {
      for (const role of INVITE_ROLES) {
        const email = tempEmail(info, "direct-");
        const ins = await client
          .from("invites")
          .insert({ school_id: schoolId, email, role, invited_by: session?.userId ?? null })
          .select("id");
        expect(ins.error, `${labelOf(who)} invites insert 는 오류여야 함`).not.toBeNull();
        await expectNoInvite(email, `${labelOf(who)} invites 직접 insert`);
      }
    }

    // update·delete: 학교 A 전체를 겨눠도 0행
    const upd = await client.from("invites").update({ role: "teacher" }).eq("school_id", admin.schoolId).select("id");
    expect(changed(upd), `${labelOf(who)} invites update 로 바뀐 행`).toBe(0);
    const accept = await client
      .from("invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("school_id", admin.schoolId)
      .select("id");
    expect(changed(accept), `${labelOf(who)} invites accepted_at update 로 바뀐 행`).toBe(0);
    const del = await client.from("invites").delete().eq("school_id", admin.schoolId).select("id");
    expect(changed(del), `${labelOf(who)} invites delete 로 지워진 행`).toBe(0);

    expect(await adminInvites(like), "직접 쓰기로 생긴 초대").toHaveLength(0);
  });
}

for (const who of ["student", "teacher", "schoolB", "anon"] as Actor[]) {
  const rule = who === "schoolB" || who === "anon" ? "N1-db" : "R-db";
  test(`[${rule}][S8] ${labelOf(who)} invites select 0행 (admin 은 오류 없이 조회)`, async () => {
    const { client } = await clientOf(who);
    const admin = await signIn("admin");
    // 대조군: 같은 학교 admin 은 invites 를 읽을 수 있다 (오류 없음, 전부 자기 학교)
    const own = await admin.client.from("invites").select("id, school_id");
    expect(own.error, `admin invites select: ${own.error?.message}`).toBeNull();
    expect((own.data ?? []).filter((r) => r.school_id !== admin.schoolId), "admin 이 보는 다른 학교 초대").toHaveLength(0);

    for (const q of [
      client.from("invites").select("id"),
      client.from("invites").select("id").eq("school_id", admin.schoolId),
      client.from("invites").select("id").is("accepted_at", null),
    ]) {
      const res = await q;
      expect(res.error ? [] : res.data ?? [], `${labelOf(who)} invites`).toHaveLength(0);
    }
  });
}

// ======================================================================
// N1-db: 다른 학교 사용자는 "없는 사용자"와 똑같이 거부 (존재 여부 비노출)
// ======================================================================

test(`[N1-db][S8] 학교A admin 이 학교 B 사용자 change_member_role → member not found (없는 id 와 같은 응답, 대상 그대로)`, async () => {
  const admin = await signIn("admin");
  const b = await signIn("schoolB");
  expect(admin.schoolId).not.toBe(b.schoolId);
  const before = await ownProfile(b);
  const ghost = await rpc(admin.client, "change_member_role", changeArgs(randomUUID(), SHARED_ROLE.schoolB));
  expectRejected(ghost, "없는 id change_member_role", "P0002", "member not found");

  // 1) 지금 역할 그대로 (혹시 통과해도 아무것도 바뀌지 않는 호출) — 여기서 행이 돌아오면 존재가 새는 것
  const same = await rpc(admin.client, "change_member_role", changeArgs(b.userId, SHARED_ROLE.schoolB));
  expectRejected(same, "학교 B 사용자 change_member_role(같은 역할)", "P0002", "member not found");
  expect(errorShape(same), "없는 id 와 같은 응답").toEqual(errorShape(ghost));
  // 2) 다른 역할
  for (const role of MEMBER_ROLES.filter((r) => r !== SHARED_ROLE.schoolB)) {
    const res = await rpc(admin.client, "change_member_role", changeArgs(b.userId, role));
    expectRejected(res, `학교 B 사용자 change_member_role(${role})`, "P0002", "member not found");
    expect(errorShape(res), "없는 id 와 같은 응답").toEqual(errorShape(ghost));
    await expectSharedUnchanged(b, before);
  }
});

test(`[N1-db][S8] 학교A admin 이 학교 B 사용자 remove_member → member not found (없는 id 와 같은 응답, 프로필 그대로)`, async () => {
  const admin = await signIn("admin");
  const b = await signIn("schoolB");
  const before = await ownProfile(b);
  const ghost = await rpc(admin.client, "remove_member", removeArgs(randomUUID()));
  expectRejected(ghost, "없는 id remove_member", "P0002", "member not found");
  // 학교 B 사용자에 대한 change_member_role 이 not found 인지 먼저 본다 (학교 조건이 살아 있는지)
  const gate = await rpc(admin.client, "change_member_role", changeArgs(b.userId, SHARED_ROLE.schoolB));
  expectRejected(gate, "학교 B 사용자 change_member_role(같은 역할)", "P0002", "member not found");

  const res = await rpc(admin.client, "remove_member", removeArgs(b.userId));
  expectRejected(res, "학교 B 사용자 remove_member", "P0002", "member not found");
  expect(errorShape(res), "없는 id 와 같은 응답").toEqual(errorShape(ghost));
  await expectSharedUnchanged(b, before);
});

test(`[N1-db][S8] 학교B 교사가 학교 A 사용자 change_member_role·remove_member 거부 (없는 id 와 같은 응답, 대상 그대로)`, async () => {
  const b = await signIn("schoolB");
  const targets = [await signIn("student"), await signIn("teacher"), await signIn("admin")];
  const before = await Promise.all(targets.map((t) => ownProfile(t)));
  const ghostChange = await rpc(b.client, "change_member_role", changeArgs(randomUUID(), "student"));
  expectRejected(ghostChange, "학교B 교사 change_member_role(없는 id)");
  const ghostRemove = await rpc(b.client, "remove_member", removeArgs(randomUUID()));
  expectRejected(ghostRemove, "학교B 교사 remove_member(없는 id)");
  try {
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      // 지금 역할 그대로 먼저, 그 다음 다른 역할
      const same = await rpc(b.client, "change_member_role", changeArgs(t.userId, SHARED_ROLE[t.role]));
      expectRejected(same, `학교B 교사 → ${ROLE_LABEL[t.role]} change_member_role(같은 역할)`);
      expect(errorShape(same), "없는 id 와 같은 응답 (존재 여부 비노출)").toEqual(errorShape(ghostChange));
      const other = MEMBER_ROLES.find((r) => r !== SHARED_ROLE[t.role] && r !== "admin") ?? "student";
      const diff = await rpc(b.client, "change_member_role", changeArgs(t.userId, t.role === "admin" ? "admin" : other));
      expectRejected(diff, `학교B 교사 → ${ROLE_LABEL[t.role]} change_member_role`);
      expect(errorShape(diff)).toEqual(errorShape(ghostChange));

      const rm = await rpc(b.client, "remove_member", removeArgs(t.userId));
      expectRejected(rm, `학교B 교사 → ${ROLE_LABEL[t.role]} remove_member`);
      expect(errorShape(rm), "없는 id 와 같은 응답 (존재 여부 비노출)").toEqual(errorShape(ghostRemove));
      await expectSharedUnchanged(t, before[i]);
    }
  } finally {
    await restoreSharedRole("student");
    await restoreSharedRole("teacher");
  }
});

test(`[N1-db][S8] anon 은 invite_members·change_member_role·remove_member 호출 불가 42501 (학교 A 그대로)`, async ({}, info) => {
  const anon = anonClient();
  const st = await signIn("student");
  const before = await ownProfile(st);
  const email = tempEmail(info);
  expectRejected(await rpc(anon, "invite_members", inviteArgs([email], "student")), "anon invite_members", "42501");
  expectRejected(await rpc(anon, "change_member_role", changeArgs(randomUUID(), "admin")), "anon change_member_role(없는 id)", "42501");
  expectRejected(await rpc(anon, "change_member_role", changeArgs(st.userId, "student")), "anon change_member_role(같은 역할)", "42501");
  expectRejected(await rpc(anon, "remove_member", removeArgs(randomUUID())), "anon remove_member(없는 id)", "42501");
  expectRejected(await rpc(anon, "remove_member", removeArgs(st.userId)), "anon remove_member", "42501");
  await expectNoInvite(email, "anon invite_members");
  await expectSharedUnchanged(st, before);
});

test(`[N1-db][S8] invite_members·change_member_role·remove_member 에 학교를 넘길 방법이 없다 (school_id 인자 거부)`, async ({}, info) => {
  const admin = await signIn("admin");
  const b = await signIn("schoolB");
  const st = await signIn("student");
  const before = { st: await ownProfile(st), b: await ownProfile(b) };
  for (const key of ["p_school_id", "school_id"]) {
    const email = tempEmail(info);
    const inv = await rpc(admin.client, "invite_members", { ...inviteArgs([email], "student"), [key]: b.schoolId });
    expect(inv.error, `${key} 인자를 받는 invite_members 는 없어야 함`).not.toBeNull();
    await expectNoInvite(email, `invite_members ${key}`);

    const chg = await rpc(admin.client, "change_member_role", { ...changeArgs(b.userId, SHARED_ROLE.schoolB), [key]: b.schoolId });
    expect(chg.error, `${key} 인자를 받는 change_member_role 은 없어야 함`).not.toBeNull();
    const rm = await rpc(admin.client, "remove_member", { ...removeArgs(randomUUID()), [key]: b.schoolId });
    expect(rm.error, `${key} 인자를 받는 remove_member 는 없어야 함`).not.toBeNull();
  }
  await expectSharedUnchanged(st, before.st);
  await expectSharedUnchanged(b, before.b);
});

// ======================================================================
// GM-db: 데모 학교에는 초대·멤버가 없다 (d7 §5 쓰기 금지, §8 "사용자 관리 없음")
// ======================================================================

for (const who of ["student", "teacher", "admin", "schoolB", "anon"] as Actor[]) {
  test(`[GM-db][S*] ${labelOf(who)}로 데모 학교 invites 직접 insert 거부·데모 학교 초대·멤버 select 0행`, async ({}, info) => {
    const { client, session } = await clientOf(who);
    if (session) expect(session.schoolId).not.toBe(DEMO_SCHOOL_ID);
    for (const role of INVITE_ROLES) {
      const email = tempEmail(info, "demo-");
      const ins = await client
        .from("invites")
        .insert({ school_id: DEMO_SCHOOL_ID, email, role, invited_by: session?.userId ?? null })
        .select("id");
      expect(ins.error, `${labelOf(who)} 데모 학교 invites insert 는 오류여야 함`).not.toBeNull();
      await expectNoInvite(email, `${labelOf(who)} 데모 학교 invites insert`);
    }
    const inv = await client.from("invites").select("id").eq("school_id", DEMO_SCHOOL_ID);
    expect(inv.error ? [] : inv.data ?? [], "데모 학교 초대").toHaveLength(0);
    // 데모 학교에는 멤버(profiles)가 없다 — 바꾸거나 내보낼 대상 자체가 보이지 않는다
    const members = await client.from("profiles").select("user_id").eq("school_id", DEMO_SCHOOL_ID);
    expect(members.error ? [] : members.data ?? [], "데모 학교 멤버").toHaveLength(0);
    // 데모 학교 프로필 직접 insert 도 거부
    const prof = await client
      .from("profiles")
      .insert({ user_id: session?.userId ?? randomUUID(), school_id: DEMO_SCHOOL_ID, role: "admin", display_name: "GM-db-S8-침범" })
      .select("user_id");
    expect(prof.error, `${labelOf(who)} 데모 학교 profiles insert 는 오류여야 함`).not.toBeNull();
    if (session) await expectSharedUnchanged(session);
  });
}

test(`[GM-db][S*] admin 도 invite_members 로 데모 학교에 초대할 수 없다 (학교 인자 없음, 초대 행 없음)`, async ({}, info) => {
  const admin = await signIn("admin");
  for (const key of ["p_school_id", "school_id"]) {
    const email = tempEmail(info, "demo-");
    const res = await rpc(admin.client, "invite_members", { ...inviteArgs([email], "student"), [key]: DEMO_SCHOOL_ID });
    expect(res.error, `${key} 인자를 받는 invite_members 는 없어야 함`).not.toBeNull();
    await expectNoInvite(email, `invite_members ${key}=데모 학교`);
  }
  // anon(데모 학교를 읽는 유일한 역할)에게도 초대는 0행
  const anon = await anonClient().from("invites").select("id");
  expect(anon.error ? [] : anon.data ?? []).toHaveLength(0);
});

// ======================================================================
// 성공 경로 — 일회용 계정 + 일회용 학교 (service role 로 준비·정리). 키가 없으면 skip.
// ======================================================================

test.describe("성공 경로 (일회용 학교)", () => {
  test.describe.configure({ mode: "default" });
  test.skip(!HAS_SERVICE, NO_SERVICE_REASON);

  test(`[R-db][S8] admin change_member_role 성공: student → teacher → admin → student 가 그대로 반영`, async ({}, info) => {
    test.setTimeout(SUCCESS_TIMEOUT);
    const school = await tempSchool(info);
    const m = await addMember(school, info);
    const mClient = await sessionOf(m);
    const start = await profileByService(m.id);
    for (const role of ["teacher", "admin", "student"] as const) {
      const res = await rpc(school.admin.client, "change_member_role", changeArgs(m.id, role));
      expect(res.error, `change_member_role → ${role}: ${res.error?.message}`).toBeNull();
      const returned = firstRow(res.data);
      expect(returned?.user_id).toBe(m.id);
      expect(returned?.role, "반환 행의 역할").toBe(role);
      // 바뀌는 것은 role 뿐
      expect(await profileByService(m.id)).toEqual({ ...start, role });
      // 대상 본인 세션에서도 새 역할
      const own = await mClient.from("profiles").select("role").eq("user_id", m.id).single();
      expect(own.data?.role).toBe(role);
    }
    // 호출한 admin 은 그대로
    expect((await profileByService(school.admin.id))?.role).toBe("admin");
  });

  test(`[R-db][S8] admin 2명이면 한 명 강등 가능, 1명 남으면 last admin 거부 (강등된 사람은 더 이상 호출 불가)`, async ({}, info) => {
    test.setTimeout(SUCCESS_TIMEOUT);
    const school = await tempSchool(info);
    const m = await addMember(school, info);
    const mClient = await sessionOf(m);
    const up = await rpc(school.admin.client, "change_member_role", changeArgs(m.id, "admin"));
    expect(up.error, `승격: ${up.error?.message}`).toBeNull();

    // admin 2명: 새 admin 이 원래 admin 을 teacher 로
    const down = await rpc(mClient, "change_member_role", changeArgs(school.admin.id, "teacher"));
    expect(down.error, `admin 2명일 때 강등: ${down.error?.message}`).toBeNull();
    expect((await profileByService(school.admin.id))?.role).toBe("teacher");

    // admin 1명: 자기 강등 거부
    for (const role of ["student", "teacher"]) {
      const last = await rpc(mClient, "change_member_role", changeArgs(m.id, role));
      expectRejected(last, `마지막 admin → ${role}`, "23514", "last admin");
      expect((await profileByService(m.id))?.role).toBe("admin");
    }
    // 강등된 원래 admin 은 이제 admin 이 아니다
    expectRejected(
      await rpc(school.admin.client, "change_member_role", changeArgs(m.id, "student")),
      "강등된 사용자의 change_member_role",
      "42501",
    );
    expectRejected(await rpc(school.admin.client, "remove_member", removeArgs(m.id)), "강등된 사용자의 remove_member", "42501");
    expectRejected(
      await rpc(school.admin.client, "invite_members", inviteArgs([tempEmail(info)], "student")),
      "강등된 사용자의 invite_members",
      "42501",
    );
    expect((await profileByService(m.id))?.role).toBe("admin");
    // admin 은 다른 admin 을 내보낼 수 있다(2명일 때): 다시 2명으로 만든 뒤 한 명 내보내기
    const again = await rpc(mClient, "change_member_role", changeArgs(school.admin.id, "admin"));
    expect(again.error).toBeNull();
    const out = await rpc(mClient, "remove_member", removeArgs(school.admin.id));
    expect(out.error, `admin 2명일 때 다른 admin 내보내기: ${out.error?.message}`).toBeNull();
    expect(await profileByService(school.admin.id)).toBeNull();
    // 남은 1명은 본인 내보내기 거부
    expectRejected(await rpc(mClient, "remove_member", removeArgs(m.id)), "마지막 admin 본인 내보내기", "22023", "cannot remove self");
    expect((await profileByService(m.id))?.role).toBe("admin");
  });

  test(`[R-db][S8] 같은 역할로 change_member_role 은 성공·변화 없음 (마지막 admin 의 admin → admin 포함)`, async ({}, info) => {
    test.setTimeout(SUCCESS_TIMEOUT);
    const school = await tempSchool(info);
    const m = await addMember(school, info);
    const before = await profileByService(m.id);
    const res = await rpc(school.admin.client, "change_member_role", changeArgs(m.id, "student"));
    expect(res.error, `같은 역할: ${res.error?.message}`).toBeNull();
    expect(firstRow(res.data)?.role).toBe("student");
    expect(await profileByService(m.id)).toEqual(before);

    const adminBefore = await profileByService(school.admin.id);
    const self = await rpc(school.admin.client, "change_member_role", changeArgs(school.admin.id, "admin"));
    expect(self.error, `마지막 admin 의 admin → admin: ${self.error?.message}`).toBeNull();
    expect(await profileByService(school.admin.id)).toEqual(adminBefore);
  });

  test(`[R-db][S8] remove_member 성공: profiles 행 삭제·로그인 계정 존속·반환값, 내보낸 사용자 세션은 업무 테이블 0행`, async ({}, info) => {
    test.setTimeout(SUCCESS_TIMEOUT);
    const school = await tempSchool(info);
    const m = await addMember(school, info);
    const mClient = await sessionOf(m);
    // 대조군: 일회용 학교에 시약 1개 (admin 이 직접 insert — d7 §2), 멤버가 볼 수 있다
    const made = await school.admin.client
      .from("reagents")
      .insert({ school_id: school.id, name: "S8 임시 시약", unit: "g", stock: 1, min_stock: 0 })
      .select("id");
    expect(made.error, `대조군 시약: ${made.error?.message}`).toBeNull();
    const seenBefore = await mClient.from("reagents").select("id");
    expect(seenBefore.data ?? [], "내보내기 전 멤버가 보는 시약 (양성 대조군)").toHaveLength(1);
    const schoolBefore = await mClient.from("schools").select("id");
    expect((schoolBefore.data ?? []).map((s) => s.id)).toEqual([school.id]);

    const before = await profileByService(m.id);
    const res = await rpc(school.admin.client, "remove_member", removeArgs(m.id));
    expect(res.error, `remove_member: ${res.error?.message}`).toBeNull();
    const returned = firstRow(res.data);
    expect({ user_id: returned?.user_id, school_id: returned?.school_id, role: returned?.role, display_name: returned?.display_name }).toEqual(
      before,
    );

    expect(await profileByService(m.id), "profiles 행 삭제").toBeNull();
    // 로그인 계정은 남는다
    const user = await service().auth.admin.getUserById(m.id);
    expect(user.error).toBeNull();
    expect(user.data.user?.email).toBe(m.email);
    const relogin = await passwordLogin(m.email, m.password);
    expect(relogin.error, `내보낸 계정도 로그인은 된다: ${relogin.error?.message}`).toBeNull();

    // 내보낸 사용자의 (기존) 세션: 프로필·학교·업무 테이블 0행, 쓰기 함수 거부
    const own = await mClient.from("profiles").select("user_id");
    expect(own.error ? [] : own.data ?? []).toHaveLength(0);
    for (const table of ["schools", "reagents", "usage_logs", "cabinets", "cabinet_slots", "intake_logs", "invites"]) {
      const r = await mClient.from(table).select("id");
      expect(r.error ? [] : r.data ?? [], `내보낸 사용자 ${table}`).toHaveLength(0);
    }
    expectRejected(await rpc(mClient, "change_member_role", changeArgs(school.admin.id, "student")), "내보낸 사용자 change_member_role", "42501");
    expectRejected(await rpc(mClient, "invite_members", inviteArgs([tempEmail(info)], "student")), "내보낸 사용자 invite_members", "42501");
    // 두 번 내보내기 → member not found
    expectRejected(await rpc(school.admin.client, "remove_member", removeArgs(m.id)), "이미 내보낸 사용자", "P0002", "member not found");
    // 다른 멤버·admin 은 그대로
    expect((await profileByService(school.admin.id))?.role).toBe("admin");
  });

  test(`[R-db][S8] invite_members 성공: 소문자·trim·중복 제거, invited_by·accepted_at null, 재초대는 already invited`, async ({}, info) => {
    test.setTimeout(SUCCESS_TIMEOUT);
    const school = await tempSchool(info);
    const a = tempEmail(info);
    const b = tempEmail(info);
    const input = [`  ${a.toUpperCase()} `, b, a, "", `${b} `];
    const res = await rpc(school.admin.client, "invite_members", inviteArgs(input, "teacher"));
    expect(res.error, `invite_members: ${res.error?.message}`).toBeNull();
    const returned = rowsOf(res.data);
    expect(returned.map((r) => r.email), "반환 = 정리된 이메일 (입력 순서)").toEqual([a, b]);

    const rows = await invitesByService(school.id);
    expect(rows.map((r) => r.email).sort()).toEqual([a, b].sort());
    for (const r of rows) {
      expect(r.school_id).toBe(school.id);
      expect(r.role).toBe("teacher");
      expect(r.invited_by).toBe(school.admin.id);
      expect(r.accepted_at).toBeNull();
      expect(r.accepted_user_id).toBeNull();
      expect(Number.isFinite(Date.parse(String(r.invited_at))), "invited_at").toBe(true);
    }

    // 같은 이메일 재초대 (역할·대소문자를 바꿔도) → already invited, 새 이메일과 섞어도 전체 거부
    const fresh = tempEmail(info);
    for (const [emails, role] of [
      [[a], "teacher"],
      [[a.toUpperCase()], "student"],
      [[fresh, b], "student"],
    ] as [string[], string][]) {
      const again = await rpc(school.admin.client, "invite_members", inviteArgs(emails, role));
      expectRejected(again, "재초대", "23505", "already invited");
      expect(String(again.error?.details ?? "")).not.toContain(fresh);
    }
    expect(await invitesByService(school.id), "재초대로 바뀐 것 없음").toEqual(rows);

    // 이미 이 학교 멤버인 이메일은 already member
    const member = await addMember(school, info);
    expectRejected(
      await rpc(school.admin.client, "invite_members", inviteArgs([member.email], "student")),
      "일회용 학교 멤버 초대",
      "23505",
      "already member",
    );

    // 한도: 정확히 INVITE_MAX 명은 된다 (student)
    const tag = `${Date.now()}-${rand()}`;
    const many = Array.from({ length: INVITE_MAX }, (_, i) => `${EMAIL_PREFIX}${info.project.name}-${tag}-${i}@example.test`);
    const bulk = await rpc(school.admin.client, "invite_members", inviteArgs(many, "student"));
    expect(bulk.error, `${INVITE_MAX}명 초대: ${bulk.error?.message}`).toBeNull();
    expect(rowsOf(bulk.data)).toHaveLength(INVITE_MAX);
    expect(await invitesByService(school.id)).toHaveLength(rows.length + INVITE_MAX);
  });

  test(`[N1-db][S8] invites select 는 자기 학교 admin 만: 다른 학교 admin·같은 학교 학생·교사·anon 0행, 직접 update·delete 0행`, async ({}, info) => {
    test.setTimeout(SUCCESS_TIMEOUT);
    const x = await tempSchool(info);
    const y = await tempSchool(info);
    const ex = tempEmail(info);
    const ey = tempEmail(info);
    expect((await rpc(x.admin.client, "invite_members", inviteArgs([ex], "student"))).error).toBeNull();
    expect((await rpc(y.admin.client, "invite_members", inviteArgs([ey], "teacher"))).error).toBeNull();
    const rowsX = await invitesByService(x.id);
    expect(rowsX).toHaveLength(1);

    const seenX = await x.admin.client.from("invites").select("email, school_id");
    expect(seenX.error).toBeNull();
    expect(seenX.data ?? [], "X admin 은 X 초대만").toEqual([{ email: ex, school_id: x.id }]);
    const seenY = await y.admin.client.from("invites").select("email, school_id");
    expect(seenY.data ?? [], "Y admin 은 Y 초대만").toEqual([{ email: ey, school_id: y.id }]);

    // 같은 학교 학생·교사, 공용 계정(학교 A·B), anon 은 0행
    const student = await addMember(x, info);
    const teacher = await addMember(x, info);
    expect((await rpc(x.admin.client, "change_member_role", changeArgs(teacher.id, "teacher"))).error).toBeNull();
    const outsiders: [string, SupabaseClient][] = [
      ["X 학생", await sessionOf(student)],
      ["X 교사", await sessionOf(teacher)],
      ["anon", anonClient()],
    ];
    for (const role of ["student", "teacher", "admin", "schoolB"] as Role[]) outsiders.push([ROLE_LABEL[role], (await signIn(role)).client]);
    for (const [label, client] of outsiders) {
      const r = await client.from("invites").select("id").in("email", [ex, ey]);
      expect(r.error ? [] : r.data ?? [], `${label} 가 보는 X·Y 초대`).toHaveLength(0);
      // 직접 update·delete 도 0행
      const upd = await client.from("invites").update({ role: "teacher" }).in("email", [ex, ey]).select("id");
      expect(changed(upd), `${label} invites update`).toBe(0);
      const del = await client.from("invites").delete().in("email", [ex, ey]).select("id");
      expect(changed(del), `${label} invites delete`).toBe(0);
    }
    // 자기 학교 admin 도 직접 update·delete 는 못 한다 (보이는 행인데도 0행)
    for (const patch of [{ role: "teacher" }, { accepted_at: new Date().toISOString() }, { email: tempEmail(info) }] as Row[]) {
      const upd = await x.admin.client.from("invites").update(patch).eq("email", ex).select("id");
      expect(changed(upd), `X admin invites 직접 update ${JSON.stringify(patch)}`).toBe(0);
    }
    const del = await x.admin.client.from("invites").delete().eq("email", ex).select("id");
    expect(changed(del), "X admin invites 직접 delete").toBe(0);
    expect(await invitesByService(x.id)).toEqual(rowsX);

    // 다른 학교 멤버는 not found (없는 id 와 같은 응답), 대상 그대로
    const ghost = await rpc(y.admin.client, "change_member_role", changeArgs(randomUUID(), "teacher"));
    const cross = await rpc(y.admin.client, "change_member_role", changeArgs(student.id, "teacher"));
    expectRejected(cross, "Y admin → X 멤버 change_member_role", "P0002", "member not found");
    expect(errorShape(cross)).toEqual(errorShape(ghost));
    expectRejected(await rpc(y.admin.client, "remove_member", removeArgs(student.id)), "Y admin → X 멤버 remove_member", "P0002", "member not found");
    expect((await profileByService(student.id))?.role).toBe("student");
    expect((await profileByService(student.id))?.school_id).toBe(x.id);
  });

  for (const inviteRole of INVITE_ROLES) {
    test(`[R-db][S14] 초대(${inviteRole})된 이메일이 그 학교에 가입하면 role = ${inviteRole}, 초대 accepted_at·accepted_user_id 채워짐`, async ({}, info) => {
      test.setTimeout(SUCCESS_TIMEOUT);
      const school = await tempSchool(info);
      const email = tempEmail(info);
      // 대소문자·공백이 달라도 같은 이메일로 본다
      const inv = await rpc(school.admin.client, "invite_members", inviteArgs([` ${email.toUpperCase()} `], inviteRole));
      expect(inv.error, `초대: ${inv.error?.message}`).toBeNull();
      const u = await tempUser(info, email);
      const res = await registerProfile(u.id, school.neis, "S8 초대 가입");
      expect(res.error, `register_profile: ${res.error?.message}`).toBeNull();
      const prof = firstRow(res.data);
      expect(prof?.school_id).toBe(school.id);
      expect(prof?.role, "초대 역할").toBe(inviteRole);
      expect((await profileByService(u.id))?.role).toBe(inviteRole);

      const rows = await invitesByService(school.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].email).toBe(email);
      expect(rows[0].accepted_user_id).toBe(u.id);
      expect(rows[0].accepted_at, "accepted_at").not.toBeNull();
      expect(rows[0].role, "초대 행의 역할은 그대로").toBe(inviteRole);
      // admin 의 대기 목록에서 빠진다
      const pending = await school.admin.client.from("invites").select("id").is("accepted_at", null);
      expect(pending.error).toBeNull();
      expect(pending.data ?? []).toHaveLength(0);
      // 수락된 뒤에는 이미 멤버 — 다시 초대할 수 없다
      expectRejected(
        await rpc(school.admin.client, "invite_members", inviteArgs([email], inviteRole)),
        "수락한 멤버 재초대",
        "23505",
        "already member",
      );
    });
  }

  test(`[R-db][S14] 초대 없는 가입은 student, 학교의 첫 가입자는 admin (다른 사람의 초대는 그대로 대기)`, async ({}, info) => {
    test.setTimeout(SUCCESS_TIMEOUT);
    const school = await tempSchool(info); // 첫 가입자 admin 은 tempSchool 안에서 확인
    expect((await profileByService(school.admin.id))?.role).toBe("admin");
    const invited = tempEmail(info);
    expect((await rpc(school.admin.client, "invite_members", inviteArgs([invited], "teacher"))).error).toBeNull();

    const u = await addMember(school, info); // 초대되지 않은 이메일 → student (addMember 안에서 확인)
    expect((await profileByService(u.id))?.role).toBe("student");
    const rows = await invitesByService(school.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].accepted_at, "다른 사람의 초대는 대기 그대로").toBeNull();
    expect(rows[0].accepted_user_id).toBeNull();
  });

  test(`[N1-db][S14] 다른 학교의 초대는 영향 없음: Y 초대(teacher)가 있어도 X 가입은 student, Y 초대는 대기 그대로`, async ({}, info) => {
    test.setTimeout(SUCCESS_TIMEOUT);
    const x = await tempSchool(info);
    const y = await tempSchool(info);
    const email = tempEmail(info);
    expect((await rpc(y.admin.client, "invite_members", inviteArgs([email], "teacher"))).error).toBeNull();

    const u = await tempUser(info, email);
    const res = await registerProfile(u.id, x.neis, "S8 다른 학교 초대");
    expect(res.error, `register_profile: ${res.error?.message}`).toBeNull();
    expect(firstRow(res.data)?.school_id).toBe(x.id);
    expect(firstRow(res.data)?.role, "다른 학교 초대는 역할에 영향 없음").toBe("student");

    const rowsY = await invitesByService(y.id);
    expect(rowsY).toHaveLength(1);
    expect(rowsY[0].accepted_at, "Y 초대는 대기 그대로").toBeNull();
    expect(rowsY[0].accepted_user_id).toBeNull();
    expect(await invitesByService(x.id)).toHaveLength(0);
    // 이미 프로필이 있는 사용자는 다시 등록되지 않는다 (학교를 바꾸지 않는다) — Y 초대가 있어도
    const second = await registerProfile(u.id, y.neis, "S8 학교 이동 시도");
    expect(second.error, "프로필이 있는 사용자의 register_profile 은 오류여야 함").not.toBeNull();
    expect((await profileByService(u.id))?.school_id).toBe(x.id);
    expect((await invitesByService(y.id))[0].accepted_at).toBeNull();
  });

  test(`[R-db][S14] 내보낸 뒤 다시 등록: 초대가 있으면 초대 역할, 없으면 student (전에 admin 이었어도)`, async ({}, info) => {
    test.setTimeout(SUCCESS_TIMEOUT);
    const school = await tempSchool(info);
    const m = await addMember(school, info);
    expect((await rpc(school.admin.client, "change_member_role", changeArgs(m.id, "admin"))).error).toBeNull();
    expect((await rpc(school.admin.client, "remove_member", removeArgs(m.id))).error).toBeNull();
    expect(await profileByService(m.id)).toBeNull();

    // 초대 없이 다시 등록 → student
    const back = await registerProfile(m.id, school.neis, "S8 재가입");
    expect(back.error, `재등록: ${back.error?.message}`).toBeNull();
    expect(firstRow(back.data)?.role, "전에 admin 이었어도 초대 없으면 student").toBe("student");

    // 다시 내보내고 teacher 로 초대한 뒤 등록 → teacher
    expect((await rpc(school.admin.client, "remove_member", removeArgs(m.id))).error).toBeNull();
    expect((await rpc(school.admin.client, "invite_members", inviteArgs([m.email], "teacher"))).error).toBeNull();
    const invited = await registerProfile(m.id, school.neis, "S8 재가입(초대)");
    expect(invited.error, `초대 후 재등록: ${invited.error?.message}`).toBeNull();
    expect(firstRow(invited.data)?.role).toBe("teacher");
    const rows = await invitesByService(school.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].accepted_user_id).toBe(m.id);
  });
});
