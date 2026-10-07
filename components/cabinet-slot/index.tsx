import { Fragment } from "react";
import { Icon } from "@/components/icons";
import { SlotCount } from "@/components/slot-count";
import { StorageClassChip } from "@/components/storage-class-chip";
import { SuggestBadge } from "@/components/suggest-badge";
import {
  SLOT_UNSET_LABEL,
  hasIncompatible,
  sameSlot,
  shelfLabel,
  sideLabel,
  slotId,
  slotLabel,
  slotName,
  slotSides,
  sortClasses,
  type DoorType,
  type SlotClasses,
  type SlotKey,
} from "@/lib/cabinet-rules";
import styles from "./styles.module.css";

/** 섞이면 위험한 조합이 있는 칸의 표시 문구 (범례 · 읽기 도구) */
const WARNING_LABEL = "섞으면 위험";

type SlotProps = {
  /** 칸 이름 ("좌1단") — 읽기 도구용 */
  name: string;
  /** 이 칸에 지정된 보관 분류 (0개 = "미지정") */
  classes: readonly string[];
  selected?: boolean;
  /** 섞이면 위험한 조합이 있음 — 칸 오른쪽 위에 경고 아이콘 */
  warning?: boolean;
  /** 이 칸에 배치된 시약 수 (디자인 1.15) — 1 이상이면 오른쪽에 slot-count */
  count?: number;
  /** 위치 추천 칸 (디자인 1.17 3-location, d7 §17) — 분류 이름 앞에 suggest-badge "추천" */
  suggested?: boolean;
  /**
   * 있으면 칸이 누름 버튼이 된다. 화면 11 에서는 모든 역할이 칸을 눌러 칸 시트(slot-sheet)를 연다(학생은 목록만) —
   * 교사·admin 은 같은 누름으로 그 칸이 선택 칸(분류 편집 대상)도 된다. 화면 3 위치 피커에서는 칸 고르기.
   * 없으면 보기 전용
   */
  onSelect?: () => void;
  /** true = 보기 전용 (학생) — onSelect 가 있어도 누름 동작 없음 */
  readOnly?: boolean;
  disabled?: boolean;
};

/**
 * 시약장 배치도의 칸 1개 (화면 11). 칸 안에 분류 이름("산 · 염기") 또는 "미지정".
 * 선택 = 연하늘 바탕 + 하늘색 테두리(글자는 기본색), 경고 아이콘은 기본색(핑크 아님).
 */
export function CabinetSlot({
  name,
  classes,
  selected = false,
  warning = false,
  count = 0,
  suggested = false,
  onSelect,
  readOnly = false,
  disabled,
}: SlotProps) {
  const empty = sortClasses(classes).length === 0;
  const text = slotLabel(classes);
  const label = `${name}: ${text}${suggested ? ", 추천 칸" : ""}${warning ? `, ${WARNING_LABEL}` : ""}${count > 0 ? `, 시약 ${count}개` : ""}`;
  const cls = [styles.slot, selected ? styles.selected : ""].filter(Boolean).join(" ");
  const content = (
    <>
      {suggested ? (
        <span className={styles.left}>
          <SuggestBadge />
          <span className={empty ? styles.unset : styles.label}>{text}</span>
        </span>
      ) : (
        <span className={empty ? styles.unset : styles.label}>{text}</span>
      )}
      {warning || count > 0 ? (
        <span className={styles.meta}>
          {warning ? <Icon name="warning" className={styles.warning} /> : null}
          <SlotCount count={count} />
        </span>
      ) : null}
    </>
  );
  if (onSelect && !readOnly) {
    return (
      <button
        data-component="cabinet-slot"
        data-warning={warning ? "true" : undefined}
        type="button"
        className={[cls, styles.selectable].join(" ")}
        aria-label={label}
        aria-pressed={selected}
        disabled={disabled}
        onClick={onSelect}
      >
        {content}
      </button>
    );
  }
  return (
    <div data-component="cabinet-slot" data-warning={warning ? "true" : undefined} role="group" aria-label={label} className={cls}>
      {content}
    </div>
  );
}

type LayoutProps = {
  doorType: DoorType;
  shelves: number;
  /** 칸별 분류. 목록에 없는 칸은 "미지정" */
  slots: readonly SlotClasses[];
  /** 칸별 시약 수 — 키는 slotId ("L1") (디자인 1.15 slot-count). 없거나 0 이면 그리지 않는다 */
  counts?: Readonly<Record<string, number>>;
  /** 선택된 칸 (교사·admin) */
  selected?: SlotKey | null;
  /** 위치 추천 칸 (d7 §17) — 그 칸에 suggest-badge */
  suggested?: SlotKey | null;
  /** 칸을 눌렀을 때 — 없으면 보기 전용 */
  onSelect?: (key: SlotKey) => void;
  /** true = 보기 전용 (학생) */
  readOnly?: boolean;
  disabled?: boolean;
  /** 읽기 도구용 이름 */
  label?: string;
};

/**
 * 시약장 정면 배치도 격자 (시안 11 cabinet-layout): 위쪽 문 라벨 "좌 / 우", 왼쪽 단 라벨 "1단~",
 * 양문형은 좌·우 사이를 가운데 통로처럼 비우고 단문형은 1열. 시안 컴포넌트 이름이 아니라 data-component 는 없다.
 */
export function CabinetLayout({
  doorType,
  shelves,
  slots,
  counts,
  selected,
  suggested,
  onSelect,
  readOnly = false,
  disabled,
  label = "시약장 배치도",
}: LayoutProps) {
  const sides = slotSides(doorType);
  const double = sides.length > 1;
  const rows = Array.from({ length: shelves }, (_, i) => i + 1);
  return (
    <div role="group" aria-label={label} className={styles.layout}>
      {double ? (
        <div className={styles.row} aria-hidden="true">
          <span className={styles.shelfLabel} />
          {sides.map((side, i) => (
            <Fragment key={side}>
              {i > 0 ? <span className={styles.aisle} /> : null}
              <span className={styles.doorLabel}>{sideLabel(side)}</span>
            </Fragment>
          ))}
        </div>
      ) : null}
      {rows.map((shelf) => (
        <div key={shelf} className={styles.row}>
          <span className={styles.shelfLabel} aria-hidden="true">
            {shelfLabel(shelf)}
          </span>
          {sides.map((side, i) => {
            const key: SlotKey = { side, shelf };
            const classes = slots.find((s) => sameSlot(s, key))?.classes ?? [];
            return (
              <Fragment key={slotId(key)}>
                {i > 0 ? <span className={styles.aisle} aria-hidden="true" /> : null}
                <CabinetSlot
                  name={slotName(key, doorType)}
                  classes={classes}
                  selected={!readOnly && sameSlot(selected, key)}
                  warning={hasIncompatible(classes)}
                  count={counts?.[slotId(key)] ?? 0}
                  suggested={sameSlot(suggested, key)}
                  onSelect={onSelect ? () => onSelect(key) : undefined}
                  readOnly={readOnly}
                  disabled={disabled}
                />
              </Fragment>
            );
          })}
        </div>
      ))}
    </div>
  );
}

type LegendProps = {
  /** "선택 칸" 칩 — 칸을 고를 수 없는 보기 전용 화면에서는 false */
  showSelected?: boolean;
  /** "섞으면 위험" 아이콘 설명 */
  showWarning?: boolean;
};

/** 배치도 아래 범례 한 줄 (시안 11 cabinet-legend): 미지정 · 선택 칸 칩(보기 전용 storage-class-chip) + 경고 아이콘 설명 */
export function CabinetLegend({ showSelected = true, showWarning = true }: LegendProps) {
  return (
    <div role="group" aria-label="범례" className={styles.legend}>
      <StorageClassChip label={SLOT_UNSET_LABEL} readOnly />
      {showSelected ? <StorageClassChip label="선택 칸" readOnly selected /> : null}
      {showWarning ? (
        <span className={styles.legendWarning}>
          <Icon name="warning" className={styles.warning} />
          <span>{WARNING_LABEL}</span>
        </span>
      ) : null}
    </div>
  );
}
