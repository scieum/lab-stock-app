"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ManageList } from "@/components/manage-list";
import type { ManageCounts, ManageGroup } from "@/lib/manage-menu";
import { useIsDesktop } from "@/lib/use-viewport";
import styles from "./manage.module.css";

type Props = {
  /** lib/manage-menu manageMenu(role) · guestManageMenu() */
  groups: ManageGroup[];
  /** 요약 숫자 (getManageSummary · getDemoManageCounts) */
  counts: ManageCounts;
  /** 데스크톱 폭이면 보낼 곳 — 로그인 '/', 둘러보기 '/demo' (d7 §29: 데스크톱은 사이드바, /manage 없음) */
  desktopHref: string;
  /** 둘러보기 — 제목 위가 guest-banner (시안 18-guest-mobile) */
  guest?: boolean;
};

/**
 * 화면 18 관리 (rules 1.29 manage, 시안 18-mobile · 18-guest-mobile): 제목 '관리' → manage-list(묶음 · 행 · 요약 caption).
 * nav-pill(학교명 ▾)과 tab-bar('관리' 활성)는 셸이 그린다.
 *
 * 모바일 전용 화면이다. 서버는 화면 폭을 모르므로(요청 머리에 폭이 없다 — UA 추측은 태블릿·창 크기에서 틀린다)
 * 폭 판정은 브라우저가 한다: 첫 그림(폭 모름)에도 데스크톱 폭에서는 CSS(@media 1024)로 본문을 숨겨 깜빡이지 않고,
 * 하이드레이션 직후 데스크톱이면 router.replace 로 desktopHref 에 보낸다 (뒤로가기 기록에 /manage 가 남지 않는다).
 */
export function ManageView({ groups, counts, desktopHref, guest = false }: Props) {
  const router = useRouter();
  const desktop = useIsDesktop();

  useEffect(() => {
    if (desktop) router.replace(desktopHref);
  }, [desktop, desktopHref, router]);

  if (desktop) return null;
  return (
    <div className={[styles.page, guest ? styles.guest : ""].filter(Boolean).join(" ")}>
      <h1 className={styles.title}>관리</h1>
      <ManageList className={styles.list} groups={groups} counts={counts} />
    </div>
  );
}
