import "server-only";
import { aiSearchAllowed, planAiSearch, planMsdsSearch, searchedAsLabel, type ChemicalGuess, type MsdsSearchStep } from "../msds-aliases";
import { MSDS_CANDIDATES_MAX, type MsdsCandidate, type MsdsSearchedVia } from "../msds-rules";
import { cachedChemicalGuess, guessChemicalIdentity } from "./gemini";
import { cachedMsdsSearch, searchMsds, type MsdsSearchFailure } from "./kosha-msds";

// MSDS 찾기 검색 보강 (d7 §20 "검색 보강" · "AI 보조") — 한 번의 사용자 검색을 KOSHA 목록 검색 여러 번으로 나눠 합친다.
// 차례: (1) cas 인자 또는 CAS 꼴 q → CAS (2) 학교 상용 이름 표 CAS (3) 원래 이름 국문명 (4) 앞이 모두 0개면 정리한 이름 (최대 4회).
// (5) AI 보조: (1)~(4) 가 모두 0개이고 외부 실패가 없으면 Gemini 에 이름을 주고 { nameKo, cas } 를 받아
//     cas 로 CAS 검색 → 0개거나 cas 가 없으면 nameKo 국문명 검색 (KOSHA 추가 최대 2회, AI 호출 최대 1회).
//     후보는 KOSHA 가 돌려준 것만 — AI 답을 후보로 쓰지 않는다. Gemini 키 없음·실패면 (5)를 건너뛴다.
// 각 KOSHA 호출은 kosha-msds 의 하루 캐시, AI 답은 gemini 의 이름별 하루 캐시를 쓴다. 로그에 검색어·키를 남기지 않는다.

export type CombinedMsdsResult =
  | { ok: true; candidates: MsdsCandidate[]; searchedAs: string; searchedVia?: MsdsSearchedVia }
  | { ok: false; code: MsdsSearchFailure };

type Hit = { step: MsdsSearchStep; candidates: MsdsCandidate[]; via?: MsdsSearchedVia };
type Merged = { candidates: MsdsCandidate[]; searchedAs: string; searchedVia?: MsdsSearchedVia };

/** 검색어를 kosha-msds 에 넘기는 꼴 (CAS 는 그대로 — searchCondition 이 CAS 꼴을 CAS 로 검색) */
const stepQuery = (st: MsdsSearchStep) => st.value;

/** 결과 합치기: 앞 차례 먼저, 같은 chemId 는 처음 것만, 최대 10. searchedAs = 결과가 처음 나온 차례 */
function merge(q: string, results: Hit[]): Merged {
  const seen = new Set<string>();
  const out: MsdsCandidate[] = [];
  let first: Hit | null = null;
  for (const r of results) {
    if (r.candidates.length > 0 && first === null) first = r;
    for (const c of r.candidates) {
      if (seen.has(c.chemId)) continue;
      seen.add(c.chemId);
      if (out.length < MSDS_CANDIDATES_MAX) out.push(c);
    }
  }
  if (!first) return { candidates: out, searchedAs: q };
  const searchedAs = searchedAsLabel(first.step, first.candidates[0]);
  return first.via ? { candidates: out, searchedAs, searchedVia: first.via } : { candidates: out, searchedAs };
}

const allEmpty = (results: Hit[]) => results.every((r) => r.candidates.length === 0);

/**
 * 모든 차례가 캐시에 있으면 합친 결과, 하나라도 없으면 null (호출 제한을 세지 않게 — route 가 먼저 본다).
 * (5) 는 AI 답도 캐시에 있어야 한다 (Gemini 키가 없으면 (5) 없이 지금처럼).
 */
export function cachedCombinedMsdsSearch(q: string, cas?: string | null): Merged | null {
  const plan = planMsdsSearch(q, cas);
  const results: Hit[] = [];
  for (const step of plan.steps) {
    const hit = cachedMsdsSearch(stepQuery(step));
    if (!hit) return null;
    results.push({ step, candidates: hit });
  }
  if (plan.fallback && allEmpty(results)) {
    const hit = cachedMsdsSearch(stepQuery(plan.fallback));
    if (!hit) return null;
    results.push({ step: plan.fallback, candidates: hit });
  }
  if (allEmpty(results) && aiSearchAllowed(q)) {
    const ai = cachedChemicalGuess(q);
    if (!ai) return null;
    if (ai.guess) {
      const { first, second } = planAiSearch(q, cas, ai.guess);
      for (const step of [first, second]) {
        if (!step) continue;
        if (step === second && !allEmpty(results)) break;
        const hit = cachedMsdsSearch(stepQuery(step));
        if (!hit) return null;
        results.push({ step, candidates: hit, via: "ai" });
      }
    }
  }
  return merge(q.trim(), results);
}

/**
 * 차례대로 찾고 합친다. (1)~(3) 은 함께 부르고, 모두 0개면 (4), 그래도 0개고 실패가 없으면 (5) AI 보조.
 * 실패: 결과가 하나도 없고 실패한 호출이 있으면 실패(키 없음이 있으면 no-key, 아니면 그 실패) — 일부만 실패하고
 * 다른 차례에서 후보가 나오면 그 후보를 돌려준다.
 * guess = AI 추정 함수 (테스트에서 바꿔 끼울 수 있게 — 기본은 Gemini).
 */
export async function combinedMsdsSearch(
  q: string,
  cas?: string | null,
  guess: (name: string) => Promise<ChemicalGuess | null> = guessChemicalIdentity,
): Promise<CombinedMsdsResult> {
  const plan = planMsdsSearch(q, cas);
  const failures: MsdsSearchFailure[] = [];
  const results: Hit[] = [];

  const run = async (steps: MsdsSearchStep[], via?: MsdsSearchedVia) => {
    const got = await Promise.all(steps.map((step) => searchMsds(stepQuery(step))));
    steps.forEach((step, i) => {
      const r = got[i];
      if (r.ok) results.push(via ? { step, candidates: r.candidates, via } : { step, candidates: r.candidates });
      else failures.push(r.code);
    });
  };

  await run(plan.steps);
  if (plan.fallback && failures.length === 0 && allEmpty(results)) {
    await run([plan.fallback]);
  }

  // (5) AI 보조 — AI 호출 최대 1회, KOSHA 추가 최대 2회
  if (failures.length === 0 && allEmpty(results) && aiSearchAllowed(q)) {
    let g: ChemicalGuess | null = null;
    try {
      g = await guess(q.trim());
    } catch {
      g = null; // AI 실패는 (5)를 건너뛴다
    }
    if (g) {
      const { first, second } = planAiSearch(q, cas, g);
      if (first) await run([first], "ai");
      if (second && failures.length === 0 && allEmpty(results)) await run([second], "ai");
    }
  }

  const merged = merge(q.trim(), results);
  if (merged.candidates.length === 0 && failures.length > 0) {
    return { ok: false, code: failures.includes("no-key") ? "no-key" : failures[0] };
  }
  return { ok: true, ...merged };
}
