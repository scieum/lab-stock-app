import { CabinetNumber } from "@/components/cabinet-number";
import { cabinetMeta, type DoorType } from "@/lib/cabinet-rules";
import styles from "./styles.module.css";

type ScreenProps = {
  /** 맨 위: cabinet-switcher + CabinetTitle */
  top: React.ReactNode;
  /** 배치도 + 범례 (CabinetLayout · CabinetLegend) */
  board: React.ReactNode;
  /** 아래: "칸 없음 시약 (N)" 목록 */
  bottom?: React.ReactNode;
  /** 교사·admin: <CabinetEdit layout="panel" …> (학생에게는 넘기지 않는다 — R7) */
  edit?: React.ReactNode;
  /** 학생: 배치도 아래 보기 전용 mix-warning */
  aside?: React.ReactNode;
};

/**
 * 화면 11 본문 배치 (디자인 1.15). 시안 컴포넌트가 아니라 data-component 는 없다.
 * - 데스크톱(11-desktop): 2단 — 왼쪽 열(860) = switcher · 제목 · 배치도 · 범례 · 칸 없음 목록, 오른쪽(420) = cabinet-edit 카드
 *   (관리 줄 · 문 형태 · 단 수 · 선택 칸 분류 · mix-warning · 저장). DOM 순서도 이 순서(왼쪽 열 → 편집 카드)다.
 * - 모바일(11-mobile): 한 열 — switcher · 제목 → cabinet-edit 관리 줄 · 문 형태/단 수 → 배치도 · 범례 → 선택 칸 분류 → mix-warning
 *   → 칸 없음 목록 (저장은 tab-bar 위 고정). 편집 카드는 subgrid 로 여러 줄을 차지하고, 배치도가 그 사이 줄에 겹쳐 놓인다.
 * - edit 가 없으면(학생) 한 열: top · board · aside · bottom.
 */
export function CabinetScreen({ top, board, bottom, edit, aside }: ScreenProps) {
  if (!edit) {
    return (
      <div className={styles.screen}>
        <div className={styles.sTop}>{top}</div>
        <div className={styles.sBoard}>{board}</div>
        {aside}
        {bottom ? <div className={styles.sBottom}>{bottom}</div> : null}
      </div>
    );
  }
  return (
    <div className={[styles.screen, styles.screenEdit].join(" ")}>
      <div className={styles.sTop}>{top}</div>
      <div className={styles.sBoard}>{board}</div>
      {bottom ? <div className={styles.sBottom}>{bottom}</div> : null}
      {edit}
    </div>
  );
}

type TitleProps = {
  number?: number;
  label: string;
  doorType: DoorType;
  shelves: number;
};

/**
 * 시약장 제목 줄 (시안 1.15 cabinet-header): cabinet-number + 이름(heading-3) + 요약 caption.
 * 요약은 모바일 "양문형 · 4단", 데스크톱 "양문형 · 4단 · 8칸" (칸 수는 데스크톱에서만 보인다).
 */
export function CabinetTitle({ number, label, doorType, shelves }: TitleProps) {
  const short = cabinetMeta(doorType, shelves, "short");
  const rest = cabinetMeta(doorType, shelves, "full").slice(short.length);
  return (
    <div className={styles.title}>
      {number !== undefined ? <CabinetNumber number={number} /> : null}
      <h2 className={styles.titleText}>{label}</h2>
      <span className={styles.titleMeta}>
        {short}
        <span className={styles.titleMetaWide}>{rest}</span>
      </span>
    </div>
  );
}
