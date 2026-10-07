import { NextResponse, type NextRequest } from "next/server";
import { getManualAccess } from "@/lib/supabase/manual";
import { extractDocumentIntake, isExtractionConfigured } from "@/lib/server/gemini";
import { createRateLimiter } from "@/lib/rate-limit";
import type { DocExtraction } from "@/lib/doc-intake-rules";
import { MANUAL_FILE_ERRORS, MANUAL_FILE_MAX_BYTES, manualFileMime, validateManualFile } from "@/lib/manual-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Gemini 응답 대기(45초) + 여유. Vercel 함수 실행 한도(초) */
export const maxDuration = 60;

/** multipart 경계·필드 이름 등 파일 밖의 몫 (본문 전체 한도 = 파일 4MB + 이 값 — Vercel 요청 한도 4.5MB 아래) */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const BODY_MAX_BYTES = MANUAL_FILE_MAX_BYTES + MULTIPART_OVERHEAD_BYTES;

/**
 * 사용자당 분당 5회 (d7 §13 의 한도를 서류 추출에도). 이 서버 인스턴스 메모리의 카운터 (lib/rate-limit.ts 주석).
 * Gemini 를 실제로 부르기 직전에만 센다.
 */
const limiter = createRateLimiter(5, 60_000);

export type IntakeExtractCode =
  | "signed-out"
  | "forbidden"
  | "unavailable"
  | "too-large"
  | "bad-request"
  | "file"
  | "rate-limit"
  | "no-key"
  | "timeout"
  | "upstream"
  | "blocked"
  | "parse";

export type IntakeExtractResponse =
  | ({ ok: true } & DocExtraction)
  | { ok: false; error: string; code: IntakeExtractCode };

const NO_STORE = { "Cache-Control": "no-store" };
const NO_KEY = "AI 추출을 쓸 수 없어요(서버 설정)";
const FILE_COUNT = "서류 파일을 1개 올려 주세요";

function fail(status: number, code: IntakeExtractCode, error: string, headers: Record<string, string> = {}) {
  return NextResponse.json<IntakeExtractResponse>({ ok: false, error, code }, { status, headers: { ...NO_STORE, ...headers } });
}

function ok(extraction: DocExtraction) {
  return NextResponse.json<IntakeExtractResponse>({ ok: true, ...extraction }, { headers: NO_STORE });
}

/** 파일 앞머리가 그 형식이 맞는가 (확장자만 바꾼 파일을 AI 에 보내지 않는다 — /api/manual/extract 와 같은 검사) */
function hasMagic(bytes: Uint8Array, mime: string): boolean {
  const starts = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (mime === "application/pdf") return Buffer.from(bytes.subarray(0, 1024)).toString("latin1").includes("%PDF-");
  if (mime === "image/jpeg") return starts([0xff, 0xd8, 0xff]);
  if (mime === "image/png") return starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return false;
}

/**
 * POST /api/intake/extract — 화면 7 서류로 입고 "AI로 읽기" (d7 §21)
 * 요청: multipart/form-data — file(PDF·JPG·PNG 1개, 4MB 이하)
 * 응답: { ok: true, docDate, items: [{ name, spec, specAmount, specUnit, quantity, quantityUnit, isReagent, suggestedClass }] }
 *       / { ok: false, error, code }. 품목을 못 찾으면 200 + items [] (화면이 "서류에서 품목을 찾지 못했어요"를 보여 준다).
 * 순서: 로그인(401) → 역할(학생 403 — 본문을 읽기 전에) → 학교·데모(403) → 본문 크기(413) → 파일(400·413)
 *       → 키 설정(503) → 호출 제한(429) → Gemini(502·504·422).
 * 파일은 이 요청 동안 메모리에서만 쓰고 저장하지 않는다. 로그에 파일 이름·내용을 남기지 않는다.
 * 시약 연결·입고량 계산은 화면이 한다(lib/doc-intake-rules) — 여기서는 정리한 추출 결과만 돌려준다.
 */
export async function POST(req: NextRequest) {
  const access = await getManualAccess();
  if (access.kind === "signed-out") return fail(401, "signed-out", "다시 로그인해 주세요");
  if (access.kind === "unavailable") return fail(503, "unavailable", "계정 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요");
  if (access.kind !== "ok") return fail(403, "forbidden", "서류로 입고는 교사·관리자만 쓸 수 있어요");

  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > BODY_MAX_BYTES) return fail(413, "too-large", MANUAL_FILE_ERRORS.size);

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return fail(400, "bad-request", "요청 형식이 올바르지 않아요");
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "bad-request", "요청 형식이 올바르지 않아요");
  }

  const files = form.getAll("file");
  const file = files[0];
  if (files.length !== 1 || !(file instanceof File)) return fail(400, "file", FILE_COUNT);

  const fileError = validateManualFile({ name: file.name, type: file.type, size: file.size });
  if (fileError) {
    return fileError === MANUAL_FILE_ERRORS.size ? fail(413, "too-large", fileError) : fail(400, "file", fileError);
  }
  const mime = manualFileMime({ name: file.name, type: file.type });
  if (!mime) return fail(400, "file", MANUAL_FILE_ERRORS.type);

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength === 0) return fail(400, "file", MANUAL_FILE_ERRORS.empty);
  if (bytes.byteLength > MANUAL_FILE_MAX_BYTES) return fail(413, "too-large", MANUAL_FILE_ERRORS.size);
  if (!hasMagic(bytes, mime)) return fail(400, "file", MANUAL_FILE_ERRORS.type);

  if (!isExtractionConfigured()) return fail(503, "no-key", NO_KEY);

  const allowed = limiter.take(access.userId);
  if (!allowed.ok) {
    return fail(429, "rate-limit", `요청이 너무 잦아요. ${allowed.retryAfterSeconds}초 뒤에 다시 시도해 주세요`, {
      "Retry-After": String(allowed.retryAfterSeconds),
    });
  }

  const result = await extractDocumentIntake({ bytes, mimeType: mime });
  if (result.ok) return ok(result.extraction);

  switch (result.code) {
    case "empty":
      return ok({ docDate: null, items: [] });
    case "no-key":
      return fail(503, "no-key", NO_KEY);
    case "timeout":
      return fail(504, "timeout", "AI 추출이 시간 안에 끝나지 않았어요. 다시 시도해 주세요");
    case "blocked":
      return fail(422, "blocked", "AI 가 이 파일을 읽지 못했어요. 다른 파일로 시도해 주세요");
    case "parse":
      return fail(502, "parse", "AI 가 서류를 정리하지 못했어요. 다시 읽어 주세요");
    default:
      return fail(502, "upstream", "AI 추출에 실패했어요. 잠시 후 다시 시도해 주세요");
  }
}
