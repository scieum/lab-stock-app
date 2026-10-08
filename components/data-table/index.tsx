"use client";

import Link from "next/link";
import { Icon } from "@/components/icons";
import { linkPrefetch } from "@/lib/link-prefetch";
import styles from "./styles.module.css";

/**
 * 정렬 상태 — asc = 오름차순(↑), desc = 내림차순(↓), none = 정렬할 수 있지만 지금은 아님(위아래 꺾쇠 회색).
 * 정렬할 수 없는 열은 sort 를 주지 않는다.
 */
export type DataTableSort = "asc" | "desc" | "none";

export type DataTableColumn = {
  key: string;
  /** 머리행 글자 (12 회색). 빈 글자 = 동작 열(더보기) */
  label: string;
  /** 열 폭 (표 폭에 대한 비율 "18%" — 시안 열 폭 / 표 안쪽 폭) */
  width?: string;
  sort?: DataTableSort;
  /** 머리 칸을 누르면 (정렬 바꾸기) */
  onSort?: () => void;
  align?: "start" | "end";
};

type TableProps = {
  /** 표 이름 (읽기 도구) */
  label: string;
  columns: DataTableColumn[];
  /** 행 (DataTableRow · DataTableGroupRow) */
  children?: React.ReactNode;
  /** 행이 하나도 없을 때 표 안(머리행 아래)에 보여 줄 것 — ex-empty-state-card 등 */
  empty?: React.ReactNode;
  className?: string;
};

function ariaSort(sort: DataTableSort | undefined): "ascending" | "descending" | undefined {
  if (sort === "asc") return "ascending";
  if (sort === "desc") return "descending";
  return undefined;
}

/**
 * 데스크톱 목록 표 (디자인 1.24 data-table, rules.json desktop_shell.desktop_required 2·8·9·10):
 * 흰 바탕 + border 한 줄 + radius 16. 머리행(table-head) 높이 40 · 좌우 16, 열 이름 12 회색 + 정렬 표시(sort-arrow 20).
 * 행(ex-data-table-cell) 높이 48 · 좌우 16 · 아래 hairline(마지막 행 제외), 글자 13. 선택(활성) 행 = 연하늘 바탕.
 * 행이 없으면 머리행 아래에 empty 를 가운데 둔다 (2-filter-empty).
 */
export function DataTable({ label, columns, children, empty, className }: TableProps) {
  return (
    <div data-component="data-table" className={[styles.wrap, className ?? ""].filter(Boolean).join(" ")}>
      <table className={styles.table} aria-label={label}>
        <colgroup>
          {columns.map((c) => (
            <col key={c.key} style={c.width ? { width: c.width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr className={styles.head} data-name="table-head">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={[styles.headCell, c.align === "end" ? styles.end : ""].filter(Boolean).join(" ")}
                aria-sort={ariaSort(c.sort)}
              >
                {c.sort && c.onSort ? (
                  <button type="button" className={styles.sortButton} onClick={c.onSort}>
                    <span>{c.label}</span>
                    <Icon
                      name={c.sort === "asc" ? "arrow-up" : c.sort === "desc" ? "arrow-down" : "sort"}
                      className={[styles.sortIcon, c.sort === "none" ? "" : styles.sortActive].filter(Boolean).join(" ")}
                    />
                  </button>
                ) : c.label ? (
                  <span className={styles.headLabel}>{c.label}</span>
                ) : (
                  <span className={styles.srOnly}>동작</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty ? <div className={styles.empty}>{empty}</div> : null}
    </div>
  );
}

type RowProps = {
  children: React.ReactNode;
  /** 활성 행 (드로어에 열린 행 · 본인 행) = 연하늘 바탕 */
  selected?: boolean;
  /**
   * 행 전체를 누를 수 있게 — 행 안의 DataTableLinkCell 링크를 누른 것과 같다 (키보드는 그 링크로 간다).
   * 행 안의 다른 버튼·링크·입력을 누른 경우는 그쪽 동작만.
   */
  clickable?: boolean;
  /** 행 높이가 글자 두 줄일 때 (기록 캡션) — 위아래 12 */
  tall?: boolean;
  className?: string;
};

const INTERACTIVE = "a, button, input, select, textarea, label, [role='menu'], [role='menuitem']";

/** 표 행 (시안 노드 이름 ex-data-table-cell). */
export function DataTableRow({ children, selected = false, clickable = false, tall = false, className }: RowProps) {
  return (
    <tr
      data-component="ex-data-table-cell"
      data-selected={selected ? "true" : undefined}
      className={[styles.row, selected ? styles.selected : "", clickable ? styles.clickable : "", tall ? styles.tall : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      onClick={
        clickable
          ? (e) => {
              const target = e.target as Element;
              if (target.closest(INTERACTIVE)) return;
              const link = e.currentTarget.querySelector<HTMLAnchorElement>("a[data-row-link]");
              link?.click();
            }
          : undefined
      }
    >
      {children}
    </tr>
  );
}

type CellProps = {
  children?: React.ReactNode;
  /** muted = 회색 글자 ("칸 없음" · "없음") */
  tone?: "default" | "muted";
  strong?: boolean;
  align?: "start" | "end";
  className?: string;
};

/** 표 칸 (글자 13, 넘치면 말줄임) */
export function DataTableCell({ children, tone = "default", strong = false, align = "start", className }: CellProps) {
  return (
    <td
      className={[
        styles.cell,
        tone === "muted" ? styles.muted : "",
        strong ? styles.strong : "",
        align === "end" ? styles.end : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </td>
  );
}

type LinkCellProps = {
  href: string;
  children: React.ReactNode;
  /** 이 행이 지금 열린 행 */
  current?: boolean;
  /** 넘치는 글자 아래 보조 줄 (기록 "10월 6일에 기록") */
  caption?: string;
  /** 이동 뒤 화면을 맨 위로 올리지 않는다 (기본 — 목록 위치 유지) */
  scroll?: boolean;
};

/** 행의 대표 칸 = 행 링크 (키보드 포커스가 가는 곳). 행 어디를 눌러도 이 링크로 간다 (DataTableRow clickable). */
export function DataTableLinkCell({ href, children, current = false, caption, scroll = false }: LinkCellProps) {
  return (
    <td className={[styles.cell, current ? styles.strong : ""].filter(Boolean).join(" ")}>
      <Link
        href={href}
        prefetch={linkPrefetch(href)}
        scroll={scroll}
        data-row-link=""
        aria-current={current ? "true" : undefined}
        className={styles.rowLink}
      >
        <span className={styles.rowLinkText}>{children}</span>
        {caption ? <span className={styles.caption}>{caption}</span> : null}
      </Link>
    </td>
  );
}

type ButtonCellProps = {
  onClick: () => void;
  children: React.ReactNode;
  current?: boolean;
  caption?: string;
  /** 누르면 열리는 것 (읽기 도구) */
  controls?: string;
};

/** 행의 대표 칸 = 버튼 (주소 대신 화면 상태로 여는 행) */
export function DataTableButtonCell({ onClick, children, current = false, caption, controls }: ButtonCellProps) {
  return (
    <td className={[styles.cell, current ? styles.strong : ""].filter(Boolean).join(" ")}>
      <button
        type="button"
        data-row-link=""
        className={styles.rowLink}
        aria-expanded={current}
        aria-controls={controls}
        onClick={onClick}
      >
        <span className={styles.rowLinkText}>{children}</span>
        {caption ? <span className={styles.caption}>{caption}</span> : null}
      </button>
    </td>
  );
}

/** 묶음 머리 행 (시안 10 date-group-row: 하늘색 막대 4 × 16 + "10월 7일 · 오늘" 12/600 회색) */
export function DataTableGroupRow({ label, colSpan }: { label: string; colSpan: number }) {
  return (
    <tr className={styles.group} data-name="date-group-row">
      <th scope="colgroup" colSpan={colSpan} className={styles.groupCell}>
        <span className={styles.groupInner}>
          <span className={styles.groupIndicator} aria-hidden="true" />
          {label}
        </span>
      </th>
    </tr>
  );
}

/** 보이는 쪽 번호 — 7쪽 이하면 전부, 넘으면 처음 · 현재 앞뒤 · 끝 (사이 줄임 = null) */
function pageWindow(page: number, count: number): (number | null)[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const keep = new Set([1, count, page - 1, page, page + 1].filter((p) => p >= 1 && p <= count));
  if (page <= 3) [2, 3, 4].forEach((p) => keep.add(p));
  if (page >= count - 2) [count - 3, count - 2, count - 1].forEach((p) => keep.add(p));
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(null);
    out.push(p);
  });
  return out;
}

type PaginationProps = {
  page: number;
  pageCount: number;
  /** 쪽 번호 → 주소 (링크) */
  hrefOf?: (page: number) => string;
  /** 쪽 번호를 눌렀을 때 (주소 대신) */
  onPage?: (page: number) => void;
  label?: string;
};

/** 표 아래 쪽 번호 (시안 pagination: 32 원, 현재 쪽 = 연하늘 채움 · 글자 12/600) */
export function DataTablePagination({ page, pageCount, hrefOf, onPage, label = "쪽" }: PaginationProps) {
  if (pageCount < 1) return null;
  const pages = pageWindow(page, pageCount);
  return (
    <nav className={styles.pagination} aria-label={label} data-name="pagination">
      {pages.map((p, i) => {
        if (p === null) {
          return (
            <span key={`gap-${i}`} className={styles.pageGap} aria-hidden="true">
              …
            </span>
          );
        }
        const cls = [styles.page, p === page ? styles.pageCurrent : ""].filter(Boolean).join(" ");
        if (hrefOf) {
          const href = hrefOf(p);
          return (
            <Link key={p} href={href} scroll={false} className={cls} aria-current={p === page ? "page" : undefined}>
              {p}
            </Link>
          );
        }
        return (
          <button
            key={p}
            type="button"
            className={cls}
            aria-current={p === page ? "page" : undefined}
            onClick={() => onPage?.(p)}
          >
            {p}
          </button>
        );
      })}
    </nav>
  );
}
export { DataTableRowMenu, type RowMenuItem } from "./row-menu";
