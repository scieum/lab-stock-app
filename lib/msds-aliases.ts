// MSDS 찾기 검색 보강 (d7 §20 "검색 보강") — 화면·서버 공용 순수 규칙. 외부 주소·키는 두지 않는다.
// - 학교 상용 이름 표: 학교 과학실에서 흔한 시약의 상용 이름·별칭 → CAS. KOSHA 는 등록명이 달라
//   (예: 염산 = "염화수소") 이름으로는 못 찾는 시약을 CAS 로 찾게 한다.
//   CAS 는 확실한 것만 넣는다 — 잘못된 CAS 는 엉뚱한 MSDS 를 연결한다. 뜻이 갈리는 이름(예: 그냥 "염화철")은 넣지 않는다.
// - 이름 정리(cleanReagentName): 수식어·농도·괄호·끝의 용액·등급을 떼어 KOSHA 국문명 검색에 다시 쓴다.
// 상대 import 만 쓴다 (vitest 는 @/ 별칭이 없다).
import { isCasQuery, type MsdsCandidate } from "./msds-rules";

/** [CAS, 이름·별칭…] — 첫 이름이 대표 이름 */
const ALIAS_ROWS: readonly (readonly [string, ...string[]])[] = [
  // 산
  ["7647-01-0", "염산", "염화수소", "묽은 염산", "진한 염산", "염화수소산"],
  ["7664-93-9", "황산", "묽은 황산", "진한 황산"],
  ["7697-37-2", "질산", "묽은 질산", "진한 질산"],
  ["64-19-7", "아세트산", "빙초산", "초산", "빙아세트산"],
  ["7664-38-2", "인산"],
  ["10043-35-3", "붕산"],
  ["77-92-9", "시트르산", "구연산"],
  ["144-62-7", "옥살산"],
  // 염기
  ["1310-73-2", "수산화나트륨", "가성소다"],
  ["1310-58-3", "수산화칼륨", "가성칼리"],
  ["1305-62-0", "수산화칼슘", "소석회", "석회수"],
  ["1336-21-6", "암모니아수", "수산화암모늄"],
  ["1309-42-8", "수산화마그네슘"],
  ["17194-00-2", "수산화바륨"],
  ["21645-51-2", "수산화알루미늄"],
  // 산화제·과산화물
  ["7722-84-1", "과산화수소", "과산화수소수"],
  ["7722-64-7", "과망가니즈산칼륨", "과망간산칼륨", "과망간산 칼륨"],
  ["1313-13-9", "이산화망가니즈", "이산화망간"],
  ["7789-00-6", "크로뮴산칼륨", "크롬산칼륨"],
  ["7778-50-9", "다이크로뮴산칼륨", "중크롬산칼륨", "다이크롬산칼륨"],
  // 유기 용매·유기물
  ["64-17-5", "에탄올", "에틸알코올", "에틸 알코올", "무수 에탄올", "무수에탄올"],
  ["67-56-1", "메탄올", "메틸알코올", "메틸 알코올"],
  ["67-63-0", "아이소프로필알코올", "이소프로필알코올", "2-프로판올", "아이소프로판올", "이소프로판올"],
  ["67-64-1", "아세톤"],
  ["60-29-7", "다이에틸에테르", "디에틸에테르", "에테르", "에틸에테르"],
  ["110-54-3", "헥세인", "헥산", "n-헥세인", "n-헥산", "노말헥산"],
  ["108-88-3", "톨루엔"],
  ["141-78-6", "아세트산에틸", "에틸아세테이트", "초산에틸"],
  ["50-00-0", "폼알데하이드", "포름알데히드", "포르말린", "포말린"],
  ["107-21-1", "에틸렌글리콜"],
  ["56-81-5", "글리세린", "글리세롤"],
  ["91-20-3", "나프탈렌"],
  ["50-99-7", "포도당", "글루코스", "D-글루코스", "D-포도당"],
  ["57-50-1", "설탕", "수크로스", "자당"],
  ["9005-25-8", "녹말", "전분", "가용성 녹말", "가용성 전분"],
  ["57-13-6", "요소"],
  ["127-09-3", "아세트산나트륨", "초산나트륨"],
  // 지시약
  ["77-09-8", "페놀프탈레인"],
  ["76-59-5", "BTB", "브로모티몰블루", "브로모티몰 블루", "브롬티몰블루", "브롬티몰 블루"],
  ["547-58-0", "메틸오렌지", "메틸 오렌지"],
  ["143-74-8", "페놀레드", "페놀 레드", "페놀적"],
  ["61-73-4", "메틸렌블루", "메틸렌 블루"],
  ["1393-92-6", "리트머스"],
  // 금속·비금속 홑원소
  ["7439-95-4", "마그네슘", "마그네슘 리본"],
  ["7440-66-6", "아연", "아연 가루", "아연판", "아연 조각"],
  ["7440-50-8", "구리", "구리판", "구리 가루", "구리선"],
  ["7439-89-6", "철", "철 가루", "철가루", "철솜"],
  ["7429-90-5", "알루미늄", "알루미늄 포일", "알루미늄 가루"],
  ["7704-34-9", "황", "황 가루", "황가루"],
  ["7553-56-2", "아이오딘", "요오드", "요오드 결정"],
  // 염 — 나트륨·칼륨
  ["7647-14-5", "염화나트륨", "소금"],
  ["144-55-8", "탄산수소나트륨", "중탄산나트륨", "베이킹소다", "중조"],
  ["497-19-8", "탄산나트륨", "소다회", "무수 탄산나트륨"],
  ["7757-82-6", "황산나트륨", "무수 황산나트륨"],
  ["7631-99-4", "질산나트륨"],
  ["7447-40-7", "염화칼륨"],
  ["584-08-7", "탄산칼륨"],
  ["7757-79-1", "질산칼륨", "초석"],
  ["7681-11-0", "아이오딘화칼륨", "요오드화칼륨", "요오드화 칼륨", "아이오딘화 칼륨"],
  // 염 — 알칼리 토금속·기타
  ["471-34-1", "탄산칼슘", "석회석", "대리석"],
  ["1305-78-8", "산화칼슘", "생석회"],
  ["10043-52-4", "염화칼슘", "무수 염화칼슘"],
  ["7487-88-9", "황산마그네슘", "무수 황산마그네슘"],
  ["7786-30-3", "염화마그네슘"],
  ["546-93-0", "탄산마그네슘"],
  ["1309-48-4", "산화마그네슘"],
  ["10361-37-2", "염화바륨"],
  ["10022-31-8", "질산바륨"],
  ["10476-85-4", "염화스트론튬"],
  ["7447-41-8", "염화리튬"],
  ["12125-02-9", "염화암모늄"],
  ["6484-52-2", "질산암모늄"],
  ["7783-20-2", "황산암모늄"],
  // 염 — 전이 금속·납·은
  ["7761-88-8", "질산은"],
  ["7758-98-7", "황산구리", "황산구리(II)", "무수 황산구리", "무수 황산구리(II)", "황산구리(II) 무수물"],
  ["7758-99-8", "황산구리 오수화물", "황산구리(II) 오수화물", "황산구리(II)오수화물", "황산구리 5수화물", "황산구리(II) 5수화물"],
  ["7447-39-4", "염화구리(II)", "염화제이구리"],
  ["3251-23-8", "질산구리(II)"],
  ["1317-38-0", "산화구리(II)", "산화제이구리"],
  ["7646-79-9", "염화코발트", "염화코발트(II)", "무수 염화코발트"],
  ["7791-13-1", "염화코발트 육수화물", "염화코발트(II) 육수화물", "염화코발트(II) 6수화물", "염화코발트 6수화물"],
  ["7705-08-0", "염화철(III)", "염화제이철", "무수 염화철(III)"],
  ["10025-77-1", "염화철(III) 육수화물", "염화철(III) 6수화물", "염화제이철 육수화물"],
  ["7720-78-7", "황산철(II)", "황산제일철"],
  ["7782-63-0", "황산철(II) 칠수화물", "황산철(II) 7수화물", "황산제일철 칠수화물"],
  ["7646-85-7", "염화아연"],
  ["7733-02-0", "황산아연", "무수 황산아연"],
  ["7772-99-8", "염화주석(II)", "염화제일주석"],
  ["10099-74-8", "질산납", "질산납(II)"],
  ["10101-63-0", "아이오딘화납", "요오드화납", "아이오딘화납(II)", "요오드화납(II)"],
];

/** 표의 이름 비교용: 소문자 · 공백 없음 · 로마 숫자(Ⅱ·Ⅲ)와 전각 괄호를 보통 글자로 */
export function aliasKey(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/Ⅱ/g, "II")
    .replace(/Ⅲ/g, "III")
    .toLowerCase()
    .replace(/\s+/g, "");
}

const ALIAS_MAP: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [cas, ...names] of ALIAS_ROWS) {
    for (const n of names) {
      const k = aliasKey(n);
      const prev = m.get(k);
      if (prev && prev !== cas) throw new Error(`msds-aliases: "${n}" 이 두 CAS 에 있음`);
      m.set(k, cas);
    }
  }
  return m;
})();

/** 상용 이름 표 전체 ({ cas, names }) — 검토·테스트용 */
export const MSDS_ALIASES: readonly { cas: string; names: readonly string[] }[] = ALIAS_ROWS.map(([cas, ...names]) => ({ cas, names }));

const MODIFIERS = ["묽은", "진한", "희석된", "희석", "포화"];
const SUFFIXES = ["수용액", "용액", "시약"];
const GRADES_KO = ["특급", "1급", "일급"];
const GRADES_EN = ["GR", "EP", "CP"];

/**
 * 시약 이름 정리 (d7 §20 검색 보강 (4)):
 * 괄호 안 내용 · 농도 표기(0.1M · 1N · 35% · w/v · 0.1 mol/L …) · 등급(특급 · 1급 · GR · EP · CP) ·
 * 앞뒤 수식어(묽은 · 진한 · 희석 · 포화 — "무수"는 남김) · 끝의 "용액 · 수용액 · 시약" 을 뗀다.
 * 다 떼면 빈 문자열.
 */
export function cleanReagentName(name: string): string {
  let s = name.normalize("NFKC").replace(/\s+/g, " ").trim();
  // 괄호 안 내용 (중첩 없는 것부터 반복)
  for (let i = 0; i < 3; i++) s = s.replace(/\([^()]*\)|\[[^[\]]*\]|\{[^{}]*\}/g, " ");
  s = s.replace(/[()[\]{}]/g, " ");
  // 농도 표기
  s = s
    .replace(/(?:^|\s)\d+(?:\.\d+)?\s*(?:mol\/L|mmol\/L|mM|M|N|%|ppm)(?:\s*\(?(?:w\/v|v\/v|w\/w)\)?)?(?=\s|$|[가-힣])/gi, " ")
    .replace(/(?:^|\s)(?:w\/v|v\/v|w\/w)%?(?=\s|$)/gi, " ")
    .replace(/\d+(?:\.\d+)?\s*%/g, " ");
  // 등급
  for (const g of GRADES_KO) s = s.replace(new RegExp(`(?:^|\\s)${g}(?=\\s|$)`, "g"), " ");
  for (const g of GRADES_EN) s = s.replace(new RegExp(`(?:^|\\s)${g}(?=\\s|$)`, "gi"), " ");
  s = s.replace(/\s+/g, " ").trim();
  // 앞뒤 수식어 · 끝의 용액 — 바뀌지 않을 때까지
  for (let changed = true; changed; ) {
    changed = false;
    for (const m of MODIFIERS) {
      if (s.startsWith(m) && s.length > m.length) {
        s = s.slice(m.length).trim();
        changed = true;
      }
      const tail = ` ${m}`;
      if (s.endsWith(tail)) {
        s = s.slice(0, -tail.length).trim();
        changed = true;
      }
    }
    for (const x of SUFFIXES) {
      if (s.endsWith(x) && s.length > x.length) {
        s = s.slice(0, -x.length).trim();
        changed = true;
      } else if (s === x) {
        s = "";
        changed = true;
      }
    }
  }
  return s.replace(/\s+/g, " ").trim();
}

/** 상용 이름 표에서 CAS 찾기 — 원래 이름 먼저, 없으면 정리한 이름. 없으면 null */
export function lookupAliasCas(name: string): string | null {
  const direct = ALIAS_MAP.get(aliasKey(name));
  if (direct) return direct;
  const cleaned = cleanReagentName(name);
  if (!cleaned) return null;
  return ALIAS_MAP.get(aliasKey(cleaned)) ?? null;
}

/** KOSHA 검색 한 번 — CAS 또는 국문명 */
export type MsdsSearchStep = { kind: "cas"; value: string } | { kind: "name"; value: string };

/** 한 번의 사용자 검색에 KOSHA 호출 최대 (d7 §20) */
export const MSDS_SEARCH_STEPS_MAX = 4;

/**
 * 검색 차례 (d7 §20 검색 보강):
 * (1) cas 인자(시약에 저장된 CAS) 또는 q 가 CAS 꼴이면 CAS (2) 상용 이름 표 CAS (3) 원래 이름 국문명.
 * fallback = (4) 앞 차례가 모두 0개일 때만 정리한 이름 국문명 (없거나 원래 이름과 같으면 null).
 * 같은 검색은 한 번만.
 */
export function planMsdsSearch(q: string, cas?: string | null): { steps: MsdsSearchStep[]; fallback: MsdsSearchStep | null } {
  const query = q.trim().replace(/\s+/g, " ");
  const steps: MsdsSearchStep[] = [];
  const seen = new Set<string>();
  const add = (st: MsdsSearchStep) => {
    const k = `${st.kind}:${st.kind === "name" ? aliasKey(st.value) : st.value}`;
    if (seen.has(k)) return;
    seen.add(k);
    steps.push(st);
  };
  const casArg = typeof cas === "string" && isCasQuery(cas) ? cas.trim() : null;
  const qIsCas = isCasQuery(query);
  if (casArg) add({ kind: "cas", value: casArg });
  if (qIsCas) add({ kind: "cas", value: query });
  if (!qIsCas) {
    const alias = lookupAliasCas(query);
    if (alias) add({ kind: "cas", value: alias });
    add({ kind: "name", value: query });
  }
  let fallback: MsdsSearchStep | null = null;
  if (!qIsCas) {
    const cleaned = cleanReagentName(query);
    if (cleaned && !seen.has(`name:${aliasKey(cleaned)}`)) fallback = { kind: "name", value: cleaned };
  }
  return { steps: steps.slice(0, MSDS_SEARCH_STEPS_MAX - (fallback ? 1 : 0)), fallback };
}

/**
 * 응답 searchedAs 글자: 이름 차례 = 그 이름. CAS 차례 = 그 차례 첫 후보의 KOSHA 물질명 + "(CAS 번호)"
 * (예: "염화수소(CAS 7647-01-0)") — 어떤 물질로 찾았는지 보이게. 첫 후보가 없으면 "CAS 7647-01-0".
 */
export function searchedAsLabel(step: MsdsSearchStep, first?: MsdsCandidate | null): string {
  if (step.kind === "name") return step.value;
  const name = first?.name.trim();
  if (!name) return `CAS ${step.value}`;
  return `${name}(CAS ${first?.cas?.trim() || step.value})`;
}

/** 끝 글자에 받침이 있으면(ㄹ 제외) "으로", 아니면 "로". 한글·숫자가 아니면 "(으)로" */
function roParticle(word: string): string {
  const last = word.trim().slice(-1);
  if (!last) return "(으)로";
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const jong = (code - 0xac00) % 28;
    return jong === 0 || jong === 8 ? "로" : "으로";
  }
  if (/\d/.test(last)) return "036".includes(last) ? "으로" : "로"; // 영·삼·육 = 받침(ㄹ 아님)
  return "(으)로";
}

/**
 * 후보 시트의 무채색 한 줄 (d7 §20): 찾은 검색어가 원래 검색어와 다를 때만.
 * 이름 → "{원래 이름} → {찾은 이름}으로 찾았어요",
 * CAS → "{원래 이름} → 염화수소(CAS 7647-01-0)로 찾았어요" (물질명 없으면 "{원래 이름} → CAS 7647-01-0으로 찾았어요"). 같으면 null.
 */
export function searchedAsNote(query: string, searchedAs: string | null | undefined): string | null {
  if (!searchedAs) return null;
  const q = query.trim().replace(/\s+/g, " ");
  const s = searchedAs.trim();
  if (!s || aliasKey(s) === aliasKey(q)) return null;
  // CAS 차례: "물질명(CAS 번호)" — 원래 검색어가 그 CAS 거나 물질명이 원래 검색어와 같으면 없음.
  // 조사는 괄호 앞 물질명에 맞춘다 ("염화수소(CAS …)로", "염산(CAS …)으로")
  const named = /^(.+)\(CAS\s+(\S+)\)$/.exec(s);
  if (named) {
    const name = named[1].trim();
    if (named[2] === q || aliasKey(name) === aliasKey(q)) return null;
    return `${q} → ${name}(CAS ${named[2]})${roParticle(name)} 찾았어요`;
  }
  // 물질명 없는 CAS (예전 응답 꼴 "CAS 번호")
  const cas = /^CAS\s+(\S+)$/.exec(s);
  if (cas) {
    if (cas[1] === q) return null;
    return `${q} → CAS ${cas[1]}${roParticle(cas[1])} 찾았어요`;
  }
  return `${q} → ${s}${roParticle(s)} 찾았어요`;
}
