import { redirect } from "next/navigation";

/** 사용 기록 내역 화면은 MVP 범위 밖 — 탭바 '기록'·홈 '더 보기'는 사용 기록 입력(화면 4)으로 보낸다 */
export default function UsageIndexPage() {
  redirect("/usage/new");
}
