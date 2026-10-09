import { BadgeLowStock } from "@/components/badge-low-stock";
import { ButtonOutline } from "@/components/button-outline";
import { DataTable, DataTableCell, DataTableRow, type DataTableColumn } from "@/components/data-table";
import { CabinetWidget, HomeSummaryTile, StockWidget, WidgetHead } from "@/components/home-summary";
import { PageHead } from "@/components/page-frame";
import { QuickActionButtons, type QuickActionItem } from "@/components/quick-action";
import { ReorderAlertTile } from "@/components/reorder-alert-card";
import type { HomeData, Role } from "@/lib/supabase/home-data";
import styles from "./home-desk.module.css";

const USAGE_NEW: QuickActionItem = { label: "사용 기록 입력", href: "/usage/new", icon: "pen" };
const CABINETS: QuickActionItem = { label: "시약장 보기", href: "/cabinets", icon: "cabinet" };
const CABINET_SETTINGS: QuickActionItem = { label: "시약장 설정", href: "/cabinets", icon: "cabinet" };
const INTAKE: QuickActionItem = { label: "입고", href: "/intake", icon: "intake", entry: "stock-intake" };
const USERS: QuickActionItem = { label: "사용자 관리", href: "/users", icon: "users", entry: "user-manage" };

/**
 * 데스크톱 빠른 실행 (시안 13-desktop · 13-guest-desktop page-actions) — 모바일 2+1 칸과 같은 진입(home_quick_action),
 * 주 행동을 마지막 button-primary 로: 학생·둘러보기 = 시약장 보기 · [사용 기록 입력], 교사 = 사용 기록 입력 · 시약장 설정 · [입고],
 * admin = 사용자 관리 · 시약장 설정 · [입고].
 */
const DESK_ACTIONS: Record<Role, { items: QuickActionItem[]; primary: string }> = {
  student: { items: [CABINETS, USAGE_NEW], primary: USAGE_NEW.href },
  teacher: { items: [USAGE_NEW, CABINET_SETTINGS, INTAKE], primary: INTAKE.href },
  admin: { items: [USERS, CABINET_SETTINGS, INTAKE], primary: INTAKE.href },
};
const GUEST_ACTIONS = { items: [{ ...CABINETS, locked: true }, { ...USAGE_NEW, locked: true }], primary: USAGE_NEW.href };

/** 최근 사용 기록 표 열 (시안 recent-usage-widget data-table: 사용일 140 ↓ · 시약명 264 · 사용자 180 · 사용량 88 / 672) */
const RECENT_COLUMNS: DataTableColumn[] = [
  { key: "usedOn", label: "사용일", width: "20.8%", sort: "desc" },
  { key: "name", label: "시약명", width: "39.3%" },
  { key: "user", label: "사용자", width: "26.8%" },
  { key: "amount", label: "사용량", width: "13.1%" },
];

type Props = {
  data: Omit<HomeData, "role">;
  /** 없으면 둘러보기(13g) — 쓰기·범위 밖 진입점은 guest-lock, 교사·admin 전용 타일은 두지 않는다 */
  role?: Role;
};

/**
 * 화면 13 홈 — 데스크톱 (시안 13-desktop · 13-guest-desktop, d7 §23 run c): 숫자 타일 + 위젯 격자.
 * page-head(학교명 24/700 + "오늘 10월 7일 · 전체 시약 N종" · 오른쪽 quick-action 버튼)
 * → todo-section "지금 처리할 것"(tile-row 3칸: 재고 부족 · [교사·admin] 재주문 알림 · [교사·admin] MSDS 없는 시약)
 * → widget-grid(왼쪽 recent-usage-widget 752 = 최근 사용 기록 data-table / 오른쪽 widget-column 368 = 재고 부족 · 시약장 요약).
 * 시안 노드 중 data-component 가 아닌 묶음은 data-name 으로 남긴다.
 */
export function HomeDesk({ data, role }: Props) {
  const guest = !role;
  const staff = !guest && role !== "student";
  const reagentHref = (id: string) => (guest ? `/demo/reagents/${id}` : `/reagents/${id}`);
  const actions = role ? DESK_ACTIONS[role] : GUEST_ACTIONS;
  const lowCount = data.lowStock.length;

  return (
    <div className={styles.desk}>
      <PageHead
        title={data.schoolName}
        subtitle={`오늘 ${data.today} · 전체 시약 ${data.totalReagents}종`}
        actions={<QuickActionButtons items={actions.items} primaryHref={actions.primary} />}
      />

      <section className={styles.todo} aria-labelledby="home-todo-heading" data-name="todo-section">
        <h2 id="home-todo-heading" className={styles.sectionTitle}>
          지금 처리할 것
        </h2>
        <div className={styles.tiles} data-name="tile-row">
          <HomeSummaryTile
            caption="재고 부족"
            value={lowCount}
            badge={lowCount > 0 ? <BadgeLowStock /> : undefined}
            note="재주문 기준보다 적은 시약이에요"
          />
          {staff ? <ReorderAlertTile count={lowCount} href="/reorder" /> : null}
          {staff ? (
            <HomeSummaryTile caption="MSDS 없는 시약" value={data.msdsMissing} note="시약 목록에서 MSDS를 찾아 연결해요" />
          ) : null}
        </div>
      </section>

      <div className={styles.grid} data-name="widget-grid">
        <section className={styles.widget} aria-labelledby="home-recent-heading" data-name="recent-usage-widget">
          <WidgetHead title="최근 사용 기록" titleId="home-recent-heading" more={guest ? { locked: true } : { href: "/usage" }} />
          <DataTable
            label="최근 사용 기록"
            columns={RECENT_COLUMNS}
            empty={
              data.recent.length === 0 ? (
                <div className={styles.empty}>
                  <p className={styles.emptyText}>아직 사용 기록이 없어요</p>
                  {guest ? null : <ButtonOutline href="/usage/new">사용 기록 입력</ButtonOutline>}
                </div>
              ) : undefined
            }
          >
            {data.recent.map((u) => (
              <DataTableRow key={u.id}>
                <DataTableCell>{u.usedOn}</DataTableCell>
                <DataTableCell>{u.reagentName}</DataTableCell>
                <DataTableCell>{u.userName}</DataTableCell>
                <DataTableCell>{u.amount}</DataTableCell>
              </DataTableRow>
            ))}
          </DataTable>
        </section>

        <div className={styles.column} data-name="widget-column">
          <StockWidget
            items={data.lowStock.map((r) => ({ name: r.name, amount: r.amount, href: reagentHref(r.id) }))}
            totalCount={data.totalReagents}
            more={{ href: guest ? "/demo/reagents" : "/reagents?sort=stock" }}
          />
          <CabinetWidget
            cabinetCount={data.cabinetCount}
            assigned={data.assignedSlots}
            totalSlots={data.totalSlots}
            more={guest ? undefined : { href: "/cabinets" }}
            emptyHint={staff ? undefined : "선생님이 시약장을 등록하면 보여요"}
            emptyAction={
              staff ? (
                <span data-component="cabinet-edit" className={styles.action}>
                  <ButtonOutline href="/cabinets">시약장 추가</ButtonOutline>
                </span>
              ) : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
