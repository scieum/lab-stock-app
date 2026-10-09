import Link from "next/link";
import { ButtonOutline } from "@/components/button-outline";
import { ButtonPrimary } from "@/components/button-primary";
import outlineStyles from "@/components/button-outline/styles.module.css";
import primaryStyles from "@/components/button-primary/styles.module.css";
import { GuestLockedButton } from "@/components/guest-lock/locked-button";
import { Icon } from "@/components/icons";
import { LinkPending } from "@/components/link-pending";
import { linkPrefetch } from "@/lib/link-prefetch";
import { QuickActionLocked } from "./locked-item";
import styles from "./styles.module.css";

export type QuickActionItem = {
  label: string;
  href: string;
  icon: "pen" | "intake" | "qr" | "record" | "cabinet" | "users";
  /**
   * 역할 규칙(rules.json roles)이 세는 진입점 이름 — 예: 입고 = stock-intake, 사용자 관리 = user-manage.
   * 주면 칸 링크에 data-component 로 붙는다.
   */
  entry?: string;
  /** 둘러보기 잠금 — 링크 대신 guest-lock 버튼(ex-toast "가입하면 쓸 수 있어요"), 이동·요청 없음 */
  locked?: boolean;
};

/** 홈 빠른 실행 (회색 타일 + 하늘색 원 아이콘). 역할별로 보여줄 항목만 넘긴다. */
export function QuickAction({ items }: { items: QuickActionItem[] }) {
  return (
    <nav data-component="quick-action" className={styles.grid} aria-label="빠른 실행">
      {items.map((it) =>
        it.locked ? (
          <QuickActionLocked key={it.href} label={it.label} icon={it.icon} />
        ) : (
          <Link key={it.href} href={it.href} prefetch={linkPrefetch(it.href)} className={styles.item} data-component={it.entry}>
            <span className={styles.iconBg}>
              <Icon name={it.icon} className={styles.icon} />
            </span>
            <span className={styles.label}>{it.label}</span>
            <LinkPending />
          </Link>
        ),
      )}
    </nav>
  );
}

/**
 * 데스크톱 홈 빠른 실행 (시안 13-desktop · 13-guest-desktop page-head quick-action): 버튼 한 줄(사이 8, 높이 44) —
 * 보조 진입은 button-outline, 마지막(주 행동 — 교사·admin "입고", 학생 "사용 기록 입력")은 button-primary.
 * 역할 진입점 이름(entry: stock-intake · user-manage)은 이동하는 링크(버튼 모양 <a>)에 data-component 로 붙는다. 둘러보기 잠금은 guest-lock 버튼.
 * items 순서 그대로 그리고, primary 로 그릴 항목은 부르는 쪽이 마지막에 둔다.
 */
export function QuickActionButtons({ items, primaryHref }: { items: QuickActionItem[]; primaryHref?: string }) {
  return (
    <nav data-component="quick-action" className={styles.buttons} aria-label="빠른 실행">
      {items.map((it) => {
        const primary = it.href === primaryHref;
        if (it.locked) {
          return (
            <span key={it.href} className={styles.entry}>
              <GuestLockedButton variant={primary ? "primary" : "outline"} className={styles.button}>
                {it.label}
              </GuestLockedButton>
            </span>
          );
        }
        // 역할 진입점(stock-intake · user-manage)은 실제로 이동하는 링크 자체에 이름을 붙인다 —
        // 모양은 button-primary · button-outline 그대로(같은 CSS), data-component 는 진입점 이름
        if (it.entry) {
          return (
            <Link
              key={it.href}
              href={it.href}
              prefetch={linkPrefetch(it.href)}
              data-component={it.entry}
              className={[primary ? primaryStyles.button : outlineStyles.button, styles.button].join(" ")}
            >
              {it.label}
              <LinkPending />
            </Link>
          );
        }
        return (
          <span key={it.href} className={styles.entry}>
            {primary ? (
              <ButtonPrimary href={it.href} className={styles.button}>
                {it.label}
              </ButtonPrimary>
            ) : (
              <ButtonOutline href={it.href} className={styles.button}>
                {it.label}
              </ButtonOutline>
            )}
          </span>
        );
      })}
    </nav>
  );
}
