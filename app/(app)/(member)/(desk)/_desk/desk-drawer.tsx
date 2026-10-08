"use client";

import { useSearchParams } from "next/navigation";
import { ButtonOutline } from "@/components/button-outline";
import { DetailDrawer } from "@/components/detail-drawer";
import { msdsDrawerHref, reagentDetailHref, reagentListHref, usageNewHref } from "@/lib/reagent-desk";
import styles from "./desk.module.css";

/**
 * 데스크톱 시약 드로어 주소들 — 지금 주소창의 목록 쿼리를 그대로 들고 간다
 * (드로어가 열린 채 목록 검색·필터를 바꿔도 닫기·뒤로·다음 드로어가 같은 목록으로 돌아온다).
 */
export function useDeskHrefs(reagentId?: string | null) {
  const sp = useSearchParams();
  return {
    list: reagentListHref(sp),
    detail: reagentId ? reagentDetailHref(reagentId, sp) : reagentListHref(sp),
    usage: reagentId ? usageNewHref(reagentId, sp) : reagentListHref(sp),
    msds: reagentId ? msdsDrawerHref(reagentId, sp) : reagentListHref(sp),
  };
}

type Props = Omit<React.ComponentProps<typeof DetailDrawer>, "closeHref" | "back" | "onClose"> & {
  /** 이 드로어의 시약 */
  reagentId?: string | null;
  /** 위 줄 뒤로: "detail" = "‹ 시약 상세"(화면 4 · 16), 또는 다른 주소 */
  back?: "detail" | { href: string; label: string };
};

/** 시약 목록 옆 드로어 (닫기 = 목록 주소 + 목록 쿼리) */
export function DeskDrawer({ reagentId, back, ...rest }: Props) {
  const hrefs = useDeskHrefs(reagentId);
  const backLink = back === "detail" ? { href: hrefs.detail, label: "시약 상세" } : back;
  return <DetailDrawer {...rest} closeHref={hrefs.list} back={backLink} />;
}

/** 없는 시약 · 다른 학교 시약 (데스크톱 드로어 자리) — 어느 쪽인지 구분하지 않는다 */
export function DeskNotFoundDrawer() {
  const hrefs = useDeskHrefs(null);
  return (
    <DetailDrawer title="시약을 찾을 수 없어요" closeHref={hrefs.list}>
      <p className={styles.drawerNote}>목록에서 다른 시약을 골라 주세요</p>
      <div>
        <ButtonOutline href={hrefs.list}>시약 목록으로</ButtonOutline>
      </div>
    </DetailDrawer>
  );
}
