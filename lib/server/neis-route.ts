import "server-only";
import { NextResponse } from "next/server";
import { NeisError, NEIS_REVALIDATE_SECONDS } from "./neis";

const CACHE_HEADERS = {
  "Cache-Control": `public, s-maxage=${NEIS_REVALIDATE_SECONDS}, stale-while-revalidate=3600`,
};

export function neisJson(body: unknown) {
  return NextResponse.json(body, { headers: CACHE_HEADERS });
}

export function neisBadRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function neisFailure(e: unknown) {
  if (e instanceof NeisError) return NextResponse.json({ error: e.message }, { status: e.status });
  return NextResponse.json({ error: "NEIS 학교 정보를 불러오지 못했습니다." }, { status: 500 });
}
