"use client";

import { useEffect, useId, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ButtonPillSoft } from "@/components/button-pill-soft";
import { CabinetNumber } from "@/components/cabinet-number";
import { DetailDrawer } from "@/components/detail-drawer";
import { Icon } from "@/components/icons";
import styles from "./styles.module.css";

export const QR_RESULT_EMPTY = "이 시약장에는 아직 시약이 없어요";
export const QR_RESULT_LAYOUT_LABEL = "배치도 보기";

type Props = {
  /** sheet = 모바일 바텀시트 (시안 12-result-mobile) · drawer = 데스크톱 detail-drawer 안 (시안 12-result-desktop) */
  variant: "sheet" | "drawer";
  /** 시약장 번호 (cabinet-number) */
  number: number;
  /** 시약장 이름 ("1번 시약장") */
  title: string;
  /** "{문 종류} · {N}단 · 시약 {k}개" (화면 11 과 같은 글자) */
  caption: string;
  /** 배치도 보기 → `/cabinets?c={id}` */
  layoutHref: string;
  /** 닫기 (× · Esc · 시트 바깥) — 스캔으로 돌아가 카메라 다시 켬 */
  onClose?: () => void;
  /** 또는 닫을 때 갈 주소 (주소창 `/scan?cabinet={id}` = 결과 열린 상태 → `/scan`). onClose 가 있으면 onClose */
  closeHref?: string;
  /** 시약 0개 = 목록 대신 "이 시약장에는 아직 시약이 없어요" */
  empty?: boolean;
  /** 결과 목록 — 모바일 reagent-row 들 / 데스크톱 result-table (부르는 쪽이 그린다) */
  children?: React.ReactNode;
  /** true = 제자리 상자 (갤러리 — 고정 위치·포커스 이동·바깥 누름 닫기 없음) */
  inline?: boolean;
  /** 바뀌면 제목으로 포커스를 다시 옮긴다 (다른 시약장 결과로 바뀔 때) */
  focusKey?: string;
};

function SheetHead({
  titleId,
  number,
  title,
  caption,
  onClose,
  closeHref,
}: Pick<Props, "number" | "title" | "caption" | "onClose" | "closeHref"> & { titleId: string }) {
  return (
    <div className={styles.head} data-name="sheet-head">
      <div className={styles.header} data-name="sheet-header">
        <div className={styles.titleRow} data-name="sheet-title">
          <CabinetNumber number={number} />
          <h2 id={titleId} className={styles.title} tabIndex={-1} data-drawer-focus="" data-name="sheet-title-text">
            {title}
          </h2>
        </div>
        {onClose || !closeHref ? (
          <button type="button" className={styles.close} aria-label="닫기" onClick={onClose} data-name="sheet-close">
            <Icon name="close" className={styles.closeIcon} />
          </button>
        ) : (
          <Link href={closeHref} scroll={false} prefetch={false} replace className={styles.close} aria-label="닫기" data-name="sheet-close">
            <Icon name="close" className={styles.closeIcon} />
          </Link>
        )}
      </div>
      <p className={styles.caption} data-name="sheet-caption">
        {caption}
      </p>
    </div>
  );
}

function ResultBody({ empty, children, variant }: Pick<Props, "empty" | "children" | "variant">) {
  if (empty) {
    return (
      <p className={styles.empty} role="status" data-name="result-empty">
        {QR_RESULT_EMPTY}
      </p>
    );
  }
  return (
    <div className={variant === "sheet" ? styles.list : styles.table} data-name={variant === "sheet" ? "result-list" : "result-table"}>
      {children}
    </div>
  );
}

function LayoutButton({ href }: { href: string }) {
  return (
    <ButtonPillSoft href={href} icon="chevron-right" fullWidth className={styles.layout}>
      {QR_RESULT_LAYOUT_LABEL}
    </ButtonPillSoft>
  );
}

/**
 * QR 결과 (디자인 1.26 화면 12-result qr-result-sheet):
 * sheet-head = cabinet-number + 시약장 이름(20/700) + ×(44, 하늘색) / 캡션(12 회색) → 결과 목록 → button-pill-soft "배치도 보기".
 * 모바일 = tab-bar 위 하단 시트(흰 바탕 · border-strong · 위쪽 radius 24 · 안쪽 24 · 사이 16, 딤 없음).
 * 데스크톱 = 오른쪽 detail-drawer 의 drawer-body 안 (배치도 보기는 drawer-actions).
 */
export function QrResultSheet(props: Props) {
  if (props.variant === "drawer") return <ResultDrawer {...props} />;
  return <ResultSheet {...props} />;
}

function ResultDrawer({ number, title, caption, layoutHref, onClose, closeHref, empty, children, inline, focusKey }: Props) {
  const titleId = useId();
  return (
    <DetailDrawer labelledBy={titleId} onClose={onClose} closeHref={onClose ? undefined : closeHref} inline={inline} focusKey={focusKey} actions={<LayoutButton href={layoutHref} />}>
      <div data-component="qr-result-sheet" className={styles.inDrawer}>
        <SheetHead titleId={titleId} number={number} title={title} caption={caption} onClose={onClose} closeHref={closeHref} />
        <ResultBody empty={empty} variant="drawer">
          {children}
        </ResultBody>
      </div>
    </DetailDrawer>
  );
}

function ResultSheet({ number, title, caption, layoutHref, onClose, closeHref, empty, children, inline = false, focusKey }: Props) {
  const titleId = useId();
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const close = () => {
    if (onClose) onClose();
    else if (closeHref) router.replace(closeHref, { scroll: false });
  };
  const onCloseRef = useRef(close);
  useEffect(() => {
    onCloseRef.current = close;
  });

  // 열릴 때(·다른 시약장으로 바뀔 때) 제목으로 포커스
  useEffect(() => {
    if (inline) return;
    rootRef.current?.querySelector<HTMLElement>("[data-drawer-focus]")?.focus({ preventScroll: true });
  }, [inline, focusKey]);

  // Esc · 시트 바깥 누름 = 닫기
  useEffect(() => {
    if (inline) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onCloseRef.current();
    };
    const onDown = (e: PointerEvent) => {
      const root = rootRef.current;
      if (!root || !(e.target instanceof Node) || root.contains(e.target)) return;
      onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [inline]);

  return (
    <div
      ref={rootRef}
      data-component="qr-result-sheet"
      role="dialog"
      aria-modal={inline ? undefined : "false"}
      aria-labelledby={titleId}
      className={[styles.sheet, inline ? styles.inline : styles.fixed].join(" ")}
    >
      <SheetHead titleId={titleId} number={number} title={title} caption={caption} onClose={onClose} closeHref={closeHref} />
      <div className={styles.scroll}>
        <ResultBody empty={empty} variant="sheet">
          {children}
        </ResultBody>
      </div>
      <LayoutButton href={layoutHref} />
    </div>
  );
}
