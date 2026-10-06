// 화면 5 추출 API (POST /api/manual/extract) — 권한·입력 검증·키 없음 처리까지 (d7 §13 "테스트").
// - 실제 Gemini 호출은 하지 않는다. 유효한 요청(교사·admin + 올바른 파일 + 조 수)은 서버에 키가 없을 때만 보낸다
//   (키가 있으면 그 테스트는 skip — 키 유무는 테스트 프로세스의 env 와 서버가 읽는 .env* 파일에 이름이 있는지로만 판단, 값은 읽어 쓰지 않는다).
// - 공용 계정(학교 A 학생·교사·admin)의 로그인 상태로 요청만 보낸다. DB 쓰기 없음.
// - 데모 학교 사용자는 만들 수 없어(d7 §5) 데모 거부는 여기서 보지 않는다.
// 기준: harness/d7-data.md §13 (권한·파일·조 수·AI 추출·한도), harness/d5-gates.md R-db(서버 쪽 역할 거부)·C1(가입·비밀번호 API 스펙과 같은 관례: API 입력 검증·응답).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type APIRequestContext, type APIResponse, type Browser, type TestInfo } from "@playwright/test";
import type { Role } from "./db-helpers";
import { openAs } from "./auth-state";

const SCREEN = 5;
const HOME_SCREEN = 13;
const API = "/api/manual/extract";

// ---------- 규칙 (d7 §13) ----------

const D7 = readFileSync(join(process.cwd(), "harness", "d7-data.md"), "utf8");
const d7Row = (head: string): string => {
  const line = D7.split(/\r?\n/).find((l) => l.startsWith(`| ${head} |`));
  if (!line) throw new Error(`harness/d7-data.md §13 에서 '${head}' 행을 찾지 못했습니다`);
  return line;
};

/** "PDF·JPG·PNG 1개, 4MB 이하" */
const FILE_MAX_BYTES = (() => {
  const m = d7Row("파일").match(/(\d+)MB 이하/);
  if (!m) throw new Error("d7 §13 파일 크기 한도를 읽지 못했습니다");
  return Number(m[1]) * 1024 * 1024;
})();

/** "1~20 정수" */
const [GROUPS_MIN, GROUPS_MAX] = (() => {
  const m = d7Row("조 수").match(/(\d+)\s*~\s*(\d+)\s*정수/);
  if (!m) throw new Error("d7 §13 조 수 범위를 읽지 못했습니다");
  return [Number(m[1]), Number(m[2])];
})();

/** 키가 없으면 503 "…" */
const NO_KEY_TEXT = (() => {
  const m = d7Row("AI 추출 (N2)").match(/키가 없으면 503 "([^"]+)"/);
  if (!m) throw new Error("d7 §13 키 없음 문구를 읽지 못했습니다");
  return m[1];
})();

const VALID_GROUPS = "6";

// ---------- 서버에 키가 있는가 (값은 쓰지 않는다) ----------

const KEY_NAME = "GEMINI_API_KEY";

/** next start 가 읽는 env 파일들 + 이 프로세스의 env 에 이름이 (빈 값이 아닌 채로) 있는가 */
const SERVER_HAS_KEY = (() => {
  if ((process.env[KEY_NAME] ?? "").trim() !== "") return true;
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
const HAS_KEY_REASON = "서버에 GEMINI_API_KEY 가 있어 유효한 요청은 실제 Gemini 호출이 된다 — 자동 테스트에서는 보내지 않는다 (d7 §13 테스트)";

// ---------- 파일 ----------

const PDF_HEAD = Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n", "latin1");
const PNG_HEAD = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("0000000DIHDR-e2e-fake-png-body", "latin1")]);
const JPG_HEAD = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from("JFIF\0-e2e-fake-jpg-body", "latin1"), Buffer.from([0xff, 0xd9])]);
const GIF_HEAD = Buffer.from("GIF89a-e2e-fake-gif-body", "latin1");
const DOCX_HEAD = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("-e2e-fake-docx-body", "latin1")]);

/** 앞머리는 PDF 이고 전체 크기가 bytes 인 파일 */
function pdfOf(bytes: number): Buffer {
  const b = Buffer.alloc(bytes, 0x20);
  PDF_HEAD.copy(b, 0);
  return b;
}

type Upload = { name: string; mimeType: string; buffer: Buffer };
const PDF: Upload = { name: "manual.pdf", mimeType: "application/pdf", buffer: PDF_HEAD };
const PNG: Upload = { name: "manual.png", mimeType: "image/png", buffer: PNG_HEAD };
const JPG: Upload = { name: "manual.jpg", mimeType: "image/jpeg", buffer: JPG_HEAD };

// ---------- 요청·응답 ----------

type Body = { ok?: unknown; error?: unknown; code?: unknown; items?: unknown };
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

async function post(request: APIRequestContext, file: Upload | null, groups: string | null): Promise<Got> {
  const multipart: Record<string, string | Upload> = {};
  if (file) multipart.file = file;
  if (groups !== null) multipart.groups = groups;
  return read(await request.post(API, { multipart, failOnStatusCode: false, maxRedirects: 0, timeout: 60_000 }));
}

/** 실패 응답의 공통 모양: 상태 코드 · { ok:false, error(한국어 문구), code } · Cache-Control: no-store · 키·내부 정보 없음 */
function expectFailure(got: Got, what: string, status: number, code?: string | string[]): void {
  expect(got.res.status(), `${what}: HTTP (본문 ${got.text.slice(0, 200)})`).toBe(status);
  expect(got.res.headers()["content-type"] ?? "", `${what}: JSON 응답`).toContain("application/json");
  expect(got.body.ok, `${what}: ok`).toBe(false);
  expect(typeof got.body.error, `${what}: error 는 문자열`).toBe("string");
  const error = got.body.error as string;
  expect(error.trim().length, `${what}: error 는 비어 있지 않음`).toBeGreaterThan(0);
  expect(error, `${what}: error 는 사람이 읽을 한국어 문구`).toMatch(/[가-힣]/);
  expect(typeof got.body.code, `${what}: code 는 문자열`).toBe("string");
  expect((got.body.code as string).length, `${what}: code 는 비어 있지 않음`).toBeGreaterThan(0);
  if (code) expect(Array.isArray(code) ? code : [code], `${what}: code (${String(got.body.code)})`).toContain(got.body.code);
  expect(got.body.items, `${what}: 실패 응답에 items 없음`).toBeUndefined();
  expect(got.res.headers()["cache-control"] ?? "", `${what}: Cache-Control`).toContain("no-store");
  expectNoInternals(got, what);
}

/** 응답 본문·헤더에 키 이름·키 모양·스택 트레이스·내부 경로·AI 서비스 주소가 없다 */
function expectNoInternals(got: Got, what: string): void {
  const all = `${got.text}\n${JSON.stringify(got.res.headers())}`;
  for (const [name, re] of [
    ["키 변수 이름", /GEMINI|API_KEY|SERVICE_ROLE|NEIS_API/i],
    ["Google API 키 모양", /AIza[0-9A-Za-z_-]{10,}/],
    ["스택 트레이스", /\n\s+at\s|\bat\s+\S+\s+\(.*:\d+:\d+\)/],
    ["내부 경로", /node_modules|\.next[\\/]|[A-Za-z]:\\\\|\/lib\/server\//],
    ["AI 서비스 주소", /generativelanguage|googleapis/i],
    ["오류 클래스 이름", /TypeError|ReferenceError|SyntaxError|ECONN|ENOTFOUND/],
  ] as [string, RegExp][]) {
    expect(re.test(all), `${what}: 응답에 ${name} 없음`).toBe(false);
  }
}

/** 공용 계정의 로그인 상태(쿠키)로 API 를 부르는 요청 컨텍스트 */
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
const ROLE_KO: Record<string, string> = { student: "학생", teacher: "교사", admin: "admin" };

// ======================================================================
// 권한 (d7 §13 "권한": 교사·admin만 — 학생은 API 도 없음, 요청마다 로그인·역할 확인)
// ======================================================================

test(`[R-db][S${SCREEN}] 추출 API: 비로그인 401 (유효한 파일·조 수여도), 리다이렉트·세션 쿠키 없음`, async ({ request }) => {
  for (const [what, file, groups] of [
    ["유효한 PDF", PDF, VALID_GROUPS],
    ["파일 없음", null, VALID_GROUPS],
    ["조 수 없음", PNG, null],
  ] as [string, Upload | null, string | null][]) {
    const got = await post(request, file, groups);
    expectFailure(got, `비로그인 (${what})`, 401, "signed-out");
    expect(got.res.headers()["location"], `비로그인 (${what}): 리다이렉트 아님`).toBeUndefined();
  }
  const json = await read(await request.post(API, { data: { groups: 6 }, failOnStatusCode: false, maxRedirects: 0 }));
  expectFailure(json, "비로그인 (JSON 본문)", 401, "signed-out");
});

test(`[R-db][S${SCREEN}] 추출 API: 학생 403 — 유효한 PDF·PNG·JPG, ${FILE_MAX_BYTES / 1024 / 1024 + 1}MB 파일, 잘못된 입력 모두 (본문과 무관하게 역할 거부)`, async ({ browser }, info) => {
  await asRole(browser, info, "student", async (request) => {
    for (const file of [PDF, PNG, JPG]) {
      expectFailure(await post(request, file, VALID_GROUPS), `학생 (유효한 ${file.name})`, 403, "forbidden");
    }
    const big: Upload = { ...PDF, buffer: pdfOf(FILE_MAX_BYTES + 1024 * 1024) };
    expectFailure(await post(request, big, VALID_GROUPS), "학생 (큰 파일)", 403, "forbidden");
    // 입력이 틀려도 학생에게는 검증 결과(400·413)가 아니라 역할 거부가 온다
    expectFailure(await post(request, null, VALID_GROUPS), "학생 (파일 없음)", 403, "forbidden");
    expectFailure(await post(request, PDF, String(GROUPS_MAX + 1)), "학생 (조 수 초과)", 403, "forbidden");
    expectFailure(await post(request, { name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("x") }, VALID_GROUPS), "학생 (.txt)", 403, "forbidden");
    const json = await read(await request.post(API, { data: { groups: 6 }, failOnStatusCode: false, maxRedirects: 0 }));
    expectFailure(json, "학생 (JSON 본문)", 403, "forbidden");
  });
});

// ======================================================================
// 입력 검증 (d7 §13 "파일": PDF·JPG·PNG 1개 4MB 이하 · "조 수": 1~20 정수) — 교사·admin
// ======================================================================

for (const role of STAFF) {
  const who = ROLE_KO[role];

  test(`[C1][S${SCREEN}] 추출 API(${who}): multipart 아님·파일 없음·파일 2개 400`, async ({ browser }, info) => {
    await asRole(browser, info, role, async (request) => {
      const json = await read(await request.post(API, { data: { file: "x", groups: 6 }, failOnStatusCode: false, maxRedirects: 0 }));
      expectFailure(json, `${who} (JSON 본문)`, 400, "bad-request");
      const form = await read(await request.post(API, { form: { groups: VALID_GROUPS }, failOnStatusCode: false, maxRedirects: 0 }));
      expectFailure(form, `${who} (urlencoded 본문)`, 400, "bad-request");
      const raw = await read(
        await request.post(API, { data: PDF_HEAD, headers: { "Content-Type": "application/pdf" }, failOnStatusCode: false, maxRedirects: 0 }),
      );
      expectFailure(raw, `${who} (파일을 본문으로 그대로)`, 400, "bad-request");
      const broken = await read(
        await request.post(API, {
          data: "not a multipart body",
          headers: { "Content-Type": "multipart/form-data; boundary=----e2e" },
          failOnStatusCode: false,
          maxRedirects: 0,
        }),
      );
      expectFailure(broken, `${who} (깨진 multipart)`, 400, ["bad-request", "file"]);

      expectFailure(await post(request, null, VALID_GROUPS), `${who} (파일 없음)`, 400, "file");
      // file 칸에 파일이 아니라 글자
      const text = await read(await request.post(API, { multipart: { file: "manual.pdf", groups: VALID_GROUPS }, failOnStatusCode: false, maxRedirects: 0 }));
      expectFailure(text, `${who} (file 칸이 글자)`, 400, "file");

      // 파일 2개 (d7 §13: 파일 1개)
      const two = new FormData();
      two.append("file", new Blob([new Uint8Array(PDF_HEAD)], { type: "application/pdf" }), "a.pdf");
      two.append("file", new Blob([new Uint8Array(PNG_HEAD)], { type: "image/png" }), "b.png");
      two.append("groups", VALID_GROUPS);
      const twoFiles = await read(await request.post(API, { multipart: two, failOnStatusCode: false, maxRedirects: 0 }));
      expectFailure(twoFiles, `${who} (파일 2개)`, 400, "file");
    });
  });

  test(`[C1][S${SCREEN}] 추출 API(${who}): 허용되지 않는 형식(.txt·.docx·.gif·확장자 없음)·확장자와 내용 불일치·빈 파일 400`, async ({ browser }, info) => {
    await asRole(browser, info, role, async (request) => {
      const bad: [string, Upload][] = [
        [".txt", { name: "manual.txt", mimeType: "text/plain", buffer: Buffer.from("염화 나트륨 5 g") }],
        [".docx", { name: "manual.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: DOCX_HEAD }],
        [".gif", { name: "manual.gif", mimeType: "image/gif", buffer: GIF_HEAD }],
        [".html", { name: "manual.html", mimeType: "text/html", buffer: Buffer.from("<html></html>") }],
        ["확장자 없음", { name: "manual", mimeType: "application/octet-stream", buffer: PDF_HEAD }],
        [".txt 인데 PDF 내용·PDF 형식 표기", { name: "manual.txt", mimeType: "application/pdf", buffer: PDF_HEAD }],
        [".pdf.exe", { name: "manual.pdf.exe", mimeType: "application/pdf", buffer: PDF_HEAD }],
        // 확장자와 내용 불일치 — 이름만 바꾼 파일을 AI 에 보내지 않는다
        ["이름 .pdf 인데 PNG 바이트", { name: "manual.pdf", mimeType: "application/pdf", buffer: PNG_HEAD }],
        ["이름 .pdf 인데 글자", { name: "manual.pdf", mimeType: "application/pdf", buffer: Buffer.from("this is not a pdf file at all, just text") }],
        ["이름 .pdf 인데 docx(zip) 바이트", { name: "manual.pdf", mimeType: "application/pdf", buffer: DOCX_HEAD }],
        ["이름 .png 인데 JPG 바이트", { name: "manual.png", mimeType: "image/png", buffer: JPG_HEAD }],
        ["이름 .png 인데 PDF 바이트", { name: "manual.png", mimeType: "image/png", buffer: PDF_HEAD }],
        ["이름 .jpg 인데 PNG 바이트", { name: "manual.jpg", mimeType: "image/jpeg", buffer: PNG_HEAD }],
        ["이름 .jpg 인데 GIF 바이트", { name: "manual.jpg", mimeType: "image/jpeg", buffer: GIF_HEAD }],
        ["이름 .png 인데 형식 표기는 PDF", { name: "manual.png", mimeType: "application/pdf", buffer: PNG_HEAD }],
        // 빈 파일
        ["빈 .pdf", { name: "manual.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(0) }],
        ["빈 .png", { name: "manual.png", mimeType: "image/png", buffer: Buffer.alloc(0) }],
      ];
      for (const [what, file] of bad) {
        expectFailure(await post(request, file, VALID_GROUPS), `${who} (${what})`, 400, "file");
      }
    });
  });

  test(`[C1][S${SCREEN}] 추출 API(${who}): ${FILE_MAX_BYTES / 1024 / 1024}MB 초과 413 (1바이트 초과·1MB 초과, PDF·PNG)`, async ({ browser }, info) => {
    await asRole(browser, info, role, async (request) => {
      expectFailure(await post(request, { ...PDF, buffer: pdfOf(FILE_MAX_BYTES + 1) }, VALID_GROUPS), `${who} (PDF ${FILE_MAX_BYTES + 1}바이트)`, 413, "too-large");
      expectFailure(await post(request, { ...PDF, buffer: pdfOf(FILE_MAX_BYTES + 1024 * 1024) }, VALID_GROUPS), `${who} (PDF 1MB 초과)`, 413, "too-large");
      const png = Buffer.alloc(FILE_MAX_BYTES + 1, 0x20);
      PNG_HEAD.copy(png, 0);
      expectFailure(await post(request, { ...PNG, buffer: png }, VALID_GROUPS), `${who} (PNG ${FILE_MAX_BYTES + 1}바이트)`, 413, "too-large");
    });
  });

  test(`[C1][S${SCREEN}] 추출 API(${who}): 조 수 ${GROUPS_MIN - 1}·${GROUPS_MAX + 1}·음수·"abc"·"6.5"·빈 값·누락 400`, async ({ browser }, info) => {
    await asRole(browser, info, role, async (request) => {
      const bad: (string | null)[] = [
        String(GROUPS_MIN - 1),
        String(GROUPS_MAX + 1),
        "-1",
        "abc",
        "6.5",
        "6조",
        "1e1",
        "0x06",
        "",
        "   ",
        "999999999999",
        null,
      ];
      for (const groups of bad) {
        for (const file of [PDF, PNG]) {
          expectFailure(await post(request, file, groups), `${who} (조 수 ${groups === null ? "누락" : `"${groups}"`} · ${file.name})`, 400, "groups");
        }
      }
    });
  });
}

// ======================================================================
// 키 없음 (d7 §13 "AI 추출": 키가 없으면 503 "AI 추출을 쓸 수 없어요(서버 설정)") — 키가 있는 서버에서는 보내지 않는다
// ======================================================================

test.describe("유효한 요청 (서버에 키가 없을 때만)", () => {
  test.skip(SERVER_HAS_KEY, HAS_KEY_REASON);

  for (const role of STAFF) {
    const who = ROLE_KO[role];

    test(`[C1][S${SCREEN}] 추출 API(${who}): 유효한 PDF·PNG·JPG(.jpeg 포함) + 조 수 ${GROUPS_MIN}·6·${GROUPS_MAX} → 키 없는 서버는 503 "${NO_KEY_TEXT}"`, async ({ browser }, info) => {
      await asRole(browser, info, role, async (request) => {
        const files: Upload[] = [
          PDF,
          PNG,
          JPG,
          { name: "manual.jpeg", mimeType: "image/jpeg", buffer: JPG_HEAD },
          { name: "MANUAL.PDF", mimeType: "application/pdf", buffer: PDF_HEAD },
          { name: "실험 매뉴얼 (3단원).pdf", mimeType: "application/pdf", buffer: PDF_HEAD },
        ];
        for (const file of files) {
          const got = await post(request, file, VALID_GROUPS);
          expectFailure(got, `${who} (유효한 ${file.name})`, 503, "no-key");
          expect(got.body.error, `${who} (유효한 ${file.name}): d7 §13 문구`).toBe(NO_KEY_TEXT);
        }
        for (const groups of [String(GROUPS_MIN), String(GROUPS_MAX)]) {
          const got = await post(request, PDF, groups);
          expectFailure(got, `${who} (조 수 ${groups})`, 503, "no-key");
          expect(got.body.error).toBe(NO_KEY_TEXT);
        }
      });
    });

    test(`[C1][S${SCREEN}] 추출 API(${who}): 정확히 ${FILE_MAX_BYTES / 1024 / 1024}MB 파일은 크기 거부(413)가 아님 — 키 없는 서버는 503`, async ({ browser }, info) => {
      await asRole(browser, info, role, async (request) => {
        const got = await post(request, { ...PDF, buffer: pdfOf(FILE_MAX_BYTES) }, VALID_GROUPS);
        expectFailure(got, `${who} (PDF ${FILE_MAX_BYTES}바이트)`, 503, "no-key");
        expect(got.body.error).toBe(NO_KEY_TEXT);
      });
    });
  }

  test(`[C1][S${SCREEN}] 추출 API: 키 없는 서버는 연속 요청에도 같은 503 (추출 결과·items 를 지어내지 않음)`, async ({ browser }, info) => {
    await asRole(browser, info, "teacher", async (request) => {
      for (let i = 0; i < 8; i++) {
        const got = await post(request, PDF, VALID_GROUPS);
        expectFailure(got, `교사 (${i + 1}번째 요청)`, 503, "no-key");
        expect(got.body.error).toBe(NO_KEY_TEXT);
      }
    });
  });
});

// ======================================================================
// 다른 메서드
// ======================================================================

test(`[C1][S${SCREEN}] 추출 API: GET·PUT·PATCH·DELETE 405 (POST 만) — 본문에 내부 정보 없음`, async ({ browser }, info) => {
  await asRole(browser, info, "teacher", async (request) => {
    for (const method of ["GET", "PUT", "PATCH", "DELETE"] as const) {
      const res = await request.fetch(API, { method, failOnStatusCode: false, maxRedirects: 0 });
      expect(res.status(), `${method} ${API}`).toBe(405);
      expectNoInternals(await read(res), `${method} ${API}`);
    }
  });
});
