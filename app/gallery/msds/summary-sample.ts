import type { MsdsSummary } from "@/lib/msds-summary";

/** 시안 16 (질산은) — 신호어 위험 · 그림문자 산화성·부식성·수생환경 유해성 · 항목 2·4·7·8 (4는 "더 보기" 펼침용으로 줄 더) */
export const sampleMsdsSummary: MsdsSummary = {
  signalWord: "위험",
  pictograms: ["GHS03", "GHS05", "GHS09"],
  sections: {
    s2: ["화재를 강렬하게 할 수 있어요(산화제)", "피부에 심한 화상과 눈 손상을 일으켜요", "수생생물에 매우 유독하고 오래 영향을 줘요"],
    s4: [
      "눈에 들어가면 물로 15분 이상 씻고 의사의 진료를 받아요",
      "피부에 묻으면 오염된 옷을 벗고 물로 씻어요",
      "삼켰을 때 억지로 토하게 하지 마세요",
      "신선한 공기가 있는 곳으로 옮겨요",
      "호흡하지 않으면 인공호흡을 해요",
    ],
    s7: ["가연성 물질·환원제와 떨어뜨려 보관해요", "빛을 피해 갈색 병에, 서늘하고 건조한 곳에 둬요", "용기를 꼭 닫아 둬요"],
    s8: ["보안경·내화학 장갑·실험복을 착용해요", "가루가 날리면 국소 배기 장치를 켜요", "작업 뒤 손을 씻어요"],
  },
};

/** 신호어 경고 · 항목 일부 실패(null)·빈 항목 */
export const sampleMsdsSummaryWarning: MsdsSummary = {
  signalWord: "경고",
  pictograms: ["GHS07"],
  sections: {
    s2: ["피부에 자극을 일으켜요"],
    s4: null,
    s7: [],
    s8: ["보안경을 착용해요"],
  },
};
