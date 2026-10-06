import { Children, isValidElement } from "react";
import { ButtonOutline } from "@/components/button-outline";
import styles from "./styles.module.css";

export { CabinetDeleteConfirm, CabinetRenameSheet, CabinetUnsavedConfirm } from "./sheets";
export { CabinetScreen, CabinetTitle } from "./layout";

type Props = {
  /** "이름 바꾸기" — 이름 시트를 연다 */
  onRename?: () => void;
  /** "삭제" — 삭제 확인 카드를 연다 */
  onDelete?: () => void;
  /** true = 관리 줄을 누를 수 없다 (시트·확인 카드가 열려 있거나 저장 중) */
  busy?: boolean;
  /** 관리 줄 "이름 바꾸기" 옆 qr-print (디자인 1.15) */
  qrPrint?: React.ReactNode;
  /**
   * panel = 디자인 1.15 편집 패널 (CabinetScreen 안에서 쓴다): 관리 줄 + selects 를 한 묶음으로, 그 아래 picker · warning · footer.
   * 모바일은 배치도가 selects 와 picker 사이에 끼어 보이고(시안 11-mobile), 데스크톱은 오른쪽 테두리 카드(시안 11-desktop).
   * 넘기지 않으면 예전 모양(children · board)
   */
  layout?: "panel";
  /** panel: 선택 칸 분류 칩 묶음 (StorageClassPicker) */
  picker?: React.ReactNode;
  /** panel: mix-warning */
  warning?: React.ReactNode;
  /** panel: 저장 줄 (CabinetSaveBar) */
  footer?: React.ReactNode;
  /** 관리 줄 아래: 문 형태·단 수 선택, 배치도, 분류 칩 묶음, mix-warning, 저장 버튼 */
  children?: React.ReactNode;
  /**
   * 배치도 + 범례. 넘기면 "나란한 배치"가 된다 (시안 11-desktop cabinet-main):
   * 모바일은 관리 줄 → selects → board → children 한 열(시안 11-mobile 그대로),
   * 데스크톱은 왼쪽 열 = board, 오른쪽 테두리 카드 = 관리 줄 · selects · children.
   * DOM 순서는 두 폭 모두 모바일 순서다.
   */
  board?: React.ReactNode;
  /** 문 형태·단 수 선택 (board 를 넘길 때 — 관리 줄 바로 아래) */
  selects?: React.ReactNode;
  /** 읽기 도구용 이름 */
  label?: string;
};

/**
 * 시약장 편집 영역 (화면 11, 교사·admin 만 — R7: 학생 화면 0개).
 * 맨 위 관리 줄 = button-outline "이름 바꾸기" + qr-print "QR 인쇄"(디자인 1.15) + 오른쪽 조용한 텍스트 동작 "삭제"(핑크 아님),
 * 그 아래 children (예전 모양) 또는 panel 묶음(selects · picker · warning · footer).
 * 모바일은 테두리 없는 세로 묶음, 데스크톱은 테두리 카드 (시안 11-desktop).
 */
export function CabinetEdit({
  onRename,
  onDelete,
  busy = false,
  qrPrint,
  children,
  board,
  selects,
  layout,
  picker,
  warning,
  footer,
  label = "시약장 편집",
}: Props) {
  const manage = (
    <div className={styles.manage}>
      <div className={styles.manageActions}>
        <ButtonOutline className={styles.rename} disabled={busy} onClick={onRename}>
          이름 바꾸기
        </ButtonOutline>
        {qrPrint}
      </div>
      <button type="button" className={styles.delete} disabled={busy} onClick={onDelete}>
        삭제
      </button>
    </div>
  );
  if (layout === "panel") {
    return (
      <section data-component="cabinet-edit" className={[styles.edit, styles.panel].join(" ")} aria-label={label}>
        <div className={styles.pHead}>
          {manage}
          {selects}
          {children}
        </div>
        {picker ? <div className={styles.pPicker}>{picker}</div> : null}
        {warning ? <div className={styles.pWarning}>{warning}</div> : null}
        {footer ? <div className={styles.pFooter}>{footer}</div> : null}
      </section>
    );
  }
  const split = board !== undefined;
  return (
    <section data-component="cabinet-edit" className={[styles.edit, split ? styles.split : ""].filter(Boolean).join(" ")} aria-label={label}>
      {manage}
      {split ? (
        <>
          {selects ? <div className={styles.segment}>{selects}</div> : null}
          <div className={styles.board}>{board}</div>
          {/* 조각마다 카드의 한 토막 — 아무것도 그리지 않는 조각(mix-warning 0줄)은 CSS(:empty)가 숨긴다 */}
          {Children.toArray(children).map((child, i) => (
            <div key={isValidElement(child) && child.key != null ? child.key : i} className={styles.segment}>
              {child}
            </div>
          ))}
          <div className={styles.foot} aria-hidden="true" />
        </>
      ) : (
        children
      )}
    </section>
  );
}

/** 문 형태 · 단 수 선택 자리 (시안 cabinet-selects): 모바일은 나란히 2열, 데스크톱은 세로 */
export function CabinetSelects({ children }: { children: React.ReactNode }) {
  return <div className={styles.selects}>{children}</div>;
}

type SaveBarProps = {
  /** 저장 버튼 위 안내 한 줄 ("이 변경으로 시약 2종이 '칸 없음'이 돼요", d7 §9 칸 줄이기) */
  notice?: string;
  /**
   * true(기본) = 모바일에서 tab-bar 바로 위에 고정 (시안 11-mobile save-bar). 고정된 줄은 자리를 차지하지 않으므로
   * 화면 쪽이 본문 아래에 그만큼 여백을 둔다. false = 항상 제자리(갤러리). 데스크톱은 늘 제자리다.
   */
  sticky?: boolean;
  /** button-primary "저장" */
  children: React.ReactNode;
};

/** 저장 버튼 줄 — cabinet-edit 안 맨 아래에 둔다 */
export function CabinetSaveBar({ notice, sticky = true, children }: SaveBarProps) {
  return (
    <div className={[styles.saveBar, sticky ? styles.sticky : ""].filter(Boolean).join(" ")}>
      {notice ? (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      ) : null}
      {children}
    </div>
  );
}
