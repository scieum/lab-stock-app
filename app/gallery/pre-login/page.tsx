import type { Metadata } from "next";
import { AppSidebar } from "@/components/app-sidebar";
import { CtaBand } from "@/components/cta-band";
import { FeatureCard } from "@/components/feature-card";
import { GuestEntry } from "@/components/guest-entry";
import { GuestToastProvider } from "@/components/guest-lock/toast";
import { LandingCta } from "@/components/landing-cta";
import { LandingHero } from "@/components/landing-hero";
import { LandingSection } from "@/components/landing-section";
import { LandingTabs } from "@/components/landing-tabs";
import { ProductShot, Shot, ShotFilter, ShotReagentTable, ShotSignup, ShotUsageForm } from "@/components/product-shot";
import { StepFlow } from "@/components/step-flow";
import { WebFooter } from "@/components/web-footer";
import { WebHeader } from "@/components/web-header";
import { guestSidebarMenu } from "@/lib/sidebar-menu";
import styles from "../gallery.module.css";
import local from "./pre-login.module.css";

export const metadata: Metadata = { title: "로그인 전 · 랜딩 · 둘러보기 컴포넌트 · Lab_Stock" };

function Item({ id, name, children }: { id: string; name: string; children: React.ReactNode }) {
  return (
    <section className={[styles.item, styles.wide].join(" ")} aria-labelledby={`g-${id}`}>
      <h2 id={`g-${id}`} className={styles.itemName}>
        {name}
      </h2>
      <div className={[styles.stage, local.flush].join(" ")}>{children}</div>
    </section>
  );
}

/**
 * 데스크톱 재구성 run d 갤러리 (d7 §23, rules.json 1.24 desktop_shell.pre_login · landing_rhythm · footer · guest.desktop):
 * web-header 3종(1 · 14 · 15) · 랜딩 컴포넌트(product-shot · landing-tabs · landing-section · step-flow · cta-band · web-footer) ·
 * feature-card 세 모양 · 둘러보기 사이드바. 폭 1440 에서 보는 예시 (그림은 HTML/CSS 로 그린 화면 조각).
 */
export default function GalleryPreLoginPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>로그인 전 · 랜딩 · 둘러보기</h1>
      <p className={styles.lead}>
        web-header(전폭 64, radius 0) · landing-hero(48 두 줄) · product-shot · landing-tabs(고정 · 하늘색 밑줄) · landing-section(글·화면 좌우 번갈아) ·
        step-flow(검정 띠 5단계) · cta-band(검정 띠 반전 버튼) · web-footer(가운데 한 줄) · 둘러보기 app-sidebar(guest-lock 2)
      </p>
      <div className={styles.grid}>
        <Item id="web-header" name="web-header — 15 랜딩(로그인 + 회원가입) · 1 로그인(회원가입만) · 14 회원가입(로그인만)">
          <WebHeader actions="both" />
          <WebHeader actions="signup" />
          <WebHeader actions="login" />
        </Item>

        <Item id="hero" name="landing-hero(split) + landing-cta(inline) + guest-entry(link) + product-shot (시안 15-desktop 히어로)">
          <LandingHero
            layout="split"
            lead="초·중·고 과학실 시약 관리"
            title={"우리 학교 시약장,\n한 화면에서 관리해요"}
            subtitle={"무엇이 얼마나 남았는지, 누가 언제 썼는지\n학교별로 따로, 안전하게 기록해요."}
            aside={<ProductShot />}
          >
            <div className={local.heroActions}>
              <LandingCta layout="inline" signupLabel="회원가입하고 시작하기" />
              <GuestEntry variant="link" />
            </div>
          </LandingHero>
        </Item>

        <Item id="tabs" name="landing-tabs (스크롤하면 web-header 아래 고정, 보이는 섹션 탭에 하늘색 밑줄)">
          <LandingTabs
            tabs={[
              { id: "g-section", label: "시약 목록" },
              { id: "g-step", label: "사용 기록" },
              { id: "g-cta", label: "재주문 알림" },
            ]}
          />
        </Item>

        <Item id="section" name="landing-section (꼬리표 · 제목 40 · 점 목록 3 · 화면 조각 2 — 글 왼쪽 / 흰 띠)">
          <LandingSection
            id="g-section"
            tag="시약 목록"
            title="필요한 시약을 바로 찾아요"
            points={["이름 · 보관 분류 · 보관 위치로 거르고 정렬해요", "재고가 부족한 시약은 배지로 바로 보여요", "MSDS 요약을 목록에서 바로 열어요"]}
            link={{ href: "/demo/reagents", label: "둘러보기에서 보기" }}
            shot={
              <Shot label="시약 목록 표 화면 예시" bleed="right">
                <ShotReagentTable />
              </Shot>
            }
            overlay={
              <Shot label="필터 화면 예시">
                <ShotFilter />
              </Shot>
            }
          />
        </Item>

        <Item id="step" name="step-flow (검정 띠 · 점 5 · 지금 단계 하늘색 링 · 단계 카드 gray-900 — 점을 누르면 카드가 바뀐다)">
          <StepFlow
            id="g-step"
            title="다섯 단계면 시작해요"
            steps={[
              {
                label: "학교 선택",
                title: "학교 선택",
                description: "회원가입 때 시/도 → 지역 → 학교급 → 학교 순서로 우리 학교를 골라요",
                checks: ["NEIS 공식 학교 정보로 골라요", "초 · 중 · 고 학교급을 먼저 골라요", "가입한 뒤에는 우리 학교 데이터만 보여요"],
                shot: (
                  <Shot label="학교 선택 화면 예시">
                    <ShotSignup />
                  </Shot>
                ),
              },
              {
                label: "사용 기록",
                title: "사용 기록",
                description: "학생 · 교사 누구나 사용량을 기록해요",
                checks: ["사용일을 골라 지난 날 사용도 남겨요", "쓴 만큼 재고가 바로 줄어요", "기록이 쌓이면 재주문 기준을 자동으로 계산해요"],
                shot: (
                  <Shot label="사용 기록 화면 예시">
                    <ShotUsageForm />
                  </Shot>
                ),
              },
            ]}
          />
        </Item>

        <Item id="cta" name="cta-band (검정 띠 · 제목 40 · 반전 button-primary 흰 채움 / button-outline 흰 테두리)">
          <div id="g-cta">
            <CtaBand
              title="우리 학교 시약장, 오늘 시작해요"
              description="학교를 고르고 이메일로 가입하면 바로 시작해요"
              primary={{ href: "/signup", label: "회원가입" }}
              secondary={{ href: "/demo", label: "둘러보기" }}
            />
          </div>
        </Item>

        <Item id="footer" name="web-footer (가운데 한 줄 · caption 12 · 위 hairline)">
          <WebFooter />
        </Item>

        <Item id="feature" name="feature-card — 15-mobile(회색 세로) · 1·14 소개 패널(흰 가로) · 15-desktop 문제 공감(흰 인용)">
          <div className={local.cards}>
            <FeatureCard icon="building" title="학교별 분리" description={"우리 학교 시약·재고·사용 기록만 보여요.\n다른 학교와 섞이지 않아요"} />
            <FeatureCard variant="row" icon="qr" title="QR 스캔" description="시약장 QR을 찍으면 시약 정보와 MSDS가 바로 열려요" />
            <FeatureCard variant="quote" icon="quote" description="시약이 얼마나 남았는지 장을 열어 봐야 알아요" caption="— 과학 교사" />
          </div>
        </Item>

        <Item id="guest-sidebar" name="app-sidebar — 둘러보기 (위 데모 학교 · 홈 활성 · 기록·QR 찾기 guest-lock 2 · 아래 둘러보는 중 + 로그인)">
          <GuestToastProvider>
            <AppSidebar schoolName="데모 학교" groups={guestSidebarMenu()} active="home" guest={{ loginHref: "/login" }} />
          </GuestToastProvider>
        </Item>
      </div>
    </main>
  );
}
