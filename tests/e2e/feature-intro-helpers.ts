// 화면 13 신기능 소개 팝업 (rules.json feature_intro · d7 §30) 공통 helper.
// 저장 키 = 구현의 브라우저 저장 키 (닫기 = sessionStorage, 일주일 = localStorage 만료 시각, 주 버튼 = localStorage 영구).
// 팝업 자체를 보지 않는 기존 홈 테스트는 hideFeatureIntro 로 "이번 접속에서 닫음" 을 미리 주입해 팝업이 홈을 덮지 않게 한다.
import type { BrowserContext } from "@playwright/test";

export const FEATURE_INTRO_KEY = "lab-stock:feature-intro:ai-intake-2026-10";
export const FI_CLOSED = `${FEATURE_INTRO_KEY}:closed`; // sessionStorage
export const FI_UNTIL = `${FEATURE_INTRO_KEY}:until`; // localStorage (만료 시각 ms)
export const FI_NEVER = `${FEATURE_INTRO_KEY}:never`; // localStorage

/** 새 컨텍스트의 모든 탭·이동에서 팝업을 '닫힘'(이번 접속) 상태로 시작 */
export async function hideFeatureIntro(context: BrowserContext): Promise<void> {
  await context.addInitScript((key) => {
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      // 저장소 없음 = 구현도 팝업을 띄우지 않는다
    }
  }, FI_CLOSED);
}
