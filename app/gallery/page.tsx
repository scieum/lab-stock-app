import type { Metadata } from "next";
import Link from "next/link";
import { BadgeLowStock } from "@/components/badge-low-stock";
import { BadgeOverlay } from "@/components/badge-overlay";
import { ButtonOutline } from "@/components/button-outline";
import { ButtonPillSoft } from "@/components/button-pill-soft";
import { ButtonPrimary } from "@/components/button-primary";
import { CabinetAdd } from "@/components/cabinet-add";
import { CabinetDoorSelect } from "@/components/cabinet-door-select";
import { CabinetEdit, CabinetSelects, CabinetTitle } from "@/components/cabinet-edit";
import { CabinetNumber } from "@/components/cabinet-number";
import { CabinetShelfSelect } from "@/components/cabinet-shelf-select";
import { CabinetLayout, CabinetLegend, CabinetSlot } from "@/components/cabinet-slot";
import { CabinetSwitcher } from "@/components/cabinet-switcher";
import { AuthFormCard } from "@/components/ex-auth-form-card";
import { DataTable, DataTableRow } from "@/components/ex-data-table";
import { DataRecordRow, DataTableCell } from "@/components/ex-data-table-cell";
import { EmptyStateCard } from "@/components/ex-empty-state-card";
import { ModalCard } from "@/components/ex-modal-card";
import { Toast } from "@/components/ex-toast";
import { ExtractionTable } from "@/components/extraction-table";
import { FeatureCard } from "@/components/feature-card";
import { GuestBanner } from "@/components/guest-banner";
import { LocationEdit } from "@/components/location-edit";
import { LocationPicker } from "@/components/location-picker";
import { GuestEntry } from "@/components/guest-entry";
import { GuestLock } from "@/components/guest-lock";
import { CabinetSummaryCard, HomeSummary, StockSummaryCard } from "@/components/home-summary";
import { LandingCta } from "@/components/landing-cta";
import { LandingHero } from "@/components/landing-hero";
import { ManualUpload } from "@/components/manual-upload";
import { MixWarning } from "@/components/mix-warning";
import { MsdsEntry } from "@/components/msds-entry";
import { MsdsQrTile } from "@/components/msds-qr-tile";
import { NavAccountMenu } from "@/components/nav-account-menu";
import { NavPill } from "@/components/nav-pill";
import { QrLabel } from "@/components/qr-label";
import { QrPrint } from "@/components/qr-print";
import { QrPrintSheet } from "@/components/qr-print-sheet";
import { QuickAction } from "@/components/quick-action";
import { ReagentDetailCard } from "@/components/reagent-detail-card";
import { ReagentLocation } from "@/components/reagent-location";
import { ReagentRegister } from "@/components/reagent-register";
import { ReagentRow } from "@/components/reagent-row";
import { RecordGroup, RecordList } from "@/components/record-group";
import { ReorderAlertCard } from "@/components/reorder-alert-card";
import { ReorderThreshold } from "@/components/reorder-threshold";
import { SchoolSelectRegion } from "@/components/school-select-region";
import { SchoolSelectSchool } from "@/components/school-select-school";
import { SchoolSelectSido } from "@/components/school-select-sido";
import { SegmentedControl } from "@/components/segmented-control";
import { SegmentedControlActive } from "@/components/segmented-control-active";
import { SlotAssign } from "@/components/slot-assign";
import { SlotCount } from "@/components/slot-count";
import { SlotSheet } from "@/components/slot-sheet";
import { StockIntake } from "@/components/stock-intake";
import { StorageClassChip, StorageClassPicker } from "@/components/storage-class-chip";
import { TabBar } from "@/components/tab-bar";
import { TabItem } from "@/components/tab-item";
import { TextInput, TextInputSelect } from "@/components/text-input";
import { ThresholdEdit } from "@/components/threshold-edit";
import { UserManage } from "@/components/user-manage";
import { VendorLink } from "@/components/vendor-link";
import { VendorRegisterEntry } from "@/components/vendor-register";
import { cabinetQrUrl, mixWarnings, slotTitle } from "@/lib/cabinet-rules";
import {
  SAMPLE_ORIGIN,
  sampleCabinets,
  sampleCandidates,
  sampleCounts,
  sampleInSlot,
  samplePickerCabinets as pickerCabinets,
} from "./cabinets/sample";
import { SAMPLE_GROUPS, samplePdf, sampleReagents, sampleRowsFrame } from "./manual/sample";
import { sampleInvites, sampleMemberCounts, sampleMembers } from "./users/sample";
import styles from "./gallery.module.css";

export const metadata: Metadata = { title: "컴포넌트 갤러리 · Lab_Stock" };

const SAMPLE_SCHOOL = "샘플고등학교";

const usageRows = [
  { date: "2026.10.02", user: "김민지", amount: "5 g", selected: true },
  { date: "2026.09.25", user: "이준호", amount: "8 g" },
  { date: "2026.09.18", user: "박서연", amount: "10 g" },
];

const historyGroups = [
  {
    label: "2026년 10월",
    rows: [
      { id: "h-1", date: "10.02", name: "황산구리(II) 오수화물", user: "김민지", amount: "5 g", selected: true },
      { id: "h-2", date: "10.01", name: "염산 0.1M", user: "이준호", amount: "20 mL" },
    ],
  },
  {
    label: "2026년 9월",
    rows: [
      { id: "h-3", date: "09.30", name: "수산화나트륨", user: "박서연", amount: "12 g" },
      { id: "h-4", date: "09.25", name: "질산은", user: "정하은", amount: "2 g" },
    ],
  },
];

const periodOptions = [
  { value: "1m", label: "최근 1개월" },
  { value: "3m", label: "최근 3개월" },
  { value: "6m", label: "최근 6개월" },
  { value: "all", label: "전체" },
];

const intakeReagents = [
  { id: "sample-1", name: "황산 (95%)", stock: 3, unit: "병" },
  { id: "sample-2", name: "황산구리(II) 오수화물", stock: 30, unit: "g" },
  { id: "sample-3", name: "황산나트륨", stock: 250, unit: "g" },
];

const storageClasses = ["유기", "산", "염기", "산화제", "인화성", "무기염", "독성", "기타"];

const cabinet = sampleCabinets[0];
const cabinetWarnings = mixWarnings(cabinet.slots, cabinet.doorType, cabinet.shelves).map((w) => w.text);
const cabinetCounts = sampleCounts(cabinet.id);
/** 시안 11-slot: 1번 시약장 좌 2단(유기)에 에탄올 · 아세톤 · 메탄올 */
const slotL2 = sampleInSlot(cabinet.id, "L2").map((r) => ({ id: r.id, name: r.name, amount: r.amount, storageClass: r.storageClass }));
const printCabinets = sampleCabinets.map((c) => ({ id: c.id, number: c.number, label: c.label }));

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

        <Item name="ex-data-table-cell (기록 행) · 필터 줄">
          <SegmentedControl
            label="기록 범위"
            options={[
              { value: "all", label: "전체" },
              { value: "mine", label: "내 기록" },
            ]}
          />
          <TextInputSelect aria-label="기간" options={periodOptions} defaultValue="1m" />
          <TextInput icon="search" placeholder="시약명 검색" />
          <RecordList label="사용 기록 내역">
            {historyGroups.map((g) => (
              <RecordGroup key={g.label} label={g.label}>
                {g.rows.map((r) => (
                  <DataRecordRow
                    key={r.id}
                    date={r.date}
                    title={r.name}
                    subtitle={r.user}
                    amount={r.amount}
                    selected={r.selected}
                  />
                ))}
              </RecordGroup>
            ))}
          </RecordList>
          <EmptyStateCard title="아직 사용 기록이 없어요" />
        </Item>

        <Item name="ex-modal-card">
          <ModalCard
            sheet={false}
            title="황산구리(II) 오수화물"
            amount="5"
            unit="g"
            fields={[
              { label: "사용자", value: "김민지" },
              { label: "일시", value: "2026.10.02 14:20" },
              { label: "메모", value: "1반 3조 구리 이온 실험" },
            ]}
          >
            <MsdsEntry variant="button" href="https://example.com/msds" />
          </ModalCard>
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

        <Item name="manual-upload">
          <ManualUpload href="/manual" />
          <Link href="/gallery/reorder" className={styles.more}>
            재주문 알림 상태 보기 — 알림 카드 · 판매처 연결 모달 · 0건 · 교사/admin (/gallery/reorder)
          </Link>
        </Item>

        <Item name="manual-upload (화면 5 업로드 영역)">
          <ManualUpload variant="upload" file={null} />
        </Item>

        <Item name="badge-overlay">
          <div className={styles.row}>
            <BadgeOverlay>{samplePdf.name}</BadgeOverlay>
          </div>
        </Item>

        <Item name="extraction-table">
          <ExtractionTable rows={sampleRowsFrame} groups={SAMPLE_GROUPS} reagents={sampleReagents} />
          <Link href="/gallery/manual" className={styles.more}>
            실험 매뉴얼 상태 보기 — 파일 선택 전·후 · 파일 오류 · 처리 중 · 추출 결과 · 미연결 · 단위 불일치 · 기존 기준 · 0행 · 동작 데모
            (/gallery/manual)
          </Link>
        </Item>

        <Item name="vendor-link">
          <VendorLink />
        </Item>

        <Item name="vendor-register">
          <VendorRegisterEntry href="/vendors" />
          <Link href="/gallery/vendors" className={styles.more}>
            판매처 설정 상태 보기 — 목록 · 검색 · 더보기 메뉴 · 등록/수정 폼 · 삭제 확인 · 공통 목록 (/gallery/vendors)
          </Link>
        </Item>

        <Item name="stock-intake">
          <StockIntake
            reagents={intakeReagents}
            defaultIntakeDate="2026-10-02"
            defaultQuery="황산"
            defaultSelectedId="sample-1"
            defaultQuantity={5}
            stickyActions={false}
          />
        </Item>

        <Item name="reagent-register">
          <ReagentRegister storageClasses={storageClasses} defaultIntakeDate="2026-10-02" stickyActions={false} />
        </Item>

        <Item name="ex-empty-state-card">
          <EmptyStateCard
            title="찾는 시약이 없어요"
            description="시약명을 확인하거나 새로 등록하세요"
            actionLabel="새 시약 등록"
            actionHref="/intake"
          />
        </Item>

        <Item name="ex-toast">
          <Toast>사용 기록을 저장했어요</Toast>
        </Item>

        <Item name="landing-hero">
          <LandingHero />
        </Item>

        <Item name="feature-card">
          <FeatureCard
            icon="building"
            title="학교별 분리"
            description="우리 학교 시약·재고·사용 기록만 보여요. 다른 학교와 섞이지 않아요"
          />
          <FeatureCard
            icon="bell"
            title="재고 부족 알림"
            description="필요한 양보다 적으면 알려 주고 판매처로 연결해요"
            badge={<BadgeLowStock />}
          />
        </Item>

        <Item name="landing-cta">
          <LandingCta />
        </Item>

        <Item name="guest-entry">
          <GuestEntry />
        </Item>

        <Item name="guest-banner">
          <GuestBanner />
        </Item>

        <Item name="guest-lock">
          <div className={styles.row}>
            <GuestLock />
            <span>사용 기록 입력</span>
            <GuestLock />
          </div>
        </Item>

        <Item name="user-manage">
          <UserManage
            schoolName={SAMPLE_SCHOOL}
            members={sampleMembers}
            invites={sampleInvites}
            counts={sampleMemberCounts}
            selectedId="m-2"
          />
          <Link href="/gallery/users" className={styles.more}>
            초대 · 역할 변경 · 삭제 확인 시트 보기 (/gallery/users)
          </Link>
        </Item>

        <Item name="cabinet-switcher · cabinet-add">
          <CabinetSwitcher
            items={sampleCabinets.map((c) => ({ id: c.id, label: c.label, number: c.number, href: `/gallery/cabinets?c=${c.id}` }))}
            activeId={cabinet.id}
          >
            <CabinetAdd />
          </CabinetSwitcher>
          <Link href="/gallery/cabinets" className={styles.more}>
            시약장 설정 상태 보기 — 기본 · 학생 · 빈 상태 · 삭제 확인 · 이름 시트 · 칸 시트 · QR 인쇄 · 저장 안 한 편집 · 위치 피커 ·
            재주문 기준 · 계정 메뉴 (/gallery/cabinets)
          </Link>
        </Item>

        <Item name="cabinet-edit · cabinet-door-select · cabinet-shelf-select">
          <CabinetEdit qrPrint={<QrPrint />}>
            <CabinetSelects>
              <CabinetDoorSelect defaultValue={cabinet.doorType} />
              <CabinetShelfSelect defaultValue={cabinet.shelves} />
            </CabinetSelects>
          </CabinetEdit>
        </Item>

        <Item name="cabinet-slot (배치도 · 범례)">
          <CabinetTitle number={cabinet.number} label={cabinet.label} doorType={cabinet.doorType} shelves={cabinet.shelves} />
          <CabinetLayout doorType={cabinet.doorType} shelves={cabinet.shelves} slots={cabinet.slots} counts={cabinetCounts} readOnly />
          <CabinetLegend />
          <CabinetSlot name="1단" classes={[]} />
        </Item>

        <Item name="storage-class-chip">
          <StorageClassPicker slotName="좌1단" selected={["산", "염기"]} />
          <div className={styles.row}>
            <StorageClassChip label="미지정" readOnly />
            <StorageClassChip label="선택 칸" readOnly selected />
          </div>
        </Item>

        <Item name="mix-warning">
          <MixWarning lines={cabinetWarnings} />
        </Item>

        <Item name="cabinet-number · slot-count">
          <div className={styles.row}>
            <CabinetNumber number={1} />
            <CabinetNumber number={2} />
            <CabinetNumber number={12} />
            <SlotCount count={3} />
            <SlotCount count={12} />
          </div>
        </Item>

        <Item name="slot-sheet · slot-assign (교사 — 시안 11-slot: 좌 2단에 염산 넣기, 분류 불일치 경고 / 학생 — 목록만)">
          <SlotSheet sheet={false} canEdit title={slotTitle({ side: "L", shelf: 2 }, cabinet.doorType)} classes={["유기"]} reagents={slotL2}>
            <SlotAssign
              candidates={sampleCandidates.slice(0, 2)}
              slotClasses={["유기"]}
              slotReagentClasses={slotL2.map((r) => r.storageClass)}
              defaultSelectedId="u-1"
            />
          </SlotSheet>
          <SlotSheet sheet={false} title={slotTitle({ side: "L", shelf: 2 }, cabinet.doorType)} classes={["유기"]} reagents={slotL2} />
        </Item>

        <Item name="qr-print · qr-label · qr-print-sheet">
          <div className={styles.row}>
            <QrPrint />
          </div>
          <QrLabel schoolName={SAMPLE_SCHOOL} number={cabinet.number} name={cabinet.label} content={cabinetQrUrl(SAMPLE_ORIGIN, cabinet.id)} />
          <QrPrintSheet sheet={false} schoolName={SAMPLE_SCHOOL} origin={SAMPLE_ORIGIN} cabinets={printCabinets} defaultTarget="all" />
        </Item>

        <Item name="reagent-location · location-edit · reorder-threshold · threshold-edit (화면 3 시약 상세 카드)">
          <ReagentDetailCard
            name="과산화수소"
            stock={2}
            unit="병"
            lowStock
            intakeDate="2026-09-14"
            meta={
              <>
                <ReagentLocation cabinet={cabinet} slot={{ side: "R", shelf: 1 }} canEdit />
                <ReorderThreshold minStock={3} unit="병" canEdit />
              </>
            }
          />
          <ReagentLocation cabinet={null} slot={null} />
          <ReorderThreshold minStock={60} unit="g" perGroup={10} groups={6} />
          <ReorderThreshold minStock={null} unit="mL" />
          <div className={styles.row}>
            <LocationEdit />
            <ThresholdEdit mode="button" />
          </div>
          <ThresholdEdit mode="form" unit="병" defaultValue="3" />
        </Item>

        <Item name="location-picker (교사 — 시안 3-location: 2번 시약장 좌 2단, 섞으면 위험한 조합 경고)">
          <LocationPicker
            sheet={false}
            reagentName="과산화수소"
            reagentClass="산화제"
            cabinets={pickerCabinets}
            current={{ cabinetId: cabinet.id, side: "R", shelf: 1 }}
            defaultCabinetId="c-2"
            defaultSlot={{ side: "L", shelf: 2 }}
          />
        </Item>

        <Item name="nav-account-menu (학교명 옆 ▾ — 누르면 로그아웃 메뉴)">
          <div className={styles.row}>
            <NavAccountMenu schoolName={SAMPLE_SCHOOL} />
          </div>
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
