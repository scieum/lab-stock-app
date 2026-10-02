import { BadgeLowStock } from "@/components/badge-low-stock";
import { FeatureCard } from "@/components/feature-card";
import { LandingCta } from "@/components/landing-cta";
import { LandingHero } from "@/components/landing-hero";
import { NavPill } from "@/components/nav-pill";
import styles from "./landing.module.css";

/**
 * 화면 15 — 랜딩 (시안 15-mobile · 15-desktop). 경로 `/` 로그인 전 (dev-rules.json route_auth).
 * 로그인 전 화면이라 tab-bar·학교명 없음. nav-pill 은 워드마크만 (시안).
 * 기능 카드 4개 — 글귀는 시안 그대로. 하늘색은 아이콘, 핑크는 badge-low-stock 안에서만.
 */
export function LandingScreen() {
  return (
    <div className={styles.page}>
      <div className={styles.body}>
        <NavPill />
        <LandingHero />
        <div className={styles.features}>
          <FeatureCard
            icon="building"
            title="학교별 분리"
            description="우리 학교 시약·재고·사용 기록만 보여요. 다른 학교와 섞이지 않아요"
          />
          <FeatureCard
            icon="map-pin"
            title="NEIS 학교 선택"
            description="회원가입 때 시/도 → 지역 → 학교 순서로 우리 학교를 골라요"
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
      <LandingCta signupHref="/signup" loginHref="/login" className={styles.cta} />
    </div>
  );
}
