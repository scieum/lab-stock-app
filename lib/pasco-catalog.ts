// 파스코 센서 카탈로그 (design/rules.json 1.28 sensor.catalog, d7 §28). 코드 상수 — DB·관리 화면 없음.
// 출처: 디자인하네스-요청서-2026-10-11-8.md "부록 — 파스코 카탈로그 요약" (pasco.com, 2026-10-11 확인).
// 부록의 종류 이름은 rules sensor.types 27종으로 맞췄다 (부록 "심박" · "생체" → "심박·생체").
// 부록에 한국어 이름이 없던 모델은 pasco.com(2026-10-11) 조사 결과 이름을 쓴다 (판매 중단은 discontinued 로만 표시).
// 순수 함수 — 서버·클라이언트 공용.

import type { SensorType } from "@/lib/sensor-rules";

export const PASCO_MAKER = "파스코";

export type PascoModel = {
  /** 모델번호 "PS-3201" */
  model: string;
  /** 한국어 이름 "무선 온도" (고르면 이름 칸이 비었을 때 채운다) */
  nameKo: string;
  /** 27종 중 하나 */
  type: SensorType;
  /** 판매 중단 */
  discontinued?: true;
};

export const PASCO_CATALOG: readonly PascoModel[] = [
  // 온도
  { model: "PS-3201", nameKo: "무선 온도", type: "온도" },
  { model: "PS-4201", nameKo: "무선 온도(디스플레이)", type: "온도" },
  { model: "PS-3222", nameKo: "무선 온도 링크", type: "온도" },
  { model: "PS-4256", nameKo: "무선 열전대", type: "온도" },
  { model: "PS-3239", nameKo: "무선 녹는점 측정기", type: "온도" },
  { model: "PS-2125", nameKo: "패스포트 온도 센서", type: "온도" },
  { model: "PS-2143", nameKo: "4채널 온도 센서", type: "온도" },
  { model: "PS-2134", nameKo: "K형 열전대 온도 센서", type: "온도" },
  { model: "PS-2151", nameKo: "수온약층 센서", type: "온도" },
  { model: "CI-6605", nameKo: "온도 센서(아날로그)", type: "온도" },
  // pH
  { model: "PS-3204", nameKo: "무선 pH", type: "pH" },
  { model: "PS-4204", nameKo: "무선 pH(디스플레이)", type: "pH" },
  { model: "PS-7914", nameKo: "평면 pH 프로브", type: "pH" },
  { model: "PS-2102", nameKo: "패스포트 pH 센서", type: "pH" },
  // 힘
  { model: "PS-3202", nameKo: "무선 힘·가속도", type: "힘" },
  { model: "PS-3216", nameKo: "무선 로드셀·가속도계", type: "힘" },
  { model: "PS-3229", nameKo: "무선 힘 측정판", type: "힘" },
  { model: "PS-3230", nameKo: "무선 2축 힘 측정판", type: "힘" },
  { model: "PS-3253", nameKo: "무선 악력계", type: "힘" },
  { model: "PS-2104", nameKo: "패스포트 힘 센서", type: "힘" },
  { model: "PS-2189", nameKo: "고분해능 힘 센서", type: "힘" },
  { model: "PS-2141", nameKo: "힘 측정판", type: "힘" },
  { model: "PS-2142", nameKo: "2축 힘 측정판", type: "힘" },
  { model: "PS-2199", nameKo: "로드셀 세트", type: "힘" },
  { model: "PS-2206", nameKo: "로드셀 이중 앰프 세트", type: "힘" },
  { model: "CI-6537", nameKo: "힘 센서(아날로그)", type: "힘" },
  // 운동(거리)
  { model: "PS-3219", nameKo: "무선 운동", type: "운동(거리)" },
  { model: "PS-3225", nameKo: "무선 스마트 게이트", type: "운동(거리)" },
  { model: "ME-1240", nameKo: "스마트 카트(빨강)", type: "운동(거리)" },
  { model: "ME-1241", nameKo: "스마트 카트(파랑)", type: "운동(거리)" },
  { model: "PS-2103", nameKo: "패스포트 운동 센서", type: "운동(거리)" },
  { model: "PS-2204", nameKo: "변위 센서", type: "운동(거리)" },
  { model: "PS-2180", nameKo: "스마트 게이트", type: "운동(거리)" },
  { model: "CI-6742", nameKo: "운동 센서 II", type: "운동(거리)" },
  // 가속도
  { model: "PS-3223", nameKo: "무선 가속도·고도계", type: "가속도" },
  // 회전
  { model: "PS-3220", nameKo: "무선 회전 운동", type: "회전" },
  { model: "PS-2120", nameKo: "회전 운동 센서", type: "회전" },
  { model: "PS-2137", nameKo: "각도계 센서", type: "회전" },
  { model: "CI-6538", nameKo: "회전 운동 센서(아날로그)", type: "회전" },
  // 전압
  { model: "PS-3211", nameKo: "무선 전압", type: "전압" },
  { model: "PS-4254", nameKo: "무선 전압·전류", type: "전압" },
  { model: "PS-3240", nameKo: "무선 전하", type: "전압" },
  { model: "PS-2115", nameKo: "전압·전류 센서", type: "전압" },
  // 전류
  { model: "PS-3212", nameKo: "무선 전류", type: "전류" },
  { model: "EM-3534", nameKo: "무선 전류 모듈", type: "전류" },
  { model: "PS-2160", nameKo: "검류계", type: "전류" },
  // 자기장
  { model: "PS-3221", nameKo: "무선 자기장", type: "자기장" },
  { model: "PS-2162", nameKo: "2축 자기장 센서", type: "자기장" },
  { model: "PS-2112", nameKo: "자기장 센서", type: "자기장" },
  { model: "CI-6520", nameKo: "자기장 센서(아날로그)", type: "자기장" },
  // 조도
  { model: "PS-3248", nameKo: "무선 빛·색", type: "조도" },
  { model: "PS-3213", nameKo: "무선 빛(구형)", type: "조도" },
  { model: "OS-8441", nameKo: "무선 회절 스캐너", type: "조도" },
  { model: "PS-2150", nameKo: "광대역 빛 센서", type: "조도" },
  { model: "PS-2176", nameKo: "고감도 빛 센서", type: "조도" },
  { model: "CI-6504", nameKo: "빛 센서(아날로그)", type: "조도" },
  { model: "CI-6604", nameKo: "고감도 빛 센서(아날로그)", type: "조도" },
  // 소리
  { model: "PS-3227", nameKo: "무선 소리", type: "소리" },
  { model: "UI-5101", nameKo: "소리 센서(마이크 포함)", type: "소리" },
  // 압력
  { model: "PS-3203", nameKo: "무선 압력", type: "압력" },
  { model: "PS-4257", nameKo: "무선 절대압력·온도", type: "압력" },
  { model: "PS-4255", nameKo: "무선 기압계", type: "압력" },
  { model: "PS-2107", nameKo: "절대압력 센서", type: "압력" },
  { model: "PS-2146", nameKo: "절대압력·온도 센서", type: "압력" },
  { model: "PS-2181", nameKo: "이중 압력 센서", type: "압력" },
  // 방사선
  { model: "PS-3238", nameKo: "무선 가이거 계수기", type: "방사선" },
  { model: "NU-3345", nameKo: "무선 가이거 계수기(시료 홀더 포함)", type: "방사선" },
  // 전도도
  { model: "PS-3210", nameKo: "무선 전도도", type: "전도도" },
  { model: "PS-4210", nameKo: "무선 전도도(디스플레이)", type: "전도도" },
  { model: "PS-2195", nameKo: "염도 센서", type: "전도도" },
  // 용존산소
  { model: "PS-3246", nameKo: "무선 광학 용존산소", type: "용존산소" },
  { model: "PS-3224", nameKo: "무선 용존산소(구형)", type: "용존산소" },
  // 이온·수질 (이온 선택성 전극)
  { model: "PS-7915", nameKo: "ORP 전극", type: "이온·수질" },
  { model: "PS-7916", nameKo: "암모늄 이온 전극", type: "이온·수질" },
  { model: "PS-7917", nameKo: "CO₂ 이온 전극", type: "이온·수질" },
  { model: "PS-7918", nameKo: "칼슘 이온 전극", type: "이온·수질" },
  { model: "PS-7919", nameKo: "염화 이온 전극", type: "이온·수질" },
  { model: "PS-7920", nameKo: "칼륨 이온 전극", type: "이온·수질" },
  { model: "PS-7921", nameKo: "질산 이온 전극", type: "이온·수질" },
  // 분광
  { model: "PS-2600", nameKo: "무선 분광기(가시광, 형광)", type: "분광" },
  { model: "SE-3607", nameKo: "자외선·가시광 분광기", type: "분광" },
  // 편광
  { model: "PS-3237", nameKo: "무선 편광계", type: "편광" },
  // 색·탁도
  { model: "PS-3215", nameKo: "무선 비색·탁도", type: "색·탁도" },
  { model: "PS-2179", nameKo: "수질 비색계", type: "색·탁도" },
  // CO₂
  { model: "PS-3208", nameKo: "무선 이산화탄소", type: "CO₂" },
  { model: "PS-2110", nameKo: "패스포트 이산화탄소 센서", type: "CO₂", discontinued: true },
  // 산소
  { model: "PS-3217", nameKo: "무선 산소 기체", type: "산소" },
  { model: "PS-2126", nameKo: "패스포트 산소 기체 센서", type: "산소", discontinued: true },
  // 심박·생체 (부록 "심박" + "생체")
  { model: "PS-3206", nameKo: "손잡이형 심박", type: "심박·생체" },
  { model: "PS-3207", nameKo: "운동용 심박", type: "심박·생체" },
  { model: "PS-3236", nameKo: "무선 심전도", type: "심박·생체" },
  { model: "PS-3218", nameKo: "무선 혈압", type: "심박·생체" },
  { model: "PS-3234", nameKo: "무선 폐활량계", type: "심박·생체" },
  { model: "PS-2152", nameKo: "폐활량계", type: "심박·생체" },
  { model: "PS-2187", nameKo: "호흡수 센서", type: "심박·생체" },
  // 습도
  { model: "PS-3228", nameKo: "무선 토양 수분", type: "습도" },
  // 기상
  { model: "PS-3209", nameKo: "무선 기상(GPS)", type: "기상" },
  { model: "PS-3226", nameKo: "무선 대기질", type: "기상" },
  // 인터페이스
  { model: "PS-3200", nameKo: "AirLink 인터페이스", type: "인터페이스" },
  { model: "PS-2011", nameKo: "SPARKlink Air", type: "인터페이스" },
  { model: "UI-5001", nameKo: "550 유니버설 인터페이스", type: "인터페이스" },
  { model: "UI-5000", nameKo: "850 유니버설 인터페이스", type: "인터페이스" },
  { model: "PS-3600", nameKo: "SPARK LXi2", type: "인터페이스" },
  { model: "PS-3620", nameKo: "SPARK LX", type: "인터페이스" },
  // 코딩 보드
  { model: "PS-3231", nameKo: "//code.Node", type: "코딩 보드" },
  { model: "PS-3232", nameKo: "//control.Node", type: "코딩 보드" },
  // 기타
  { model: "PS-4252", nameKo: "무선 에탄올", type: "기타" },
  { model: "PS-3214", nameKo: "무선 드롭 카운터", type: "기타" },
  { model: "PS-2194", nameKo: "에탄올 센서", type: "기타" },
  { model: "PS-2117", nameKo: "고정밀 드롭 카운터", type: "기타" },
  { model: "PS-2225", nameKo: "유량 센서(벤투리관)", type: "기타" },
  { model: "PS-2226", nameKo: "유량 센서(피토관)", type: "기타" },
];

/** 후보 최대 줄 수 (rules sensor.catalog.suggest — 최대 6줄) */
export const PASCO_SUGGEST_MAX = 6;

export const CATALOG_TEXT = {
  fillNote: "카탈로그에서 종류·이름을 채웠어요",
  raw: "목록에 없어요 — 그대로 적기",
  badge: "카탈로그",
} as const;

/** 비교 글자: 대소문자·하이픈·공백 무시 */
export function catalogKey(s: string): string {
  return s.toLowerCase().replace(/[\s\-‐‑–—_]/g, "");
}

/** 후보 행 caption "무선 비색·탁도 · 색·탁도" */
export function pascoCaption(m: PascoModel): string {
  return `${m.nameKo} · ${m.type}`;
}

/**
 * 모델번호·한국어 이름 검색 (rules sensor.catalog.suggest): 대소문자·하이픈·공백 무시, 최대 6개.
 * 순서: 모델번호 앞부분 일치 → 모델번호 안 일치(이 둘은 모델번호 순 — 시안 17-model "PS-321" → 3210 · 3211 · 3212 · 3213 · 3215 …)
 * → 이름·종류 일치(카탈로그 순서). 같은 순위 안에서 판매 중단은 뒤로.
 */
export function searchPascoCatalog(query: string, max: number = PASCO_SUGGEST_MAX): PascoModel[] {
  const q = catalogKey(query);
  if (!q) return [];
  const scored: { m: PascoModel; rank: number; i: number }[] = [];
  PASCO_CATALOG.forEach((m, i) => {
    const model = catalogKey(m.model);
    let rank = -1;
    if (model.startsWith(q)) rank = 0;
    else if (model.includes(q)) rank = 1;
    else if (catalogKey(m.nameKo).includes(q) || catalogKey(m.type).includes(q)) rank = 2;
    if (rank < 0) return;
    scored.push({ m, rank: rank * 2 + (m.discontinued ? 1 : 0), i });
  });
  scored.sort((a, b) => a.rank - b.rank || (a.rank < 4 ? a.m.model.localeCompare(b.m.model) : 0) || a.i - b.i);
  return scored.slice(0, Math.max(0, max)).map((s) => s.m);
}

/** 정확 일치 (대소문자·하이픈·공백 무시) — "ps3215" → PS-3215. 없으면 null */
export function findPascoModel(model: string | null | undefined): PascoModel | null {
  if (!model) return null;
  const q = catalogKey(model);
  if (!q) return null;
  return PASCO_CATALOG.find((m) => catalogKey(m.model) === q) ?? null;
}

/** 회사 이름이 파스코 계열인지 (PASCO · Pasco Scientific · 파스코) */
export function isPascoMaker(maker: string | null | undefined): boolean {
  if (!maker) return false;
  const k = catalogKey(maker);
  return k === catalogKey(PASCO_MAKER) || k.startsWith("pasco");
}

/**
 * 후보 행에서 입력과 맞은 글자 범위 (bold 표시용). 하이픈·공백을 건너뛰고 맞춘 원래 글자의 [시작, 끝).
 * 맞지 않으면 null.
 */
export function catalogMatchRange(text: string, query: string): [number, number] | null {
  const q = catalogKey(query);
  if (!q) return null;
  const map: number[] = [];
  let key = "";
  for (let i = 0; i < text.length; i++) {
    const c = catalogKey(text[i]);
    if (!c) continue;
    for (const ch of c) {
      key += ch;
      map.push(i);
    }
  }
  const at = key.indexOf(q);
  if (at < 0) return null;
  return [map[at], map[at + q.length - 1] + 1];
}

/**
 * 카탈로그 모델을 고르면 채울 값 (rules sensor.catalog.fill): 모델명 = 모델번호, 종류 = 카탈로그 종류,
 * 이름이 비었으면 이름 = 한국어 이름. filled = 채운 칸 이름 (catalog-fill-note 문구용).
 */
export function catalogFill(m: PascoModel, current: { name: string }): {
  model: string;
  type: SensorType;
  name: string;
  filled: ("type" | "name")[];
} {
  const nameEmpty = current.name.trim() === "";
  return {
    model: m.model,
    type: m.type,
    name: nameEmpty ? m.nameKo : current.name,
    filled: nameEmpty ? ["type", "name"] : ["type"],
  };
}

/** catalog-fill-note 문구 — 채운 칸만 ("카탈로그에서 종류·이름을 채웠어요" / "카탈로그에서 종류를 채웠어요") */
export function catalogFillNote(filled: readonly ("type" | "name")[]): string {
  const hasType = filled.includes("type");
  const hasName = filled.includes("name");
  if (hasType && hasName) return CATALOG_TEXT.fillNote;
  if (hasType) return "카탈로그에서 종류를 채웠어요";
  if (hasName) return "카탈로그에서 이름을 채웠어요";
  return "";
}
