// 게시판 운영자 확인 · 운영자 API 권한 (화면 20, harness/d7-data.md §30 '운영자').
// 기준: 서버 환경변수 BOARD_OPERATOR_EMAIL 과 로그인 이메일이 같으면 운영자, 값이 비면 운영자 없음(운영자 기능 전부 403),
//   운영자 쓰기(FAQ 작성·수정·삭제, 답변, 숨기기)는 app/api/board/** 에서 운영자 확인 뒤에만. 로그인 안 함 = 401.
// 세션은 가짜(getServerClient().auth.getClaims), service role 쓰기(lib/server/board-admin)는 호출 기록만 하는 가짜.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  claims: null as Record<string, unknown> | null,
  adminCalls: [] as string[],
}));

vi.mock("@/lib/supabase/server", () => ({
  getServerClient: async () => ({
    auth: { getClaims: async () => ({ data: h.claims ? { claims: h.claims } : null, error: null }) },
  }),
}));

vi.mock("@/lib/server/board-admin", () => {
  const ok = (name: string) => async () => {
    h.adminCalls.push(name);
    return { ok: true, data: { id: "00000000-0000-4000-8000-000000000001" } };
  };
  return {
    createFaq: ok("createFaq"),
    updateFaq: ok("updateFaq"),
    deleteFaq: ok("deleteFaq"),
    saveAnswer: ok("saveAnswer"),
    setPostHidden: ok("setPostHidden"),
  };
});
vi.mock("@/lib/server/board-route", () => import("../../lib/server/board-route"));
vi.mock("@/lib/board", () => import("../../lib/board"));

import { getBoardOperator, isBoardOperator, isBoardOperatorEmail } from "../../lib/server/board-operator";
import * as faqRoute from "../../app/api/board/faq/route";
import * as faqIdRoute from "../../app/api/board/faq/[id]/route";
import * as answerRoute from "../../app/api/board/posts/[id]/answer/route";
import * as hiddenRoute from "../../app/api/board/posts/[id]/hidden/route";

const OP = "operator@example.com";
const POST_ID = "00000000-0000-4000-8000-000000000001";
let saved: string | undefined;

beforeEach(() => {
  saved = process.env.BOARD_OPERATOR_EMAIL;
  h.claims = null;
  h.adminCalls = [];
});
afterEach(() => {
  if (saved === undefined) delete process.env.BOARD_OPERATOR_EMAIL;
  else process.env.BOARD_OPERATOR_EMAIL = saved;
});

function signedInAs(email: string | null) {
  h.claims = { sub: "user-1", ...(email === null ? {} : { email }) };
}

describe("[R-api][S20] isBoardOperatorEmail — 이메일 일치 (앞뒤 공백·대소문자 무시)", () => {
  it("같은 이메일 = 운영자", () => {
    expect(isBoardOperatorEmail(OP, OP)).toBe(true);
  });
  it("대소문자·앞뒤 공백이 달라도 운영자", () => {
    expect(isBoardOperatorEmail("  Operator@Example.COM ", OP)).toBe(true);
    expect(isBoardOperatorEmail(OP, `  ${OP.toUpperCase()}\n`)).toBe(true);
  });
  it("다른 이메일 = 운영자 아님 (부분 일치·도메인만 같음 포함)", () => {
    expect(isBoardOperatorEmail("other@example.com", OP)).toBe(false);
    expect(isBoardOperatorEmail("operator@example.com.evil", OP)).toBe(false);
    expect(isBoardOperatorEmail("xoperator@example.com", OP)).toBe(false);
    expect(isBoardOperatorEmail("operator@example", OP)).toBe(false);
  });
  it("설정이 비면(빈 문자열·공백·undefined·null) 아무도 운영자 아님", () => {
    for (const conf of ["", "   ", undefined, null]) {
      expect(isBoardOperatorEmail(OP, conf as string | undefined)).toBe(false);
      expect(isBoardOperatorEmail("", conf as string | undefined)).toBe(false);
    }
  });
  it("로그인 이메일이 비면 운영자 아님", () => {
    for (const e of ["", "  ", null, undefined]) expect(isBoardOperatorEmail(e, OP)).toBe(false);
  });
  it("기본 설정값 = process.env.BOARD_OPERATOR_EMAIL", () => {
    process.env.BOARD_OPERATOR_EMAIL = OP;
    expect(isBoardOperatorEmail(OP)).toBe(true);
    process.env.BOARD_OPERATOR_EMAIL = "";
    expect(isBoardOperatorEmail(OP)).toBe(false);
    delete process.env.BOARD_OPERATOR_EMAIL;
    expect(isBoardOperatorEmail(OP)).toBe(false);
  });
});

describe("[R-api][S20] getBoardOperator — 로그인 세션 이메일로 판단", () => {
  it("로그인 안 함 = signed-out", async () => {
    process.env.BOARD_OPERATOR_EMAIL = OP;
    expect((await getBoardOperator()).kind).toBe("signed-out");
  });
  it("운영자 이메일로 로그인 = operator (대소문자 무시)", async () => {
    process.env.BOARD_OPERATOR_EMAIL = OP;
    signedInAs("OPERATOR@example.com");
    expect(await getBoardOperator()).toEqual({ kind: "operator", userId: "user-1" });
    expect(await isBoardOperator()).toBe(true);
  });
  it("다른 이메일 = not-operator", async () => {
    process.env.BOARD_OPERATOR_EMAIL = OP;
    signedInAs("teacher@example.com");
    expect((await getBoardOperator()).kind).toBe("not-operator");
    expect(await isBoardOperator()).toBe(false);
  });
  it("세션에 이메일이 없으면 not-operator", async () => {
    process.env.BOARD_OPERATOR_EMAIL = OP;
    signedInAs(null);
    expect((await getBoardOperator()).kind).toBe("not-operator");
  });
  it("BOARD_OPERATOR_EMAIL 이 비면 운영자 없음 (같은 빈 이메일이어도)", async () => {
    for (const v of ["", "   "]) {
      process.env.BOARD_OPERATOR_EMAIL = v;
      signedInAs(OP);
      expect((await getBoardOperator()).kind).toBe("not-operator");
      signedInAs("");
      expect((await getBoardOperator()).kind).toBe("not-operator");
    }
    delete process.env.BOARD_OPERATOR_EMAIL;
    signedInAs(OP);
    expect((await getBoardOperator()).kind).toBe("not-operator");
  });
});

// ---------- 운영자 API 경로 ----------
type Call = () => Promise<Response>;
const ctx = () => ({ params: Promise.resolve({ id: POST_ID }) });
const jsonReq = (method: string, url: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const ROUTES: { name: string; admin: string; call: Call }[] = [
  { name: "POST /api/board/faq", admin: "createFaq", call: () => faqRoute.POST(jsonReq("POST", "/api/board/faq", { title: "Q", body: "A" })) },
  {
    name: "PATCH /api/board/faq/[id]",
    admin: "updateFaq",
    call: () => faqIdRoute.PATCH(jsonReq("PATCH", `/api/board/faq/${POST_ID}`, { title: "Q", body: "A" }), ctx()),
  },
  {
    name: "DELETE /api/board/faq/[id]",
    admin: "deleteFaq",
    call: () => faqIdRoute.DELETE(new NextRequest(`http://localhost/api/board/faq/${POST_ID}`, { method: "DELETE" }), ctx()),
  },
  {
    name: "PUT /api/board/posts/[id]/answer",
    admin: "saveAnswer",
    call: () => answerRoute.PUT(jsonReq("PUT", `/api/board/posts/${POST_ID}/answer`, { answer: "답변" }), ctx()),
  },
  {
    name: "PUT /api/board/posts/[id]/hidden",
    admin: "setPostHidden",
    call: () => hiddenRoute.PUT(jsonReq("PUT", `/api/board/posts/${POST_ID}/hidden`, { hidden: true }), ctx()),
  },
];

describe("[R-api][S20] 운영자 API — 운영자가 아니면 401·403, service role 쓰기 0회", () => {
  for (const r of ROUTES) {
    it(`${r.name}: 로그인 안 함 = 401`, async () => {
      process.env.BOARD_OPERATOR_EMAIL = OP;
      const res = await r.call();
      expect(res.status).toBe(401);
      expect((await res.json()).ok).toBe(false);
      expect(h.adminCalls).toEqual([]);
    });

    it(`${r.name}: 운영자 아닌 교사 = 403`, async () => {
      process.env.BOARD_OPERATOR_EMAIL = OP;
      signedInAs("teacher@example.com");
      const res = await r.call();
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(JSON.stringify(body)).not.toContain(OP); // 운영자 이메일을 응답에 쓰지 않는다
      expect(h.adminCalls).toEqual([]);
    });

    it(`${r.name}: BOARD_OPERATOR_EMAIL 비어 있음 = 403 (누구도 운영자 아님)`, async () => {
      process.env.BOARD_OPERATOR_EMAIL = "";
      signedInAs(OP);
      const res = await r.call();
      expect(res.status).toBe(403);
      expect(h.adminCalls).toEqual([]);
    });

    it(`${r.name}: 운영자 = 통과 (양성 대조 — 서버 쓰기 1회)`, async () => {
      process.env.BOARD_OPERATOR_EMAIL = ` ${OP.toUpperCase()} `;
      signedInAs(OP);
      const res = await r.call();
      expect(res.status).toBe(200);
      expect(h.adminCalls).toEqual([r.admin]);
    });
  }

  it("운영자 응답은 캐시하지 않는다 (no-store) — 거부 응답 포함", async () => {
    process.env.BOARD_OPERATOR_EMAIL = OP;
    signedInAs("teacher@example.com");
    const res = await ROUTES[0].call();
    expect(res.headers.get("cache-control") ?? "").toContain("no-store");
  });

  it("운영자라도 JSON 이 아닌 본문(form 전송)은 400, 쓰기 0회", async () => {
    process.env.BOARD_OPERATOR_EMAIL = OP;
    signedInAs(OP);
    const res = await faqRoute.POST(
      new NextRequest("http://localhost/api/board/faq", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "title=Q&body=A",
      }),
    );
    expect(res.status).toBe(400);
    expect(h.adminCalls).toEqual([]);
  });
});
