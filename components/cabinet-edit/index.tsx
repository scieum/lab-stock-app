import { ButtonOutline } from "@/components/button-outline";
import styles from "./styles.module.css";

export { CabinetDeleteConfirm, CabinetRenameSheet } from "./sheets";

type Props = {
  /** "이름 바꾸기" — 이름 시트를 연다 */
  onRename?: () => void;
  /** "삭제" — 삭제 확인 카드를 연다 */
  onDelete?: () => void;
  /** true = 관리 줄을 누를 수 없다 (시트·확인 카드가 열려 있거나 저장 중) */
  busy?: boolean;
  /** 관리 줄 아래: 문 형태·단 수 선택, 배치도, 분류 칩 묶음, mix-warning, 저장 버튼 */
  children?: React.ReactNode;
  /** 읽기 도구용 이름 */
  label?: string;
};

/**
 * 시약장 편집 영역 (화면 11, 교사·admin 만 — R7: 학생 화면 0개).
 * 맨 위 관리 줄 = button-outline "이름 바꾸기" + 조용한 텍스트 동작 "삭제"(핑크 아님), 그 아래 children.
 * 모바일은 테두리 없는 세로 묶음, 데스크톱은 테두리 카드 (시안 11-desktop).
 */
export function CabinetEdit({ onRename, onDelete, busy = false, children, label = "시약장 편집" }: Props) {
  return (
    <section data-component="cabinet-edit" className={styles.edit} aria-label={label}>
      <div className={styles.manage}>
        <ButtonOutline className={styles.rename} disabled={busy} onClick={onRename}>
          이름 바꾸기
        </ButtonOutline>
        <button type="button" className={styles.delete} disabled={busy} onClick={onDelete}>
          삭제
        </button>
      </div>
      {children}
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
