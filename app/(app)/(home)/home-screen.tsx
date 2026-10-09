import { redirect } from "next/navigation";
import { ButtonOutline } from "@/components/button-outline";
import { ButtonPillSoft } from "@/components/button-pill-soft";
import { GuestLockedButton } from "@/components/guest-lock/locked-button";
import { CabinetSummaryCard, HomeSummary, StockSummaryCard, SummaryEmptyCard } from "@/components/home-summary";
import { QuickAction, type QuickActionItem } from "@/components/quick-action";
import { ReagentRow } from "@/components/reagent-row";
import { ReorderAlertCard } from "@/components/reorder-alert-card";
import { DesktopOnly, MobileOnly } from "@/components/viewport-only";
import { getHomeData, type HomeData, type Role } from "@/lib/supabase/home-data";
import { HomeDesk } from "./home-desk";
import styles from "./home.module.css";

// 시안 13 quick-action — 역할별 2칸 (탭과 겹치는 QR·시약 목록·사용 기록 내역은 두지 않는다)
// 교사·admin 은 "시약장 설정" 1칸을 더 둔다 (시안 예외, 사용자 결정 2026-10-05: 모바일에서 화면 11 로 다시 들어갈 길).
// 진입 링크일 뿐이라 entry(역할 규칙이 세는 이름)는 붙이지 않는다 — 학생의 "시약장 보기" 와 같다.
const USAGE_NEW: QuickActionItem = { label: "사용 기록 입력", href: "/usage/new", icon: "pen" };
const CABINETS: QuickActionItem = { label: "시약장 보기", href: "/cabinets", icon: "cabinet" };
const CABINET_SETTINGS: QuickActionItem = { label: "시약장 설정", href: "/cabinets", icon: "cabinet" };
const INTAKE: QuickActionItem = { label: "입고", href: "/intake", icon: "intake", entry: "stock-intake" };
const QUICK_ACTIONS: Record<Role, QuickActionItem[]> = {
  student: [USAGE_NEW, CABINETS],
  teacher: [USAGE_NEW, INTAKE, CABINET_SETTINGS],
  admin: [INTAKE, { label: "사용자 관리", href: "/users", icon: "users", entry: "user-manage" }, CABINET_SETTINGS],
};
// 시안 13-guest quick-action: 학생과 같은 2칸, 둘 다 guest-lock (쓰기·범위 밖 진입점)
const GUEST_QUICK_ACTIONS: QuickActionItem[] = [
  { ...USAGE_NEW, locked: true },
  { ...CABINETS, locked: true },
];

type HomeViewProps = {
  data: Omit<HomeData, "role">;
  /**
   * 로그인 역할. 없으면 둘러보기(13g, /demo): 데모 학교 데이터, 쓰기·범위 밖 진입점은 guest-lock,
   * 교사·admin 전용 컴포넌트(stock-intake·user-manage·cabinet-edit·reorder-alert-card)는 두지 않는다.
   */
  role?: Role;
};

/**
 * 화면 13 홈 본문 — 로그인(역할별) / 둘러보기(role 없음) 공용.
 * 모바일 = 아래 HomeMobile(지금 그대로), 데스크톱 = HomeDesk(숫자 타일 + 위젯 격자, d7 §23 run c).
 * 첫 그림(폭 모름)에는 둘 다 그리고 CSS 로 한쪽만 보이며, 하이드레이션 뒤 맞지 않는 쪽은 DOM 에서 빠진다 (components/viewport-only).
 */
export function HomeView({ data, role }: HomeViewProps) {
  return (
    <>
      <MobileOnly>
        <HomeMobile data={data} role={role} />
      </MobileOnly>
      <DesktopOnly>
        <HomeDesk data={data} role={role} />
      </DesktopOnly>
    </>
  );
}

/** 화면 13 홈 — 모바일 (시안 13-mobile · 13-guest-mobile) */
function HomeMobile({ data, role }: HomeViewProps) {
  const guest = !role;
  const staff = !guest && role !== "student";
  const reagentHref = (id: string) => (guest ? `/demo/reagents/${id}` : `/reagents/${id}`);
  // 둘러보기 카드 (쓰기 진입 없음 — 시약장이 없으면 학생과 같은 안내)
  const stockCard = (
    <StockSummaryCard
      lowStockCount={data.lowStock.length}
      totalCount={data.totalReagents}
      items={data.lowStock.map((r) => ({ name: r.name, amount: r.amount, href: reagentHref(r.id) }))}
    />
  );
  const cabinetCard =
    data.cabinetCount > 0 ? (
      <CabinetSummaryCard cabinetCount={data.cabinetCount} assigned={data.assignedSlots} totalSlots={data.totalSlots} />
    ) : (
      <SummaryEmptyCard title="시약장 요약" message="등록된 시약장이 없어요" hint="선생님이 시약장을 등록하면 보여요" />
    );

  return (
    <>
      <h1 className={styles.title}>홈</h1>
      <div className={styles.dashboard}>
        <div className={styles.column}>
          <div className={styles.quick}>
            {guest ? (
              // 시안 13-guest-mobile (새 프레임, d7 §23 run d): 잠긴 칸 2개가 각각 quick-action (사용 기록 입력 · 시약장 보기)
              <div className={styles.quickRow}>
                {GUEST_QUICK_ACTIONS.map((it) => (
                  <QuickAction key={it.href} items={[it]} />
                ))}
              </div>
            ) : (
              <QuickAction items={QUICK_ACTIONS[role ?? "student"]} />
            )}
          </div>
          {guest ? (
            // 시안 13-guest-mobile: 재고 부족 카드 · 시약장 요약 카드가 각각 home-summary
            <>
              <HomeSummary className={styles.summary}>
                <div className={styles.stock}>{stockCard}</div>
              </HomeSummary>
              <HomeSummary className={styles.summary}>
                <div className={styles.cabinet}>{cabinetCard}</div>
              </HomeSummary>
            </>
          ) : (
          <HomeSummary className={styles.summary}>
            <div className={styles.stock}>
              <StockSummaryCard
                lowStockCount={data.lowStock.length}
                totalCount={data.totalReagents}
                items={data.lowStock.map((r) => ({ name: r.name, amount: r.amount, href: reagentHref(r.id) }))}
              />
            </div>
            <div className={styles.cabinet}>
              {data.cabinetCount > 0 ? (
                <CabinetSummaryCard
                  cabinetCount={data.cabinetCount}
                  assigned={data.assignedSlots}
                  totalSlots={data.totalSlots}
                />
              ) : (
                <SummaryEmptyCard
                  title="시약장 요약"
                  message="등록된 시약장이 없어요"
                  hint={staff ? undefined : "선생님이 시약장을 등록하면 보여요"}
                  action={
                    staff ? (
                      <span data-component="cabinet-edit" className={styles.action}>
                        <ButtonOutline href="/cabinets">시약장 추가</ButtonOutline>
                      </span>
                    ) : undefined
                  }
                />
              )}
            </div>
          </HomeSummary>
          )}
        </div>
        <div className={styles.column}>
          {staff ? (
            <div className={styles.reorder}>
              <ReorderAlertCard count={data.lowStock.length} href="/reorder" />
            </div>
          ) : null}
          <section className={[styles.card, styles.recent].join(" ")} aria-labelledby="recent-usage-heading">
            <h2 id="recent-usage-heading" className={styles.heading}>
              최근 사용 기록
            </h2>
            {data.recent.length > 0 ? (
              <ul className={styles.rows}>
                {data.recent.map((u) => (
                  <li key={u.id}>
                    <ReagentRow title={u.reagentName} body={u.body} caption={u.caption} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.empty}>
                <p className={styles.body}>아직 사용 기록이 없어요</p>
                {guest ? (
                  <GuestLockedButton variant="outline">사용 기록 입력</GuestLockedButton>
                ) : (
                  <ButtonOutline href="/usage/new">사용 기록 입력</ButtonOutline>
                )}
              </div>
            )}
            {guest ? (
              // 시안 13-guest recent-usage-card/button-pill-soft + guest-lock (사용 기록 내역은 둘러보기 범위 밖)
              <GuestLockedButton variant="pill-soft" fullWidth>
                더 보기
              </GuestLockedButton>
            ) : (
              <ButtonPillSoft href="/usage" icon="chevron-right" fullWidth>
                더 보기
              </ButtonPillSoft>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

/**
 * 화면 13 홈 — 경로 `/` 로그인 후 (app/page.tsx 가 세션을 확인해 AppShell 안에서 그린다).
 * 라우트 파일이 아니라 화면 컴포넌트다 (로그인 전 `/` 는 화면 15 랜딩).
 */
export async function HomeScreen() {
  const data = await getHomeData();
  if (!data) redirect("/login");
  return <HomeView data={data} role={data.role} />;
}
