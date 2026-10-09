import { CtaBand } from "@/components/cta-band";
import { FeatureCard } from "@/components/feature-card";
import { GuestEntry } from "@/components/guest-entry";
import { Icon, type IconName } from "@/components/icons";
import { LandingCta } from "@/components/landing-cta";
import { LandingHero } from "@/components/landing-hero";
import { LandingSection } from "@/components/landing-section";
import { LandingTabs, type LandingTab } from "@/components/landing-tabs";
import {
  ProductShot,
  Shot,
  ShotCabinet,
  ShotCabinetQr,
  ShotFilter,
  ShotIntake,
  ShotReagentTable,
  ShotRecentUsage,
  ShotReorderAlert,
  ShotReorderDrawer,
  ShotSignup,
  ShotUsageForm,
} from "@/components/product-shot";
import { StepFlow, type Step } from "@/components/step-flow";
import { WebFooter } from "@/components/web-footer";
import { WebHeader } from "@/components/web-header";
import { LandingAudience } from "./landing-audience";
import { LandingMotion } from "./landing-motion";
import styles from "./landing-desktop.module.css";

/** landing-tabs (시안 15-desktop tab-row 문구) → 섹션 앵커 */
const TABS: LandingTab[] = [
  { id: "feature-reagents", label: "시약 목록" },
  { id: "feature-usage", label: "사용 기록" },
  { id: "feature-reorder", label: "재주문 알림" },
  { id: "feature-qr", label: "QR 찾기" },
  { id: "trust", label: "학교별 분리" },
];

const PROBLEMS = [
  "시약이 얼마나 남았는지 장을 열어 봐야 알아요",
  "누가 언제 얼마나 썼는지 공책에 적다 보니 빠지는 게 많아요",
  "MSDS를 보려면 매번 사이트를 찾아 들어가야 해요",
];

const DEMO_LINK = "둘러보기에서 보기";

/**
 * 다섯 단계 (시안 15-desktop step-flow). 1단계 = 시안 step-card 문구 그대로.
 * 2~5단계는 시안에 카드가 그려지지 않아 같은 모양으로, 랜딩·앱 화면에 이미 쓰인 문구를 모아 채웠다.
 */
const STEPS: Step[] = [
  {
    label: "학교 선택",
    title: "학교 선택",
    description: "회원가입 때 시/도 → 지역 → 학교급 → 학교 순서로 우리 학교를 골라요",
    checks: ["NEIS 공식 학교 정보로 골라요", "초 · 중 · 고 학교급을 먼저 골라요", "가입한 뒤에는 우리 학교 데이터만 보여요"],
    shot: (
      <Shot label="회원가입 학교 선택 화면 예시">
        <ShotSignup />
      </Shot>
    ),
  },
  {
    label: "시약 등록",
    title: "시약 등록",
    description: "서류를 올리면 AI가 품목을 읽고, 확인한 뒤 저장해요",
    checks: ["거래명세서로 여러 품목을 한 번에 입고해요", "한 종씩 직접 입력해도 돼요", "MSDS를 찾아 시약에 연결해요"],
    shot: (
      <Shot label="서류로 입고 화면 예시">
        <ShotIntake />
      </Shot>
    ),
  },
  {
    label: "칸 지정",
    title: "칸 지정",
    description: "시약장마다 고정 번호와 QR 라벨이 있어요",
    checks: ["칸마다 보관 분류를 정해요", "섞으면 위험한 조합은 칸에 넣을 때 알려 줘요", "시약을 넣을 칸을 추천해 줘요"],
    shot: (
      <Shot label="시약장 칸 화면 예시">
        <ShotCabinet />
      </Shot>
    ),
  },
  {
    label: "사용 기록",
    title: "사용 기록",
    description: "학생 · 교사 누구나 사용량을 기록해요",
    checks: ["사용일을 골라 지난 날 사용도 남겨요", "쓴 만큼 재고가 바로 줄어요", "기록이 쌓이면 재주문 기준을 자동으로 계산해요"],
    shot: (
      <Shot label="사용 기록 입력 화면 예시">
        <ShotUsageForm />
      </Shot>
    ),
  },
  {
    label: "재주문 알림",
    title: "재주문 알림",
    description: "재주문 기준보다 적으면 교사 · 관리자에게 알려요",
    checks: ["알림에서 판매처로 바로 이어져요", "기준은 직접 넣거나 자동으로 계산해요", "재고가 부족한 시약은 배지로 바로 보여요"],
    shot: (
      <Shot label="재주문 기준 화면 예시">
        <ShotReorderDrawer />
      </Shot>
    ),
  },
];

const TRUST: { icon: IconName; title: string; desc: string }[] = [
  { icon: "building", title: "학교별 데이터 분리", desc: "다른 학교의 시약 · 재고 · 사용 기록과 섞이지 않아요" },
  { icon: "lock", title: "인증 정보는 서버에서만 처리", desc: "외부 서비스 연결 정보는 서버에서만 다루고 화면에 두지 않아요" },
  { icon: "map-pin", title: "NEIS 공식 학교 정보로 가입", desc: "나이스 학교기본정보로 우리 학교를 골라요" },
  { icon: "shield", title: "MSDS · GHS 정보 연결", desc: "한국산업안전보건공단 MSDS 요약과 GHS 그림문자를 보여 줘요" },
];

/**
 * 화면 15 랜딩 — 데스크톱 긴 페이지 (시안 15-desktop 1440 × 5626, rules.json 1.24 desktop_shell.pre_login.landing_sections · landing_rhythm,
 * d7 §23 run d 세부). 순서: web-header(고정) → 히어로(landing-hero · landing-cta · guest-entry · product-shot) →
 * landing-tabs(고정) → 문제 공감 feature-card 3(gray-50) → landing-section 4(흰/회/흰/회, 좌우 번갈아) →
 * step-flow 5단계(gray-950) → 대상 탭(흰) → 안심 2×2(gray-50, 격자선 gray-200, 운영 숫자 없음) → cta-band(gray-950) → web-footer(흰).
 * 그림은 모두 HTML/CSS 로 그린 화면 조각 (이미지 파일 아님).
 */
export function LandingDesktop() {
  return (
    <LandingMotion className={styles.page}>
      <WebHeader actions="both" sticky />
      <main className={styles.main}>
        <LandingHero
          layout="split"
          lead="초·중·고 과학실 시약 관리"
          title={"우리 학교 시약장,\n한 화면에서 관리해요"}
          subtitle={"무엇이 얼마나 남았는지, 누가 언제 썼는지\n학교별로 따로, 안전하게 기록해요."}
          aside={<ProductShot />}
        >
          <div className={styles.heroActions}>
            <LandingCta layout="inline" signupLabel="회원가입하고 시작하기" signupHref="/signup" loginHref="/login" />
            <GuestEntry href="/demo" variant="link" />
          </div>
          <p className={styles.heroPoints}>학교별 데이터 분리 · NEIS 학교 검색 · QR로 시약 찾기</p>
        </LandingHero>

        <LandingTabs tabs={TABS} />

        <section className={styles.bandMuted} aria-labelledby="landing-problem-title">
          <div className={styles.section}>
            <h2 id="landing-problem-title" className={styles.sectionTitle} data-reveal="">
              과학실 시약, 이렇게 관리하고 계신가요?
            </h2>
            <div className={styles.problemBody}>
              <div className={styles.problemRow}>
                {PROBLEMS.map((p) => (
                  <div key={p} className={styles.problemItem} data-reveal="">
                    <FeatureCard variant="quote" icon="quote" description={p} caption="— 과학 교사" />
                  </div>
                ))}
              </div>
              <p className={styles.closing} data-reveal="">
                Lab_Stock은 학교별 시약장 하나로 답해요.
              </p>
            </div>
          </div>
        </section>

        <LandingSection
          id="feature-reagents"
          band="white"
          side="left"
          shape="list"
          tag="시약 목록"
          title="필요한 시약을 바로 찾아요"
          points={["이름 · 보관 분류 · 보관 위치로 거르고 정렬해요", "재고가 부족한 시약은 배지로 바로 보여요", "MSDS 요약을 목록에서 바로 열어요"]}
          link={{ href: "/demo/reagents", label: DEMO_LINK }}
          shot={
            <Shot label="시약 목록 표 화면 예시" bleed="right">
              <ShotReagentTable />
            </Shot>
          }
          overlay={
            <Shot label="시약 목록 필터 화면 예시">
              <ShotFilter />
            </Shot>
          }
        />
        <LandingSection
          id="feature-usage"
          band="muted"
          side="right"
          shape="usage"
          tag="사용 기록"
          title="누가 얼마나 썼는지 남겨요"
          points={["학생 · 교사 누구나 사용량을 기록해요", "사용일을 골라 지난 날 사용도 남겨요", "기록이 쌓이면 재주문 기준을 자동으로 계산해요"]}
          link={{ href: "/demo", label: DEMO_LINK }}
          shot={
            <Shot label="최근 사용 기록 화면 예시" bleed="left">
              <ShotRecentUsage />
            </Shot>
          }
          overlay={
            <Shot label="사용 기록 입력 화면 예시">
              <ShotUsageForm />
            </Shot>
          }
        />
        <LandingSection
          id="feature-reorder"
          band="white"
          side="left"
          shape="reorder"
          tag="재주문 알림"
          title="부족해지기 전에 알려 줘요"
          points={["재주문 기준보다 적으면 교사 · 관리자에게 알려요", "알림에서 판매처로 바로 이어져요", "기준은 직접 넣거나 자동으로 계산해요"]}
          link={{ href: "/demo/reagents?filter=low-stock", label: DEMO_LINK }}
          shot={
            <Shot label="재주문 알림 화면 예시" bleed="right">
              <ShotReorderAlert />
            </Shot>
          }
          overlay={
            <Shot label="재주문 기준 화면 예시">
              <ShotReorderDrawer />
            </Shot>
          }
        />
        <LandingSection
          id="feature-qr"
          band="muted"
          side="right"
          shape="cabinet"
          tag="QR 찾기"
          title="시약장 QR로 칸까지 찾아요"
          points={["시약장마다 고정 번호와 QR 라벨이 있어요", "QR을 찍으면 그 시약장의 시약과 칸이 보여요", "섞으면 위험한 조합은 칸에 넣을 때 알려 줘요"]}
          link={{ href: "/demo/reagents", label: DEMO_LINK }}
          shot={
            <Shot label="시약장 칸 화면 예시" bleed="left">
              <ShotCabinet />
            </Shot>
          }
          overlay={
            <Shot label="QR 찾기 결과 화면 예시">
              <ShotCabinetQr />
            </Shot>
          }
        />

        <StepFlow title="다섯 단계면 시작해요" steps={STEPS} />

        <LandingAudience />

        <section id="trust" className={styles.bandMuted} aria-labelledby="landing-trust-title">
          <div className={styles.section}>
            <h2 id="landing-trust-title" className={styles.sectionTitle} data-reveal="">
              안심하고 쓰도록 만들었어요
            </h2>
            <ul className={styles.trustGrid}>
              {TRUST.map((t) => (
                <li key={t.title} className={styles.trustItem} data-reveal="">
                  <Icon name={t.icon} className={styles.cardIcon} />
                  <h3 className={styles.cardTitle}>{t.title}</h3>
                  <p className={styles.cardDesc}>{t.desc}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <CtaBand
          title="우리 학교 시약장, 오늘 시작해요"
          description="학교를 고르고 이메일로 가입하면 바로 시작해요"
          primary={{ href: "/signup", label: "회원가입" }}
          secondary={{ href: "/demo", label: "둘러보기" }}
        />
      </main>
      <WebFooter />
    </LandingMotion>
  );
}
