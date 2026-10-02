import "server-only";
import type { NeisSchool } from "@/lib/types";

// NEIS 학교기본정보 중계 (d7 §3). 규칙은 디자인 하네스 harness/scripts/neis.py 와 같다.
// - 고등학교만, 재외한국학교 제외
// - 지역 = 도로명주소 두 번째 토큰 (시/군/구로 끝날 때만), 아니면 시/도 이름
// - 하루 캐시 (fetch revalidate + 프로세스 메모)

const ENDPOINT = "https://open.neis.go.kr/hub/schoolInfo";
const SCHOOL_KIND = "고등학교";
const EXCLUDE_SIDO = ["재외한국학교"];
const PAGE_SIZE = 1000;
export const NEIS_REVALIDATE_SECONDS = 86400;

type NeisRow = {
  ATPT_OFCDC_SC_CODE: string;
  SD_SCHUL_CODE: string;
  SCHUL_NM: string;
  LCTN_SC_NM: string;
  ORG_RDNMA?: string | null;
};

type NeisResponse = {
  schoolInfo?: [{ head: [{ list_total_count: number }] }, { row: NeisRow[] }];
  RESULT?: { CODE: string; MESSAGE: string };
};

export class NeisError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "NeisError";
  }
}

function apiKey(): string {
  const key = process.env.NEIS_API_KEY;
  if (!key) throw new NeisError("NEIS_API_KEY 환경변수가 설정되지 않았습니다.", 500);
  return key;
}

export function regionOf(row: Pick<NeisRow, "ORG_RDNMA" | "LCTN_SC_NM">): string {
  const parts = (row.ORG_RDNMA ?? "").split(/\s+/).filter(Boolean);
  if (parts.length > 1 && /(시|군|구)$/.test(parts[1])) return parts[1];
  return row.LCTN_SC_NM;
}

function toSchool(row: NeisRow): NeisSchool {
  return {
    neis_code: row.SD_SCHUL_CODE.trim(),
    office_code: row.ATPT_OFCDC_SC_CODE,
    name: row.SCHUL_NM,
    sido: row.LCTN_SC_NM,
    region: regionOf(row),
  };
}

async function fetchPage(page: number): Promise<NeisResponse> {
  const q = new URLSearchParams({
    KEY: apiKey(),
    Type: "json",
    pIndex: String(page),
    pSize: String(PAGE_SIZE),
    SCHUL_KND_SC_NM: SCHOOL_KIND,
  });
  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}?${q}`, { next: { revalidate: NEIS_REVALIDATE_SECONDS } });
  } catch {
    // URL(키 포함)을 메시지에 넣지 않는다
    throw new NeisError("NEIS 서버에 연결하지 못했습니다.", 502);
  }
  if (!res.ok) throw new NeisError(`NEIS 응답 오류 (HTTP ${res.status})`, 502);
  return (await res.json()) as NeisResponse;
}

async function fetchAll(): Promise<NeisSchool[]> {
  const rows: NeisRow[] = [];
  for (let page = 1; ; page++) {
    const data = await fetchPage(page);
    if (!data.schoolInfo) {
      throw new NeisError(`NEIS 응답 오류 (${data.RESULT?.CODE ?? "알 수 없음"})`, 502);
    }
    const [head, body] = data.schoolInfo;
    rows.push(...body.row);
    if (rows.length >= head.head[0].list_total_count || body.row.length === 0) break;
  }
  // 학교 코드가 비어 있는 행(개교 예정 "(가칭)" 학교 등)은 학교를 식별할 수 없어 뺀다
  return rows
    .filter((r) => !EXCLUDE_SIDO.includes(r.LCTN_SC_NM) && r.SD_SCHUL_CODE?.trim())
    .map(toSchool);
}

let memo: { at: number; data: Promise<NeisSchool[]> } | null = null;

/** 전국 고등학교 (재외한국학교 제외). 하루 캐시. */
export function getHighSchools(): Promise<NeisSchool[]> {
  const now = Date.now();
  if (!memo || now - memo.at > NEIS_REVALIDATE_SECONDS * 1000) {
    const data = fetchAll();
    memo = { at: now, data };
    data.catch(() => {
      if (memo?.data === data) memo = null;
    });
  }
  return memo.data;
}

const ko = (a: string, b: string) => a.localeCompare(b, "ko");

export async function listSido(): Promise<string[]> {
  const all = await getHighSchools();
  return [...new Set(all.map((s) => s.sido))].sort(ko);
}

export async function listRegions(sido: string): Promise<string[]> {
  const all = await getHighSchools();
  return [...new Set(all.filter((s) => s.sido === sido).map((s) => s.region))].sort(ko);
}

export async function listSchools(sido: string, region: string): Promise<NeisSchool[]> {
  const all = await getHighSchools();
  return all
    .filter((s) => s.sido === sido && s.region === region)
    .sort((a, b) => ko(a.name, b.name));
}

export async function findSchool(neisCode: string): Promise<NeisSchool | null> {
  const all = await getHighSchools();
  return all.find((s) => s.neis_code === neisCode) ?? null;
}
