// 표 쪽 나누기 (데스크톱 data-table 아래 pagination). 순수 함수 — 서버·클라이언트 공용.

/** 쪽 하나에 보이는 행 수 (시안 2·3·4·16-desktop data-table = 10행) */
export const TABLE_PAGE_SIZE = 10;

/** 주소창 ?page 값 → 1 이상 정수 (잘못된 값은 1) */
export function parsePage(raw: string | null | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** 쪽 나누기 — 1부터. 범위 밖 쪽은 가장 가까운 쪽으로 */
export function paginate<T>(items: readonly T[], page: number, size: number = TABLE_PAGE_SIZE): { rows: T[]; page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  return { rows: items.slice((p - 1) * size, p * size), page: p, pageCount };
}
