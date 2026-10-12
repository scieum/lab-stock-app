// 서류로 등록 뒤 화면 17 에서 잠깐 highlight-soft 로 보일 센서 (rules 1.28 sensor.doc.save "바뀐 행 잠깐 colors.highlight-soft").
// 브라우저 탭 안(sessionStorage)에만 둔다 — 센서 id 만, 학교 데이터 없음. 목록(모바일 카드 · 데스크톱 표)이 읽고, 보여 준 뒤 지운다.

const KEY = "lab-stock:sensor-highlight";
/** 이 시간보다 오래된 표시는 버린다 (이동이 실패하고 남은 값) */
const MAX_AGE_MS = 30_000;
/** 강조를 보여 주는 시간 */
export const SENSOR_HIGHLIGHT_MS = 3_000;

export function setSensorHighlight(ids: readonly string[]): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ ids: [...ids], at: Date.now() }));
  } catch {
    // 저장소를 못 쓰면 강조만 생략
  }
}

export function clearSensorHighlight(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // 무시
  }
}

/** 남아 있는 강조 id (지우지 않는다 — 두 폭 목록이 함께 읽을 수 있게). 없거나 오래됐으면 [] */
export function readSensorHighlight(now: number = Date.now()): string[] {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return [];
    const v = JSON.parse(raw) as { ids?: unknown; at?: unknown };
    if (!Array.isArray(v.ids) || typeof v.at !== "number" || now - v.at > MAX_AGE_MS) return [];
    return v.ids.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}
