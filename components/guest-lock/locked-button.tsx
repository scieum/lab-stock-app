"use client";

import { ButtonOutline } from "@/components/button-outline";
import { ButtonPillSoft } from "@/components/button-pill-soft";
import { ButtonPrimary } from "@/components/button-primary";
import { GuestLock } from "@/components/guest-lock";
import { useGuestToast } from "./toast";

type Props = {
  children: React.ReactNode;
  variant: "primary" | "outline" | "pill-soft";
  fullWidth?: boolean;
  className?: string;
};

/**
 * 둘러보기에서 잠긴 쓰기 동작 버튼 (시안 3-guest bottom-actions/button-primary · 13-guest recent-usage-card/button-pill-soft).
 * 원래 버튼 모양 그대로 + guest-lock. 누르면 ex-toast 만 띄운다 — 이동·요청 없음.
 */
export function GuestLockedButton({ children, variant, fullWidth, className }: Props) {
  const { show } = useGuestToast();
  const content = (
    <>
      <GuestLock />
      {children}
    </>
  );
  if (variant === "primary") {
    return (
      <ButtonPrimary onClick={show} fullWidth={fullWidth} className={className}>
        {content}
      </ButtonPrimary>
    );
  }
  if (variant === "outline") {
    return (
      <ButtonOutline onClick={show} className={className}>
        {content}
      </ButtonOutline>
    );
  }
  return (
    <ButtonPillSoft onClick={show} fullWidth={fullWidth} className={className}>
      {content}
    </ButtonPillSoft>
  );
}
