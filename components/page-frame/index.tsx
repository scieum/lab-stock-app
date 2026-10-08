import styles from "./styles.module.css";

/*
 * 데스크톱 본문 페이지 틀 (d7 §23 run c, rules.json 1.24 desktop_shell heavy_pages 5·7·11 · form_width 640).
 * 시안 컴포넌트 이름이 아니라 data-component 는 없다 — 시안 노드 이름은 data-name(page-head · page-title · title-row ·
 * page-actions · page-column · bottom-bar)으로 남긴다.
 * 모바일(< 1024)은 지금 화면 그대로: page-head 는 읽기 도구용 제목만 남기고(눈에는 nav-pill 의 제목), page-column 은
 * 배치에 끼어들지 않으며(display: contents), bottom-bar 는 부르는 쪽 className 의 모바일 모양(tab-bar 위 고정 줄 등)을 쓴다.
 */

type HeadProps = {
  /** 데스크톱 제목 (24/700 — 시안 page-title) */
  title: string;
  /**
   * 모바일 읽기 도구용 제목 (모바일 제목은 nav-pill 이 보여 준다). 없으면 title.
   * 두 폭에서 이름이 다른 화면(예: 화면 7 "입고·시약 등록" / 데스크톱 "입고")
   */
  mobileTitle?: string;
  /** 제목 옆 회색 12 ("3건" · "2개") */
  count?: string;
  /** 제목 아래 회색 13 (화면 13 "오늘 10월 7일 · 전체 시약 42종") */
  subtitle?: React.ReactNode;
  /** 오른쪽 page-actions (화면 13 quick-action) — 데스크톱에서만 보인다 */
  actions?: React.ReactNode;
  className?: string;
};

/** page-head: 왼쪽 page-title(제목 줄 + 부제) · 오른쪽 page-actions */
export function PageHead({ title, mobileTitle, count, subtitle, actions, className }: HeadProps) {
  const mobile = mobileTitle ?? title;
  return (
    <div className={[styles.head, className ?? ""].filter(Boolean).join(" ")} data-name="page-head">
      <div className={styles.titleBlock} data-name="page-title">
        <div className={styles.titleRow} data-name="title-row">
          <h1 className={styles.title}>
            {mobile === title ? (
              title
            ) : (
              <>
                <span className={styles.desktopText}>{title}</span>
                <span className={styles.mobileText}>{mobile}</span>
              </>
            )}
          </h1>
          {count ? <span className={styles.count}>{count}</span> : null}
        </div>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>
      {actions ? (
        <div className={styles.actions} data-name="page-actions">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

type ColumnProps = {
  children: React.ReactNode;
  /** true = 본문 전폭 (화면 7 서류 확인 표 — 시안 7-doc-review page-column 1136). 기본 = 가운데 640 */
  wide?: boolean;
  /** true = 아래 고정 bottom-bar 만큼 비운다 (마지막 블록이 바에 가리지 않게) */
  barSpace?: boolean;
  /** 블록 사이 — 기본 24 (시안 page-column gap), tight = 12 (화면 6) */
  gap?: "default" | "tight";
  className?: string;
};

/** page-column: 데스크톱 가운데 열(form_width 640) · 모바일은 배치에 끼어들지 않는다 */
export function PageColumn({ children, wide = false, barSpace = false, gap = "default", className }: ColumnProps) {
  return (
    <div
      className={[
        styles.column,
        wide ? styles.wide : "",
        barSpace ? styles.barSpace : "",
        gap === "tight" ? styles.tight : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-name="page-column"
    >
      {children}
    </div>
  );
}

type BarProps = {
  /** 오른쪽 버튼들 (저장·확인) */
  children: React.ReactNode;
  /** 왼쪽 끝 (화면 7-suggest "나중에") */
  start?: React.ReactNode;
  /** 바 위 안내 한 줄 (저장 실패 · 막힌 이유) — 데스크톱에서는 버튼 왼쪽 */
  note?: React.ReactNode;
  /** 모바일 모양 (부르는 쪽 — tab-bar 위 고정 줄 등). 데스크톱에서는 이 틀의 모양이 앞선다 */
  className?: string;
  /** true = 제자리 줄 (갤러리 — 고정하지 않는다) */
  inline?: boolean;
  /** 더 붙일 data-* 속성 (예: { "data-bottom-actions": "" }) */
  dataAttrs?: Record<`data-${string}`, string>;
};

/**
 * bottom-bar (시안 5·7·11-desktop): 본문 아래 고정 줄 — 흰 바탕 · 위 hairline · 높이 80 · 안쪽 16 32 · 버튼 오른쪽 끝(사이 8).
 * 데스크톱에서 사이드바 오른쪽 본문 폭만 차지하고, 오른쪽 detail-drawer 가 열려 있으면 그 왼쪽까지 (시안 11-print).
 */
export function BottomBar({ children, start, note, className, inline = false, dataAttrs }: BarProps) {
  return (
    <div
      className={[styles.bar, className ?? ""].filter(Boolean).join(" ")}
      data-name="bottom-bar"
      data-inline={inline ? "" : undefined}
      {...dataAttrs}
    >
      {start ? (
        <div className={styles.barStart} data-name="bar-start">
          {start}
        </div>
      ) : null}
      {note ? <div className={styles.barNote}>{note}</div> : null}
      {children}
    </div>
  );
}
