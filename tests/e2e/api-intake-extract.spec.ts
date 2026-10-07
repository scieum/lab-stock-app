// [R-db][S7] · [N2][S7] — POST /api/intake/extract (harness/d7-data.md §21 추출 API · 테스트 줄, §13 과 같은 키·모델).
// - 실제 Gemini 호출은 하지 않는다. 유효한 요청(교사·admin + 올바른 파일)은 서버에 키가 없을 때만 보낸다
//   (키가 있으면 그 테스트는 skip — 키 유무는 env 와 서버가 읽는 .env* 파일에 이름이 (빈 값 아닌 채로) 있는지로만 본다. 값은 쓰지 않는다).
// - 공용 계정(학교 A 학생·교사·admin)의 로그인 상태로 요청만 보낸다 (DB 쓰기 없음).
//   소속 학교 없는 로그인 계정(403)은 service role 로 만든 일회용 계정 (끝나면 지움, 잔여 0).
// - 판정 순서 (d7 §21 "로그인·교사·admin·자기 학교 확인, 형식·크기 검증" → 키 없음 503):
//   비로그인 401 → 학생 403(본문을 읽기 전 — 큰 본문·잘못된 본문에도 403) → 소속 없음 403 → 크기 413 → 형식 400 → 키 없음 503.
// - 응답에 키·키 이름·외부(AI) 주소·내부 경로 없음 (N2).
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type APIRequestContext, type APIResponse, type Browser, type TestInfo } from "@playwright/test";
import type { Role } from "./db-helpers";
import { openAs } from "./auth-state";
import { rules } from "./screen-helpers";
import { HAS_SERVICE, service, sweep, tempEmail, NO_RESIDUE, contextFor, type TempUser } from "./screen-8-helpers";

const SCREEN = 7;
const HOME_SCREEN = 13;
const API = "/api/intake/extract";
const GROUP = "docapi";

// ---------- 규칙 ----------
const D7 = readFileSync(join(process.cwd(), "harness", "d7-data.md"), "utf8");
const S21 = D7.slice(D7.indexOf("## 21."), D7.indexOf("\n## ", D7.indexOf("## 21.") + 5));
const S13 = D7.slice(D7.indexOf("## 13."), D7.indexOf("\n## ", D7.indexOf("## 13.") + 5));
const INTAKE = (rules as unknown as { intake: { max_mb: number; file_types: string[] } }).intake;
const MAX_BYTES = INTAKE.max_mb * 1024 * 1024;
/** §21 "키·모델은 §13 과 같은" → §13 키 없음 503 문구 */
const NO_KEY_TEXT = (/키가 없으면 503 "([^"]+)"/.exec(S13) ?? [])[1] ?? "";
const N2 = (rules as unknown as { never: { N2: { banned_terms: string[]; key_value_pattern: string } } }).never.N2;
const KEY_LIKE = new RegExp(N2.key_value_pattern);

const SERVER_HAS_KEY = (() => {
  if ((process.env.GEMINI_API_KEY ?? "").trim() !== "") return true;
  for (const name of [".env", ".env.local", ".env.production", ".env.production.local"]) {
    const file = join(process.cwd(), name);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?GEMINI_API_KEY\s*=\s*(.*)$/.exec(line);
      if (m && m[1].trim().replace(/^["']|["']$/g, "") !== "") return true;
    }
  }
  return false;
})();
const HAS_KEY_REASON = "서버에 GEMINI_API_KEY 가 있어 유효한 요청은 실제 Gemini 호출이 된다 — 자동 테스트에서는 보내지 않는다 (d7 §21 테스트)";

// ---------- 파일 ----------
const PDF_HEAD = Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n", "latin1");
const PNG_HEAD = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("0000000DIHDR-e2e-fake-png-body", "latin1")]);
const JPG_HEAD = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from("JFIF\0-e2e-fake-jpg-body", "latin1"), Buffer.from([0xff, 0xd9])]);
const GIF_HEAD = Buffer.from("GIF89a-e2e-fake-gif-body", "latin1");
const DOCX_HEAD = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("-e2e-fake-docx-body", "latin1")]);
const pdfOf = (bytes: number) => {
  const b = Buffer.alloc(bytes, 0x20);
  PDF_HEAD.copy(b, 0);
  return b;
};
type Upload = { name: string; mimeType: string; buffer: Buffer };
const PDF: Upload = { name: "거래명세서.pdf", mimeType: "application/pdf", buffer: PDF_HEAD };
const PNG: Upload = { name: "영수증.png", mimeType: "image/png", buffer: PNG_HEAD };
const JPG: Upload = { name: "품의서.jpg", mimeType: "image/jpeg", buffer: JPG_HEAD };

// ---------- 요청·응답 ----------
type Body = { ok?: unknown; error?: unknown; code?: unknown; items?: unknown; docDate?: unknown };
type Got = { res: APIResponse; text: string; body: Body };
async function read(res: APIResponse): Promise<Got> {
  const text = await res.text();
  let body: Body = {};
  try {
    body = JSON.parse(text) as Body;
  } catch {
    body = {};
  }
  return { res, text, body };
}
const post = async (request: APIRequestContext, file: Upload | null): Promise<Got> =>
  read(await request.post(API, { multipart: file ? { file } : { note: "x" }, failOnStatusCode: false, maxRedirects: 0, timeout: 60_000 }));
const postJson = async (request: APIRequestContext, data: unknown): Promise<Got> =>
  read(await request.post(API, { data, failOnStatusCode: false, maxRedirects: 0, timeout: 60_000 }));

/** 응답 본문·헤더에 키·키 이름·키 모양·AI 서비스 주소·스택·내부 경로·N2 금지어 없음 */
function expectNoInternals(got: Got, what: string): void {
  const all = `${got.text}\n${JSON.stringify(got.res.headers())}`;
  for (const [name, re] of [
    ["키 변수 이름", /GEMINI|API_KEY|SERVICE_ROLE|NEIS_API|KOSHA/i],
    ["Google API 키 모양", /AIza[0-9A-Za-z_-]{10,}/],
    ["32자리 16진수 키 모양 (rules never.N2.key_value_pattern)", KEY_LIKE],
    ["AI 서비스 주소", /generativelanguage|googleapis|gemini/i],
    ["스택 트레이스", /\n\s+at\s|\bat\s+\S+\s+\(.*:\d+:\d+\)/],
    ["내부 경로", /node_modules|\.next[\\/]|[A-Za-z]:\\\\|\/lib\/server\//],
    ["오류 클래스 이름", /TypeError|ReferenceError|SyntaxError|ECONN|ENOTFOUND/],
  ] as [string, RegExp][]) {
    expect(re.test(all), `${what}: 응답에 ${name} 없음`).toBe(false);
  }
  const lower = got.text.toLowerCase();
  expect(N2.banned_terms.filter((t) => lower.includes(t.toLowerCase())), `${what}: N2 금지어 0`).toEqual([]);
}

/** 실패 응답: 상태 · { ok:false, error(한국어), code } · no-store · items 없음 · 내부 정보 없음 */
function expectFailure(got: Got, what: string, status: number, code?: string | string[]): void {
  expect(got.res.status(), `${what}: HTTP (본문 ${got.text.slice(0, 200)})`).toBe(status);
  expect(got.res.headers()["content-type"] ?? "", `${what}: JSON`).toContain("application/json");
  expect(got.body.ok, `${what}: ok`).toBe(false);
  expect(String(got.body.error ?? ""), `${what}: 사람이 읽을 한국어 문구`).toMatch(/[가-힣]/);
  expect(typeof got.body.code, `${what}: code`).toBe("string");
  if (code) expect(Array.isArray(code) ? code : [code], `${what}: code (${String(got.body.code)})`).toContain(got.body.code);
  expect(got.body.items, `${what}: 실패 응답에 items 없음`).toBeUndefined();
  expect(got.res.headers()["cache-control"] ?? "", `${what}: Cache-Control`).toContain("no-store");
  expect(got.res.headers()["location"], `${what}: 리다이렉트 아님`).toBeUndefined();
  expectNoInternals(got, what);
}

async function asRole<T>(browser: Browser, info: TestInfo, role: Role, fn: (request: APIRequestContext) => Promise<T>): Promise<T> {
  test.setTimeout(180_000);
  const { context } = await openAs(browser, info, role, HOME_SCREEN);
  try {
    return await fn(context.request);
  } finally {
    await context.close();
  }
}

const STAFF: Role[] = ["teacher", "admin"];
const KO: Record<string, string> = { student: "학생", teacher: "교사", admin: "admin" };

test("[N2][S7] 전제: rules intake 파일 한도·형식, d7 §13 키 없음 문구를 읽었다", () => {
  expect(MAX_BYTES).toBeGreaterThan(0);
  expect(INTAKE.file_types).toEqual(["PDF", "JPG", "PNG"]);
  expect(NO_KEY_TEXT).toMatch(/[가-힣]/);
  expect(S21, "§21 이 §13 과 같은 키(GEMINI_API_KEY)를 쓴다고 적혀 있음").toContain("GEMINI_API_KEY");
});

// ====================================================================== 401 · 403

test(`[R-db][S7] ${API}: 비로그인 401 (유효한 PDF·파일 없음·JSON·${INTAKE.max_mb}MB 초과 본문 모두) · 키·내부 정보 없음`, async ({ request }) => {
  expectFailure(await post(request, PDF), "비로그인 (유효한 PDF)", 401, "signed-out");
  expectFailure(await post(request, null), "비로그인 (파일 없음)", 401, "signed-out");
  expectFailure(await postJson(request, { file: "x" }), "비로그인 (JSON)", 401, "signed-out");
  expectFailure(await post(request, { ...PDF, buffer: pdfOf(MAX_BYTES + 1024 * 1024) }), "비로그인 (큰 PDF)", 401, "signed-out");
});

test(`[R-db][S7] ${API}: 학교 A 학생 403 — 본문을 읽기 전 (유효한 PDF·PNG·JPG, ${INTAKE.max_mb}MB 초과, 파일 없음, .txt, JSON 모두 403 forbidden)`, async ({ browser }, info) => {
  await asRole(browser, info, "student", async (request) => {
    for (const f of [PDF, PNG, JPG]) expectFailure(await post(request, f), `학생 (유효한 ${f.name})`, 403, "forbidden");
    expectFailure(await post(request, { ...PDF, buffer: pdfOf(MAX_BYTES + 1024 * 1024) }), "학생 (큰 파일 — 413 이 아니라 403)", 403, "forbidden");
    expectFailure(await post(request, null), "학생 (파일 없음 — 400 이 아니라 403)", 403, "forbidden");
    expectFailure(await post(request, { name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("x") }), "학생 (.txt)", 403, "forbidden");
    expectFailure(await postJson(request, { items: [] }), "학생 (JSON)", 403, "forbidden");
  });
});

test.describe("소속 학교 없는 로그인 계정", () => {
  test.skip(!HAS_SERVICE, "SUPABASE_SERVICE_ROLE_KEY 가 없어 일회용 계정을 만들 수 없음 (.env.local 에 키를 넣으면 실행된다)");
  test.afterAll(async ({}, info) => {
    info.setTimeout(120_000);
    expect(await sweep(GROUP, info.project.name), "일회용 계정 잔여물").toEqual(NO_RESIDUE);
  });

  test(`[R-db][S7] ${API}: 프로필(학교) 없는 로그인 계정 403 — 유효한 PDF·큰 파일 모두 (학교 확인)`, async ({ browser }, info) => {
    test.setTimeout(180_000);
    const email = tempEmail(info, GROUP, "noschool-");
    const password = `Pw-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const made = await service().auth.admin.createUser({ email, password, email_confirm: true });
    expect(made.error, `준비: 계정 (${made.error?.message})`).toBeNull();
    const u: TempUser = { id: made.data.user!.id, email, password, name: "소속없음" };
    const prof = await service().from("profiles").select("user_id").eq("user_id", u.id);
    expect(prof.data ?? [], "전제: 프로필 0행").toHaveLength(0);
    const context = await contextFor(browser, info, u);
    try {
      expectFailure(await post(context.request, PDF), "소속 없음 (유효한 PDF)", 403, "forbidden");
      expectFailure(await post(context.request, { ...PDF, buffer: pdfOf(MAX_BYTES + 1024 * 1024) }), "소속 없음 (큰 파일)", 403, "forbidden");
    } finally {
      await context.close();
    }
  });
});

// ====================================================================== 413 · 400 (교사·admin)

for (const role of STAFF) {
  const who = KO[role];

  test(`[N2][S7] ${API}(${who}): ${INTAKE.max_mb}MB 초과 413 — 파일 1바이트 초과·1MB 초과(PDF·PNG), 큰 JSON 본문도 형식 검사보다 먼저 413`, async ({ browser }, info) => {
    await asRole(browser, info, role, async (request) => {
      expectFailure(await post(request, { ...PDF, buffer: pdfOf(MAX_BYTES + 1) }), `${who} (PDF ${MAX_BYTES + 1}B)`, 413, "too-large");
      expectFailure(await post(request, { ...PDF, buffer: pdfOf(MAX_BYTES + 1024 * 1024) }), `${who} (PDF +1MB)`, 413, "too-large");
      const png = Buffer.alloc(MAX_BYTES + 1, 0x20);
      PNG_HEAD.copy(png, 0);
      expectFailure(await post(request, { ...PNG, buffer: png }), `${who} (PNG ${MAX_BYTES + 1}B)`, 413, "too-large");
      const bigJson = await read(
        await request.post(API, { data: Buffer.alloc(MAX_BYTES + 1024 * 1024, 0x61), headers: { "Content-Type": "application/json" }, failOnStatusCode: false, maxRedirects: 0 }),
      );
      expectFailure(bigJson, `${who} (큰 JSON 본문)`, 413, "too-large");
    });
  });

  test(`[N2][S7] ${API}(${who}): 형식 400 — multipart 아님(JSON·urlencoded·파일 그대로)·깨진 multipart·파일 없음·file 칸이 글자·파일 2개·허용 밖 형식·이름과 내용 불일치·빈 파일 (키 검사보다 먼저 — 503 아님)`, async ({ browser }, info) => {
    await asRole(browser, info, role, async (request) => {
      expectFailure(await postJson(request, { file: "x" }), `${who} (JSON)`, 400, "bad-request");
      expectFailure(await read(await request.post(API, { form: { file: "x" }, failOnStatusCode: false, maxRedirects: 0 })), `${who} (urlencoded)`, 400, "bad-request");
      expectFailure(
        await read(await request.post(API, { data: PDF_HEAD, headers: { "Content-Type": "application/pdf" }, failOnStatusCode: false, maxRedirects: 0 })),
        `${who} (파일을 본문 그대로)`,
        400,
        "bad-request",
      );
      expectFailure(
        await read(await request.post(API, { data: "not multipart", headers: { "Content-Type": "multipart/form-data; boundary=----e2e" }, failOnStatusCode: false, maxRedirects: 0 })),
        `${who} (깨진 multipart)`,
        400,
        ["bad-request", "file"],
      );
      expectFailure(await post(request, null), `${who} (파일 없음)`, 400, "file");
      expectFailure(await read(await request.post(API, { multipart: { file: "서류.pdf" }, failOnStatusCode: false, maxRedirects: 0 })), `${who} (file 칸이 글자)`, 400, "file");
      const two = new FormData();
      two.append("file", new Blob([new Uint8Array(PDF_HEAD)], { type: "application/pdf" }), "a.pdf");
      two.append("file", new Blob([new Uint8Array(PNG_HEAD)], { type: "image/png" }), "b.png");
      expectFailure(await read(await request.post(API, { multipart: two, failOnStatusCode: false, maxRedirects: 0 })), `${who} (파일 2개)`, 400, "file");
      const bad: [string, Upload][] = [
        [".txt", { name: "서류.txt", mimeType: "text/plain", buffer: Buffer.from("염산 500mL 4병") }],
        [".docx", { name: "서류.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: DOCX_HEAD }],
        [".gif", { name: "서류.gif", mimeType: "image/gif", buffer: GIF_HEAD }],
        ["확장자 없음", { name: "서류", mimeType: "application/octet-stream", buffer: PDF_HEAD }],
        [".pdf.exe", { name: "서류.pdf.exe", mimeType: "application/pdf", buffer: PDF_HEAD }],
        ["이름 .pdf 인데 PNG 바이트", { name: "서류.pdf", mimeType: "application/pdf", buffer: PNG_HEAD }],
        ["이름 .pdf 인데 글자", { name: "서류.pdf", mimeType: "application/pdf", buffer: Buffer.from("this is not a pdf at all") }],
        ["이름 .png 인데 JPG 바이트", { name: "서류.png", mimeType: "image/png", buffer: JPG_HEAD }],
        ["이름 .jpg 인데 GIF 바이트", { name: "서류.jpg", mimeType: "image/jpeg", buffer: GIF_HEAD }],
        ["빈 .pdf", { name: "서류.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(0) }],
      ];
      for (const [what, f] of bad) expectFailure(await post(request, f), `${who} (${what})`, 400, "file");
    });
  });
}

// ====================================================================== 키 없음 503

test.describe("유효한 요청 (서버에 키가 없을 때만)", () => {
  test.skip(SERVER_HAS_KEY, HAS_KEY_REASON);
  for (const role of STAFF) {
    const who = KO[role];
    test(`[N2][S7] ${API}(${who}): 유효한 PDF·PNG·JPG·.jpeg·대문자 확장자·정확히 ${INTAKE.max_mb}MB → 키 없는 서버는 503 "${NO_KEY_TEXT}" (추출 결과를 지어내지 않음)`, async ({ browser }, info) => {
      await asRole(browser, info, role, async (request) => {
        const files: Upload[] = [
          PDF,
          PNG,
          JPG,
          { name: "명세서.jpeg", mimeType: "image/jpeg", buffer: JPG_HEAD },
          { name: "SCAN.PDF", mimeType: "application/pdf", buffer: PDF_HEAD },
          { ...PDF, name: "4MB.pdf", buffer: pdfOf(MAX_BYTES) },
        ];
        for (const f of files) {
          const got = await post(request, f);
          expectFailure(got, `${who} (유효한 ${f.name})`, 503, "no-key");
          expect(got.body.error, `${who} (${f.name}): d7 §13 문구`).toBe(NO_KEY_TEXT);
          expect(got.body.docDate, "docDate 없음").toBeUndefined();
        }
      });
    });
  }
});

test(`[N2][S7] ${API}: GET·PUT·DELETE 405 (POST 만) — 본문에 내부 정보 없음`, async ({ browser }, info) => {
  await asRole(browser, info, "teacher", async (request) => {
    for (const method of ["GET", "PUT", "DELETE"] as const) {
      const got = await read(await request.fetch(API, { method, failOnStatusCode: false, maxRedirects: 0 }));
      expect(got.res.status(), `${method} ${API}`).toBe(405);
      expectNoInternals(got, `${method} ${API}`);
    }
  });
});

test(`[N2][S7] 클라이언트 번들(.next/static)에 GEMINI_API_KEY 이름·AI 서비스 주소 없음 · 화면 7 은 ${API} 만 부른다`, () => {
  const root = join(process.cwd(), ".next", "static");
  expect(existsSync(root), "빌드 결과 .next/static (npm run build 뒤)").toBe(true);
  const files: string[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".js")) files.push(p);
    }
  };
  walk(root);
  let callsApi = false;
  for (const f of files) {
    const t = readFileSync(f, "utf8");
    expect(/GEMINI_API_KEY|generativelanguage\.googleapis/.test(t), `${f}: 키 이름·AI 주소`).toBe(false);
    if (t.includes(API)) callsApi = true;
  }
  expect(callsApi, `번들 어딘가에 ${API} 호출`).toBe(true);
});
