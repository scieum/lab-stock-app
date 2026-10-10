// 화면을 옮긴 뒤 한 번 보여 줄 토스트 (예: 시약 삭제 → 화면 2). 브라우저 탭 안(sessionStorage)에만 둔다 — 학교 데이터 없음.
// 쓰는 쪽: 이동 직전 setFlashToast → (실패하면 clearFlashToast). 읽는 쪽: 셸의 FlashToast 가 주소가 바뀔 때 takeFlashToast.

const KEY = "lab-stock:flash-toast";
/** 이 시간보다 오래된 표시는 버린다 (이동이 실패하고 남은 값) */
const MAX_AGE_MS = 30_000;

export function setFlashToast(text: string): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ text, at: Date.now() }));
  } catch {
    // 저장소를 못 쓰면 토스트만 생략
  }
}

export function clearFlashToast(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // 무시
  }
}

/** 남아 있는 토스트 글자를 꺼내고 지운다 (없거나 오래됐으면 null) */
export function takeFlashToast(now: number = Date.now()): string | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(KEY);
    const v = JSON.parse(raw) as { text?: unknown; at?: unknown };
    if (typeof v.text !== "string" || typeof v.at !== "number" || now - v.at > MAX_AGE_MS) return null;
    return v.text;
  } catch {
    return null;
  }
}
