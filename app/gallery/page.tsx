import type { Metadata } from "next";
import { BadgeLowStock } from "@/components/badge-low-stock";
import { ButtonOutline } from "@/components/button-outline";
import { ButtonPillSoft } from "@/components/button-pill-soft";
import { ButtonPrimary } from "@/components/button-primary";
import { AuthFormCard } from "@/components/ex-auth-form-card";
import { DataTable, DataTableRow } from "@/components/ex-data-table";
import { DataTableCell } from "@/components/ex-data-table-cell";
import { Toast } from "@/components/ex-toast";
import { CabinetSummaryCard, HomeSummary, StockSummaryCard } from "@/components/home-summary";
import { MsdsEntry } from "@/components/msds-entry";
import { MsdsQrTile } from "@/components/msds-qr-tile";
import { NavPill } from "@/components/nav-pill";
import { QuickAction } from "@/components/quick-action";
import { ReagentDetailCard } from "@/components/reagent-detail-card";
import { ReagentRow } from "@/components/reagent-row";
import { ReorderAlertCard } from "@/components/reorder-alert-card";
import { SchoolSelectRegion } from "@/components/school-select-region";
import { SchoolSelectSchool } from "@/components/school-select-school";
import { SchoolSelectSido } from "@/components/school-select-sido";
import { SegmentedControl } from "@/components/segmented-control";
import { SegmentedControlActive } from "@/components/segmented-control-active";
import { TabBar } from "@/components/tab-bar";
import { TabItem } from "@/components/tab-item";
import { TextInput } from "@/components/text-input";
import styles from "./gallery.module.css";

export const metadata: Metadata = { title: "컴포넌트 갤러리 · Lab_Stock" };

const SAMPLE_SCHOOL = "샘플고등학교";

const usageRows = [
  { date: "2026.10.02", user: "김민지", amount: "5 g", selected: true },
  { date: "2026.09.25", user: "이준호", amount: "8 g" },
  { date: "2026.09.18", user: "박서연", amount: "10 g" },
];

function Item({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <section className={styles.item} aria-labelledby={`g-${name}`}>
      <h2 id={`g-${name}`} className={styles.itemName}>
        {name}
      </h2>
      <div className={styles.stage}>{children}</div>
    </section>
  );
}

export default function GalleryPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>컴포넌트 갤러리</h1>
      <p className={styles.lead}>design/rules.json 토큰 · design/frames 시안 노드 이름 = data-component</p>

      <div className={styles.grid}>
        <Item name="nav-pill">
          <NavPill schoolName={SAMPLE_SCHOOL} />
          <NavPill title="시약 상세" backHref="/reagents" schoolName={SAMPLE_SCHOOL} />
          <NavPill
            schoolName={SAMPLE_SCHOOL}
            links={[
              { label: "홈", href: "/", active: true },
              { label: "시약 목록", href: "/reagents" },
              { label: "재주문 알림", href: "/reorder" },
            ]}
          />
        </Item>

        <Item name="badge-low-stock">
          <div className={styles.row}>
            <BadgeLowStock />
            <BadgeLowStock>3</BadgeLowStock>
          </div>
        </Item>

        <Item name="button-primary">
          <ButtonPrimary fullWidth>로그인</ButtonPrimary>
        </Item>

        <Item name="button-outline">
          <div className={styles.row}>
            <ButtonOutline>입고</ButtonOutline>
            <ButtonPrimary fullWidth>사용 기록</ButtonPrimary>
          </div>
        </Item>

        <Item name="button-pill-soft">
          <div className={styles.row}>
            <ButtonPillSoft icon="external">MSDS 보기</ButtonPillSoft>
            <ButtonPillSoft icon="chevron-right">더 보기</ButtonPillSoft>
          </div>
        </Item>

        <Item name="text-input">
          <TextInput icon="search" placeholder="시약명 검색" />
          <TextInput label="사용량" required unit="g" defaultValue="5" inputMode="decimal" />
          <TextInput label="사용 날짜" required icon="calendar" defaultValue="2026.10.02" />
        </Item>

        <Item name="school-select-sido · region · school">
          <SchoolSelectSido options={[{ value: "충청북도", label: "충청북도" }]} defaultValue="충청북도" />
          <SchoolSelectRegion options={[{ value: "청주시", label: "청주시" }]} defaultValue="청주시" />
          <SchoolSelectSchool
            options={[
              { value: "A", label: "금천고등학교" },
              { value: "B", label: "봉명고등학교" },
              { value: "C", label: "산남고등학교" },
            ]}
            defaultOpen
          />
        </Item>

        <Item name="ex-auth-form-card">
          <AuthFormCard title="로그인" subtitle="개인 이메일로 로그인하세요">
            <TextInput label="개인 이메일" placeholder="name@example.com" autoComplete="username" />
            <TextInput label="비밀번호" placeholder="비밀번호를 입력하세요" type="password" autoComplete="current-password" />
            <ButtonPrimary type="submit" fullWidth>
              로그인
            </ButtonPrimary>
          </AuthFormCard>
        </Item>

        <Item name="segmented-control · segmented-control-active">
          <SegmentedControl
            label="재고 필터"
            options={[
              { value: "all", label: "전체" },
              { value: "low", label: "재고 부족" },
            ]}
          />
          <SegmentedControl
            label="상세 탭"
            variant="indicator"
            defaultValue="usage"
            options={[
              { value: "info", label: "정보" },
              { value: "usage", label: "사용 기록" },
            ]}
          />
          <div className={styles.row}>
            <SegmentedControlActive>단독 활성 항목</SegmentedControlActive>
          </div>
        </Item>

        <Item name="reagent-row">
          <ReagentRow title="염산 0.1M" body="500 mL" caption="입고 2026.08.20" href="/reagents/sample-1" selected />
          <ReagentRow
            title="황산구리(II) 오수화물"
            body="30 g"
            caption="입고 2026.03.04"
            href="/reagents/sample-2"
            lowStock
          />
          <ReagentRow title="에탄올" body="이교사 · 50mL" caption="오늘 09:05" />
        </Item>

        <Item name="reagent-detail-card">
          <ReagentDetailCard name="황산구리(II) 오수화물" stock={30} unit="g" lowStock intakeDate="2026.03.04" />
          <ReagentDetailCard name="황산구리(II) 오수화물" stock={30} unit="g" variant="compact" />
        </Item>

        <Item name="ex-data-table-cell">
          <DataTable
            label="사용 기록"
            head={
              <>
                <DataTableCell variant="header">사용 날짜</DataTableCell>
                <DataTableCell variant="header">사용자</DataTableCell>
                <DataTableCell variant="header">사용량</DataTableCell>
              </>
            }
          >
            {usageRows.map((r) => (
              <DataTableRow key={r.date} selected={r.selected}>
                <DataTableCell strong={r.selected}>{r.date}</DataTableCell>
                <DataTableCell>{r.user}</DataTableCell>
                <DataTableCell>{r.amount}</DataTableCell>
              </DataTableRow>
            ))}
          </DataTable>
        </Item>

        <Item name="msds-entry · msds-qr-tile">
          <MsdsEntry href="https://example.com/msds" />
          <MsdsQrTile caption="QR 타일 단독" />
        </Item>

        <Item name="quick-action">
          <QuickAction
            items={[
              { label: "사용 기록 입력", href: "/usage/new", icon: "pen" },
              { label: "입고", href: "/intake", icon: "intake" },
            ]}
          />
        </Item>

        <Item name="home-summary">
          <HomeSummary>
            <StockSummaryCard
              lowStockCount={3}
              totalCount={42}
              items={[
                { name: "염산", amount: "1병" },
                { name: "에탄올", amount: "200mL" },
                { name: "질산은", amount: "5g" },
              ]}
            />
            <CabinetSummaryCard cabinetCount={2} assigned={14} totalSlots={16} href="/cabinets" />
          </HomeSummary>
        </Item>

        <Item name="reorder-alert-card">
          <ReorderAlertCard count={3} href="/reorder" />
        </Item>

        <Item name="ex-toast">
          <Toast>사용 기록을 저장했어요</Toast>
        </Item>

        <Item name="tab-bar · tab-item">
          <TabBar active="home" responsive={false} />
          <div className={styles.row}>
            <TabItem label="시약" href="/reagents" icon="flask" active />
            <TabItem label="기록" href="/usage" icon="record" />
          </div>
        </Item>
      </div>
    </main>
  );
}
