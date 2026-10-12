import type { Metadata } from "next";
import Link from "next/link";
import { InviteCancel, InviteCancelConfirm } from "@/components/invite-cancel";
import { InviteMoreMenu } from "@/components/invite-more-menu";
import { MobileMenuButton } from "@/components/mobile-menu-button";
import { MobileMenuSheet } from "@/components/mobile-menu-sheet";
import { guestMobileMenu, mobileMenu, sidebarAccountLabel } from "@/lib/sidebar-menu";
import styles from "../gallery.module.css";
import { InviteCancelDemo, MobileMenuDemo } from "./demo";

export const metadata: Metadata = { title: "모바일 전체 메뉴 · 초대 취소 갤러리 · Lab_Stock" };

function Item({ id, name, children }: { id: string; name: string; children: React.ReactNode }) {
  return (
    <section className={styles.item} aria-labelledby={`g-${id}`}>
      <h2 id={`g-${id}`} className={styles.itemName}>
        {name}
      </h2>
      <div className={styles.stage}>{children}</div>
    </section>
  );
}

/**
 * 디자인 1.28 (d7 §28) 모바일 전체 메뉴(mobile_menu) · 초대 취소(invite_cancel) 컴포넌트 예시
 * (시안 13-menu-mobile · 8-invite-cancel). 메뉴 항목은 lib/sidebar-menu (데스크톱 사이드바와 같은 출처). 화면 연결은 D3.
 */
export default function MenuGalleryPage() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>모바일 전체 메뉴 · 초대 취소</h1>
      <Link href="/gallery" className={styles.more}>
        컴포넌트 갤러리로
      </Link>
      <div className={styles.grid}>
        <Item id="menu-button" name="mobile-menu-button — 닫힘 · 열림 (모바일 폭에서만 보임)">
          <div className={styles.row}>
            <MobileMenuButton />
            <MobileMenuButton open />
          </div>
        </Item>
        <Item id="menu-demo" name="mobile-menu-button → mobile-menu-sheet (누르면 열림)">
          <MobileMenuDemo />
        </Item>
        <Item id="menu-admin" name="mobile-menu-sheet — admin (시안 13-menu-mobile: 홈 활성, 관리 · 학교 설정 묶음)">
          <MobileMenuSheet schoolName="샘플고등학교" account={sidebarAccountLabel("정OO", "admin")} groups={mobileMenu("admin")} active="home" floating={false} />
        </Item>
        <Item id="menu-student" name="mobile-menu-sheet — 학생 (시약 활성, 관리 묶음 없음)">
          <MobileMenuSheet schoolName="샘플고등학교" account={sidebarAccountLabel("이OO", "student")} groups={mobileMenu("student")} active="reagents" floating={false} />
        </Item>
        <Item id="menu-guest" name="mobile-menu-sheet — 둘러보기 (데모 학교, 기록·QR 스캔 잠금, 가입하기)">
          <MobileMenuSheet schoolName="데모 학교" groups={guestMobileMenu()} active="home" guest={{ signupHref: "/signup" }} floating={false} />
        </Item>
        <Item id="invite-menu" name="invite-more-menu · invite-cancel (시안 8-invite-cancel: ⋯ 열림)">
          <div className={styles.row}>
            <InviteMoreMenu email="han@example.com" defaultOpen>
              <InviteCancel />
            </InviteMoreMenu>
          </div>
        </Item>
        <Item id="invite-confirm" name="ex-modal-card — 초대 취소 확인 (닫기 · 초대 취소)">
          <InviteCancelConfirm email="han@example.com" sheet={false} modal={false} />
        </Item>
        <Item id="invite-demo" name="invite-more-menu → invite-cancel → 확인 → 행 빠짐">
          <InviteCancelDemo />
        </Item>
      </div>
    </main>
  );
}
