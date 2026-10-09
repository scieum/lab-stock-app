import { BadgeLowStock } from "@/components/badge-low-stock";
import { FeatureCard } from "@/components/feature-card";
import { GuestEntry } from "@/components/guest-entry";
import { LandingCta } from "@/components/landing-cta";
import { LandingHero } from "@/components/landing-hero";
import { NavPill } from "@/components/nav-pill";
import { DesktopOnly, MobileOnly } from "@/components/viewport-only";
import { LandingDesktop } from "./landing-desktop";
import styles from "./landing.module.css";

/**
 * 화면 15 — 랜딩. 경로 `/` 로그인 전 (dev-rules.json route_auth). 로그인 전 화면이라 tab-bar·학교명 없음.
 * - 모바일(15-mobile): nav-pill(워드마크) → landing-hero → feature-card 4 → 하단 landing-cta(+ guest-entry).
 * - 데스크톱(15-desktop, d7 §23 run d): web-header + 긴 웹 랜딩 (LandingDesktop).
 * 첫 그림(폭 모름)에는 둘 다 그리고 CSS 로 한쪽만 보이며, 하이드레이션 뒤 맞지 않는 쪽은 DOM 에서 빠진다 (components/viewport-only).
 */
export function LandingScreen() {
  return (
    <>
      <MobileOnly>
        <LandingMobile />
      </MobileOnly>
      <DesktopOnly>
        <LandingDesktop />
      </DesktopOnly>
    </>
  );
}

/**
 * 15-mobile — 기능 카드 4개, 글귀·줄바꿈("\n")은 시안 그대로. 하늘색은 아이콘, 핑크는 badge-low-stock 안에서만.
 * landing-cta 아래 guest-entry "둘러보기" → /demo (dev-rules.json routes 13-guest, rules.json guest.entry_component).
 */
function LandingMobile() {
  return (
    <div className={styles.page}>
      <div className={styles.body}>
        <NavPill />
        <LandingHero />
        <div className={styles.features}>
          <FeatureCard
            icon="building"
            title="학교별 분리"
            description={"우리 학교 시약·재고·사용 기록만 보여요.\n다른 학교와 섞이지 않아요"}
          />
          <FeatureCard
            icon="map-pin"
            title="NEIS 학교 선택"
            description={"회원가입 때 시/도 → 지역 → 학교급 → 학교\n순서로 우리 학교를 골라요"}
          />
          <FeatureCard icon="qr" title="QR 스캔" description="시약장 QR을 찍으면 시약 정보와 MSDS가 바로 열려요" />
          <FeatureCard
            icon="bell"
            title="재고 부족 알림"
            description="필요한 양보다 적으면 알려 주고 판매처로 연결해요"
            badge={<BadgeLowStock />}
          />
        </div>
      </div>
      <LandingCta signupHref="/signup" loginHref="/login" guest={<GuestEntry href="/demo" />} className={styles.cta} />
    </div>
  );
}
