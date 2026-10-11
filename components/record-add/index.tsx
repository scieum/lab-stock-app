import Link from "next/link";
import { Icon } from "@/components/icons";
import { LinkPending } from "@/components/link-pending";
import styles from "./styles.module.css";

/** 화면 10 "기록 추가" → 빈 화면 4 (저장하면 화면 10 으로 돌아온다) */
export const RECORD_ADD_HREF = "/usage/new?from=usage";

/**
 * 기록 추가 (디자인 1.26 record_add, record-add): 화면 10 페이지 머리 오른쪽 button-primary "기록 추가" + plus 아이콘
 * (모바일 높이 44 작은 pill · 떠 있는 버튼 없음). 모든 역할. 둘러보기는 기록 탭 자체가 잠금이라 없다.
 */
export function RecordAdd({ href = RECORD_ADD_HREF, className }: { href?: string; className?: string }) {
  return (
    <div data-component="record-add" className={[styles.wrap, className ?? ""].filter(Boolean).join(" ")}>
      <Link data-component="button-primary" href={href} className={styles.button}>
        <Icon name="plus" className={styles.icon} />
        <span>기록 추가</span>
        <LinkPending />
      </Link>
    </div>
  );
}
