import type { Metadata } from "next";
import { BadgeLowStock } from "@/components/badge-low-stock";
import { ButtonOutline } from "@/components/button-outline";
import { ButtonPrimary } from "@/components/button-primary";
import { DataTable, DataTableCell, DataTableRow } from "@/components/data-table";
import { DocUpload } from "@/components/doc-upload";
import { CabinetWidget, HomeSummaryTile, StockWidget } from "@/components/home-summary";
import { LocationSuggest } from "@/components/location-suggest";
import { BottomBar, PageColumn, PageHead } from "@/components/page-frame";
import { QrPrintSheet } from "@/components/qr-print-sheet";
import { QuickActionButtons } from "@/components/quick-action";
import { ReorderAlertTile } from "@/components/reorder-alert-card";
import { SAMPLE_ORIGIN, sampleCabinets } from "../cabinets/sample";
import styles from "../gallery.module.css";
import local from "./pages.module.css";

export const metadata: Metadata = { title: "데스크톱 본문 페이지 · 홈 위젯 · Lab_Stock" };

const SAMPLE_SCHOOL = "샘플고등학교";
const printCabinets = sampleCabinets.map((c) => ({ id: c.id, number: c.number, label: c.label }));

function Item({ id, name, wide = false, children }: { id: string; name: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <section className={[styles.item, wide ? styles.wide : ""].filter(Boolean).join(" ")} aria-labelledby={`g-${id}`}>
      <h2 id={`g-${id}`} className={styles.itemName}>
        {name}
      </h2>
      <div className={styles.stage}>{children}</div>
    </section>
  );
}

/**
 * 데스크톱 재구성 run c 갤러리 (d7 §23, rules.json 1.24 desktop_shell heavy_pages · form_width):
 * 본문 페이지 틀(page-head · page-column 640 · bottom-bar), 홈 숫자 타일 + 위젯, 7 서류 올리기 데스크톱 모양 · 위치 추천,
 * 11 QR 인쇄 드로어. 폭 1440 에서 보는 예시 (모바일에서는 page-head 가 읽기 도구용 제목만 남는다).
 */
export default function GalleryPagesPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>데스크톱 본문 페이지 · 홈 위젯</h1>
      <p className={styles.lead}>
        page-head(제목 24/700 + 개수 · 부제 · 오른쪽 page-actions) · page-column(가운데 640) · bottom-bar(본문 아래 고정 줄 — 여기서는 제자리) ·
        홈 숫자 타일(home-summary · reorder-alert-card) · 위젯(최근 사용 기록 data-table · 재고 부족 · 시약장 요약) · quick-action 버튼 줄
      </p>
      <div className={styles.grid}>
        <Item id="frame" name="page-head + page-column + bottom-bar (시안 5 · 7 · 11-desktop)" wide>
          <div className={local.frame}>
            <PageHead title="시약장" mobileTitle="시약장 설정" count="2개" />
            <PageColumn>
              <p className={local.placeholder}>가운데 열 640 — 폼 블록이 이 안에 쌓인다</p>
            </PageColumn>
            <BottomBar inline note={<p className={local.note}>이 변경으로 시약 2종이 &apos;칸 없음&apos;이 돼요</p>}>
              <ButtonPrimary>저장</ButtonPrimary>
            </BottomBar>
          </div>
        </Item>

        <Item id="home-head" name="page-head + quick-action 버튼 줄 (시안 13-desktop · 교사)" wide>
          <PageHead
            title={SAMPLE_SCHOOL}
            subtitle="오늘 10월 7일 · 전체 시약 42종"
            actions={
              <QuickActionButtons
                items={[
                  { label: "사용 기록 입력", href: "/gallery", icon: "pen" },
                  { label: "시약장 설정", href: "/gallery/cabinets", icon: "cabinet" },
                  { label: "입고", href: "/gallery/intake", icon: "intake" },
                ]}
                primaryHref="/gallery/intake"
              />
            }
          />
        </Item>

        <Item id="tiles" name="지금 처리할 것 — home-summary 타일 · reorder-alert-card 타일 (시안 13-desktop tile-row)" wide>
          <div className={local.tiles}>
            <HomeSummaryTile caption="재고 부족" value={3} badge={<BadgeLowStock />} note="재주문 기준보다 적은 시약이에요" />
            <ReorderAlertTile count={3} href="/gallery/reorder" />
            <HomeSummaryTile caption="MSDS 없는 시약" value={4} note="시약 목록에서 MSDS를 찾아 연결해요" />
          </div>
        </Item>

        <Item id="widgets" name="위젯 — 최근 사용 기록(data-table) · 재고 부족 · 시약장 요약 (시안 13-desktop widget-grid)" wide>
          <div className={local.widgets}>
            <DataTable
              label="최근 사용 기록 (예시)"
              columns={[
                { key: "usedOn", label: "사용일", width: "20.8%", sort: "desc" },
                { key: "name", label: "시약명", width: "39.3%" },
                { key: "user", label: "사용자", width: "26.8%" },
                { key: "amount", label: "사용량", width: "13.1%" },
              ]}
            >
              <DataTableRow>
                <DataTableCell>10월 7일</DataTableCell>
                <DataTableCell>염산</DataTableCell>
                <DataTableCell>학생 이OO</DataTableCell>
                <DataTableCell>20 mL</DataTableCell>
              </DataTableRow>
              <DataTableRow>
                <DataTableCell>10월 6일</DataTableCell>
                <DataTableCell>수산화나트륨</DataTableCell>
                <DataTableCell>학생 박OO</DataTableCell>
                <DataTableCell>10 g</DataTableCell>
              </DataTableRow>
            </DataTable>
            <div className={local.widgetColumn}>
              <StockWidget
                items={[
                  { name: "염산", amount: "50 mL" },
                  { name: "에탄올", amount: "200 mL" },
                  { name: "질산은", amount: "5 g" },
                ]}
                totalCount={42}
                more={{ href: "/gallery" }}
              />
              <CabinetWidget cabinetCount={2} assigned={14} totalSlots={16} more={{ href: "/gallery/cabinets" }} />
            </div>
          </div>
        </Item>

        <Item id="doc-upload" name="doc-upload — 데스크톱 모양 (시안 7-desktop: 가운데 정렬 · 파일 선택 1개 · 끌어다 놓기 안내, AI로 읽기는 bottom-bar)">
          <DocUpload file={null} desktopBar />
          <BottomBar inline>
            <ButtonPrimary disabled>AI로 읽기</ButtonPrimary>
          </BottomBar>
        </Item>

        <Item id="suggest" name="location-suggest (시안 7-suggest-desktop — 아래 줄은 화면에서 bottom-bar)">
          <LocationSuggest
            items={[
              { id: "s-1", name: "질산칼륨", storageClass: "산화제", suggestion: { cabinetNumber: 2, text: "2번 시약장 · 우 2단" } },
              { id: "s-2", name: "아세트산", storageClass: "산", suggestion: null },
            ]}
          />
        </Item>

        <Item id="print" name="qr-print-sheet — 오른쪽 detail-drawer (시안 11-print-desktop: 시약장 드롭다운 · A4 미리보기 · 인쇄)">
          <div className={local.drawerStage}>
            <QrPrintSheet
              variant="drawer"
              sheet={false}
              schoolName={SAMPLE_SCHOOL}
              origin={SAMPLE_ORIGIN}
              cabinets={printCabinets}
              defaultTarget="all"
            />
          </div>
        </Item>

        <Item id="bar-buttons" name="bottom-bar — 왼쪽 동작 + 오른쪽 버튼 (시안 5 · 7-suggest-desktop)">
          <BottomBar inline start={<ButtonOutline>나중에</ButtonOutline>}>
            <ButtonPrimary>확인 후 저장</ButtonPrimary>
          </BottomBar>
        </Item>
      </div>
    </main>
  );
}
