// 안전보건공단 물질안전보건자료 항목별 상세(getChemDetail0N1) XML 읽기 — 순수 함수 (d7 §22).
// 키·요청은 lib/server/kosha-msds-detail.ts. 여기에는 키가 없어 단위 테스트가 그대로 가져다 쓴다.
//
// 응답 모양 (공공데이터포털 15157612 명세 swagger · 2026-10-08 확인 — 실제 정상 응답은 키가 없어 미확인):
//   정상   <response><header><resultCode>00</resultCode><resultMsg>…</resultMsg></header>
//          <body><items><item>
//            <itemDetail>상세내용 - 항목에 대한 값</itemDetail>
//            <lev>레벨(1~3)</lev> <msdsItemCode>항목코드</msdsItemCode> <upMsdsItemCode>상위항목코드</upMsdsItemCode>
//            <msdsItemNameKor>항목명 (예: "가. 유해성·위험성 분류", "그림문자", "신호어", "유해·위험문구")</msdsItemNameKor>
//            <msdsItemNo>항목구분</msdsItemNo> <ordrIdx>순서</ordrIdx>
//          </item>…</items></body></response>
//   게이트웨이 오류 = getChemList001 과 같은 <OpenAPI_ServiceResponse> (lib/server/kosha-msds-xml.ts)
// 명세에 없는 부분 (추정 — 사람이 미리보기에서 확인):
//   - itemDetail 한 칸 안의 여러 줄 구분: 줄바꿈 · "|" · <br> 를 모두 줄 구분으로 본다.
//   - 그림문자 칸의 값 형식: 공단 웹 화면이 /MSDSInfo/images/kcic/ghs/GHS02.gif 처럼 코드로 그림을 고르므로
//     "GHS02" · "ghs02.gif" 같은 코드를 찾고, 없으면 그림문자 이름(산화성 등)으로 찾는다.

import { GHS_CODES, type GhsCode, type SignalWord } from "@/lib/msds-summary";
import { blocks, tagText } from "./kosha-msds-xml";

export type ChemDetailItem = {
  name: string;
  detail: string;
  lev: number | null;
  code: string;
  upCode: string;
  order: number | null;
};

export type ChemDetailParse =
  | { kind: "ok"; items: ChemDetailItem[] }
  | { kind: "gateway-error"; reason: string; code: string }
  | { kind: "api-error"; resultCode: string; resultMsg: string }
  | { kind: "format" };

const OK_CODES = new Set(["00", "0", "0000", "INFO-000"]);
const NODATA_CODES = new Set(["03", "INFO-200"]);

function num(v: string | null): number | null {
  if (v === null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** getChemDetail0N1 응답 XML → 항목 줄 (ordrIdx 순, 없으면 문서 순) */
export function parseChemDetailXml(xml: string): ChemDetailParse {
  if (typeof xml !== "string" || !xml.includes("<")) return { kind: "format" };
  const body = xml.replace(/<\?xml[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "");

  if (/<OpenAPI_ServiceResponse[\s>]/.test(body)) {
    return { kind: "gateway-error", reason: tagText(body, "errMsg") ?? "UNKNOWN", code: tagText(body, "returnReasonCode") ?? "" };
  }
  if (!/<response[\s>]/.test(body)) return { kind: "format" };
  const resultCode = tagText(body, "resultCode");
  if (resultCode === null) return { kind: "format" };
  if (NODATA_CODES.has(resultCode)) return { kind: "ok", items: [] };
  if (!OK_CODES.has(resultCode)) return { kind: "api-error", resultCode, resultMsg: tagText(body, "resultMsg") ?? "" };

  const items: (ChemDetailItem & { idx: number })[] = blocks(body, "item").map((it, idx) => ({
    idx,
    name: tagText(it, "msdsItemNameKor") ?? "",
    detail: tagText(it, "itemDetail") ?? "",
    lev: num(tagText(it, "lev")),
    code: tagText(it, "msdsItemCode") ?? "",
    upCode: tagText(it, "upMsdsItemCode") ?? "",
    order: num(tagText(it, "ordrIdx")),
  }));
  items.sort((a, b) => (a.order ?? a.idx) - (b.order ?? b.idx) || a.idx - b.idx);
  return { kind: "ok", items: items.map((it) => ({ name: it.name, detail: it.detail, lev: it.lev, code: it.code, upCode: it.upCode, order: it.order })) };
}

const EMPTY_VALUES = new Set(["자료없음", "자료 없음", "해당없음", "해당 없음", "-", "없음"]);

/** 값 한 칸 → 줄 목록 (줄바꿈 · | · <br> 로 나누고, 태그·빈 값·"자료없음"·출처 줄은 뺀다) */
export function detailLines(detail: string): string[] {
  const text = detail
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ");
  return text
    .split(/\r?\n|\|/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s !== "" && !EMPTY_VALUES.has(s) && !s.startsWith("※"));
}

/** 항목명 정리: "가. 눈에 들어갔을 때" → "눈에 들어갔을 때", "* 국내규정" → "국내규정" */
export function cleanItemName(name: string): string {
  return name
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[*\-·•]\s*/, "")
    .replace(/^(?:[가-하]|\d{1,2}|[a-z])[.)]\s*/, "")
    .trim();
}

const LABEL_MAX = 16;

function normName(name: string): string {
  return name.replace(/[\s·ㆍ・.]/g, "");
}

/**
 * 항목 4·7·8 → 줄 목록. 값이 있는 칸마다 줄을 나누고, 그 칸의 첫 줄 앞에 짧은 항목명을 붙인다
 * (예: "눈에 들어갔을 때: 긴급 의료조치를 받으시오"). 같은 줄이 겹치면 한 번만.
 */
export function sectionLines(items: readonly ChemDetailItem[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const lines = detailLines(it.detail);
    if (lines.length === 0) continue;
    const label = cleanItemName(it.name);
    lines.forEach((line, i) => {
      const text = i === 0 && label && label.length <= LABEL_MAX && !line.startsWith(label) ? `${label}: ${line}` : line;
      if (seen.has(text)) return;
      seen.add(text);
      out.push(text);
    });
  }
  return out;
}

/** 유해·위험문구 앞 코드 지우기: "H272 : 화재를 강렬하게 함:산화제" → "화재를 강렬하게 함:산화제" */
export function stripHazardCode(line: string): string {
  return line.replace(/^H\d{3}[A-Za-z]{0,2}(?:\s*\+\s*H\d{3}[A-Za-z]{0,2})*\s*[:：]?\s*/, "").trim();
}

const HAZARD_CODE_LINE = /^H\d{3}/;

function splitHazards(detail: string): string[] {
  // 구분자 없이 이어 붙은 경우: "H272 : … H400 : …" 를 코드 앞에서 나눈다
  return detailLines(detail).flatMap((l) => l.split(/\s+(?=H\d{3}[A-Za-z]{0,2}(?:\s*\+\s*H\d{3})*\s*[:：])/));
}

/** 그림문자 이름 → 코드 (코드가 없을 때만 쓰는 대체 규칙) */
const PICTOGRAM_NAME_RULES: [RegExp, GhsCode][] = [
  [/폭발/, "GHS01"],
  [/인화/, "GHS02"],
  [/산화/, "GHS03"],
  [/고압\s*가스/, "GHS04"],
  [/부식/, "GHS05"],
  [/급성\s*독성|해골/, "GHS06"],
  [/감탄|자극|느낌표/, "GHS07"],
  [/건강\s*유해|호흡기\s*과민|발암/, "GHS08"],
  [/환경|수생/, "GHS09"],
];

/** 그림문자 값에서 GHS 코드 (중복 없이 번호 순) */
export function parsePictograms(detail: string): GhsCode[] {
  const found = new Set<GhsCode>();
  for (const m of detail.matchAll(/GHS\s*-?\s*0?([1-9])(?!\d)/gi)) {
    found.add(`GHS0${m[1]}` as GhsCode);
  }
  if (found.size === 0) {
    for (const [re, code] of PICTOGRAM_NAME_RULES) if (re.test(detail)) found.add(code);
  }
  return GHS_CODES.filter((c) => found.has(c));
}

/** 신호어 값 → "위험" | "경고" | null */
export function parseSignalWord(detail: string): SignalWord | null {
  const t = detail.replace(/\s+/g, "");
  if (t.includes("위험")) return "위험";
  if (t.includes("경고")) return "경고";
  return null;
}

export type Section2Summary = { signalWord: SignalWord | null; pictograms: GhsCode[]; lines: string[] };

/**
 * 항목 2 → 신호어 · 그림문자 · 요약 줄.
 * 요약 줄 = 유해·위험문구(H 코드는 지움), 없으면 유해성·위험성 분류 줄. 예방조치문구(P)·NFPA 는 넣지 않는다.
 */
export function summarizeSection2(items: readonly ChemDetailItem[]): Section2Summary {
  let signalWord: SignalWord | null = null;
  const pictograms = new Set<GhsCode>();
  const hazards: string[] = [];
  const classes: string[] = [];
  let sawHazardItem = false;

  for (const it of items) {
    const n = normName(it.name);
    if (n.includes("그림문자")) {
      for (const c of parsePictograms(it.detail)) pictograms.add(c);
    } else if (n.includes("신호어")) {
      signalWord = signalWord ?? parseSignalWord(it.detail);
    } else if (n.includes("유해위험문구")) {
      sawHazardItem = true;
      hazards.push(...splitHazards(it.detail));
    } else if (n.includes("분류") && !n.includes("포함되지")) {
      classes.push(...detailLines(it.detail));
    }
  }
  // 항목명으로 못 찾으면 값 안의 H 코드 줄을 쓴다
  if (!sawHazardItem) {
    for (const it of items) hazards.push(...splitHazards(it.detail).filter((l) => HAZARD_CODE_LINE.test(l)));
  }

  const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
  const hazardLines = uniq(hazards.map(stripHazardCode));
  return {
    signalWord,
    pictograms: GHS_CODES.filter((c) => pictograms.has(c)),
    lines: hazardLines.length > 0 ? hazardLines : uniq(classes),
  };
}
