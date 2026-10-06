"use client";

import { Icon } from "@/components/icons";
import styles from "./favorite.module.css";

type Props = {
  /** 판매처 이름 (data-vendor-name — 버튼 이름은 "즐겨찾기 추가"/"즐겨찾기 해제", 행 안에 판매처명이 같이 있다) */
  name: string;
  /** 지금 즐겨찾기인지 */
  favorite: boolean;
  /** 누름 → 화면 쪽이 바로 저장한다(서버 액션). 실패하면 화면 쪽이 되돌린다 */
  onToggle?: (next: boolean) => void;
  disabled?: boolean;
  className?: string;
};

/**
 * 판매처 즐겨찾기 별표 (d7 §12-1, 시안 예외 — 새 data-component 가 아니라 vendor-link·화면 9 판매처 행 안의 요소).
 * 아이콘 20, 누름 영역 = 버튼 최소 높이(rules.json). 즐겨찾기 = 하늘색 채운 별 / 아님 = 회색 선 별. 글자색에는 하늘색을 쓰지 않는다.
 */
export function VendorFavoriteToggle({ name, favorite, onToggle, disabled, className }: Props) {
  const label = favorite ? "즐겨찾기 해제" : "즐겨찾기 추가";
  return (
    <button
      type="button"
      data-testid="vendor-favorite-toggle"
      className={[styles.toggle, className ?? ""].filter(Boolean).join(" ")}
      aria-pressed={favorite}
      aria-label={label}
      data-vendor-name={name}
      disabled={disabled}
      onClick={(e) => {
        // 행 선택(라디오 라벨)·행 메뉴로 번지지 않게
        e.preventDefault();
        e.stopPropagation();
        onToggle?.(!favorite);
      }}
    >
      <Icon
        name="star"
        className={[styles.icon, favorite ? styles.iconOn : ""].filter(Boolean).join(" ")}
        fill={favorite ? "currentColor" : "none"}
      />
    </button>
  );
}
