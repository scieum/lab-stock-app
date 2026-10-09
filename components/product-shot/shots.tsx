import { BadgeLowStock } from "@/components/badge-low-stock";
import { Icon, type IconName } from "@/components/icons";
import styles from "./shots.module.css";

/*
 * 랜딩(15-desktop) 화면 조각 — 실제 앱 화면(2·3·4·6·11·12·13·14-desktop)을 HTML/CSS 로 줄여 그린 정적 그림.
 * 스크린샷 파일이 아니다 (d7 §23 run d 세부). 그림 전용이라 링크·버튼·입력 없이 span·div 만 쓰고,
 * 앱 컴포넌트 이름(data-component)은 붙이지 않는다 — 랜딩 화면의 역할·구조 검사에 섞이지 않게.
 * 예외: 핑크 "재고 부족"은 badge-low-stock 안에서만 쓰는 색이라(rules.json colors.accent) 실제 BadgeLowStock 을 쓴다.
 * 바깥 Shot 이 role="img" + 설명 한 줄을 갖고, 안쪽 그림은 aria-hidden.
 */

type ShotProps = {
  /** 스크린리더용 한 줄 설명 */
  label: string;
  children: React.ReactNode;
  className?: string;
  /** 잘린 쪽 모서리를 각지게 (화면 끝에 닿는 조각) */
  bleed?: "left" | "right";
};

/** 화면 조각 카드 (흰 바탕 · hairline 테두리 · radius 16) */
export function Shot({ label, children, className, bleed }: ShotProps) {
  return (
    <div
      role="img"
      aria-label={label}
      className={[styles.shot, bleed === "left" ? styles.bleedLeft : "", bleed === "right" ? styles.bleedRight : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      <div aria-hidden="true" className={styles.inner}>
        {children}
      </div>
    </div>
  );
}

/* ---------- 작은 조각 ---------- */

function CabNo({ n }: { n: number }) {
  return <span className={styles.cabNo}>{n}</span>;
}

function Chip({ children, on = false }: { children: React.ReactNode; on?: boolean }) {
  return <span className={on ? styles.chipOn : styles.chip}>{children}</span>;
}

function Field({ label, required = false, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>
        {label}
        {required ? <span className={styles.required}>필수</span> : null}
      </span>
      {children}
    </div>
  );
}

/* ---------- 앱 화면 조각 ---------- */

type Role = "student" | "teacher" | "admin";

const MENU: { label: string; icon: IconName }[] = [
  { label: "홈", icon: "home" },
  { label: "시약", icon: "flask" },
  { label: "기록", icon: "record" },
  { label: "시약장", icon: "cabinet" },
  { label: "QR 찾기", icon: "qr" },
];
const STAFF_MENU: { label: string; icon: IconName }[] = [
  { label: "입고", icon: "download" },
  { label: "실험 매뉴얼", icon: "book" },
  { label: "재주문 알림", icon: "bell" },
];
const ADMIN_MENU: { label: string; icon: IconName }[] = [
  { label: "사용자", icon: "user" },
  { label: "판매처", icon: "store" },
];

/** 13-desktop 홈 (사이드바 + "지금 처리할 것" 타일 + 최근 사용 기록) — 역할마다 사이드바 메뉴가 다르다 */
export function ShotHome({ school = "샘플고등학교", role = "teacher" }: { school?: string; role?: Role }) {
  const groups: { title?: string; items: { label: string; icon: IconName }[] }[] = [{ items: MENU }];
  if (role !== "student") groups.push({ title: "관리", items: STAFF_MENU });
  if (role === "admin") groups.push({ title: "학교 설정", items: ADMIN_MENU });
  return (
    <div className={styles.app}>
      <div className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.wordmark}>Lab_Stock</span>
          <span className={styles.school}>{school}</span>
        </div>
        {groups.map((g, gi) => (
          <div key={gi} className={styles.menu}>
            {g.title ? <span className={styles.menuTitle}>{g.title}</span> : null}
            {g.items.map((m, i) => (
              <span key={m.label} className={gi === 0 && i === 0 ? styles.menuItemOn : styles.menuItem}>
                <Icon name={m.icon} className={styles.menuIcon} />
                {m.label}
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className={styles.main}>
        <div className={styles.head}>
          <span className={styles.pageTitle}>{school}</span>
          <span className={styles.caption}>오늘 10월 7일 · 전체 시약 42종</span>
        </div>
        <span className={styles.sectionTitle}>지금 처리할 것</span>
        <div className={styles.tiles}>
          <div className={styles.tile}>
            <span className={styles.caption}>재고 부족</span>
            <span className={styles.tileValue}>
              <span className={styles.display}>3</span>
              <BadgeLowStock />
            </span>
            <span className={styles.note}>재주문 기준보다 적은 시약이에요</span>
          </div>
          {role === "student" ? (
            <div className={styles.tile}>
              <span className={styles.caption}>시약장</span>
              <span className={styles.tileValue}>
                <span className={styles.display}>2</span>
              </span>
              <span className={styles.note}>칸 16개 중 지정 14</span>
            </div>
          ) : (
            <div className={styles.tileMuted}>
              <span className={styles.caption}>재주문 알림</span>
              <span className={styles.tileValue}>
                <span className={styles.display}>3</span>
              </span>
              <span className={styles.note}>필요량을 판매처로 이어요</span>
            </div>
          )}
        </div>
        <ShotRecentTable />
      </div>
    </div>
  );
}

/** 최근 사용 기록 표 (13-desktop recent-usage-widget data-table) */
function ShotRecentTable() {
  return (
    <div className={styles.widget}>
      <span className={styles.sectionTitle}>최근 사용 기록</span>
      <div className={styles.table}>
        <div className={styles.tr}>
          <span className={styles.th}>
            사용일 <Icon name="arrow-down" className={styles.sortIcon} />
          </span>
          <span className={styles.th}>시약명</span>
          <span className={styles.th}>사용자</span>
        </div>
        {[
          ["10월 7일", "염산", "학생 A"],
          ["10월 7일", "질산은", "교사 B"],
          ["10월 6일", "수산화나트륨", "학생 C"],
        ].map(([d, n, u]) => (
          <div key={d + n} className={styles.tr}>
            <span className={styles.td}>{d}</span>
            <span className={styles.td}>{n}</span>
            <span className={styles.td}>{u}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type ReagentRowData = { name: string; cls?: string; cab?: number; place?: string; stock: string; low?: boolean };

const LIST_ROWS: ReagentRowData[] = [
  { name: "과산화수소", cls: "산화제", cab: 1, place: "1번 시약장 · 우 1단", stock: "2병", low: true },
  { name: "수산화나트륨", cls: "염기", cab: 1, place: "1번 시약장 · 좌 1단", stock: "300 g" },
  { name: "아세트산", cls: "산", place: "칸 없음", stock: "450 mL" },
  { name: "에탄올", cls: "인화성", cab: 1, place: "1번 시약장 · 좌 3단", stock: "200 mL", low: true },
  { name: "염산", cls: "산", cab: 1, place: "1번 시약장 · 좌 1단", stock: "50 mL", low: true },
  { name: "염화나트륨", cls: "무기염", cab: 1, place: "1번 시약장 · 우 2단", stock: "800 g" },
];

/** 2-desktop 시약 목록 data-table (시약명 ↑ · 보관 분류 · 보관 위치 · 재고 · 상태) */
export function ShotReagentTable({ rows = LIST_ROWS, compact = false }: { rows?: ReagentRowData[]; compact?: boolean }) {
  return (
    <div className={compact ? styles.listCompact : styles.list}>
      <div className={styles.tr}>
        <span className={styles.th}>
          시약명 <Icon name="arrow-up" className={styles.sortIcon} />
        </span>
        {compact ? null : <span className={styles.th}>보관 분류</span>}
        <span className={styles.thWide}>보관 위치</span>
        <span className={styles.th}>
          재고 {compact ? null : <Icon name="sort" className={styles.sortIconMuted} />}
        </span>
        <span className={styles.th}>상태</span>
      </div>
      {rows.map((r) => (
        <div key={r.name} className={styles.tr}>
          <span className={styles.td}>{r.name}</span>
          {compact ? null : <span className={styles.td}>{r.cls ?? "-"}</span>}
          <span className={styles.tdWide}>
            {r.cab ? <CabNo n={r.cab} /> : null}
            <span className={r.cab ? undefined : styles.muted}>{r.place ?? "칸 없음"}</span>
          </span>
          <span className={styles.td}>{r.stock}</span>
          <span className={styles.td}>{r.low ? <BadgeLowStock /> : null}</span>
        </div>
      ))}
    </div>
  );
}

/** 2-filter-desktop 필터 드롭다운 (정렬 · 보관 분류) */
export function ShotFilter() {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>필터</span>
        <Icon name="close" className={styles.closeIcon} />
      </div>
      <span className={styles.groupTitle}>정렬</span>
      <div className={styles.chips}>
        <Chip>이름순</Chip>
        <Chip on>재고 적은 순</Chip>
        <Chip>최근 입고순</Chip>
      </div>
      <div className={styles.groupRow}>
        <span className={styles.groupTitle}>보관 분류</span>
        <span className={styles.caption}>여러 개 고를 수 있어요</span>
      </div>
      <div className={styles.chips}>
        <Chip>유기</Chip>
        <Chip on>산</Chip>
        <Chip>염기</Chip>
        <Chip on>산화제</Chip>
        <Chip>인화성</Chip>
      </div>
    </div>
  );
}

/** 10-desktop 최근 사용 기록 카드 (홈 위젯 모양) */
export function ShotRecentUsage() {
  return (
    <div className={styles.recent}>
      <ShotRecentTable />
    </div>
  );
}

/** 4-desktop 사용 기록 입력 드로어 (사용량 · 단위 · 사용일 · 저장) */
export function ShotUsageForm() {
  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <span className={styles.panelTitle}>사용 기록</span>
        <span className={styles.caption}>에탄올 · 현재 1,200 mL</span>
      </div>
      <div className={styles.formRow}>
        <span className={styles.rowLabel}>
          사용량 <span className={styles.required}>필수</span>
        </span>
        <div className={styles.rowValue}>
          <span className={styles.input}>50</span>
          <div className={styles.chips}>
            <Chip>병</Chip>
            <Chip on>mL</Chip>
            <Chip>g</Chip>
          </div>
        </div>
      </div>
      <div className={styles.formRow}>
        <span className={styles.rowLabel}>
          사용일 <span className={styles.required}>필수</span>
        </span>
        <div className={styles.rowValue}>
          <span className={styles.inputIcon}>
            2026-10-07
            <Icon name="calendar" className={styles.inputIconSvg} />
          </span>
        </div>
      </div>
      <span className={styles.fakeButton}>사용 기록 저장</span>
    </div>
  );
}

/** 6-desktop 재주문 알림 카드 */
export function ShotReorderAlert() {
  return (
    <div className={styles.alertWrap}>
      <div className={styles.alert}>
        <BadgeLowStock />
        <span className={styles.rowTitle}>염산</span>
        <span className={styles.body}>재주문 기준 100 mL / 현재 재고 50 mL</span>
        <span className={styles.caption}>10월 7일 알림</span>
      </div>
    </div>
  );
}

/** 3-desktop 시약 상세 드로어 중 재주문 기준 (현재 재고 · 자동 기준) */
export function ShotReorderDrawer() {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.panelTitle}>과산화수소</span>
        <Icon name="close" className={styles.closeIconBlue} />
      </div>
      <div className={styles.infoRow}>
        <span className={styles.rowLabel}>현재 재고</span>
        <span className={styles.tileValue}>
          <span className={styles.display}>2</span>
          <span className={styles.unit}>병</span>
        </span>
      </div>
      <div className={styles.infoRow}>
        <span className={styles.rowLabel}>재주문 기준</span>
        <span className={styles.rowStack}>
          <span className={styles.tileValue}>
            <span className={styles.body}>3병</span>
            <span className={styles.autoBadge}>자동</span>
          </span>
          <span className={styles.caption}>최근 사용량으로 계산했어요</span>
        </span>
        <Icon name="pen" className={styles.penIcon} />
      </div>
    </div>
  );
}

/** 11-desktop 시약장 칸 (1번 시약장 · 좌 1~3단, 혼재 주의 칸) */
export function ShotCabinet() {
  return (
    <div className={styles.cabinet}>
      <div className={styles.cabHead}>
        <CabNo n={1} />
        <span className={styles.panelTitle}>1번 시약장</span>
        <span className={styles.caption}>양문형 · 4단</span>
      </div>
      <span className={styles.doorLabel}>좌</span>
      {[
        { shelf: "1단", label: "산 · 염기", count: 2, on: true },
        { shelf: "2단", label: "유기", count: 3 },
        { shelf: "3단", label: "인화성", count: 0 },
      ].map((s) => (
        <div key={s.shelf} className={styles.shelfRow}>
          <span className={styles.caption}>{s.shelf}</span>
          <span className={s.on ? styles.slotOn : styles.slot}>
            <span className={styles.slotLabel}>{s.label}</span>
            {s.on ? <Icon name="warning" className={styles.warnIcon} /> : null}
            {s.count ? <span className={styles.slotCount}>{s.count}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

/** 12-result-desktop QR 찾기 결과 (시약장 QR → 그 시약장의 시약과 칸) */
export function ShotCabinetQr() {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.cabHead}>
          <CabNo n={1} />
          <span className={styles.panelTitle}>1번 시약장</span>
        </span>
        <Icon name="close" className={styles.closeIconBlue} />
      </div>
      <span className={styles.caption}>양문형 · 4단 · 시약 4개</span>
      <div className={styles.listCompact}>
        <div className={styles.tr}>
          <span className={styles.th}>시약명</span>
          <span className={styles.th}>칸 위치</span>
          <span className={styles.th}>재고</span>
          <span className={styles.th}>상태</span>
        </div>
        {[
          ["염산", "좌 1단", "1병", true],
          ["수산화나트륨", "좌 1단", "500 g", false],
          ["에탄올", "좌 2단", "200 mL", false],
          ["과산화수소", "우 1단", "2병", true],
        ].map(([n, p, s, low]) => (
          <div key={String(n)} className={styles.tr}>
            <span className={styles.td}>{n}</span>
            <span className={styles.td}>{p}</span>
            <span className={styles.td}>{s}</span>
            <span className={styles.td}>{low ? <BadgeLowStock /> : null}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 14-desktop 회원가입 "1 학교 선택" (시/도 → 지역 → 학교급) */
export function ShotSignup() {
  return (
    <div className={styles.panel}>
      <span className={styles.panelTitle}>
        <span className={styles.number}>1</span>학교 선택
      </span>
      <span className={styles.info}>
        <Icon name="info" className={styles.infoIcon} />
        고른 학교의 시약·기록만 보여요. 가입한 뒤에는 바꿀 수 없어요
      </span>
      <span className={styles.progress}>
        <span className={styles.barOn} />
        <span className={styles.barOn} />
        <span className={styles.barOn} />
        <span className={styles.bar} />
      </span>
      <Field label="시/도">
        <span className={styles.selectOn}>
          충청북도
          <Icon name="check" className={styles.checkIcon} />
        </span>
      </Field>
      <Field label="지역(시/군/구)">
        <span className={styles.selectOn}>
          청주시
          <Icon name="check" className={styles.checkIcon} />
        </span>
      </Field>
      <Field label="학교급" required>
        <span className={styles.segments}>
          <span className={styles.segment}>초등학교</span>
          <span className={styles.segment}>중학교</span>
          <span className={styles.segmentOn}>고등학교</span>
        </span>
      </Field>
    </div>
  );
}

/** 7-doc-review-desktop 서류로 입고 — 읽은 품목 확인 */
export function ShotIntake() {
  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <span className={styles.panelTitle}>서류에서 읽은 품목</span>
        <span className={styles.caption}>거래명세서.pdf · 3개</span>
      </div>
      <div className={styles.listCompact}>
        <div className={styles.tr}>
          <span className={styles.th}>시약명</span>
          <span className={styles.th}>수량</span>
          <span className={styles.th}>단위</span>
        </div>
        {[
          ["에탄올", "2", "병"],
          ["염산", "1", "병"],
          ["질산은", "25", "g"],
        ].map(([n, q, u]) => (
          <div key={n} className={styles.tr}>
            <span className={styles.td}>
              <Icon name="check" className={styles.checkIcon} /> {n}
            </span>
            <span className={styles.td}>{q}</span>
            <span className={styles.td}>{u}</span>
          </div>
        ))}
      </div>
      <span className={styles.fakeButton}>확인하고 저장</span>
    </div>
  );
}
