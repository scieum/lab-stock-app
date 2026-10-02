#!/usr/bin/env node
// 테스트 계정 4개 (학교 A 학생·교사·admin, 학교 B 교사).
//
//   node scripts/seed-test-users.mjs --env     .env.local에 TEST_* 이메일·비밀번호가 없으면 무작위로 만들어 추가
//   node scripts/seed-test-users.mjs --create  SUPABASE_SERVICE_ROLE_KEY로 auth 계정 생성 + profiles 연결
//   node scripts/seed-test-users.mjs --check   publishable 키로 4개 계정 로그인 확인
//
// 비밀번호·키 값은 출력하지 않는다. 학교 id는 supabase/seed.sql 의 고정 값.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(import.meta.dirname, "..");
const ENV_FILE = resolve(ROOT, ".env.local");
const SCHOOL_A = "a0000000-0000-4000-8000-000000000001";
const SCHOOL_B = "b0000000-0000-4000-8000-000000000001";

export const ACCOUNTS = [
  { prefix: "TEST_STUDENT", role: "student", school: SCHOOL_A, name: "테스트 학생" },
  { prefix: "TEST_TEACHER", role: "teacher", school: SCHOOL_A, name: "테스트 교사" },
  { prefix: "TEST_ADMIN", role: "admin", school: SCHOOL_A, name: "테스트 관리자" },
  { prefix: "TEST_SCHOOL_B", role: "teacher", school: SCHOOL_B, name: "B학교 교사" },
];

function readEnv() {
  const env = {};
  if (existsSync(ENV_FILE)) {
    for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
      const i = line.indexOf("=");
      if (i > 0 && !line.trimStart().startsWith("#")) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return { ...env, ...process.env };
}

function ensureEnv() {
  const env = readEnv();
  const lines = [];
  for (const a of ACCOUNTS) {
    if (!env[`${a.prefix}_EMAIL`]) {
      lines.push(`${a.prefix}_EMAIL=${a.role}.${randomBytes(4).toString("hex")}@labstock-test.dev`);
    }
    if (!env[`${a.prefix}_PASSWORD`]) {
      lines.push(`${a.prefix}_PASSWORD=${randomBytes(18).toString("base64url")}`);
    }
  }
  if (lines.length) {
    const prev = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
    appendFileSync(ENV_FILE, (prev && !prev.endsWith("\n") ? "\n" : "") + lines.join("\n") + "\n");
  }
  console.log(`env: ${lines.length}개 항목 추가 (값은 출력하지 않음)`);
}

async function create() {
  const env = readEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.");
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  for (const a of ACCOUNTS) {
    const email = env[`${a.prefix}_EMAIL`];
    const password = env[`${a.prefix}_PASSWORD`];
    if (!email || !password) throw new Error(`${a.prefix}_EMAIL/PASSWORD 없음 (--env 먼저)`);
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error && !/already/i.test(error.message)) throw error;
    let userId = data?.user?.id;
    if (!userId) {
      const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
      userId = list.users.find((u) => u.email === email)?.id;
    }
    const { error: pErr } = await admin
      .from("profiles")
      .upsert({ user_id: userId, school_id: a.school, role: a.role, display_name: a.name });
    if (pErr) throw pErr;
    console.log(`${a.prefix}: ok`);
  }
}

async function check() {
  const env = readEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let fail = 0;
  for (const a of ACCOUNTS) {
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await sb.auth.signInWithPassword({
      email: env[`${a.prefix}_EMAIL`],
      password: env[`${a.prefix}_PASSWORD`],
    });
    if (error) {
      fail++;
      console.log(`${a.prefix}: 로그인 실패 (${error.message})`);
      continue;
    }
    const { data: prof } = await sb.from("profiles").select("role, school_id").eq("user_id", data.user.id).single();
    const { count } = await sb.from("reagents").select("id", { count: "exact", head: true });
    const ok = prof?.role === a.role && prof?.school_id === a.school;
    if (!ok) fail++;
    console.log(`${a.prefix}: 로그인 ok · role=${prof?.role} · 학교 일치=${ok} · 보이는 시약 ${count}`);
  }
  process.exit(fail ? 1 : 0);
}

const mode = process.argv[2];
if (mode === "--env") ensureEnv();
else if (mode === "--create") await create();
else if (mode === "--check") await check();
else {
  console.log("사용: --env | --create | --check");
  process.exit(2);
}
