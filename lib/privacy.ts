/**
 * 개인정보 처리방침(화면 19 /privacy)·회원가입 동의 펼침(화면 14 privacy-consent-detail)의 한 곳 출처
 * (design/rules.json 1.32 privacy_page · privacy_consent · d7 §30).
 */
export const PRIVACY_HREF = "/privacy";
export const PRIVACY_TITLE = "개인정보 처리방침";
/** 시행일 = 이번 배포일 (d7 §30) */
export const PRIVACY_EFFECTIVE_DATE = "2026-10-29";
/** 보호책임자 (2026-10-29 사용자 결정) */
export const PRIVACY_OFFICER = "Lab_Stock 운영자 · gkrngkdus22@gmail.com";

export type PrivacyProcessor = { name: string; role: string; location: string };

/** 처리 위탁·국외 이전 (privacy-table) */
export const PRIVACY_PROCESSORS: PrivacyProcessor[] = [
  { name: "Supabase", role: "DB·로그인", location: "서울" },
  { name: "Vercel", role: "호스팅", location: "서울" },
  { name: "Google Gemini", role: "AI 서류 읽기(올린 파일은 읽기에만 쓰고 저장하지 않음)", location: "국외(미국)" },
];

/** rules privacy_consent.copy — 회원가입 동의 펼침 항목 (순서 고정) */
export const PRIVACY_CONSENT_ITEMS: { title: string; body: string }[] = [
  { title: "수집 목적", body: "회원 확인, 학교별 시약·센서 관리, 사용·입고 기록에 이름 표시, 초대·안내 메일" },
  { title: "수집 항목", body: "(필수) 이름, 개인 이메일, 비밀번호(암호화 저장), 학교(NEIS 학교 정보), 역할 · 자동 수집: 접속 기록" },
  { title: "보유 기간", body: "탈퇴할 때까지 (탈퇴·학교 계정 삭제 시 바로 파기)" },
  {
    title: "처리 위탁·국외 이전",
    body: "Supabase(DB·로그인, 서울) · Vercel(호스팅, 서울) · Google Gemini(AI 서류 읽기, 국외 — 올린 파일은 읽기에만 쓰고 저장하지 않음)",
  },
  { title: "동의 거부 권리", body: "동의하지 않을 수 있지만, 동의하지 않으면 가입할 수 없어요" },
  { title: "보호책임자", body: PRIVACY_OFFICER },
];

export const PRIVACY_LINK_LABEL = "개인정보 처리방침 전문 보기";

export type PrivacySection = {
  id: string;
  /** 목차·절 제목 ("1 수집 목적") */
  title: string;
  /** 문단 (줄마다 하나) */
  paragraphs: string[];
  /** true = 문단 뒤 privacy-table (4절) */
  table?: boolean;
  /** 표 뒤 문단 (4절 국외 이전 고지) */
  after?: string[];
};

/** rules privacy_page.doc 절 순서 */
export const PRIVACY_SECTIONS: PrivacySection[] = [
  {
    id: "purpose",
    title: "1 수집 목적",
    paragraphs: ["회원 확인, 학교별 시약·센서 관리, 사용·입고 기록에 이름 표시, 초대·안내 메일에 개인정보를 써요."],
  },
  {
    id: "items",
    title: "2 수집 항목",
    paragraphs: ["(필수) 이름, 개인 이메일, 비밀번호(암호화 저장), 학교(NEIS 학교 정보), 역할", "자동 수집: 접속 기록"],
  },
  {
    id: "retention",
    title: "3 보유·파기",
    paragraphs: ["탈퇴할 때까지 보관해요. 탈퇴하거나 학교 계정을 삭제하면 바로 파기해요."],
  },
  {
    id: "processors",
    title: "4 처리 위탁·국외 이전",
    paragraphs: ["서비스 운영을 위해 아래 업체에 처리를 맡겨요."],
    table: true,
    after: [
      "국외 이전: 이전 국가 = 미국 · 이전받는 자 = Google LLC(Gemini API) · 이전 항목 = 입고 화면에서 올린 거래명세서·납품서 사진이나 PDF에 적힌 내용 · 이전 시기·방법 = 파일을 올릴 때마다 암호화된 통신으로 보내요.",
      "보유·이용 기간: AI 서류 읽기에만 쓰고, Lab_Stock은 올린 파일을 저장하지 않아요.",
      "거부 방법과 결과: AI 서류 읽기를 쓰지 않으면 국외로 보내지 않아요. 이때는 입고 목록을 직접 입력해야 해요.",
    ],
  },
  {
    id: "rights",
    title: "5 이용자 권리",
    paragraphs: ["언제든 내 개인정보의 열람·정정·삭제·처리정지를 요청할 수 있어요. 보호책임자 이메일로 요청해 주세요."],
  },
  { id: "officer", title: "6 보호책임자", paragraphs: [PRIVACY_OFFICER] },
  { id: "effective", title: "7 시행일", paragraphs: [`이 방침은 ${PRIVACY_EFFECTIVE_DATE}부터 적용해요.`] },
];
