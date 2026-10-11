"use client";

import { useRouter } from "next/navigation";
import { ButtonOutline } from "@/components/button-outline";
import { ButtonPrimary } from "@/components/button-primary";
import { EmptyStateCard } from "@/components/ex-empty-state-card";
import styles from "./not-found.module.css";

/** rules.json 1.26 not_found.card */
export const NOT_FOUND_TEXT = {
  title: "페이지를 찾을 수 없어요",
  body: "주소가 바뀌었거나 없는 페이지예요.",
} as const;

type Props = {
  /** app = 로그인 후(홈으로 + 뒤로, 프레임 13-not-found) · pre = 로그인 전(처음으로, 프레임 1-not-found) */
  kind: "app" | "pre";
  /** "홈으로" 가 갈 곳 (둘러보기 = /demo) */
  homeHref?: string;
  className?: string;
};

/**
 * 404 카드 (디자인 1.26 not_found, d7 §25): ex-empty-state-card(icon-compass) "페이지를 찾을 수 없어요" ·
 * "주소가 바뀌었거나 없는 페이지예요." + 로그인 후 = button-primary "홈으로" + button-outline "뒤로" · 로그인 전 = button-primary "처음으로"(→ /).
 * 다른 학교 · 삭제된 · 없는 시약/센서 주소도 같은 카드 (어느 쪽인지 구분하지 않는다).
 */
export function NotFoundCard({ kind, homeHref = "/", className }: Props) {
  const router = useRouter();
  return (
    <div className={[styles.cardWrap, className ?? ""].filter(Boolean).join(" ")}>
      <EmptyStateCard variant="outlined" icon="compass" iconTone="ink" fullActions title={NOT_FOUND_TEXT.title} description={NOT_FOUND_TEXT.body}>
        {kind === "app" ? (
          <div className={styles.actions}>
            <ButtonPrimary href={homeHref} className={styles.action}>
              홈으로
            </ButtonPrimary>
            <ButtonOutline
              className={styles.action}
              onClick={() => {
                if (window.history.length > 1) router.back();
                else router.push(homeHref);
              }}
            >
              뒤로
            </ButtonOutline>
          </div>
        ) : (
          <div className={styles.actions}>
            <ButtonPrimary href="/" className={styles.action}>
              처음으로
            </ButtonPrimary>
          </div>
        )}
      </EmptyStateCard>
    </div>
  );
}
