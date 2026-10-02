import { redirect } from "next/navigation";
import { ButtonOutline } from "@/components/button-outline";
import { ButtonPillSoft } from "@/components/button-pill-soft";
import { CabinetSummaryCard, HomeSummary, StockSummaryCard, SummaryEmptyCard } from "@/components/home-summary";
import { QuickAction, type QuickActionItem } from "@/components/quick-action";
import { ReagentRow } from "@/components/reagent-row";
import { ReorderAlertCard } from "@/components/reorder-alert-card";
import { getHomeData, type Role } from "@/lib/supabase/home-data";
import styles from "./home.module.css";

export const dynamic = "force-dynamic";

// 시안 13 quick-action — 역할별 2칸 (탭과 겹치는 QR·시약 목록·사용 기록 내역은 두지 않는다)
const USAGE_NEW: QuickActionItem = { label: "사용 기록 입력", href: "/usage/new", icon: "pen" };
const INTAKE: QuickActionItem = { label: "입고", href: "/intake", icon: "intake", entry: "stock-intake" };
const QUICK_ACTIONS: Record<Role, QuickActionItem[]> = {
  student: [USAGE_NEW, { label: "시약장 보기", href: "/cabinets", icon: "cabinet" }],
  teacher: [USAGE_NEW, INTAKE],
  admin: [INTAKE, { label: "사용자 관리", href: "/users", icon: "users", entry: "user-manage" }],
};

/** 화면 13 홈 */
export default async function Home() {
  const data = await getHomeData();
  if (!data) redirect("/login");
  const staff = data.role !== "student";

  return (
    <>
      <h1 className={styles.title}>홈</h1>
      <div className={styles.dashboard}>
        <div className={styles.column}>
          <div className={styles.quick}>
            <QuickAction items={QUICK_ACTIONS[data.role]} />
          </div>
          <HomeSummary className={styles.summary}>
            <div className={styles.stock}>
              <StockSummaryCard
                lowStockCount={data.lowStock.length}
                totalCount={data.totalReagents}
                items={data.lowStock.map((r) => ({ name: r.name, amount: r.amount, href: `/reagents/${r.id}` }))}
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
        </div>
        <div className={styles.column}>
          {staff ? (
            <div className={styles.reorder}>
              <ReorderAlertCard count={data.lowStock.length} href="/reagents?filter=low-stock" />
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
                <ButtonOutline href="/usage/new">사용 기록 입력</ButtonOutline>
              </div>
            )}
            <ButtonPillSoft href="/usage" icon="chevron-right" fullWidth>
              더 보기
            </ButtonPillSoft>
          </section>
        </div>
      </div>
    </>
  );
}
