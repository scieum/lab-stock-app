// 화면 12 QR 찾기 — 서버(page · 서버 액션)가 만들어 클라이언트 화면에 넘기는 모양 (d7 §26). 글자는 서버에서 다 만든다.

export type ScanRowView = {
  id: string;
  name: string;
  /** "500 g" */
  stock: string;
  /** 칸 위치 "좌 1단" */
  slot: string;
  lowStock: boolean;
};

export type ScanCabinetView = {
  id: string;
  number: number;
  label: string;
  /** "{문 종류} · {N}단 · 시약 {k}개" */
  caption: string;
  /** `/cabinets?c={id}` */
  layoutHref: string;
  /** 칸 순서(문 → 단). 0개면 "이 시약장에는 아직 시약이 없어요" */
  rows: ScanRowView[];
};

export type ScanFindResult =
  /** 우리 학교 시약장 → 결과 시트 (주소창 /scan?cabinet={id}) */
  | { kind: "found"; cabinet: ScanCabinetView }
  /** QR: 다른 학교·삭제된 시약장 · 시약장 QR 아님 → ex-toast */
  | { kind: "toast"; text: string }
  /** 번호: 없는 번호 · 숫자 아님 → 입력 아래 오류 */
  | { kind: "field"; text: string }
  /** 일시 오류 */
  | { kind: "error"; text: string }
  | { kind: "signed-out" };

/** 읽기 실패 (일시 오류) 안내 — 시안에 없는 상태 */
export const SCAN_ERROR_TEXT = "시약장을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요";
