import "server-only";
import { planMsdsSearch, searchedAsLabel, type MsdsSearchStep } from "../msds-aliases";
import { MSDS_CANDIDATES_MAX, type MsdsCandidate } from "../msds-rules";
import { cachedMsdsSearch, searchMsds, type MsdsSearchFailure } from "./kosha-msds";

// MSDS 찾기 검색 보강 (d7 §20 "검색 보강") — 한 번의 사용자 검색을 KOSHA 목록 검색 여러 번(최대 4)으로 나눠 합친다.
// 차례: (1) cas 인자 또는 CAS 꼴 q → CAS (2) 학교 상용 이름 표 CAS (3) 원래 이름 국문명 (4) 앞이 모두 0개면 정리한 이름.
// 각 호출은 kosha-msds 의 하루 캐시를 그대로 쓴다. 로그에 검색어·키를 남기지 않는다.

export type CombinedMsdsResult =
  | { ok: true; candidates: MsdsCandidate[]; searchedAs: string }
  | { ok: false; code: MsdsSearchFailure };

/** 검색어를 kosha-msds 에 넘기는 꼴 (CAS 는 그대로 — searchCondition 이 CAS 꼴을 CAS 로 검색) */
const stepQuery = (st: MsdsSearchStep) => st.value;

/** 결과 합치기: 앞 차례 먼저, 같은 chemId 는 처음 것만, 최대 10. searchedAs = 결과가 처음 나온 차례 */
function merge(
  q: string,
  results: { step: MsdsSearchStep; candidates: MsdsCandidate[] }[],
): { candidates: MsdsCandidate[]; searchedAs: string } {
  const seen = new Set<string>();
  const out: MsdsCandidate[] = [];
  let searchedAs: string | null = null;
  for (const r of results) {
    if (r.candidates.length > 0 && searchedAs === null) searchedAs = searchedAsLabel(r.step);
    for (const c of r.candidates) {
      if (seen.has(c.chemId)) continue;
      seen.add(c.chemId);
      if (out.length < MSDS_CANDIDATES_MAX) out.push(c);
    }
  }
  return { candidates: out, searchedAs: searchedAs ?? q };
}

/** 모든 차례가 캐시에 있으면 합친 결과, 하나라도 없으면 null (호출 제한을 세지 않게 — route 가 먼저 본다) */
export function cachedCombinedMsdsSearch(q: string, cas?: string | null): { candidates: MsdsCandidate[]; searchedAs: string } | null {
  const plan = planMsdsSearch(q, cas);
  const results: { step: MsdsSearchStep; candidates: MsdsCandidate[] }[] = [];
  for (const step of plan.steps) {
    const hit = cachedMsdsSearch(stepQuery(step));
    if (!hit) return null;
    results.push({ step, candidates: hit });
  }
  if (plan.fallback && results.every((r) => r.candidates.length === 0)) {
    const hit = cachedMsdsSearch(stepQuery(plan.fallback));
    if (!hit) return null;
    results.push({ step: plan.fallback, candidates: hit });
  }
  return merge(q.trim(), results);
}

/**
 * 차례대로 찾고 합친다. (1)~(3) 은 함께 부르고, 모두 0개면 (4).
 * 실패: 결과가 하나도 없고 실패한 호출이 있으면 실패(키 없음이 있으면 no-key, 아니면 그 실패) — 일부만 실패하고
 * 다른 차례에서 후보가 나오면 그 후보를 돌려준다.
 */
export async function combinedMsdsSearch(q: string, cas?: string | null): Promise<CombinedMsdsResult> {
  const plan = planMsdsSearch(q, cas);
  const failures: MsdsSearchFailure[] = [];
  const results: { step: MsdsSearchStep; candidates: MsdsCandidate[] }[] = [];

  const run = async (steps: MsdsSearchStep[]) => {
    const got = await Promise.all(steps.map((step) => searchMsds(stepQuery(step))));
    steps.forEach((step, i) => {
      const r = got[i];
      if (r.ok) results.push({ step, candidates: r.candidates });
      else failures.push(r.code);
    });
  };

  await run(plan.steps);
  if (plan.fallback && failures.length === 0 && results.every((r) => r.candidates.length === 0)) {
    await run([plan.fallback]);
  }

  const merged = merge(q.trim(), results);
  if (merged.candidates.length === 0 && failures.length > 0) {
    return { ok: false, code: failures.includes("no-key") ? "no-key" : failures[0] };
  }
  return { ok: true, ...merged };
}
