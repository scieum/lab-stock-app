import { FeatureCard } from "@/components/feature-card";
import styles from "./auth-intro.module.css";

/**
 * 로그인(1)·회원가입(14) 데스크톱 오른쪽 서비스 소개 패널 (시안 1·14-desktop intro-panel, d7 §23 run d 세부):
 * 720 폭 회색(gray-50) · padding 64 · 사이 24 — intro-title 24/700 + intro-lead 17/300 회색 → 흰 feature-card 4장(가로, 사이 12).
 * 문구는 시안 그대로. 폼이 길어(14) 스크롤해도 화면 안에 머문다.
 */
export function AuthIntro() {
  return (
    <aside className={styles.panel} aria-label="서비스 소개">
      <div className={styles.head}>
        <p className={styles.title}>과학실 시약, 학교별로 한눈에 관리해요</p>
        <p className={styles.lead}>시약 재고·사용 기록·MSDS를 QR로 연결하고, 재고가 부족하면 알려 줘요</p>
      </div>
      <div className={styles.list}>
        <FeatureCard
          variant="row"
          icon="building"
          title="학교별 분리"
          description="우리 학교 시약·재고·사용 기록만 보여요. 다른 학교와 섞이지 않아요"
        />
        <FeatureCard
          variant="row"
          icon="map-pin"
          title="NEIS 학교 선택"
          description="회원가입 때 시/도 → 지역 → 학교급 → 학교 순서로 우리 학교를 골라요"
        />
        <FeatureCard variant="row" icon="qr" title="QR 스캔" description="시약장 QR을 찍으면 시약 정보와 MSDS가 바로 열려요" />
        <FeatureCard variant="row" icon="bell" title="재고 부족 알림" description="필요한 양보다 적으면 알려 주고 판매처로 연결해요" />
      </div>
    </aside>
  );
}
